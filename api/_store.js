// Storage. Production: Neon Postgres (DATABASE_URL, set by the Vercel integration). Local dev and tests: in-memory
// (tools/dev-server.js sets global.__BAL_MEM = true). Both expose the same functions.
const SCHEMA = [
  `create table if not exists suggestions (id bigserial primary key, name text not null default '', text text not null,
     iph text not null, status text not null default 'new', reply text, created bigint not null, updated bigint)`,
  `create index if not exists suggestions_status on suggestions(status)`,
  `create table if not exists kv (k text primary key, v text not null)`,
  `create table if not exists scores (id bigserial primary key, name text not null, score int not null, wave int not null,
     heroes text not null, iph text not null, created bigint not null)`,
  `create index if not exists scores_score on scores(score desc)`,
];

function memStore() {
  const M = global.__BAL_MEMDATA = global.__BAL_MEMDATA || { sug: [], kv: {}, scores: [], id: 0 };
  return {
    async addSuggestion(s) { const r = Object.assign({ id: ++M.id, status: 'new', reply: null, updated: null }, s); M.sug.push(r); return r.id; },
    async countSuggestions(iph, since) { return M.sug.filter(s => s.iph === iph && s.created >= since).length; },
    async countNew() { return M.sug.filter(s => s.status === 'new').length; },
    async listSuggestions(n) { return M.sug.slice().sort((a, b) => b.id - a.id).slice(0, n).map(pub); },
    async getKV(k) { return M.kv[k] ?? null; },
    async setKV(k, v) { M.kv[k] = v; },
    async addScore(s) { M.scores.push(Object.assign({ id: ++M.id }, s)); },
    async countScores(iph, since) { return M.scores.filter(s => s.iph === iph && s.created >= since).length; },
    async topScores(n) { return M.scores.slice().sort((a, b) => b.score - a.score || a.created - b.created).slice(0, n).map(pubScore); },
  };
}

function pgStore() {
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  let ready = null;
  const q = async (text, params = []) => { if (!ready) ready = (async () => { for (const s of SCHEMA) await sql.query(s); })(); await ready; return sql.query(text, params); };
  return {
    async addSuggestion(s) { const r = await q('insert into suggestions (name, text, iph, created) values ($1,$2,$3,$4) returning id', [s.name, s.text, s.iph, s.created]); return Number(r[0].id); },
    async countSuggestions(iph, since) { return Number((await q('select count(*)::int n from suggestions where iph=$1 and created>=$2', [iph, since]))[0].n); },
    async countNew() { return Number((await q("select count(*)::int n from suggestions where status='new'"))[0].n); },
    async listSuggestions(n) { return (await q('select id, name, text, status, reply, created, updated from suggestions order by id desc limit $1', [n])).map(pub); },
    async getKV(k) { const r = await q('select v from kv where k=$1', [k]); return r.length ? r[0].v : null; },
    async setKV(k, v) { await q('insert into kv (k, v) values ($1,$2) on conflict (k) do update set v=excluded.v', [k, v]); },
    async addScore(s) { await q('insert into scores (name, score, wave, heroes, iph, created) values ($1,$2,$3,$4,$5,$6)', [s.name, s.score, s.wave, s.heroes, s.iph, s.created]); },
    async countScores(iph, since) { return Number((await q('select count(*)::int n from scores where iph=$1 and created>=$2', [iph, since]))[0].n); },
    async topScores(n) { return (await q('select id, name, score, wave, heroes, created from scores order by score desc, created asc limit $1', [n])).map(pubScore); },
  };
}

// only public fields ever leave the server (never iph)
function pub(s) { return { id: Number(s.id), name: s.name, text: s.text, status: s.status, reply: s.reply || null, created: Number(s.created), updated: s.updated ? Number(s.updated) : null }; }
function pubScore(s) { return { name: s.name, score: Number(s.score), wave: Number(s.wave), heroes: String(s.heroes || '').split(',').filter(Boolean), created: Number(s.created) }; }

let store = null;
module.exports = function getStore() {
  if (!store) store = global.__BAL_MEM || !process.env.DATABASE_URL ? memStore() : pgStore();
  return store;
};
module.exports.SCHEMA = SCHEMA;
