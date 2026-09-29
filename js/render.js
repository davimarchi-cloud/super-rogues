// Canvas renderer: 2.5D board (hex grid squashed vertically, stone slab with thickness) and the unit models from
// models.js. Positions come from the sim in flat board pixels (posAt) and are projected here, so movement between
// hexes stays smooth and a unit lands on its hex exactly when its attack windup starts.
(function (G) {
  const B = G.B = G.B || {};
  const Hx = B.Hex;
  const K = 0.6; // vertical squash of the board = camera tilt

  function setup(canvas, cssW) {
    const size = cssW / (Math.sqrt(3) * (Hx.COLS + 0.5));
    const flat = Hx.boardSize(size), top = size * 2.4, slab = size * 0.45;
    const w = flat.w, h = top + flat.h * K + slab + 4;
    const dpr = Math.min(3, G.devicePixelRatio || 1);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, size, w, h, top, slab, dpr, grit: grit(ctx) };
  }
  // review #8: stone texture for the tiles (made once, deterministic)
  let gritCanvas = null;
  function grit(ctx) {
    if (!gritCanvas && typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 900; i++) { const v = r() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${0.04 + r() * 0.08})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      for (let i = 0; i < 7; i++) { let x = r() * 128, y = r() * 128; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
      gritCanvas = c;
    }
    return gritCanvas ? ctx.createPattern(gritCanvas, 'repeat') : null;
  }
  const proj = (v, p) => ({ x: p.x, y: v.top + p.y * K });
  const hexScreen = (v, c, r) => proj(v, Hx.px(c, r, v.size));
  function corners(v, c, r, s) {
    const p = Hx.px(c, r, v.size), out = [];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); out.push(proj(v, { x: p.x + s * Math.cos(a), y: p.y + s * Math.sin(a) })); }
    return out;
  }
  function path(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
  function hexAt(v, x, y) {
    let best = null, bd = 1e9;
    for (const h of Hx.all()) { const p = hexScreen(v, h.c, h.r); const d = (p.x - x) ** 2 + ((p.y - y) / K) ** 2; if (d < bd) { bd = d; best = h; } }
    return bd <= v.size * v.size * 1.1 ? best : null;
  }
  // flat position (with attack lunge) of a unit at fractional tick T
  function flatPos(v, W, u, T) {
    const p = B.Sim.posAt(u, T, v.size), a = u.anim;
    if (a && a.k === 'atk' && T >= a.t0 && T <= a.t1 && !a.ranged) {
      const t = W.byId[a.tid];
      if (t) {
        const q = B.Sim.posAt(t, T, v.size), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
        const k = (T - a.t0) / Math.max(1, a.t1 - a.t0), e = k < 0.75 ? k / 0.75 * 0.35 : 0.35 + (k - 0.75) / 0.25 * 0.65;
        p.x += dx / d * v.size * 0.4 * e; p.y += dy / d * v.size * 0.4 * e;
      }
    }
    return p;
  }
  const unitPos = (v, W, u, T) => proj(v, flatPos(v, W, u, T));

  // ------------------------------------------------------------------ board
  // v27 (owner + review #25): the King Tier's Royal board skin (B.Render.skin = 'royal'): violet and gold stone
  const royal = () => B.Render.skin === 'royal';
  function tileColor(c, r, o) {
    const n = ((c * 7 + r * 13) % 5) / 5;
    if (royal()) {
      if (o.deploy) return r >= 4 ? `hsl(266,36%,${21 + n * 4}%)` : `hsl(345,28%,${17 + n * 3}%)`;
      return (c + r) % 2 ? `hsl(268,30%,${17 + n * 4}%)` : `hsl(38,34%,${18 + n * 4}%)`;
    }
    // v29 (owner: "more child friendly"): a sunny meadow; while deploying, your rows glow sky blue and theirs soft red
    if (o.deploy) return r >= 4 ? `hsl(205,62%,${58 + n * 5}%)` : `hsl(4,58%,${63 + n * 4}%)`;
    return (c + r) % 2 ? `hsl(104,46%,${50 + n * 5}%)` : `hsl(96,44%,${56 + n * 5}%)`;
  }
  function drawBoard(v, o) {
    const { ctx, size } = v, th = v.slab;
    for (let r = 0; r < Hx.ROWS; r++) for (let c = 0; c < Hx.COLS; c++) {
      const pts = corners(v, c, r, size * 0.985);
      // side faces of the two lower edges (hidden by the next row except at the board's edge)
      for (const [i, j] of [[0, 1], [1, 2], [2, 3]]) {
        ctx.fillStyle = royal() ? (i === 1 ? '#1c1206' : i === 0 ? '#3a2a10' : '#2a1d0a') : i === 1 ? '#6b4524' : i === 0 ? '#8a5a2e' : '#7a4f28';
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.lineTo(pts[j].x, pts[j].y + th); ctx.lineTo(pts[i].x, pts[i].y + th); ctx.closePath(); ctx.fill();
      }
      const top = corners(v, c, r, size * 0.94);
      path(ctx, top);
      const drop = o.drop && o.drop.c === c && o.drop.r === r;
      ctx.fillStyle = drop ? '#ffe066' : tileColor(c, r, o); ctx.fill();
      if (v.grit) { ctx.globalAlpha = royal() ? 1 : 0.35; ctx.fillStyle = v.grit; ctx.fill(); ctx.globalAlpha = 1; }
      // bevel: lit upper-left edges, shaded lower-right edges
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = royal() ? 'rgba(255,207,90,0.38)' : 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(top[3].x, top[3].y); ctx.lineTo(top[4].x, top[4].y); ctx.lineTo(top[5].x, top[5].y); ctx.lineTo(top[0].x, top[0].y); ctx.stroke();
      ctx.strokeStyle = royal() ? 'rgba(0,0,0,0.45)' : 'rgba(40,70,20,0.35)'; ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y); ctx.lineTo(top[1].x, top[1].y); ctx.lineTo(top[2].x, top[2].y); ctx.lineTo(top[3].x, top[3].y); ctx.stroke();
    }
    if (o.deploy) { const y = hexScreen(v, 0, 4).y - size * 0.75 * K; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(v.w, y); ctx.stroke(); ctx.setLineDash([]); }
  }

  // ------------------------------------------------------------------ units
  function poseOf(W, u, T) {
    const s = W.t, pose = { t: T / 20 + u.id * 0.37, face: 1 };
    // facing: toward the target, else toward the enemy side
    const tgt = W.byId[u.tgt];
    if (tgt && !tgt.dead) { const a = B.Sim.posAt(u, T, 10), b = B.Sim.posAt(tgt, T, 10); if (Math.abs(b.x - a.x) > 1) pose.face = b.x > a.x ? 1 : -1; else pose.face = u.side === 0 ? 1 : -1; }
    else if (u.m1t > u.m0t && T < u.m1t) pose.face = u.c >= u.fc ? 1 : -1;
    else pose.face = u.side === 0 ? 1 : -1;
    if (u.m1t > u.m0t && T >= u.m0t && T < u.m1t && u.ms > 0) pose.walk = ((T - u.m0t) / Math.max(1, u.m1t - u.m0t)) % 1;
    const a = u.anim; if (a && a.k === 'atk' && T >= a.t0 && T <= a.t1) pose.atk = (T - a.t0) / Math.max(1, a.t1 - a.t0);
    if (T - u.castT >= 0 && T - u.castT < 14) pose.cast = (T - u.castT) / 14;
    if (u.dead) pose.dead = Math.min(1, (W.t - u.deathT) / 12);
    void s; return pose;
  }
  function drawUnit(v, W, u, p, T, o) {
    const { ctx, size } = v, s = W.t;
    const S = size * 1.3 * u.size;
    let alpha = u.alpha; if (u.st.untarg > s) alpha *= 0.45;
    ctx.globalAlpha = Math.max(0, alpha);
    // selection / side ring on the ground
    const hero = u.side === 0;
    ctx.strokeStyle = o.sel && o.sel === u.uid && hero ? '#ffffff' : u.elite ? '#ffcf5a' : hero ? 'rgba(95,168,255,0.8)' : 'rgba(224,85,85,0.8)';
    ctx.lineWidth = o.sel && o.sel === u.uid ? 3 : 1.6;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, S * 0.5, S * 0.5 * K * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    const pose = poseOf(W, u, T);
    const mk = u.key === 'clone' ? 'mirage' : u.key, art = B.Art && B.Art.sprite(mk);
    if (art) B.Art.draw(ctx, art, p.x, p.y, S, pose, u.color || (hero ? '#9df' : '#f99'));
    else B.Models.draw(ctx, mk, p.x, p.y, S, pose, u.color || (hero ? '#9df' : '#f99'));
    if (W.t - u.hitT < 3 && !u.dead) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(p.x, p.y - S * 0.6, S * 0.35, S * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    if (u.st.frozenU > s) { ctx.globalAlpha = 0.45; ctx.fillStyle = '#9fe8ff'; ctx.beginPath(); ctx.moveTo(p.x, p.y - S * 1.45); ctx.lineTo(p.x + S * 0.42, p.y - S * 0.7); ctx.lineTo(p.x, p.y + S * 0.05); ctx.lineTo(p.x - S * 0.42, p.y - S * 0.7); ctx.closePath(); ctx.fill(); }
    if (u.shield > 0 && u.shieldU > s && !u.dead) { ctx.globalAlpha = 0.25; ctx.strokeStyle = '#e8ecff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y - S * 0.62, S * 0.5, S * 0.8, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (u.dead) return;
    // bars above the head
    const headTop = p.y - S * (u.boss ? 1.75 : 1.5), bw = Math.max(S * 0.95, size * 1.1), bx = p.x - bw / 2, by = headTop - 10;
    ctx.fillStyle = '#000b'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = hero ? '#5fd47a' : '#e05555'; ctx.fillRect(bx, by, bw * Math.max(0, u.hp / u.maxHp), 4);
    if (u.shield > 0 && u.shieldU > s) { ctx.fillStyle = '#e8ecff'; ctx.fillRect(bx, by, Math.min(bw, bw * u.shield / u.maxHp), 2); }
    if (u.maxMana > 0) { ctx.fillStyle = '#000b'; ctx.fillRect(bx - 1, by + 5, bw + 2, 3); ctx.fillStyle = '#5fa8ff'; ctx.fillRect(bx, by + 5, bw * Math.min(1, u.mana / u.maxMana), 2); }
    if (u.lvl > 1 && hero && u.kind === 'hero') { ctx.font = "700 10px 'Fredoka', 'Nunito', system-ui, sans-serif"; ctx.fillStyle = '#ffcf5a'; ctx.textAlign = 'left'; ctx.fillText(u.lvl, bx + bw + 2, by + 5); }
    const marks = [];
    if (u.st.stun > s && !(u.st.frozenU > s)) marks.push('✦');
    if (u.st.silence > s) marks.push('⊘');
    if (u.st.tauntU > s) marks.push('!');
    if (u.dots.some(d => d.k === 'burn' && d.until > s)) marks.push('🔥');
    if (u.dots.some(d => d.k === 'poison' && d.until > s)) marks.push('☣');
    if (u.st.slowU > s) marks.push('↓');
    if (marks.length) { ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe066'; ctx.fillText(marks.join(''), p.x, by - 3); }
    if (u.st.stun > s && !(u.st.frozenU > s)) { ctx.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = T / 3 + i * 2.1; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * S * 0.3, headTop + 4 + Math.sin(a) * S * 0.08, 2.2, 0, Math.PI * 2); ctx.fill(); } }
  }

  // ------------------------------------------------------------------ frame
  function draw(v, W, T, o = {}) {
    const { ctx, size } = v;
    const S = fxState(v), now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = Math.min(0.05, S.last ? now - S.last : 0.016); S.last = now;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    if (S.shake > 0.2 && !o.deploy) { ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake); S.shake *= Math.pow(0.02, dt); } else S.shake = 0;
    const bg = ctx.createRadialGradient(v.w / 2, v.h * 0.55, v.w * 0.1, v.w / 2, v.h * 0.55, v.w * 0.8);
    if (royal()) { bg.addColorStop(0, '#2c1f40'); bg.addColorStop(1, '#0c0913'); } else { bg.addColorStop(0, '#bfe6ff'); bg.addColorStop(1, '#6fb2f2'); }
    ctx.fillStyle = bg; ctx.fillRect(0, 0, v.w, v.h);
    drawBoard(v, o);
    if (!W) return;
    for (const z of W.zones) if (z.until > W.t) for (const h of Hx.within(z.c, z.r, z.rad)) {
      path(ctx, corners(v, h.c, h.r, size * 0.88)); ctx.fillStyle = 'rgba(255,122,61,' + (0.2 + 0.08 * Math.sin(T / 3)) + ')'; ctx.fill();
    }
    // ground rings under units
    for (const f of W.fx) {
      if (f.k !== 'ring' || T < f.t0 || T > f.t1 + 0.99) continue;
      const k = Math.min(1, (T - f.t0) / Math.max(1, f.t1 - f.t0)), p = hexScreen(v, f.c, f.r), R = (f.rad * 1.6 + 0.7) * size * (0.5 + 0.5 * k);
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y, R, R * K, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.15; ctx.fillStyle = f.color; ctx.fill(); ctx.globalAlpha = 1;
    }
    if (!o.deploy) spawnFromFx(v, W, T, S);
    // ambient embers drifting up
    if (!o.deploy && Math.random() < dt * 6 && S.parts.length < MAXP) S.parts.push({ x: Math.random() * v.w, y: v.h + 4, vx: (Math.random() - 0.5) * 10, vy: -20 - Math.random() * 25, g: 0, life: 4 + Math.random() * 3, t: 0, r: 1 + Math.random() * 1.2, col: Math.random() < 0.5 ? '#ffb347' : '#e8b84a', glow: true });
    const us = W.units.filter(u => !u.dead || W.t - u.deathT < 12).map(u => ({ u, p: unitPos(v, W, u, T) })).sort((a, b) => a.p.y - b.p.y);
    for (const { u, p } of us) drawUnit(v, W, u, p, T, o);
    for (const f of W.fx) {
      if (f.k === 'ring' || T < f.t0 || T > f.t1 + 0.99) continue;
      const k = Math.min(1, (T - f.t0) / Math.max(1, f.t1 - f.t0));
      const chest = (u) => { const p = unitPos(v, W, u, T); return { x: p.x, y: p.y - size * 0.7 * u.size }; };
      if (f.k === 'num' || f.k === 'text') {
        const u = W.byId[f.id]; const p = u ? unitPos(v, W, u, T) : hexScreen(v, f.c, f.r);
        ctx.globalAlpha = 1 - k * k;
        ctx.font = (f.k === 'text' ? 'bold ' + Math.round(size * 0.5) : (f.big ? 'bold ' : '') + Math.round(size * (f.big ? 0.62 : 0.48))) + 'px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
        const y = p.y - size * 2.2 - k * size * (f.k === 'text' ? 0.6 : 1.0), x = p.x + (f.k === 'num' ? ((f.t0 * 7) % 11 - 5) * size * 0.05 : 0);
        const pop = k < 0.15 ? 1 + (1 - k / 0.15) * (f.big ? 0.8 : 0.35) : 1;
        ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop); ctx.lineWidth = f.big ? 4 : 3;
        ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0); ctx.restore(); ctx.globalAlpha = 1;
      } else if (f.k === 'proj') {
        const src = W.byId[f.from], a = src ? { x: hexScreen(v, f.fc, f.fr).x, y: hexScreen(v, f.fc, f.fr).y - size * 0.8 * src.size } : hexScreen(v, f.fc, f.fr);
        const tu = f.to && W.byId[f.to] && !W.byId[f.to].dead ? W.byId[f.to] : null, t = tu ? chest(tu) : hexScreen(v, f.tc, f.tr);
        const x = a.x + (t.x - a.x) * k, y = a.y + (t.y - a.y) * k - Math.sin(k * Math.PI) * size * 0.35 * (f.size || 1), r = (f.size || 1) * 3;
        for (let i = 4; i >= 1; i--) { const kk = Math.max(0, k - i * 0.05), tx = a.x + (t.x - a.x) * kk, ty = a.y + (t.y - a.y) * kk - Math.sin(kk * Math.PI) * size * 0.35 * (f.size || 1); ctx.globalAlpha = 0.12 * (5 - i); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(tx, ty, r * (1 - i * 0.12), 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 0.3; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
      } else if (f.k === 'bolt') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.shadowColor = f.color; ctx.shadowBlur = 10; ctx.beginPath();
        f.pts.forEach(([c, r], i) => {
          const p = hexScreen(v, c, r); p.y -= size * 0.7;
          if (i === 0) ctx.moveTo(p.x, p.y);
          else { const q = hexScreen(v, f.pts[i - 1][0], f.pts[i - 1][1]); q.y -= size * 0.7; ctx.lineTo((p.x + q.x) / 2 + ((i * 13 + f.t0) % 9 - 4) * 2, (p.y + q.y) / 2 + ((i * 7 + f.t0) % 9 - 4) * 2); ctx.lineTo(p.x, p.y); }
        });
        ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      } else if (f.k === 'blink') {
        const p = hexScreen(v, f.c, f.r); ctx.globalAlpha = (1 - k) * 0.6; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - size * 0.6, size * 0.45 * (1 + k), size * 0.8 * (1 + k * 0.5), 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else if (f.k === 'cast') {
        const u = W.byId[f.id]; if (!u) continue; const p = unitPos(v, W, u, T);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color || '#fff'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + k * 2, R = size * (0.4 + k * 0.7); ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * R * 0.5, p.y - size * 0.7 + Math.sin(a) * R * 0.5); ctx.lineTo(p.x + Math.cos(a) * R, p.y - size * 0.7 + Math.sin(a) * R); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else if (f.k === 'banner') {
        ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2; ctx.font = '700 ' + Math.round(size * 0.9) + "px 'Fredoka', 'Nunito', system-ui, sans-serif";
        ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(f.text.toUpperCase(), v.w / 2, v.h * 0.4);
        ctx.fillStyle = '#ffcf5a'; ctx.fillText(f.text.toUpperCase(), v.w / 2, v.h * 0.4); ctx.globalAlpha = 1;
      }
    }
    drawParts(ctx, S, o.deploy ? 0 : dt);
    if (!o.deploy) drawCalls(v, W, T, S, dt);
    const vg = ctx.createRadialGradient(v.w / 2, v.h * 0.5, v.w * 0.35, v.w / 2, v.h * 0.5, v.w * 0.85);
    const sd = W.sd > 0 ? Math.min(0.55, 0.25 + W.sd * 0.15) * (0.75 + 0.25 * Math.sin(now * 6)) : 0;
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, sd ? `rgba(200,20,40,${sd})` : royal() ? 'rgba(0,0,0,0.45)' : 'rgba(20,40,120,0.18)'); ctx.fillStyle = vg; ctx.fillRect(-10, -10, v.w + 20, v.h + 20);
    if (!o.deploy) bossBar(v, W);
    if (o.dragGhost) {
      const g = o.dragGhost, art = B.Art && B.Art.sprite(g.key); ctx.globalAlpha = 0.65;
      if (art) B.Art.draw(ctx, art, g.x, g.y + size * 0.5, size * 1.3, { t: T / 20, face: 1 }); else B.Models.draw(ctx, g.key, g.x, g.y + size * 0.5, size * 1.3, { t: T / 20, face: 1 });
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ battle effects (review #9)
  // Particles are spawned from the sim's fx events the first time the renderer sees them, so the sim stays pure.
  const MAXP = 260;
  function fxState(v) { if (!v.fxs) v.fxs = { parts: [], seen: new WeakSet(), dead: new Set(), calls: [], shake: 0, last: 0, embers: 0 }; return v.fxs; }
  function burst(S, x, y, n, col, o = {}) {
    for (let i = 0; i < n && S.parts.length < MAXP; i++) {
      const a = (o.dir != null ? o.dir : -Math.PI / 2) + (Math.random() - 0.5) * (o.spread != null ? o.spread : Math.PI * 2), sp = (o.speed || 90) * (0.4 + Math.random() * 0.8);
      S.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g != null ? o.g : 160, life: (o.life || 0.5) * (0.6 + Math.random() * 0.6), t: 0, r: (o.r || 2) * (0.6 + Math.random() * 0.8), col, glow: !!o.glow });
    }
  }
  function spawnFromFx(v, W, T, S) {
    const size = v.size;
    for (const f of W.fx) {
      if (S.seen.has(f) || T < f.t0) continue;
      S.seen.add(f);
      const u = f.id ? W.byId[f.id] : null, p = u ? unitPos(v, W, u, T) : f.c != null ? hexScreen(v, f.c, f.r) : null;
      if (f.k === 'num' && p) {
        const heal = String(f.text)[0] === '+';
        if (heal) burst(S, p.x, p.y - size * 0.9, 5, '#8dff9a', { speed: 40, g: -60, life: 0.7, r: 2, spread: 1.2, glow: true });
        else { burst(S, p.x, p.y - size * 0.8, f.big ? 14 : 5, f.big ? '#ffe066' : '#ffd0a0', { speed: f.big ? 160 : 100, life: 0.35, r: f.big ? 2.6 : 1.8 }); if (f.big) S.shake = Math.max(S.shake, 5); }
      } else if (f.k === 'ring') {
        const c = hexScreen(v, f.c, f.r), R = (f.rad * 1.6 + 0.7) * size;
        for (let i = 0; i < 14 + f.rad * 8 && S.parts.length < MAXP; i++) { const a = Math.random() * Math.PI * 2; burst(S, c.x + Math.cos(a) * R * 0.8, c.y + Math.sin(a) * R * 0.8 * 0.6, 1, f.color, { speed: 60, g: -40, life: 0.6, r: 2.2, spread: 0.6, glow: true }); }
        if (f.rad >= 1) S.shake = Math.max(S.shake, 2 + f.rad * 1.5);
      } else if (f.k === 'bolt') { for (const [c, r] of f.pts) { const q = hexScreen(v, c, r); burst(S, q.x, q.y - size * 0.7, 5, f.color, { speed: 120, life: 0.3, r: 1.8, glow: true }); } }
      else if (f.k === 'blink') { const q = hexScreen(v, f.c, f.r); burst(S, q.x, q.y - size * 0.6, 10, f.color, { speed: 70, g: -30, life: 0.5, r: 2.5 }); }
      else if (f.k === 'cast' && u) {
        burst(S, p.x, p.y - size * 0.3, 16, u.color || '#fff', { speed: 70, g: -120, life: 0.8, r: 2.2, spread: 1.4, glow: true });
        const hd = B.HEROES && B.HEROES[u.key]; if (hd) S.calls.push({ id: u.id, text: hd.abName, t: 0, col: u.color || '#ffe066' });
      }
    }
    for (const u of W.units) if (u.dead && !S.dead.has(u.id) && W.t - u.deathT < 12) {
      S.dead.add(u.id); const p = unitPos(v, W, u, T);
      burst(S, p.x, p.y - size * 0.6, u.boss ? 40 : 16, u.side ? '#ff8a8a' : '#9fd8ff', { speed: u.boss ? 180 : 110, life: 0.6, r: 2.4 });
      S.parts.push({ x: p.x, y: p.y - size * 0.8, vx: 0, vy: -40, g: -10, life: 1.4, t: 0, r: 5, col: '#e8f4ff', glow: true, wisp: true });
      if (u.boss) S.shake = 10;
    }
  }
  function drawParts(ctx, S, dt) {
    const keep = [];
    for (const q of S.parts) {
      q.t += dt; if (q.t >= q.life) continue;
      q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.wisp) q.x += Math.sin(q.t * 7) * 0.6;
      const k = 1 - q.t / q.life;
      ctx.globalAlpha = Math.max(0, k);
      if (q.glow) { ctx.fillStyle = q.col; ctx.globalAlpha = k * 0.25; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = k; }
      ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (q.wisp ? k : 1), 0, Math.PI * 2); ctx.fill();
      keep.push(q);
    }
    ctx.globalAlpha = 1; S.parts = keep;
  }
  function drawCalls(v, W, T, S, dt) {
    const { ctx, size } = v, keep = [];
    for (const c of S.calls) {
      c.t += dt; if (c.t > 1.1) continue; keep.push(c);
      const u = W.byId[c.id]; if (!u) continue;
      const p = unitPos(v, W, u, T), k = c.t / 1.1, pop = c.t < 0.12 ? 0.7 + c.t / 0.12 * 0.45 : 1.15 - Math.min(0.15, (c.t - 0.12));
      ctx.save(); ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25; ctx.translate(p.x, p.y - size * 2.6 - k * size * 0.4); ctx.scale(pop, pop);
      ctx.font = '700 ' + Math.round(size * 0.52) + "px 'Fredoka', 'Nunito', system-ui, sans-serif"; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(c.text.toUpperCase(), 0, 0); ctx.fillStyle = c.col; ctx.fillText(c.text.toUpperCase(), 0, 0);
      ctx.restore();
    }
    S.calls = keep;
  }
  function bossBar(v, W) {
    const b = W.units.find(u => u.boss && !u.dead && u.side === 1); if (!b) return;
    const { ctx } = v, x = 14, w = v.w - 28, y = 8;
    ctx.fillStyle = '#000a'; ctx.fillRect(x - 2, y - 2, w + 4, 22);
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7a1020'); g.addColorStop(1, '#e0404a');
    ctx.fillStyle = g; ctx.fillRect(x, y + 12, w * Math.max(0, b.hp / b.maxHp), 6);
    ctx.strokeStyle = '#e8b84a88'; ctx.lineWidth = 1; ctx.strokeRect(x, y + 12, w, 6);
    for (const f of [0.25, 0.5, 0.75]) { ctx.fillStyle = '#000a'; ctx.fillRect(x + w * f, y + 12, 1, 6); }
    ctx.font = "700 12px 'Fredoka', 'Nunito', system-ui, sans-serif"; ctx.textAlign = 'left'; ctx.fillStyle = '#f3e6c4'; ctx.fillText(b.name.toUpperCase(), x, y + 9);
    ctx.textAlign = 'right'; ctx.fillStyle = '#e8b84a'; ctx.fillText(Math.max(0, Math.round(b.hp)) + ' / ' + b.maxHp, x + w, y + 9);
  }

  B.Render = { setup, draw, hexAt, hexScreen, skin: null };
})(typeof window !== 'undefined' ? window : globalThis);
