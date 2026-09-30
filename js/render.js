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
  function drawBoard(v, o, W) {
    const { ctx, size } = v, th = v.slab, tk = (W && W.tk) || {};
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
      // review #39: terrain hexes keep the meadow colour while deploying (nobody can be placed there)
      ctx.fillStyle = drop ? '#ffe066' : tileColor(c, r, tk[Hx.key(c, r)] ? {} : o); ctx.fill();
      if (v.grit) { ctx.globalAlpha = royal() ? 1 : 0.35; ctx.fillStyle = v.grit; ctx.fill(); ctx.globalAlpha = 1; }
      // bevel: lit upper-left edges, shaded lower-right edges
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = royal() ? 'rgba(255,207,90,0.38)' : 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(top[3].x, top[3].y); ctx.lineTo(top[4].x, top[4].y); ctx.lineTo(top[5].x, top[5].y); ctx.lineTo(top[0].x, top[0].y); ctx.stroke();
      ctx.strokeStyle = royal() ? 'rgba(0,0,0,0.45)' : 'rgba(40,70,20,0.35)'; ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y); ctx.lineTo(top[1].x, top[1].y); ctx.lineTo(top[2].x, top[2].y); ctx.lineTo(top[3].x, top[3].y); ctx.stroke();
    }
    for (const k in tk) if (tk[k] === 'pond') drawPond(v, k % Hx.COLS, (k / Hx.COLS) | 0);
    if (o.deploy) { const y = hexScreen(v, 0, 4).y - size * 0.75 * K; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(v.w, y); ctx.stroke(); ctx.setLineDash([]); }
  }

  // ------------------------------------------------------------------ terrain (review #39): cartoon trees, boulders,
  // ridges (standing things, depth-sorted with the units) and ponds (flat, part of the board)
  function drawPond(v, c, r) {
    const { ctx, size } = v, p = hexScreen(v, c, r), t = performance.now() / 1000;
    path(ctx, corners(v, c, r, size * 0.86)); ctx.fillStyle = '#3aa4e0'; ctx.fill();
    path(ctx, corners(v, c, r, size * 0.7)); ctx.fillStyle = '#5cc2f2'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { const k = (t * 0.35 + i * 0.5 + (c * 0.3 + r * 0.17)) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(p.x - size * 0.15, p.y + size * 0.05, size * (0.12 + k * 0.4), size * (0.12 + k * 0.4) * K, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if ((c + r) % 2) { // a lily pad with a flower
      const lx = p.x + size * 0.28, ly = p.y - size * 0.05;
      ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(lx, ly, size * 0.2, size * 0.2 * K, 0, 0.35, Math.PI * 2 - 0.1); ctx.lineTo(lx, ly); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9fd2'; ctx.beginPath(); ctx.arc(lx - size * 0.03, ly - size * 0.03, size * 0.06, 0, Math.PI * 2); ctx.fill();
    }
  }
  function blob(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
  function drawTerrain(v, x, fade) {
    const { ctx, size: s } = v, p = hexScreen(v, x.c, x.r), X = p.x, Y = p.y;
    ctx.save(); ctx.globalAlpha = fade ? 0.5 : 1;
    const g = ctx.createRadialGradient(X, Y, 0, X, Y, s * 0.7); g.addColorStop(0, 'rgba(20,50,10,0.4)'); g.addColorStop(1, 'rgba(20,50,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, s * 0.7, s * 0.7 * K * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.2, s * 0.05);
    if (x.k === 'tree') {
      ctx.fillStyle = '#8a5a2e'; ctx.strokeStyle = '#5a3514'; ctx.beginPath(); ctx.rect(X - s * 0.1, Y - s * 0.7, s * 0.2, s * 0.7); ctx.fill(); ctx.stroke();
      const leaf = [[-0.3, -0.95, 0.42], [0.3, -0.98, 0.4], [0, -1.35, 0.48]];
      ctx.fillStyle = '#2e8a3e'; for (const [dx, dy, rr] of leaf) { ctx.beginPath(); ctx.arc(X + dx * s, Y + dy * s + s * 0.05, rr * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#49b95a'; for (const [dx, dy, rr] of leaf) { ctx.beginPath(); ctx.arc(X + dx * s - s * 0.04, Y + dy * s - s * 0.03, rr * s * 0.9, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#8be07f'; for (const [dx, dy, rr] of leaf) { ctx.beginPath(); ctx.arc(X + dx * s - rr * s * 0.35, Y + dy * s - rr * s * 0.4, rr * s * 0.28, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ff6b6b'; for (const [dx, dy] of [[-0.35, -0.85], [0.25, -1.1], [0.05, -1.45]]) { ctx.beginPath(); ctx.arc(X + dx * s, Y + dy * s, s * 0.06, 0, Math.PI * 2); ctx.fill(); }
    } else if (x.k === 'rock') {
      const P = [[-0.5, 0], [-0.55, -0.3], [-0.3, -0.62], [0.08, -0.72], [0.42, -0.55], [0.56, -0.2], [0.48, 0]].map(([a, b]) => [X + a * s, Y + b * s]);
      blob(ctx, P); ctx.fillStyle = '#9ca3ad'; ctx.fill(); ctx.strokeStyle = '#5f6670'; ctx.stroke();
      blob(ctx, [[X + 0.08 * s, Y - 0.72 * s], [X + 0.42 * s, Y - 0.55 * s], [X + 0.56 * s, Y - 0.2 * s], [X + 0.48 * s, Y], [X + 0.1 * s, Y], [X + 0.05 * s, Y - 0.35 * s]]); ctx.fillStyle = '#7f8792'; ctx.fill();
      ctx.fillStyle = '#d3d8de'; ctx.beginPath(); ctx.ellipse(X - s * 0.22, Y - s * 0.45, s * 0.14, s * 0.07, -0.5, 0, Math.PI * 2); ctx.fill();
    } else if (x.k === 'ridge') {
      const P = [[-0.75, 0], [-0.55, -0.6], [-0.3, -1.2], [-0.05, -0.8], [0.25, -1.45], [0.55, -0.7], [0.75, 0]].map(([a, b]) => [X + a * s, Y + b * s]);
      blob(ctx, P); ctx.fillStyle = '#b09474'; ctx.fill(); ctx.strokeStyle = '#6e5738'; ctx.stroke();
      blob(ctx, [[X + 0.25 * s, Y - 1.45 * s], [X + 0.55 * s, Y - 0.7 * s], [X + 0.75 * s, Y], [X + 0.25 * s, Y], [X + 0.15 * s, Y - 0.6 * s]]); ctx.fillStyle = '#8c7254'; ctx.fill();
      blob(ctx, [[X - 0.3 * s, Y - 1.2 * s], [X - 0.05 * s, Y - 0.8 * s], [X - 0.2 * s, Y - 0.9 * s], [X - 0.42 * s, Y - 0.92 * s]]); ctx.fillStyle = '#f4efe4'; ctx.fill();
      blob(ctx, [[X + 0.25 * s, Y - 1.45 * s], [X + 0.4 * s, Y - 1.08 * s], [X + 0.22 * s, Y - 1.15 * s], [X + 0.1 * s, Y - 1.1 * s]]); ctx.fillStyle = '#f4efe4'; ctx.fill();
      ctx.fillStyle = '#6bbf59'; for (const dx of [-0.6, 0.62]) { ctx.beginPath(); ctx.ellipse(X + dx * s, Y - s * 0.04, s * 0.14, s * 0.08, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ units
  // review #47: a hero with a death animation stays on the board while it plays
  const deadTicks = u => B.Art && B.Art.deathTicks ? B.Art.deathTicks(u.key) : 12;
  function poseOf(W, u, T) {
    const s = W.t, pose = { t: T / 20 + u.id * 0.37, face: 1 };
    // facing: toward the target, else toward the enemy side
    const tgt = W.byId[u.tgt];
    if (tgt && !tgt.dead) { const a = B.Sim.posAt(u, T, 10), b = B.Sim.posAt(tgt, T, 10); if (Math.abs(b.x - a.x) > 1) pose.face = b.x > a.x ? 1 : -1; else pose.face = u.side === 0 ? 1 : -1; }
    else if (u.m1t > u.m0t && T < u.m1t) pose.face = u.c >= u.fc ? 1 : -1;
    else pose.face = u.side === 0 ? 1 : -1;
    if (u.m1t > u.m0t && T >= u.m0t && T < u.m1t && u.ms > 0) pose.walk = ((T - u.m0t) / Math.max(1, u.m1t - u.m0t)) % 1;
    const a = u.anim; if (a && a.k === 'atk' && T >= a.t0 && T <= a.t1) pose.atk = (T - a.t0) / Math.max(1, a.t1 - a.t0);
    const cd = B.Art && B.Art.castTicks ? B.Art.castTicks(u.key === 'clone' ? 'mirage' : u.key) : 14;   // review #45: long art animations
    if (T - u.castT >= 0 && T - u.castT < cd) pose.cast = (T - u.castT) / cd;
    if (u.dead) pose.dead = Math.max(0, Math.min(1, (T - u.deathT) / deadTicks(u)));   // v42: T, so the last death plays on in the slow motion after the fight
    void s; return pose;
  }
  function drawUnit(v, W, u, p, T, o) {
    const { ctx, size } = v, s = W.t;
    const S = size * 1.3 * u.size;
    let alpha = u.alpha; if (u.st.untarg > s) alpha *= 0.45;
    ctx.globalAlpha = Math.max(0, alpha);
    // selection / side ring on the ground
    const hero = u.side === 0;
    // review #44 (David: "clearer player/enemy distinction"): a filled disc in the side's colour under every unit
    const sideC = hero ? '74,163,255' : '255,92,110';
    if (!u.dead) { ctx.fillStyle = `rgba(${sideC},0.28)`; ctx.beginPath(); ctx.ellipse(p.x, p.y, S * 0.5, S * 0.5 * K * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = o.sel && o.sel === u.uid && hero ? '#ffffff' : u.elite ? '#ffcf5a' : `rgba(${sideC},0.95)`;
    ctx.lineWidth = o.sel && o.sel === u.uid ? 3 : 2.2;
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
    ctx.fillStyle = hero ? '#123a86' : '#6a1426'; ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, 7);   // the bar's frame in the side's colour
    ctx.fillStyle = '#000a'; ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = hero ? '#5fd47a' : '#ff5c6e'; ctx.fillRect(bx, by, bw * Math.max(0, u.hp / u.maxHp), 4);
    if (u.shield > 0 && u.shieldU > s) { ctx.fillStyle = '#e8ecff'; ctx.fillRect(bx, by, Math.min(bw, bw * u.shield / u.maxHp), 2); }
    if (u.maxMana > 0) { ctx.fillStyle = '#000b'; ctx.fillRect(bx - 1, by + 5, bw + 2, 3); ctx.fillStyle = '#5fa8ff'; ctx.fillRect(bx, by + 5, bw * Math.min(1, u.mana / u.maxMana), 2); }
    if (u.lvl > 1 && hero && u.kind === 'hero') { ctx.font = "700 10px 'Fredoka', 'Nunito', system-ui, sans-serif"; ctx.fillStyle = '#ffcf5a'; ctx.textAlign = 'left'; ctx.fillText(u.lvl, bx + bw + 2, by + 5); }
    // review #44: status effects as coloured badges (glyph on a disc) above the bars, one colour per effect
    const marks = [];
    if (u.st.frozenU > s) marks.push(['❄', '#3fb8e8']);
    else if (u.st.stun > s) marks.push(['✦', '#f5b700']);
    if (u.st.silence > s) marks.push(['⊘', '#9b5de5']);
    if (u.st.tauntU > s) marks.push(['!', '#ff5c6e']);
    if (u.st.confuseU > s) marks.push(['?', '#e05ab8']);
    if (u.dots.some(d => d.k === 'burn' && d.until > s)) marks.push(['🔥', '#ff8a3d']);
    if (u.dots.some(d => d.k === 'poison' && d.until > s)) marks.push(['☠', '#3ddc84']);
    if (u.st.slowU > s) marks.push(['↓', '#4aa3ff']);
    if (u.st.root > s) marks.push(['⚓', '#a0703a']);
    if (marks.length) {
      const R = Math.max(5.5, size * 0.2), gap = R * 2 + 2, x0 = p.x - (marks.length - 1) * gap / 2, y0 = by - R - 3;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.round(R * 1.35)}px 'Fredoka', system-ui, sans-serif`;
      marks.forEach(([g, c], i) => { const x = x0 + i * gap; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y0, R, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillText(g, x, y0 + 0.5); });
      ctx.textBaseline = 'alphabetic';
    }
    if (u.st.stun > s && !(u.st.frozenU > s)) { ctx.fillStyle = '#ffe066'; for (let i = 0; i < 3; i++) { const a = T / 3 + i * 2.1; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * S * 0.3, headTop + 4 + Math.sin(a) * S * 0.08, 2.2, 0, Math.PI * 2); ctx.fill(); } }
  }

  // ------------------------------------------------------------------ frame
  function draw(v, W, T, o = {}) {
    muted = !!o.mute;
    const { ctx, size } = v;
    const S = fxState(v), now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = Math.min(0.05, S.last ? now - S.last : 0.016); S.last = now;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    if (S.shake > 0.2 && !o.deploy) { ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake); S.shake *= Math.pow(0.02, dt); } else S.shake = 0;
    const bd = backdrop(v); if (bd) ctx.drawImage(bd, -12, -12, v.w + 24, v.h + 24); else { ctx.fillStyle = royal() ? '#1a1228' : '#9fd4ff'; ctx.fillRect(0, 0, v.w, v.h); }
    drawBoard(v, o, W);
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
    const us = W.units.filter(u => !u.dead || T - u.deathT < deadTicks(u)).map(u => ({ u, p: unitPos(v, W, u, T) }));
    // standing terrain joins the depth sort; it turns see-through while a unit stands right behind it
    for (const x of (W.terrain || [])) if (x.k !== 'pond') us.push({ x, p: hexScreen(v, x.c, x.r), fade: x.k !== 'rock' && W.units.some(u => !u.dead && u.r === x.r - 1 && Hx.dist(u, x) === 1) });
    us.sort((a, b) => a.p.y - b.p.y);
    for (const e of us) if (e.x) drawTerrain(v, e.x, e.fade); else drawUnit(v, W, e.u, e.p, T, o);
    for (const f of W.fx) {
      if (f.k === 'ring' || T < f.t0 || T > f.t1 + 0.99) continue;
      const k = Math.min(1, (T - f.t0) / Math.max(1, f.t1 - f.t0));
      const chest = (u) => { const p = unitPos(v, W, u, T); return { x: p.x, y: p.y - size * 0.7 * u.size }; };
      if (f.k === 'num' || f.k === 'text') {
        const u = W.byId[f.id]; const p = u ? unitPos(v, W, u, T) : hexScreen(v, f.c, f.r);
        ctx.globalAlpha = 1 - k * k;
        ctx.font = (f.k === 'text' ? '700 ' + Math.round(size * 0.5) : (f.big ? '700 ' : '600 ') + Math.round(size * (f.big ? 0.7 : 0.5))) + "px 'Fredoka', 'Nunito', system-ui, sans-serif";
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
    if (o.end) drawEnd(v, W, o.end, S, dt);
    if (o.dragGhost) {
      const g = o.dragGhost, art = B.Art && B.Art.sprite(g.key); ctx.globalAlpha = 0.65;
      if (art) B.Art.draw(ctx, art, g.x, g.y + size * 0.5, size * 1.3, { t: T / 20, face: 1 }); else B.Models.draw(ctx, g.key, g.x, g.y + size * 0.5, size * 1.3, { t: T / 20, face: 1 });
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------------ v42 (review #51, David: "looks amateur"): a painted
  // sky behind the board instead of a flat gradient (soft light, clouds, two rows of hills), drawn once per board size
  function backdrop(v) {
    const R = royal();
    if (v.bd && v.bd.R === R) return v.bd.c;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'), W = v.w + 24, H = v.h + 24, top = v.top + 12;
    c.width = Math.round(W * v.dpr); c.height = Math.round(H * v.dpr);
    const g = c.getContext('2d'); g.scale(v.dpr, v.dpr);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sky = g.createLinearGradient(0, 0, 0, H);
    if (R) { sky.addColorStop(0, '#120c1e'); sky.addColorStop(0.5, '#2a1c3f'); sky.addColorStop(1, '#0d0915'); }
    else { sky.addColorStop(0, '#4f9ff0'); sky.addColorStop(Math.min(0.9, top / H * 1.1), '#aee0ff'); sky.addColorStop(1, '#d9f2ff'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const sun = g.createRadialGradient(W * 0.78, top * 0.25, 0, W * 0.78, top * 0.25, W * 0.5);
    sun.addColorStop(0, R ? 'rgba(255,207,90,0.28)' : 'rgba(255,248,214,0.85)'); sun.addColorStop(1, 'rgba(255,248,214,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    if (R) { for (let i = 0; i < 70; i++) { g.globalAlpha = 0.3 + rnd() * 0.6; g.fillStyle = '#fff'; g.beginPath(); g.arc(rnd() * W, rnd() * top * 1.3, rnd() * 1.3 + 0.3, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }
    else for (let i = 0; i < 6; i++) {   // soft clouds: clusters of white puffs
      const cx = (i + 0.3 + rnd() * 0.5) / 6 * W, cy = top * (0.2 + rnd() * 0.45), s = v.size * (0.35 + rnd() * 0.3);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx + (k - 2) * s * 0.75, cy - Math.sin(k / 4 * Math.PI) * s * 0.45, s * (0.7 + rnd() * 0.3), s * 0.5, 0, 0, Math.PI * 2); g.fill(); }
    }
    const hills = (base, amp, col, n) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, base - amp * (0.55 + 0.45 * Math.sin(x / W * Math.PI * n + n)) - amp * 0.25 * Math.sin(x / 37));
      g.lineTo(W, H); g.closePath(); g.fill();
    };
    if (R) { hills(top + v.size * 0.4, v.size * 1.2, '#1d1430', 3); hills(top + v.size * 0.9, v.size * 0.8, '#150f24', 5); }
    else { hills(top + v.size * 0.3, v.size * 1.3, '#9ccbe8', 3); hills(top + v.size * 0.7, v.size * 0.9, '#7fc48a', 5); hills(top + v.size * 1.2, v.size * 0.6, '#5fb06c', 7); }
    v.bd = { R, c }; return c;
  }
  // v42: the end of a fight. The last blow plays on in slow motion under a big VICTORY / DEFEAT, with confetti on a win
  function drawEnd(v, W, e, S, dt) {
    const { ctx, size } = v, k = Math.min(1, e.k), win = e.win;
    if (!e.parts) {
      e.parts = { parts: [] };
      if (win) for (let i = 0; i < 80; i++) e.parts.parts.push({ x: v.w * (0.25 + Math.random() * 0.5), y: v.h * 0.44, vx: (Math.random() - 0.5) * 560, vy: -160 - Math.random() * 380, g: 560, life: 1.3 + Math.random() * 0.8, t: 0, r: 2 + Math.random() * 2.6, col: ['#ffd23f', '#ff6b7e', '#4aa3ff', '#3ddc84', '#c29bff', '#fff'][i % 6] });
      S.shake = Math.max(S.shake, win ? 6 : 9);
    }
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, k * 1.6) * (win ? 0.5 : 0.8); ctx.fillStyle = win ? '#1b2270' : '#3a0a14'; ctx.fillRect(-20, -20, v.w + 40, v.h + 40);
    const pop = k < 0.18 ? 0.4 + k / 0.18 * 0.8 : 1.2 - Math.min(0.2, (k - 0.18) * 0.9), y = v.h * 0.44;
    ctx.globalAlpha = Math.min(1, k * 5);
    if (win) {   // rays turning behind the word
      ctx.translate(v.w / 2, y); ctx.rotate(k * 0.8);
      for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = i % 2 ? 'rgba(255,226,120,0.16)' : 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(v.w, -size * 1.4); ctx.lineTo(v.w, size * 1.4); ctx.closePath(); ctx.fill(); }
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    }
    ctx.translate(v.w / 2, y); ctx.scale(pop, pop);
    const txt = win ? 'VICTORY!' : 'DEFEAT', fs = Math.round(Math.min(v.w * 0.14, size * 1.8));
    ctx.font = `700 ${fs}px 'Fredoka', 'Nunito', system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.22; ctx.strokeStyle = win ? '#1b2270' : '#2a0610'; ctx.strokeText(txt, 0, fs * 0.08);
    ctx.lineWidth = fs * 0.12; ctx.strokeStyle = win ? '#d08600' : '#b52c3c'; ctx.strokeText(txt, 0, 0);
    const gr = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    if (win) { gr.addColorStop(0, '#fff6c2'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#ffa600'); } else { gr.addColorStop(0, '#ffd0d6'); gr.addColorStop(1, '#ff6b7e'); }
    ctx.fillStyle = gr; ctx.fillText(txt, 0, 0);
    ctx.restore(); ctx.textBaseline = 'alphabetic';
    drawParts(ctx, e.parts, dt);
  }

  // ------------------------------------------------------------------ battle effects (review #9)
  // Particles are spawned from the sim's fx events the first time the renderer sees them, so the sim stays pure.
  const MAXP = 260;
  function fxState(v) { if (!v.fxs) v.fxs = { parts: [], seen: new WeakSet(), dead: new Set(), calls: [], shake: 0, last: 0, embers: 0, kb: {}, streak: {} }; return v.fxs; }
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
        sfx(heal ? 'heal' : f.big ? 'crit' : 'hit');
        if (heal) burst(S, p.x, p.y - size * 0.9, 5, '#8dff9a', { speed: 40, g: -60, life: 0.7, r: 2, spread: 1.2, glow: true });
        else { burst(S, p.x, p.y - size * 0.8, f.big ? 14 : 5, f.big ? '#ffe066' : '#ffd0a0', { speed: f.big ? 160 : 100, life: 0.35, r: f.big ? 2.6 : 1.8 }); if (f.big) S.shake = Math.max(S.shake, 5); }
      } else if (f.k === 'ring') {
        const c = hexScreen(v, f.c, f.r), R = (f.rad * 1.6 + 0.7) * size;
        for (let i = 0; i < 14 + f.rad * 8 && S.parts.length < MAXP; i++) { const a = Math.random() * Math.PI * 2; burst(S, c.x + Math.cos(a) * R * 0.8, c.y + Math.sin(a) * R * 0.8 * 0.6, 1, f.color, { speed: 60, g: -40, life: 0.6, r: 2.2, spread: 0.6, glow: true }); }
        if (f.rad >= 1) S.shake = Math.max(S.shake, 2 + f.rad * 1.5);
      } else if (f.k === 'bolt') { for (const [c, r] of f.pts) { const q = hexScreen(v, c, r); burst(S, q.x, q.y - size * 0.7, 5, f.color, { speed: 120, life: 0.3, r: 1.8, glow: true }); } }
      else if (f.k === 'blink') { const q = hexScreen(v, f.c, f.r); burst(S, q.x, q.y - size * 0.6, 10, f.color, { speed: 70, g: -30, life: 0.5, r: 2.5 }); }
      else if (f.k === 'text' && /^(SLAM|EXECUTE|REAPED|LONGWATCH)$/.test(f.text)) sfx('slam');
      else if (f.k === 'text' && /^(miss|blind)$/.test(f.text)) sfx('dodge');
      else if (f.k === 'cast' && u) {
        sfx('cast');
        burst(S, p.x, p.y - size * 0.3, 16, u.color || '#fff', { speed: 70, g: -120, life: 0.8, r: 2.2, spread: 1.4, glow: true });
        const hd = B.HEROES && B.HEROES[u.key]; if (hd) S.calls.push({ id: u.id, text: hd.abName, t: 0, col: u.color || '#ffe066' });
      }
    }
    for (const u of W.units) if (u.dead && !S.dead.has(u.id) && W.t - u.deathT < 12) {
      S.dead.add(u.id); const p = unitPos(v, W, u, T);
      burst(S, p.x, p.y - size * 0.6, u.boss ? 40 : 16, u.side ? '#ff8a8a' : '#9fd8ff', { speed: u.boss ? 180 : 110, life: 0.6, r: 2.4 });
      S.parts.push({ x: p.x, y: p.y - size * 0.8, vx: 0, vy: -40, g: -10, life: 1.4, t: 0, r: 5, col: '#e8f4ff', glow: true, wisp: true });
      if (u.boss) { S.shake = 10; sfx('boss'); } else sfx('ko');
    }
    // v42 (review #51): kill streaks. A hero that downs 2+ enemies within 3 seconds gets a big call over its head
    for (const u of W.units) if (u.side === 0 && u.kind === 'hero' && (u.kb || 0) > (S.kb[u.id] || 0)) {
      const k = S.kb[u.id] || 0, st = S.streak[u.id] || { n: 0, t: -1e9 }; S.kb[u.id] = u.kb;
      for (let i = k; i < u.kb; i++) { st.n = W.t - st.t <= 60 ? st.n + 1 : 1; st.t = W.t; }
      S.streak[u.id] = st;
      if (st.n >= 2) { S.calls.push({ id: u.id, text: ['', '', 'Double KO!', 'Triple KO!', 'Quadra KO!'][Math.min(4, st.n)] || 'Rampage!', t: 0, col: '#ffe066', big: true }); sfx('streak', st.n); S.shake = Math.max(S.shake, 4); }
    }
  }
  let muted = false;   // v49: the title trailer draws a fight with no sound
  const sfx = (n, a) => { if (B.Sfx && !muted) B.Sfx.play(n, a); };
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
      c.t += dt; if (c.t > (c.big ? 1.5 : 1.1)) continue; keep.push(c);
      const u = W.byId[c.id]; if (!u) continue;
      const p = unitPos(v, W, u, T), k = c.t / (c.big ? 1.5 : 1.1), pop = c.t < 0.12 ? 0.7 + c.t / 0.12 * (c.big ? 0.8 : 0.45) : (c.big ? 1.5 : 1.15) - Math.min(c.big ? 0.4 : 0.15, (c.t - 0.12));
      ctx.save(); ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25; ctx.translate(p.x, p.y - size * 2.6 - k * size * 0.4); ctx.scale(pop, pop);
      ctx.font = '700 ' + Math.round(size * (c.big ? 0.8 : 0.52)) + "px 'Fredoka', 'Nunito', system-ui, sans-serif"; ctx.textAlign = 'center';
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
