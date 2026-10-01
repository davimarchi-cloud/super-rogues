// v50 (review #62), v61 (review #73): what one combat relic is worth. The same random teams (tools/_team.js: levels,
// shop items with Auto-equip and the relics of that point of a run) play hard 3, hard 6 and boss 8 without and with the
// relic. The worth = the gain in the fight margin (x100; tools/_team.js), with the gain in wins next to it.
// Usage: node tools/relic-odds.js [teams=60] [ids, comma separated, or all]
const { team, fight } = require('./_team.js');
const T = +(process.argv[2] || 60), FIGHTS = [[3, 'hard'], [6, 'hard'], [8, 'boss']];
const ids = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : B.RELICS.filter(r => !B.NONCOMBAT.relic.includes(r.id)).map(r => r.id);
const seeds = []; for (const [f, d] of FIGHTS) for (let t = 0; t < T; t++) seeds.push([f, d, t, 60000 + f * 1019 + t * 19]);
const base = seeds.map(([f, d, t, s]) => fight(team(s, f), f, d, t));
console.log(`no extra relic: ${Math.round(100 * base.filter(b => b.win).length / base.length)}% won over ${seeds.length} fights`);
const out = ids.map(id => {
  let m = 0, w = 0;
  seeds.forEach(([f, d, t, s], i) => { const r = fight(team(s, f, { extraRelic: id }), f, d, t); m += r.margin - base[i].margin; w += r.win - base[i].win; });
  return { id, m: 100 * m / seeds.length, w: 100 * w / seeds.length };
}).sort((a, b) => b.m - a.m);
for (const o of out) console.log(`${o.id.padEnd(14)} ${o.m >= 0 ? '+' : ''}${o.m.toFixed(1)}   (wins ${o.w >= 0 ? '+' : ''}${Math.round(o.w)}%)`);
