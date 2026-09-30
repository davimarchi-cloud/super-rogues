// v44 (review #54): how often a team wins each event challenge, by the fight it comes after. Teams are random heroes at
// the level and with the items a run usually has at that point, placed automatically (like the bot).
// Usage: node tools/challenge-odds.js [teams per cell=60]
const root = __dirname + '/../js/';
for (const f of ['hex', 'data', 'sim', 'run']) require(root + f + '.js');
const { Run, Sim } = B;
const N = +(process.argv[2] || 60);
// optional overrides: node tools/challenge-odds.js 60 solo=1.4,pack=1.5
for (const kv of (process.argv[3] || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); Run.CH[k] = +v; }
const KINDS = ['solo', 'bandits', 'pack', 'horde', 'mimic', 'hoard'];
const LV = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 4 }, ITEMS = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 };
const out = {};
for (const n of [1, 3, 5, 7]) {
  for (const kind of KINDS) {
    let w = 0;
    for (let t = 0; t < N; t++) {
      const run = Run.newRun(1000 * n + t * 7 + KINDS.indexOf(kind));
      const keys = Object.keys(B.HEROES).sort(() => Run.rnd(run) - 0.5).slice(0, n <= 1 ? 2 : 3);
      Run.pickStart(run, [keys[0]]); for (const k of keys.slice(1)) Run.addHero(run, k);
      run.fightNo = n;
      for (const h of run.heroes) {
        while (h.lvl < LV[n]) { h.lvl++; h.xp = B.CFG.xpLevels[h.lvl]; h.specs.push(B.HEROES[h.key].specs[h.lvl - 2][Math.floor(Run.rnd(run) * 2)].id); }
        const types = B.TYPES.map(x => x.id).sort(() => Run.rnd(run) - 0.5);
        for (let i = 0; i < ITEMS[n] && i < Run.slots(run, h); i++) { const pool = B.ITEMS.filter(it => it.type === types[i] && ['common', 'uncommon', 'rare', 'epic'].includes(it.tier)); h.items.push(pool[Math.floor(Run.rnd(run) * pool.length)].id); }
      }
      const c = { kind, name: kind, win: {} };
      Run.startChallenge(run, c, kind === 'solo' ? run.heroes.slice().sort((a, b) => B.HEROES[b.key].hp - B.HEROES[a.key].hp)[Math.floor(Run.rnd(run) * run.heroes.length)] : null);
      const W = Run.fightWorld(run); Sim.run(W, 20 * 200); if (W.winner === 0) w++;
    }
    (out[kind] = out[kind] || {})[n] = Math.round(100 * w / N) + '%';
  }
}
console.log('win rate by the fight the challenge comes after (' + N + ' teams each)');
console.log('kind      ' + [1, 3, 5, 7].map(n => ('after ' + n).padEnd(9)).join(''));
for (const k of KINDS) console.log(k.padEnd(10) + [1, 3, 5, 7].map(n => String(out[k][n]).padEnd(9)).join(''));
