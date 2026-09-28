// Every 3-hero team (220) against both bosses, with a fixed "reasonable" loadout per fight.
// Answers: "can a team of 3 heroes with items beat the bosses?" Usage: node tools/boss-matrix.js [tries=4]
require('../js/hex.js'); require('../js/data.js'); require('../js/sim.js'); require('../js/run.js');
const { Run, Sim } = B; const TRIES = +(process.argv[2] || 4);
const keys = Object.keys(B.HEROES);
// review #22: bosses at fights 4 and 8. XP puts heroes at Lv 2 and Lv 3 there (as before at fights 3 and 6); the new
// structure adds a starting relic and one more shop before each boss, so the loadouts carry 1 and 2 relics.
// items: hero i gets items[i], items[i+3] (one item per type, v16)
const LOAD = { 4: { lvl: 2, items: ['longsword', 'chainmail', 'rod', 'boots', 'buckler', 'fang'], relics: ['whetset'] },
               8: { lvl: 3, items: ['bloodthirster', 'warmog', 'deathcap', 'b_greaves', 'guardplate', 'infinity'], relics: ['whetset', 'standard'] } };
for (const fightNo of [4, 8]) {  // review #22: bosses at fights 4 and 8
  let comps = 0, beat = 0, wins = 0, total = 0; const worst = [];
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) for (let c = b + 1; c < keys.length; c++) {
    const team = [keys[a], keys[b], keys[c]]; let w = 0;
    for (let s = 0; s < TRIES; s++) {
      const run = Run.newRun(1000 * fightNo + s); Run.pickStart(run, team.slice(0, 2)); Run.addHero(run, team[2]);
      const L = LOAD[fightNo];
      run.heroes.forEach((h, i) => { h.lvl = L.lvl; for (let l = 2; l <= L.lvl; l++) h.specs.push(B.HEROES[h.key].specs[l - 2][s % 2].id); h.items = [L.items[i], L.items[i + 3], L.items[i + 6]].filter(Boolean).slice(0, Run.slots(run, h)); });
      run.relics = L.relics.slice();
      run.cur = Run.makeFight(run, 'boss', fightNo);
      const W = Run.fightWorld(run); Sim.run(W, 20 * 200); if (W.winner === 0) w++;
    }
    comps++; total += TRIES; wins += w; if (w > 0) beat++; else worst.push(team.join('+'));
  }
  console.log(`boss of fight ${fightNo}: ${beat}/${comps} teams won at least once; overall win rate ${Math.round(100 * wins / total)}%`);
  if (worst.length) console.log('  never won:', worst.slice(0, 12).join(', '), worst.length > 12 ? `(+${worst.length - 12})` : '');
}
