// v52 (review #64): how often a team beats each boss. Random 3-hero teams with the level and items a run usually has
// when it reaches that boss (slot 1 = fight 4, slot 2 = fight 8), against each boss of the slot, same teams and seeds.
// Usage: node tools/boss-odds.js [teams=80]
const root = __dirname + '/../js/';
for (const f of ['hex', 'data', 'sim', 'run']) require(root + f + '.js');
const { Run, Sim } = B;
const N = +(process.argv[2] || 80);
const AT = { 1: { fight: 4, lvl: 2, items: 1 }, 2: { fight: 8, lvl: 4, items: 3 } };   // a bit under a typical run, so the old bosses sit near 50-65%
function team(seed, slot) {
  const run = Run.newRun(seed), A = AT[slot];
  const keys = Object.keys(B.HEROES).sort(() => Run.rnd(run) - 0.5).slice(0, 3);
  Run.pickStart(run, [keys[0]], null); for (const k of keys.slice(1)) Run.addHero(run, k);
  run.fightNo = A.fight - 1;
  for (const h of run.heroes) {
    while (h.lvl < A.lvl) { h.lvl++; h.xp = B.CFG.xpLevels[h.lvl]; h.specs.push(B.HEROES[h.key].specs[h.lvl - 2][Math.floor(Run.rnd(run) * 2)].id); }
    const types = B.TYPES.map(x => x.id).sort(() => Run.rnd(run) - 0.5);
    for (let i = 0; i < A.items && i < Run.slots(run, h); i++) { const pool = B.ITEMS.filter(it => it.type === types[i] && ['common', 'uncommon', 'rare', 'epic'].includes(it.tier)); h.items.push(pool[Math.floor(Run.rnd(run) * pool.length)].id); }
  }
  return run;
}
for (const slot of [1, 2]) {
  const line = [];
  for (const key of B.BOSS_SLOTS[slot - 1]) {
    let w = 0, secs = 0;
    for (let t = 0; t < N; t++) {
      const run = team(7000 + t * 17 + slot, slot);
      run.bosses = slot === 1 ? [key, 'hollowking'] : ['gorewarden', key];
      run.cur = Run.makeFight(run, 'boss', AT[slot].fight, slot); run.fightNo = AT[slot].fight; run.phase = 'deploy'; run.rs = 31 + t;
      const W = Run.fightWorld(run); Sim.run(W, 20 * 200); if (W.winner === 0) w++; secs += W.t / 20;
    }
    line.push(`${B.BOSSES[key].name}: ${Math.round(100 * w / N)}% (${Math.round(secs / N)}s)`);
  }
  console.log(`slot ${slot} (fight ${AT[slot].fight}): ` + line.join('  |  '));
}
