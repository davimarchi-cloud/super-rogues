// Elo + PvP gauntlet (reviews #3 and #4 by David).
// - No hearts: losing any fight ends the run = a loss against an opponent rated 1000                  op 'fail'
//   Review #14: reaching the gauntlet = a WIN against an opponent rated 1000                          op 'enter'
// - Review #14: every hero, item and relic has its own Elo (table ratings, apart from the players), for balancing.
//   Only pieces that acted in that fight are rated (see usedIn). A lost run / reaching the gauntlet rates the pieces of
//   that fight against 1000; a duel rates each side's pieces against the other side's pieces of the same kind.
//   GET ?ratings=1 lists them.
// - Review #16: a duel counts for the GHOST too: the ghost team has its own Elo (teams.elo_at, K 32, shown on its card)
//   and a defense record (def_w / def_l), and its player gains or loses Elo when it defends (K 16; not when it is your
//   own ghost). Answers carry `peak` = the most duels any finished ghost won: the height of the gauntlet tower.
// - After the last shop the player's team is stored as a GHOST and enters the gauntlet: round k is against the ghost of
//   another run whose own gauntlet ended with k wins (or the closest above). Review #10: only player ghosts, no bots.
//   Other players' ghosts first; if there are none yet, ghosts of your own older runs. Each match is a 1v1 Elo game against that team's rating
//   at the time it was stored. A loss ends the run; if nobody ever went further, the player is crowned champion.
//   ops 'enter' and 'result'. GET: Elo ladder.
// Fights run in the player's browser (like the rest of the game), so results are trusted: this is a demo.
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
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
const oppView = (t, pid) => t && { teamId: t.id, name: t.name, elo: Math.round(t.elo_at), wins: t.wins, status: t.status, own: t.pid === pid, defW: t.def_w || 0, defL: t.def_l || 0, team: JSON.parse(t.team), relics: JSON.parse(t.relics) };
const KD = 16;  // a player's Elo moves by half as much when their ghost defends

// next opponent with at least `wins` wins: other players first, then your own older teams
async function nextOpponent(st, wins, pid, teamId) { return (await st.pickOpponent(wins, pid, false)) || (await st.pickOpponent(wins, pid, true, teamId)); }

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') {
      const qs = new URL(req.url || '/', 'http://x').searchParams;
      if (qs.get('ratings')) return send(res, 200, { ratings: await st.listRatings() });
      if (qs.get('peak')) return send(res, 200, { peak: await st.maxWins(0) });  // review #16: height of the gauntlet tower
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
    const save = f => st.setPlayer(pid, Object.assign({ elo: p.elo, runs: p.runs, crowns: p.crowns, best: p.best }, f));
    const me = extra => Object.assign({ elo: Math.round(p.elo), runs: p.runs, crowns: p.crowns, best: p.best }, extra);

    if (b.op === 'hello') return send(res, 200, me({}));

    if (b.op === 'fail') {  // review #14: a loss against 1000 (it was your Elo - 200); the pieces of the lost fight lose too
      const before = p.elo; p.elo = eloAfter(p.elo, PVE, 0); p.runs++;
      await save({});
      const used = cleanTeam(b.team); if (used) await rateContent(st, ipHash(req), [{ used: usedIn(used, relicList(b.relics)), score: 0 }]);
      return send(res, 200, me({ delta: Math.round(p.elo) - Math.round(before) }));
    }

    if (b.op === 'enter') {
      const team = cleanTeam(b.team);
      if (!team) return send(res, 400, { error: 'Invalid team' });
      const relics = relicList(b.relics);
      if (await st.countTeams(pid, Date.now() - 3600e3) >= 20) return send(res, 429, { error: 'Too many gauntlet runs this hour.' });
      // review #14: reaching the gauntlet is a win against 1000, for the player and for the pieces of the fight that got
      // there (b.reached = the last boss fight; the team may have changed in the last shop)
      const before = p.elo; p.elo = eloAfter(p.elo, PVE, 1);
      const reach = Math.round(p.elo) - Math.round(before);
      const id = await st.insertTeam({ pid, name, elo_at: p.elo, team: JSON.stringify(team), relics: JSON.stringify(relics) });
      p.runs++;
      const rt = b.reached && cleanTeam(b.reached.team);
      await rateContent(st, ipHash(req), [{ used: rt ? usedIn(rt, relicList(b.reached.relics)) : usedIn(team, relics), score: 1 }]);
      const opp = await nextOpponent(st, 0, pid, id), peak = await st.maxWins(id);
      if (!opp) { await st.updateTeam(id, { wins: 0, status: 'champion', opp: null }); p.crowns++; await save({}); return send(res, 200, me({ teamId: id, round: 0, wins: 0, reach, peak, champion: true, over: true })); }
      await st.updateTeam(id, { wins: 0, status: 'running', opp: opp.id }); await save({});
      return send(res, 200, me({ teamId: id, round: 0, wins: 0, reach, peak, opponent: oppView(opp, pid) }));
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
      // review #16: the ghost's side of the duel: its own Elo and record, and its player's Elo (not for your own ghost)
      let ghost = null;
      if (opp) {
        const gElo = eloAfter(opp.elo_at, before, win ? 0 : 1);
        await st.ghostResult(opp.id, gElo, !win);
        ghost = { name: opp.name, elo: Math.round(gElo), delta: Math.round(gElo) - Math.round(opp.elo_at) };
        if (opp.pid !== pid) {
          const o = await st.getPlayer(opp.pid);
          if (o) { const oe = o.elo + KD * ((win ? 0 : 1) - expect(o.elo, before)); ghost.ownerDelta = Math.round(oe) - Math.round(o.elo); o.elo = oe; await st.setPlayer(o.pid, o); }
        }
      }
      const peak = await st.maxWins(t.id);
      if (!win) {
        await st.updateTeam(t.id, { wins: t.wins, status: 'lost', opp: null });
        p.best = Math.max(p.best, t.wins); await save({});
        return send(res, 200, me({ teamId: t.id, win, delta, ghost, peak, wins: t.wins, over: true }));
      }
      const wins = t.wins + 1;
      const next = await nextOpponent(st, wins, pid, t.id);
      p.best = Math.max(p.best, wins);
      if (!next) { await st.updateTeam(t.id, { wins, status: 'champion', opp: null }); p.crowns++; await save({}); return send(res, 200, me({ teamId: t.id, win, delta, ghost, peak, wins, champion: true, over: true })); }
      await st.updateTeam(t.id, { wins, status: 'running', opp: next.id }); await save({});
      return send(res, 200, me({ teamId: t.id, win, delta, ghost, peak, wins, round: wins, opponent: oppView(next, pid) }));
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
