// v61 (review #73): a team like the ones players have at fight n of a run, shared by the balance tools (pve-odds,
// tune-pve, hero-odds, item-odds, relic-odds): random heroes, levels, items from the shops of that point put on with
// Auto-equip, and combat relics. The amounts are what 300 bot runs (tools/sim-run.js) really have at each fight: 1 hero
// at fight 1 and 3 from fight 2 on (two bought at the first shop), average level 1.0 / 1.0 / 1.1 / 1.55 / 2.35 / 2.7 /
// 3.0 / 3.3 (the XP is slow: 30 for Lv 2), items worn 0 / 0 / 2 / 3 / 4 / 4 / 5 / 6, relics 1 / 1 / 1.3 / 1.5 / 2.3 / 2.8 /
// 3.1 / 3.5. A fractional average = some heroes (or one more relic) a step up, at random.
// o.hero forces a hero into the team, o.items / o.relics replace the random ones, o.extraItem / o.extraRelic add one.
const root = __dirname + '/../js/';
for (const f of ['hex', 'data', 'sim', 'run']) require(root + f + '.js');
const { Run, Sim, CFG } = B;
const HEROES_AT = n => n <= 1 ? 1 : 3;
const LV = { 1: 1, 2: 1, 3: 1.1, 4: 1.55, 5: 2.35, 6: 2.7, 7: 3, 8: 3.3 }, ITEMS = { 1: 0, 2: 0, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6 };
const REL = { 1: 1, 2: 1, 3: 1.3, 4: 1.5, 5: 2.3, 6: 2.8, 7: 3.1, 8: 3.5 }, RELICS = n => Math.floor(REL[n]);
const step = (run, x) => Math.floor(x) + (Run.rnd(run) < x - Math.floor(x) ? 1 : 0);
const COMBAT_RELICS = B.RELICS.filter(r => !B.NONCOMBAT.relic.includes(r.id) && !['phoenix', 'solo', 'crest', 'cursecoin'].includes(r.id)).map(r => r.id);
function team(seed, n, o) {
  o = o || {};
  const run = Run.newRun(seed);
  let keys = Object.keys(B.HEROES).sort(() => Run.rnd(run) - 0.5);
  if (o.hero) keys = [o.hero, ...keys.filter(k => k !== o.hero)];
  keys = keys.slice(0, HEROES_AT(n));
  Run.pickStart(run, [keys[0]], null); for (const k of keys.slice(1)) Run.addHero(run, k);
  run.fightNo = n - 1;
  for (const h of run.heroes) for (const lv = step(run, LV[n]); h.lvl < lv;) { h.lvl++; h.xp = CFG.xpLevels[h.lvl]; h.specs.push(B.HEROES[h.key].specs[h.lvl - 2][Math.floor(Run.rnd(run) * 2)].id); }
  const items = o.items || Array.from({ length: ITEMS[n] }, () => Run.randomItem(run));
  run.bag.push(...items); if (o.extraItem) run.bag.push(o.extraItem);
  Run.autoEquip(run);
  const rel = o.relics || COMBAT_RELICS.slice().sort(() => Run.rnd(run) - 0.5).slice(0, step(run, REL[n]));
  for (const id of rel) Run.gainRelic(run, id);
  if (o.extraRelic && !run.relics.includes(o.extraRelic)) Run.gainRelic(run, o.extraRelic);
  return run;
}
// plays fight n (diff 'easy' | 'medium' | 'hard' | 'boss') with the team. win = the heroes won; margin (-1..1) = the
// share of the heroes' HP left after a win, minus the share of the enemies' HP left after a loss (a finer measure)
function fight(run, n, diff, t) {
  run.cur = diff === 'boss' ? Run.makeFight(run, 'boss', n, n <= 4 ? 1 : 2) : Run.makeFight(run, diff, n);
  run.fightNo = n; run.phase = 'deploy'; run.rs = 51 + t;
  const W = Run.fightWorld(run), start = W.units.slice();
  Sim.run(W, 20 * 200);
  const win = W.winner === 0, side = win ? 0 : 1, mine = start.filter(u => u.side === side);
  const left = mine.reduce((a, u) => a + Math.max(0, u.hp), 0) / Math.max(1, mine.reduce((a, u) => a + u.maxHp, 0));
  return { win, margin: win ? left : -left };
}
const play = (run, n, diff, t) => fight(run, n, diff, t).win;
module.exports = { team, play, fight, COMBAT_RELICS, LV, ITEMS, RELICS };
