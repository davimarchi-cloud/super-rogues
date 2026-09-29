// Hero art from pictures (owner, 2026-09-29: an Art Lab where David attaches pictures and tests how the heroes look).
// A hero can have a splash picture (cards, banners, portraits) and a pose sheet cut into idle / walk / attack / ability
// poses (the battle figure; the motion between poses is made here in code). Official art ships in art/<hero>/ and is
// listed in OFFICIAL; the Art Lab keeps a test version on this device only (localStorage) until it is sent for review.
// A hero without art keeps the drawn model (models.js) and the painted-in-code splash (splash.js).
(function (G) {
  const B = G.B = G.B || {};
  const POSES = ['idle', 'move', 'attack', 'cast'];
  // key: { splash: 'art/<key>/splash.jpg', crop: { x, y, z }, poses: { idle: 'art/<key>/idle.webp', ... }, ax: { idle: 0.5 }, flip, scale }
  const OFFICIAL = {};
  const LOCAL = 'balance.artlab';
  const live = {}, subs = [], cache = {};
  let ver = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}') || {}; } catch (_) { return {}; } };
  const lsSet = o => { try { localStorage.setItem(LOCAL, JSON.stringify(o)); return true; } catch (_) { return false; } };
  const changed = key => subs.forEach(f => { try { f(key); } catch (_) {} });

  // decode every picture of a hero's art; it is used once all of them are ready
  function mount(key, def, from) {
    if (typeof Image === 'undefined' || !def) { delete live[key]; return; }
    const a = live[key] = { key, def, from, v: ++ver, splash: null, poses: {}, ready: false };
    const srcs = [];
    if (def.splash) srcs.push(['splash', def.splash]);
    for (const p of POSES) if (def.poses && def.poses[p]) srcs.push([p, def.poses[p]]);
    let left = srcs.length;
    if (!left) { a.ready = true; changed(key); return; }
    for (const [k, src] of srcs) {
      const im = new Image();
      const done = ok => { if (live[key] !== a) return; if (ok) { if (k === 'splash') a.splash = im; else a.poses[k] = im; } if (--left === 0) { a.ready = true; changed(key); } };
      im.onload = () => done(true); im.onerror = () => done(false); im.src = src;
    }
  }
  // what a hero shows when nothing is being previewed: this device's test art, else the official art, else nothing
  function reset(key) { const L = lsGet(); if (L[key]) mount(key, L[key], 'local'); else if (OFFICIAL[key]) mount(key, OFFICIAL[key], 'official'); else { delete live[key]; changed(key); } }
  function boot() { const L = lsGet(); for (const k of new Set(Object.keys(OFFICIAL).concat(Object.keys(L)))) if (B.HEROES && B.HEROES[k]) reset(k); }

  const get = key => { const a = live[key]; return a && a.ready ? a : null; };
  function sprite(key) { const a = get(key); return a && a.poses.idle ? a : null; }

  // the splash picture cropped for a card: 'bust' = a square around the face (focus x/y, zoom z), 'full' = the whole figure
  function splash(key, w, h, mode) {
    const a = get(key); if (!a || !a.splash || typeof document === 'undefined') return null;
    const id = key + ':' + a.v + ':' + w + 'x' + h + ':' + mode;
    if (cache[id]) return cache[id];
    const im = a.splash, iw = im.naturalWidth, ih = im.naturalHeight, cr = Object.assign({ x: 0.5, y: 0.3, z: 1 }, a.def.crop);
    let sw, sh;
    if (mode === 'bust') { sw = Math.min(iw, ih) * 0.55 / clamp(cr.z, 0.3, 4); sh = sw * h / w; }
    else { const r = w / h; sh = Math.min(ih, iw / r); sw = sh * r; }
    sw = Math.min(sw, iw); sh = Math.min(sh, ih);
    const sx = clamp(cr.x * iw - sw / 2, 0, iw - sw), sy = clamp(cr.y * ih - sh * (mode === 'bust' ? 0.45 : 0.3), 0, ih - sh);
    const dpr = 3, cv = document.createElement('canvas'); cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high';
    c.drawImage(im, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return (cache[id] = cv.toDataURL('image/jpeg', 0.9));
  }

  // the battle figure: one picture per pose, feet on the hex, motion made here (breathing, hop, lunge, cast pulse)
  function draw(c, a, x, y, S, pose, tint) {
    const P = a.poses, d = a.def;
    const which = pose.dead ? 'idle' : pose.cast != null && (P.cast || P.attack) ? (P.cast ? 'cast' : 'attack') : pose.atk != null && P.attack ? 'attack' : pose.walk != null && P.move ? 'move' : 'idle';
    const im = P[which], ref = P.idle.naturalHeight || 1;
    const h = S * 1.45 * clamp(d.scale || 1, 0.4, 2.5) * im.naturalHeight / ref, w = h * im.naturalWidth / im.naturalHeight;
    const ax = clamp((d.ax && d.ax[which]) != null ? d.ax[which] : 0.5, 0, 1);
    let dx = 0, dy = 0, sx = 1, sy = 1, rot = 0, glow = 0;
    if (pose.walk != null) { const s = Math.sin(pose.walk * Math.PI * 2); dy = -Math.abs(s) * S * 0.07; rot = s * 0.05; }
    else if (pose.atk != null) { const k = Math.sin(pose.atk * Math.PI); dx = k * S * 0.2; sx = 1 + k * 0.06; sy = 1 - k * 0.04; }
    else if (pose.cast != null) { glow = Math.sin(pose.cast * Math.PI); dy = -glow * S * 0.08; sx = sy = 1 + glow * 0.07; }
    else { const b = Math.sin((pose.t || 0) * 2.4); sy = 1 + b * 0.022; sx = 1 - b * 0.012; }
    c.save(); c.translate(x, y);
    { const rx = S * 0.44, g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.save(); c.scale(1, 0.34); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore(); }
    const face = (pose.face || 1) * (d.flip ? -1 : 1);
    if (pose.dead) { c.globalAlpha *= 1 - pose.dead; c.rotate(pose.dead * 1.35 * (pose.face || 1)); }
    if (glow > 0) {
      const R = S * 0.9, g = c.createRadialGradient(0, -S * 0.75, 0, 0, -S * 0.75, R); g.addColorStop(0, tint || '#fff'); g.addColorStop(1, 'rgba(0,0,0,0)');
      const a0 = c.globalAlpha; c.globalAlpha = a0 * 0.55 * glow; c.fillStyle = g; c.beginPath(); c.arc(0, -S * 0.75, R, 0, Math.PI * 2); c.fill(); c.globalAlpha = a0;
    }
    c.translate(dx * (pose.face || 1), dy); c.rotate(rot); c.scale(face * sx, sy);
    c.drawImage(im, -w * ax, -h, w, h);
    c.restore();
  }

  // Art Lab: cut a pose sheet (figures side by side on one flat colour) into transparent poses, in reading order.
  // The background is the most common colour on the border; pixels close to it turn transparent, with soft edges.
  function cutSheet(im, tol = 60) {
    const k = Math.min(1, 2400 / im.naturalWidth, 1600 / im.naturalHeight);
    const W = Math.max(1, Math.round(im.naturalWidth * k)), H = Math.max(1, Math.round(im.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(im, 0, 0, W, H);
    const D = c.getImageData(0, 0, W, H), px = D.data;
    const hist = new Map(), sum = new Map();
    const add = i => { const q = (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | px[i + 2] >> 4; hist.set(q, (hist.get(q) || 0) + 1); const s = sum.get(q) || [0, 0, 0]; s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; sum.set(q, s); };
    for (let x = 0; x < W; x++) { add(x * 4); add(((H - 1) * W + x) * 4); }
    for (let y = 0; y < H; y++) { add(y * W * 4); add((y * W + W - 1) * 4); }
    let best = 0, bq = 0; for (const [q, n] of hist) if (n > best) { best = n; bq = q; }
    const s = sum.get(bq), br = s[0] / best, bgc = s[1] / best, bb = s[2] / best;
    const soft = Math.max(12, tol * 0.7), A = new Uint8Array(W * H);
    for (let i = 0, j = 0; j < W * H; i += 4, j++) {
      const d = Math.hypot(px[i] - br, px[i + 1] - bgc, px[i + 2] - bb);
      const a = (d <= tol ? 0 : d >= tol + soft ? 1 : (d - tol) / soft) * px[i + 3] / 255;
      if (a > 0 && a < 1) { px[i] = clamp((px[i] - (1 - a) * br) / a, 0, 255); px[i + 1] = clamp((px[i + 1] - (1 - a) * bgc) / a, 0, 255); px[i + 2] = clamp((px[i + 2] - (1 - a) * bb) / a, 0, 255); }
      px[i + 3] = Math.round(a * 255); A[j] = a > 0.35 ? 1 : 0;
    }
    c.putImageData(D, 0, 0);
    // figures: bands of rows with something in them, then columns inside each band
    const gap = Math.max(3, Math.round(Math.min(W, H) * 0.012));
    const spans = (n, has) => { const out = []; let st = -1, last = -1; for (let i = 0; i < n; i++) if (has(i)) { if (st < 0) st = i; else if (i - last > gap) { out.push([st, last]); st = i; } last = i; } if (st >= 0) out.push([st, last]); return out; };
    let boxes = [];
    for (const [y0, y1] of spans(H, y => { for (let x = 0; x < W; x++) if (A[y * W + x]) return true; return false; })) {
      for (const [x0, x1] of spans(W, x => { for (let y = y0; y <= y1; y++) if (A[y * W + x]) return true; return false; })) {
        let t = H, b = -1, n = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (A[y * W + x]) { n++; if (y < t) t = y; b = y; }
        if (n) boxes.push({ x0, x1, y0: t, y1: b, n });
      }
    }
    const big = Math.max(0, ...boxes.map(b => b.n));
    boxes = boxes.filter(b => b.n >= big * 0.02);
    // bits much smaller than the figures (a detached sword tip, a spark) join the nearest figure
    const med = boxes.map(b => b.n).sort((p, q) => p - q)[boxes.length >> 1] || 0;
    for (const sm of boxes.filter(b => b.n < med * 0.25)) {
      const rest = boxes.filter(b => b !== sm); if (!rest.length) break;
      const cx = (sm.x0 + sm.x1) / 2, cy = (sm.y0 + sm.y1) / 2;
      const to = rest.reduce((p, q) => Math.hypot((q.x0 + q.x1) / 2 - cx, (q.y0 + q.y1) / 2 - cy) < Math.hypot((p.x0 + p.x1) / 2 - cx, (p.y0 + p.y1) / 2 - cy) ? q : p);
      to.x0 = Math.min(to.x0, sm.x0); to.x1 = Math.max(to.x1, sm.x1); to.y0 = Math.min(to.y0, sm.y0); to.y1 = Math.max(to.y1, sm.y1); to.n += sm.n;
      boxes = rest;
    }
    const found = boxes.length;
    boxes = boxes.slice(0, 4);
    const maxH = Math.max(1, ...boxes.map(b => b.y1 - b.y0 + 1)), sc = Math.min(1, 320 / maxH);
    const poses = boxes.map(b => {
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, o = document.createElement('canvas');
      o.width = Math.max(1, Math.round(bw * sc)); o.height = Math.max(1, Math.round(bh * sc));
      const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(cv, b.x0, b.y0, bw, bh, 0, 0, o.width, o.height);
      // where the feet are: the middle of the lowest rows
      let fx = 0, fn = 0; for (let y = Math.max(b.y0, b.y1 - Math.round(bh * 0.12)); y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (A[y * W + x]) { fx += x; fn++; }
      let url = o.toDataURL('image/webp', 0.92); if (!url.startsWith('data:image/webp')) url = o.toDataURL('image/png');
      return { url, w: o.width, h: o.height, ax: fn ? clamp((fx / fn - b.x0) / bw, 0, 1) : 0.5 };
    });
    return { poses, found, bg: `rgb(${Math.round(br)},${Math.round(bgc)},${Math.round(bb)})` };
  }
  // poses found, in order -> the def's poses (fewer than 4: the missing ones reuse the idle / attack pose)
  function posesDef(list) {
    const o = { poses: {}, ax: {} };
    list.slice(0, 4).forEach((p, i) => { o.poses[POSES[i]] = p.url; o.ax[POSES[i]] = Math.round(p.ax * 1000) / 1000; });
    return o;
  }
  // a picture file -> a data URL no bigger than `max` px on its long side
  function shrink(im, max, type, q) {
    const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
    const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL(type || 'image/jpeg', q || 0.9);
  }

  B.Art = {
    POSES, boot, get, sprite, splash, draw, cutSheet, posesDef, shrink, reset,
    preview(key, def) { mount(key, def, 'preview'); },
    // the def was changed in place (crop, size, mirror): the cropped splash pictures are made again
    touch(key) { const a = live[key]; if (a) a.v = ++ver; },
    saved: key => lsGet()[key] || null,
    official: key => OFFICIAL[key] || null,
    keep(key, def) { const L = lsGet(); L[key] = def; if (!lsSet(L)) return false; mount(key, def, 'local'); return true; },
    drop(key) { const L = lsGet(); delete L[key]; lsSet(L); reset(key); },
    onChange(f) { subs.push(f); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
