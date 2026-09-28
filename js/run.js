// Run state machine (pure data, no DOM): map of nodes, fights, shops, events, XP/levels, items, relics.
// The whole run is one JSON-able object, saved to localStorage by the UI after every change.
(function (G) {
  const B = G.B = G.B || {};
  const C = B.CFG, Hx = B.Hex;

  // ------------------------------------------------------------------ rng stored inside the run (survives save/load)
  function rnd(run) {
    run.rs = (run.rs + 0x6D2B79F5) | 0; let t = run.rs;
    t = Math.imul(t ^ t >>> 15, 1 | t); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  const pick = (run, arr) => arr[Math.floor(rnd(run) * arr.length)];
  function pickN(run, arr, n) { const a = arr.slice(), o = []; while (a.length && o.length < n) o.push(a.splice(Math.floor(rnd(run) * a.length), 1)[0]); return o; }
  function wpick(run, weights) { let s = 0; for (const k in weights) s += weights[k]; let x = rnd(run) * s; for (const k in weights) { x -= weights[k]; if (x <= 0) return k; } return Object.keys(weights)[0]; }

  // ------------------------------------------------------------------ run
  function newRun(seed) {
    const run = { v: 1, seed: seed >>> 0, rs: seed | 0, hearts: C.hearts, gold: C.startGold, heroes: [], bag: [], relics: [], nuid: 0,
      step: -1, fightNo: 0, phase: 'start', opts: [], cur: null, pending: [], curse: 0, log: [], won: 0, lost: 0, score: 0, startOffer: [] };
    run.startOffer = pickN(run, Object.keys(B.HEROES), 3);
    return run;
  }
  function addHero(run, key) {
    const h = { uid: ++run.nuid, key, lvl: 1, xp: 0, specs: [], items: [], bonus: {}, pos: null };
    run.heroes.push(h); autoPlace(run, h); return h;
  }
  function pickStart(run, keys) {
    for (const k of keys.slice(0, 2)) addHero(run, k);
    run.phase = 'map'; advance(run);
  }
  const teamMax = run => C.maxTeam + (run.relics.includes('crest') ? 1 : 0);

  // ------------------------------------------------------------------ stats
  function addMods(t, m) {
    if (!m) return t;
    for (const k in m) { const v = m[k]; if (Array.isArray(v)) t[k] = (t[k] || []).concat(v); else if (typeof v === 'number') t[k] = (t[k] || 0) + v; else t[k] = v; }
    return t;
  }
  function specOf(key, id) { for (const pair of B.HEROES[key].specs) for (const s of pair) if (s.id === id) return s; return null; }
  function heroMods(run, h) {
    const m = {};
    for (const id of h.specs) addMods(m, (specOf(h.key, id) || {}).mods);
    for (const id of h.items) addMods(m, (B.ITEM[id] || {}).mods);
    for (const id of run.relics) addMods(m, (B.RELIC[id] || {}).mods);
    addMods(m, h.bonus);
    return m;
  }
  function slots(run, h) { return C.baseSlots + Math.max(0, h.lvl - 2) + (run.relics.includes('backpack') ? 1 : 0); }
  function heroDef(run, h) {
    const b = B.HEROES[h.key], m = heroMods(run, h), L = h.lvl - 1, all = m.allPct || 0;
    const ab = Object.assign({}, b.ab), fl = [];
    for (const id of h.specs) {
      const s = specOf(h.key, id); if (!s) continue;
      for (const k in (s.ab || {})) ab[k] = (ab[k] || 0) + s.ab[k];
      for (const f of (s.fl || [])) fl.push(f);
    }
    return {
      kind: 'hero', uid: h.uid, key: h.key, name: b.name, glyph: b.glyph, color: b.color, lvl: h.lvl,
      hp: (b.hp + (m.hp || 0)) * (1 + 0.15 * L) * (1 + (m.hpPct || 0) + all),
      atk: (b.atk + (m.atk || 0)) * (1 + 0.15 * L) * (1 + (m.atkPct || 0) + all),
      ap: (100 + 10 * L + (m.ap || 0)) * (1 + all),
      armor: (b.armor + 4 * L + (m.armor || 0)) * (1 + all),
      mr: (b.mr + 4 * L + (m.mr || 0)) * (1 + all),
      as: b.as * Math.max(0.3, 1 + (m.asPct || 0)), range: Math.max(1, b.range + (m.range || 0)), ms: b.ms + (m.ms || 0),
      crit: (b.crit || 0) + (m.crit || 0), critDmg: 1.5 + (m.critDmg || 0), ls: (b.ls || 0) + (m.ls || 0),
      dodge: (b.dodge || 0) + (m.dodge || 0), mana: Math.max(20, b.mana + (m.manaMax || 0)), m0: b.m0,
      abil: b.abil, ab, fl, m,
    };
  }

  // ------------------------------------------------------------------ XP & levels
  function gainXp(run, h, amount) {
    const m = heroMods(run, h);
    h.xp += Math.round(amount * (1 + (m.xpPct || 0)));
    while (h.lvl < C.maxLevel && h.xp >= C.xpLevels[h.lvl + 1]) { h.lvl++; run.pending.push({ uid: h.uid, lvl: h.lvl }); }
  }
  function chooseSpec(run, idx) {
    const p = run.pending.shift(); if (!p) return;
    const h = run.heroes.find(x => x.uid === p.uid); if (!h) return;
    const pair = B.HEROES[h.key].specs[p.lvl - 2]; h.specs.push(pair[idx ? 1 : 0].id);
  }

  // ------------------------------------------------------------------ deploy positions (rows 4..7 are the player's)
  function autoPlace(run, h) {
    const b = B.HEROES[h.key], taken = new Set(run.heroes.filter(x => x !== h && x.pos).map(x => Hx.key(x.pos.c, x.pos.r)));
    const rows = b.range <= 1 ? [4, 5, 6, 7] : [7, 6, 5, 4];
    const cols = [3, 4, 2, 5, 1, 6, 0, 7];
    for (const r of rows) for (const c of cols) if (!taken.has(Hx.key(c, r))) { h.pos = { c, r }; return; }
  }
  function setPos(run, uid, c, r) {
    if (r < 4 || r > 7 || !Hx.inside(c, r)) return;
    const h = run.heroes.find(x => x.uid === uid); if (!h) return;
    const other = run.heroes.find(x => x !== h && x.pos && x.pos.c === c && x.pos.r === r);
    if (other) other.pos = h.pos ? { c: h.pos.c, r: h.pos.r } : null;
    h.pos = { c, r };
    if (other && !other.pos) autoPlace(run, other);
  }

  // ------------------------------------------------------------------ fights
  function poolFor(n) { let k = 1; for (const x of Object.keys(B.POOLS).map(Number)) if (x <= n) k = x; return B.POOLS[k]; }
  function makeFight(run, diff, fightNo) {
    const scale = C.fightScale[fightNo];
    const enemies = [];
    if (diff === 'boss') {
      const boss = fightNo <= 3 ? B.BOSSES.gorewarden : B.BOSSES.hollowking;
      enemies.push({ key: boss.key, c: 3 + Math.floor(rnd(run) * 2), r: 1 });
      boss.escort.forEach(k => enemies.push({ key: k }));
    } else {
      const d = B.DIFF[diff], pool = poolFor(fightNo);
      let budget = d.budget * (1 + 0.12 * (fightNo - 1));
      while (budget > 0.4 && enemies.length < 12) { const k = pick(run, pool); enemies.push({ key: k }); budget -= B.MOBS[k].cost; }
      const nElite = d.elites + (fightNo >= 4 && diff !== 'easy' ? 1 : 0);
      for (const e of pickN(run, enemies, nElite)) e.elite = pick(run, B.ELITES).id;
    }
    // formation: melee in front (rows 2-3), ranged behind (rows 0-1)
    const taken = new Set(enemies.filter(e => e.c != null).map(e => Hx.key(e.c, e.r)));
    for (const e of enemies) {
      if (e.c != null) continue;
      const def = B.MOBS[e.key];
      const rows = def.range > 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      const spots = [];
      for (const r of rows) { const row = Hx.all().filter(h => h.r === r && !taken.has(Hx.key(h.c, h.r))); if (row.length) { spots.push(...row); break; } }
      const h = pick(run, spots); e.c = h.c; e.r = h.r; taken.add(Hx.key(h.c, h.r));
    }
    const gold = diff === 'boss' ? C.gold.boss : C.gold[diff];
    return { type: 'fight', diff, fightNo, scale, enemies, gold };
  }
  function enemyDefs(run, fight) {
    return fight.enemies.map(e => {
      const d = B.Sim.mobScaleDef(e.key, fight.scale);
      if (fight.curse) d.hp *= 1 + fight.curse;
      if (e.elite) B.Sim.applyElite(d, B.ELITES.find(x => x.id === e.elite));
      return { def: d, c: e.c, r: e.r };
    });
  }
  // preview = the static board shown while deploying (no rng used, no start-of-fight effects)
  function fightWorld(run, preview) {
    const f = run.cur;
    for (const h of run.heroes) if (!h.pos) autoPlace(run, h);
    return B.Sim.create({
      mode: 'fight', seed: preview ? 1 : Math.floor(rnd(run) * 1e9), noStart: !!preview, fightNo: f.fightNo, relics: run.relics,
      heroes: run.heroes.map(h => ({ def: heroDef(run, h), c: h.pos.c, r: h.pos.r })),
      enemies: enemyDefs(run, f),
    });
  }
  function goldAfterWin(run, base) {
    let g = base;
    if (run.relics.includes('idol')) g += 3;
    for (const h of run.heroes) for (const id of h.items) g += (B.ITEM[id].mods.gold || 0);
    if (run.relics.includes('purse')) g += Math.min(5, Math.floor(run.gold / 10));
    return g;
  }
  function finishFight(run, W) {
    const f = run.cur, win = W.winner === 0;
    const res = { win, gold: 0, xp: [], boss: f.diff === 'boss', timeout: !!W.timeout };
    for (const u of W.units) {
      if (u.kind !== 'hero' || !u.uid) continue;
      const h = run.heroes.find(x => x.uid === u.uid); if (!h) continue;
      const before = h.lvl, xp0 = h.xp;
      gainXp(run, h, u.xpT / B.Sim.TPS);
      res.xp.push({ uid: h.uid, name: B.HEROES[h.key].name, gained: h.xp - xp0, from: before, to: h.lvl });
    }
    if (win) { res.gold = goldAfterWin(run, f.gold); run.gold += res.gold; run.won++; }
    else { run.hearts--; res.gold = 2; run.gold += 2; run.lost++; }
    run.log.push((win ? 'Won ' : 'Lost ') + (f.diff === 'boss' ? 'boss' : f.diff) + ' fight ' + f.fightNo);
    run.cur = null;
    if (run.hearts <= 0) { run.phase = 'over'; run.result = 'defeat'; } else advance(run);
    return res;
  }

  // ------------------------------------------------------------------ onslaught
  function onslaughtWorld(run, preview) {
    for (const h of run.heroes) if (!h.pos) autoPlace(run, h);
    return B.Sim.create({ mode: 'onslaught', seed: preview ? 1 : Math.floor(rnd(run) * 1e9), noStart: !!preview, fightNo: 7, relics: run.relics, onsBase: 1.5,
      heroes: run.heroes.map(h => ({ def: heroDef(run, h), c: h.pos.c, r: h.pos.r })), enemies: [] });
  }
  function finishOnslaught(run, W) { run.score = W.kills; run.wave = W.wave; run.phase = 'over'; run.result = 'onslaught'; return run.score; }

  // ------------------------------------------------------------------ map
  function advance(run) {
    run.step++;
    const t = C.seq[run.step];
    run.phase = 'map'; run.opts = [];
    if (t === 'F' || t === 'B') {
      const n = run.fightNo + 1;
      if (t === 'B') run.opts = [makeFight(run, 'boss', n)];
      else run.opts = pickN(run, ['easy', 'medium', 'hard'], 2).sort((a, b) => ['easy', 'medium', 'hard'].indexOf(a) - ['easy', 'medium', 'hard'].indexOf(b)).map(d => makeFight(run, d, n));
    } else if (t === 'X') {
      const w = { heroShop: 0.25, itemShop: 0.3, relicShop: 0.2, event: 0.25 };
      if (run.heroes.length >= teamMax(run)) delete w.heroShop;
      const a = wpick(run, w); delete w[a]; const b = wpick(run, w);
      run.opts = [a, b].map(k => k === 'event' ? { type: 'event', id: pick(run, B.EVENTS).id } : { type: 'shop', kind: k });
    } else if (t === 'S') {
      run.opts = pickN(run, ['heroShop', 'itemShop', 'relicShop'].filter(k => k !== 'heroShop' || run.heroes.length < teamMax(run)), 2).map(k => ({ type: 'shop', kind: k, final: true }));
    } else if (t === 'O') {
      run.opts = [{ type: 'onslaught' }];
    }
  }
  function choose(run, i) {
    const o = run.opts[i]; if (!o) return;
    run.cur = o; run.opts = [];
    if (o.type === 'fight') { run.fightNo = o.fightNo; if (run.curse) { o.curse = run.curse; run.curse = 0; } run.phase = 'deploy'; }
    else if (o.type === 'shop') { run.cur = makeShop(run, o.kind); run.phase = 'shop'; }
    else if (o.type === 'event') { run.cur = { type: 'event', id: o.id, done: null }; run.phase = 'event'; }
    else if (o.type === 'onslaught') run.phase = 'deploy';
  }

  // ------------------------------------------------------------------ shops
  const seal = run => run.relics.includes('seal') ? 1 : 0;
  function tierWeights(run) { const n = run.fightNo; return n <= 1 ? { common: 0.7, rare: 0.28, epic: 0.02 } : n <= 3 ? { common: 0.45, rare: 0.43, epic: 0.12 } : { common: 0.25, rare: 0.47, epic: 0.28 }; }
  function randomItem(run, tier) { const t = tier || wpick(run, tierWeights(run)); return pick(run, B.ITEMS.filter(i => i.tier === t)).id; }
  function stockFor(run, kind) {
    if (kind === 'heroShop') {
      const have = new Set(run.heroes.map(h => h.key));
      return pickN(run, Object.keys(B.HEROES).filter(k => !have.has(k)), 3).map(k => ({ kind: 'hero', id: k, price: Math.max(1, C.heroCost - seal(run)) }));
    }
    if (kind === 'itemShop') return Array.from({ length: 5 }, () => { const id = randomItem(run); return { kind: 'item', id, price: Math.max(1, C.itemCost[B.ITEM[id].tier] - seal(run)) }; });
    return pickN(run, B.RELICS.filter(r => !run.relics.includes(r.id)).map(r => r.id), 3).map(id => ({ kind: 'relic', id, price: Math.max(1, C.relicCost - seal(run)) }));
  }
  function makeShop(run, kind) { return { type: 'shop', kind, stock: stockFor(run, kind), rerolls: 0 }; }
  function rerollCost(run) { return run.relics.includes('dice') && run.cur.rerolls === 0 ? 0 : C.reroll; }
  function reroll(run) { const c = rerollCost(run); if (run.gold < c) return false; run.gold -= c; run.cur.rerolls++; run.cur.stock = stockFor(run, run.cur.kind); return true; }
  function buy(run, i) {
    const s = run.cur.stock[i]; if (!s || s.sold || run.gold < s.price) return 'Not enough gold';
    if (s.kind === 'hero') { if (run.heroes.length >= teamMax(run)) return 'Team is full'; addHero(run, s.id); }
    else if (s.kind === 'item') run.bag.push(s.id);
    else gainRelic(run, s.id);
    run.gold -= s.price; s.sold = true; return null;
  }
  function gainRelic(run, id) {
    if (run.relics.includes(id)) return;
    run.relics.push(id);
    if (id === 'purse') run.gold += 10;
    if (id === 'tome') for (const h of run.heroes) gainXp(run, h, 45);
  }
  function leave(run) { run.cur = null; advance(run); }

  // ------------------------------------------------------------------ items
  function equip(run, bagIdx, uid) {
    const h = run.heroes.find(x => x.uid === uid), id = run.bag[bagIdx];
    if (!h || !id) return 'No item';
    if (h.items.length >= slots(run, h)) return 'No free slot (level 3+ adds slots)';
    h.items.push(id); run.bag.splice(bagIdx, 1); return null;
  }
  function unequip(run, uid, i) { const h = run.heroes.find(x => x.uid === uid); if (!h || !h.items[i]) return; run.bag.push(h.items.splice(i, 1)[0]); }
  function sellValue(id) { return Math.max(1, Math.floor(C.itemCost[B.ITEM[id].tier] / 2)); }
  function sell(run, bagIdx) { const id = run.bag[bagIdx]; if (!id) return; run.gold += sellValue(id); run.bag.splice(bagIdx, 1); }

  // ------------------------------------------------------------------ events
  function eventAct(run, i) {
    const ev = B.EVENT[run.cur.id], ch = ev.choices[i]; if (!ch || run.cur.done) return null;
    if (ch.req && ch.req.gold && run.gold < ch.req.gold) return null;
    if (ch.req && ch.req.hearts && run.hearts < ch.req.hearts) return null;
    const [a, x, y] = ch.act.split(':'); let msg = 'Nothing happens.';
    const rh = () => pick(run, run.heroes), name = h => B.HEROES[h.key].name;
    if (a === 'xpAll') { for (const h of run.heroes) gainXp(run, h, +x); msg = 'All heroes gained ' + x + ' XP.'; }
    else if (a === 'xpOne') { const h = rh(); gainXp(run, h, +x); msg = name(h) + ' gained ' + x + ' XP.'; }
    else if (a === 'xpLow') { const h = run.heroes.slice().sort((p, q) => p.xp - q.xp)[0]; gainXp(run, h, +x); msg = name(h) + ' gained ' + x + ' XP.'; }
    else if (a === 'buyRare') { run.gold -= +x; const id = randomItem(run, 'rare'); run.bag.push(id); msg = 'You got ' + B.ITEM[id].name + '.'; }
    else if (a === 'item') { const id = randomItem(run, x === 'common' ? 'common' : null); run.bag.push(id); msg = 'You got ' + B.ITEM[id].name + '.'; }
    else if (a === 'gamble') { run.gold -= +x; if (rnd(run) < 0.5) { run.gold += +y; msg = 'You won ' + y + ' gold!'; } else msg = 'You lost the bet.'; }
    else if (a === 'curseRelic' || a === 'heartRelic') {
      const pool = B.RELICS.filter(r => !run.relics.includes(r.id));
      if (pool.length) { const r = pick(run, pool); gainRelic(run, r.id); msg = 'You gained ' + r.name + '.'; }
      if (a === 'curseRelic') { run.curse = 0.3; msg += ' The next enemies feel stronger.'; } else run.hearts--;
    }
    else if (a === 'hpAll') { for (const h of run.heroes) h.bonus.hpPct = (h.bonus.hpPct || 0) + (+x); msg = 'Your heroes feel sturdier.'; }
    else if (a === 'gold') { run.gold += +x; msg = '+' + x + ' gold.'; }
    else if (a === 'hire') {
      const have = new Set(run.heroes.map(h => h.key)), pool = Object.keys(B.HEROES).filter(k => !have.has(k));
      if (run.heroes.length >= teamMax(run) || !pool.length) msg = 'Your team is full. The mercenary shrugs.';
      else { run.gold -= +x; const h = addHero(run, pick(run, pool)); msg = name(h) + ' joins your team!'; }
    }
    else if (a === 'statOne') { const h = rh(); h.bonus[x] = (h.bonus[x] || 0) + (+y); msg = name(h) + ' gained +' + y + ' ' + x + '.'; }
    else if (a === 'heart') { run.hearts = Math.min(C.hearts, run.hearts + 1); msg = 'Rested. Hearts: ' + run.hearts + '.'; }
    run.cur.done = msg; return msg;
  }

  B.Run = { newRun, pickStart, heroDef, heroMods, slots, specOf, gainXp, chooseSpec, autoPlace, setPos, makeFight, fightWorld,
    finishFight, onslaughtWorld, finishOnslaught, advance, choose, reroll, rerollCost, buy, leave, equip, unequip, sell, sellValue,
    eventAct, teamMax, addHero, gainRelic, rnd };
  if (typeof module !== 'undefined') module.exports = B.Run;
})(typeof window !== 'undefined' ? window : globalThis);
