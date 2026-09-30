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
  // v30 (review #28, PC boy): content still locked by the player's account level (run.locked, given at newRun) never
  // shows up in that player's runs: start offer, shops, events, rewards
  const isOpen = (run, id) => !(run.locked && run.locked.length && run.locked.includes(id));
  const heroKeysOf = run => Object.keys(B.HEROES).filter(k => isOpen(run, k));
  const itemsOf = run => B.ITEMS.filter(i => isOpen(run, i.id));
  const relicsOf = run => B.RELICS.filter(r => isOpen(run, r.id));
  function pickN(run, arr, n) { const a = arr.slice(), o = []; while (a.length && o.length < n) o.push(a.splice(Math.floor(rnd(run) * a.length), 1)[0]); return o; }
  function wpick(run, weights) { let s = 0; for (const k in weights) s += weights[k]; let x = rnd(run) * s; for (const k in weights) { x -= weights[k]; if (x <= 0) return k; } return Object.keys(weights)[0]; }

  // ------------------------------------------------------------------ run
  function migrate(run) {
    if (!run) return run;
    if (run.v === 2) {
      run.v = 3; run.relics = (run.relics || []).filter(id => B.RELIC[id]);
      if (run.phase !== 'over' && (['F', 'X', 'F', 'X', 'B', 'X', 'F', 'X', 'F', 'X', 'B', 'S', 'G'][run.step] === 'G' || (run.cur && run.cur.type === 'onslaught') || (run.opts || []).some(o => o.type === 'onslaught'))) { run.phase = 'gauntlet'; run.g = run.g || { status: 'intro', history: [] }; run.cur = null; run.opts = []; }
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
    // v5 (review #22): the sequence and the fight scale live in the run; runs started before keep the old 13 steps
    if (run.v === 4) { run.v = 5; run.seq = ['F', 'X', 'F', 'X', 'B', 'X', 'F', 'X', 'F', 'X', 'B', 'S', 'G']; run.fightScale = [1, 0.9, 1.1, 1.3, 1.5, 1.75, 2]; }
    return run.v === 5 ? run : null;
  }
  const seqOf = run => run.seq || C.seq;
  function newRun(seed, opts) {
    const run = { v: 5, seed: seed >>> 0, rs: seed | 0, gold: C.startGold, heroes: [], bag: [], relics: [], nuid: 0,
      step: -1, fightNo: 0, phase: 'start', opts: [], cur: null, pending: [], curse: 0, log: [], won: 0, lost: 0, score: 0, startOffer: [],
      seq: C.seq.slice(), fightScale: C.fightScale.slice(), locked: ((opts && opts.locked) || []).slice() };
    run.startOffer = pickN(run, heroKeysOf(run), C.startOffer);
    run.relicOffer = pickN(run, relicsOf(run).map(r => r.id), C.startOffer);  // review #22: the run also starts with a relic
    return run;
  }
  function addHero(run, key) {
    const h = { uid: ++run.nuid, key, lvl: 1, xp: 0, specs: [], items: [], bonus: {}, pos: null };
    run.heroes.push(h); autoPlace(run, h); return h;
  }
  function pickStart(run, keys, relic) {
    for (const k of keys.slice(0, C.maxTeam)) addHero(run, k);
    if (relic && B.RELIC[relic]) gainRelic(run, relic);
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
      ap: (100 + 30 * L + (m.ap || 0)) * (1 + all),   // review #26: AP 100 at Lv 1, +30 per level (it now scales abilities on its own)
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

  // ------------------------------------------------------------------ terrain maps (review #39, David)
  // Fight 1 = Open Meadow, bosses = Standing Stones, every other fight and Gauntlet floor = the next map of
  // B.MAP_ROTATION (its start depends on the run's seed; the two fights offered on a step get different maps). A map
  // is only used if none of its terrain sits on a hero's current hex or an enemy's starting hex; otherwise the next
  // map of the rotation is tried, and the Open Meadow is the last resort.
  const DIFF_I = { easy: 0, medium: 1, hard: 2 };
  const blockedOf = id => new Set(((B.MAP && B.MAP[id]) || { cells: [] }).cells.map(x => Hx.key(x.c, x.r)));
  function pickMap(order, avoid) {
    for (const id of order) if (!B.MAP[id].cells.some(x => avoid.has(Hx.key(x.c, x.r)))) return id;
    return 'meadow';
  }
  function rotation(run, n) { const R = B.MAP_ROTATION, i = ((((run.seed >>> 0) % 97) + n) % R.length + R.length) % R.length; return R.slice(i).concat(R.slice(0, i)); }
  const heroHexes = run => new Set(run.heroes.filter(h => h.pos).map(h => Hx.key(h.pos.c, h.pos.r)));
  // the map of the fight being played (or about to be): null = no terrain (old saves, onslaught)
  function mapOf(run) {
    const c = run.cur, id = c && c.type === 'fight' ? c.map : c && c.type === 'gauntlet' && run.g ? run.g.map : null;
    return id && B.MAP[id] ? B.MAP[id] : null;
  }
  function blockedAt(run, c, r) { const m = mapOf(run); return !!m && m.cells.some(x => x.c === c && x.r === r); }
  function terrainOf(run) { const m = mapOf(run); return m ? m.cells : []; }
  // the Gauntlet floor's map: both formations (theirs mirrored) stay clear
  function gauntletMap(run, opp, round) {
    const avoid = heroHexes(run);
    for (const h of (opp && opp.team) || []) if (h.pos) avoid.add(Hx.key(7 - h.pos.c, 7 - h.pos.r));
    return pickMap(rotation(run, 11 + (round | 0)).concat(['stones']), avoid);
  }

  // ------------------------------------------------------------------ deploy positions (rows 4..7 are the player's)
  function autoPlace(run, h) {
    const b = B.HEROES[h.key], taken = new Set(run.heroes.filter(x => x !== h && x.pos).map(x => Hx.key(x.pos.c, x.pos.r)));
    for (const k of blockedOf((mapOf(run) || {}).id)) taken.add(k);
    const rows = b.range <= 1 ? [4, 5, 6, 7] : [7, 6, 5, 4];
    const cols = [3, 4, 2, 5, 1, 6, 0, 7];
    for (const r of rows) for (const c of cols) if (!taken.has(Hx.key(c, r))) { h.pos = { c, r }; return; }
  }
  function setPos(run, uid, c, r) {
    if (r < 4 || r > 7 || !Hx.inside(c, r) || blockedAt(run, c, r)) return;
    const h = run.heroes.find(x => x.uid === uid); if (!h) return;
    const other = run.heroes.find(x => x !== h && x.pos && x.pos.c === c && x.pos.r === r);
    if (other) other.pos = h.pos ? { c: h.pos.c, r: h.pos.r } : null;
    h.pos = { c, r };
    if (other && !other.pos) autoPlace(run, other);
  }

  // ------------------------------------------------------------------ fights
  function poolFor(n) { let k = 1; for (const x of Object.keys(B.POOLS).map(Number)) if (x <= n) k = x; return B.POOLS[k]; }
  function makeFight(run, diff, fightNo, nth, o) {
    const fs = run.fightScale || C.fightScale, scale = fs[Math.min(fightNo, fs.length - 1)] * ((o && o.scaleMul) || 1);
    const enemies = [];
    if (o && o.keys) { for (const k of o.keys) enemies.push({ key: k }); for (const e of pickN(run, enemies, o.elites || 0)) e.elite = pick(run, B.ELITES).id; }
    else if (diff === 'boss') {
      const boss = (nth || (fightNo <= 4 ? 1 : 2)) === 1 ? B.BOSSES.gorewarden : B.BOSSES.hollowking;
      enemies.push({ key: boss.key, c: 3 + Math.floor(rnd(run) * 2), r: 1 });
      boss.escort.forEach(k => enemies.push({ key: k }));
    } else {
      const d = B.DIFF[diff], pool = d.pool ? B.POOLS[d.pool] : poolFor(fightNo);
      let budget = d.budget * (1 + 0.12 * (fightNo - 1)) * (fightNo === 1 ? C.firstFight || 1 : 1);
      while (budget > 0.4 && enemies.length < 12) { const k = pick(run, pool); enemies.push({ key: k }); budget -= B.MOBS[k].cost; }
      const nElite = d.elites + (fightNo > bossFight(run, 1) && diff !== 'easy' && diff !== 'horde' ? 1 : 0) + ((o && o.elites) || 0);
      for (const e of pickN(run, enemies, nElite)) e.elite = pick(run, B.ELITES).id;
    }
    // review #39: the map (fight 1 open, bosses at the Standing Stones), clear of the heroes and of the boss
    const avoid = heroHexes(run); for (const e of enemies) if (e.c != null) avoid.add(Hx.key(e.c, e.r));
    const map = fightNo <= 1 && diff !== 'boss' ? 'meadow' : diff === 'boss' ? pickMap(['stones'], avoid) : pickMap(rotation(run, fightNo * 3 + (DIFF_I[diff] || 0)), avoid);
    // formation: melee in front (rows 2-3), ranged behind (rows 0-1); never on terrain
    const taken = new Set(enemies.filter(e => e.c != null).map(e => Hx.key(e.c, e.r)));
    for (const k of blockedOf(map)) taken.add(k);
    for (const e of enemies) {
      if (e.c != null) continue;
      const def = B.MOBS[e.key];
      const rows = def.range > 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      const spots = [];
      for (const r of rows) { const row = Hx.all().filter(h => h.r === r && !taken.has(Hx.key(h.c, h.r))); if (row.length) { spots.push(...row); break; } }
      const h = pick(run, spots); e.c = h.c; e.r = h.r; taken.add(Hx.key(h.c, h.r));
    }
    const gold = diff === 'boss' ? C.gold.boss : C.gold[diff] || 0;
    return { type: 'fight', diff, fightNo, scale, enemies, gold, map };
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
  function fightWorld(run, preview, o) {
    const f = run.cur, team = f.solo ? run.heroes.filter(h => h.uid === f.solo) : run.heroes;   // v44: a duel = one hero
    for (const h of run.heroes) if (h.pos && blockedAt(run, h.pos.c, h.pos.r)) h.pos = null;
    for (const h of run.heroes) if (!h.pos) autoPlace(run, h);
    return B.Sim.create({
      terrain: terrainOf(run),
      mode: 'fight', seed: preview ? 1 : Math.floor(rnd(run) * 1e9), noStart: !!preview, fightNo: f.fightNo, relics: run.relics, takeMul: o && o.takeMul,
      heroes: team.map(h => ({ def: withMod(heroDef(run, h), f.mod), c: h.pos.c, r: h.pos.r })),
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
      // v44 (review #54): the Moneylender's investments and loans settle on the next won fight
      if (run.bank && run.bank.length) { res.bank = run.bank.reduce((a, x) => a + x, 0); run.gold = Math.max(0, run.gold + res.bank); run.bank = []; }
    }
    else run.lost++;
    run.log.push((win ? 'Won ' : 'Lost ') + (f.challenge ? f.challenge.name : f.diff === 'boss' ? 'boss' : f.diff) + ' fight ' + f.fightNo);
    run.cur = null;
    // v44: a challenge from an event pays its reward on a win; lost, the run goes on (only the reward is gone)
    if (f.challenge) { res.challenge = f.challenge.name; if (win) challengeReward(run, f, res); advance(run); return res; }
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
    if (!run.g.map) run.g.map = gauntletMap(run, o, run.g.round);
    for (const h of run.heroes) if (h.pos && blockedAt(run, h.pos.c, h.pos.r)) h.pos = null;
    for (const h of run.heroes) if (!h.pos) autoPlace(run, h);
    return B.Sim.create({
      terrain: terrainOf(run),
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
    if (r.delta != null && g.opp) g.history.push({ name: g.opp.name, code: g.opp.code || null, elo: g.opp.elo, win: !!r.win, delta: r.delta, key: g.opp.team && g.opp.team[0] && g.opp.team[0].key, ghost: r.ghost || null });
    if (r.opponent) { g.opp = r.opponent; g.round = r.round; g.status = 'match'; run.cur = { type: 'gauntlet' }; g.map = gauntletMap(run, g.opp, g.round); }
    if (r.over) { g.status = r.champion ? 'champion' : 'lost'; g.opp = null; run.cur = null; run.phase = 'over'; run.result = 'gauntlet'; }
  }

  // ------------------------------------------------------------------ map
  // the fight number of the n-th boss in this run's sequence
  function bossFight(run, n) { let f = 0, b = 0; for (const t of seqOf(run)) { if (t === 'F' || t === 'B') f++; if (t === 'B' && ++b === n) return f; } return f; }
  function advance(run) {
    run.step++;
    const t = seqOf(run)[run.step];
    run.phase = 'map'; run.opts = [];
    if (t === 'F' || t === 'B') {
      const n = run.fightNo + 1;
      if (t === 'B') run.opts = [makeFight(run, 'boss', n, seqOf(run).slice(0, run.step + 1).filter(x => x === 'B').length)];
      else run.opts = pickN(run, ['easy', 'medium', 'hard'], 2).sort((a, b) => ['easy', 'medium', 'hard'].indexOf(a) - ['easy', 'medium', 'hard'].indexOf(b)).map(d => makeFight(run, d, n));
    } else if (t === 'X') {
      const w = { heroShop: 0.25, itemShop: 0.3, relicShop: 0.2, event: 0.3 };
      if (run.heroes.length >= teamMax(run)) delete w.heroShop;
      // review #22: with a single hero the hero shop is always one of the two options
      const a = run.heroes.length === 1 && w.heroShop ? 'heroShop' : wpick(run, w); delete w[a]; const b = wpick(run, w);
      run.opts = [a, b].map(k => k === 'event' ? { type: 'event', id: pickEvent(run) } : { type: 'shop', kind: k });
    } else if (t === 'S') {
      run.opts = pickN(run, ['heroShop', 'itemShop', 'relicShop'].filter(k => k !== 'heroShop' || run.heroes.length < teamMax(run)), 2).map(k => ({ type: 'shop', kind: k, final: true }));
    } else if (t === 'G') {
      // the gauntlet (reviews #3 #4 #9 #10): duels against ghosts of other players' runs
      run.phase = 'gauntlet'; run.g = { status: 'intro', history: [] }; run.cur = null;
    }
  }
  // v44 (review #54): common events come up more than uncommon and rare ones, and an event is offered once per run
  function pickEvent(run) {
    const seen = run.evSeen = run.evSeen || [], w = {};
    for (const e of B.EVENTS) if (!seen.includes(e.id) && (run.fightNo || 0) >= (e.after || 0)) w[e.id] = B.EVENT_RARITY[e.rar] || 1;
    const id = Object.keys(w).length ? wpick(run, w) : pick(run, B.EVENTS).id;
    seen.push(id); return id;
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
      : n <= bossFight(run, 1) ? { common: 0.25, uncommon: 0.27, rare: 0.28, epic: 0.1, set: 0.07, legendary: 0.03 }
      : { common: 0.1, uncommon: 0.17, rare: 0.3, epic: 0.18, set: 0.12, legendary: 0.09, mythic: 0.04 };
  }
  function randomItem(run, tier) { const t = tier || wpick(run, tierWeights(run)); return pick(run, itemsOf(run).filter(i => i.tier === t)).id; }
  function stockFor(run, kind) {
    if (kind === 'heroShop') {
      const have = new Set(run.heroes.map(h => h.key));
      return pickN(run, heroKeysOf(run).filter(k => !have.has(k)), 3).map(k => ({ kind: 'hero', id: k, price: Math.max(1, C.heroCost - seal(run)) }));
    }
    if (kind === 'itemShop') return Array.from({ length: run.relics.includes('treasure') ? 7 : 5 }, () => { const id = randomItem(run); return { kind: 'item', id, price: Math.max(1, C.itemCost[B.ITEM[id].tier] - seal(run)) }; });
    return pickN(run, relicsOf(run).filter(r => !run.relics.includes(r.id)).map(r => r.id), 3).map(id => ({ kind: 'relic', id, price: Math.max(1, C.relicCost - seal(run)) }));
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
  // v44 (review #54): rewards grow with the run. {gN} / {xN} in a label or act = N gold / N XP x (1 + 15% per fight after the first)
  const evScale = run => 1 + 0.15 * Math.max(0, (run.fightNo || 1) - 1);
  const tok = (run, t) => String(t).replace(/\{([gx])(\d+)\}/g, (m, k, n) => String(Math.round(+n * evScale(run))));
  function resolve(run, ch) {
    const o = Object.assign({}, ch, { label: tok(run, ch.label), act: tok(run, ch.act) });
    if (ch.fight) o.fight = Object.assign({}, ch.fight, { win: Object.assign({}, ch.fight.win) });
    if (o.fight && o.fight.win.gold != null) o.fight.win.gold = +tok(run, o.fight.win.gold);
    if (o.fight && o.fight.win.xp != null) o.fight.win.xp = +tok(run, o.fight.win.xp);
    return o;
  }
  // the heroes that can take a "req" choice (FTL's blue options)
  const reqHeroes = (run, req) => req && B.EVENT_REQ[req] ? run.heroes.filter(B.EVENT_REQ[req].ok) : run.heroes;
  const tierFor = run => run.fightNo > bossFight(run, 1) ? { epic: 0.45, set: 0.2, legendary: 0.35 } : { rare: 0.45, epic: 0.4, set: 0.15 };
  function rollOffer(run, id) {
    const o = {};
    if (id === 'mercs') { const have = new Set(run.heroes.map(h => h.key)); o.heroes = pickN(run, heroKeysOf(run).filter(k => !have.has(k)), 2); }
    if (id === 'legend') { const have = new Set(run.heroes.map(h => h.key)); o.heroes = pickN(run, heroKeysOf(run).filter(k => !have.has(k)), 1); }
    if (id === 'altar') o.relics = pickN(run, relicsOf(run).filter(r => !run.relics.includes(r.id)).map(r => r.id), 3);
    if (id === 'merchant') o.items = Array.from({ length: 3 }, () => { const t = wpick(run, tierFor(run)); return pick(run, itemsOf(run).filter(i => i.tier === t)).id; });
    if (id === 'fairy') { const pool = itemsOf(run).filter(i => i.tier === 'legendary'); o.items = pickN(run, pool.length ? pool : itemsOf(run).filter(i => i.tier === 'epic'), 2).map(i => i.id); }
    if (id === 'armory') {
      o.items = pickN(run, B.TYPES.map(t => t.id), 3).map(t => {
        const tier = wpick(run, run.fightNo > bossFight(run, 1) ? { rare: 0.4, epic: 0.35, set: 0.25 } : { uncommon: 0.3, rare: 0.45, epic: 0.15, set: 0.1 });
        const pool = itemsOf(run).filter(i => i.type === t && i.tier === tier);
        return pick(run, pool.length ? pool : itemsOf(run).filter(i => i.type === t && i.tier === 'rare')).id;
      });
    }
    if (id === 'collector') { const own = [...new Set(itemRefs(run).map(x => B.ITEM[x.id].set).filter(Boolean))]; o.set = own.length ? pick(run, own) : null; }
    return o;
  }
  // the concrete choices of the open event (dynamic events build theirs from the offer)
  function eventChoices(run) {
    const cur = run.cur, ev = B.EVENT[cur.id]; if (!ev) return [];
    if (!ev.dyn) return ev.choices.map(ch => resolve(run, ch));
    cur.offer = cur.offer || rollOffer(run, cur.id);
    const o = cur.offer;
    if (cur.id === 'mercs') return o.heroes.map(k => ({ label: `Hire ${B.HEROES[k].name}, ${B.HEROES[k].role.toLowerCase()}: ${B.HEROES[k].abName}`, act: 'hire:' + k, cost: 6, hero: k }))
      .concat([resolve(run, { label: 'Spar with them: +{x30} XP to all heroes', act: 'xpAll:{x30}' })]);
    // v44 (review #54): the actual relics and items on offer, to pick from
    if (cur.id === 'altar') {
      const r = o.relics || [], R = id => B.RELIC[id].name + ': ' + B.RELIC[id].desc, out = [];
      if (r[0]) out.push({ label: `Take ${R(r[0])} The next fight: enemies +30% HP`, act: 'relicPick:' + r[0], relic: r[0], next: { enemyHp: 0.3 }, risk: 'Enemies +30% HP next fight' });
      if (r[1]) out.push({ label: `Take ${R(r[1])} One hero pays: 10% less max HP for good`, act: 'relicBlood:0.1:' + r[1], relic: r[1], target: 'hero', risk: 'A hero loses 10% max HP' });
      if (r[2]) out.push({ label: `Buy ${R(r[2])}`, act: 'relicPick:' + r[2], relic: r[2], cost: 6 });
      return out.length ? out : [resolve(run, { label: 'The altar is empty: pray for +{x20} XP to all heroes', act: 'xpAll:{x20}' })];
    }
    if (cur.id === 'merchant') return o.items.map(id => ({ label: `${B.ITEM[id].name}: ${B.ITEM[id].desc}`, act: 'take:' + id, item: id, cost: Math.max(2, Math.round(C.itemCost[B.ITEM[id].tier] * 0.6)) }))
      .concat([{ label: 'Mystery box: 50% an epic item, 50% a common one', act: 'mystery', cost: 4, risk: 'It may be a common item' }]);
    if (cur.id === 'fairy') return [{ label: 'Dance with them: every hero gains a level', act: 'levelAll' }]
      .concat(o.items.map(id => ({ label: `Make a wish: ${B.ITEM[id].name}: ${B.ITEM[id].desc}`, act: 'take:' + id, item: id })));
    if (cur.id === 'legend') {
      const k = o.heroes[0], h = k && B.HEROES[k];
      return (h ? [{ label: `${h.name} joins your team for free, already at Lv 2 (${h.role.toLowerCase()}: ${h.abName})`, act: 'join:' + k, hero: k }] : [])
        .concat([resolve(run, { label: `Train with ${h ? h.name : 'the legend'}: +{x45} XP to all heroes`, act: 'xpAll:{x45}' }), { label: 'Ask for their old blade: a random epic item', act: 'item:epic' }]);
    }
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
    if (ch.target === 'hero') return reqHeroes(run, ch.req).filter(h => ch.act !== 'respec' || h.specs.length).map(h => ({ arg: String(h.uid), uid: h.uid }));
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
    if ((ch.act.startsWith('hire:') || ch.act.startsWith('join:')) && run.heroes.length >= teamMax(run)) return { ok: false, why: 'Your team is full' };
    if (ch.req && !reqHeroes(run, ch.req).length) return { ok: false, why: 'Needs ' + B.EVENT_REQ[ch.req].name, req: true };
    if (ch.act === 'transmute' && itemRefs(run).length < 2) return { ok: false, why: 'Needs two items' };
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
    while (t) { const pool = itemsOf(run).filter(i => i.type === it.type && i.tier === t && i.id !== id); if (pool.length) return pick(run, pool).id; t = RAR_UP[t]; }
    return null;
  }
  function randomRelic(run) { const pool = relicsOf(run).filter(r => !run.relics.includes(r.id)); if (!pool.length) return null; const r = pick(run, pool); gainRelic(run, r.id); return r; }
  function eventAct(run, i, arg) {
    const ch = eventChoices(run)[i];
    if (!canChoose(run, ch).ok) return null;
    let tgt = null;
    if (ch.target) { tgt = eventTargets(run, ch).find(x => x.arg === String(arg)); if (!tgt) return null; }
    if (ch.cost) run.gold -= ch.cost;
    const [a, x, y, z] = ch.act.split(':'); let msg = 'Nothing happens.';
    // v44: what the choice gave, shown as pictures on the event's result (kind: gold | xp | item | relic | hero | boost)
    const gains = [], got = (kind, v, t) => gains.push({ kind, v, t });
    const name = h => B.HEROES[h.key].name, hero = tgt && tgt.uid ? run.heroes.find(h => h.uid === tgt.uid) : null;
    const it = tgt && tgt.id ? itemAt(run, tgt.arg) : null, iname = id => B.ITEM[id].name;
    if (a === 'xpAll') { for (const h of run.heroes) gainXp(run, h, +x); msg = 'All heroes gained ' + x + ' XP.'; got('xp', +x); }
    else if (a === 'xpHero') { gainXp(run, hero, +x); msg = name(hero) + ' gained ' + x + ' XP.'; got('xp', +x, hero.key); }
    else if (a === 'hpAll') { for (const h of run.heroes) h.bonus.hpPct = (h.bonus.hpPct || 0) + (+x); msg = 'Your heroes feel sturdier (+' + Math.round(x * 100) + '% max HP).'; got('boost', '+' + Math.round(x * 100) + '% max HP'); }
    else if (a === 'hpHero') { hero.bonus.hpPct = (hero.bonus.hpPct || 0) + (+x); msg = name(hero) + ' gained +' + Math.round(x * 100) + '% max HP.'; got('boost', '+' + Math.round(x * 100) + '% max HP', hero.key); }
    else if (a === 'buffHero') { for (const k in ch.mods) hero.bonus[k] = (hero.bonus[k] || 0) + ch.mods[k]; msg = name(hero) + ' got stronger.'; got('boost', modsText(ch.mods), hero.key); }
    else if (a === 'buffAll') { for (const h of run.heroes) for (const k in ch.mods) h.bonus[k] = (h.bonus[k] || 0) + ch.mods[k]; msg = 'Every hero got stronger.'; got('boost', modsText(ch.mods)); }
    else if (a === 'gold') { run.gold += +x; msg = '+' + x + ' gold.'; got('gold', +x); }
    else if (a === 'item') { const id = randomItem(run, ['common', 'rare', 'epic'].includes(x) ? x : null); run.bag.push(id); msg = 'You got ' + iname(id) + '.'; got('item', id); }
    else if (a === 'typeItem') { const pool = itemsOf(run).filter(q => q.type === tgt.type && q.tier === x); const id = pick(run, pool).id; run.bag.push(id); msg = 'The merchant hands you ' + iname(id) + '.'; got('item', id); }
    else if (a === 'mystery') { const id = randomItem(run, rnd(run) < 0.5 ? 'epic' : 'common'); run.bag.push(id); msg = 'Inside the box: ' + iname(id) + '.'; got('item', id); }
    else if (a === 'sellFull') { const v = C.itemCost[B.ITEM[it.id].tier]; msg = 'Sold ' + iname(it.id) + ' for ' + v + ' gold.'; it.drop(); run.gold += v; got('gold', v); }
    else if (a === 'upgradeItem') { const nid = upgradedOf(run, it.id); if (nid) { msg = iname(it.id) + ' was reforged into ' + iname(nid) + '.'; it.set(nid); got('item', nid); } else { run.gold += ch.cost || 0; msg = 'Nothing better exists for that item. Your gold is returned.'; } }
    else if (a === 'gambleItem') {
      const nid = upgradedOf(run, it.id);
      if (nid && rnd(run) < 0.55) { msg = 'Luck! ' + iname(it.id) + ' became ' + iname(nid) + '.'; it.set(nid); got('item', nid); } else { msg = 'You lost ' + iname(it.id) + '.'; it.drop(); }
    }
    else if (a === 'gamble') { if (rnd(run) < +y) { run.gold += +z; msg = 'You won ' + z + ' gold!'; got('gold', +z); } else msg = 'You lost the bet.'; }
    else if (a === 'relic') { const r = randomRelic(run); msg = r ? 'You gained ' + r.name + '.' : 'You already own every relic.'; if (r) got('relic', r.id); }
    else if (a === 'relicPick') { if (run.relics.includes(x) || !B.RELIC[x]) { run.gold += ch.cost || 0; msg = 'You already own it. Your gold is returned.'; } else { gainRelic(run, x); msg = 'You gained ' + B.RELIC[x].name + '.'; got('relic', x); } }
    else if (a === 'relicBlood') {
      hero.bonus.hpPct = (hero.bonus.hpPct || 0) - (+x);
      let r = y && B.RELIC[y] && !run.relics.includes(y) ? B.RELIC[y] : null; if (r) gainRelic(run, r.id); else r = randomRelic(run);
      msg = name(hero) + ' paid in blood. ' + (r ? 'You gained ' + r.name + '.' : ''); if (r) got('relic', r.id);
    }
    else if (a === 'relicItem') { const was = iname(it.id); it.drop(); const r = randomRelic(run); msg = 'The shrine took ' + was + '. ' + (r ? 'You gained ' + r.name + '.' : ''); if (r) got('relic', r.id); }
    else if (a === 'respec') {
      const k = hero.specs.length - 1, pair = B.HEROES[hero.key].specs[k], was = hero.specs[k], now = pair[0].id === was ? pair[1] : pair[0];
      hero.specs[k] = now.id; msg = name(hero) + ' now follows ' + now.name + '.'; got('boost', '★ ' + now.name, hero.key);
    }
    else if (a === 'hire') { const h = addHero(run, x); msg = name(h) + ' joins your team!'; got('hero', x); }
    else if (a === 'join') { const h = addHero(run, x); gainXp(run, h, C.xpLevels[2] - h.xp); msg = name(h) + ' joins your team at Lv 2!'; got('hero', x); }
    else if (a === 'take') { run.bag.push(x); msg = 'You took ' + iname(x) + '.'; got('item', x); }
    else if (a === 'invest') { (run.bank = run.bank || []).push(+x); msg = 'The banker writes it down: ' + x + ' gold comes back after your next won fight.'; got('bank', +x); }
    else if (a === 'loan') { run.gold += +x; (run.bank = run.bank || []).push(-y); msg = '+' + x + ' gold now. ' + y + ' gold is paid back after your next won fight.'; got('gold', +x); }
    else if (a === 'levelAll') { for (const h of run.heroes) if (h.lvl < C.maxLevel) gainXp(run, h, C.xpLevels[h.lvl + 1] - h.xp); msg = 'The fairies dance with your team. Every hero gains a level!'; got('level', 1); }
    else if (a === 'transmute') {
      const refs = itemRefs(run).sort((p, q) => RAR_ORDER.indexOf(B.ITEM[p.id].tier) - RAR_ORDER.indexOf(B.ITEM[q.id].tier) || (p.arg[0] === 'b' ? -1 : 1)).slice(0, 2);
      const top = refs.map(r => B.ITEM[r.id].tier).sort((p, q) => RAR_ORDER.indexOf(q) - RAR_ORDER.indexOf(p))[0], names = refs.map(r => iname(r.id));
      let t = RAR_UP[top] || 'mythic'; while (t && !itemsOf(run).some(i => i.tier === t)) t = RAR_UP[t];
      // drop the two (worn ones by index, highest index first so the other stays valid)
      for (const r of refs.slice().sort((p, q) => q.arg.localeCompare(p.arg, undefined, { numeric: true }))) { const at = itemAt(run, r.arg); if (at) at.drop(); }
      const id = randomItem(run, t || top); run.bag.push(id); msg = names.join(' and ') + ' became ' + iname(id) + '.'; got('item', id);
    }
    else if (a === 'potion') {
      const h = pick(run, run.heroes), P = [{ hpPct: 0.15 }, { atkPct: 0.12 }, { ap: 30 }, { asPct: 0.12 }, { armor: 25, mr: 25 }, { crit: 0.1 }], m = pick(run, P);
      for (const k in m) h.bonus[k] = (h.bonus[k] || 0) + m[k]; msg = name(h) + ' drinks it: ' + modsText(m) + ' for good.'; got('boost', modsText(m), h.key);
    }
    else if (a === 'mimic') {
      if (rnd(run) < 0.65) { const id = randomItem(run, 'epic'); run.bag.push(id); msg = 'Just a chest! Inside: ' + iname(id) + '.'; got('item', id); }
      else { startChallenge(run, { kind: 'mimic', name: 'Mimic', win: { item: 'legendary' } }, null, 'The chest was a Mimic! Beat it for a legendary item.'); return 'mimic'; }
    }
    else if (a === 'fight') { startChallenge(run, ch.fight, hero); return 'fight'; }
    else if (a === 'setPiece') {
      const own = new Set(itemRefs(run).map(q => q.id)), S = run.cur.offer && run.cur.offer.set && B.SETS[run.cur.offer.set];
      let pool = S ? S.pieces.filter(id => !own.has(id)) : [];
      if (!pool.length) pool = itemsOf(run).filter(q => q.set && !own.has(q.id)).map(q => q.id);
      if (!pool.length) { run.gold += ch.cost || 0; msg = 'You already own every set piece. Your gold is returned.'; }
      else { const id = pick(run, pool); run.bag.push(id); msg = 'You got ' + iname(id) + '.'; got('item', id); }
    }
    else if (a === 'tradeSet') {
      const own = new Set(itemRefs(run).map(q => q.id)), pool = itemsOf(run).filter(q => q.set && !own.has(q.id));
      if (!pool.length) msg = 'You already own every set piece.';
      else { const was = iname(it.id); it.drop(); const id = pick(run, pool).id; run.bag.push(id); msg = 'Traded ' + was + ' for ' + iname(id) + '.'; got('item', id); }
    }
    if (ch.next) {
      const M = run.nextMod = run.nextMod || {};
      for (const k in ch.next) M[k] = typeof ch.next[k] === 'number' ? (M[k] || 0) + ch.next[k] : ch.next[k];
      msg += ' It will matter in your next fight.';
    }
    run.cur.done = msg; run.cur.gains = gains; return msg;
  }
  const MOD_NAME = { hpPct: ['max HP', 1], atkPct: ['attack', 1], asPct: ['attack speed', 1], crit: ['crit chance', 1], ap: ['AP', 0], atk: ['attack', 0], armor: ['armor', 0], mr: ['magic resist', 0], manaStart: ['starting mana', 0], cleanseOnce: ['ignores the first crowd control', -1] };
  function modsText(m) {
    return Object.keys(m).map(k => { const d = MOD_NAME[k] || [k, 0]; return d[1] < 0 ? d[0] : (m[k] > 0 ? '+' : '') + (d[1] ? Math.round(m[k] * 100) + '%' : m[k]) + ' ' + d[0]; }).join(', ');
  }
  // v44 (review #54): a challenge fight from an event starts right away. Its enemies depend on the kind; it does not count
  // as a step of the day (the event is the step) and a loss does not end the run.
  // how strong each challenge is (enemy scale = the fight's own scale x this; the guardian uses the next boss's scale).
  // Tuned with tools/challenge-odds.js for a real risk (random teams, won after fights 3/5/7): bandits ~85%, mimic ~70%,
  // horde ~65%, pack ~60%, duel ~55%, the hoard's guardian ~60% (it only shows up from fight 2 on).
  const CH = { solo: 1.1, bandits: 1.4, pack: 1.3, horde: 1.0, mimic: 1.6, hoard: 1.0 };
  function startChallenge(run, c, hero, intro) {
    const n = Math.max(1, run.fightNo || 1), fs = run.fightScale || C.fightScale;
    let f;
    if (c.kind === 'solo') f = makeFight(run, 'medium', n, 0, { keys: [n <= 2 ? 'brute' : 'knight'], elites: 1, scaleMul: CH.solo });
    else if (c.kind === 'bandits') f = makeFight(run, 'medium', n, 0, { elites: 1, scaleMul: CH.bandits });
    else if (c.kind === 'pack') f = makeFight(run, 'hard', n, 0, { elites: 1, scaleMul: CH.pack });
    else if (c.kind === 'horde') f = makeFight(run, 'horde', n, 0, { scaleMul: CH.horde });
    else if (c.kind === 'mimic') f = makeFight(run, 'medium', n, 0, { keys: n <= 1 ? ['golem', 'bomber', 'bomber'] : ['golem', 'knight', 'bomber', 'bomber', 'skulker'], elites: 1, scaleMul: CH.mimic });
    else {
      const nth = n < bossFight(run, 1) ? 1 : 2;
      f = makeFight(run, 'boss', n + 1, nth, { scaleMul: CH.hoard }); f.fightNo = n;
    }
    f.gold = c.win.gold || 0;
    f.challenge = { name: c.name, kind: c.kind, win: c.win, intro: intro || '' };
    if (c.kind === 'solo' && hero) { f.solo = hero.uid; f.challenge.hero = hero.key; }
    run.cur = f; run.phase = 'deploy';
  }
  function challengeReward(run, f, res) {
    const w = f.challenge.win || {};
    if (w.item) { const id = randomItem(run, w.item); run.bag.push(id); res.prize = id; }
    if (w.relic) { const r = randomRelic(run); if (r) res.relic = r.id; }
    const solo = f.solo && run.heroes.find(h => h.uid === f.solo);
    if (w.xp) { for (const h of solo ? [solo] : run.heroes) gainXp(run, h, w.xp); res.bonusXp = w.xp; }
    if (w.boost && solo) { for (const k in w.boost) solo.bonus[k] = (solo.bonus[k] || 0) + w.boost[k]; res.boost = { key: solo.key, text: modsText(w.boost) }; }
  }

  B.Run = { mapOf, blockedAt, gauntletMap, newRun, pickStart, heroDef, heroMods, slots, specOf, gainXp, chooseSpec, autoPlace, setPos, makeFight, fightWorld,
    finishFight, advance, choose, reroll, rerollCost, buy, leave, equip, unequip, sell, sellValue,
    eventAct, teamMax, addHero, gainRelic, rnd, migrate, teamSnapshot, gauntletWorld, gauntletUpdate, canEquip, setCounts, setBonuses, seqOf, bossFight,
    eventChoices, eventTargets, canChoose, itemRefs, upgradedOf, reqHeroes, evScale, pickEvent, startChallenge, CH };
  if (typeof module !== 'undefined') module.exports = B.Run;
})(typeof window !== 'undefined' ? window : globalThis);
