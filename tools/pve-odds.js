// v61 (review #73, David: "easy fights should be free, medium easy, hard actually hard. Bosses should be hard but beatable
// with good decisions"): the win rate of every fight of a run (fight 1..8, easy / medium / hard, the boss at 4 and 8) for
// teams like the ones players have at that point (tools/_team.js). Targets: easy ~99%, medium ~90%, hard ~60%, boss ~55%.
// Usage: node tools/pve-odds.js [teams=60] [seed=9000]   (another seed checks the tuning on new teams)
const { team, play } = require('./_team.js');
const N = +(process.argv[2] || 60), SEED = +(process.argv[3] || 9000);
function rate(n, diff) {
  let w = 0;
  for (let t = 0; t < N; t++) if (play(team(SEED + n * 101 + t * 7, n), n, diff, t)) w++;
  return Math.round(100 * w / N);
}
for (let n = 1; n <= 8; n++)
  console.log(n === 4 || n === 8 ? `fight ${n}: boss ${rate(n, 'boss')}%` : `fight ${n}: easy ${rate(n, 'easy')}%  medium ${rate(n, 'medium')}%  hard ${rate(n, 'hard')}%`);
