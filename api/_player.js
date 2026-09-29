// v27 (owner + review #25 by David): the account side of a player. Seasons, Crowns, the Crown Shop, referrals and
// public profiles. Used by api/elo.js (where leagues move) and api/player.js (shop, profiles, name change).
// - Seasons are 28 days (B.SEASON). A new season sends everyone back to Bronze; the old league is kept as last_league
//   and the best one ever as peak_league. A row from before seasons existed (season 0) keeps its league and is paid
//   for the leagues it already reached.
// - Crowns (column gems): the first time a player reaches each league in a season, B.CROWNS.league[i]. sreach = the
//   best league already paid this season; markReached moves it atomically, so a league is never paid twice.
// - Referral: a new player (no run yet) who arrives with ?ref=<code> is linked to that player for good. Every time the
//   friend earns crowns by playing, the referrer gets 1% of it (at least 1). Referral crowns do not chain further.
require('../js/hex.js'); require('../js/data.js');
const D = globalThis.B;
const { codeOf } = require('./_store');

const perksOf = p => { try { const a = JSON.parse(p.perks || '[]'); return Array.isArray(a) ? a.filter(x => D.SHOP_ITEM[x]) : []; } catch (_) { return []; } };
const isKing = p => !!p && perksOf(p).includes('king');
// the fields setPlayer writes
const row = p => ({ elo: p.elo, runs: p.runs, crowns: p.crowns, best: p.best, league: p.league | 0, lp: p.lp | 0, season: p.season | 0, sreach: p.sreach | 0, peak_league: p.peak_league | 0, last_league: p.last_league == null ? -1 : p.last_league });

function rollSeason(p, now) {
  const cur = D.seasonOf(now || Date.now());
  if ((p.season | 0) === cur) return false;
  if ((p.season | 0) > 0) { p.last_league = p.league | 0; p.league = 0; p.lp = 0; p.sreach = 0; }
  p.season = cur;
  return true;
}
async function grant(st, p, n) {
  const g = await st.addGems(p.pid, n); if (g != null) p.gems = g;
  if (p.ref) await st.addGems(p.ref, Math.max(D.CROWNS.referMin, Math.floor(n * D.CROWNS.referPct)), true);
}
// pays every league above sreach up to the current one; returns the crowns paid
async function payLeagues(st, p) {
  const from = p.sreach | 0, to = p.league | 0;
  p.peak_league = Math.max(p.peak_league | 0, to);
  if (to <= from || !(await st.markReached(p.pid, from, to))) return 0;
  p.sreach = to;
  let n = 0; for (let i = from + 1; i <= to; i++) n += D.CROWNS.league[i] || 0;
  if (n > 0) await grant(st, p, n);
  return n;
}
// on every call that loads a player: a new season, then anything still unpaid (players from before Crowns)
async function sync(st, p) {
  if (rollSeason(p)) await st.setPlayer(p.pid, row(p));
  return payLeagues(st, p);
}
async function linkRef(st, p, code) {
  code = String(code || '').toLowerCase();
  if (!/^[a-f0-9]{12}$/.test(code) || p.ref || (p.runs | 0) > 0) return false;
  const r = await st.getPlayerByCode(code);
  if (!r || r.pid === p.pid) return false;
  if (await st.setRef(p.pid, r.pid)) { p.ref = r.pid; return true; }
  return false;
}
async function heroGames(st, pid, team, win) {
  try { if (team && team.length) await st.addHeroGames(pid, [...new Set(team.map(h => h.key))], win ? 1 : 0); } catch (e) { console.error('phero', e); }
}

// what anyone can see on a profile
function profileView(p) {
  const q = Object.assign({}, p); rollSeason(q);   // shows the new season even before the player comes back
  return { name: q.name, code: q.code || codeOf(q.pid), league: q.league | 0, lp: q.lp | 0, elo: Math.round(q.elo), best: q.best | 0, titles: q.crowns | 0,
    runs: q.runs | 0, peakLeague: Math.max(q.peak_league | 0, q.league | 0), lastLeague: q.last_league == null ? -1 : q.last_league, season: q.season, king: isKing(q), since: Number(q.created) || null };
}
// King Tier: most played heroes, best win rate heroes (3+ games), the record of all the player's ghosts
async function kingExtras(st, pid) {
  const rows = await st.heroStats(pid), g = await st.ghostRecord(pid);
  const wr = r => r.wins / r.games;
  return {
    most: rows.slice().sort((a, b) => b.games - a.games || b.wins - a.wins).slice(0, 3),
    best: rows.filter(r => r.games >= 3).sort((a, b) => wr(b) - wr(a) || b.games - a.games).slice(0, 3),
    ghosts: g,
  };
}
// the player's own view: the profile plus the wallet, perks and referral numbers
async function ownView(st, p) {
  return Object.assign(profileView(p), { crowns: p.gems | 0, perks: perksOf(p), sreach: p.sreach | 0, refs: await st.countRefs(p.pid), refCrowns: p.ref_gems | 0,
    referred: !!p.ref, seasonEnds: D.seasonEnds(D.seasonOf(Date.now())), account: true });
}

module.exports = { perksOf, isKing, row, rollSeason, payLeagues, sync, linkRef, heroGames, profileView, kingExtras, ownView, codeOf };
