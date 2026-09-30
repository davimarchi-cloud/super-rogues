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

// run structure (review #22): 2 options per step, bosses at fights 4 and 8 with a single option, final shop, then the gauntlet
{
  const run = Run.newRun(5); Run.pickStart(run, run.startOffer.slice(0, 2));
  const seen = [];
  for (let i = 0; i < CFG.seq.length; i++) {
    const t = CFG.seq[run.step]; seen.push(t + run.opts.length);
    if (t === 'G') break;
    Run.choose(run, 0);
    if (run.phase === 'deploy') { const W = Run.fightWorld(run); W.over = true; W.winner = 0; Run.finishFight(run, W); }
    else if (run.phase === 'shop' || run.phase === 'event') Run.leave(run);
    while (run.pending.length) Run.chooseSpec(run, 0);
  }
  ok(seen.join(' ') === 'F2 X2 F2 X2 F2 X2 B1 X2 F2 X2 F2 X2 F2 X2 B1 S2 G0' && run.phase === 'gauntlet', 'node sequence ' + seen.join(' '));
  ok(run.fightNo === 8, 'eight fights before the gauntlet');
}
// review #22: 1 hero and 1 relic at the start, the hero shop is offered while you have a single hero, old runs keep 13 steps
{
  const run = Run.newRun(77);
  ok(run.startOffer.length === 3 && run.relicOffer.length === 3 && run.relicOffer.every(id => B.RELIC[id]), '3 heroes and 3 relics offered');
  Run.pickStart(run, [run.startOffer[1]], run.relicOffer[2]);
  ok(run.heroes.length === 1 && run.heroes[0].key === run.startOffer[1] && run.relics.includes(run.relicOffer[2]), 'the run starts with the chosen hero and relic');
  Run.choose(run, 0); const W = Run.fightWorld(run); W.over = true; W.winner = 0; Run.finishFight(run, W); while (run.pending.length) Run.chooseSpec(run, 0);
  ok(run.opts.some(o => o.kind === 'heroShop'), 'with a single hero, the first shop/event step offers the Hero Shop');
  const b1 = Run.makeFight(run, 'boss', 4, 1), b2 = Run.makeFight(run, 'boss', 8, 2);
  ok(b1.enemies.some(e => e.key === 'gorewarden') && b2.enemies.some(e => e.key === 'hollowking') && b1.scale === CFG.fightScale[4] && b2.scale === CFG.fightScale[8] && b2.scale > b1.scale, `bosses at fights 4 and 8 (scale ${b1.scale} and ${b2.scale})`);
  const old = Run.migrate({ v: 4, step: 4, heroes: [], bag: [], relics: [], fightNo: 2 });
  ok(old.v === 5 && old.seq.length === 13 && old.seq[4] === 'B' && old.fightScale[3] === 1.3, 'a run saved before this change keeps its 13 steps and scale');
}

// review #9: the Onslaught is gone
ok(!B.RELIC.onslaught && !Run.onslaughtWorld && !B.CFG.seq.includes('O'), 'no Onslaught left (mode, relic, node)');

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

// itemization v16 (the owner: "items divided by type and rarity, like Obsidian Knight")
{
  const T = new Set(B.TYPES.map(t => t.id)), RR = new Set(B.RARITIES.map(r => r.id));
  ok(B.ITEMS.length >= 120 && B.ITEMS.every(i => T.has(i.type) && RR.has(i.tier) && CFG.itemCost[i.tier] > 0), `every item has a type, a rarity and a price (${B.ITEMS.length} items)`);
  ok(B.TYPES.every(t => ['common', 'uncommon', 'rare', 'legendary', 'mythic', 'set'].every(r => B.ITEMS.some(i => i.type === t.id && i.tier === r))), 'every type has common, uncommon, rare, set, legendary and mythic items');
  ok(Object.values(B.SETS).length >= 5 && Object.values(B.SETS).every(S => S.pieces.length === 3 && new Set(S.pieces.map(id => B.ITEM[id].type)).size === 3), 'each set has 3 pieces in 3 different slots');
  ok(B.ITEMS.every(i => B.Icons ? true : true) && new Set(B.ITEMS.map(i => i.id)).size === B.ITEMS.length, 'item ids are unique');
  const run = Run.newRun(5); Run.pickStart(run, ['brakk', 'morrow']); const h = run.heroes[0]; h.lvl = 5;
  run.bag.push('longsword', 'bloodthirster');
  ok(Run.equip(run, 0, h.uid) === null && Run.equip(run, 0, h.uid) === null && h.items.join() === 'bloodthirster' && run.bag.join() === 'longsword', 'a second weapon swaps with the one worn (one item per type)');
  ok(Run.canEquip(run, h, 'longsword') && Run.canEquip(run, h, 'chainmail'), 'a free slot or a same-type swap can always be equipped');
  h.items = ['longsword', 'chainmail', 'cap', 'boots']; run.bag = ['tear'];
  ok(Run.equip(run, 0, h.uid) !== null && Run.canEquip(run, h, 'dagger'), 'Lv 5 with 4 items: a new type needs a free slot, a swap does not');
  h.items = [];
  const m0 = Run.heroMods(run, h);
  h.items = ['obs_helm', 'obs_plate'];
  const m2 = Run.heroMods(run, h);
  ok(Math.round((m2.armor || 0) - (m0.armor || 0)) === 20 + 25 + 25 && Run.setBonuses(h.items).length === 1, 'Nightglass Guard 2 pieces: +25 armor on top of the pieces');
  h.items.push('obs_blade');
  const m3 = Run.heroMods(run, h);
  ok(m3.shieldStartPct >= 0.2 && m3.thorns >= 0.25 && Run.setBonuses(h.items).length === 2, 'Nightglass Guard 3 pieces: shield, thorns and attack');
  h.items = ['lightningrod', 'storm_gloves', 'storm_boots', 'storm_sigil'];
  const ms = Run.heroMods(run, h);
  ok(ms.chainEvery === 3 && ms.chainTargets === 3 && ms.chainDmg === 0.5, `two chain sources keep the best of each part (every ${ms.chainEvery}, ${ms.chainTargets} targets), not the sum`);
  const set3 = Run.newRun(6); Run.pickStart(set3, ['kestrel', 'bastion']); set3.heroes[0].lvl = 4; set3.heroes[0].items = ['rg_hood', 'rg_quiver', 'rg_boots'];
  set3.cur = Run.makeFight(set3, 'easy', 1);
  const W = Run.fightWorld(set3); const k = W.units.find(u => u.uid === set3.heroes[0].uid);
  ok(k.range === B.HEROES.kestrel.range + 1 && k.m.multishot === 0.5, 'Ranger set reaches the fight: +1 range and multishot');
  const old = { v: 3, heroes: [{ uid: 1, items: ['longsword', 'bloodthirster', 'chainmail'] }], bag: [], relics: [] };
  const mig = Run.migrate(old);
  ok(mig.v >= 4 && mig.heroes[0].items.join() === 'longsword,chainmail' && mig.bag.join() === 'bloodthirster', 'old saves: a second item of a type goes back to the bag');
  let late = 0, early = 0;
  for (let s = 0; s < 60; s++) {
    const r = Run.newRun(s); Run.pickStart(r, ['brakk', 'morrow']);
    r.fightNo = 1; r.cur = Run.makeShop ? null : null;
    for (const [n, add] of [[1, x => { early += x; }], [5, x => { late += x; }]]) {
      r.fightNo = n; r.phase = 'map'; r.opts = [{ type: 'shop', kind: 'itemShop' }]; Run.choose(r, 0);
      add(r.cur.stock.filter(x => ['legendary', 'mythic'].includes(B.ITEM[x.id].tier)).length);
    }
  }
  ok(early === 0 && late > 0, `legendary and mythic items only show up after the first fights (early ${early}, late ${late})`);
}

// review #15 (David): a gauntlet ghost fights with the items and relics its player had
{
  const other = Run.newRun(321); Run.pickStart(other, ['bastion', 'kestrel']);
  other.heroes[0].items = ['warmog']; other.heroes[1].items = ['bloodthirster'];
  const run = Run.newRun(322); Run.pickStart(run, ['brakk', 'lumen']);
  const relics = ['tooth', 'frostsigil', 'warhorn', 'feather'];
  run.phase = 'gauntlet'; run.g = { status: 'match', history: [], round: 0, opp: { name: 'X', elo: 1000, team: Run.teamSnapshot(other), relics } };
  run.cur = { type: 'gauntlet' };
  const W = Run.gauntletWorld(run);
  const ghost = W.units.filter(u => u.side === 1), mine = W.units.filter(u => u.side === 0);
  const exp = Run.heroDef({ relics }, other.heroes[0]);
  ok(ghost.length === 2 && Math.round(ghost.find(u => u.key === 'bastion').maxHp) === Math.round(exp.hp) && ghost.find(u => u.key === 'bastion').m.hp >= 400 + 150, 'ghost heroes wear their items and stat relics (Warmog + Giant Tooth)');
  ok(mine.every(u => u.st.slowU > W.t) && ghost.every(u => u.buffs.some(b => b.s === 'asPct' && b.v === 0.3)) && !mine.some(u => u.buffs.some(b => b.s === 'asPct' && b.v === 0.3)), "the ghost's team relics work for the ghost: its Frost Sigil slows us, its War Horn speeds up its own heroes");
  for (const u of ghost) u.hp = 5;  // so a ghost hero surely dies
  let phoenix = 0; for (let k = 0; k < 20 * 90 && !W.over; k++) { Sim.step(W); for (const f of W.fx) if (f.k === 'text' && f.text === 'ASHEN PLUME' && W.byId[f.id] && W.byId[f.id].side === 1) phoenix = 1; }
  ok(phoenix && W.once.feather1 && !W.once.feather, "the ghost's Ashen Plume revives one of its heroes (ours was not used)");
  const plain = Run.newRun(323); Run.pickStart(plain, ['brakk', 'lumen']); plain.relics = ['frostsigil']; plain.cur = Run.makeFight(plain, 'easy', 1);
  const P = Run.fightWorld(plain);
  ok(P.units.filter(u => u.side === 1).every(u => u.st.slowU > P.t) && P.units.filter(u => u.side === 0).every(u => !(u.st.slowU > P.t)), 'our Frost Sigil still slows the enemies in normal fights');
}

// review #17 (David: "the pink events are kinda bad ... more strategic depth")
{
  const fresh = (seed, id) => {
    const run = Run.newRun(seed); Run.pickStart(run, ['brakk', 'lumen']); run.gold = 50; run.fightNo = 2;
    run.heroes[0].lvl = 3; run.heroes[0].specs = [B.HEROES.brakk.specs[0][0].id, B.HEROES.brakk.specs[1][0].id];
    run.heroes[0].items = ['longsword', 'chainmail']; run.bag = ['cap', 'bloodthirster', 'obs_helm'];
    run.phase = 'map'; run.opts = [{ type: 'event', id }]; Run.choose(run, 0); return run;
  };
  let all = 0, bad = [];
  ok(B.EVENTS.length >= 16, `${B.EVENTS.length} events`);
  for (const e of B.EVENTS) {
    const n = Run.eventChoices(fresh(1, e.id)).length;
    if (n < 3 || n > 4) bad.push(e.id + ' has ' + n);
    for (let i = 0; i < n; i++) {
      const probe = fresh(2, e.id), ch = Run.eventChoices(probe)[i];
      const targets = ch.target ? Run.eventTargets(probe, ch).map(t => t.arg) : [undefined];
      for (const arg of targets) {
        const run = fresh(3, e.id); let msg;
        try { msg = Run.eventAct(run, i, arg); } catch (err) { bad.push(`${e.id}#${i} ${arg}: ${err.message}`); continue; }
        all++;
        // v44: a challenge (or the Mimic) starts a fight instead of a written result
        if (msg === 'fight' || msg === 'mimic') { if (run.phase !== 'deploy' || !run.cur.challenge || !run.cur.enemies.length) bad.push(`${e.id}#${i}: the challenge did not start`); }
        else if (!msg || !run.cur.done) bad.push(`${e.id}#${i} ${arg}: no result`);
        if (!Number.isFinite(run.gold) || run.gold < 0) bad.push(`${e.id}#${i}: gold ${run.gold}`);
        if (run.bag.some(id => !B.ITEM[id]) || run.heroes.some(h => h.items.some(id => !B.ITEM[id]))) bad.push(`${e.id}#${i}: unknown item`);
      }
    }
  }
  ok(!bad.length && all > 60, `every event choice with every valid target resolves (${all} tried)` + (bad.length ? ': ' + bad.slice(0, 4).join(' | ') : ''));
  // targeted XP goes to the chosen hero only
  let run = fresh(4, 'training'); const lu = run.heroes[1], xp0 = lu.xp, bx0 = run.heroes[0].xp, lessons = +Run.eventChoices(run)[1].act.split(':')[1];
  Run.eventAct(run, 1, String(lu.uid));
  ok(lu.xp === xp0 + lessons && lessons === Math.round(70 * 1.15) && run.heroes[0].xp === bx0, `Private lessons: the XP (${lessons}, 70 grown 15% after fight 2) goes to the hero you choose`);
  // reforge keeps the type and raises the rarity
  run = fresh(5, 'smith'); Run.eventAct(run, 2, 'b:0');
  ok(B.ITEM[run.bag[0]].type === 'helmet' && B.ITEM[run.bag[0]].tier === 'rare' && run.gold === 45, `Reforge: Scout's Cap (uncommon helmet) became ${B.ITEM[run.bag[0]].name} (rare helmet) for 5 gold`);
  run = fresh(5, 'smith'); Run.eventAct(run, 2, 'h:' + run.heroes[0].uid + ':0');
  ok(B.ITEM[run.heroes[0].items[0]].type === 'weapon' && B.ITEM[run.heroes[0].items[0]].tier === 'uncommon', 'Reforge works on a worn item too, and it stays equipped');
  // respec swaps the latest specialization for the other one of its pair
  run = fresh(6, 'library'); const was = run.heroes[0].specs[1]; Run.eventAct(run, 1, String(run.heroes[0].uid));
  ok(run.heroes[0].specs[1] === B.HEROES.brakk.specs[1][1].id && was === B.HEROES.brakk.specs[1][0].id && run.heroes[0].specs[0] === B.HEROES.brakk.specs[0][0].id, 'Forbidden tome: the latest specialization is swapped');
  ok(!Run.canChoose(fresh(6, 'library'), { act: 'respec', target: 'hero' }).ok === false, 'respec is available when a hero has a specialization');
  // shrine: only rare+ items can be offered
  run = fresh(7, 'shrine'); const offer = Run.eventTargets(run, Run.eventChoices(run)[1]).map(t => t.id);
  ok(offer.includes('bloodthirster') && offer.includes('obs_helm') && !offer.includes('cap') && !offer.includes('longsword'), 'Shrine: only rare or better items can be offered');
  // not enough gold / full team give a reason
  run = fresh(8, 'gambler'); run.gold = 3;
  ok(Run.canChoose(run, Run.eventChoices(run)[0]).why === 'Needs 5 gold' && Run.eventAct(run, 0) === null, 'a choice you cannot afford is refused, with the reason');
  run = fresh(9, 'mercs'); Run.addHero(run, Object.keys(B.HEROES).find(k => !run.heroes.some(h => h.key === k)));
  ok(/full/.test(Run.canChoose(run, Run.eventChoices(run)[0]).why) && Run.canChoose(run, Run.eventChoices(run)[2]).ok, 'Mercenary Camp: hiring needs room in the team, sparring does not');
  run = fresh(9, 'mercs'); const hk = Run.eventChoices(run)[1].hero; Run.eventAct(run, 1);
  ok(run.heroes.length === 3 && run.heroes[2].key === hk && run.gold === 44, 'Mercenary Camp: the named hero joins for 6 gold');
  // armory: 3 items of 3 different types, take one
  run = fresh(10, 'armory'); const offerItems = Run.eventChoices(run).map(c => c.item);
  ok(new Set(offerItems.map(id => B.ITEM[id].type)).size === 3, 'Armory: 3 items of 3 different types');
  Run.eventAct(run, 2); ok(run.bag.includes(offerItems[2]), 'Armory: you take the one you pick');
  // collector completes a set you started
  run = fresh(11, 'collector'); Run.eventAct(run, 0);
  ok(['obs_blade', 'obs_plate'].includes(run.bag[run.bag.length - 1]), 'Collector: a missing piece of the set you own (Nightglass Guard)');
  // next-fight modifiers reach the fight, then wear off
  run = fresh(12, 'scout'); Run.eventAct(run, 0);
  ok(run.nextMod && run.nextMod.enemyHp === -0.2, 'Scout: the ambush is stored for the next fight');
  run.phase = 'map'; run.cur = null; run.opts = [Run.makeFight(run, 'easy', 2)];
  const base = Run.makeFight(run, 'easy', 2); Run.choose(run, 0);
  const W = Run.fightWorld(run), plainHp = B.Sim.mobScaleDef(run.cur.enemies[0].key, run.cur.scale).hp;
  const e0 = W.units.find(u => u.side === 1 && !u.elite);
  ok(run.cur.mod && !run.nextMod && e0 && Math.abs(e0.maxHp - Math.round(plainHp * 0.8)) <= 1 || (e0 && e0.elite), `the ambush weakens the next fight's enemies (${e0 && e0.maxHp} vs ${Math.round(plainHp)})`);
  run = fresh(13, 'arena'); Run.eventAct(run, 0); run.phase = 'map'; run.cur = null; run.opts = [Run.makeFight(run, 'medium', 2)]; Run.choose(run, 0);
  const g0 = run.gold, res = Run.finishFight(run, { winner: 0, units: [], kills: 0 });
  ok(res.prize && B.ITEM[res.prize].tier === 'legendary' && run.bag.includes(res.prize) && run.gold > g0, `Arena: winning the harder fight pays a legendary item (${res.prize && B.ITEM[res.prize].name})`);
  run = fresh(14, 'library'); Run.eventAct(run, 0); run.phase = 'map'; run.cur = null; run.opts = [Run.makeFight(run, 'easy', 2)]; Run.choose(run, 0);
  const WL = Run.fightWorld(run); const hb = WL.units.find(u => u.side === 0 && u.key === 'lumen');
  ok(hb.mana >= Math.min(hb.maxMana, 40), 'Battle tactics: your heroes start the next fight with +40 mana');
  // ---- v44 (review #54): rewards grow with the run, blue options, challenges, investments, transmute, rarity
  run = fresh(16, 'training'); run.fightNo = 5;
  ok(/\+40 XP to all heroes/.test(Run.eventChoices(run)[0].label) && Run.eventChoices(run)[0].act === 'xpAll:40', 'rewards grow: +25 XP after fight 1 is +40 after fight 5');
  run = fresh(17, 'scout'); ok(Run.canChoose(run, Run.eventChoices(run)[3]).ok, 'a team with a ranged hero (Brigid) can take the archer choice');
  run.heroes = run.heroes.filter(h => h.key === 'brakk');
  ok(Run.canChoose(run, Run.eventChoices(run)[3]).why === 'Needs a ranged hero' && Run.eventAct(run, 3) === null, 'a melee-only team cannot: "Needs a ranged hero"');
  run = fresh(18, 'library'); ok(Run.eventTargets(run, Run.eventChoices(run)[3]).map(t => t.uid).join() === String(run.heroes.find(h => h.key === 'lumen').uid), 'a caster choice targets only the casters');
  run = fresh(19, 'bounty'); const g19 = run.gold; Run.eventAct(run, 0);
  ok(run.phase === 'deploy' && run.cur.challenge && run.cur.challenge.name === 'Elite Pack' && run.cur.enemies.some(e => e.elite) && run.fightNo === 2, 'Bounty Board: the elite pack challenge starts right away (the fight count does not move)');
  let rs = Run.finishFight(run, { winner: 0, units: [], kills: 0 });
  ok(rs.challenge && rs.relic && run.relics.includes(rs.relic) && run.gold > g19 && run.phase === 'map', `won: a relic (${rs.relic}) and gold, then the run goes on`);
  run = fresh(20, 'caravan'); Run.eventAct(run, 2); rs = Run.finishFight(run, { winner: 1, units: [], kills: 0 });
  ok(!rs.win && run.phase === 'map' && run.phase !== 'over' && !rs.prize, 'a lost challenge does not end the run');
  run = fresh(21, 'arena'); Run.eventAct(run, 1, String(run.heroes[1].uid));
  const WS = Run.fightWorld(run); ok(run.cur.solo === run.heroes[1].uid && WS.units.filter(u => u.side === 0).length === 1 && WS.units.filter(u => u.side === 1).length === 1, 'Duel of champions: only the chosen hero fights, against one champion');
  const hp21 = run.heroes[1].bonus.hpPct || 0; rs = Run.finishFight(run, { winner: 0, units: [], kills: 0 });
  ok(Math.abs((run.heroes[1].bonus.hpPct || 0) - hp21 - 0.15) < 1e-9 && rs.boost && rs.bonusXp > 0, 'won the duel: +15% HP and attack for good and bonus XP');
  run = fresh(22, 'lender'); Run.eventAct(run, 0); const back = run.bank[0];
  run.phase = 'map'; run.cur = null; run.opts = [Run.makeFight(run, 'easy', 3)]; Run.choose(run, 0); const g22 = run.gold; rs = Run.finishFight(run, { winner: 0, units: [], kills: 0 });
  ok(back === Math.round(18 * 1.15) && rs.bank === back && run.gold === g22 + rs.gold + back && !run.bank.length, `Moneylender: 8 gold in, ${back} back after the next won fight`);
  run = fresh(23, 'lender'); const g23 = run.gold; Run.eventAct(run, 2);
  ok(run.gold === g23 + Math.round(15 * 1.15) && run.bank[0] === -Math.round(24 * 1.15), 'a loan: gold now, a debt paid on the next win');
  run = fresh(24, 'alchemist'); const n24 = Run.itemRefs(run).length; Run.eventAct(run, 0);
  ok(Run.itemRefs(run).length === n24 - 1 && B.ITEM[run.bag[run.bag.length - 1]].tier === 'uncommon' && !run.heroes[0].items.length, `Transmute: the two weakest items (the common sword and mail) became one uncommon item (${B.ITEM[run.bag[run.bag.length - 1]].name})`);
  run = Run.newRun(25); run.fightNo = 1; const firsts = new Set(); for (let i = 0; i < 40; i++) firsts.add(Run.pickEvent(run));
  ok(!firsts.has('hoard') || run.evSeen.indexOf('hoard') > B.EVENTS.length - 2, "the Dragon's Hoard is not offered after the first fight");
  run = Run.newRun(26); run.fightNo = 5; const picks = Array.from({ length: B.EVENTS.length }, () => Run.pickEvent(run));
  ok(new Set(picks).size === B.EVENTS.length, `no event is offered twice in a run (${B.EVENTS.length} different in ${B.EVENTS.length} picks)`);
  run = fresh(27, 'fairy'); const lv27 = run.heroes.map(h => h.lvl); Run.eventAct(run, 0);
  ok(run.heroes.every((h, i) => h.lvl === Math.min(5, lv27[i] + 1)), 'Fairy Ring: every hero gains a level');
  // old saved runs: an event opened before this change still works
  run = fresh(15, 'mercs'); delete run.cur.offer;
  ok(Run.eventChoices(run).length === 3 && run.cur.offer.heroes.length === 2, 'an event saved without an offer rolls one when opened');
}

// review #24: sudden death burns every unit (1%, 2%, ... of max HP per second); crowd control and executes work on bosses
{
  const hd = Run.heroDef({ relics: [] }, { key: 'bastion', lvl: 1, specs: [], items: [], bonus: {} });
  const W = Sim.create({ mode: 'fight', seed: 3, heroes: [{ def: hd, c: 0, r: 7 }], enemies: [{ def: Sim.mobScaleDef('brute', 1), c: 7, r: 0 }] });
  const [h, m] = W.units; for (const u of W.units) { u.st.stun = 1e9; u.m.regen = 0; }
  W.t = Sim.sec(CFG.suddenDeath) - 1; const h0 = h.hp, m0 = m.hp;
  for (let i = 0; i < Sim.TPS * 2 + 1; i++) Sim.step(W);
  ok(Math.round(h0 - h.hp) === Math.round(h.maxHp * 0.03) && Math.round(m0 - m.hp) === Math.round(m.maxHp * 0.03), `sudden death: both sides burn 1% then 2% of max HP (hero -${Math.round(h0 - h.hp)}, enemy -${Math.round(m0 - m.hp)})`);
  const B2 = Sim.create({ mode: 'fight', seed: 4, noStart: true, heroes: [{ def: Run.heroDef({ relics: [] }, { key: 'vex', lvl: 1, specs: [], items: [], bonus: {} }), c: 3, r: 6 }], enemies: [{ def: Sim.mobScaleDef('gorewarden', 1.3), c: 3, r: 2 }] });
  const vx = B2.units[0], boss = B2.units[1];
  Sim.cc(B2, boss, 'stun', 2);
  ok(boss.boss && boss.st.stun - B2.t === Sim.sec(2), 'a boss is stunned for the full duration (no longer halved)');
  boss.st.stun = 0; boss.hp = boss.maxHp * 0.1; vx.ab = Object.assign({}, vx.ab, { execute: 0.2 });
  Sim.abilities.shadowstep(B2, vx);
  ok(boss.dead, 'executes work on bosses');
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
// v6: gauntlet duel = our team vs a stored team, mirrored into the top rows
{
  const other = Run.newRun(123); Run.pickStart(other, ['bastion', 'kestrel']); Run.addHero(other, 'pyra');
  const run = Run.newRun(124); Run.pickStart(run, ['brakk', 'lumen']); Run.addHero(run, 'tempest');
  run.phase = 'gauntlet'; run.g = { status: 'match', history: [], round: 0, opp: { name: 'X', elo: 1000, team: Run.teamSnapshot(other), relics: ['drum'] } };
  ok(Run.migrate({ v: 2, step: 12, phase: 'deploy', cur: { type: 'onslaught' }, relics: ['onslaught', 'drum'], opts: [] }).phase === 'gauntlet', 'a saved run standing at the old Onslaught moves to the gauntlet');
  run.cur = { type: 'gauntlet' };
  const W = Run.gauntletWorld(run); Sim.run(W, 20 * 200);
  const foes = W.units.filter(u => u.side === 1 && u.kind === 'hero');
  ok(foes.length === 3 && W.over && finite(W), 'gauntlet duel runs to the end');
  const W0 = Run.gauntletWorld(run, true);
  ok(W0.units.filter(u => u.side === 1).every(u => u.r <= 3), 'their team stands in the top rows');
  Run.gauntletUpdate(run, { elo: 1016, delta: 16, win: true, wins: 1, teamId: 5, champion: true, over: true });
  ok(run.phase === 'over' && run.result === 'gauntlet' && run.g.status === 'champion' && run.g.history.length === 1, 'crowned champion ends the run');
  const r2 = Run.newRun(5); Run.pickStart(r2, ['vex', 'rook']); r2.cur = Run.makeFight(r2, 'hard', 2);
  const W2 = Run.fightWorld(r2); W2.over = true; W2.winner = 1; Run.finishFight(r2, W2);
  ok(r2.phase === 'over' && r2.result === 'defeat', 'no hearts: one lost fight ends the run');
}
// v12 (review #11): new mechanics work as described
{
  const W0 = (heroKey, enemies) => { const run = Run.newRun(99); Run.pickStart(run, [heroKey, 'bastion']); const h = run.heroes[0]; h.pos = { c: 3, r: 4 }; run.heroes[1].pos = { c: 0, r: 7 };
    return Sim.create({ seed: 3, noStart: true, heroes: run.heroes.map(x => ({ def: Run.heroDef(run, x), c: x.pos.c, r: x.pos.r })), enemies: enemies.map(([k, c, r]) => ({ def: Sim.mobScaleDef(k, 1), c, r })) }); };
  // hypnosis: a hypnotized enemy targets its own ally
  let W = W0('vey', [['grunt', 3, 2], ['grunt', 4, 2], ['grunt', 3, 1]]); let u = W.units[0];
  Sim.abilities.hypnosis(W, u);
  const g = W.units.find(x => x.side === 1 && x.st.confuseU > W.t);
  ok(g && (() => { Sim.step(W); const t = W.byId[g.tgt]; return t && t.side === 1; })(), 'Vey: hypnotized enemies attack their own allies');
  // smoke: blinded enemies miss
  W = W0('kage', [['grunt', 3, 3]]); u = W.units[0]; const e = W.units.find(x => x.side === 1);
  Sim.abilities.smoke(W, u);
  for (let i = 0; i < 30; i++) Sim.step(W);
  ok(e.st.blindU > 0, 'Kage: smoke blinds adjacent enemies');
  // gale kick pushes the target away
  W = W0('zephyr', [['grunt', 3, 3]]); u = W.units[0]; const t = W.units.find(x => x.side === 1); const d0 = B.Hex.dist(u, t);
  Sim.abilities.galekick(W, u);
  ok(B.Hex.dist(u, t) > d0, `Zephyr: the kick knocks the target back (${d0} -> ${B.Hex.dist(u, t)})`);
  // phalanx damage reduction
  W = W0('leonidas', [['brute', 3, 3]]); u = W.units[0];
  Sim.abilities.phalanx(W, u);
  ok(u.buffs.some(b => b.s === 'dr' && b.v > 0), 'Leonidas: phalanx gives damage reduction');
  // demon rage: more damage when hurt
  W = W0('azgul', [['golem', 3, 3]]); u = W.units[0];
  ok(u.m.rageDmg >= 1, 'Azgul: missing HP increases damage');
  // grok thick skull halves stuns
  ok(Run.heroDef({ relics: [] }, { key: 'grok', lvl: 1, specs: [], items: [], bonus: {} }).m.ccResist === 0.5, 'Grok: crowd control resistance');
  ok(Object.keys(HEROES).length >= 33, 'at least 33 heroes');
}
// v30 (review #28, PC boy): content locked by the account level never shows up in the player's runs
{
  const locked = B.lockedFor(1); let seenLocked = false;
  for (let sd = 1; sd <= 60 && !seenLocked; sd++) {
    const r = Run.newRun(sd, { locked });
    if (r.startOffer.some(k => locked.includes(k)) || r.relicOffer.some(k => locked.includes(k))) seenLocked = true;
    Run.pickStart(r, [r.startOffer[0]], r.relicOffer[0]);
    for (const kind of ['heroShop', 'itemShop', 'relicShop']) { r.fightNo = 9; if (Run.makeShop ? false : false) {} }
  }
  ok(!seenLocked, 'level 1: the 3 new heroes and the level relics never show up at the start');
  const r0 = Run.newRun(7); ok(Object.keys(B.HEROES).length === 36 && (r0.locked || []).length === 0, 'without a lock list (bots, old saves) everything is open');
  for (const k of ['buzzwell', 'coralie', 'stellan']) {
    const run = Run.newRun(11); Run.pickStart(run, [k]); Run.addHero(run, 'bastion');
    run.heroes.forEach(h => { h.lvl = 5; h.specs = B.HEROES[h.key].specs.map(p => p[1].id); });
    run.cur = Run.makeFight(run, 'hard', 5); const W = Run.fightWorld(run); let cast = 0; for (let t = 0; t < 20 * 90 && !W.over; t++) { Sim.step(W); if (W.units.some(u => u.key === k && u.castT)) cast = 1; }
    ok(cast && !W.units.some(u => !Number.isFinite(u.hp)), `${B.HEROES[k].name} casts ${B.HEROES[k].abName} with every spec, no NaN`);
  }
}
// ---- review #39 (David): terrain maps
{
  const key = (c, r) => Hex.key(c, r);
  for (const m of B.MAPS) {
    const bl = new Set(m.cells.map(x => key(x.c, x.r)));
    ok(m.cells.every(x => B.TERRAIN[x.k] && Hex.inside(x.c, x.r)) && bl.size === m.cells.length, `${m.name}: known terrain, inside the board, no hex twice`);
    ok(m.cells.every(x => bl.has(key(7 - x.c, 7 - x.r))), `${m.name}: point-symmetric, fair to both sides`);
    const free = Hex.all().filter(h => !bl.has(key(h.c, h.r))), seen = new Set([key(free[0].c, free[0].r)]), q = [free[0]];
    while (q.length) { const h = q.pop(); for (const n of Hex.neighbors(h.c, h.r)) { const k = key(n.c, n.r); if (!bl.has(k) && !seen.has(k)) { seen.add(k); q.push(n); } } }
    ok(seen.size === free.length, `${m.name}: every open hex can reach every other`);
  }
  // across many runs and fights: fight 1 open, bosses at the Standing Stones, the rest from the rotation; never terrain
  // on an enemy's start or a hero's hex; both fights of a step can differ
  let bad = 0, varied = 0, rot = new Set(), n = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const run = Run.newRun(seed * 7919); Run.pickStart(run, [run.startOffer[0]]); Run.addHero(run, 'rook'); Run.addHero(run, 'kestrel');
    if (seed % 2) { run.heroes[0].pos = { c: 3, r: 6 }; run.heroes[1].pos = { c: 2, r: 7 }; run.heroes[2].pos = { c: 5, r: 7 }; }  // back rows: any map fits
    else { run.heroes[1].pos = { c: 2, r: 4 }; run.heroes[2].pos = { c: 5, r: 4 }; }                                        // front row: some maps are skipped
    for (const [diff, fightNo] of [['easy', 1], ['medium', 2], ['hard', 3], ['boss', 4], ['medium', 5], ['hard', 6], ['easy', 7], ['boss', 8]]) {
      const f = Run.makeFight(run, diff, fightNo), bl = new Set((B.MAP[f.map] || { cells: [] }).cells.map(x => key(x.c, x.r))); n++;
      if (fightNo === 1 && f.map !== 'meadow') bad++;
      if (diff === 'boss' && f.map !== 'stones') bad++;
      if (diff !== 'boss' && fightNo > 1) rot.add(f.map);
      if (f.enemies.some(e => bl.has(key(e.c, e.r))) || run.heroes.some(h => bl.has(key(h.pos.c, h.pos.r)))) bad++;
      if (diff === 'medium' && Run.makeFight(run, 'hard', fightNo).map !== f.map) varied++;
    }
  }
  ok(bad === 0, `maps: fight 1 open, bosses at the Standing Stones, never on a starting hex (${bad} bad of ${n})`);
  ok(rot.size >= 5, `the other fights rotate through the maps (${rot.size} seen)`);
  ok(varied > 20, `the two fights of a step can be on different maps (${varied})`);
  // no unit ever stands on terrain; a unit walks around it; placing a hero there is refused
  const run = Run.newRun(424242); Run.pickStart(run, ['brakk']); Run.addHero(run, 'kestrel'); Run.addHero(run, 'lumen');
  run.cur = Run.makeFight(run, 'medium', 3); run.cur.map = 'pond';
  const tile = B.MAP.pond.cells.find(x => x.r >= 4);
  const before = JSON.stringify(run.heroes.map(h => h.pos)); Run.setPos(run, run.heroes[0].uid, tile.c, tile.r);
  ok(JSON.stringify(run.heroes.map(h => h.pos)) === before && Run.blockedAt(run, tile.c, tile.r), 'a hero cannot be placed on terrain');
  run.heroes[0].pos = { c: tile.c, r: tile.r };
  const W = Run.fightWorld(run);
  ok(!run.heroes.some(h => Run.blockedAt(run, h.pos.c, h.pos.r)) && W.terrain.length === B.MAP.pond.cells.length, 'a hero left on terrain (old save) is moved off before the fight');
  let onTerrain = 0; const bl = new Set(W.terrain.map(x => key(x.c, x.r)));
  while (!W.over && W.t < 20 * 150) { Sim.step(W); if (W.units.some(u => !u.dead && bl.has(key(u.c, u.r)))) onTerrain++; }
  ok(onTerrain === 0 && finite(W), 'nobody walks, blinks or is pushed onto terrain during a whole fight');
  // a push into a boulder slams: stun + damage
  const W2 = Sim.create({ mode: 'fight', seed: 3, noStart: true, terrain: [{ c: 3, r: 1, k: 'rock' }],
    heroes: [{ def: Run.heroDef(run, run.heroes[0]), c: 3, r: 3 }], enemies: [{ def: Sim.mobScaleDef('brute', 1), c: 3, r: 2 }] });
  ok(W2.occ[Hex.key(3, 1)] === -1 && W2.tk[Hex.key(3, 1)] === 'rock', 'terrain is blocked in the occupancy grid');
  const behind = Hex.neighbors(3, 2).filter(h => Hex.dist(h, { c: 3, r: 3 }) === 2).map(h => ({ c: h.c, r: h.r, k: 'rock' }));
  const run3 = Run.newRun(5); Run.pickStart(run3, ['zephyr']);
  const W3 = Sim.create({ mode: 'fight', seed: 3, noStart: true, terrain: behind, heroes: [{ def: Run.heroDef(run3, run3.heroes[0]), c: 3, r: 3 }], enemies: [{ def: Sim.mobScaleDef('brute', 1), c: 3, r: 2 }] });
  const kicker = W3.units[0], brute = W3.units[1];
  Sim.abilities.galekick(W3, kicker);
  ok(brute.c === 3 && brute.r === 2 && brute.st.stun > W3.t && W3.fx.some(f => f.text === 'SLAM'), 'a push into a boulder slams: the unit stays and is stunned');
}
// ---- review #40 (David): formation relics
{
  const run = Run.newRun(77); Run.pickStart(run, ['brakk']); Run.addHero(run, 'kestrel'); Run.addHero(run, 'lumen');
  const defs = run.heroes.map(h => Run.heroDef(run, h)), foe = { def: Sim.mobScaleDef('brute', 1), c: 3, r: 0 };
  const mk = (relics, pos, o = {}) => Sim.create(Object.assign({ mode: 'fight', seed: 9, relics, heroes: defs.map((d, i) => ({ def: JSON.parse(JSON.stringify(d)), c: pos[i][0], r: pos[i][1] })), enemies: [foe] }, o));
  const base = mk([], [[3, 4], [4, 4], [0, 7]]);
  let W = mk(['shieldwall'], [[3, 4], [4, 4], [0, 7]]);
  ok(W.units[0].armor === base.units[0].armor + 10 && W.units[1].mr === base.units[1].mr + 10 && W.units[2].armor === base.units[2].armor, 'Shieldwall: +10 armor/MR per ally next to the hero, nothing when alone');
  W = mk(['lonewolf'], [[3, 4], [4, 4], [0, 7]]);
  ok(W.units[2].crit === base.units[2].crit + 0.1 && Sim.asOf(W, W.units[2]) > Sim.asOf(base, base.units[2]) && W.units[0].crit === base.units[0].crit, 'Lone Wolf: only the hero with nobody next to it');
  W = mk(['vanguard'], [[3, 4], [5, 5], [0, 7]]);
  ok(W.units[0].shield > 0 && !W.units[1].shield && !W.units[2].shield, 'Vanguard: a shield for the front row only');
  W = mk(['rearguard'], [[3, 4], [5, 5], [0, 7]]);
  ok(Sim.atkOf(W, W.units[2]) > Sim.atkOf(base, base.units[2]) * 1.19 && W.units[2].ap > base.units[2].ap * 1.19 && Sim.atkOf(W, W.units[0]) === Sim.atkOf(base, base.units[0]), 'Rearguard: +20% attack and AP for the back row only');
  W = mk(['battleline'], [[1, 5], [3, 5], [6, 5]]); const W2 = mk(['battleline'], [[1, 5], [3, 5], [6, 6]]);
  ok(W.units.filter(u => u.side === 0).every(u => Sim.atkOf(W, u) > u.atk * 1.14) && W2.units.filter(u => u.side === 0).every(u => Sim.atkOf(W2, u) === u.atk), 'Battle Line: all in one row or nothing');
  W = mk(['cover'], [[3, 4], [5, 6], [0, 7]], { terrain: [{ c: 3, r: 5, k: 'rock' }] });
  ok(W.units[0].dodge === Math.min(0.6, base.units[0].dodge + 0.15) && W.units[1].dodge === base.units[1].dodge, 'Mossy Totem: heroes next to terrain');
  // a ghost's formation relics use its own rows (front 3, back 0)
  const G = Sim.create({ mode: 'fight', seed: 9, enemyRelics: ['vanguard'], heroes: [{ def: JSON.parse(JSON.stringify(defs[0])), c: 3, r: 7 }], enemies: defs.map((d, i) => ({ def: Object.assign(JSON.parse(JSON.stringify(d)), { uid: 0 }), c: i, r: i ? 0 : 3 })) });
  ok(G.units[1].shield > 0 && !G.units[2].shield && !G.units[0].shield, "a ghost's Vanguard shields its own front row");
  ok(Sim.formation(mk(['shieldwall'], [[3, 4], [4, 4], [0, 7]], { noStart: true }), 0).length === 2, 'the deploy screen can list the bonuses before the fight');
}
// ---- review #45: every official hero art file ships (art/<hero>/...), with an anchor per frame
{
  require('../../js/art.js'); const fs = require('fs'), path = require('path');
  for (const [key, o] of Object.entries(B.Art.OFFICIAL)) {
    const files = [o.splash, ...Object.values(o.anims).flat()].filter(Boolean);
    ok(!!B.HEROES[key] && files.every(f => fs.existsSync(path.join(__dirname, '..', '..', f))), `${B.HEROES[key] ? B.HEROES[key].name : key}: all ${files.length} art files exist`);
    ok(Object.keys(o.anims).every(k => o.axs[k] && o.axs[k].length === o.anims[k].length) && o.anims.idle && o.anims.idle.length, `${key}: an anchor for every frame, and an idle animation`);
  }
}
// ---- review #53 (David): the player's side takes 80% of the damage when the world is built with takeMul 0.8
{
  const mk = tm => { const hd = Run.heroDef({ relics: [] }, { key: 'bastion', lvl: 1, specs: [], items: [], bonus: {} });
    return Sim.create({ mode: 'fight', seed: 9, takeMul: tm, heroes: [{ def: hd, c: 3, r: 4 }], enemies: [{ def: Sim.mobScaleDef('brute', 1), c: 3, r: 3 }, { def: Sim.mobScaleDef('archer', 1), c: 5, r: 1 }] }); };
  const A1 = mk(1), A2 = mk(0.8); for (let i = 0; i < 80; i++) { Sim.step(A1); Sim.step(A2); }
  const taken = W => W.units.filter(u => u.side === 0).reduce((a, u) => a + (u.dmgTaken || 0), 0), dealt = W => W.units.filter(u => u.side === 1).reduce((a, u) => a + (u.dmgTaken || 0), 0);
  const r = taken(A2) / Math.max(1, taken(A1));
  ok(taken(A1) > 100 && r > 0.74 && r < 0.86, `takeMul 0.8: the heroes take ${Math.round(r * 100)}% of the damage (${Math.round(taken(A2))} vs ${Math.round(taken(A1))})`);
  ok(dealt(A1) === dealt(A2), 'takeMul changes nothing on the enemy side');
  ok(mk(undefined).tm0 === 1 && mk(1.5).tm0 === 1, 'without takeMul (or with a wrong one) damage is unchanged');
}
console.log(`motor: ${oks} ok, ${fails} fail`);
process.exit(fails ? 1 : 0);
