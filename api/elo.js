// Elo + PvP gauntlet (reviews #3 and #4 by David).
// - No hearts: losing any fight ends the run = a loss against an opponent rated (your Elo - 200)      op 'fail'
// - After the Onslaught the player's team is stored and enters the gauntlet: round k is against a stored team whose
//   own gauntlet ended with k wins (or the closest above). Each match is a 1v1 Elo game against that team's rating
//   at the time it was stored. A loss ends the run; if nobody ever went further, the player is crowned champion.
//   ops 'enter' and 'result'. GET: Elo ladder.
// Fights run in the player's browser (like the rest of the game), so results are trusted: this is a demo.
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
require('../js/hex.js'); require('../js/data.js');
const D = globalThis.B;

const K = 32;
const expect = (r, o) => 1 / (1 + Math.pow(10, (o - r) / 400));
const eloAfter = (r, o, score) => r + K * (score - expect(r, o));

// only well-formed teams made of real game content get stored (they are replayed in other players' browsers)
function cleanTeam(team) {
  if (!Array.isArray(team) || team.length < 1 || team.length > 4) return null;
  const out = [];
  for (const h of team) {
    const hd = h && D.HEROES[h.key]; if (!hd) return null;
    const lvl = Math.max(1, Math.min(5, Math.round(Number(h.lvl) || 1)));
    const allSpecs = new Set(hd.specs.flat().map(s => s.id));
    const specs = (Array.isArray(h.specs) ? h.specs : []).filter(id => allSpecs.has(id)).slice(0, lvl - 1);
    const items = (Array.isArray(h.items) ? h.items : []).filter(id => D.ITEM[id]).slice(0, 5);
    const bonus = {};
    for (const [k, max] of [['hpPct', 1], ['atk', 60], ['armor', 80]]) { const v = Number(h.bonus && h.bonus[k]); if (v > 0) bonus[k] = Math.min(max, v); }
    const c = Math.max(0, Math.min(7, Math.round(Number(h.pos && h.pos.c)))), r = Math.max(4, Math.min(7, Math.round(Number(h.pos && h.pos.r))));
    out.push({ key: h.key, lvl, specs, items, bonus, pos: { c: Number.isFinite(c) ? c : 3, r: Number.isFinite(r) ? r : 6 } });
  }
  return out;
}
const oppView = t => t && { teamId: t.id, name: t.name, elo: Math.round(t.elo_at), wins: t.wins, status: t.status, bot: t.pid === 'bot', team: JSON.parse(t.team), relics: JSON.parse(t.relics) };

// review #5 (David): until the first player team has lost a duel there is nobody to fight in round 1, so the first
// duel is against a random but believable company: same level and item count as the player's team, random specs,
// sensible formation. Stored with pid 'bot' / status 'bot' (never picked as a regular opponent). Once any real team
// has lost, round 1 uses real teams and the bots are gone.
const BOT_NAMES = ['The Ashen Company', 'Ser Aldric\'s Band', 'The Grey Wardens', 'Wolves of Varn', 'The Last Lanterns', 'Crimson Oath', 'The Hollow Crowns', 'Brothers of the Pass', 'The Salt Guard', 'Duskwatch'];
const rnd = a => a[Math.floor(Math.random() * a.length)];
function makeBot(team) {
  const lvl = Math.max(1, Math.min(5, Math.round(team.reduce((t, h) => t + h.lvl, 0) / team.length)));
  const nItems = Math.round(team.reduce((t, h) => t + h.items.length, 0) / team.length);
  const pool = Object.keys(D.HEROES).sort(() => Math.random() - 0.5).slice(0, team.length);
  const tiers = lvl >= 4 ? ['rare', 'rare', 'epic'] : ['common', 'rare', 'rare'];
  const taken = new Set();
  return pool.map(key => {
    const hd = D.HEROES[key], specs = [];
    for (let l = 2; l <= lvl; l++) specs.push(rnd(hd.specs[l - 2]).id);
    const slots = 1 + Math.max(0, lvl - 2), items = [];
    for (let i = 0; i < Math.min(slots, nItems); i++) items.push(rnd(D.ITEMS.filter(it => it.tier === rnd(tiers) && !it.mods.gold)).id);
    const rows = hd.range <= 1 ? [4, 5] : [7, 6], cols = [3, 4, 2, 5, 1, 6];
    let pos = { c: 3, r: rows[0] };
    for (const r of rows) { const c = cols.find(c => !taken.has(c + ':' + r)); if (c != null) { pos = { c, r }; break; } }
    taken.add(pos.c + ':' + pos.r);
    return { key, lvl, specs, items, bonus: {}, pos };
  });
}
// next opponent with at least `wins` wins: other players first, then your own older teams
async function nextOpponent(st, wins, pid, teamId) { return (await st.pickOpponent(wins, pid, false)) || (await st.pickOpponent(wins, pid, true, teamId)); }

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') return send(res, 200, { top: await st.topPlayers(25) });
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

    if (b.op === 'fail') {
      const before = p.elo; p.elo = eloAfter(p.elo, p.elo - 200, 0); p.runs++;
      await save({}); return send(res, 200, me({ delta: Math.round(p.elo) - Math.round(before) }));
    }

    if (b.op === 'enter') {
      const team = cleanTeam(b.team);
      if (!team) return send(res, 400, { error: 'Invalid team' });
      const relics = (Array.isArray(b.relics) ? b.relics : []).filter(id => D.RELIC[id]).slice(0, 40);
      if (await st.countTeams(pid, Date.now() - 3600e3) >= 20) return send(res, 429, { error: 'Too many gauntlet runs this hour.' });
      const id = await st.insertTeam({ pid, name, elo_at: p.elo, team: JSON.stringify(team), relics: JSON.stringify(relics) });
      p.runs++;
      let opp;
      if (!(await st.anyLost())) {
        const botId = await st.insertTeam({ pid: 'bot', name: rnd(BOT_NAMES), elo_at: 1000, team: JSON.stringify(makeBot(team)), relics: '[]' });
        await st.updateTeam(botId, { wins: 0, status: 'bot', opp: null });
        opp = await st.getTeam(botId);
      } else opp = await nextOpponent(st, 0, pid, id);
      if (!opp) { await st.updateTeam(id, { wins: 0, status: 'champion', opp: null }); p.crowns++; await save({}); return send(res, 200, me({ teamId: id, round: 0, wins: 0, champion: true, over: true })); }
      await st.updateTeam(id, { wins: 0, status: 'running', opp: opp.id }); await save({});
      return send(res, 200, me({ teamId: id, round: 0, wins: 0, opponent: oppView(opp) }));
    }

    if (b.op === 'result') {
      const t = await st.getTeam(Math.floor(Number(b.teamId)));
      if (!t || t.pid !== pid) return send(res, 404, { error: 'Unknown gauntlet run' });
      if (t.status !== 'running' || !t.opp) return send(res, 409, { error: 'This gauntlet run is already over' });
      const opp = await st.getTeam(t.opp);
      const win = !!b.win, before = p.elo;
      p.elo = eloAfter(p.elo, opp ? opp.elo_at : p.elo, win ? 1 : 0);
      const delta = Math.round(p.elo) - Math.round(before);
      if (!win) {
        await st.updateTeam(t.id, { wins: t.wins, status: 'lost', opp: null });
        p.best = Math.max(p.best, t.wins); await save({});
        return send(res, 200, me({ teamId: t.id, win, delta, wins: t.wins, over: true }));
      }
      const wins = t.wins + 1;
      const next = await nextOpponent(st, wins, pid, t.id);
      p.best = Math.max(p.best, wins);
      if (!next) { await st.updateTeam(t.id, { wins, status: 'champion', opp: null }); p.crowns++; await save({}); return send(res, 200, me({ teamId: t.id, win, delta, wins, champion: true, over: true })); }
      await st.updateTeam(t.id, { wins, status: 'running', opp: next.id }); await save({});
      return send(res, 200, me({ teamId: t.id, win, delta, wins, round: wins, opponent: oppView(next) }));
    }
    return send(res, 400, { error: 'Unknown op' });
  } catch (e) {
    console.error('elo', e);
    return send(res, 500, { error: 'Server error' });
  }
};
module.exports.eloAfter = eloAfter;
