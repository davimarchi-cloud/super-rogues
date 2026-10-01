// v61 (review #73, David: "Do the same for items and relics, seeing which dont make sense power level wise"): what one
// item is worth. The same random teams (tools/_team.js) play hard 3, hard 6 and boss 8 without and with the item, put on
// the hero it suits best that has no item of its type (Run.itemScore; as one item more, past the slot limit, so the
// item is added and nothing it would replace changes the result). The gain in wins is the item's worth; items are listed by rarity, so an item that is out of line with its
// rarity stands out. Sets are measured as one piece and as the full set on one hero.
// Usage: node tools/item-odds.js [teams=60]      ONLY=a,b measures just those items
const { team, fight } = require('./_team.js');
const { Run } = B;
const T = +(process.argv[2] || 60), FIGHTS = [[3, 'hard'], [6, 'hard'], [8, 'boss']];
const TIERS = ['common', 'uncommon', 'rare', 'epic', 'set', 'legendary', 'mythic'];
function wear(run, ids) {
  const sc = h => ids.reduce((a, id) => a + Run.itemScore(h.key, id), 0), free = h => !h.items.some(x => ids.some(id => B.ITEM[x].type === B.ITEM[id].type));
  const by = run.heroes.slice().sort((a, b) => sc(b) - sc(a)), h = by.find(free) || by[0];
  h.items = h.items.filter(x => !ids.some(id => B.ITEM[x].type === B.ITEM[id].type)).concat(ids);
}
const seeds = []; for (const [f, d] of FIGHTS) for (let t = 0; t < T; t++) seeds.push([f, d, t, 50000 + f * 1013 + t * 17]);
const base = seeds.map(([f, d, t, s]) => fight(team(s, f), f, d, t)), baseRate = 100 * base.filter(b => b.win).length / base.length;
// the worth = the gain in the fight margin (tools/_team.js), x100: finer than wins alone, and it tracks them
function worth(ids) {
  let gain = 0;
  seeds.forEach(([f, d, t, s], i) => { const run = team(s, f); wear(run, ids); gain += fight(run, f, d, t).margin - base[i].margin; });
  return 100 * gain / seeds.length;
}
console.log(`base win rate ${baseRate.toFixed(1)}% over ${seeds.length} fights; the number is the gain in fight margin (x100)`);
const only = process.env.ONLY && process.env.ONLY.split(','), res = {};
for (const it of B.ITEMS) if ((!only || only.includes(it.id)) && !B.NONCOMBAT.item.includes(it.id)) (res[it.tier] = res[it.tier] || []).push([it, worth([it.id])]);
for (const tier of TIERS) {
  const list = (res[tier] || []).sort((a, b) => b[1] - a[1]); if (!list.length) continue;
  const mean = list.reduce((a, x) => a + x[1], 0) / list.length;
  console.log(`\n${tier} (mean +${mean.toFixed(1)}): ` + list.map(([it, v]) => `${it.id} ${v >= 0 ? '+' : ''}${v.toFixed(1)}`).join(', '));
}
if (!only) {
  const sets = {}; for (const it of B.ITEMS) if (it.set) (sets[it.set] = sets[it.set] || []).push(it.id);
  console.log('\nfull sets: ' + Object.entries(sets).map(([s, ids]) => `${s} +${worth(ids).toFixed(1)}`).join(', '));
}
