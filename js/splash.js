// Splash art (review #12, David: "create HD art (splash art) at least for the out of combat parts").
// A painted-look card for every unit, made in code (no image files: the CSP only allows our own scripts): a hero pose
// drawn with the detailed model, a coloured light behind it, god rays, bokeh, mist, a rim light on the silhouette and
// a glow in the hero's colour. The battle keeps the same model at a lower detail, so both stay aligned.
(function (G) {
  const B = G.B = G.B || {};
  const cache = {};
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rgba = (col, a) => { const s = B.Models.shade(col, 0); const m = s.match(/\d+/g); return `rgba(${m[0]},${m[1]},${m[2]},${a})`; };

  function colorOf(key) {
    if (B.HEROES && B.HEROES[key]) return B.HEROES[key].color;
    if (B.BOSSES && B.BOSSES[key]) return key === 'hollowking' ? '#8a3aff' : '#c8321e';
    return '#8c3a3a';
  }
  function poseOf(key) {
    const m = B.Models.get(key), w = m.weapon;
    const p = { t: 0.6, face: -1, detail: true };
    if (m.type !== 'humanoid') return p;
    if (m.robe || w === 'staff' || w === 'orb' || w === 'flask') p.cast = 0.1;
    else if (w === 'bow' || w === 'rifle' || w === 'gun') p.atk = 0.55;
    else if (w !== 'none') p.atk = 0.4;
    else p.cast = 0.3;
    return p;
  }
  // mode 'bust' = square close-up (menus, lists); 'full' = standing figure (banners, title)
  function image(key, w, h, mode) {
    const id = key + ':' + w + 'x' + h + ':' + mode;
    if (cache[id]) return cache[id];
    if (typeof document === 'undefined' || !B.Models) return '';
    const dpr = 3, cv = document.createElement('canvas'); cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const col = colorOf(key), light = B.Models.shade(col, 0.45), R = rng(hash(key));
    // background: coloured light behind the figure fading to near black
    const bg = c.createRadialGradient(w * 0.5, h * 0.36, 2, w * 0.5, h * 0.42, Math.max(w, h) * 0.85);
    bg.addColorStop(0, rgba(light, 0.95)); bg.addColorStop(0.28, rgba(col, 0.75)); bg.addColorStop(0.7, rgba(B.Models.shade(col, -0.75), 1)); bg.addColorStop(1, '#06070a');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    // god rays
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (R() - 0.5) * 1.4, spread = 0.05 + R() * 0.07, len = h * 1.3, x0 = w * 0.5, y0 = -h * 0.05;
      c.fillStyle = rgba(light, 0.05 + R() * 0.05); c.beginPath(); c.moveTo(x0, y0);
      c.lineTo(x0 + Math.cos(a - spread) * len, y0 + Math.sin(a - spread) * len); c.lineTo(x0 + Math.cos(a + spread) * len, y0 + Math.sin(a + spread) * len); c.closePath(); c.fill();
    }
    // bokeh
    for (let i = 0; i < 16; i++) { c.fillStyle = rgba(light, 0.08 + R() * 0.22); c.beginPath(); c.arc(R() * w, R() * h * 0.85, 0.8 + R() * (w / 40), 0, Math.PI * 2); c.fill(); }
    c.restore();
    // figure on its own layer (so it can get a rim light and a glow)
    const m = B.Models.get(key), L = document.createElement('canvas'); L.width = cv.width; L.height = cv.height;
    const lc = L.getContext('2d'); lc.scale(dpr, dpr);
    let S, fy;
    if (m.type === 'humanoid') { const tall = m.h || 1; S = (mode === 'bust' ? h * 0.9 : h * 0.54) / tall; fy = mode === 'bust' ? h * 1.5 : h * 0.97; }
    else if (m.type === 'wraith') { S = mode === 'bust' ? h * 0.72 : h * 0.52; fy = mode === 'bust' ? h * 1.2 : h * 0.95; }
    else if (m.type === 'turret' || m.type === 'bomb' || m.type === 'serpent') { S = mode === 'bust' ? h * 0.95 : h * 0.8; fy = h * 0.95; }
    else { S = mode === 'bust' ? h * 0.8 : h * 0.62; fy = mode === 'bust' ? h * 1.05 : h * 0.95; }
    B.Models.draw(lc, key === 'clone' ? 'mirage' : key, w * 0.5, fy, S, poseOf(key), light);
    // rim light from the upper left, shadow toward the lower right
    lc.save(); lc.globalCompositeOperation = 'source-atop';
    const rim = lc.createLinearGradient(0, 0, w, h); rim.addColorStop(0, rgba(light, 0.55)); rim.addColorStop(0.45, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.45)');
    lc.fillStyle = rim; lc.fillRect(0, 0, w, h); lc.restore();
    // glow in the hero colour, then the figure itself
    c.save(); c.shadowColor = rgba(light, 0.9); c.shadowBlur = 14 * dpr / 2; c.drawImage(L, 0, 0, w, h); c.restore();
    c.drawImage(L, 0, 0, w, h);
    // ground mist and a few embers in front
    const fog = c.createLinearGradient(0, h * 0.7, 0, h); fog.addColorStop(0, 'rgba(6,7,10,0)'); fog.addColorStop(1, 'rgba(6,7,10,0.85)');
    c.fillStyle = fog; c.fillRect(0, 0, w, h);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) { c.fillStyle = rgba('#ffcf8a', 0.25 + R() * 0.4); c.beginPath(); c.arc(R() * w, h * (0.55 + R() * 0.4), 0.6 + R() * 1.2, 0, Math.PI * 2); c.fill(); }
    c.restore();
    // vignette
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); c.fillStyle = vg; c.fillRect(0, 0, w, h);
    return (cache[id] = cv.toDataURL());
  }
  B.Splash = { image };
})(typeof window !== 'undefined' ? window : globalThis);
