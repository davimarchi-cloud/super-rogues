// Bot plays whole runs headless, to catch crashes and read balance numbers.
// Usage: node tools/sim-run.js [runs=40] [teamSize=3] [seed=1] [events]   ('events' = the bot prefers events over shops)
// Reports: win rate per fight (and bosses), how many runs reach the gauntlet, levels reached, abilities that never fired, NaN checks.
require('../js/hex.js'); require('../js/data.js'); require('../js/sim.js'); require('../js/run.js');
const RUNS = +(process.argv[2] || 40), TEAM = +(process.argv[3] || 3), SEED0 = +(process.argv[4] || 1), EVENTS = process.argv[5] === 'events';
let eventsSeen = 0;
const { Run, Sim, HEROES, ITEM } = B;

const casts = {}; for (const k in Sim.abilities) { const f = Sim.abilities[k]; Sim.abilities[k] = (W, u, x) => { const r = f(W, u, x); if (r) casts[k] = (casts[k] || 0) + 1; return r; }; }
const stats = { fights: {}, boss: { 4: [0, 0], 8: [0, 0] }, scores: [], waves: [], lv: [0, 0, 0, 0, 0, 0], reached: 0, nan: 0, fightSecs: [] };
const rank = id => B.RARITIES.findIndex(r => r.id === ITEM[id].tier);

// best rarity first, one item per type (itemization v16): an item whose type the hero already wears waits for the next hero
function equipAll(run) {
  run.bag.sort((a, b) => rank(b) - rank(a));
  for (const h of run.heroes) for (let i = 0; i < run.bag.length && h.items.length < Run.slots(run, h);) {
    if (h.items.some(x => ITEM[x].type === ITEM[run.bag[i]].type)) i++; else Run.equip(run, i, h.uid);
  }
}
function playFight(run, W) {
  Sim.run(W, 20 * 60 * 20);
  for (const u of W.units) if (!Number.isFinite(u.hp) || !Number.isFinite(u.mana)) stats.nan++;
  return W;
}
for (let n = 0; n < RUNS; n++) {
  const run = Run.newRun(SEED0 * 1000 + n);
  Run.pickStart(run, run.startOffer.slice(0, 1), run.relicOffer[0]);  // review #22: 1 hero and 1 relic
  let guard = 0;
  while (run.phase !== 'over' && run.phase !== 'gauntlet' && guard++ < 200) {
    while (run.pending.length) Run.chooseSpec(run, Run.rnd(run) < 0.5 ? 0 : 1);
    if (run.phase === 'map') {
      let i = 0;
      const o = run.opts;
      if (o.length === 2 && o[0].type === 'fight') i = o.findIndex(x => x.diff === 'medium') >= 0 ? o.findIndex(x => x.diff === 'medium') : 0;
      else if (o.length === 2) {
        const want = EVENTS ? (run.heroes.length < TEAM ? ['heroShop', 'event', 'itemShop'] : ['event', 'itemShop', 'relicShop']) : run.heroes.length < TEAM ? ['heroShop', 'itemShop', 'relicShop'] : ['itemShop', 'relicShop', 'event'];
        const score = x => { const k = x.type === 'event' ? 'event' : x.kind; const w = want.indexOf(k); return w < 0 ? 9 : w; };
        i = score(o[0]) <= score(o[1]) ? 0 : 1;
      }
      Run.choose(run, i);
    } else if (run.phase === 'shop') {
      const st = run.cur.stock;
      for (let k = 0; k < st.length; k++) {
        const s = st[k];
        if (s.kind === 'hero' && run.heroes.length >= TEAM) continue;
        if (run.gold >= s.price) Run.buy(run, k);
      }
      equipAll(run); Run.leave(run);
    } else if (run.phase === 'event') {
      // review #17: a random choice the bot can afford; targeted ones go to a random valid target
      eventsSeen++;
      const chs = Run.eventChoices(run), open = chs.map((c, k) => k).filter(k => Run.canChoose(run, chs[k]).ok);
      if (open.length) {
        const k = open[Math.floor(Run.rnd(run) * open.length)], ts = chs[k].target ? Run.eventTargets(run, chs[k]) : null;
        Run.eventAct(run, k, ts ? ts[Math.floor(Run.rnd(run) * ts.length)].arg : undefined);
      }
      if (run.phase === 'event') Run.leave(run);   // v44: a challenge from the event goes to 'deploy' and is fought next
    } else if (run.phase === 'deploy') {
      equipAll(run);
      {
        const f = run.cur, W = playFight(run, Run.fightWorld(run));
        const key = f.challenge ? 'ch-' + f.challenge.kind : f.fightNo + (f.diff === 'boss' ? 'B' : f.diff[0]);
        stats.fights[key] = stats.fights[key] || [0, 0]; stats.fights[key][1]++; if (W.winner === 0) stats.fights[key][0]++;
        if (f.diff === 'boss' && !f.challenge) { stats.boss[f.fightNo][1]++; if (W.winner === 0) stats.boss[f.fightNo][0]++; }
        stats.fightSecs.push(W.t / 20);
        Run.finishFight(run, W);
      }
    }
  }
  if (run.phase === 'gauntlet') stats.reached++;
  for (const h of run.heroes) stats.lv[h.lvl]++;
}
const pct = (a) => a[1] ? Math.round(100 * a[0] / a[1]) + '% (' + a[0] + '/' + a[1] + ')' : '-';
console.log('runs', RUNS, 'team', TEAM);
console.log('fights:', Object.keys(stats.fights).sort().map(k => k + ' ' + pct(stats.fights[k])).join(' | '));
console.log('boss 1 (fight 4):', pct(stats.boss[4]), ' boss 2 (fight 8):', pct(stats.boss[8]));
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
console.log('reached the gauntlet:', stats.reached, 'of', RUNS, EVENTS ? '(events visited: ' + eventsSeen + ')' : '');
console.log('fight length avg (s):', avg(stats.fightSecs), ' max', Math.max(...stats.fightSecs).toFixed(0));
console.log('hero levels at end:', stats.lv.slice(1).map((c, i) => 'L' + (i + 1) + ':' + c).join(' '));
console.log('NaN units:', stats.nan);
const never = Object.keys(Sim.abilities).filter(k => !casts[k]);
console.log('casts:', JSON.stringify(casts));
console.log('never cast:', never.join(', ') || 'none');
