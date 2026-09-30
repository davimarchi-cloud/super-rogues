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
  // v27 (owner): Crowns. players.gems = the Crown balance (the old column `crowns` keeps counting champion titles);
  // season / sreach = the season the row is in and the best league reached (and paid) in it; peak_league = best ever,
  // last_league = where the last season ended; perks = JSON array of Crown Shop unlocks; ref = the pid of the player
  // who referred this one, ref_gems = crowns earned from referrals; code = public id (profiles and invite links)
  `alter table players add column if not exists gems int not null default 0`,
  `alter table players add column if not exists season int not null default 0`,
  `alter table players add column if not exists sreach int not null default 0`,
  `alter table players add column if not exists peak_league int not null default 0`,
  `alter table players add column if not exists last_league int not null default -1`,
  `alter table players add column if not exists perks text not null default '[]'`,
  `alter table players add column if not exists ref text`,
  `alter table players add column if not exists ref_gems int not null default 0`,
  `alter table players add column if not exists code text`,
  `update players set code = substr(encode(sha256(convert_to('pub|' || pid, 'UTF8')), 'hex'), 1, 12) where code is null`,
  `create unique index if not exists players_code on players(code)`,
  `create index if not exists players_ref on players(ref)`,
  `create index if not exists teams_pid on teams(pid)`,
  // v30 (review #28): account XP (axp), the heroes that cleared PvE (cleared, JSON), the highest gauntlet floor ever
  // reached (pfloor), bosses beaten (bosses, JSON), xpv = 1 once the XP of older players was counted from their teams
  `alter table players add column if not exists axp int not null default 0`,
  `alter table players add column if not exists cleared text not null default '[]'`,
  `alter table players add column if not exists pfloor int not null default 0`,
  `alter table players add column if not exists bosses text not null default '[]'`,
  `alter table players add column if not exists xpv int not null default 0`,
  // v27: games and wins of each hero per player (King Tier profiles: most played, best win rate)
  `create table if not exists phero (pid text not null, hero text not null, games int not null default 0, wins int not null default 0, primary key (pid, hero))`,
  // Art Lab (owner, 2026-09-29): pictures sent with a review (splash + battle poses as data: URLs). Never served back.
  `create table if not exists art (id bigserial primary key, batch bigint not null, hero text not null, splash text, poses text not null,
     meta text not null, iph text not null, created bigint not null)`,
];
// public id of a player: never the pid itself (the pid is the player's secret key)
const codeOf = pid => require('crypto').createHash('sha256').update('pub|' + pid).digest('hex').slice(0, 12);

function poolOf(M, lo, hi, exclude, staleBefore) {
  const ex = new Set(exclude || []);
  return (M.teams || []).filter(t => !ex.has(t.id) && (t.status === 'lost' || (t.status === 'running' && (t.updated || t.created) < (staleBefore || 0))) && t.wins >= lo && (hi == null || t.wins <= hi));
}
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
    async addArt(a) { (M.art = M.art || []).push(Object.assign({ id: (M.art.length || 0) + 1 }, a)); },
    async countArt(iph, since) { return (M.art || []).filter(a => (iph == null || a.iph === iph) && a.created >= since).length; },
    async getBatch(b) { return M.sug.filter(s => s.batch === b).sort((x, y) => x.id - y.id).map(pub); },
    async countAhead(b) { return new Set(M.sug.filter(s => s.batch < b && (s.status === 'new' || s.status === 'doing')).map(s => s.batch)).size; },
    async listSuggestions(n) { return M.sug.slice().sort((a, b) => b.id - a.id).slice(0, n).map(pub); },
    async getKV(k) { return M.kv[k] ?? null; },
    async setKV(k, v) { M.kv[k] = v; },
    async addScore(s) { M.scores.push(Object.assign({ id: ++M.id }, s)); },
    async countScores(iph, since) { return M.scores.filter(s => s.iph === iph && s.created >= since).length; },
    async topScores(n) { return M.scores.slice().sort((a, b) => b.score - a.score || a.created - b.created).slice(0, n).map(pubScore); },
    async getPlayer(pid) { const P = M.players = M.players || {}; return P[pid] ? Object.assign({}, P[pid]) : null; },
    // v27: a name given later only replaces the default one ("Player xxxx"); after that, renaming costs crowns
    async upsertPlayer(pid, name, iph, fallback) { const P = M.players = M.players || {}; if (!P[pid]) P[pid] = { pid, code: codeOf(pid), name: name || fallback, elo: 1000, runs: 0, crowns: 0, best: 0, league: 0, lp: 0, gems: 0, season: 0, sreach: 0, peak_league: 0, last_league: -1, perks: '[]', ref: null, ref_gems: 0, axp: 0, cleared: '[]', pfloor: 0, bosses: '[]', xpv: 0, iph, created: Date.now() }; else if (name && P[pid].name === fallback) P[pid].name = name; return Object.assign({}, P[pid]); },
    async setPlayer(pid, f) { for (const x of ['elo', 'runs', 'crowns', 'best', 'league', 'lp', 'season', 'sreach', 'peak_league', 'last_league']) if (f[x] != null) M.players[pid][x] = f[x]; M.players[pid].updated = Date.now(); },
    async topPlayers(n) { return Object.values(M.players || {}).sort((a, b) => b.elo - a.elo).slice(0, n).map(pubPlayer); },
    async getPlayerByCode(code) { const p = Object.values(M.players || {}).find(x => x.code === code); return p ? Object.assign({}, p) : null; },
    async addGems(pid, n, fromRef) { const p = M.players && M.players[pid]; if (!p) return null; p.gems += n; if (fromRef) p.ref_gems += n; return p.gems; },
    async spend(pid, price, perksOld, perksNew, name) { const p = M.players && M.players[pid]; if (!p || p.gems < price || p.perks !== perksOld) return null; p.gems -= price; p.perks = perksNew; if (name) p.name = name; return p.gems; },
    async markReached(pid, from, to) { const p = M.players && M.players[pid]; if (!p || p.sreach !== from) return false; p.sreach = to; return true; },
    async setRef(pid, ref) { const p = M.players && M.players[pid]; if (!p || p.ref) return false; p.ref = ref; return true; },
    async countRefs(pid) { return Object.values(M.players || {}).filter(p => p.ref === pid).length; },
    async renameTeams(pid, name) { for (const t of M.teams || []) if (t.pid === pid) t.name = name; },
    async addHeroGames(pid, heroes, win) { const H = M.phero = M.phero || {}; for (const h of heroes) { const x = H[pid + ':' + h] = H[pid + ':' + h] || { hero: h, games: 0, wins: 0 }; x.games++; x.wins += win; } },
    async heroStats(pid) { return Object.entries(M.phero || {}).filter(([k]) => k.startsWith(pid + ':')).map(([, v]) => Object.assign({}, v)); },
    async addXp(pid, n) { const p = M.players && M.players[pid]; if (!p) return null; p.axp = (p.axp || 0) + n; return p.axp; },
    async setProgress(pid, f) { const p = M.players && M.players[pid]; if (!p) return; for (const k of ['cleared', 'pfloor', 'bosses', 'xpv']) if (f[k] != null) p[k] = f[k]; },
    async xpvStep(pid, from, to) { const p = M.players && M.players[pid]; if (!p || (p.xpv | 0) !== from) return false; p.xpv = to; return true; },
    async teamsOf(pid) { return (M.teams || []).filter(t => t.pid === pid).map(t => ({ team: t.team, wins: t.wins })); },
    async ghostRecord(pid) { const T = (M.teams || []).filter(t => t.pid === pid); return { w: T.reduce((a, t) => a + (t.def_w || 0), 0), l: T.reduce((a, t) => a + (t.def_l || 0), 0), n: T.length }; },
    async insertTeam(t) { const T = M.teams = M.teams || []; const r = Object.assign({ id: ++M.id, wins: 0, status: 'running', opp: null, def_w: 0, def_l: 0, created: Date.now() }, t); T.push(r); return r.id; },
    async getTeam(id) { const r = (M.teams || []).find(t => t.id === id); return r ? Object.assign({}, r) : null; },
    async updateTeam(id, f) { const t = (M.teams || []).find(x => x.id === id); Object.assign(t, f, { updated: Date.now() }); if (f.faced) t.faced = JSON.stringify(f.faced); },
    async ghostResult(id, elo, won) { const t = (M.teams || []).find(x => x.id === id); if (!t) return; t.elo_at = elo; if (won) t.def_w = (t.def_w || 0) + 1; else t.def_l = (t.def_l || 0) + 1; },
    async maxWins(excludeId, staleBefore) { const w = (M.teams || []).filter(t => t.id !== excludeId && (t.status === 'lost' || t.status === 'champion' || (t.status === 'running' && (t.updated || t.created) < (staleBefore || 0)))).map(t => t.wins); return w.length ? Math.max(...w) : -1; },
    async fixCrowns(pid, crowns) { if (M.players && M.players[pid]) M.players[pid].crowns = crowns; },
    async countTeams(pid, since) { return (M.teams || []).filter(t => t.pid === pid && t.created >= since).length; },
    // review #24: a ghost whose run ENDED (lost, crowned, or abandoned before staleBefore) with exactly w wins ('eq'), or
    // the lowest record above w ('gt'); anyone's ghost, picked at random
    // review #27 (PC boy): the champion is ONE team (the top one; getChampion + demoteChampions keep it unique) and every
    // other ended ghost sits in the pool of the floor where it lost (its wins). pickPool = a random ghost with lo..hi wins
    // (hi null = no top); countPool = how many; lost, or abandoned before staleBefore; never a champion.
    async getChampion(excludeId) { const c = (M.teams || []).filter(t => t.status === 'champion' && t.id !== excludeId).sort((a, b) => b.wins - a.wins || (b.updated || b.created) - (a.updated || a.created))[0]; return c ? Object.assign({}, c) : null; },
    async demoteChampions(keepId) { let n = 0; for (const t of M.teams || []) if (t.status === 'champion' && t.id !== keepId) { t.status = 'lost'; n++; } return n; },
    async pickPool(lo, hi, exclude, staleBefore) { const pool = poolOf(M, lo, hi, exclude, staleBefore); return pool.length ? Object.assign({}, pool[Math.floor(Math.random() * pool.length)]) : null; },
    async countPool(lo, hi, exclude, staleBefore) { return poolOf(M, lo, hi, exclude, staleBefore).length; },
    async pickAbove(w, exclude, staleBefore) { let pool = poolOf(M, w + 1, null, exclude, staleBefore); if (!pool.length) return null; const m = Math.min(...pool.map(t => t.wins)); pool = pool.filter(t => t.wins === m); return Object.assign({}, pool[Math.floor(Math.random() * pool.length)]); },
    async pickGhost(cmp, w, exclude, staleBefore) {
      const ex = new Set(exclude || []);
      const ended = t => t.status === 'lost' || t.status === 'champion' || (t.status === 'running' && (t.updated || t.created) < staleBefore);
      let pool = (M.teams || []).filter(t => !ex.has(t.id) && ended(t) && (cmp === 'eq' ? t.wins === w : t.wins > w));
      if (cmp === 'gt' && pool.length) { const m = Math.min(...pool.map(t => t.wins)); pool = pool.filter(t => t.wins === m); }
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
    async addArt(a) { await q('insert into art (batch, hero, splash, poses, meta, iph, created) values ($1,$2,$3,$4,$5,$6,$7)', [a.batch, a.hero, a.splash, a.poses, a.meta, a.iph, a.created]); },
    async countArt(iph, since) { return Number((await q(iph == null ? 'select count(*)::int n from art where created>=$1' : 'select count(*)::int n from art where iph=$2 and created>=$1', iph == null ? [since] : [since, iph]))[0].n); },
    async getBatch(b) { return (await q('select id, batch, name, text, status, reply, created, updated from suggestions where batch=$1 order by id', [b])).map(pub); },
    async countAhead(b) { return Number((await q("select count(distinct batch)::int n from suggestions where batch<$1 and status in ('new','doing')", [b]))[0].n); },
    async listSuggestions(n) { return (await q('select id, batch, name, text, status, reply, created, updated from suggestions order by id desc limit $1', [n])).map(pub); },
    async getKV(k) { const r = await q('select v from kv where k=$1', [k]); return r.length ? r[0].v : null; },
    async setKV(k, v) { await q('insert into kv (k, v) values ($1,$2) on conflict (k) do update set v=excluded.v', [k, v]); },
    async addScore(s) { await q('insert into scores (name, score, wave, heroes, iph, created) values ($1,$2,$3,$4,$5,$6)', [s.name, s.score, s.wave, s.heroes, s.iph, s.created]); },
    async countScores(iph, since) { return Number((await q('select count(*)::int n from scores where iph=$1 and created>=$2', [iph, since]))[0].n); },
    async topScores(n) { return (await q('select id, name, score, wave, heroes, created from scores order by score desc, created asc limit $1', [n])).map(pubScore); },
    async getPlayer(pid) { const r = await q('select * from players where pid=$1', [pid]); return r.length ? num(r[0]) : null; },
    // v27: a name given later only replaces the default one ("Player xxxx"); after that, renaming costs crowns
    async upsertPlayer(pid, name, iph, fallback) {
      const r = name
        ? await q('insert into players (pid, name, iph, created, code) values ($1,$2,$3,$4,$6) on conflict (pid) do update set name = case when players.name = $5 then excluded.name else players.name end returning *', [pid, name, iph, Date.now(), fallback, codeOf(pid)])
        : await q('insert into players (pid, name, iph, created, code) values ($1,$2,$3,$4,$5) on conflict (pid) do update set pid=excluded.pid returning *', [pid, fallback, iph, Date.now(), codeOf(pid)]);
      return num(r[0]);
    },
    // never the Crown balance (only addGems / spend move it, atomically) nor perks, name or ref
    async setPlayer(pid, f) { await q('update players set elo=$2, runs=$3, crowns=$4, best=$5, updated=$6, league=$7, lp=$8, season=$9, sreach=$10, peak_league=$11, last_league=$12 where pid=$1', [pid, f.elo, f.runs, f.crowns, f.best, Date.now(), f.league | 0, f.lp | 0, f.season | 0, f.sreach | 0, f.peak_league | 0, f.last_league == null ? -1 : f.last_league]); },
    async topPlayers(n) { return (await q('select pid, code, name, elo, runs, crowns, best, league, lp, perks from players order by elo desc limit $1', [n])).map(pubPlayer); },
    async getPlayerByCode(code) { const r = await q('select * from players where code=$1', [code]); return r.length ? num(r[0]) : null; },
    async addGems(pid, n, fromRef) { const r = await q(`update players set gems = gems + $2${fromRef ? ', ref_gems = ref_gems + $2' : ''} where pid=$1 returning gems`, [pid, n]); return r.length ? Number(r[0].gems) : null; },
    async spend(pid, price, perksOld, perksNew, name) {
      const r = await q(`update players set gems = gems - $2, perks = $4${name ? ', name = $5' : ''} where pid=$1 and gems >= $2 and perks = $3 returning gems`, name ? [pid, price, perksOld, perksNew, name] : [pid, price, perksOld, perksNew]);
      return r.length ? Number(r[0].gems) : null;
    },
    async markReached(pid, from, to) { return (await q('update players set sreach=$3 where pid=$1 and sreach=$2 returning pid', [pid, from, to])).length > 0; },
    async setRef(pid, ref) { return (await q('update players set ref=$2 where pid=$1 and ref is null returning pid', [pid, ref])).length > 0; },
    async countRefs(pid) { return Number((await q('select count(*)::int n from players where ref=$1', [pid]))[0].n); },
    async renameTeams(pid, name) { await q('update teams set name=$2 where pid=$1', [pid, name]); },
    async addHeroGames(pid, heroes, win) {
      if (!heroes.length) return;
      await q(`insert into phero (pid, hero, games, wins) select $1, h, 1, $3 from unnest($2::text[]) as u(h)
        on conflict (pid, hero) do update set games = phero.games + 1, wins = phero.wins + excluded.wins`, [pid, heroes, win]);
    },
    async heroStats(pid) { return (await q('select hero, games, wins from phero where pid=$1', [pid])).map(r => ({ hero: r.hero, games: Number(r.games), wins: Number(r.wins) })); },
    async addXp(pid, n) { const r = await q('update players set axp = axp + $2 where pid=$1 returning axp', [pid, n]); return r.length ? Number(r[0].axp) : null; },
    // v46: moves xpv from one version to the next only once, even when two calls race
    async xpvStep(pid, from, to) { const r = await q('update players set xpv=$3 where pid=$1 and xpv=$2 returning pid', [pid, from, to]); return r.length > 0; },
    async setProgress(pid, f) {
      const cols = ['cleared', 'pfloor', 'bosses', 'xpv'].filter(k => f[k] != null); if (!cols.length) return;
      await q(`update players set ${cols.map((k, i) => k + '=$' + (i + 2)).join(', ')} where pid=$1`, [pid, ...cols.map(k => f[k])]);
    },
    async teamsOf(pid) { return (await q('select team, wins from teams where pid=$1', [pid])).map(r => ({ team: r.team, wins: Number(r.wins) })); },
    async ghostRecord(pid) { const r = (await q('select coalesce(sum(def_w),0)::int w, coalesce(sum(def_l),0)::int l, count(*)::int n from teams where pid=$1', [pid]))[0]; return { w: Number(r.w), l: Number(r.l), n: Number(r.n) }; },
    async insertTeam(t) { return Number((await q('insert into teams (pid, name, elo_at, team, relics, created) values ($1,$2,$3,$4,$5,$6) returning id', [t.pid, t.name, t.elo_at, t.team, t.relics, Date.now()]))[0].id); },
    async getTeam(id) { const r = await q('select * from teams where id=$1', [id]); return r.length ? num(r[0]) : null; },
    async updateTeam(id, f) {
      if (f.faced) await q('update teams set wins=$2, status=$3, opp=$4, updated=$5, faced=$6 where id=$1', [id, f.wins, f.status, f.opp, Date.now(), JSON.stringify(f.faced)]);
      else await q('update teams set wins=$2, status=$3, opp=$4, updated=$5 where id=$1', [id, f.wins, f.status, f.opp, Date.now()]);
    },
    async countTeams(pid, since) { return Number((await q('select count(*)::int n from teams where pid=$1 and created>=$2', [pid, since]))[0].n); },
    async ghostResult(id, elo, won) { await q(`update teams set elo_at=$2, ${won ? 'def_w=def_w+1' : 'def_l=def_l+1'} where id=$1`, [id, elo]); },
    async maxWins(excludeId, staleBefore) { const r = await q("select max(wins)::int m from teams where id <> $1 and (status in ('lost','champion') or (status = 'running' and coalesce(updated, created) < $2))", [excludeId || 0, staleBefore || 0]); return r[0].m == null ? -1 : Number(r[0].m); },
    async getChampion(excludeId) { const r = await q("select * from teams where status = 'champion' and id <> $1 order by wins desc, coalesce(updated, created) desc limit 1", [excludeId || 0]); return r.length ? num(r[0]) : null; },
    async demoteChampions(keepId) { return (await q("update teams set status = 'lost' where status = 'champion' and id <> $1 returning id", [keepId || 0])).length; },
    async pickPool(lo, hi, exclude, staleBefore) {
      const r = await q(`select * from teams where not (id = any($1::bigint[])) and (status = 'lost' or (status = 'running' and coalesce(updated, created) < $4))
        and wins >= $2 and ($3::int is null or wins <= $3) order by random() limit 1`, [(exclude || []).map(Number).filter(Number.isFinite), lo, hi == null ? null : hi, staleBefore || 0]);
      return r.length ? num(r[0]) : null;
    },
    async countPool(lo, hi, exclude, staleBefore) {
      return Number((await q(`select count(*)::int n from teams where not (id = any($1::bigint[])) and (status = 'lost' or (status = 'running' and coalesce(updated, created) < $4))
        and wins >= $2 and ($3::int is null or wins <= $3)`, [(exclude || []).map(Number).filter(Number.isFinite), lo, hi == null ? null : hi, staleBefore || 0]))[0].n);
    },
    async pickAbove(w, exclude, staleBefore) {
      const r = await q(`select * from teams where not (id = any($1::bigint[])) and (status = 'lost' or (status = 'running' and coalesce(updated, created) < $3))
        and wins > $2 order by wins asc, random() limit 1`, [(exclude || []).map(Number).filter(Number.isFinite), w, staleBefore || 0]);
      return r.length ? num(r[0]) : null;
    },
    async pickGhost(cmp, w, exclude, staleBefore) {
      const ex = (exclude || []).map(Number).filter(Number.isFinite);
      const r = await q(`select * from teams where not (id = any($1::bigint[])) and (status in ('lost','champion') or (status = 'running' and coalesce(updated, created) < $3))
        and wins ${cmp === 'eq' ? '=' : '>'} $2 order by ${cmp === 'eq' ? '' : 'wins asc, '}random() limit 1`, [ex, w, staleBefore || 0]);
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
function num(r) { for (const k of ['id', 'elo', 'runs', 'crowns', 'best', 'elo_at', 'wins', 'opp', 'def_w', 'def_l', 'league', 'lp', 'created', 'updated', 'gems', 'season', 'sreach', 'peak_league', 'last_league', 'ref_gems', 'axp', 'pfloor', 'xpv']) if (r[k] != null) r[k] = Number(r[k]); return r; }
// v27: `titles` = champion titles (column crowns); `code` = public id for the profile; `king` = owns the King Tier
function pubPlayer(p) { return { name: p.name, code: p.code || codeOf(p.pid), elo: Math.round(Number(p.elo)), runs: Number(p.runs), titles: Number(p.crowns), best: Number(p.best), league: Number(p.league) || 0, lp: Number(p.lp) || 0, king: /"king"/.test(p.perks || '') }; }
function pubRating(r) { return { kind: r.kind, id: r.id, elo: Math.round(Number(r.elo)), games: Number(r.games), wins: Number(r.wins) }; }
function pubScore(s) { return { name: s.name, score: Number(s.score), wave: Number(s.wave), heroes: String(s.heroes || '').split(',').filter(Boolean), created: Number(s.created) }; }

let store = null;
module.exports = function getStore() {
  if (!store) store = global.__BAL_MEM || !process.env.DATABASE_URL ? memStore() : pgStore();
  return store;
};
module.exports.SCHEMA = SCHEMA;
module.exports.codeOf = codeOf;
