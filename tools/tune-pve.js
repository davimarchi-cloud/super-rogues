// v61 (review #73): tunes the PvE curve toward the targets: easy ~99% (free), medium ~90% (easy), hard ~60% (hard),
// bosses ~55% (hard but beatable). Knobs: the fight scale of each fight number (CFG.fightScale: the medium fight and the
// boss of that number) and one strength factor per difficulty AND fight number (DIFF.easy.mul / DIFF.hard.mul, arrays
// indexed by fight number). Measures with tools/pve-odds.js teams. Prints the new values; they are written to js/data.js
// by hand. Usage: node tools/tune-pve.js [rounds=8] [teams=80]
const { team, play } = require('./_team.js');
const { CFG, DIFF } = B;
const ROUNDS = +(process.argv[2] || 8), N = +(process.argv[3] || 80);
const TARGET = { easy: 99, medium: 90, hard: 60, boss: 55 };
const arr = v => Array.isArray(v) ? v.slice() : Array(CFG.fightScale.length).fill(v || 1);
DIFF.easy.mul = arr(DIFF.easy.mul); DIFF.hard.mul = arr(DIFF.hard.mul);
function rate(n, diff) {
  let w = 0;
  for (let t = 0; t < N; t++) if (play(team(9000 + n * 101 + t * 7, n), n, diff, t)) w++;
  return 100 * w / N;
}
// win too high -> enemies stronger; the step shrinks round after round so it settles instead of swinging
const step = (miss, k, r) => Math.exp(Math.max(-0.2, Math.min(0.2, miss / 100 * k / (1 + r / 2))));
const r2 = x => Math.round(x * 100) / 100;
for (let r = 0; r < ROUNDS; r++) {
  for (let n = 1; n <= 8; n++) {
    const boss = n === 4 || n === 8;
    CFG.fightScale[n] *= step(rate(n, boss ? 'boss' : 'medium') - (boss ? TARGET.boss : TARGET.medium), boss ? 0.8 : 1.6, r);
    if (boss) continue;
    DIFF.easy.mul[n] *= step(rate(n, 'easy') - TARGET.easy, 2.5, r);
    DIFF.hard.mul[n] *= step(rate(n, 'hard') - TARGET.hard, 1.0, r);
  }
  console.log('round', r + 1, 'scale', CFG.fightScale.map(r2).join(','), '| easy', DIFF.easy.mul.map(r2).join(','), '| hard', DIFF.hard.mul.map(r2).join(','));
}
for (let n = 1; n <= 8; n++) console.log(n === 4 || n === 8 ? `fight ${n}: boss ${Math.round(rate(n, 'boss'))}%` : `fight ${n}: easy ${Math.round(rate(n, 'easy'))}%  medium ${Math.round(rate(n, 'medium'))}%  hard ${Math.round(rate(n, 'hard'))}%`);
console.log('fightScale: [' + CFG.fightScale.map(r2).join(', ') + ']');
console.log('easy.mul: [' + DIFF.easy.mul.map(r2).join(', ') + ']');
console.log('hard.mul: [' + DIFF.hard.mul.map(r2).join(', ') + ']');
