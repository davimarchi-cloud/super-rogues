// Canvas renderer for the 8x8 board. Everything is placeholder art: coloured discs with an emoji glyph.
// Positions are interpolated at fractional tick T (see sim.js header), so movement between hexes is smooth.
(function (G) {
  const B = G.B = G.B || {};
  const Hx = B.Hex;

  function setup(canvas, cssW) {
    const size = cssW / (Math.sqrt(3) * (Hx.COLS + 0.5));
    const bs = Hx.boardSize(size), dpr = Math.min(3, G.devicePixelRatio || 1);
    canvas.style.width = bs.w + 'px'; canvas.style.height = bs.h + 'px';
    canvas.width = Math.round(bs.w * dpr); canvas.height = Math.round(bs.h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, size, w: bs.w, h: bs.h };
  }
  function hexPath(ctx, x, y, s) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); ctx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); }
    ctx.closePath();
  }
  function hexAt(v, x, y) {
    let best = null, bd = 1e9;
    for (const h of Hx.all()) { const p = Hx.px(h.c, h.r, v.size); const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = h; } }
    return bd <= v.size * v.size ? best : null;
  }
  function unitPos(v, W, u, T) {
    const p = B.Sim.posAt(u, T, v.size);
    const a = u.anim;
    if (a && a.k === 'atk' && T >= a.t0 && T <= a.t1) {
      const t = W.byId[a.tid];
      if (t) {
        const q = B.Sim.posAt(t, T, v.size), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
        const k = (T - a.t0) / Math.max(1, a.t1 - a.t0);
        const amp = a.ranged ? -v.size * 0.08 : v.size * 0.42;
        const e = k < 0.8 ? k / 0.8 : (1 - k) / 0.2;
        p.x += dx / d * amp * e; p.y += dy / d * amp * e;
      }
    }
    return p;
  }

  function draw(v, W, T, o = {}) {
    const { ctx, size } = v;
    ctx.clearRect(0, 0, v.w, v.h);
    // board
    for (const h of Hx.all()) {
      const p = Hx.px(h.c, h.r, size);
      hexPath(ctx, p.x, p.y, size * 0.96);
      let fill = (h.c + h.r) % 2 ? '#1d2230' : '#1a1f2b';
      if (o.deploy) fill = h.r >= 4 ? ((h.c + h.r) % 2 ? '#1f2d4a' : '#1c2943') : ((h.c + h.r) % 2 ? '#2c1e24' : '#281b21');
      if (o.drop && o.drop.c === h.c && o.drop.r === h.r) fill = '#35507f';
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = '#2a3142'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (!W) return;
    // ground zones
    for (const z of W.zones) if (z.until > W.t) for (const h of Hx.within(z.c, z.r, z.rad)) {
      const p = Hx.px(h.c, h.r, size); hexPath(ctx, p.x, p.y, size * 0.9);
      ctx.fillStyle = 'rgba(255,122,61,' + (0.18 + 0.08 * Math.sin(T / 3)) + ')'; ctx.fill();
    }
    // units (back to front)
    const us = W.units.filter(u => !u.dead || W.t - u.deathT < 10).map(u => ({ u, p: unitPos(v, W, u, T) })).sort((a, b) => a.p.y - b.p.y);
    for (const { u, p } of us) drawUnit(v, W, u, p, T, o);
    // effects
    for (const f of W.fx) {
      if (T < f.t0 || T > f.t1 + 0.99) continue;
      const k = Math.min(1, (T - f.t0) / Math.max(1, f.t1 - f.t0));
      if (f.k === 'num' || f.k === 'text') {
        const u = W.byId[f.id]; const p = u ? unitPos(v, W, u, T) : Hx.px(f.c, f.r, size);
        ctx.globalAlpha = 1 - k * k;
        ctx.font = (f.k === 'text' ? 'bold ' + Math.round(size * 0.5) : (f.big ? 'bold ' : '') + Math.round(size * (f.big ? 0.62 : 0.48))) + 'px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000';
        const y = p.y - size * 0.9 - k * size * (f.k === 'text' ? 0.6 : 1.1), x = p.x + (f.k === 'num' ? ((f.t0 * 7) % 11 - 5) * size * 0.05 : 0);
        ctx.strokeText(f.text, x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, x, y);
        ctx.globalAlpha = 1;
      } else if (f.k === 'ring') {
        const p = Hx.px(f.c, f.r, size);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, (f.rad * 1.6 + 0.7) * size * (0.5 + 0.5 * k), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'proj') {
        const a = Hx.px(f.fc, f.fr, size); const t = f.to && W.byId[f.to] && !W.byId[f.to].dead ? unitPos(v, W, W.byId[f.to], T) : Hx.px(f.tc, f.tr, size);
        const x = a.x + (t.x - a.x) * k, y = a.y + (t.y - a.y) * k, r = (f.size || 1) * 3;
        ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = f.color; ctx.globalAlpha = 0.4; ctx.lineWidth = r; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x - (t.x - a.x) * 0.08, y - (t.y - a.y) * 0.08); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'bolt') {
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.beginPath();
        f.pts.forEach(([c, r], i) => {
          const p = Hx.px(c, r, size);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else { const q = Hx.px(f.pts[i - 1][0], f.pts[i - 1][1], size); const mx = (p.x + q.x) / 2 + ((i * 13 + f.t0) % 9 - 4) * 2, my = (p.y + q.y) / 2 + ((i * 7 + f.t0) % 9 - 4) * 2; ctx.lineTo(mx, my); ctx.lineTo(p.x, p.y); }
        });
        ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'blink') {
        const p = Hx.px(f.c, f.r, size); ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * 0.6 * (1 + k), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else if (f.k === 'cast') {
        const u = W.byId[f.id]; if (!u) continue; const p = unitPos(v, W, u, T);
        ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color || '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, size * (0.7 + 0.6 * k), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.k === 'banner') {
        ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) / 0.2; ctx.font = 'bold ' + Math.round(size * 0.9) + 'px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, v.w / 2, v.h * 0.45);
        ctx.fillStyle = '#ffcf5a'; ctx.fillText(f.text, v.w / 2, v.h * 0.45); ctx.globalAlpha = 1;
      }
    }
    if (o.dragGhost) { ctx.globalAlpha = 0.6; ctx.font = Math.round(size * 0.8) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(o.dragGhost.glyph, o.dragGhost.x, o.dragGhost.y + size * 0.28); ctx.globalAlpha = 1; }
  }

  function drawUnit(v, W, u, p, T, o) {
    const { ctx, size } = v, s = W.t;
    const R = size * 0.62 * u.size;
    let alpha = u.alpha; if (u.st.untarg > s) alpha *= 0.45; if (u.dead) alpha *= 1 - (W.t - u.deathT) / 10;
    ctx.globalAlpha = Math.max(0, alpha);
    const hero = u.side === 0;
    // body
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fillStyle = hero ? (u.color || '#4f7cff') : (u.boss ? '#7a1f3d' : '#8c3a3a'); ctx.fill();
    ctx.lineWidth = u.boss ? 3 : 2; ctx.strokeStyle = u.elite ? '#ffcf5a' : hero ? '#dfe8ff' : '#ffb3b3';
    if (o.sel && o.sel === u.uid && hero) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; }
    ctx.stroke();
    if (W.t - u.hitT < 3) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(); }
    if (u.st.frozenU > s) { ctx.fillStyle = 'rgba(140,230,255,0.45)'; ctx.fill(); }
    // glyph
    ctx.font = Math.round(R * 1.15) + 'px system-ui,"Segoe UI Emoji","Apple Color Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(u.glyph || '?', p.x, p.y + R * 0.06); ctx.textBaseline = 'alphabetic';
    // bars
    if (!u.dead) {
      const bw = Math.max(R * 2.1, size * 1.2), bx = p.x - bw / 2, by = p.y - R - 9;
      ctx.fillStyle = '#000a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = hero ? '#5fd47a' : '#e05555'; ctx.fillRect(bx, by, bw * Math.max(0, u.hp / u.maxHp), 4);
      if (u.shield > 0 && u.shieldU > s) { ctx.fillStyle = '#e8ecff'; ctx.fillRect(bx, by, Math.min(bw, bw * u.shield / u.maxHp), 2); }
      if (u.maxMana > 0) { ctx.fillStyle = '#000a'; ctx.fillRect(bx - 1, by + 5, bw + 2, 3); ctx.fillStyle = '#5fa8ff'; ctx.fillRect(bx, by + 5, bw * Math.min(1, u.mana / u.maxMana), 2); }
      if (u.lvl > 1 && hero && u.kind === 'hero') { ctx.font = 'bold 9px system-ui'; ctx.fillStyle = '#ffcf5a'; ctx.textAlign = 'left'; ctx.fillText(u.lvl, bx + bw + 2, by + 5); }
      // status marks
      const marks = [];
      if (u.st.stun > s && !(u.st.frozenU > s)) marks.push('✦');
      if (u.st.silence > s) marks.push('⊘');
      if (u.st.tauntU > s) marks.push('!');
      if (u.dots.some(d => d.k === 'burn' && d.until > s)) marks.push('🔥');
      if (u.dots.some(d => d.k === 'poison' && d.until > s)) marks.push('☣');
      if (u.st.slowU > s) marks.push('↓');
      if (marks.length) { ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe066'; ctx.fillText(marks.join(''), p.x, p.y + R + 10); }
    }
    ctx.globalAlpha = 1;
  }

  B.Render = { setup, draw, hexAt };
})(typeof window !== 'undefined' ? window : globalThis);
