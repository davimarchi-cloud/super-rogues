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
  function migrate(run) {
    if (!run) return run;
    if (run.v === 2) {
      run.v = 3; run.relics = (run.relics || []).filter(id => B.RELIC[id]);
      if (run.phase !== 'over' && (C.seq[run.step] === 'G' || (run.cur && run.cur.type === 'onslaught') || (run.opts || []).some(o => o.type === 'onslaught'))) { run.phase = 'gauntlet'; run.g = run.g || { status: 'intro', history: [] }; run.cur = null; run.opts = []; }
    }
    // v4 (itemization v16): one item per type on each hero; a second item of a type goes back to the bag
    if (run.v === 3) {
      run.v = 4;
      run.bag = run.bag || [];
      for (const h of run.heroes || []) {
        const seen = new Set(), keep = [];
        for (const id of h.items) { const t = (B.ITEM[id] || {}).type; if (!t) continue; if (seen.has(t)) run.bag.push(id); else { seen.add(t); keep.push(id); } }
        h.items = keep;
      }
    }
    return run.v === 4 ? run : null;
  }
  function newRun(seed) {
    const run = { v: 4, seed: seed >>> 0, rs: seed | 0, gold: C.startGold, heroes: [], bag: [], relics: [], nuid: 0,
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
  // chain lightning from two sources keeps the best of each part (summing "every Nth attack" made it rarer)
  const BEST = { chainEvery: Math.min, chainTargets: Math.max, chainDmg: Math.max };
  function addMods(t, m) {
    if (!m) return t;
    for (const k in m) {
      const v = m[k];
      if (Array.isArray(v)) t[k] = (t[k] || []).concat(v);
      else if (typeof v === 'number') t[k] = BEST[k] && t[k] ? BEST[k](t[k], v) : (t[k] || 0) + v;
      else t[k] = v;
    }
    return t;
  }
  // set pieces worn by one hero: { setId: count }, and the bonuses they unlock (2 and 3 pieces)
  function setCounts(items) { const n = {}; for (const id of items) { const s = (B.ITEM[id] || {}).set; if (s) n[s] = (n[s] || 0) + 1; } return n; }
  function setBonuses(items) {
    const out = [], n = setCounts(items);
    for (const sid in n) for (const k of [2, 3]) if (n[sid] >= k) out.push(B.SETS[sid].bonus[k]);
    return out;
  }
  function specOf(key, id) { for (const pair of B.HEROES[key].specs) for (const s of pair) if (s.id === id) return s; return null; }
  function heroMods(run, h) {
    const m = {};
    addMods(m, B.HEROES[h.key].mods);
    for (const id of h.specs) addMods(m, (specOf(h.key, id) || {}).mods);
    for (const id of h.items) addMods(m, (B.ITEM[id] || {}).mods);
    for (const b of setBonuses(h.items)) addMods(m, b.mods);
    for (const id of run.relics) addMods(m, (B.RELIC[id] || {}).mods);
    addMods(m, h.bonus);
    return m;
  }
  function slots(run, h) { return C.baseSlots + Math.max(0, h.lvl - 2) + (run.relics.includes('backpack') ? 1 : 0); }
  function heroDef(run, h) {
    const b = B.HEROES[h.key], m = heroMods(run, h), L = h.lvl - 1, all = m.allPct || 0;
    const ab = Object.assign({}, b.ab), fl = (b.fl || []).slice();
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
      dodge: (b.dodge || 0) + (m.dodge || 0), mana: Math.max(20, Math.round((b.mana + (m.manaMax || 0)) * (1 + (m.manaMaxPct || 0)))), m0: b.m0,
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
      const d = B.Sim.mobScaleDef(e.key, fight.scale), M = fight.mod || {};
      if (fight.curse) d.hp *= 1 + fight.curse;
      if (M.enemyHp) d.hp *= 1 + M.enemyHp;
      if (M.enemyAtk) d.atk *= 1 + M.enemyAtk;
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
      heroes: run.heroes.map(h => ({ def: withMod(heroDef(run, h), f.mod), c: h.pos.c, r: h.pos.r })),
      enemies: enemyDefs(run, f),
    });
  }
  // the hero side of a next-fight modifier (review #17)
  function withMod(d, M) {
    if (!M) return d;
    if (M.atkPct) d.atk *= 1 + M.atkPct;
    if (M.manaStart) d.m.manaStart = (d.m.manaStart || 0) + M.manaStart;
    if (M.regen) d.m.regen = (d.m.regen || 0) + M.regen;
    return d;
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
    // review #14: the team as it fought (before level ups), sent to api/elo.js to rate its heroes, items and relics
    run.lastFight = { team: teamSnapshot(run), relics: run.relics.slice() };
    for (const u of W.units) {
      if (u.kind !== 'hero' || !u.uid) continue;
      const h = run.heroes.find(x => x.uid === u.uid); if (!h) continue;
      const before = h.lvl, xp0 = h.xp;
      gainXp(run, h, u.xpT / B.Sim.TPS);
      res.xp.push({ uid: h.uid, name: B.HEROES[h.key].name, gained: h.xp - xp0, from: before, to: h.lvl });
    }
    if (win) {
      const M = f.mod || {};
      res.gold = Math.round((goldAfterWin(run, f.gold) + (run.relics.includes('bounty') ? Math.min(6, W.kills) : 0)) * (1 + (M.goldPct || 0))) + (M.rewardGold || 0);
      run.gold += res.gold; run.won++;
      if (M.reward) { const id = randomItem(run, M.reward); run.bag.push(id); res.prize = id; }
    }
    else run.lost++;
    run.log.push((win ? 'Won ' : 'Lost ') + (f.diff === 'boss' ? 'boss' : f.diff) + ' fight ' + f.fightNo);
    run.cur = null;
    // review #3: no hearts, one lost fight ends the run
    if (!win) { run.phase = 'over'; run.result = 'defeat'; } else advance(run);
    return res;
  }


  // ------------------------------------------------------------------ PvP gauntlet (reviews #3 #4): matchmaking + Elo live in api/elo.js
  function teamSnapshot(run) {
    for (const h of run.heroes) if (!h.pos) autoPlace(run, h);
    return run.heroes.map(h => ({ key: h.key, lvl: h.lvl, specs: h.specs.slice(), items: h.items.slice(), bonus: Object.assign({}, h.bonus), pos: { c: h.pos.c, r: h.pos.r } }));
  }
  function gauntletWorld(run, preview) {
    const o = run.g.opp, ghost = { relics: o.relics || [], heroes: [] };
    for (const h of run.heroes) if (!h.pos) autoPlace(run, h);
    return B.Sim.create({
      // review #15: the ghost fights with its own relics too (stat relics via heroDef, team effects via enemyRelics)
      mode: 'fight', seed: preview ? 1 : Math.floor(rnd(run) * 1e9), noStart: !!preview, fightNo: 7, relics: run.relics, enemyRelics: o.relics || [],
      heroes: run.heroes.map(h => ({ def: heroDef(run, h), c: h.pos.c, r: h.pos.r })),
      // their formation, mirrored so it faces ours: rows 4..7 -> 3..0
      enemies: o.team.map(h => { const d = heroDef(ghost, h); d.uid = 0; return { def: d, c: 7 - h.pos.c, r: 7 - h.pos.r }; }),
    });
  }
  // apply an api/elo.js answer to the run
  function gauntletUpdate(run, r) {
    const g = run.g;
    if (g.eloStart == null) g.eloStart = r.elo - (r.delta || 0) - (r.reach || 0);
    // review #14: reaching the gauntlet is itself a win against a 1000 rated opponent
    if (r.reach != null && !g.history.length) g.history.push({ name: 'Reached the Gauntlet', elo: 1000, win: true, delta: r.reach, reach: true });
    if (r.peak != null) g.peak = r.peak;
    if (r.lg) { g.lgGain = (g.lgGain || 0) + r.lg.delta; g.lgNow = r.lg; g.lgPromoted = g.lgPromoted || r.lg.promoted; }  // review #21
    g.elo = r.elo; g.teamId = r.teamId; g.wins = r.wins || 0;
    if (r.delta != null && g.opp) g.history.push({ name: g.opp.name, elo: g.opp.elo, win: !!r.win, delta: r.delta, key: g.opp.team && g.opp.team[0] && g.opp.team[0].key, ghost: r.ghost || null });
    if (r.opponent) { g.opp = r.opponent; g.round = r.round; g.status = 'match'; run.cur = { type: 'gauntlet' }; }
    if (r.over) { g.status = r.champion ? 'champion' : 'lost'; g.opp = null; run.cur = null; run.phase = 'over'; run.result = 'gauntlet'; }
  }

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
    } else if (t === 'G') {
      // the gauntlet (reviews #3 #4 #9 #10): duels against ghosts of other players' runs
      run.phase = 'gauntlet'; run.g = { status: 'intro', history: [] }; run.cur = null;
    }
  }
  function choose(run, i) {
    const o = run.opts[i]; if (!o) return;
    run.cur = o; run.opts = [];
    if (o.type === 'fight') {
      run.fightNo = o.fightNo;
      // review #17: modifiers bought in events apply to the next fight (run.curse = the old altar, kept for saved runs)
      const mod = Object.assign({}, run.nextMod || {});
      if (run.curse) { mod.enemyHp = (mod.enemyHp || 0) + run.curse; run.curse = 0; }
      run.nextMod = null; if (Object.keys(mod).length) o.mod = mod;
      run.phase = 'deploy';
    }
    else if (o.type === 'shop') { run.cur = makeShop(run, o.kind); run.phase = 'shop'; }
    else if (o.type === 'event') { run.cur = makeEvent(run, o.id); run.phase = 'event'; }
  }

  // ------------------------------------------------------------------ shops
  const seal = run => run.relics.includes('seal') ? 1 : 0;
  // itemization v16: 7 rarities; set and legendary from the 2nd fight on, mythic only in the late shops
  function tierWeights(run) {
    const n = run.fightNo;
    return n <= 1 ? { common: 0.55, uncommon: 0.3, rare: 0.13, epic: 0.02 }
      : n <= 3 ? { common: 0.25, uncommon: 0.27, rare: 0.28, epic: 0.1, set: 0.07, legendary: 0.03 }
      : { common: 0.1, uncommon: 0.17, rare: 0.3, epic: 0.18, set: 0.12, legendary: 0.09, mythic: 0.04 };
  }
  function randomItem(run, tier) { const t = tier || wpick(run, tierWeights(run)); return pick(run, B.ITEMS.filter(i => i.tier === t)).id; }
  function stockFor(run, kind) {
    if (kind === 'heroShop') {
      const have = new Set(run.heroes.map(h => h.key));
      return pickN(run, Object.keys(B.HEROES).filter(k => !have.has(k)), 3).map(k => ({ kind: 'hero', id: k, price: Math.max(1, C.heroCost - seal(run)) }));
    }
    if (kind === 'itemShop') return Array.from({ length: run.relics.includes('treasure') ? 7 : 5 }, () => { const id = randomItem(run); return { kind: 'item', id, price: Math.max(1, C.itemCost[B.ITEM[id].tier] - seal(run)) }; });
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
  // one item per type: equipping onto a hero that already wears that type swaps them (the old one goes to the bag)
  function sameType(h, id) { const t = B.ITEM[id].type; return h.items.findIndex(x => B.ITEM[x].type === t); }
  function canEquip(run, h, id) { return sameType(h, id) >= 0 || h.items.length < slots(run, h); }
  function equip(run, bagIdx, uid) {
    const h = run.heroes.find(x => x.uid === uid), id = run.bag[bagIdx];
    if (!h || !id) return 'No item';
    const j = sameType(h, id);
    if (j >= 0) { run.bag[bagIdx] = h.items[j]; h.items[j] = id; return null; }
    if (h.items.length >= slots(run, h)) return 'No free slot (level 3+ adds slots)';
    h.items.push(id); run.bag.splice(bagIdx, 1); return null;
  }
  function unequip(run, uid, i) { const h = run.heroes.find(x => x.uid === uid); if (!h || !h.items[i]) return; run.bag.push(h.items.splice(i, 1)[0]); }
  function sellValue(id) { return Math.max(1, Math.floor(C.itemCost[B.ITEM[id].tier] / 2)); }
  function sell(run, bagIdx) { const id = run.bag[bagIdx]; if (!id) return; run.gold += sellValue(id); run.bag.splice(bagIdx, 1); }

  // ------------------------------------------------------------------ events (review #17: 3 real choices each)
  const RAR_UP = { common: 'uncommon', uncommon: 'rare', rare: 'epic', epic: 'legendary', set: 'legendary', legendary: 'mythic' };
  const RAR_ORDER = ['common', 'uncommon', 'rare', 'epic', 'set', 'legendary', 'mythic'];
  function makeEvent(run, id) { return { type: 'event', id, done: null, offer: rollOffer(run, id) }; }
  function rollOffer(run, id) {
    const o = {};
    if (id === 'mercs') { const have = new Set(run.heroes.map(h => h.key)); o.heroes = pickN(run, Object.keys(B.HEROES).filter(k => !have.has(k)), 2); }
    if (id === 'armory') {
      o.items = pickN(run, B.TYPES.map(t => t.id), 3).map(t => {
        const tier = wpick(run, run.fightNo >= 4 ? { rare: 0.4, epic: 0.35, set: 0.25 } : { uncommon: 0.3, rare: 0.45, epic: 0.15, set: 0.1 });
        const pool = B.ITEMS.filter(i => i.type === t && i.tier === tier);
        return pick(run, pool.length ? pool : B.ITEMS.filter(i => i.type === t && i.tier === 'rare')).id;
      });
    }
    if (id === 'collector') { const own = [...new Set(itemRefs(run).map(x => B.ITEM[x.id].set).filter(Boolean))]; o.set = own.length ? pick(run, own) : null; }
    return o;
  }
  // the concrete choices of the open event (dynamic events build theirs from the offer)
  function eventChoices(run) {
    const cur = run.cur, ev = B.EVENT[cur.id]; if (!ev) return [];
    if (!ev.dyn) return ev.choices;
    cur.offer = cur.offer || rollOffer(run, cur.id);
    const o = cur.offer;
    if (cur.id === 'mercs') return o.heroes.map(k => ({ label: `Hire ${B.HEROES[k].name}, ${B.HEROES[k].role.toLowerCase()}: ${B.HEROES[k].abName}`, act: 'hire:' + k, cost: 6, hero: k }))
      .concat([{ label: 'Spar with them: +25 XP to all heroes', act: 'xpAll:25' }]);
    if (cur.id === 'armory') return o.items.map(id => ({ label: `Take ${B.ITEM[id].name}: ${B.ITEM[id].desc}`, act: 'take:' + id, item: id }));
    if (cur.id === 'collector') {
      const S = o.set && B.SETS[o.set];
      return [S ? { label: `Complete your ${S.name} set: one of its missing pieces`, act: 'setPiece', cost: 6 } : { label: 'Buy a random set piece', act: 'setPiece', cost: 7 },
        { label: 'Trade one of your items for a random set piece', act: 'tradeSet', target: 'item' },
        { label: 'Take a free sample: a random common item', act: 'item:common' }];
    }
    return [];
  }
  // every item the team owns: in the bag ('b:i') or worn ('h:uid:i')
  function itemRefs(run) {
    const out = run.bag.map((id, i) => ({ arg: 'b:' + i, id }));
    for (const h of run.heroes) h.items.forEach((id, i) => out.push({ arg: 'h:' + h.uid + ':' + i, id, uid: h.uid }));
    return out;
  }
  function eventTargets(run, ch) {
    if (ch.target === 'hero') return run.heroes.filter(h => ch.act !== 'respec' || h.specs.length).map(h => ({ arg: String(h.uid), uid: h.uid }));
    if (ch.target === 'type') return B.TYPES.map(t => ({ arg: t.id, type: t.id }));
    if (ch.target === 'item') {
      const min = RAR_ORDER.indexOf(ch.minRarity || 'common');
      return itemRefs(run).filter(x => RAR_ORDER.indexOf(B.ITEM[x.id].tier) >= min && !((ch.act === 'upgradeItem' || ch.act === 'gambleItem') && B.ITEM[x.id].tier === 'mythic'));
    }
    return [];
  }
  // can this choice be taken now? { ok, why }
  function canChoose(run, ch) {
    if (!ch || run.cur.done) return { ok: false, why: '' };
    if (ch.cost && run.gold < ch.cost) return { ok: false, why: 'Needs ' + ch.cost + ' gold' };
    if (ch.act.startsWith('hire:') && run.heroes.length >= teamMax(run)) return { ok: false, why: 'Your team is full' };
    if (ch.target && !eventTargets(run, ch).length) return { ok: false, why: ch.target === 'item' ? (ch.minRarity ? 'Needs a ' + ch.minRarity + ' or better item' : 'Needs an item') : ch.act === 'respec' ? 'No hero has a specialization yet' : 'No valid target' };
    return { ok: true, why: '' };
  }
  function itemAt(run, arg) {
    const p = String(arg).split(':');
    if (p[0] === 'b') { const i = +p[1]; return run.bag[i] ? { id: run.bag[i], set: v => { run.bag[i] = v; }, drop: () => run.bag.splice(i, 1) } : null; }
    const h = run.heroes.find(x => x.uid === +p[1]), i = +p[2];
    return h && h.items[i] ? { id: h.items[i], set: v => { h.items[i] = v; }, drop: () => h.items.splice(i, 1) } : null;
  }
  // a random item of the same type, one rarity higher (skips rarities that type does not have)
  function upgradedOf(run, id) {
    const it = B.ITEM[id]; let t = RAR_UP[it.tier];
    while (t) { const pool = B.ITEMS.filter(i => i.type === it.type && i.tier === t && i.id !== id); if (pool.length) return pick(run, pool).id; t = RAR_UP[t]; }
    return null;
  }
  function randomRelic(run) { const pool = B.RELICS.filter(r => !run.relics.includes(r.id)); if (!pool.length) return null; const r = pick(run, pool); gainRelic(run, r.id); return r; }
  function eventAct(run, i, arg) {
    const ch = eventChoices(run)[i];
    if (!canChoose(run, ch).ok) return null;
    let tgt = null;
    if (ch.target) { tgt = eventTargets(run, ch).find(x => x.arg === String(arg)); if (!tgt) return null; }
    if (ch.cost) run.gold -= ch.cost;
    const [a, x, y, z] = ch.act.split(':'); let msg = 'Nothing happens.';
    const name = h => B.HEROES[h.key].name, hero = tgt && tgt.uid ? run.heroes.find(h => h.uid === tgt.uid) : null;
    const it = tgt && tgt.id ? itemAt(run, tgt.arg) : null, iname = id => B.ITEM[id].name;
    if (a === 'xpAll') { for (const h of run.heroes) gainXp(run, h, +x); msg = 'All heroes gained ' + x + ' XP.'; }
    else if (a === 'xpHero') { gainXp(run, hero, +x); msg = name(hero) + ' gained ' + x + ' XP.'; }
    else if (a === 'hpAll') { for (const h of run.heroes) h.bonus.hpPct = (h.bonus.hpPct || 0) + (+x); msg = 'Your heroes feel sturdier (+' + Math.round(x * 100) + '% max HP).'; }
    else if (a === 'hpHero') { hero.bonus.hpPct = (hero.bonus.hpPct || 0) + (+x); msg = name(hero) + ' gained +' + Math.round(x * 100) + '% max HP.'; }
    else if (a === 'buffHero') { for (const k in ch.mods) hero.bonus[k] = (hero.bonus[k] || 0) + ch.mods[k]; msg = name(hero) + ' got stronger.'; }
    else if (a === 'gold') { run.gold += +x; msg = '+' + x + ' gold.'; }
    else if (a === 'item') { const id = randomItem(run, x === 'common' ? 'common' : null); run.bag.push(id); msg = 'You got ' + iname(id) + '.'; }
    else if (a === 'typeItem') { const pool = B.ITEMS.filter(q => q.type === tgt.type && q.tier === x); const id = pick(run, pool).id; run.bag.push(id); msg = 'The merchant hands you ' + iname(id) + '.'; }
    else if (a === 'mystery') { const id = randomItem(run, rnd(run) < 0.5 ? 'epic' : 'common'); run.bag.push(id); msg = 'Inside the box: ' + iname(id) + '.'; }
    else if (a === 'sellFull') { const v = C.itemCost[B.ITEM[it.id].tier]; msg = 'Sold ' + iname(it.id) + ' for ' + v + ' gold.'; it.drop(); run.gold += v; }
    else if (a === 'upgradeItem') { const nid = upgradedOf(run, it.id); if (nid) { msg = iname(it.id) + ' was reforged into ' + iname(nid) + '.'; it.set(nid); } else { run.gold += ch.cost || 0; msg = 'Nothing better exists for that item. Your gold is returned.'; } }
    else if (a === 'gambleItem') {
      const nid = upgradedOf(run, it.id);
      if (nid && rnd(run) < 0.5) { msg = 'Luck! ' + iname(it.id) + ' became ' + iname(nid) + '.'; it.set(nid); } else { msg = 'You lost ' + iname(it.id) + '.'; it.drop(); }
    }
    else if (a === 'gamble') { if (rnd(run) < +y) { run.gold += +z; msg = 'You won ' + z + ' gold!'; } else msg = 'You lost the bet.'; }
    else if (a === 'relic') { const r = randomRelic(run); msg = r ? 'You gained ' + r.name + '.' : 'You already own every relic.'; }
    else if (a === 'relicBlood') { hero.bonus.hpPct = (hero.bonus.hpPct || 0) - (+x); const r = randomRelic(run); msg = name(hero) + ' paid in blood. ' + (r ? 'You gained ' + r.name + '.' : ''); }
    else if (a === 'relicItem') { const was = iname(it.id); it.drop(); const r = randomRelic(run); msg = 'The shrine took ' + was + '. ' + (r ? 'You gained ' + r.name + '.' : ''); }
    else if (a === 'respec') {
      const k = hero.specs.length - 1, pair = B.HEROES[hero.key].specs[k], was = hero.specs[k], now = pair[0].id === was ? pair[1] : pair[0];
      hero.specs[k] = now.id; msg = name(hero) + ' now follows ' + now.name + '.';
    }
    else if (a === 'hire') { const h = addHero(run, x); msg = name(h) + ' joins your team!'; }
    else if (a === 'take') { run.bag.push(x); msg = 'You took ' + iname(x) + '.'; }
    else if (a === 'setPiece') {
      const own = new Set(itemRefs(run).map(q => q.id)), S = run.cur.offer && run.cur.offer.set && B.SETS[run.cur.offer.set];
      let pool = S ? S.pieces.filter(id => !own.has(id)) : [];
      if (!pool.length) pool = B.ITEMS.filter(q => q.set && !own.has(q.id)).map(q => q.id);
      if (!pool.length) { run.gold += ch.cost || 0; msg = 'You already own every set piece. Your gold is returned.'; }
      else { const id = pick(run, pool); run.bag.push(id); msg = 'You got ' + iname(id) + '.'; }
    }
    else if (a === 'tradeSet') {
      const own = new Set(itemRefs(run).map(q => q.id)), pool = B.ITEMS.filter(q => q.set && !own.has(q.id));
      if (!pool.length) msg = 'You already own every set piece.';
      else { const was = iname(it.id); it.drop(); const id = pick(run, pool).id; run.bag.push(id); msg = 'Traded ' + was + ' for ' + iname(id) + '.'; }
    }
    if (ch.next) {
      const M = run.nextMod = run.nextMod || {};
      for (const k in ch.next) M[k] = typeof ch.next[k] === 'number' ? (M[k] || 0) + ch.next[k] : ch.next[k];
      msg += ' It will matter in your next fight.';
    }
    run.cur.done = msg; return msg;
  }

  B.Run = { newRun, pickStart, heroDef, heroMods, slots, specOf, gainXp, chooseSpec, autoPlace, setPos, makeFight, fightWorld,
    finishFight, advance, choose, reroll, rerollCost, buy, leave, equip, unequip, sell, sellValue,
    eventAct, teamMax, addHero, gainRelic, rnd, migrate, teamSnapshot, gauntletWorld, gauntletUpdate, canEquip, setCounts, setBonuses,
    eventChoices, eventTargets, canChoose, itemRefs, upgradedOf };
  if (typeof module !== 'undefined') module.exports = B.Run;
})(typeof window !== 'undefined' ? window : globalThis);
