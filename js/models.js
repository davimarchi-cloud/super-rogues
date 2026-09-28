// 2.5D unit models drawn in code (no image files: the CSP only allows our own scripts, and this keeps it light).
// Every unit is a small rig (humanoid, beast, bomb, golem, serpent, wraith, turret) with its own parts and colours.
// Poses: idle (breathing), walk (legs + bob), attack (windup -> strike exactly at the hit tick), cast (arms up + glow),
// hurt flash, death (tips over and fades). Coordinates: origin at the feet, facing right, S = unit scale in px.
(function (G) {
  const B = G.B = G.B || {};
  const H = (o) => Object.assign({ type: 'humanoid', skin: '#e0b48a', body: '#556', trim: '#aa8', legs: '#333', bulk: 1, head: 'bald', weapon: 'none', h: 1 }, o);
  const M = {
    // heroes
    bastion: H({ body: '#4d6fb8', trim: '#d9c36a', legs: '#2c3a5c', bulk: 1.3, head: 'helm', weapon: 'shieldmace', pauldrons: '#8fa6d8', cape: '#23407a' }),
    vex: H({ body: '#3b2553', trim: '#a05cff', legs: '#1d1328', bulk: 0.85, head: 'hood', hood: '#2a1a3d', weapon: 'daggers', cape: '#5d2d8f', eyes: '#d9b3ff' }),
    pyra: H({ body: '#b8452a', trim: '#ffb347', robe: '#8e2f1c', head: 'hat', hat: '#5a1d12', weapon: 'staff', orb: '#ff7a3d', hair: '#ff9d3d' }),
    glacia: H({ body: '#9fd8ef', trim: '#ffffff', robe: '#5aa9cc', head: 'tiara', hair: '#e6f7ff', weapon: 'staff', orb: '#bff4ff', skin: '#f0dcd0' }),
    brakk: H({ body: '#7a3b2a', trim: '#c9a26a', legs: '#3d2218', bulk: 1.4, head: 'boar', skin: '#8a5a44', weapon: 'axe', pauldrons: '#5a4a3a' }),
    lumen: H({ body: '#f2ead0', trim: '#ffcf5a', robe: '#e6dcb8', head: 'halo', hair: '#c9a26a', weapon: 'staff', orb: '#fff3a0' }),
    kestrel: H({ body: '#3f7a3a', trim: '#b5d68b', legs: '#2d3b22', bulk: 0.9, head: 'hood', hood: '#2f5a2b', weapon: 'bow', quiver: true, eyes: '#e8ffd0' }),
    morrow: H({ body: '#4a4f5c', trim: '#9aa3b5', robe: '#2c3038', head: 'skull', weapon: 'scythe', cape: '#1c1f26', eyes: '#6effc4' }),
    tempest: H({ body: '#5b4a9e', trim: '#d8c8ff', robe: '#3e3178', head: 'hat', hat: '#2a2160', weapon: 'staff', orb: '#d8c8ff', hair: '#e8e8ff', sparks: true }),
    grimhook: H({ body: '#2f7f73', trim: '#e0c07a', legs: '#1f3b37', bulk: 1.2, head: 'tricorn', hat: '#1b2a28', skin: '#c89a7a', weapon: 'hook', cape: '#173c37' }),
    mirage: H({ body: '#c2447f', trim: '#ffd1e8', legs: '#4a1d33', bulk: 0.85, head: 'mask', hair: '#2a1020', weapon: 'rapier', cape: '#7a2450' }),
    rook: H({ body: '#b8792a', trim: '#6e6e6e', legs: '#4a3520', bulk: 1.05, head: 'goggles', hair: '#5a3a1a', weapon: 'wrench', pack: true }),
    thorne: H({ skin: '#d9a07a', body: '#7a2a22', trim: '#c9a26a', legs: '#3a1f18', bulk: 1.3, head: 'bald', hair: '#d4483b', weapon: 'axe', pauldrons: '#5a3a2a', paint: true }),
    seraph: H({ body: '#f2e4b8', trim: '#ffcf5a', legs: '#b8a878', bulk: 1.2, head: 'helm', plume: '#ffcf5a', pauldrons: '#fff3c8', weapon: 'sword', wings: '#fffaf0' }),
    nyx: H({ skin: '#9ab', body: '#1a2a36', trim: '#35c6d6', legs: '#101820', bulk: 0.9, head: 'hood', hood: '#0f1c26', eyes: '#35c6d6', weapon: 'sword', cape: '#123a44' }),
    bramble: { type: 'golem', body: '#6a5236', trim: '#9fe07a', leaves: '#4f8a2f' },
    echo: H({ body: '#6a3a8a', trim: '#ffcf5a', legs: '#2a1a3a', head: 'hat', hat: '#3a1f55', hair: '#e0b070', weapon: 'lute', cape: '#9a5ac8' }),
    blaze: H({ body: '#8a5a2a', trim: '#e0c07a', legs: '#3a2a1a', head: 'tricorn', hat: '#4a2a14', skin: '#d9a07a', weapon: 'gun', cape: '#5a3a1a' }),
    // mobs
    grunt: H({ skin: '#6fa04a', body: '#6b4a2a', trim: '#3a2a1a', legs: '#3d2a18', h: 0.85, head: 'ears', weapon: 'club' }),
    archer: H({ skin: '#6fa04a', body: '#5a4a2a', trim: '#8a7a4a', legs: '#3d2a18', h: 0.85, head: 'hood', hood: '#4a3a22', weapon: 'bow', eyes: '#ff5' }),
    brute: H({ skin: '#8a8f6a', body: '#5a4030', trim: '#3a2a20', legs: '#3a2a20', bulk: 1.6, h: 1.15, head: 'bald', weapon: 'club' }),
    skulker: H({ skin: '#556', body: '#1e1e26', trim: '#e05555', legs: '#15151c', bulk: 0.8, head: 'hood', hood: '#15151c', weapon: 'daggers', eyes: '#f55' }),
    shaman: H({ skin: '#6fa04a', body: '#6a5a2a', trim: '#e0c07a', robe: '#4a5a2a', h: 0.9, head: 'skull', weapon: 'staff', orb: '#7dff7a', feathers: true }),
    bomber: { type: 'bomb', body: '#2a2a30', trim: '#e05555' },
    shieldbearer: H({ skin: '#6fa04a', body: '#6a6f7a', trim: '#c9a26a', legs: '#3a3a42', bulk: 1.2, head: 'helm', weapon: 'tower' }),
    hexer: H({ skin: '#8a7aa0', body: '#4a2a5a', trim: '#c77dff', robe: '#3a1f48', head: 'hood', hood: '#2a1535', weapon: 'orb', orb: '#c77dff', eyes: '#e0b0ff' }),
    golem: { type: 'golem', body: '#7a7468', trim: '#ffb347' },
    summoner: H({ skin: '#a08a7a', body: '#6a1f24', trim: '#e0c07a', robe: '#4a1418', head: 'hood', hood: '#3a1014', weapon: 'staff', orb: '#ffcf5a', eyes: '#ffcf5a' }),
    spitter: { type: 'serpent', body: '#4a8a3a', trim: '#c9e070' },
    knight: H({ body: '#2a2a36', trim: '#8a1f2a', legs: '#1a1a22', bulk: 1.3, head: 'helm', plume: '#c43a3a', weapon: 'sword', pauldrons: '#3a3a48', cape: '#5a1520' }),
    imp: H({ skin: '#c43a3a', body: '#a02a2a', trim: '#ffcf5a', legs: '#6a1a1a', h: 0.62, bulk: 0.8, head: 'horns', horn: '#2a1a1a', weapon: 'none', wings: '#6a1a1a' }),
    wolf: { type: 'beast', body: '#7a7f8a', trim: '#cfd3dc' },
    // bosses
    gorewarden: H({ skin: '#9a4a3a', body: '#4a1f1a', trim: '#c9a26a', legs: '#2a1510', bulk: 1.7, h: 1.2, head: 'horns', horn: '#e8dcc0', weapon: 'axe', pauldrons: '#6a3a2a', cape: '#6a1a14' }),
    hollowking: { type: 'wraith', body: '#2a1f3a', trim: '#a44dff', crown: '#ffcf5a' },
    // summons
    skeleton: H({ skin: '#e8e2d0', body: '#cfc8b4', trim: '#8a8474', legs: '#cfc8b4', bulk: 0.8, head: 'skull', weapon: 'sword', eyes: '#6effc4', bones: true }),
    turret: { type: 'turret', body: '#d9a441', trim: '#5a4a2a' },
  };
  M.clone = M.mirage;

  // ------------------------------------------------------------------ helpers
  const TAU = Math.PI * 2;
  // ---- review #8 "more HD": every part is drawn cel-shaded: dark ink outline, shaded body, a light rim toward the
  // upper-left light, and a specular glint on round parts. All models go through these helpers.
  const LIGHT = 0.38, INK = 'rgba(12,10,16,0.9)';
  function rgbOf(col) {
    if (col[0] === '#') { const n = parseInt(col.length === 4 ? col.slice(1).split('').map(x => x + x).join('') : col.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    const m = col.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
  }
  function shade(col, f) {
    let [r, g, b] = rgbOf(col);
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  const isColor = col => typeof col === 'string' && (col[0] === '#' || col.startsWith('rgb'));
  function seg(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function limb(c, x1, y1, x2, y2, w, col) {
    c.lineCap = 'round';
    if (w < 2) { c.strokeStyle = col; c.lineWidth = w; seg(c, x1, y1, x2, y2); return; }
    c.strokeStyle = INK; c.lineWidth = w + 2; seg(c, x1, y1, x2, y2);
    c.strokeStyle = isColor(col) ? shade(col, -0.12) : col; c.lineWidth = w; seg(c, x1, y1, x2, y2);
    if (isColor(col) && w >= 3) { const o = w * 0.2; c.strokeStyle = shade(col, LIGHT); c.lineWidth = Math.max(1, w * 0.3); seg(c, x1 - o, y1 - o, x2 - o, y2 - o); }
  }
  function ball(c, x, y, r, col, line) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (isColor(col) && r >= 3) {
      const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, shade(col, LIGHT)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.35)); c.fillStyle = g;
    } else c.fillStyle = col;
    c.fill();
    if (r >= 2.5) { c.strokeStyle = INK; c.lineWidth = r > 6 ? 1.4 : 1; c.stroke(); }
    if (isColor(col) && r >= 4) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.38, y - r * 0.42, r * 0.16, 0, TAU); c.fill(); }
  }
  function poly(c, pts, col, line) {
    c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (isColor(col)) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.32)); c.fillStyle = g;
    } else c.fillStyle = col;
    c.fill(); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
  }
  const OUT = 'rgba(0,0,0,0.55)';

  // arm pose: angle 0 = hanging down, positive = forward. Returns the hand position.
  const hand = (sx, sy, a, len) => [sx + Math.sin(a) * len, sy + Math.cos(a) * len];

  function armAngles(m, p) {
    // [front arm, back arm]
    let f = 0.35 + Math.sin(p.t * 2.2) * 0.05, b = -0.25 - Math.sin(p.t * 2.2) * 0.05;
    if (p.walk != null) { const s = Math.sin(p.walk * TAU); f = 0.2 - s * 0.45; b = -0.1 + s * 0.45; }
    if (p.atk != null) {
      const k = p.atk, w = m.weapon;
      if (w === 'bow') { f = 1.45; b = 1.45 - Math.min(1, k * 1.3) * 0.9; }
      else if (w === 'staff' || w === 'orb') { f = k < 0.7 ? 0.4 + k / 0.7 * 2.2 : 2.6 - (k - 0.7) / 0.3 * 1.2; }
      else if (w === 'tower' || w === 'shieldmace') { b = k < 0.65 ? -0.2 - k / 0.65 * 2.4 : -2.6 + (k - 0.65) / 0.35 * 3.8; f = 0.9; }
      else if (w === 'daggers') { f = k < 0.6 ? 0.3 - k / 0.6 * 1.6 : -1.3 + (k - 0.6) / 0.4 * 3; b = f * 0.7 + 0.4; }
      else { f = k < 0.65 ? 0.3 - k / 0.65 * 2.6 : -2.3 + (k - 0.65) / 0.35 * 3.5; }
    }
    if (p.cast != null) { const up = Math.sin(Math.min(1, p.cast * 1.6) * Math.PI / 2); f = f + (2.8 - f) * up; b = b + (-2.8 - b) * up * 0.9; }
    return [f, b];
  }

  // ------------------------------------------------------------------ humanoid
  function weapon(c, m, x, y, a, S, p) {
    // phi = direction the arm points (screen angle). Blades follow the arm (a swing arc); staves stay upright;
    // the bow is held vertical in front.
    const w = m.weapon, phi = Math.PI / 2 - a;
    const ang = w === 'bow' ? 0 : w === 'lute' ? -0.5 : (w === 'staff' || w === 'scythe') ? -1.35 + (a - 0.35) * 0.45 : w === 'orb' ? -0.6 : w === 'daggers' ? phi - 0.3 : phi - 0.5;
    c.save(); c.translate(x, y); c.rotate(ang);
    // local frame: +x = along the weapon
    if (w === 'sword' || w === 'rapier') { const L = S * (w === 'rapier' ? 0.62 : 0.55); limb(c, 0, 0, L, 0, S * (w === 'rapier' ? 0.035 : 0.07), '#dfe6ee'); limb(c, -S * 0.02, -S * 0.08, -S * 0.02, S * 0.08, S * 0.05, m.trim); }
    else if (w === 'club') { limb(c, 0, 0, S * 0.45, 0, S * 0.1, '#6a4a2a'); ball(c, S * 0.45, 0, S * 0.08, '#7a5a3a'); }
    else if (w === 'axe') { limb(c, -S * 0.1, 0, S * 0.6, 0, S * 0.06, '#5a3a22'); poly(c, [[S * 0.45, 0], [S * 0.62, -S * 0.2], [S * 0.72, -S * 0.02], [S * 0.62, S * 0.2]], '#c8cdd4', OUT); }
    else if (w === 'staff' || w === 'orb') {
      if (w === 'staff') limb(c, -S * 0.35, 0, S * 0.55, 0, S * 0.05, '#6a4a2a');
      const glow = 0.6 + 0.4 * Math.sin(p.t * 4);
      c.globalAlpha *= 0.5; ball(c, S * (w === 'staff' ? 0.62 : 0.12), 0, S * (0.14 + 0.03 * glow), m.orb); c.globalAlpha /= 0.5;
      ball(c, S * (w === 'staff' ? 0.62 : 0.12), 0, S * 0.08, shade(m.orb, 0.4));
      if (m.feathers) { limb(c, S * 0.5, 0, S * 0.45, S * 0.15, S * 0.03, '#e05555'); limb(c, S * 0.5, 0, S * 0.4, -S * 0.15, S * 0.03, '#ffcf5a'); }
    }
    else if (w === 'bow') { c.strokeStyle = '#8a5a2a'; c.lineWidth = S * 0.05; c.beginPath(); c.arc(-S * 0.05, 0, S * 0.36, -1.2, 1.2); c.stroke(); limb(c, Math.cos(1.2) * S * 0.36 - S * 0.05, -Math.sin(1.2) * S * 0.36, Math.cos(1.2) * S * 0.36 - S * 0.05, Math.sin(1.2) * S * 0.36, 1, '#eee'); }
    else if (w === 'daggers') { limb(c, 0, 0, S * 0.3, 0, S * 0.05, '#e8eef5'); }
    else if (w === 'hook') { limb(c, 0, 0, S * 0.3, 0, S * 0.05, '#777'); c.strokeStyle = '#aab'; c.lineWidth = S * 0.06; c.beginPath(); c.arc(S * 0.38, S * 0.08, S * 0.12, -Math.PI * 0.6, Math.PI * 0.9); c.stroke(); }
    else if (w === 'wrench') { limb(c, 0, 0, S * 0.4, 0, S * 0.07, '#9aa0a8'); c.strokeStyle = '#9aa0a8'; c.lineWidth = S * 0.06; c.beginPath(); c.arc(S * 0.45, 0, S * 0.08, 0.6, TAU - 0.6); c.stroke(); }
    else if (w === 'lute') { c.fillStyle = '#b8793a'; c.beginPath(); c.ellipse(S * 0.05, 0, S * 0.16, S * 0.12, 0, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke(); limb(c, S * 0.15, 0, S * 0.5, 0, S * 0.05, '#6a4a2a'); ball(c, S * 0.05, 0, S * 0.04, '#3a2210'); }
    else if (w === 'gun') { limb(c, 0, 0, S * 0.32, 0, S * 0.08, '#555a63'); limb(c, 0, 0, -S * 0.02, S * 0.14, S * 0.08, '#6a4a2a'); }
    else if (w === 'scythe') { limb(c, -S * 0.3, 0, S * 0.65, 0, S * 0.05, '#4a3a2a'); c.fillStyle = '#c8d0da'; c.beginPath(); c.moveTo(S * 0.65, 0); c.quadraticCurveTo(S * 0.55, -S * 0.45, S * 0.15, -S * 0.42); c.quadraticCurveTo(S * 0.45, -S * 0.3, S * 0.6, 0); c.fill(); }
    c.restore();
  }
  function headgear(c, m, hx, hy, r, p) {
    const k = m.head;
    const eyes = (col) => { ball(c, hx + r * 0.35, hy - r * 0.05, r * 0.14, col || '#222'); ball(c, hx + r * 0.75, hy - r * 0.05, r * 0.12, col || '#222'); };
    if (k === 'skull') { ball(c, hx, hy, r, m.skin === '#e0b48a' ? '#e8e2d0' : '#e8e2d0', OUT); ball(c, hx + r * 0.35, hy - r * 0.05, r * 0.2, '#111'); ball(c, hx + r * 0.75, hy - r * 0.05, r * 0.17, '#111'); if (m.eyes) { ball(c, hx + r * 0.35, hy - r * 0.05, r * 0.08, m.eyes); ball(c, hx + r * 0.75, hy - r * 0.05, r * 0.07, m.eyes); } limb(c, hx + r * 0.3, hy + r * 0.55, hx + r * 0.8, hy + r * 0.5, 1, '#555'); return; }
    if (k === 'boar') { ball(c, hx, hy, r * 1.1, m.skin, OUT); poly(c, [[hx + r * 0.6, hy - r * 0.2], [hx + r * 1.45, hy + r * 0.05], [hx + r * 1.45, hy + r * 0.45], [hx + r * 0.6, hy + r * 0.5]], shade(m.skin, -0.15), OUT); ball(c, hx + r * 1.4, hy + r * 0.25, r * 0.12, '#3a2018'); limb(c, hx + r * 1.0, hy + r * 0.45, hx + r * 1.25, hy - r * 0.05, r * 0.16, '#f2ead0'); poly(c, [[hx - r * 0.2, hy - r * 0.8], [hx - r * 0.55, hy - r * 1.35], [hx - r * 0.05, hy - r * 0.9]], shade(m.skin, -0.2)); eyes('#ffcf5a'); return; }
    ball(c, hx, hy, r, m.skin, OUT);
    if (m.hair && k !== 'hood' && k !== 'helm') { c.fillStyle = m.hair; c.beginPath(); c.arc(hx - r * 0.1, hy - r * 0.15, r * 1.02, Math.PI * 0.95, Math.PI * 2.05); c.fill(); }
    eyes(m.eyes && k === 'hood' ? m.eyes : null);
    if (k === 'helm') {
      c.fillStyle = m.pauldrons || shade(m.body, 0.25); c.beginPath(); c.arc(hx, hy, r * 1.12, Math.PI * 0.9, Math.PI * 2.1); c.lineTo(hx + r * 1.1, hy + r * 0.7); c.lineTo(hx - r * 1.05, hy + r * 0.7); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
      limb(c, hx + r * 0.1, hy, hx + r * 1.05, hy, r * 0.2, '#111');
      if (m.plume) { c.fillStyle = m.plume; c.beginPath(); c.ellipse(hx - r * 0.4, hy - r * 1.2, r * 0.7, r * 0.3, -0.5, 0, TAU); c.fill(); }
    } else if (k === 'hood') {
      c.fillStyle = m.hood; c.beginPath(); c.arc(hx - r * 0.05, hy - r * 0.05, r * 1.2, Math.PI * 0.55, Math.PI * 2.25); c.quadraticCurveTo(hx + r * 0.6, hy + r * 0.4, hx + r * 0.2, hy + r * 1.1); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(hx + r * 0.45, hy + r * 0.1, r * 0.65, 0, TAU); c.fill();
      ball(c, hx + r * 0.3, hy - r * 0.05, r * 0.12, m.eyes || '#ddd'); ball(c, hx + r * 0.7, hy - r * 0.05, r * 0.11, m.eyes || '#ddd');
    } else if (k === 'hat') {
      poly(c, [[hx - r * 1.4, hy - r * 0.55], [hx + r * 1.5, hy - r * 0.55], [hx + r * 0.9, hy - r * 0.8], [hx - r * 0.2, hy - r * 2.3 + Math.sin(p.t * 2) * r * 0.1], [hx - r * 0.9, hy - r * 0.8]], m.hat, OUT);
      limb(c, hx - r * 0.95, hy - r * 0.72, hx + r * 0.95, hy - r * 0.72, r * 0.18, m.trim);
    } else if (k === 'horns') {
      c.strokeStyle = m.horn; c.lineWidth = r * 0.3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(hx + r * 0.3, hy - r * 0.7); c.quadraticCurveTo(hx + r * 1.2, hy - r * 1.3, hx + r * 0.8, hy - r * 1.9); c.stroke();
      c.beginPath(); c.moveTo(hx - r * 0.4, hy - r * 0.7); c.quadraticCurveTo(hx - r * 1.3, hy - r * 1.3, hx - r * 0.9, hy - r * 1.9); c.stroke();
    } else if (k === 'tiara') { for (let i = -2; i <= 2; i++) poly(c, [[hx + i * r * 0.35 - r * 0.15, hy - r * 0.75], [hx + i * r * 0.35, hy - r * (1.35 + (i === 0 ? 0.35 : 0))], [hx + i * r * 0.35 + r * 0.15, hy - r * 0.75]], '#dff8ff', '#7ac8e0'); }
    else if (k === 'halo') { c.strokeStyle = '#ffe066'; c.lineWidth = r * 0.22; c.globalAlpha *= 0.9; c.beginPath(); c.ellipse(hx, hy - r * 1.45, r * 0.85, r * 0.28, 0, 0, TAU); c.stroke(); c.globalAlpha /= 0.9; }
    else if (k === 'tricorn') { poly(c, [[hx - r * 1.3, hy - r * 0.5], [hx + r * 1.4, hy - r * 0.5], [hx + r * 0.8, hy - r * 1.4], [hx, hy - r * 1.1], [hx - r * 0.8, hy - r * 1.4]], m.hat, OUT); limb(c, hx - r * 1.1, hy - r * 0.55, hx + r * 1.2, hy - r * 0.55, r * 0.15, m.trim); }
    else if (k === 'mask') { c.fillStyle = '#f5f0ea'; c.beginPath(); c.ellipse(hx + r * 0.45, hy, r * 0.62, r * 0.8, 0, 0, TAU); c.fill(); ball(c, hx + r * 0.3, hy - r * 0.15, r * 0.13, '#222'); ball(c, hx + r * 0.75, hy - r * 0.15, r * 0.12, '#222'); c.strokeStyle = '#c2447f'; c.lineWidth = 1.2; c.beginPath(); c.arc(hx + r * 0.5, hy + r * 0.25, r * 0.25, 0.2, Math.PI - 0.2); c.stroke(); }
    else if (k === 'goggles') { limb(c, hx - r * 0.9, hy - r * 0.35, hx + r * 0.9, hy - r * 0.35, r * 0.25, '#3a2a1a'); ball(c, hx + r * 0.35, hy - r * 0.35, r * 0.3, '#9fd8ef', '#5a4a2a'); ball(c, hx + r * 0.85, hy - r * 0.35, r * 0.26, '#9fd8ef', '#5a4a2a'); }
    else if (k === 'ears') { poly(c, [[hx - r * 0.6, hy - r * 0.2], [hx - r * 1.6, hy - r * 0.7], [hx - r * 0.7, hy + r * 0.25]], m.skin, OUT); poly(c, [[hx + r * 0.5, hy - r * 0.5], [hx + r * 1.3, hy - r * 1.1], [hx + r * 0.8, hy - r * 0.2]], m.skin, OUT); }
  }
  function humanoid(c, m, S, p) {
    const s = S * m.h, bulk = m.bulk;
    const bob = p.walk != null ? Math.abs(Math.sin(p.walk * TAU)) * s * 0.05 : Math.sin(p.t * 2.2) * s * 0.015;
    const hipY = -s * 0.55 - bob, shY = -s * 1.0 - bob, headR = s * 0.2, headY = shY - headR * 1.15;
    const lean = p.walk != null ? 0.06 * s : 0, shX = lean;
    const [fa, ba] = armAngles(m, p), armL = s * 0.42, armW = s * 0.11 * Math.sqrt(bulk);
    // wings / cape (behind)
    if (m.wings) { const f = Math.sin(p.t * 12) * 0.4; c.fillStyle = m.wings; for (const d of [-1, 1]) { c.beginPath(); c.moveTo(shX - s * 0.05, shY + s * 0.1); c.quadraticCurveTo(shX - s * 0.6, shY - s * (0.5 + d * 0.1 + f * 0.3), shX - s * 0.75, shY + s * 0.15); c.quadraticCurveTo(shX - s * 0.4, shY + s * 0.05, shX - s * 0.05, shY + s * 0.25); c.fill(); } }
    if (m.cape) { const sw = Math.sin(p.t * 2 + (p.walk || 0) * 6) * s * 0.06; poly(c, [[shX - s * 0.15 * bulk, shY], [shX + s * 0.05, shY], [-s * 0.08 + sw, hipY + s * 0.35], [-s * 0.4 * bulk + sw, hipY + s * 0.3]], m.cape, OUT); }
    if (m.quiver) { poly(c, [[shX - s * 0.25, shY - s * 0.1], [shX - s * 0.12, shY - s * 0.15], [shX - s * 0.05, hipY], [shX - s * 0.18, hipY + s * 0.02]], '#6a4a2a'); for (let i = 0; i < 3; i++) limb(c, shX - s * (0.22 - i * 0.04), shY - s * 0.12, shX - s * (0.27 - i * 0.04), shY - s * 0.3, 1.5, '#e8e2d0'); }
    if (m.pack) { poly(c, [[shX - s * 0.42, shY + s * 0.02], [shX - s * 0.12, shY], [shX - s * 0.12, hipY], [shX - s * 0.42, hipY]], '#6e6e6e', OUT); ball(c, shX - s * 0.27, shY + s * 0.18, s * 0.06, '#ffcf5a'); }
    // back arm
    const bsx = shX - s * 0.12 * bulk, [bhx, bhy] = hand(bsx, shY + s * 0.04, ba, armL);
    limb(c, bsx, shY + s * 0.04, bhx, bhy, armW, shade(m.body, -0.3));
    if (m.weapon === 'daggers' || m.weapon === 'shieldmace') weapon(c, m, bhx, bhy, ba, s * (m.weapon === 'shieldmace' ? 0.9 : 1), p);
    if (m.weapon === 'shieldmace') { c.save(); c.translate(bhx, bhy); limb(c, 0, 0, Math.sin(ba + 0.5) * s * 0.3, Math.cos(ba + 0.5) * s * 0.3, s * 0.06, '#6a4a2a'); ball(c, Math.sin(ba + 0.5) * s * 0.34, Math.cos(ba + 0.5) * s * 0.34, s * 0.1, '#9aa0a8', OUT); c.restore(); }
    // legs or robe
    if (m.robe) {
      const sw = p.walk != null ? Math.sin(p.walk * TAU) * s * 0.06 : 0;
      poly(c, [[-s * 0.17 * bulk, hipY - s * 0.08], [s * 0.19 * bulk, hipY - s * 0.08], [s * 0.3 + sw, 0], [-s * 0.3 + sw, 0]], m.robe, OUT);
      limb(c, -s * 0.28 + sw, -s * 0.02, s * 0.28 + sw, -s * 0.02, s * 0.05, m.trim);
    } else {
      const la = p.walk != null ? Math.sin(p.walk * TAU) * 0.55 : 0, legL = -hipY, legW = s * 0.13 * Math.sqrt(bulk);
      limb(c, -s * 0.06, hipY, -s * 0.06 + Math.sin(-la) * legL, hipY + Math.cos(la) * legL, legW, shade(m.legs, -0.25));
      limb(c, s * 0.06, hipY, s * 0.06 + Math.sin(la) * legL, hipY + Math.cos(la) * legL, legW, m.legs);
    }
    // torso with fake light from the upper left
    const tw = s * 0.2 * bulk, bw = s * 0.15 * bulk;
    const g = c.createLinearGradient(-tw, 0, tw, 0); g.addColorStop(0, shade(m.body, 0.25)); g.addColorStop(1, shade(m.body, -0.35));
    c.fillStyle = g; c.beginPath(); c.moveTo(shX - tw, shY); c.lineTo(shX + tw, shY); c.lineTo(bw, hipY + s * 0.04); c.lineTo(-bw, hipY + s * 0.04); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
    c.strokeStyle = shade(m.body, 0.45); c.lineWidth = 1; seg(c, shX - tw + 1.5, shY + 1.5, -bw + 1.5, hipY);
    c.strokeStyle = shade(m.body, -0.45); c.globalAlpha *= 0.6; seg(c, shX + tw * 0.15, shY + s * 0.1, bw * 0.3, hipY - s * 0.02); c.globalAlpha /= 0.6;
    if (m.paint) { limb(c, shX - tw * 0.6, shY + s * 0.12, shX + tw * 0.2, shY + s * 0.3, 2, '#d4483b'); limb(c, shX - tw * 0.4, shY + s * 0.28, shX + tw * 0.4, shY + s * 0.42, 2, '#d4483b'); }
    if (m.bones) for (let i = 0; i < 3; i++) limb(c, shX - tw * 0.7, shY + s * (0.1 + i * 0.1), shX + tw * 0.7, shY + s * (0.1 + i * 0.1), 1.5, '#8a8474');
    limb(c, -bw, hipY + s * 0.02, bw, hipY + s * 0.02, s * 0.05, m.trim);
    if (m.pauldrons) { ball(c, shX - tw * 0.9, shY + s * 0.02, s * 0.1 * bulk, m.pauldrons, OUT); ball(c, shX + tw * 0.9, shY + s * 0.02, s * 0.1 * bulk, m.pauldrons, OUT); }
    // head
    headgear(c, m, shX + s * 0.02, headY, headR * (m.head === 'boar' ? 1.1 : 1), p);
    if (m.head !== 'boar' && m.head !== 'skull' && m.head !== 'mask' && m.head !== 'hood' && m.head !== 'helm') { /* mouth hint */ limb(c, shX + headR * 0.4, headY + headR * 0.45, shX + headR * 0.75, headY + headR * 0.42, 1, 'rgba(0,0,0,0.5)'); }
    // front arm + weapon
    const fsx = shX + s * 0.12 * bulk, [fhx, fhy] = hand(fsx, shY + s * 0.04, fa, armL);
    if (m.weapon === 'tower') { poly(c, [[shX + s * 0.12, shY - s * 0.15], [shX + s * 0.42, shY - s * 0.15], [shX + s * 0.42, hipY + s * 0.3], [shX + s * 0.27, hipY + s * 0.42], [shX + s * 0.12, hipY + s * 0.3]], '#7a808a', OUT); limb(c, shX + s * 0.27, shY - s * 0.1, shX + s * 0.27, hipY + s * 0.35, s * 0.04, m.trim); }
    if (m.weapon === 'shieldmace') { const k = p.atk != null ? 0 : 0; poly(c, [[shX + s * 0.18 + k, shY - s * 0.08], [shX + s * 0.46, shY - s * 0.08], [shX + s * 0.46, hipY + s * 0.15], [shX + s * 0.32, hipY + s * 0.32], [shX + s * 0.18, hipY + s * 0.15]], '#3d5aa0', '#d9c36a'); ball(c, shX + s * 0.32, shY + s * 0.2, s * 0.06, '#d9c36a'); }
    else if (m.weapon !== 'none' && m.weapon !== 'tower') weapon(c, m, fhx, fhy, fa, s, p);
    limb(c, fsx, shY + s * 0.04, fhx, fhy, armW, shade(m.body, 0.05));
    ball(c, fhx, fhy, armW * 0.55, m.skin);
    if (m.sparks && Math.sin(p.t * 9) > 0.6) limb(c, fhx + s * 0.1, fhy - s * 0.4, fhx + s * 0.18, fhy - s * 0.52, 1.5, '#fff6a0');
  }

  // ------------------------------------------------------------------ other rigs
  function beast(c, m, S, p) {
    const s = S * 0.9, run = p.walk != null ? p.walk * TAU : p.t * 1.5, bob = p.walk != null ? Math.abs(Math.sin(run)) * s * 0.05 : 0;
    const lunge = p.atk != null ? Math.sin(p.atk * Math.PI) * s * 0.2 : 0, by = -s * 0.45 - bob;
    for (const [x, ph, back] of [[-s * 0.3, 0, 1], [s * 0.25, Math.PI, 1], [-s * 0.2, Math.PI, 0], [s * 0.35, 0, 0]]) {
      const a = p.walk != null ? Math.sin(run + ph) * 0.5 : 0;
      limb(c, x + lunge, by + s * 0.1, x + lunge + Math.sin(a) * s * 0.35, by + s * 0.1 + Math.cos(a) * s * 0.35, s * 0.09, back ? shade(m.body, -0.35) : shade(m.body, -0.1));
    }
    limb(c, -s * 0.45 + lunge, by, -s * 0.75 + lunge, by - s * 0.25 + Math.sin(p.t * 6) * s * 0.05, s * 0.08, m.body);
    const g = c.createLinearGradient(0, by - s * 0.2, 0, by + s * 0.2); g.addColorStop(0, shade(m.body, 0.25)); g.addColorStop(1, shade(m.body, -0.3));
    c.fillStyle = g; c.beginPath(); c.ellipse(lunge, by, s * 0.5, s * 0.22, 0, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1.2; c.stroke();
    const hx = s * 0.5 + lunge, hy = by - s * 0.2;
    ball(c, hx, hy, s * 0.18, m.body, OUT);
    poly(c, [[hx + s * 0.1, hy - s * 0.05], [hx + s * 0.4, hy + s * (p.atk != null ? 0.02 : 0.06)], [hx + s * 0.1, hy + s * 0.14]], m.trim, OUT);
    poly(c, [[hx - s * 0.1, hy - s * 0.12], [hx - s * 0.05, hy - s * 0.38], [hx + s * 0.05, hy - s * 0.12]], shade(m.body, -0.2));
    ball(c, hx + s * 0.08, hy - s * 0.04, s * 0.035, '#ffcf5a');
  }
  function bomb(c, m, S, p) {
    const s = S * 0.9, bob = p.walk != null ? Math.abs(Math.sin(p.walk * TAU)) * s * 0.08 : Math.sin(p.t * 3) * s * 0.02, cy = -s * 0.42 - bob;
    const la = p.walk != null ? Math.sin(p.walk * TAU) * 0.6 : 0;
    limb(c, -s * 0.12, cy + s * 0.25, -s * 0.12 - Math.sin(la) * s * 0.2, 0, s * 0.07, '#222'); limb(c, s * 0.12, cy + s * 0.25, s * 0.12 + Math.sin(la) * s * 0.2, 0, s * 0.07, '#333');
    const g = c.createRadialGradient(-s * 0.12, cy - s * 0.12, s * 0.05, 0, cy, s * 0.36); g.addColorStop(0, '#6a6a78'); g.addColorStop(1, m.body);
    c.fillStyle = g; c.beginPath(); c.arc(0, cy, s * 0.34, 0, TAU); c.fill(); c.strokeStyle = OUT; c.stroke();
    limb(c, s * 0.05, cy - s * 0.34, s * 0.15, cy - s * 0.5, s * 0.04, '#8a6a4a');
    const fl = 0.5 + 0.5 * Math.sin(p.t * 20); ball(c, s * 0.16, cy - s * 0.53, s * (0.05 + fl * 0.04), fl > 0.5 ? '#ffcf5a' : '#ff7a3d');
    limb(c, s * 0.05, cy - s * 0.08, s * 0.2, cy - s * 0.02, 2, m.trim); limb(c, s * 0.22, cy - s * 0.1, s * 0.3, cy - s * 0.04, 2, m.trim);
  }
  function golem(c, m, S, p) {
    const s = S * 1.1, bob = p.walk != null ? Math.abs(Math.sin(p.walk * TAU)) * s * 0.03 : 0;
    const slam = p.atk != null ? (p.atk < 0.7 ? -p.atk / 0.7 * s * 0.4 : -s * 0.4 + (p.atk - 0.7) / 0.3 * s * 0.55) : (p.cast != null ? -Math.sin(p.cast * Math.PI) * s * 0.5 : 0);
    const la = p.walk != null ? Math.sin(p.walk * TAU) * 0.3 : 0;
    const rock = (x, y, w, h, col) => { poly(c, [[x - w, y - h * 0.7], [x - w * 0.6, y - h], [x + w * 0.7, y - h], [x + w, y - h * 0.5], [x + w * 0.8, y + h * 0.4], [x - w * 0.7, y + h * 0.5]], col, OUT); };
    rock(-s * 0.15 + Math.sin(-la) * s * 0.1, -s * 0.12, s * 0.12, s * 0.14, shade(m.body, -0.3)); rock(s * 0.15 + Math.sin(la) * s * 0.1, -s * 0.12, s * 0.12, s * 0.14, shade(m.body, -0.15));
    rock(0, -s * 0.62 - bob, s * 0.36, s * 0.34, m.body);
    for (let i = 0; i < 3; i++) limb(c, -s * 0.15 + i * s * 0.12, -s * 0.72 - bob, -s * 0.1 + i * s * 0.12, -s * 0.55 - bob, 1.5, m.trim);
    rock(s * 0.05, -s * 1.05 - bob, s * 0.16, s * 0.14, shade(m.body, 0.15));
    ball(c, s * 0.1, -s * 1.08 - bob, s * 0.035, m.trim); ball(c, s * 0.18, -s * 1.08 - bob, s * 0.03, m.trim);
    rock(-s * 0.45, -s * 0.55 - bob + slam * 0.6, s * 0.14, s * 0.2, shade(m.body, -0.2)); rock(s * 0.48, -s * 0.5 - bob + slam, s * 0.15, s * 0.2, shade(m.body, 0.05));
    if (m.leaves) for (const [x, y, r] of [[-0.3, -0.95, 0.16], [0.25, -0.98, 0.14], [0, -1.28, 0.18], [-0.45, -0.7, 0.1], [0.5, -0.66, 0.1]]) ball(c, s * x, s * y - bob, s * r, m.leaves, OUT);
  }
  function serpent(c, m, S, p) {
    const s = S * 0.9, strike = p.atk != null ? Math.sin(p.atk * Math.PI) : 0, sway = Math.sin(p.t * 3 + (p.walk || 0) * 8) * s * 0.06;
    c.strokeStyle = shade(m.body, -0.2); c.lineWidth = s * 0.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-s * 0.4, -s * 0.05); c.quadraticCurveTo(s * 0.3, -s * 0.05, s * 0.1, -s * 0.2); c.stroke();
    c.strokeStyle = m.body; c.lineWidth = s * 0.17; c.beginPath(); c.moveTo(s * 0.1, -s * 0.15); c.quadraticCurveTo(-s * 0.25 + sway, -s * 0.45, s * 0.05 + sway, -s * 0.75); c.quadraticCurveTo(s * 0.2 + strike * s * 0.3, -s * 0.9, s * 0.25 + strike * s * 0.35, -s * 0.85); c.stroke();
    const hx = s * 0.3 + strike * s * 0.35, hy = -s * 0.86;
    c.fillStyle = m.body; c.beginPath(); c.ellipse(hx, hy, s * 0.17, s * 0.11, 0.2, 0, TAU); c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
    ball(c, hx + s * 0.04, hy - s * 0.04, s * 0.03, '#ffcf5a'); limb(c, hx + s * 0.12, hy + s * 0.06, hx + s * 0.12, hy + s * 0.13, 1.5, '#fff');
    limb(c, -s * 0.2, -s * 0.5, -s * 0.05, -s * 0.52, 2, m.trim);
  }
  function wraith(c, m, S, p) {
    const s = S * 1.05, fl = Math.sin(p.t * 2) * s * 0.06, top = -s * 1.5 + fl, casting = p.cast != null ? Math.sin(p.cast * Math.PI) : 0;
    c.globalAlpha *= 0.35; ball(c, 0, -s * 0.8 + fl, s * (0.75 + casting * 0.3), m.trim); c.globalAlpha /= 0.35;
    const hem = []; for (let i = 0; i <= 6; i++) hem.push([s * 0.45 - i * s * 0.15, -s * 0.12 + fl + (i % 2 ? -s * 0.1 : 0) + Math.sin(p.t * 4 + i) * s * 0.03]);
    const g = c.createLinearGradient(-s * 0.4, 0, s * 0.4, 0); g.addColorStop(0, shade(m.body, 0.25)); g.addColorStop(1, shade(m.body, -0.4));
    poly(c, [[-s * 0.25, top + s * 0.35], [s * 0.28, top + s * 0.35]].concat(hem), g, OUT);
    ball(c, 0, top + s * 0.2, s * 0.22, '#15101f', OUT);
    ball(c, s * 0.06, top + s * 0.2, s * 0.045, m.trim); ball(c, s * 0.16, top + s * 0.2, s * 0.04, m.trim);
    poly(c, [[-s * 0.2, top + s * 0.02], [-s * 0.22, top - s * 0.18], [-s * 0.1, top - s * 0.06], [0, top - s * 0.22], [s * 0.1, top - s * 0.06], [s * 0.22, top - s * 0.18], [s * 0.2, top + s * 0.02]], m.crown, OUT);
    const a = p.atk != null ? Math.min(1, p.atk * 1.4) : casting;
    const hx = s * 0.35 + a * s * 0.15, hy = top + s * 0.55 - a * s * 0.35;
    limb(c, s * 0.15, top + s * 0.45, hx, hy, s * 0.09, shade(m.body, -0.1));
    c.globalAlpha *= 0.5; ball(c, hx + s * 0.05, hy - s * 0.05, s * (0.12 + 0.04 * Math.sin(p.t * 5)), m.trim); c.globalAlpha /= 0.5; ball(c, hx + s * 0.05, hy - s * 0.05, s * 0.06, '#f0d0ff');
  }
  function turret(c, m, S, p) {
    const s = S * 0.9, rec = p.atk != null && p.atk > 0.85 ? s * 0.08 : 0;
    for (const x of [-0.3, 0, 0.3]) limb(c, 0, -s * 0.35, x * s * 1.1, 0, s * 0.06, '#5a4a2a');
    poly(c, [[-s * 0.25, -s * 0.35], [s * 0.25, -s * 0.35], [s * 0.2, -s * 0.7], [-s * 0.2, -s * 0.7]], m.body, OUT);
    limb(c, s * 0.1 - rec, -s * 0.58, s * 0.5 - rec, -s * 0.62, s * 0.1, '#6e6e6e');
    ball(c, -s * 0.05, -s * 0.52, s * 0.06, Math.sin(p.t * 4) > 0 ? '#ff5d5d' : '#7a2a2a');
  }
  const RIGS = { humanoid, beast, bomb, golem, serpent, wraith, turret };

  // ------------------------------------------------------------------ public
  function get(key) { return M[key] || M.grunt; }
  // pose: { t (sec), face (1|-1), walk (cycle phase) | null, atk (0..1) | null, cast (0..1) | null, dead (0..1), flash, frozen }
  function draw(c, key, x, y, S, pose, tint) {
    const m = get(key);
    c.save(); c.translate(x, y);
    // ground shadow (not flipped, not rotated)
    { const rx = S * 0.44 * (m.bulk || 1) ** 0.5, g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.save(); c.scale(1, 0.34); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore(); }
    if (pose.dead) { c.globalAlpha *= 1 - pose.dead; c.rotate(pose.dead * 1.35 * (pose.face || 1)); }
    c.scale(pose.face || 1, 1);
    if (pose.cast != null) {
      const k = Math.sin(pose.cast * Math.PI), R = S * (0.6 + 0.4 * pose.cast), g = c.createRadialGradient(0, -S * 0.75, 0, 0, -S * 0.75, R);
      g.addColorStop(0, tint || '#fff'); g.addColorStop(1, 'rgba(0,0,0,0)');
      const a0 = c.globalAlpha; c.globalAlpha = a0 * 0.55 * k; c.fillStyle = g; c.beginPath(); c.arc(0, -S * 0.75, R, 0, TAU); c.fill(); c.globalAlpha = a0;
    }
    RIGS[m.type](c, m, S, pose);
    c.restore();
  }
  const cache = {};
  function portrait(key, px, bust) {
    const id = key + ':' + px + ':' + (bust ? 1 : 0);
    if (cache[id]) return cache[id];
    if (typeof document === 'undefined') return '';
    const cv = document.createElement('canvas'), dpr = 3; cv.width = cv.height = px * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const m = get(key), big = m.type === 'wraith' || (m.bulk || 1) > 1.4;
    const S = bust ? px * (big ? 0.55 : 0.68) : px * (big ? 0.48 : 0.58);
    draw(c, key, px * 0.5, bust ? px * 1.05 + S * 0.15 : px * 0.93, S, { t: 0.4, face: 1 });
    return (cache[id] = cv.toDataURL());
  }
  B.Models = { get, draw, portrait, list: M, shade, limb, ball, poly };
})(typeof window !== 'undefined' ? window : globalThis);
