// v50 (review #62): how much each relic changes the odds of winning a fight. Random 3-hero teams at the level and
// items a run usually has after fight N, against the same medium fight with and without the relic (same seeds).
// Usage: node tools/relic-odds.js [teams=60] [fightNo=4] [ids, comma separated, or all] [enemy strength x, default 1.45]
const root = __dirname + '/../js/';
for (const f of ['hex', 'data', 'sim', 'run']) require(root + f + '.js');
const { Run, Sim } = B;
const N = +(process.argv[2] || 60), FN = +(process.argv[3] || 4), MUL = +(process.argv[5] || 1.45);   // MUL: a harder fight, so the base is near 50%
const ids = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : B.RELICS.filter(r => !B.NONCOMBAT.relic.includes(r.id)).map(r => r.id);
const LV = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 4, 8: 4 }, IT = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4 };
function team(seed) {
  const run = Run.newRun(seed);
  const keys = Object.keys(B.HEROES).sort(() => Run.rnd(run) - 0.5).slice(0, 3);
  Run.pickStart(run, [keys[0]], null); for (const k of keys.slice(1)) Run.addHero(run, k);
  run.fightNo = FN;
  for (const h of run.heroes) {
    while (h.lvl < LV[FN]) { h.lvl++; h.xp = B.CFG.xpLevels[h.lvl]; h.specs.push(B.HEROES[h.key].specs[h.lvl - 2][Math.floor(Run.rnd(run) * 2)].id); }
    const types = B.TYPES.map(x => x.id).sort(() => Run.rnd(run) - 0.5);
    for (let i = 0; i < IT[FN] && i < Run.slots(run, h); i++) { const pool = B.ITEMS.filter(it => it.type === types[i] && ['common', 'uncommon', 'rare', 'epic'].includes(it.tier)); h.items.push(pool[Math.floor(Run.rnd(run) * pool.length)].id); }
  }
  run.cur = Run.makeFight(run, 'hard', FN, 0, { scaleMul: MUL }); run.phase = 'deploy';
  return run;
}
function rate(relic) {
  let w = 0;
  for (let t = 0; t < N; t++) {
    const run = team(5000 + t * 13);
    if (relic) run.relics.push(relic);
    run.rs = 777 + t;   // the same fight seed with and without the relic
    const W = Run.fightWorld(run); Sim.run(W, 20 * 200); if (W.winner === 0) w++;
  }
  return w / N;
}
const base = rate(null);
console.log(`no relic: ${Math.round(base * 100)}% (fight ${FN}, ${N} teams)`);
const out = ids.map(id => ({ id, d: rate(id) - base })).sort((a, b) => b.d - a.d);
for (const o of out) console.log(`${o.id.padEnd(14)} ${o.d >= 0 ? '+' : ''}${Math.round(o.d * 100)}%`);
