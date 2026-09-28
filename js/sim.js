// Combat engine. Pure and deterministic (seeded RNG), runs in the browser and in Node (tools/ + tests).
// Fixed step: TPS ticks per second. The renderer interpolates between hexes using fc/fr (from hex) and m0t/m1t
// (move start/end tick): a unit occupies its destination hex the moment it starts moving, and the tick it lands
// (m1t) is the same tick its next action (attack windup or cast) starts.
(function (G) {
  const B = G.B = G.B || {};
  const Hx = B.Hex;
  const TPS = 20;
  const sec = s => Math.round(s * TPS);

  function rngOf(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ------------------------------------------------------------------ world
  function create(o) {
    const W = {
      t: 0, nid: 0, units: [], byId: {}, occ: new Array(Hx.COLS * Hx.ROWS).fill(0), q: [], fx: [], zones: [],
      rng: rngOf(o.seed || 1), mode: o.mode || 'fight', over: false, winner: -1, kills: 0, wave: 0, nextWave: 0,
      sd: 0, fightNo: o.fightNo || 1, fl: {}, once: {}, onsBase: o.onsBase || 2.8, log: [],
    };
    for (const id of (o.relics || [])) { const r = B.RELIC[id]; if (r && r.fl) W.fl[r.fl] = 1; }
    for (const h of (o.heroes || [])) spawn(W, h.def, 0, h.c, h.r);
    for (const e of (o.enemies || [])) spawn(W, e.def, 1, e.c, e.r);
    if (!o.noStart) start(W);
    return W;
  }

  function spawn(W, def, side, c, r) {
    if (W.occ[Hx.key(c, r)]) { const f = freeNear(W, c, r); if (!f) return null; c = f.c; r = f.r; }
    const m = def.m || {};
    const u = {
      id: ++W.nid, side, kind: def.kind || 'mob', key: def.key, name: def.name, glyph: def.glyph, color: def.color || null,
      uid: def.uid || 0, lvl: def.lvl || 1, boss: def.boss || 0, elite: def.elite || null, owner: def.owner || 0,
      c, r, fc: c, fr: r, m0t: W.t, m1t: W.t,
      maxHp: Math.round(def.hp), hp: Math.round(def.hp), atk: def.atk, ap: def.ap || 100, armor: def.armor || 0, mr: def.mr || 0,
      as: def.as, range: def.range, ms: def.ms, crit: def.crit || 0, critDmg: def.critDmg || 1.5, ls: def.ls || 0,
      dodge: Math.min(0.6, def.dodge || 0), maxMana: def.mana || 0, mana: 0,
      abil: def.abil || null, ab: def.ab || {}, fl: new Set(def.fl || []), m,
      shield: 0, shieldU: 0, st: {}, buffs: [], dots: [], busy: W.t, nextAtk: W.t, tgt: 0, atkN: 0, focus: 0, titan: 0,
      once: {}, xpT: 0, dead: false, anim: null, alpha: def.alpha || 1, size: def.size || 1, explode: def.explode || 0,
      tStun: def.tStun || 0, moved: false, hitT: -99, castT: -99, wave: def.wave || 0, scale: def.scale || 1,
    };
    u.mana = Math.min(u.maxMana, (def.m0 || 0) + (m.manaStart || 0));
    const sh = (m.shieldStart || 0) + (m.shieldStartPct || 0) * u.maxHp;
    if (sh > 0) { u.shield = sh; u.shieldU = W.t + sec(8); }
    W.units.push(u); W.byId[u.id] = u; W.occ[Hx.key(c, r)] = u.id;
    return u;
  }

  function start(W) {
    // auras (static, from starting positions) and start-of-fight effects
    for (const u of W.units) {
      for (const a of (u.m.aura || [])) for (const v of allies(W, u)) {
        if (a.r < 9 && (v === u || Hx.dist(u, v) > a.r)) continue;
        if (a.stat === 'armor' || a.stat === 'mr') v[a.stat] += a.val; else buff(v, a.stat, a.val, 1e9);
      }
    }
    for (const u of W.units) {
      if (u.fl.has('dive')) dive(W, u);
      if (u.fl.has('factory')) A.turret(W, u, true);
      if (u.fl.has('prison')) {
        const t = enemies(W, u).sort((a, b) => b.maxHp - a.maxHp)[0];
        if (t) { cc(W, t, 'stun', 3); t.st.frozenU = W.t + sec(3); fxRing(W, t.c, t.r, 0, '#8ef', 12); }
      }
    }
    if (W.fl.frostsigil) for (const u of W.units) if (u.side === 1) slow(W, u, 0.4, 4);
    if (W.mode === 'onslaught') W.nextWave = W.t + 1;
  }

  // ------------------------------------------------------------------ queries
  const alive = u => u && !u.dead;
  const enemies = (W, u) => W.units.filter(v => !v.dead && v.side !== u.side);
  const allies = (W, u) => W.units.filter(v => !v.dead && v.side === u.side);
  const targetable = (W, v) => !v.dead && !(v.st.untarg > W.t);
  function freeNear(W, c, r, maxR = 8) {
    // nearest free hex (BFS ring order), ties broken deterministically by the rng
    for (let rad = 0; rad <= maxR; rad++) {
      const ring = Hx.all().filter(h => Hx.dist(h, { c, r }) === rad && !W.occ[Hx.key(h.c, h.r)]);
      if (ring.length) return ring[Math.floor(W.rng() * ring.length)];
    }
    return null;
  }
  function freeNeighbors(W, c, r) { return Hx.neighbors(c, r).filter(h => !W.occ[Hx.key(h.c, h.r)]); }
  function bestCluster(W, u, rad) {
    let best = null, bc = -1;
    for (const e of enemies(W, u)) {
      const n = enemies(W, u).filter(o => Hx.dist(o, e) <= rad).length;
      if (n > bc || (n === bc && Hx.dist(u, e) < Hx.dist(u, best))) { bc = n; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------ stats with buffs
  function buff(u, s, v, dur, W) { u.buffs.push({ s, v, until: dur >= 1e9 ? 1e12 : (W ? W.t : 0) + dur }); }
  function bsum(W, u, s) { let x = 0; for (const b of u.buffs) if (b.s === s && b.until > W.t) x += b.v; return x; }
  const atkOf = (W, u) => Math.max(1, u.atk * (1 + bsum(W, u, 'atkPct')) + u.titan * 3);
  const armorOf = (W, u) => u.armor + bsum(W, u, 'armor') + u.titan * 3;
  const lsOf = (W, u) => u.ls + bsum(W, u, 'ls');
  const apF = u => u.ap / 100;
  function asOf(W, u) {
    let a = u.as * (1 + bsum(W, u, 'asPct') + u.focus * (u.ab.focus || 0));
    if (u.st.slowU > W.t) a *= 1 - u.st.slowP * 0.5;
    return Math.min(3.5, Math.max(0.2, a));
  }
  function msOf(W, u) { let m = u.ms; if (u.st.slowU > W.t) m *= 1 - u.st.slowP; return Math.max(0.5, m); }

  // ------------------------------------------------------------------ scheduling & fx
  function at(W, t, fn) { W.q.push({ t, fn }); }
  function fx(W, o) { o.t0 = o.t0 ?? W.t; W.fx.push(o); }
  function fxNum(W, u, v, color, big) { fx(W, { k: 'num', c: u.c, r: u.r, id: u.id, text: String(v), color, big: !!big, t1: W.t + 16 }); }
  function fxRing(W, c, r, rad, color, dur = 8) { fx(W, { k: 'ring', c, r, rad, color, t1: W.t + dur }); }
  function fxText(W, u, text, color) { fx(W, { k: 'text', c: u.c, r: u.r, id: u.id, text, color, t1: W.t + 24 }); }

  // ------------------------------------------------------------------ status effects
  function ccImmune(W, u) { return u.fl.has('juggernaut') && u.hp > u.maxHp * 0.5; }
  function cc(W, u, kind, s) {
    if (!alive(u) || s <= 0) return;
    if (ccImmune(W, u)) { fxText(W, u, 'IMMUNE', '#fff'); return; }
    if (u.m.cleanseOnce && !u.once.cleanse) { u.once.cleanse = 1; fxText(W, u, 'CLEANSED', '#fff'); return; }
    const d = sec(s * (u.boss ? 0.5 : 1));
    u.st[kind] = Math.max(u.st[kind] || 0, W.t + d);
  }
  function slow(W, u, p, s) {
    if (!alive(u) || ccImmune(W, u)) return;
    const until = W.t + sec(s);
    if (!(u.st.slowU > W.t) || p >= u.st.slowP) { u.st.slowP = p; u.st.slowU = until; } else u.st.slowU = Math.max(u.st.slowU, until);
  }
  function shield(W, u, amt, s) { if (!alive(u)) return; u.shield = (u.shieldU > W.t ? u.shield : 0) + amt; u.shieldU = Math.max(u.shieldU, W.t + sec(s)); }
  function dot(W, u, k, v, s, src) { if (!alive(u) || v <= 0) return; u.dots.push({ k, v, until: W.t + sec(s), src: src ? src.id : 0 }); }
  function heal(W, u, amt, show) {
    if (!alive(u) || amt <= 0) return 0;
    let m = 1 + (u.m.healPower || 0); if (u.st.antiHealU > W.t) m *= 0.5;
    const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + amt * m);
    const got = Math.round(u.hp - before);
    if (show && got >= 5) fxNum(W, u, '+' + got, '#6f6');
    return got;
  }

  // ------------------------------------------------------------------ damage
  function deal(W, src, tgt, raw, type, o = {}) {
    if (!alive(tgt) || raw <= 0) return 0;
    if (tgt.st.invuln > W.t) { if (!o.dot) fxText(W, tgt, 'IMMUNE', '#fff'); return 0; }
    if (o.atk && tgt.dodge > 0 && W.rng() < tgt.dodge) { fxText(W, tgt, 'miss', '#ccc'); return 0; }
    let dmg = raw, crit = false;
    if (src && (o.atk || o.canCrit) && (o.forceCrit || W.rng() < src.crit)) { dmg *= src.critDmg; crit = true; }
    let amp = 1 + W.sd;
    if (src) {
      amp += bsum(W, src, 'dmgAmp');
      if (src.m.giantSlayer && tgt.maxHp > src.maxHp) amp += src.m.giantSlayer;
      if (src.m.execute && tgt.hp < tgt.maxHp * 0.3) amp += src.m.execute;
      if (src.m.eliteDmg && (tgt.elite || tgt.boss)) amp += src.m.eliteDmg;
      if (W.mode === 'onslaught' && src.side === 0 && W.fl.onslaught) amp += 0.3;
    }
    if (tgt.st.vulnU > W.t) amp += tgt.st.vulnP;
    if (tgt.st.shatterU > W.t) amp += tgt.st.shatterP;
    dmg *= amp;
    if (type === 'phys') { const arm = Math.max(0, armorOf(W, tgt) * (1 - Math.min(0.9, (src ? src.m.armorPen || 0 : 0) + (o.pen || 0)))); dmg *= 100 / (100 + arm); }
    else if (type === 'magic') dmg *= 100 / (100 + Math.max(0, tgt.mr));
    dmg = Math.max(1, Math.round(dmg));
    let abs = 0;
    if (tgt.shield > 0 && tgt.shieldU > W.t) { abs = Math.min(tgt.shield, dmg); tgt.shield -= abs; dmg -= abs; }
    tgt.hp -= dmg; tgt.hitT = W.t;
    const total = dmg + abs;
    if (src) src.dmgDone = (src.dmgDone || 0) + total;
    tgt.dmgTaken = (tgt.dmgTaken || 0) + total;
    if (!o.dot) fxNum(W, tgt, total, crit ? '#ffd23f' : type === 'magic' ? '#c9a2ff' : type === 'true' ? '#fff' : '#ff8a8a', crit);
    if (src && alive(src)) {
      if (o.atk && lsOf(W, src) > 0) heal(W, src, total * lsOf(W, src));
      if (o.ability && src.m.omni) heal(W, src, total * src.m.omni);
      if (o.ability && src.m.abilityBurn && !o.dot) dot(W, tgt, 'burn', src.m.abilityBurn * tgt.maxHp, 3, src);
      if (o.atk && !o.noThorns && tgt.m.thorns && Hx.dist(src, tgt) <= 1) deal(W, tgt, src, total * tgt.m.thorns, 'magic', { noThorns: true });
    }
    if (tgt.maxMana > 0 && !o.dot) tgt.mana = Math.min(tgt.maxMana, tgt.mana + 3);
    if (tgt.m.titan && !o.dot) tgt.titan = Math.min(20, tgt.titan + 0.5);
    if (tgt.fl.has('laststand') && !tgt.once.ls && tgt.hp > 0 && tgt.hp < tgt.maxHp * 0.3) {
      tgt.once.ls = 1; tgt.st.invuln = W.t + sec(2); fxText(W, tgt, 'LAST STAND', '#ffd23f'); A.bulwark(W, tgt);
    }
    if (tgt.hp <= 0) die(W, tgt, src);
    return total;
  }

  function reviveAt(W, u, frac, label) {
    u.dead = false; u.hp = Math.max(1, Math.round(u.maxHp * frac)); u.dots = []; u.st = {}; u.busy = W.t + sec(0.4);
    if (W.occ[Hx.key(u.c, u.r)] && W.occ[Hx.key(u.c, u.r)] !== u.id) { const f = freeNear(W, u.c, u.r); if (!f) { u.dead = true; return false; } u.c = f.c; u.r = f.r; }
    u.fc = u.c; u.fr = u.r; u.m0t = u.m1t = W.t;
    W.occ[Hx.key(u.c, u.r)] = u.id;
    fxText(W, u, label, '#ffe066'); fxRing(W, u.c, u.r, 0, '#ffe066', 12);
    return true;
  }

  function die(W, u, src) {
    if (u.fl.has('phaseshift') && !u.once.phase) {
      u.once.phase = 1; u.hp = 1; heal(W, u, u.maxHp * 0.3, true); u.st.untarg = W.t + sec(2); fxText(W, u, 'PHASE SHIFT', '#ff6fb5'); return;
    }
    if (u.m.revive && !u.once.revive) { u.once.revive = 1; u.hp = Math.round(u.maxHp * u.m.revive); u.dots = []; fxText(W, u, 'REVIVE', '#ffe066'); return; }
    if (u.side === 0 && u.kind === 'hero' && W.fl.feather && !W.once.feather) { W.once.feather = 1; u.hp = Math.round(u.maxHp * 0.3); u.dots = []; fxText(W, u, 'PHOENIX', '#ff7a3d'); return; }
    u.dead = true; u.hp = 0; u.deathT = W.t; u.anim = null;
    if (W.occ[Hx.key(u.c, u.r)] === u.id) W.occ[Hx.key(u.c, u.r)] = 0;
    if (u.side === 1 && !u.suicide) W.kills++;
    // on-death effects
    if (u.m.onDeathHeal) for (const a of allies(W, u)) if (Hx.dist(a, u) <= 2) heal(W, a, a.maxHp * u.m.onDeathHeal, true);
    if (u.explode > 0) { for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) { deal(W, u, e, u.explode, 'magic', { ability: true }); slow(W, e, 0.3, 2); } fxRing(W, u.c, u.r, 1, '#ff6fb5'); }
    const burner = u.dots.find(d => d.k === 'burn' && d.until > W.t && W.byId[d.src] && W.byId[d.src].fl.has('combustion'));
    if (burner) { const s = W.byId[burner.src]; for (const e of enemies(W, s)) if (Hx.dist(e, u) <= 1) deal(W, s, e, 0.6 * atkOf(W, s) * apF(s), 'magic', { ability: true }); fxRing(W, u.c, u.r, 1, '#ff7a3d'); }
    for (const v of W.units) {
      if (v.dead) continue;
      if (v.fl.has('gravepact') && v.side !== u.side && Hx.dist(v, u) <= 3) v.mana = Math.min(v.maxMana, v.mana + 15);
      if (v.fl.has('soulharvest')) heal(W, v, v.maxHp * 0.05);
    }
    if (u.side === 0 && u.kind === 'hero') {
      if (W.fl.vengeance) for (const a of allies(W, u)) if (a.kind === 'hero') { buff(a, 'atkPct', 0.2, 1e9); fxText(W, a, 'VENGEANCE', '#f66'); }
      const lum = allies(W, u).find(a => a.fl.has('resurrect') && !a.once.res);
      if (lum) { lum.once.res = 1; at(W, W.t + sec(1), () => { if (u.dead && !W.over) reviveAt(W, u, 0.5, 'RESURRECTED'); }); }
    }
    if (src && alive(src)) {
      if (src.fl.has('bloodrush')) { src.mana = Math.min(src.maxMana, src.mana + src.maxMana * 0.6); buff(src, 'asPct', 0.3, sec(3), W); }
      if (src.fl.has('rampage')) src.mana = Math.min(src.maxMana, src.mana + src.maxMana * 0.5);
    }
  }

  // ------------------------------------------------------------------ movement
  function place(W, u, c, r, dur) {
    // move u to (c,r); dur in ticks (0 = instant blink). Occupancy changes immediately.
    if (W.occ[Hx.key(u.c, u.r)] === u.id) W.occ[Hx.key(u.c, u.r)] = 0;
    const T = W.t;
    // if mid-move, start the new move from the current interpolated spot's hex (visual continuity is good enough)
    u.fc = dur > 0 ? u.c : c; u.fr = dur > 0 ? u.r : r; u.c = c; u.r = r; u.m0t = T; u.m1t = T + Math.max(0, dur);
    W.occ[Hx.key(c, r)] = u.id;
    if (dur === 0) { u.fc = c; u.fr = r; }
  }
  function pathStep(W, u, goalFn) {
    const N = Hx.COLS * Hx.ROWS, prev = new Int16Array(N).fill(-1), seen = new Uint8Array(N);
    const sk = Hx.key(u.c, u.r); const q = [sk]; seen[sk] = 1; let goal = -1;
    for (let i = 0; i < q.length; i++) {
      const k = q[i], c = k % Hx.COLS, r = (k / Hx.COLS) | 0;
      if (k !== sk && goalFn(c, r)) { goal = k; break; }
      for (const n of Hx.neighbors(c, r)) { const nk = Hx.key(n.c, n.r); if (seen[nk] || W.occ[nk]) continue; seen[nk] = 1; prev[nk] = k; q.push(nk); }
    }
    if (goal < 0) return null;
    let k = goal; while (prev[k] !== sk) k = prev[k];
    return { c: k % Hx.COLS, r: (k / Hx.COLS) | 0 };
  }
  function tryMove(W, u, tgt) {
    if (u.ms <= 0 || u.st.root > W.t) return false;
    let step = pathStep(W, u, (c, r) => Hx.dist({ c, r }, tgt) <= u.range);
    if (!step) { // target boxed in: go for anything reachable
      const es = enemies(W, u).filter(e => targetable(W, e));
      step = pathStep(W, u, (c, r) => es.some(e => Hx.dist({ c, r }, e) <= u.range));
    }
    if (!step) return false;
    const tph = Math.max(2, Math.round(TPS / msOf(W, u)));
    place(W, u, step.c, step.r, tph);
    u.busy = u.m1t; u.moved = true;
    return true;
  }
  function blink(W, u, c, r) { fx(W, { k: 'blink', c: u.c, r: u.r, color: u.color || '#fff', t1: W.t + 8 }); place(W, u, c, r, 0); fx(W, { k: 'blink', c, r, color: u.color || '#fff', t1: W.t + 8 }); }
  function dive(W, u) {
    const t = enemies(W, u).sort((a, b) => Math.abs(b.r - u.r) - Math.abs(a.r - u.r))[0];
    if (!t) return; const n = freeNeighbors(W, t.c, t.r); if (!n.length) return;
    const h = n[Math.floor(W.rng() * n.length)]; blink(W, u, h.c, h.r); u.tgt = t.id;
  }

  // ------------------------------------------------------------------ targeting & attacks
  function pickTarget(W, u) {
    if (u.st.tauntU > W.t) { const t = W.byId[u.st.tauntBy]; if (alive(t) && targetable(W, t)) return t; }
    const cur = W.byId[u.tgt];
    if (alive(cur) && targetable(W, cur) && Hx.dist(u, cur) <= Math.max(1, u.range)) return cur;
    let best = null, bd = 99;
    for (const e of W.units) {
      if (e.dead || e.side === u.side || !targetable(W, e)) continue;
      const d = Hx.dist(u, e);
      if (d < bd || (d === bd && e.hp < best.hp)) { bd = d; best = e; }
    }
    if (best) u.tgt = best.id;
    return best;
  }
  function startAttack(W, u, tgt) {
    const a = asOf(W, u);
    const wt = Math.min(12, Math.max(3, Math.round(TPS * 0.45 / a)));
    u.anim = { k: 'atk', t0: W.t, t1: W.t + wt, tid: tgt.id, ranged: u.range > 1 };
    u.busy = W.t + wt; u.nextAtk = W.t + Math.max(wt + 1, Math.round(TPS / a)); u.tgt = tgt.id;
    at(W, W.t + wt, () => {
      if (u.dead || u.st.stun > W.t) return;
      if (u.abil === 'explode') { A.explode(W, u); return; }
      if (u.range > 1) {
        const d = Math.max(1, Hx.dist(u, tgt)), tt = Math.max(2, Math.round(d * 2.2));
        fx(W, { k: 'proj', from: u.id, fc: u.c, fr: u.r, to: tgt.id, tc: tgt.c, tr: tgt.r, color: u.side ? '#f99' : '#9df', t1: W.t + tt });
        at(W, W.t + tt, () => onHit(W, u, tgt));
      } else onHit(W, u, tgt);
    });
  }
  function onHit(W, u, tgt) {
    if (!alive(tgt)) return;
    let mult = 1;
    if (u.backstab) { mult *= u.backstab; u.backstab = 0; }
    if (u.m.firstMoveAtk && u.moved) mult *= 1 + u.m.firstMoveAtk;
    u.moved = false;
    if (u.fl.has('sniper')) mult *= 1 + 0.08 * Hx.dist(u, tgt);
    const atk = atkOf(W, u);
    const dealt = deal(W, u, tgt, atk * mult, 'phys', { atk: true });
    u.atkN++;
    if (!u.dead) { u.mana = Math.min(u.maxMana, u.mana + 10 + (u.m.manaOnHit || 0)); if (u.ab.focus) u.focus = Math.min(u.ab.focusCap || 15, u.focus + 1); if (u.m.titan) u.titan = Math.min(20, u.titan + 0.5); }
    if (dealt <= 0) return;
    const m = u.m;
    if (m.burnOnHit) dot(W, tgt, 'burn', m.burnOnHit * atk, 3, u);
    if (m.poisonOnHit) dot(W, tgt, 'poison', m.poisonOnHit * tgt.maxHp * (tgt.boss ? 0.4 : 1), 3, u);
    if (m.slowOnHit) slow(W, tgt, m.slowOnHit, 1.5);
    if (m.antiHeal) tgt.st.antiHealU = W.t + sec(3);
    if (m.curHpOnHit && alive(tgt)) deal(W, u, tgt, Math.min(tgt.hp * m.curHpOnHit, atk * 3), 'phys', {});
    if (m.onHitMagic && alive(tgt)) deal(W, u, tgt, atk * m.onHitMagic, 'magic', {});
    if (u.tStun && u.atkN % 3 === 0) cc(W, tgt, 'stun', u.tStun);
    if (m.splash) for (const e of enemies(W, u)) if (e !== tgt && Hx.dist(e, tgt) <= 1) deal(W, u, e, atk * m.splash, 'phys', {});
    if (m.multishot) {
      const o = enemies(W, u).filter(e => e !== tgt && targetable(W, e)).sort((a, b) => Hx.dist(u, a) - Hx.dist(u, b))[0];
      if (o) { fx(W, { k: 'proj', from: u.id, fc: u.c, fr: u.r, to: o.id, tc: o.c, tr: o.r, color: '#9df', t1: W.t + 4 }); deal(W, u, o, atk * m.multishot, 'phys', {}); }
    }
    if (m.chainEvery && u.atkN % m.chainEvery === 0) chain(W, u, tgt, m.chainTargets || 2, atk * (m.chainDmg || 0.6), 0, 0, false);
  }
  function chain(W, u, first, n, dmg, stun, falloff, isAb) {
    const hit = [first], pts = [[u.c, u.r], [first.c, first.r]];
    let last = first;
    for (let i = 1; i < n; i++) {
      const nx = enemies(W, u).filter(e => !hit.includes(e) && Hx.dist(e, last) <= 3).sort((a, b) => Hx.dist(a, last) - Hx.dist(b, last))[0];
      if (!nx) break; hit.push(nx); pts.push([nx.c, nx.r]); last = nx;
    }
    fx(W, { k: 'bolt', pts, color: '#d8c8ff', t1: W.t + 6 });
    hit.forEach((e, i) => { deal(W, u, e, dmg * Math.max(0.3, 1 - falloff * i), 'magic', { ability: isAb }); if (stun) cc(W, e, 'stun', stun); });
    return hit;
  }

  // ------------------------------------------------------------------ summons
  function summon(W, owner, def, near) {
    const n = near || owner;
    const f = freeNeighbors(W, n.c, n.r);
    const h = f.length ? f[Math.floor(W.rng() * f.length)] : freeNear(W, n.c, n.r, 3);
    if (!h) return null;
    const u = spawn(W, Object.assign({ kind: 'summon', owner: owner.id }, def), owner.side, h.c, h.r);
    if (u) { u.busy = W.t + sec(0.3); fxRing(W, h.c, h.r, 0, owner.color || '#fff', 8); }
    return u;
  }
  function mobScaleDef(key, scale, extra) {
    const m = B.MOBS[key] || B.BOSSES[key];
    const d = { key, name: m.name, glyph: m.glyph, kind: m.boss ? 'boss' : 'mob', boss: m.boss || 0,
      hp: m.hp * scale, atk: m.atk * (1 + 0.8 * (scale - 1)), armor: m.armor + 4 * (scale - 1), mr: m.mr + 4 * (scale - 1),
      as: m.as, range: m.range, ms: m.ms, mana: m.mana || 0, m0: m.m0 || 0, abil: m.abil || null, fl: (m.fl || []).slice(),
      m: {}, size: m.boss ? 1.35 : 1, scale };
    if (m.poison) d.m.poisonOnHit = m.poison;
    if (m.shield) d.m.shieldStart = m.shield * scale;
    if (extra) Object.assign(d, extra);
    return d;
  }
  function applyElite(d, el) {
    d.elite = el.id; d.name = el.name + ' ' + d.name; const m = el.mods;
    if (m.hpPct) d.hp *= 1 + m.hpPct; if (m.atkPct) d.atk *= 1 + m.atkPct; if (m.armor) d.armor += m.armor; if (m.mr) d.mr += m.mr;
    if (m.ls) d.m.ls = m.ls, d.ls = m.ls; if (m.asPct) d.as *= 1 + m.asPct; if (m.ms) d.ms += m.ms;
    d.hp *= 1.3; d.atk *= 1.15; return d;
  }

  // ------------------------------------------------------------------ abilities
  const A = {};
  A.bulwark = (W, u) => {
    const ab = u.ab, amt = u.maxHp * ab.shield * (0.5 + 0.5 * apF(u));
    shield(W, u, amt, 4);
    for (const e of enemies(W, u)) if (Hx.dist(e, u) <= ab.radius) {
      e.st.tauntU = W.t + sec(ab.taunt); e.st.tauntBy = u.id; e.tgt = u.id;
      if (ab.stun) cc(W, e, 'stun', ab.stun);
    }
    if (ab.allyShield) for (const a of allies(W, u)) if (a !== u && Hx.dist(a, u) <= 2) shield(W, a, amt * ab.allyShield, 4);
    if (ab.burst) for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) deal(W, u, e, amt * ab.burst, 'magic', { ability: true });
    fxRing(W, u.c, u.r, ab.radius, '#4f7cff', 10);
    return true;
  };
  A.shadowstep = (W, u) => {
    const ab = u.ab;
    const ts = enemies(W, u).filter(e => targetable(W, e)).sort((a, b) => a.hp - b.hp);
    for (const t of ts) {
      const n = freeNeighbors(W, t.c, t.r).sort((a, b) => Hx.dist(b, u) - Hx.dist(a, u));
      if (!n.length && Hx.dist(u, t) > 1) continue;
      if (Hx.dist(u, t) > 1) blink(W, u, n[0].c, n[0].r);
      deal(W, u, t, ab.dmg * atkOf(W, u), 'phys', { ability: true, canCrit: true, forceCrit: u.fl.has('ambush') });
      if (alive(t) && ab.execute && !t.boss && t.hp < t.maxHp * ab.execute) { fxText(W, t, 'EXECUTE', '#f44'); deal(W, u, t, t.hp + t.shield + 1, 'true', {}); }
      if (alive(t) && ab.mark) { t.st.vulnU = W.t + sec(5); t.st.vulnP = Math.max(t.st.vulnP || 0, ab.mark); }
      if (ab.twin) { const o = enemies(W, u).filter(e => e !== t && Hx.dist(e, t) <= 2)[0]; if (o) deal(W, u, o, ab.dmg * ab.twin * atkOf(W, u), 'phys', { ability: true }); }
      if (ab.untarg) u.st.untarg = W.t + sec(ab.untarg);
      u.tgt = t.id; u.nextAtk = W.t + 4;
      return true;
    }
    return false;
  };
  function fireballAt(W, u, center, mult, patch) {
    const ab = u.ab, c = center.c, r = center.r;
    const tt = Math.max(3, Hx.dist(u, center) * 2);
    fx(W, { k: 'proj', from: u.id, fc: u.c, fr: u.r, tc: c, tr: r, color: '#ff7a3d', size: 2, t1: W.t + tt });
    at(W, W.t + tt, () => {
      fxRing(W, c, r, ab.radius, '#ff7a3d', 10);
      for (const e of enemies(W, u)) if (Hx.dist(e, { c, r }) <= ab.radius) {
        deal(W, u, e, ab.dmg * mult * atkOf(W, u) * apF(u), 'magic', { ability: true });
        dot(W, e, 'burn', ab.burn * atkOf(W, u) * apF(u), 3, u);
        if (ab.stun) cc(W, e, 'stun', ab.stun);
      }
      if (patch) W.zones.push({ c, r, rad: ab.radius, until: W.t + sec(ab.patch), dps: 0.4 * atkOf(W, u) * apF(u), side: u.side, src: u.id, color: '#ff7a3d' });
    });
  }
  A.fireball = (W, u) => {
    const t = bestCluster(W, u, u.ab.radius); if (!t) return false;
    fireballAt(W, u, { c: t.c, r: t.r }, 1, u.ab.patch > 0);
    if (u.ab.twin) { const o = enemies(W, u).filter(e => Hx.dist(e, t) > u.ab.radius).sort((a, b) => Hx.dist(u, a) - Hx.dist(u, b))[0]; if (o) fireballAt(W, u, { c: o.c, r: o.r }, u.ab.twin, false); }
    return true;
  };
  A.blizzard = (W, u) => {
    const ab = u.ab, t = bestCluster(W, u, ab.radius); if (!t) return false;
    fxRing(W, t.c, t.r, ab.radius, '#8ef', 14);
    for (const e of enemies(W, u)) if (Hx.dist(e, t) <= ab.radius) {
      deal(W, u, e, ab.dmg * atkOf(W, u) * apF(u), 'magic', { ability: true });
      cc(W, e, 'stun', ab.freeze); e.st.frozenU = e.st.stun;
      slow(W, e, ab.slow, ab.freeze + 2);
      if (ab.shatter) { e.st.shatterU = e.st.stun; e.st.shatterP = ab.shatter; }
    }
    if (ab.iceArmor) {
      shield(W, u, u.maxHp * ab.iceArmor, 4);
      const w = allies(W, u).filter(a => a !== u).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (w) shield(W, w, w.maxHp * ab.iceArmor, 4);
    }
    return true;
  };
  A.charge = (W, u) => {
    const ab = u.ab;
    const cands = enemies(W, u).filter(e => Hx.dist(u, e) <= ab.reach).sort((a, b) => Hx.dist(u, b) - Hx.dist(u, a));
    let dest = null;
    for (const t of cands) {
      const n = freeNeighbors(W, t.c, t.r).sort((a, b) => Hx.dist(a, u) - Hx.dist(b, u));
      if (Hx.dist(u, t) <= 1) { dest = { c: u.c, r: u.r }; break; }
      if (n.length) { dest = n[0]; break; }
    }
    if (!dest) return false;
    const d = Hx.dist(u, dest), dur = Math.max(2, d * 3);
    if (d > 0) place(W, u, dest.c, dest.r, dur);
    u.busy = W.t + dur;
    at(W, W.t + dur, () => {
      if (u.dead) return;
      fxRing(W, u.c, u.r, 1, '#c4513a', 10);
      for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) {
        deal(W, u, e, ab.dmg * atkOf(W, u), 'phys', { ability: true });
        cc(W, e, 'stun', ab.stun);
        if (ab.sunder) buff(e, 'armor', -ab.sunder, sec(5), W);
      }
      buff(u, 'ls', ab.lsBuff, sec(4), W);
      if (ab.frenzy) buff(u, 'asPct', ab.frenzy, sec(4), W);
    });
    return true;
  };
  A.radiance = (W, u) => {
    const ab = u.ab;
    const pool = allies(W, u); const heroes = pool.filter(a => a.kind !== 'summon');
    const t = (heroes.length ? heroes : pool).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!t) return false;
    heal(W, t, t.maxHp * ab.heal * apF(u), true);
    for (const a of pool) if (a !== t && Hx.dist(a, t) <= ab.radius) heal(W, a, a.maxHp * ab.splash * apF(u), true);
    if (ab.shield) shield(W, t, t.maxHp * ab.shield, 4);
    if (ab.regen) dot(W, t, 'regen', t.maxHp * ab.regen, 5, u);
    if (ab.cleanse) for (const a of pool) if (Hx.dist(a, t) <= ab.radius) { a.st.stun = 0; a.st.root = 0; a.st.silence = 0; a.st.slowU = 0; a.st.frozenU = 0; }
    if (ab.smite) { const e = enemies(W, u).sort((a, b) => Hx.dist(u, a) - Hx.dist(u, b))[0]; if (e) { deal(W, u, e, ab.smite * atkOf(W, u) * apF(u), 'magic', { ability: true }); fxRing(W, e.c, e.r, 0, '#ffe066', 8); } }
    fxRing(W, t.c, t.r, ab.radius, '#ffe066', 10);
    return true;
  };
  A.volley = (W, u) => {
    const ab = u.ab; const es = enemies(W, u).filter(e => targetable(W, e)); if (!es.length) return false;
    const list = ab.all ? es : Array.from({ length: ab.count }, () => es[Math.floor(W.rng() * es.length)]);
    list.forEach((e, i) => {
      const tt = 3 + Math.round(Hx.dist(u, e) * 1.5) + i;
      fx(W, { k: 'proj', from: u.id, fc: u.c, fr: u.r, to: e.id, tc: e.c, tr: e.r, color: '#bfb', t0: W.t + i, t1: W.t + tt });
      at(W, W.t + tt, () => deal(W, u, e, ab.dmg * atkOf(W, u), 'phys', { ability: true, canCrit: true }));
    });
    return true;
  };
  A.raise = (W, u) => {
    const ab = u.ab, lv = 1 + 0.15 * (u.lvl - 1);
    const n = ab.colossus ? 1 : ab.count;
    for (let i = 0; i < n; i++) {
      const big = !!ab.colossus;
      const d = { key: 'skeleton', name: big ? 'Bone Colossus' : 'Skeleton', glyph: big ? '🦴' : '☠', color: '#cfd6e6',
        hp: 300 * lv * ab.hpMul * apF(u) * (big ? 4 : 1) * (ab.archers && !big ? 0.7 : 1), atk: 30 * lv * apF(u) * (big ? 2 : 1),
        armor: 10, mr: 10, as: 0.9, range: ab.archers && !big ? 3 : 1, ms: 2.5, explode: ab.explode ? atkOf(W, u) * ab.explode * apF(u) : 0, size: big ? 1.2 : 0.85 };
      const s = summon(W, u, d);
      if (s && big) for (const e of enemies(W, u)) if (Hx.dist(e, s) <= 2) { e.st.tauntU = W.t + sec(2.5); e.st.tauntBy = s.id; }
    }
    return true;
  };
  A.chain = (W, u) => {
    const ab = u.ab;
    const first = alive(W.byId[u.tgt]) && W.byId[u.tgt].side !== u.side ? W.byId[u.tgt] : pickTarget(W, u);
    if (!first) return false;
    chain(W, u, first, ab.bounces, ab.dmg * atkOf(W, u) * apF(u), ab.stun, ab.falloff, true);
    if (u.fl.has('surge')) for (const a of allies(W, u)) if (Hx.dist(a, u) <= 2) buff(a, 'asPct', 0.3, sec(4), W);
    if (ab.twice) at(W, W.t + 10, () => { if (!u.dead) { const f = pickTarget(W, u); if (f) chain(W, u, f, ab.bounces, ab.dmg * atkOf(W, u) * apF(u), ab.stun, ab.falloff, true); } });
    return true;
  };
  A.hook = (W, u) => {
    const ab = u.ab;
    const ts = enemies(W, u).filter(e => targetable(W, e) && Hx.dist(u, e) <= ab.reach).sort((a, b) => Hx.dist(u, b) - Hx.dist(u, a));
    if (!ts.length) return false;
    for (const t of ts.slice(0, ab.count)) {
      fx(W, { k: 'bolt', pts: [[u.c, u.r], [t.c, t.r]], color: '#2fb3a0', t1: W.t + 6 });
      if (!t.boss && Hx.dist(u, t) > 1) {
        const n = freeNeighbors(W, u.c, u.r).sort((a, b) => Hx.dist(a, t) - Hx.dist(b, t))[0];
        if (n) { place(W, t, n.c, n.r, 5); t.busy = Math.max(t.busy, W.t + 5); t.anim = null; }
      }
      deal(W, u, t, ab.dmg * atkOf(W, u), 'phys', { ability: true });
      cc(W, t, 'stun', ab.stun);
      if (ab.vuln) { t.st.vulnU = W.t + sec(4); t.st.vulnP = Math.max(t.st.vulnP || 0, ab.vuln); }
    }
    if (ab.whirl) at(W, W.t + 6, () => { if (u.dead) return; fxRing(W, u.c, u.r, 1, '#2fb3a0', 8); for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) { deal(W, u, e, atkOf(W, u), 'phys', { ability: true }); slow(W, e, 0.3, 2); } });
    if (ab.pullAll) for (const e of enemies(W, u)) if (!e.boss && Hx.dist(e, u) <= 3 && Hx.dist(e, u) > 1) {
      const n = freeNeighbors(W, e.c, e.r).filter(h => Hx.dist(h, u) < Hx.dist(e, u))[0];
      if (n) { place(W, e, n.c, n.r, 5); e.busy = Math.max(e.busy, W.t + 5); }
      cc(W, e, 'stun', 1);
    }
    return true;
  };
  A.mirror = (W, u) => {
    const ab = u.ab, k = ab.stat;
    for (let i = 0; i < ab.count; i++) {
      const s = summon(W, u, { key: 'clone', name: 'Mirror Image', glyph: u.glyph, color: u.color, alpha: 0.55,
        hp: u.maxHp * k, atk: atkOf(W, u) * k, armor: u.armor * k, mr: u.mr * k, as: u.as, range: u.range, ms: u.ms,
        explode: ab.explode ? atkOf(W, u) * ab.explode : 0 });
      if (s && ab.silence) for (const e of enemies(W, u)) if (Hx.dist(e, s) <= 1) cc(W, e, 'silence', ab.silence);
    }
    // blink to the safest hex within 3
    const es = enemies(W, u);
    const opts = Hx.all().filter(h => !W.occ[Hx.key(h.c, h.r)] && Hx.dist(h, u) <= 3);
    let best = null, bs = -1;
    for (const h of opts) { const s = Math.min(...es.map(e => Hx.dist(e, h)), 99); if (s > bs) { bs = s; best = h; } }
    if (best) blink(W, u, best.c, best.r);
    if (ab.backstab) u.backstab = ab.backstab;
    return true;
  };
  A.turret = (W, u, free) => {
    const ab = u.ab;
    const mine = W.units.filter(v => !v.dead && v.owner === u.id && v.key === 'turret');
    if (mine.length >= ab.max && !free) { for (const t of mine) heal(W, t, t.maxHp * 0.5, true); heal(W, u, u.maxHp * 0.1, true); return true; }
    const lv = 1 + 0.15 * (u.lvl - 1);
    const e0 = enemies(W, u).sort((a, b) => Hx.dist(u, a) - Hx.dist(u, b))[0];
    const n = freeNeighbors(W, u.c, u.r).sort((a, b) => e0 ? Hx.dist(a, e0) - Hx.dist(b, e0) : 0)[0];
    summon(W, u, { key: 'turret', name: 'Turret', glyph: '🗼', color: '#d9a441', hp: 340 * lv * ab.hpMul, atk: 0.8 * atkOf(W, u),
      armor: 20, mr: 20, as: (ab.mortar ? 0.6 : 1) * ab.asMul, range: ab.mortar ? 6 : 3, ms: 0, tStun: ab.stun || 0,
      m: { burnOnHit: ab.burn || 0, splash: ab.mortar ? 0.5 : 0 }, size: 0.85 }, n || u);
    return true;
  };
  // --- mob & boss abilities
  A.smash = (W, u) => { const t = pickTarget(W, u); if (!t || Hx.dist(u, t) > 1) return false; deal(W, u, t, 2.5 * atkOf(W, u), 'phys', { ability: true }); cc(W, t, 'stun', 0.8); fxRing(W, t.c, t.r, 0, '#f96', 8); return true; };
  A.mend = (W, u) => { const t = allies(W, u).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (!t || t.hp >= t.maxHp) return false; heal(W, t, t.maxHp * 0.25, true); fxRing(W, t.c, t.r, 0, '#6f6', 8); return true; };
  A.explode = (W, u) => { if (u.dead) return true; fxRing(W, u.c, u.r, 1, '#fa0', 12); for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) deal(W, u, e, 2.5 * atkOf(W, u), 'magic', { ability: true }); u.m.revive = 0; u.once.revive = 1; u.suicide = true; die(W, u, null); return true; };
  A.wall = (W, u) => { for (const a of allies(W, u)) if (Hx.dist(a, u) <= 2) shield(W, a, a.maxHp * 0.2, 4); fxRing(W, u.c, u.r, 2, '#ccc', 10); return true; };
  A.curse = (W, u) => { const t = pickTarget(W, u); if (!t || Hx.dist(u, t) > u.range) return false; deal(W, u, t, atkOf(W, u), 'magic', { ability: true }); cc(W, t, 'silence', 2); slow(W, t, 0.4, 2); fxRing(W, t.c, t.r, 0, '#b6f', 10); return true; };
  A.slam = (W, u) => { if (!enemies(W, u).some(e => Hx.dist(e, u) <= 1)) return false; fxRing(W, u.c, u.r, 1, '#aaa', 10); for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) { deal(W, u, e, 1.5 * atkOf(W, u), 'phys', { ability: true }); cc(W, e, 'stun', 1); } return true; };
  A.imps = (W, u) => { for (let i = 0; i < 2; i++) summon(W, u, mobScaleDef('imp', u.scale || 1)); return true; };
  A.cleave = (W, u) => { if (!enemies(W, u).some(e => Hx.dist(e, u) <= 1)) return false; fxRing(W, u.c, u.r, 1, '#f44', 12); for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) { deal(W, u, e, 2 * atkOf(W, u), 'phys', { ability: true }); cc(W, e, 'stun', 0.8); } return true; };
  A.nova = (W, u) => { if (!enemies(W, u).some(e => Hx.dist(e, u) <= 2)) return false; fxRing(W, u.c, u.r, 2, '#a4f', 14); for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 2) { deal(W, u, e, 1.5 * atkOf(W, u), 'magic', { ability: true }); cc(W, e, 'stun', 1); } return true; };

  function bossPassives(W, u) {
    const f = u.hp / u.maxHp;
    if (u.key === 'gorewarden') {
      if (f < 0.5 && !u.once.horde) { u.once.horde = 1; fxText(W, u, 'CALL THE HORDE', '#f44'); for (let i = 0; i < 3; i++) summon(W, u, mobScaleDef('grunt', u.scale || 1)); }
      if (f < 0.25 && !u.once.enrage) { u.once.enrage = 1; fxText(W, u, 'ENRAGED', '#f44'); buff(u, 'asPct', 0.6, 1e9); buff(u, 'atkPct', 0.2, 1e9); }
    }
    if (u.key === 'hollowking') {
      if (W.t % sec(6) === 0) {
        const t = enemies(W, u).filter(e => e.kind === 'hero').sort((a, b) => a.hp - b.hp)[0];
        if (t) { fx(W, { k: 'bolt', pts: [[u.c, u.r], [t.c, t.r]], color: '#a4f', t1: W.t + 8 }); deal(W, u, t, 1.2 * atkOf(W, u), 'magic', { ability: true }); }
      }
      for (const [th, key] of [[0.66, 'split1'], [0.33, 'split2']]) if (f < th && !u.once[key]) {
        u.once[key] = 1; fxText(W, u, 'THE COURT RISES', '#a4f');
        for (let i = 0; i < 2; i++) summon(W, u, mobScaleDef('skulker', u.scale || 1));
        const opts = Hx.all().filter(h => h.r <= 2 && !W.occ[Hx.key(h.c, h.r)]);
        if (opts.length) { const h = opts[Math.floor(W.rng() * opts.length)]; blink(W, u, h.c, h.r); }
      }
    }
  }

  // ------------------------------------------------------------------ per-unit turn
  function act(W, u) {
    if (u.boss) bossPassives(W, u);
    if (W.t < u.busy || u.st.stun > W.t) return;
    u.anim = null;
    if (u.abil && u.maxMana > 0 && u.mana >= u.maxMana && !(u.st.silence > W.t) && !(u.castFail > W.t)) {
      if (A[u.abil](W, u)) { u.mana = 0; u.castT = W.t; if (u.busy < W.t + 6) u.busy = W.t + 6; fx(W, { k: 'cast', id: u.id, color: u.color || '#fff', t1: W.t + 10 }); return; }
      u.castFail = W.t + 10;
    }
    const tgt = pickTarget(W, u);
    if (!tgt) return;
    if (u.abil === 'explode' && Hx.dist(u, tgt) <= 1) { A.explode(W, u); return; }
    if (Hx.dist(u, tgt) <= u.range) { if (W.t >= u.nextAtk) startAttack(W, u, tgt); }
    else if (!tryMove(W, u, tgt)) { /* blocked: wait a moment */ u.busy = W.t + 2; }
  }

  function periodic(W, u) {
    const m = u.m;
    if (m.regen) heal(W, u, u.maxHp * m.regen / TPS);
    if (m.manaRegen && u.maxMana) u.mana = Math.min(u.maxMana, u.mana + m.manaRegen / TPS);
    if (W.t % 10 === 0) {
      for (const d of u.dots) if (d.until >= W.t) {
        if (d.k === 'regen') heal(W, u, d.v * 0.5);
        else deal(W, W.byId[d.src] || null, u, d.v * 0.5, d.k === 'burn' ? 'magic' : 'true', { dot: true });
        if (u.dead) return;
      }
      u.dots = u.dots.filter(d => d.until > W.t);
      if (m.sunfire) for (const e of enemies(W, u)) if (Hx.dist(e, u) <= 1) deal(W, u, e, m.sunfire * u.maxHp * 0.5, 'magic', { dot: true });
    }
    if (W.t % TPS === 0) {
      if (m.apPerSec) u.ap += m.apPerSec;
      if (u.fl.has('thunderstorm') && W.t % sec(3) === 0) { const es = enemies(W, u); if (es.length) { const e = es[Math.floor(W.rng() * es.length)]; fx(W, { k: 'bolt', pts: [[e.c, e.r - 2], [e.c, e.r]], color: '#fff6a0', t1: W.t + 6 }); deal(W, u, e, atkOf(W, u) * apF(u), 'magic', { ability: true }); } }
    }
    if (u.kind === 'hero' && u.side === 0) u.xpT++;
  }

  // ------------------------------------------------------------------ onslaught waves
  const WAVE_POOL = [['grunt', 'wolf'], ['archer'], ['brute', 'spitter'], ['shaman', 'skulker'], ['bomber', 'hexer'], ['golem', 'summoner', 'shieldbearer', 'knight']];
  function onsScale(W, w) { return W.onsBase * (1 + 0.14 * (w - 1)) * Math.pow(1.03, w - 1); }
  function spawnWave(W) {
    W.wave++;
    const w = W.wave, n = Math.min(8, 3 + Math.floor(w / 2)), scale = onsScale(W, w);
    const pool = [].concat(...WAVE_POOL.slice(0, Math.min(WAVE_POOL.length, 1 + Math.floor((w + 1) / 2))));
    const free = [0, 1].flatMap(r => Hx.all().filter(h => h.r === r && !W.occ[Hx.key(h.c, h.r)]));
    const eliteChance = Math.max(0, (w - 6) * 0.08);
    const toSpawn = [];
    if (w % 10 === 0) toSpawn.push(mobScaleDef(w % 20 === 0 ? 'hollowking' : 'gorewarden', scale * 0.5, { wave: w }));
    while (toSpawn.length < n) {
      const d = mobScaleDef(pool[Math.floor(W.rng() * pool.length)], scale, { wave: w });
      if (W.rng() < eliteChance) applyElite(d, B.ELITES[Math.floor(W.rng() * B.ELITES.length)]);
      toSpawn.push(d);
    }
    // row 0 first, in random order
    const row0 = free.filter(h => h.r === 0).sort(() => W.rng() - 0.5), row1 = free.filter(h => h.r === 1).sort(() => W.rng() - 0.5);
    const spots = row0.concat(row1);
    for (const d of toSpawn) { const h = spots.shift(); if (!h) break; const u = spawn(W, d, 1, h.c, h.r); if (u) { u.busy = W.t + 4; fxRing(W, h.c, h.r, 0, '#f66', 10); if (u.fl.has('dive')) dive(W, u); } }
    fx(W, { k: 'banner', text: 'Wave ' + w, t1: W.t + 30 });
  }

  // ------------------------------------------------------------------ main step
  function step(W) {
    if (W.over) return;
    W.t++;
    if (W.q.length) {
      const due = W.q.filter(e => e.t <= W.t); W.q = W.q.filter(e => e.t > W.t);
      for (const e of due) { e.fn(); if (W.over) break; }
    }
    if (W.mode === 'fight' && W.t > sec(B.CFG.suddenDeath) && W.t % TPS === 0) { W.sd += 0.15; if (W.t === sec(B.CFG.suddenDeath) + TPS) fx(W, { k: 'banner', text: 'Sudden death', t1: W.t + 40 }); }
    if (W.mode === 'onslaught' && W.t >= W.nextWave) { spawnWave(W); W.nextWave = W.t + sec(B.CFG.waveEvery); }
    if (W.fl.thunder && W.t % sec(4) === 0) {
      const es = W.units.filter(v => !v.dead && v.side === 1);
      if (es.length) { const e = es[Math.floor(W.rng() * es.length)]; fx(W, { k: 'bolt', pts: [[e.c, e.r - 2], [e.c, e.r]], color: '#fff6a0', t1: W.t + 6 }); deal(W, null, e, 60 + 30 * W.fightNo + 5 * W.wave, 'magic', {}); }
    }
    if (W.zones.length && W.t % 10 === 0) {
      W.zones = W.zones.filter(z => z.until > W.t);
      for (const z of W.zones) for (const e of W.units) if (!e.dead && e.side !== z.side && Hx.dist(e, z) <= z.rad) deal(W, W.byId[z.src] || null, e, z.dps * 0.5, 'magic', { dot: true });
    }
    const list = W.units.filter(u => !u.dead);
    for (const u of list) if (!u.dead) periodic(W, u);
    for (const u of list) if (!u.dead) act(W, u);
    if (W.t % 40 === 0) { W.fx = W.fx.filter(f => f.t1 > W.t - 20); if (W.units.length > 120) W.units = W.units.filter(u => !u.dead || W.t - u.deathT < 40 || u.kind === 'hero'); }
    // end conditions
    const heroes = W.units.some(u => !u.dead && u.side === 0 && u.kind === 'hero');
    const foes = W.units.some(u => !u.dead && u.side === 1);
    if (!heroes) { W.over = true; W.winner = 1; }
    else if (W.mode === 'fight' && !foes) { W.over = true; W.winner = 0; }
    else if (W.mode === 'fight' && W.t >= sec(B.CFG.fightCap)) { W.over = true; W.winner = 1; W.timeout = true; }
  }

  function run(W, maxTicks = 20 * 60 * 30) { while (!W.over && W.t < maxTicks) step(W); return W; }

  // interpolated position (in hex coordinates as fractional pixel, via callback) for rendering at fractional tick T
  function posAt(u, T, size) {
    const a = B.Hex.px(u.fc, u.fr, size), b = B.Hex.px(u.c, u.r, size);
    let p = u.m1t > u.m0t ? (T - u.m0t) / (u.m1t - u.m0t) : 1; p = Math.max(0, Math.min(1, p));
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
  }

  B.Sim = { TPS, sec, create, step, run, spawn, posAt, mobScaleDef, applyElite, rngOf, atkOf, asOf, abilities: A };
  if (typeof module !== 'undefined') module.exports = B.Sim;
})(typeof window !== 'undefined' ? window : globalThis);
