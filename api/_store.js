// Storage. Suggestions arrive in BATCHES: a player writes several changes, then presses "Send for review".
// Production: Neon Postgres (DATABASE_URL, set by the Vercel integration). Local dev and tests: in-memory
// (tools/dev-server.js sets global.__BAL_MEM = true). Both expose the same functions.
const SCHEMA = [
  `create table if not exists suggestions (id bigserial primary key, name text not null default '', text text not null,
     iph text not null, status text not null default 'new', reply text, created bigint not null, updated bigint)`,
  `create index if not exists suggestions_status on suggestions(status)`,
  `create table if not exists kv (k text primary key, v text not null)`,
  `create table if not exists scores (id bigserial primary key, name text not null, score int not null, wave int not null,
     heroes text not null, iph text not null, created bigint not null)`,
  `create index if not exists scores_score on scores(score desc)`,
  `alter table suggestions add column if not exists batch bigint`,
  `create sequence if not exists batch_seq`,
  // v6 (reviews #3 #4): Elo per player + every team that entered the PvP gauntlet (its record is the matchmaking ladder)
  `create table if not exists players (pid text primary key, name text not null, elo real not null default 1000, runs int not null default 0,
     crowns int not null default 0, best int not null default 0, iph text, created bigint not null, updated bigint)`,
  `create table if not exists teams (id bigserial primary key, pid text not null, name text not null, elo_at real not null, team text not null,
     relics text not null, wins int not null default 0, status text not null default 'running', opp bigint, created bigint not null, updated bigint)`,
  `create index if not exists teams_pick on teams(status, wins)`,
];

function memStore() {
  const M = global.__BAL_MEMDATA = global.__BAL_MEMDATA || { sug: [], kv: {}, scores: [], id: 0 };
  return {
    async addBatch(b) {
      const batch = M.batch = (M.batch || 0) + 1, ids = [];
      for (const text of b.items) { const r = { id: ++M.id, batch, name: b.name, text, iph: b.iph, created: b.created, status: 'new', reply: null, updated: null }; M.sug.push(r); ids.push(r.id); }
      return { batch, ids };
    },
    async countBatches(iph, since) { return new Set(M.sug.filter(s => s.iph === iph && s.created >= since).map(s => s.batch)).size; },
    async countItems(iph, since) { return M.sug.filter(s => s.iph === iph && s.created >= since).length; },
    async countNew() { return M.sug.filter(s => s.status === 'new').length; },
    async getBatch(b) { return M.sug.filter(s => s.batch === b).sort((x, y) => x.id - y.id).map(pub); },
    async countAhead(b) { return new Set(M.sug.filter(s => s.batch < b && (s.status === 'new' || s.status === 'doing')).map(s => s.batch)).size; },
    async listSuggestions(n) { return M.sug.slice().sort((a, b) => b.id - a.id).slice(0, n).map(pub); },
    async getKV(k) { return M.kv[k] ?? null; },
    async setKV(k, v) { M.kv[k] = v; },
    async addScore(s) { M.scores.push(Object.assign({ id: ++M.id }, s)); },
    async countScores(iph, since) { return M.scores.filter(s => s.iph === iph && s.created >= since).length; },
    async topScores(n) { return M.scores.slice().sort((a, b) => b.score - a.score || a.created - b.created).slice(0, n).map(pubScore); },
    async getPlayer(pid) { const P = M.players = M.players || {}; return P[pid] ? Object.assign({}, P[pid]) : null; },
    async upsertPlayer(pid, name, iph) { const P = M.players = M.players || {}; if (!P[pid]) P[pid] = { pid, name, elo: 1000, runs: 0, crowns: 0, best: 0, iph, created: Date.now() }; else P[pid].name = name; return Object.assign({}, P[pid]); },
    async setPlayer(pid, f) { Object.assign(M.players[pid], f, { updated: Date.now() }); },
    async topPlayers(n) { return Object.values(M.players || {}).sort((a, b) => b.elo - a.elo).slice(0, n).map(pubPlayer); },
    async insertTeam(t) { const T = M.teams = M.teams || []; const r = Object.assign({ id: ++M.id, wins: 0, status: 'running', opp: null, created: Date.now() }, t); T.push(r); return r.id; },
    async getTeam(id) { const r = (M.teams || []).find(t => t.id === id); return r ? Object.assign({}, r) : null; },
    async updateTeam(id, f) { Object.assign((M.teams || []).find(t => t.id === id), f, { updated: Date.now() }); },
    async countTeams(pid, since) { return (M.teams || []).filter(t => t.pid === pid && t.created >= since).length; },
    async pickOpponent(minWins, pid) {
      const pool = (M.teams || []).filter(t => (t.status === 'lost' || t.status === 'champion') && t.wins >= minWins && t.pid !== pid);
      if (!pool.length) return null; const w = Math.min(...pool.map(t => t.wins)); const c = pool.filter(t => t.wins === w);
      return Object.assign({}, c[Math.floor(Math.random() * c.length)]);
    },
  };
}

function pgStore() {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  let ready = null;
  const q = async (text, params = []) => { if (!ready) ready = (async () => { for (const s of SCHEMA) await sql.query(s); })(); await ready; return sql.query(text, params); };
  return {
    async addBatch(b) {
      const batch = Number((await q("select nextval('batch_seq') b"))[0].b), ids = [];
      for (const text of b.items) ids.push(Number((await q('insert into suggestions (batch, name, text, iph, created) values ($1,$2,$3,$4,$5) returning id', [batch, b.name, text, b.iph, b.created]))[0].id));
      return { batch, ids };
    },
    async countBatches(iph, since) { return Number((await q('select count(distinct batch)::int n from suggestions where iph=$1 and created>=$2', [iph, since]))[0].n); },
    async countItems(iph, since) { return Number((await q('select count(*)::int n from suggestions where iph=$1 and created>=$2', [iph, since]))[0].n); },
    async countNew() { return Number((await q("select count(*)::int n from suggestions where status='new'"))[0].n); },
    async getBatch(b) { return (await q('select id, batch, name, text, status, reply, created, updated from suggestions where batch=$1 order by id', [b])).map(pub); },
    async countAhead(b) { return Number((await q("select count(distinct batch)::int n from suggestions where batch<$1 and status in ('new','doing')", [b]))[0].n); },
    async listSuggestions(n) { return (await q('select id, batch, name, text, status, reply, created, updated from suggestions order by id desc limit $1', [n])).map(pub); },
    async getKV(k) { const r = await q('select v from kv where k=$1', [k]); return r.length ? r[0].v : null; },
    async setKV(k, v) { await q('insert into kv (k, v) values ($1,$2) on conflict (k) do update set v=excluded.v', [k, v]); },
    async addScore(s) { await q('insert into scores (name, score, wave, heroes, iph, created) values ($1,$2,$3,$4,$5,$6)', [s.name, s.score, s.wave, s.heroes, s.iph, s.created]); },
    async countScores(iph, since) { return Number((await q('select count(*)::int n from scores where iph=$1 and created>=$2', [iph, since]))[0].n); },
    async topScores(n) { return (await q('select id, name, score, wave, heroes, created from scores order by score desc, created asc limit $1', [n])).map(pubScore); },
    async getPlayer(pid) { const r = await q('select * from players where pid=$1', [pid]); return r.length ? num(r[0]) : null; },
    async upsertPlayer(pid, name, iph) {
      const r = await q('insert into players (pid, name, iph, created) values ($1,$2,$3,$4) on conflict (pid) do update set name=excluded.name returning *', [pid, name, iph, Date.now()]);
      return num(r[0]);
    },
    async setPlayer(pid, f) { await q('update players set elo=$2, runs=$3, crowns=$4, best=$5, updated=$6 where pid=$1', [pid, f.elo, f.runs, f.crowns, f.best, Date.now()]); },
    async topPlayers(n) { return (await q('select name, elo, runs, crowns, best from players order by elo desc limit $1', [n])).map(pubPlayer); },
    async insertTeam(t) { return Number((await q('insert into teams (pid, name, elo_at, team, relics, created) values ($1,$2,$3,$4,$5,$6) returning id', [t.pid, t.name, t.elo_at, t.team, t.relics, Date.now()]))[0].id); },
    async getTeam(id) { const r = await q('select * from teams where id=$1', [id]); return r.length ? num(r[0]) : null; },
    async updateTeam(id, f) { await q('update teams set wins=$2, status=$3, opp=$4, updated=$5 where id=$1', [id, f.wins, f.status, f.opp, Date.now()]); },
    async countTeams(pid, since) { return Number((await q('select count(*)::int n from teams where pid=$1 and created>=$2', [pid, since]))[0].n); },
    async pickOpponent(minWins, pid) {
      const r = await q("select * from teams where status in ('lost','champion') and wins >= $1 and pid <> $2 order by wins asc, random() limit 1", [minWins, pid]);
      return r.length ? num(r[0]) : null;
    },
  };
}

// only public fields ever leave the server (never iph)
function pub(s) { return { id: Number(s.id), batch: Number(s.batch || s.id), name: s.name, text: s.text, status: s.status, reply: s.reply || null, created: Number(s.created), updated: s.updated ? Number(s.updated) : null }; }
// Neon returns bigint/real columns as strings: normalise numbers
function num(r) { for (const k of ['id', 'elo', 'runs', 'crowns', 'best', 'elo_at', 'wins', 'opp', 'created', 'updated']) if (r[k] != null) r[k] = Number(r[k]); return r; }
function pubPlayer(p) { return { name: p.name, elo: Math.round(Number(p.elo)), runs: Number(p.runs), crowns: Number(p.crowns), best: Number(p.best) }; }
function pubScore(s) { return { name: s.name, score: Number(s.score), wave: Number(s.wave), heroes: String(s.heroes || '').split(',').filter(Boolean), created: Number(s.created) }; }

let store = null;
module.exports = function getStore() {
  if (!store) store = global.__BAL_MEM || !process.env.DATABASE_URL ? memStore() : pgStore();
  return store;
};
module.exports.SCHEMA = SCHEMA;
