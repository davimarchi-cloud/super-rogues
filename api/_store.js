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
  // v25 (review #23): the ghosts a gauntlet run already faced (JSON array of team ids), so it does not meet them twice
  `alter table teams add column if not exists faced text not null default '[]'`,
  // v18 (review #16): a ghost keeps its own Elo (elo_at moves with every duel it defends) and a defense record
  `alter table teams add column if not exists def_w int not null default 0`,
  `alter table teams add column if not exists def_l int not null default 0`,
  // v23 (review #21): player leagues (index into B.LEAGUES) and league points inside the league
  `alter table players add column if not exists league int not null default 0`,
  `alter table players add column if not exists lp int not null default 0`,
  // v15 (review #14): an Elo for every hero, item and relic, apart from the players (balance data)
  `create table if not exists ratings (kind text not null, id text not null, elo real not null default 1000, games int not null default 0,
     wins int not null default 0, updated bigint, primary key (kind, id))`,
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
    async upsertPlayer(pid, name, iph, fallback) { const P = M.players = M.players || {}; if (!P[pid]) P[pid] = { pid, name: name || fallback, elo: 1000, runs: 0, crowns: 0, best: 0, league: 0, lp: 0, iph, created: Date.now() }; else if (name) P[pid].name = name; return Object.assign({}, P[pid]); },
    async setPlayer(pid, f) { Object.assign(M.players[pid], f, { updated: Date.now() }); },
    async topPlayers(n) { return Object.values(M.players || {}).sort((a, b) => b.elo - a.elo).slice(0, n).map(pubPlayer); },
    async insertTeam(t) { const T = M.teams = M.teams || []; const r = Object.assign({ id: ++M.id, wins: 0, status: 'running', opp: null, def_w: 0, def_l: 0, created: Date.now() }, t); T.push(r); return r.id; },
    async getTeam(id) { const r = (M.teams || []).find(t => t.id === id); return r ? Object.assign({}, r) : null; },
    async updateTeam(id, f) { const t = (M.teams || []).find(x => x.id === id); Object.assign(t, f, { updated: Date.now() }); if (f.faced) t.faced = JSON.stringify(f.faced); },
    async ghostResult(id, elo, won) { const t = (M.teams || []).find(x => x.id === id); if (!t) return; t.elo_at = elo; if (won) t.def_w = (t.def_w || 0) + 1; else t.def_l = (t.def_l || 0) + 1; },
    async maxWins(excludeId) { const w = (M.teams || []).filter(t => t.id !== excludeId).map(t => t.wins); return w.length ? Math.max(...w) : -1; },
    async fixCrowns(pid, crowns) { if (M.players && M.players[pid]) M.players[pid].crowns = crowns; },
    async countTeams(pid, since) { return (M.teams || []).filter(t => t.pid === pid && t.created >= since).length; },
    // review #23: any saved ghost (finished, crowned or abandoned mid-gauntlet) with at least minWins, picked at random
    async pickOpponent(minWins, pid, own, exclude) {
      const ex = new Set(exclude || []);
      const pool = (M.teams || []).filter(t => !ex.has(t.id) && t.wins >= minWins && (own ? t.pid === pid : t.pid !== pid));
      return pool.length ? Object.assign({}, pool[Math.floor(Math.random() * pool.length)]) : null;
    },
    async getRatings(keys) { const R = M.ratings = M.ratings || {}, o = {}; for (const k of keys) if (R[k]) o[k] = R[k].elo; return o; },
    async addRatings(rows) {
      const R = M.ratings = M.ratings || {};
      for (const r of rows) { const x = R[r.kind + ':' + r.id] = R[r.kind + ':' + r.id] || { kind: r.kind, id: r.id, elo: 1000, games: 0, wins: 0 }; x.elo += r.delta; x.games++; x.wins += r.win; }
    },
    async listRatings() { return Object.values(M.ratings || {}).map(pubRating); },
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
    async upsertPlayer(pid, name, iph, fallback) {
      const r = name
        ? await q('insert into players (pid, name, iph, created) values ($1,$2,$3,$4) on conflict (pid) do update set name=excluded.name returning *', [pid, name, iph, Date.now()])
        : await q('insert into players (pid, name, iph, created) values ($1,$2,$3,$4) on conflict (pid) do update set pid=excluded.pid returning *', [pid, fallback, iph, Date.now()]);
      return num(r[0]);
    },
    async setPlayer(pid, f) { await q('update players set elo=$2, runs=$3, crowns=$4, best=$5, updated=$6, league=$7, lp=$8 where pid=$1', [pid, f.elo, f.runs, f.crowns, f.best, Date.now(), f.league | 0, f.lp | 0]); },
    async topPlayers(n) { return (await q('select name, elo, runs, crowns, best, league, lp from players order by elo desc limit $1', [n])).map(pubPlayer); },
    async insertTeam(t) { return Number((await q('insert into teams (pid, name, elo_at, team, relics, created) values ($1,$2,$3,$4,$5,$6) returning id', [t.pid, t.name, t.elo_at, t.team, t.relics, Date.now()]))[0].id); },
    async getTeam(id) { const r = await q('select * from teams where id=$1', [id]); return r.length ? num(r[0]) : null; },
    async updateTeam(id, f) {
      if (f.faced) await q('update teams set wins=$2, status=$3, opp=$4, updated=$5, faced=$6 where id=$1', [id, f.wins, f.status, f.opp, Date.now(), JSON.stringify(f.faced)]);
      else await q('update teams set wins=$2, status=$3, opp=$4, updated=$5 where id=$1', [id, f.wins, f.status, f.opp, Date.now()]);
    },
    async countTeams(pid, since) { return Number((await q('select count(*)::int n from teams where pid=$1 and created>=$2', [pid, since]))[0].n); },
    async ghostResult(id, elo, won) { await q(`update teams set elo_at=$2, ${won ? 'def_w=def_w+1' : 'def_l=def_l+1'} where id=$1`, [id, elo]); },
    async maxWins(excludeId) { const r = await q('select max(wins)::int m from teams where id <> $1', [excludeId || 0]); return r[0].m == null ? -1 : Number(r[0].m); },
    async pickOpponent(minWins, pid, own, exclude) {
      const ex = (exclude || []).map(Number).filter(Number.isFinite);
      const r = await q(`select * from teams where wins >= $1 and pid ${own ? '=' : '<>'} $2 and not (id = any($3::bigint[])) order by random() limit 1`, [minWins, pid, ex]);
      return r.length ? num(r[0]) : null;
    },
    async getRatings(keys) {
      if (!keys.length) return {};
      const o = {}; for (const r of await q("select kind, id, elo from ratings where kind || ':' || id = any($1::text[])", [keys])) o[r.kind + ':' + r.id] = Number(r.elo);
      return o;
    },
    // deltas, not absolute values: two fights finishing at once both count
    async addRatings(rows) {
      if (!rows.length) return;
      await q(`insert into ratings (kind, id, elo, games, wins, updated)
        select k, i, 1000 + d, 1, w, $5 from unnest($1::text[], $2::text[], $3::float8[], $4::int[]) as u(k, i, d, w)
        on conflict (kind, id) do update set elo = ratings.elo + (excluded.elo - 1000), games = ratings.games + 1, wins = ratings.wins + excluded.wins, updated = excluded.updated`,
        [rows.map(r => r.kind), rows.map(r => r.id), rows.map(r => r.delta), rows.map(r => r.win), Date.now()]);
    },
    async listRatings() { return (await q('select kind, id, elo, games, wins from ratings')).map(pubRating); },
  };
}

// only public fields ever leave the server (never iph)
function pub(s) { return { id: Number(s.id), batch: Number(s.batch || s.id), name: s.name, text: s.text, status: s.status, reply: s.reply || null, created: Number(s.created), updated: s.updated ? Number(s.updated) : null }; }
// Neon returns bigint/real columns as strings: normalise numbers
function num(r) { for (const k of ['id', 'elo', 'runs', 'crowns', 'best', 'elo_at', 'wins', 'opp', 'def_w', 'def_l', 'league', 'lp', 'created', 'updated']) if (r[k] != null) r[k] = Number(r[k]); return r; }
function pubPlayer(p) { return { name: p.name, elo: Math.round(Number(p.elo)), runs: Number(p.runs), crowns: Number(p.crowns), best: Number(p.best), league: Number(p.league) || 0, lp: Number(p.lp) || 0 }; }
function pubRating(r) { return { kind: r.kind, id: r.id, elo: Math.round(Number(r.elo)), games: Number(r.games), wins: Number(r.wins) }; }
function pubScore(s) { return { name: s.name, score: Number(s.score), wave: Number(s.wave), heroes: String(s.heroes || '').split(',').filter(Boolean), created: Number(s.created) }; }

let store = null;
module.exports = function getStore() {
  if (!store) store = global.__BAL_MEM || !process.env.DATABASE_URL ? memStore() : pgStore();
  return store;
};
module.exports.SCHEMA = SCHEMA;
