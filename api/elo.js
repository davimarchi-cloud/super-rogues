// Elo + PvP gauntlet (reviews #3 and #4 by David).
// - No hearts: losing any fight ends the run                                                          op 'fail'
//   Review #24: the player's Elo moves ONLY in gauntlet duels (a lost run / reaching the gauntlet used to count too)
// - Review #14: every hero, item and relic has its own Elo (table ratings, apart from the players), for balancing.
//   Only pieces that acted in that fight are rated (see usedIn). A lost run / reaching the gauntlet rates the pieces of
//   that fight against 1000; a duel rates each side's pieces against the other side's pieces of the same kind.
//   GET ?ratings=1 lists them.
// - Review #16: a duel counts for the GHOST too: the ghost team has its own Elo (teams.elo_at, K 32, shown on its card)
//   and a defense record (def_w / def_l); review #24: its player's Elo does not move for it. Review #20: every BOSS has its own Elo too (ratings kind 'boss', K 16), op 'boss': it rises when the boss
//   beats a player and falls when it loses, against that player's Elo; the player's own Elo never moves for it.
//   Review #21: leagues (B.LEAGUES): +1 league point per duel won, -2 per run lost before the gauntlet; 10 points move
//   the player up one league, never down; Celestial has no ceiling. Answers carry league, lp and `lg` (the change).
//   Answers carry `peak` = the most duels any finished ghost won: the height of the gauntlet tower.
// - v27 (owner + review #25): seasons and Crowns (api/_player.js). Every call rolls the player into the current season;
//   a promotion pays crowns the first time a league is reached in a season (`lg.crowns`). A new player's first call can
//   carry `ref` (a friend's invite code). Every run end and duel counts a game for each hero (King Tier profiles).
//   The name is set once (the default "Player xxxx" is replaced by the first name given); changing it later is a
//   Crown Shop purchase (api/player.js). The content ratings (GET ?ratings=1) moved behind the Content Elo unlock.
// - After the last shop the player's team is stored as a GHOST and enters the gauntlet: round k is against the ghost of
//   another run whose own gauntlet ended with k wins (or the closest above). Review #10: only player ghosts, no bots.
//   Other players' ghosts first; if there are none yet, ghosts of your own older runs. Each match is a 1v1 Elo game against that team's rating
//   at the time it was stored. A loss ends the run; if nobody ever went further, the player is crowned champion.
//   ops 'enter' and 'result'. GET: Elo ladder.
// Fights run in the player's browser (like the rest of the game), so results are trusted: this is a demo.
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
const P = require('./_player');
require('../js/hex.js'); require('../js/data.js');
const D = globalThis.B;

const K = 32, PVE = 1000;
const expect = (r, o) => 1 / (1 + Math.pow(10, (o - r) / 400));
const eloAfter = (r, o, score) => r + K * (score - expect(r, o));

// ---- content Elo (review #14)
const KC = 16;          // content plays far more games than a player: a smaller step keeps the numbers steady
const RATED_PER_HOUR = 40;  // rated fights per IP per hour, so nobody can flood the balance data
// the pieces that acted in a fight: fielded heroes, their equipped items and the team's relics, minus anything with
// no combat effect (B.NONCOMBAT), Hero's Crest without a 4th hero and Adventurer's Pack when no hero uses the extra slot
function usedIn(team, relics) {
  const out = new Map(), add = (kind, id) => out.set(kind + ':' + id, { kind, id });
  for (const h of team) { add('hero', h.key); for (const id of h.items) if (!D.NONCOMBAT.item.includes(id)) add('item', id); }
  for (const id of relics) {
    if (D.NONCOMBAT.relic.includes(id)) continue;
    if (id === 'crest' && team.length <= D.CFG.maxTeam) continue;
    if (id === 'backpack' && !team.some(h => h.items.length > D.CFG.baseSlots + Math.max(0, h.lvl - 2))) continue;
    add('relic', id);
  }
  return [...out.values()];
}
async function allowRated(st, iph) {
  const k = 'rated:' + iph, hour = Math.floor(Date.now() / 3600e3);
  let c = null; try { c = JSON.parse(await st.getKV(k)); } catch (_) {}
  const n = c && c.h === hour ? c.n : 0;
  if (n >= RATED_PER_HOUR) return false;
  await st.setKV(k, JSON.stringify({ h: hour, n: n + 1 })); return true;
}
// sides: [{ used, score }] (one side = against a 1000-rated opponent) or two sides (a duel). A piece on both sides of a
// duel is left out: a mirror says nothing about it. Never breaks the player's own Elo update.
async function rateContent(st, iph, sides) {
  try {
    if (sides.length === 2) {
      const a = new Set(sides[0].used.map(u => u.kind + ':' + u.id)), both = new Set(sides[1].used.map(u => u.kind + ':' + u.id).filter(k => a.has(k)));
      sides = sides.map(s => ({ score: s.score, used: s.used.filter(u => !both.has(u.kind + ':' + u.id)) }));
    }
    if (!sides.some(s => s.used.length) || !(await allowRated(st, iph))) return;
    const cur = await st.getRatings([...new Set(sides.flatMap(s => s.used.map(u => u.kind + ':' + u.id)))]);
    const r = u => cur[u.kind + ':' + u.id] ?? PVE;
    const avg = (used, kind) => { const v = used.filter(u => u.kind === kind).map(r); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : PVE; };
    const rows = [];
    sides.forEach((s, i) => {
      const other = sides.length === 2 ? sides[1 - i] : null;
      for (const u of s.used) rows.push({ kind: u.kind, id: u.id, delta: KC * (s.score - expect(r(u), other ? avg(other.used, u.kind) : PVE)), win: s.score });
    });
    await st.addRatings(rows);
  } catch (e) { console.error('ratings', e); }
}
const relicList = x => [...new Set((Array.isArray(x) ? x : []).filter(id => D.RELIC[id]))].slice(0, 40);

// only well-formed teams made of real game content get stored (they are replayed in other players' browsers)
function cleanTeam(team) {
  if (!Array.isArray(team) || team.length < 1 || team.length > 4) return null;
  const out = [];
  for (const h of team) {
    const hd = h && D.HEROES[h.key]; if (!hd) return null;
    const lvl = Math.max(1, Math.min(5, Math.round(Number(h.lvl) || 1)));
    const allSpecs = new Set(hd.specs.flat().map(s => s.id));
    const specs = (Array.isArray(h.specs) ? h.specs : []).filter(id => allSpecs.has(id)).slice(0, lvl - 1);
    const types = new Set();  // itemization v16: one item per type
    const items = (Array.isArray(h.items) ? h.items : []).filter(id => D.ITEM[id] && !types.has(D.ITEM[id].type) && types.add(D.ITEM[id].type)).slice(0, 5);
    const bonus = {};
    // event bonuses (review #17 added magic resist, crowd-control immunity and a max-HP price that can go negative)
    for (const [k, lo, hi] of [['hpPct', -0.5, 1], ['atk', 0, 60], ['armor', 0, 80], ['mr', 0, 80], ['cleanseOnce', 0, 1]]) { const v = Number(h.bonus && h.bonus[k]); if (v) bonus[k] = Math.max(lo, Math.min(hi, v)); }
    const c = Math.max(0, Math.min(7, Math.round(Number(h.pos && h.pos.c)))), r = Math.max(4, Math.min(7, Math.round(Number(h.pos && h.pos.r))));
    out.push({ key: h.key, lvl, specs, items, bonus, pos: { c: Number.isFinite(c) ? c : 3, r: Number.isFinite(r) ? r : 6 } });
  }
  return out;
}
const oppView = (t, pid) => t && { teamId: t.id, name: t.name, code: P.codeOf(t.pid), elo: Math.round(t.elo_at), wins: t.wins, status: t.status, own: t.pid === pid, defW: t.def_w || 0, defL: t.def_l || 0, team: JSON.parse(t.team), relics: JSON.parse(t.relics) };
// review #21: league points; returns what changed
function leaguePoints(p, delta) {
  const R = D.LEAGUE_RULES, top = D.LEAGUES.length - 1, l0 = p.league | 0, lp0 = p.lp | 0;
  p.league = l0; p.lp = Math.max(0, lp0 + delta);
  while (p.league < top && p.lp >= R.step) { p.lp -= R.step; p.league++; }
  return { league: p.league, lp: p.lp, delta: p.league > l0 ? delta : p.lp - lp0, promoted: p.league > l0 };
}

// next opponent with at least `wins` wins: other players first, then your own older teams
// review #27 (PC boy, the owner approved): floor s (after s wins) is the pool of ghosts that LOST on that floor, i.e.
// whose run ended with exactly s wins; the top floor holds the ONE champion (T = its wins). At floor s < T: a random
// ghost of that pool (the floor just under the champion also holds the teams that fell to the champion, "champion
// minus one"); an empty pool falls back to the closest floor above, then the champion. At floor T: the champion (while
// the champion still has 0 wins, a random pick among it and the 0-win ghosts). Past T, a floor nobody reached: you are
// the new champion and the old one becomes an ordinary ghost of its floor. Anyone's ghost; a ghost this run already
// faced comes back only when there is no one else. A gauntlet left unfinished for 6 hours counts as ended. Ghosts keep
// their own Elo; their player's Elo never moves for them.
const STALE_MS = 6 * 3600e3;
async function nextOpponent(st, wins, pid, teamId, faced) {
  const stale = Date.now() - STALE_MS;
  const champ = await st.getChampion(teamId);
  if (champ) await st.demoteChampions(champ.id);   // only one champion (older data could hold several)
  const T = champ ? champ.wins : -1;
  if (wins > T) return null;
  for (const ex of [[teamId].concat(faced || []), [teamId]]) {
    if (wins === T) {
      if (T > 0) return champ;
      const n = await st.countPool(0, 0, ex, stale);
      if (!n || Math.random() < 1 / (n + 1)) return champ;
      return st.pickPool(0, 0, ex, stale);
    }
    const g = (await st.pickPool(wins, wins === T - 1 ? null : wins, ex, stale)) || (await st.pickAbove(wins, ex, stale));
    if (g) return g;
  }
  return champ;
}
// the tower's height: the champion's wins (its floor is the top one); -1 = no champion yet
const peakOf = async (st, teamId) => { const c = await st.getChampion(teamId); return c ? c.wins : -1; };

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') {
      const qs = new URL(req.url || '/', 'http://x').searchParams;
      if (qs.get('ratings')) return send(res, 403, { error: 'Unlock Content Elo in the Crown Shop' });  // v27: POST /api/player {op:'ratings'}
      if (qs.get('peak')) return send(res, 200, { peak: await peakOf(st, 0) });  // review #16: height of the gauntlet tower
      return send(res, 200, { top: await st.topPlayers(25) });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req);
    const pid = String(b.pid || '');
    if (!/^[a-f0-9]{32}$/.test(pid)) return send(res, 400, { error: 'Bad player id' });
    // a call without a name keeps the one on record (it used to overwrite it with "Player xxxx")
    const given = clean(b.name, 16).replace(/\s+/g, ' ');
    const p = await st.upsertPlayer(pid, given || null, ipHash(req), 'Player ' + pid.slice(0, 4));
    const name = p.name;
    // v27: a new season, crowns still owed, and a friend's invite code on a brand-new player
    await P.sync(st, p);
    if (b.ref) await P.linkRef(st, p, b.ref);
    const save = () => st.setPlayer(pid, P.row(p));
    const xp = [];   // v30: account XP earned by this call (shown as toasts and on the result screen)
    const me = extra => Object.assign({ name: p.name, code: P.codeOf(pid), elo: Math.round(p.elo), runs: p.runs, titles: p.crowns, best: p.best, league: p.league | 0, lp: p.lp | 0,
      crowns: p.gems | 0, season: p.season, sreach: p.sreach | 0, xp }, P.levelView(p), extra);

    if (b.op === 'hello') return send(res, 200, me({}));

    if (b.op === 'boss') {  // review #20: a boss fight moves the boss's Elo only
      const key = String(b.boss || ''); if (!D.BOSSES[key]) return send(res, 400, { error: 'Unknown boss' });
      if (!(await allowRated(st, ipHash(req)))) return send(res, 200, me({ boss: null }));
      const r0 = (await st.getRatings(['boss:' + key]))['boss:' + key] ?? PVE, score = b.win ? 0 : 1;
      const delta = KC * (score - expect(r0, p.elo));
      await st.addRatings([{ kind: 'boss', id: key, delta, win: score }]);
      if (b.win) await P.xpBoss(st, p, key, xp);
      return send(res, 200, me({ boss: { key, name: D.BOSSES[key].name, elo: Math.round(r0 + delta), delta: Math.round(r0 + delta) - Math.round(r0) } }));
    }

    if (b.op === 'fail') {  // review #24: a lost run no longer moves the player's Elo (league points and the pieces' Elo still do)
      p.runs++;
      const lg = leaguePoints(p, D.LEAGUE_RULES.pveLoss);
      await save({});
      const used = cleanTeam(b.team); if (used) { await rateContent(st, ipHash(req), [{ used: usedIn(used, relicList(b.relics)), score: 0 }]); await P.heroGames(st, pid, used, false); }
      await P.xpGame(st, p, b.game, xp);   // v46 (review #57): XP for the game, by how far it went
      return send(res, 200, me({ lg }));
    }

    if (b.op === 'enter') {
      const team = cleanTeam(b.team);
      if (!team) return send(res, 400, { error: 'Invalid team' });
      const relics = relicList(b.relics);
      if (await st.countTeams(pid, Date.now() - 3600e3) >= 20) return send(res, 429, { error: 'Too many gauntlet runs this hour.' });
      // review #24: reaching the gauntlet no longer moves the player's Elo; it still rates the pieces of the fight that got
      // there against 1000 (b.reached = the last boss fight; the team may have changed in the last shop)
      const id = await st.insertTeam({ pid, name, elo_at: p.elo, team: JSON.stringify(team), relics: JSON.stringify(relics) });
      p.runs++;
      const rt = b.reached && cleanTeam(b.reached.team);
      await rateContent(st, ipHash(req), [{ used: rt ? usedIn(rt, relicList(b.reached.relics)) : usedIn(team, relics), score: 1 }]);
      await P.heroGames(st, pid, rt || team, true);
      await P.xpGame(st, p, { fights: b.game && b.game.fights, reached: true }, xp);   // v46: the PvE part of the game
      await P.xpClear(st, p, rt || team, xp); await P.xpFloor(st, p, 1, xp);   // v30: first PvE clears, floor 1
      const opp = await nextOpponent(st, 0, pid, id), peak = await peakOf(st, id);
      if (!opp) { await st.updateTeam(id, { wins: 0, status: 'champion', opp: null }); await st.demoteChampions(id); p.crowns++; await save({}); return send(res, 200, me({ teamId: id, round: 0, wins: 0, peak, champion: true, over: true })); }
      await st.updateTeam(id, { wins: 0, status: 'running', opp: opp.id, faced: [opp.id] }); await save({});
      return send(res, 200, me({ teamId: id, round: 0, wins: 0, peak, opponent: oppView(opp, pid) }));
    }

    if (b.op === 'result') {
      const t = await st.getTeam(Math.floor(Number(b.teamId)));
      if (!t || t.pid !== pid) return send(res, 404, { error: 'Unknown gauntlet run' });
      if (t.status !== 'running' || !t.opp) return send(res, 409, { error: 'This gauntlet run is already over' });
      const opp = await st.getTeam(t.opp);
      const win = !!b.win, before = p.elo;
      p.elo = eloAfter(p.elo, opp ? opp.elo_at : p.elo, win ? 1 : 0);
      const delta = Math.round(p.elo) - Math.round(before);
      // review #14: the duel rates both teams' pieces (the team as it fought: items may move between duels)
      const mine = cleanTeam(b.team) || JSON.parse(t.team), myRelics = b.team ? relicList(b.relics) : JSON.parse(t.relics);
      const sides = [{ used: usedIn(mine, myRelics), score: win ? 1 : 0 }];
      if (opp) sides.push({ used: usedIn(JSON.parse(opp.team), JSON.parse(opp.relics)), score: win ? 0 : 1 });
      await rateContent(st, ipHash(req), sides);
      await P.heroGames(st, pid, mine, win);
      // review #16: the ghost's side of the duel: its own Elo and record, and its player's Elo (not for your own ghost)
      let ghost = null;
      if (opp) {
        const gElo = eloAfter(opp.elo_at, before, win ? 0 : 1);
        await st.ghostResult(opp.id, gElo, !win);
        ghost = { name: opp.name, elo: Math.round(gElo), delta: Math.round(gElo) - Math.round(opp.elo_at) };  // review #24: its player's Elo never moves
      }
      const peak = await peakOf(st, t.id);
      const lg = win ? leaguePoints(p, D.LEAGUE_RULES.duelWin) : null;
      if (lg && lg.promoted) lg.crowns = await P.payLeagues(st, p);  // v27: crowns for a league reached the first time this season
      if (!win) {
        await st.updateTeam(t.id, { wins: t.wins, status: 'lost', opp: null });
        p.best = Math.max(p.best, t.wins); await save({});
        return send(res, 200, me({ teamId: t.id, win, delta, ghost, peak, wins: t.wins, over: true }));
      }
      const wins = t.wins + 1;
      let faced = []; try { faced = JSON.parse(t.faced || '[]'); } catch (_) {}
      const next = await nextOpponent(st, wins, pid, t.id, faced);
      await P.xpDuel(st, p, !next, xp);         // v46: every duel won, and the crown
      await P.xpFloor(st, p, wins + 1, xp);   // v30: a floor reached for the first time
      p.best = Math.max(p.best, wins);
      if (!next) { await st.updateTeam(t.id, { wins, status: 'champion', opp: null }); await st.demoteChampions(t.id); p.crowns++; await save({}); return send(res, 200, me({ teamId: t.id, win, delta, ghost, peak, lg, wins, champion: true, over: true })); }
      await st.updateTeam(t.id, { wins, status: 'running', opp: next.id, faced: faced.concat(next.id) }); await save({});
      return send(res, 200, me({ teamId: t.id, win, delta, ghost, peak, lg, wins, round: wins, opponent: oppView(next, pid) }));
    }
    return send(res, 400, { error: 'Unknown op' });
  } catch (e) {
    console.error('elo', e);
    return send(res, 500, { error: 'Server error' });
  }
};
module.exports.eloAfter = eloAfter;
module.exports.usedIn = usedIn;
module.exports.cleanTeam = cleanTeam;
module.exports.leaguePoints = leaguePoints;
module.exports.nextOpponent = nextOpponent;
