// PvE rebalance helper (review #42): each hero in slot 0 with 2 random partners and a few items, against the two
// bosses (Lv 2 and Lv 3). A power knob p per hero scales base HP and attack (x p) and mana cost (/ p). Iterates p so heroes
// under the band get buffed toward it and heroes over it get slightly nerfed. Usage: node tools/tune-heroes.js [rounds=0: just measure] [trials=80]. Prints the knobs; they are written to js/data.js by hand
const root = require('path').join(__dirname, '..'), ROUNDS = +(process.argv[2] || 0), T = +(process.argv[3] || 80);
for (const f of ['hex', 'data', 'sim', 'run']) require(root + '/js/' + f + '.js');
const { Run, Sim } = B; const keys = Object.keys(B.HEROES);
const BASE = Object.fromEntries(keys.map(k => [k, { hp: B.HEROES[k].hp, atk: B.HEROES[k].atk, mana: B.HEROES[k].mana }]));
const AP = new Set(['buzzwell', 'coralie', 'stellan', 'pyra', 'glacia', 'lumen', 'morrow', 'tempest', 'seraph', 'bramble', 'echo', 'vey', 'sprocket', 'vesper', 'azgul', 'pip']);
const LOAD = { 2: { items: ['longsword', 'chainmail', 'rod', 'boots', 'buckler', 'fang'], ap: ['rod', 'boots'], relics: ['whetset'] },
               3: { items: ['bloodthirster', 'warmog', 'deathcap', 'b_greaves', 'guardplate', 'infinity'], ap: ['deathcap', 'b_greaves', 'bluecrystal'], relics: ['whetset', 'standard'] } };
const FIGHTS = [['boss', 4, 2], ['boss', 8, 3]];  // hard fights are cleared ~95% by everyone: the bosses are where heroes fail
function apply(P) { for (const k of keys) { const h = B.HEROES[k], b = BASE[k], p = P[k] || 1; h.hp = Math.round(b.hp * p / 5) * 5; h.atk = Math.round(b.atk * p); h.mana = Math.max(20, Math.round(b.mana / p)); } }
function measure(P) {
  apply(P); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const res = {};
  for (const k of keys) {
    const others = keys.filter(x => x !== k); let w = 0, n = 0;
    for (let t = 0; t < T; t++) {
      const a = others[Math.floor(rnd() * others.length)]; let b; do b = others[Math.floor(rnd() * others.length)]; while (b === a);
      for (const [diff, fightNo, lvl] of FIGHTS) {
        const run = Run.newRun(1000 * fightNo + t * 31 + 5); Run.pickStart(run, [k]); Run.addHero(run, a); Run.addHero(run, b);
        const L = LOAD[lvl];
        run.heroes.forEach((h, i) => { h.lvl = lvl; for (let l = 2; l <= lvl; l++) h.specs.push(B.HEROES[h.key].specs[l - 2][t % 2].id);
          const items = i === 0 && AP.has(h.key) ? L.ap : [L.items[i], L.items[i + 3]].filter(Boolean);
          h.items = items.slice(0, Run.slots(run, h)); });
        run.relics = L.relics.slice(); run.cur = Run.makeFight(run, diff, fightNo);
        const W = Run.fightWorld(run); Sim.run(W, 20 * 200); if (W.winner === 0) w++; n++;
      }
    }
    res[k] = Math.round(100 * w / n);
  }
  return res;
}
const P = Object.fromEntries(keys.map(k => [k, 1]));
let r = measure(P);
const M0 = Object.values(r).reduce((a, b) => a + b, 0) / keys.length, LO = M0 - 8, HI = M0 + 14;
console.log('band', Math.round(LO), Math.round(HI));
const show = (tag, r) => { const v = Object.values(r); console.log(tag, 'mean', Math.round(v.reduce((a, b) => a + b, 0) / v.length), 'min', Math.min(...v), 'max', Math.max(...v)); };
show('before', r); console.log(JSON.stringify(r));
for (let i = 0; i < ROUNDS; i++) {
  for (const k of keys) {
    const wr = Math.max(3, r[k]);
    if (wr < LO) P[k] *= Math.pow((LO + 5) / wr, 0.3); else if (wr > HI) P[k] *= Math.pow((HI - 3) / wr, 0.35);
    P[k] = Math.max(0.82, Math.min(1.6, P[k]));
  }
  r = measure(P); show('round ' + (i + 1), r);
}
console.log(JSON.stringify(r));
console.log('P=' + JSON.stringify(Object.fromEntries(keys.map(k => [k, Math.round(P[k] * 100) / 100]))));
