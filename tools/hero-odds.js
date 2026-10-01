// v61 (review #73, David: "simulate runs to find out the undertuned and overtuned heroes, always in a team environment,
// with reasonable items and Relics, and balance them. Tune also the scaling of heroes"): every hero in many random teams
// of 3 (tools/_team.js: the levels, shop items with Auto-equip and relics of that point of a run) at the fights that
// decide runs: hard 3 and boss 4 (early, Lv 1-2), hard 6, hard 7 and boss 8 (late, Lv 2-4). A hero's score = the win rate
// of the teams it is in; early -> late shows heroes that fall off or only come online late.
// With rounds > 0 it tunes two knobs per hero: power p (base HP and attack x p, mana cost / p) and growth g
// (B.HEROES[k].grow: how fast it grows per level). They are set from two targets: the hero's strength early (about
// Lv 1.3, p x (1 + 0.05 g)) moves toward the average early win rate, its strength late (about Lv 3, p x (1 + 0.3 g)) toward the
// average late one; p and g follow from the two (g stays within 0.5..1.8: early and late heroes keep their identity). The knobs are printed;
// they are written to js/data.js by hand (p into hp / atk / mana, g as grow).
// Usage: node tools/hero-odds.js [rounds=0: just measure] [teams=60]      ONLY=a,b measures just those heroes
const { team, play } = require('./_team.js');
const ROUNDS = +(process.argv[2] || 0), T = +(process.argv[3] || 60);
const keys = Object.keys(B.HEROES), EARLY = [[3, 'hard'], [4, 'boss']], LATE = [[6, 'hard'], [7, 'hard'], [8, 'boss']];
const BASE = Object.fromEntries(keys.map(k => [k, { hp: B.HEROES[k].hp, atk: B.HEROES[k].atk, mana: B.HEROES[k].mana, grow: B.HEROES[k].grow || 1 }]));
function apply(P, G) {
  for (const k of keys) {
    const h = B.HEROES[k], b = BASE[k], p = P[k];
    h.hp = Math.round(b.hp * p / 5) * 5; h.atk = Math.round(b.atk * p); h.mana = Math.max(20, Math.round(b.mana / p)); h.grow = Math.round(b.grow * G[k] * 100) / 100;
  }
}
function rate(k, F) { let w = 0; for (let t = 0; t < T; t++) for (const [f, d] of F) if (play(team(70000 + f * 1009 + t * 13, f, { hero: k }), f, d, t)) w++; return 100 * w / (T * F.length); }
function measure() {
  const res = {};
  for (const k of (process.env.ONLY ? process.env.ONLY.split(',') : keys)) { const e = rate(k, EARLY), l = rate(k, LATE); res[k] = { all: (2 * e + 3 * l) / 5, e, l }; }
  return res;
}
const P = Object.fromEntries(keys.map(k => [k, 1])), G = Object.fromEntries(keys.map(k => [k, 1])), r1 = x => Math.round(x), avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const clamp = (x, a) => Math.max(-a, Math.min(a, x));
for (let r = 0; r <= ROUNDS; r++) {
  apply(P, G);
  const res = measure(), ks = Object.keys(res), mean = avg(ks.map(k => res[k].all)), slope = avg(ks.map(k => res[k].l - res[k].e));
  const sd = Math.sqrt(avg(ks.map(k => (res[k].l - res[k].e - slope) ** 2)));
  const sorted = ks.sort((a, b) => res[b].all - res[a].all);
  console.log(`round ${r}: mean ${mean.toFixed(1)}%  spread ${r1(res[sorted[sorted.length - 1]].all)}..${r1(res[sorted[0]].all)}  early->late ${slope.toFixed(1)} (sd ${sd.toFixed(1)})`);
  console.log('  ' + sorted.map(k => `${B.HEROES[k].name} ${r1(res[k].all)} (${r1(res[k].e)}->${r1(res[k].l)})`).join(', '));
  if (r === ROUNDS) break;
  const damp = 1 + r / 3, me = avg(ks.map(k => res[k].e)), ml = avg(ks.map(k => res[k].l));
  for (const k of ks) {
    const g0 = BASE[k].grow * G[k], step = d => Math.abs(d) > 3 ? Math.exp(clamp(-d / 100 * 0.9 / damp, 0.1)) : 1;
    const E = P[k] * (1 + 0.05 * g0) * step(res[k].e - me), L = P[k] * (1 + 0.3 * g0) * step(res[k].l - ml);
    const rho = L / E, g = Math.max(0.5, Math.min(1.8, (rho - 1) / (0.3 - 0.05 * rho)));   // growth kept within 0.5x..1.8x
    // with g inside its range both targets are met; at a limit, p meets them on average (40% early, 60% late)
    G[k] = g / BASE[k].grow; P[k] = Math.exp(0.4 * Math.log(E / (1 + 0.05 * g)) + 0.6 * Math.log(L / (1 + 0.3 * g)));
  }
}
if (ROUNDS) {
  console.log('power: ' + JSON.stringify(Object.fromEntries(keys.filter(k => Math.abs(P[k] - 1) > 0.005).map(k => [k, Math.round(P[k] * 100) / 100]))));
  console.log('grow: ' + JSON.stringify(Object.fromEntries(keys.filter(k => Math.abs(B.HEROES[k].grow - 1) > 0.005).map(k => [k, B.HEROES[k].grow]))));
}
