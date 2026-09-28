// Engine + run logic checks (Node, no browser). Usage: node tools/tests/motor.js
require('../../js/hex.js'); require('../../js/data.js'); require('../../js/sim.js'); require('../../js/run.js');
const { Run, Sim, Hex, HEROES, ITEMS, RELICS, CFG } = B;
let fails = 0, oks = 0;
const ok = (c, msg) => { if (c) oks++; else { fails++; console.log('FAIL ' + msg); } };
const finite = W => W.units.every(u => Number.isFinite(u.hp) && Number.isFinite(u.mana) && Number.isFinite(u.atk));

// content counts asked for in the brief
ok(Object.keys(HEROES).length >= 10, 'at least 10 heroes');
ok(ITEMS.length >= 50, 'at least 50 items');
ok(RELICS.length >= 20, 'at least 20 relics');
ok(Object.keys(B.MOBS).length >= 8, 'several mob types');
ok(new Set(ITEMS.map(i => i.id)).size === ITEMS.length, 'item ids unique');
ok(new Set(RELICS.map(i => i.id)).size === RELICS.length, 'relic ids unique');
for (const k in HEROES) {
  const h = HEROES[k];
  ok(h.specs.length === 4 && h.specs.every(p => p.length === 2), k + ': 4 spec pairs (Lv 2..5)');
  ok(Sim.abilities[h.abil], k + ': ability implemented');
}
const specIds = Object.values(HEROES).flatMap(h => h.specs.flat().map(s => s.id));
ok(new Set(specIds).size === specIds.length, 'spec ids unique');

// hex math
ok(Hex.dist({ c: 0, r: 0 }, { c: 7, r: 7 }) > 0, 'hex distance');
ok(Hex.neighbors(3, 3).length === 6 && Hex.neighbors(0, 0).length < 6, 'hex neighbors');

// smooth movement contract: a melee unit that walks and then attacks starts its windup on the exact tick it lands
{
  const d = Sim.mobScaleDef('grunt', 1);
  const W = Sim.create({ seed: 3, heroes: [{ def: Object.assign({}, d, { kind: 'hero' }), c: 3, r: 7 }], enemies: [{ def: d, c: 3, r: 0 }] });
  const a = W.units[0]; let lastLand = -1, firstAtk = -1;
  while (!W.over && W.t < 400) {
    Sim.step(W);
    if (a.m1t > a.m0t && a.m1t === W.t) lastLand = W.t;
    if (a.anim && firstAtk < 0) firstAtk = a.anim.t0;
    if (firstAtk >= 0) break;
  }
  ok(firstAtk > 0 && (firstAtk === lastLand || firstAtk === Math.max(lastLand, 0)), `attack starts on landing tick (land ${lastLand}, attack ${firstAtk})`);
  // interpolation is continuous between hexes
  const p0 = Sim.posAt({ fc: 0, fr: 4, c: 1, r: 4, m0t: 10, m1t: 20 }, 15, 20), pa = B.Hex.px(0, 4, 20), pb = B.Hex.px(1, 4, 20);
  ok(Math.abs(p0.x - (pa.x + pb.x) / 2) < 0.01, 'halfway position is interpolated');
}

// every hero, every spec path, 3-hero teams, fights end without NaN or exceptions
{
  const keys = Object.keys(HEROES);
  let crashed = 0;
  for (let i = 0; i < keys.length; i++) for (const path of [0, 1]) {
    try {
      const run = Run.newRun(50 + i * 2 + path);
      Run.pickStart(run, [keys[i], keys[(i + 1) % keys.length]]); Run.addHero(run, keys[(i + 5) % keys.length]);
      for (const h of run.heroes) { h.lvl = 5; h.specs = HEROES[h.key].specs.map(p => p[path].id); }
      run.heroes.forEach((h, j) => { h.items = ITEMS.slice((i * 7 + j * 4) % 50, (i * 7 + j * 4) % 50 + 4).map(x => x.id); });
      run.relics = RELICS.slice((i * 3) % 20, (i * 3) % 20 + 5).map(r => r.id);
      run.cur = Run.makeFight(run, i % 3 ? 'hard' : 'boss', 1 + (i % 6));
      const W = Run.fightWorld(run); Sim.run(W, 20 * 200);
      ok(W.over, `${keys[i]} path ${path}: fight ends`);
      ok(finite(W), `${keys[i]} path ${path}: no NaN`);
      const me = W.units.find(u => u.key === keys[i]);
      ok(me.xpT > 0, `${keys[i]} gains XP while alive`);
    } catch (e) { crashed++; console.log('CRASH', keys[i], path, e.stack.split('\n').slice(0, 3).join(' | ')); }
  }
  ok(crashed === 0, 'no crashes across hero/spec/item/relic combos');
}

// every item and relic alone on a hero: no exception, no NaN
for (const it of ITEMS) {
  const run = Run.newRun(9); Run.pickStart(run, ['kestrel', 'bastion']); run.heroes[0].items = [it.id];
  run.cur = Run.makeFight(run, 'medium', 2);
  try { const W = Run.fightWorld(run); Sim.run(W, 20 * 160); ok(finite(W) && W.over, 'item ' + it.id); } catch (e) { ok(false, 'item ' + it.id + ': ' + e.message); }
}
for (const r of RELICS) {
  const run = Run.newRun(11); Run.pickStart(run, ['pyra', 'grimhook']); Run.gainRelic(run, r.id);
  run.cur = Run.makeFight(run, 'medium', 2);
  try { const W = Run.fightWorld(run); Sim.run(W, 20 * 160); ok(finite(W) && W.over, 'relic ' + r.id); } catch (e) { ok(false, 'relic ' + r.id + ': ' + e.message); }
}

// determinism
{
  const make = () => { const run = Run.newRun(77); Run.pickStart(run, ['vex', 'lumen']); run.cur = Run.makeFight(run, 'hard', 2); const W = Run.fightWorld(run); Sim.run(W); return W.t + ':' + W.units.map(u => Math.round(u.hp)).join(','); };
  ok(make() === make(), 'same seed, same fight');
}

// run structure: 2 options per step, bosses at fights 3 and 6 with a single option, final shop, onslaught
{
  const run = Run.newRun(5); Run.pickStart(run, run.startOffer.slice(0, 2));
  const seen = [];
  for (let i = 0; i < CFG.seq.length; i++) {
    const t = CFG.seq[run.step]; seen.push(t + run.opts.length);
    if (t === 'O') break;
    Run.choose(run, 0);
    if (run.phase === 'deploy') { const W = Run.fightWorld(run); W.over = true; W.winner = 0; Run.finishFight(run, W); }
    else if (run.phase === 'shop' || run.phase === 'event') Run.leave(run);
    while (run.pending.length) Run.chooseSpec(run, 0);
  }
  ok(seen.join(' ') === 'F2 X2 F2 X2 B1 X2 F2 X2 F2 X2 B1 S2 O1', 'node sequence ' + seen.join(' '));
  ok(run.fightNo === 6, 'six fights before the onslaught');
}

// onslaught: waves every 10s on the top row, 1 point per kill, ends when heroes die
{
  const run = Run.newRun(21); Run.pickStart(run, ['bastion', 'kestrel']); Run.addHero(run, 'pyra');
  run.cur = { type: 'onslaught' };
  const W = Run.onslaughtWorld(run);
  let firstRows = null;
  while (!W.over && W.t < 20 * 900) {
    Sim.step(W);
    if (W.wave === 1 && !firstRows) firstRows = W.units.filter(u => u.side === 1).map(u => u.r);
  }
  ok(W.over, 'onslaught ends when the heroes fall (wave ' + W.wave + ', kills ' + W.kills + ')');
  ok(firstRows && firstRows.every(r => r === 0), 'first wave spawns on the top row');
  ok(W.wave >= 2 && W.kills > 0, 'several waves and some kills');
}

// shops, items, levels
{
  const run = Run.newRun(31); Run.pickStart(run, ['brakk', 'morrow']);
  run.gold = 100; run.cur = Run.leave ? null : null;
  run.cur = { type: 'shop', kind: 'itemShop', stock: [{ kind: 'item', id: 'longsword', price: 3 }], rerolls: 0 };
  ok(Run.buy(run, 0) === null && run.bag.includes('longsword') && run.gold === 97, 'buy item');
  ok(Run.equip(run, 0, run.heroes[0].uid) === null && run.heroes[0].items.length === 1, 'equip in the base slot');
  run.bag.push('chainmail');
  ok(Run.equip(run, 0, run.heroes[0].uid) !== null, 'Lv 1 has a single slot');
  Run.gainXp(run, run.heroes[0], CFG.xpLevels[3]);
  ok(run.heroes[0].lvl === 3 && run.pending.length === 2, 'XP levels up twice and queues 2 spec choices');
  ok(Run.slots(run, run.heroes[0]) === 2, 'Lv 3 adds an item slot');
  Run.chooseSpec(run, 1); Run.chooseSpec(run, 0);
  ok(run.heroes[0].specs.length === 2, 'specs chosen');
  const d3 = Run.heroDef(run, run.heroes[0]); run.heroes[0].lvl = 1; const d1 = Run.heroDef(run, run.heroes[0]);
  ok(d3.hp > d1.hp && d3.atk > d1.atk, 'levels raise stats');
}

// v5: passive scaling actually grows during a fight
{
  const grew = (key, fn, secs = 12, diff = 'hard', n = 4) => {
    const run = Run.newRun(88); Run.pickStart(run, [key, 'bastion']);
    run.cur = Run.makeFight(run, diff, n);
    const W = Run.fightWorld(run), u = W.units.find(x => x.key === key), before = fn(W, u);
    for (let i = 0; i < secs * 20 && !W.over; i++) Sim.step(W);
    return fn(W, u) > before;
  };
  ok(grew('thorne', (W, u) => Sim.atkOf(W, u)), 'Thorne: attack grows per hit');
  ok(grew('seraph', (W, u) => Sim.armorOf(W, u)), 'Seraph: armor grows every second');
  ok(grew('bramble', (W, u) => u.maxHp), 'Bramble: max HP grows every second');
  ok(grew('nyx', (W, u) => Sim.atkOf(W, u), 25, 'easy', 1), 'Nyx: attack grows when enemies die nearby');
  ok(grew('blaze', (W, u) => u.crit, 25), 'Blaze: crit chance grows on crits');
  ok(grew('echo', (W, u) => W.units.filter(a => a.side === 0).reduce((t, a) => t + Sim.asOf(W, a), 0)), 'Echo: allies attack faster over time');
  ok(CFG.maxTeam === 3, 'team size is 3');
}
console.log(`motor: ${oks} ok, ${fails} fail`);
process.exit(fails ? 1 : 0);
