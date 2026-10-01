// Hero art from pictures (owner, 2026-09-29: an Art Lab where David attaches pictures and tests how the heroes look).
// A hero can have a splash picture (cards, banners, portraits) and an animation sheet for the battle figure: one row
// per animation (idle, walk, attack, ability, death), several frames per row (review #43, David: "use the entire
// animation provided, filling in between if not smooth"). Frames play in order and blend into the next one; a single
// frame gets its motion from code (breathing, hop, lunge, cast pulse). Official art ships in art/<hero>/ and is listed
// in OFFICIAL; the Art Lab keeps a test version on this device only (localStorage) until it is sent for review.
// A hero without art keeps the drawn model (models.js) and the painted-in-code splash (splash.js).
(function (G) {
  const B = G.B = G.B || {};
  const POSES = ['idle', 'move', 'attack', 'cast'];            // the old one-row sheet: one frame per pose
  const ANIMS = ['idle', 'move', 'attack', 'cast', 'death'];   // an animation sheet: one row per animation
  const IDLE_FPS = 5, MAX_FRAMES = 16;
  // key: { splash: 'art/<key>/splash.jpg', crop: { x, y, z }, anims: { idle: ['art/<key>/idle-1.webp', ...], ... },
  //        axs: { idle: [0.5, ...] }, flip, scale }
  const seq = (key, k, n) => Array.from({ length: n }, (_, i) => `art/${key}/${k}-${i + 1}.webp`);
  const OFFICIAL = {
    // review #45 (David): Ulfrik (the "Red-Hand" art). His sheet had 5 rows: idle 5, walk 8, attack 7, a charge 6 and a
    // spin 7 frames; his ability (Crimson Spin) plays the charge and then the spin, so every frame is used
    thorne: { splash: 'art/thorne/splash.jpg', crop: { x: 0.52, y: 0.3, z: 1 }, flip: false, scale: 1,
      anims: { idle: seq('thorne', 'idle', 5), move: seq('thorne', 'move', 8), attack: seq('thorne', 'attack', 7), cast: seq('thorne', 'cast', 13) },
      axs: { idle: [0.552, 0.506, 0.534, 0.54, 0.499], move: [0.547, 0.565, 0.57, 0.584, 0.561, 0.552, 0.565, 0.52], attack: [0.457, 0.455, 0.487, 0.479, 0.493, 0.504, 0.469], cast: [0.568, 0.495, 0.543, 0.52, 0.519, 0.468, 0.488, 0.477, 0.494, 0.485, 0.551, 0.544, 0.48] } },
    // review #46 (David): Brutus. Idle 7, walk 8, attack 7 and ability (Ramming Charge) 6 frames; the lab had glued 3
    // attack frames (and 2 ability frames) together through the swoosh arcs, split here and fixed in cutSheet
    brakk: { splash: 'art/brakk/splash.jpg', crop: { x: 0.63, y: 0.34, z: 1.26 }, flip: false, scale: 1,
      anims: { idle: seq('brakk', 'idle', 7), move: seq('brakk', 'move', 8), attack: seq('brakk', 'attack', 7), cast: seq('brakk', 'cast', 6) },
      axs: { idle: [0.523, 0.507, 0.508, 0.51, 0.507, 0.514, 0.509], move: [0.561, 0.561, 0.555, 0.525, 0.525, 0.559, 0.508, 0.52], attack: [0.427, 0.436, 0.46, 0.457, 0.479, 0.46, 0.479], cast: [0.492, 0.471, 0.524, 0.5, 0.494, 0.458] } },
    // review #47 (David): Melissa, sent as "Astrid" (the lab opened on the first hero of the list). Her sheet had no space
    // between the frames; cut by the frame pitch here and in cutSheet. Idle 16, walk 15; the attack is her 5 quick
    // throws (drawn smaller, scaled up); the ability (Honey Hive) is the 7 hive-throw frames then the 12 swarm frames;
    // death 11 frames
    buzzwell: { splash: 'art/buzzwell/splash.jpg', crop: { x: 0.52, y: 0.3, z: 1 }, flip: false, scale: 1,
      anims: { idle: seq('buzzwell', 'idle', 16), move: seq('buzzwell', 'move', 15), attack: seq('buzzwell', 'attack', 5), cast: seq('buzzwell', 'cast', 19), death: seq('buzzwell', 'death', 11) },
      axs: { idle: [0.55, 0.662, 0.663, 0.67, 0.657, 0.64, 0.592, 0.61, 0.642, 0.64, 0.642, 0.641, 0.642, 0.632, 0.607, 0.602], move: [0.476, 0.529, 0.462, 0.526, 0.463, 0.533, 0.513, 0.447, 0.443, 0.507, 0.548, 0.572, 0.537, 0.525, 0.549], attack: [0.467, 0.46, 0.431, 0.528, 0.496], cast: [0.449, 0.442, 0.464, 0.501, 0.538, 0.5, 0.581, 0.472, 0.459, 0.586, 0.571, 0.591, 0.53, 0.589, 0.618, 0.614, 0.663, 0.64, 0.655], death: [0.496, 0.504, 0.541, 0.585, 0.582, 0.508, 0.52, 0.467, 0.491, 0.48, 0.515] } },
    // review #48 (David): Kagero. A sheet of cards (every frame on a pink tile, with a title and row labels): cut per
    // card by cutCards, 8 frames in each of idle, walk, attack, ability (the smoke bomb flies, then the flash) and death
    kage: { splash: 'art/kage/splash.jpg', crop: { x: 0.46, y: 0.15, z: 1.2 }, flip: false, scale: 1,
      anims: { idle: seq('kage', 'idle', 8), move: seq('kage', 'move', 8), attack: seq('kage', 'attack', 8), cast: seq('kage', 'cast', 8), death: seq('kage', 'death', 8) },
      axs: { idle: [0.569, 0.569, 0.578, 0.578, 0.578, 0.569, 0.569, 0.559], move: [0.528, 0.528, 0.528, 0.538, 0.528, 0.528, 0.528, 0.528], attack: [0.492, 0.492, 0.492, 0.5, 0.492, 0.492, 0.492, 0.492], cast: [0.492, 0.492, 0.492, 0.5, 0.492, 0.492, 0.492, 0.492], death: [0.492, 0.492, 0.492, 0.5, 0.492, 0.492, 0.492, 0.492] } },
    // review #59 (PC boy): splash art for 10 heroes (cards, banners and portraits only: their battle figures stay drawn).
    // The crop centres each face for the portrait
    rex: { splash: 'art/rex/splash.jpg', crop: { x: 0.3, y: 0.44, z: 1.1 }, flip: false, scale: 1 },   // Garm
    bramble: { splash: 'art/bramble/splash.jpg', crop: { x: 0.55, y: 0.31, z: 1.1 }, flip: false, scale: 1 },   // Leshy
    mirage: { splash: 'art/mirage/splash.jpg', crop: { x: 0.55, y: 0.29, z: 1.2 }, flip: false, scale: 1 },   // Sarab
    hippolyta: { splash: 'art/hippolyta/splash.jpg', crop: { x: 0.43, y: 0.37, z: 1.2 }, flip: false, scale: 1 },   // Hyppolita
    glacia: { splash: 'art/glacia/splash.jpg', crop: { x: 0.37, y: 0.29, z: 1.2 }, flip: false, scale: 1 },   // Snezhana
    seraph: { splash: 'art/seraph/splash.jpg', crop: { x: 0.52, y: 0.27, z: 1.2 }, flip: false, scale: 1 },   // Licht
    azgul: { splash: 'art/azgul/splash.jpg', crop: { x: 0.5, y: 0.26, z: 1.2 }, flip: false, scale: 1 },   // Azgoth
    pip: { splash: 'art/pip/splash.jpg', crop: { x: 0.34, y: 0.31, z: 1.2 }, flip: false, scale: 1 },   // Pimples
    lumen: { splash: 'art/lumen/splash.jpg', crop: { x: 0.5, y: 0.29, z: 1.2 }, flip: false, scale: 1 },   // Brigid
    bastion: { splash: 'art/bastion/splash.jpg', crop: { x: 0.38, y: 0.33, z: 1.2 }, flip: false, scale: 1 },   // Bjornar
    // review #68 (PC boy): splash art for 12 more heroes (cards, banners, portraits; battle figures stay drawn)
    sprocket: { splash: 'art/sprocket/splash.jpg', crop: { x: 0.37, y: 0.29, z: 1.15 }, flip: false, scale: 1 },   // Mercurio
    zephyr: { splash: 'art/zephyr/splash.jpg', crop: { x: 0.4, y: 0.19, z: 1.2 }, flip: false, scale: 1 },   // Feng
    pyra: { splash: 'art/pyra/splash.jpg', crop: { x: 0.42, y: 0.24, z: 1.2 }, flip: false, scale: 1 },   // Feuer
    blaze: { splash: 'art/blaze/splash.jpg', crop: { x: 0.37, y: 0.23, z: 1.2 }, flip: false, scale: 1 },   // Pólvora
    grok: { splash: 'art/grok/splash.jpg', crop: { x: 0.58, y: 0.4, z: 1.15 }, flip: false, scale: 1 },   // Kivi
    leonidas: { splash: 'art/leonidas/splash.jpg', crop: { x: 0.55, y: 0.26, z: 1.15 }, flip: false, scale: 1 },   // Leonteus
    morrow: { splash: 'art/morrow/splash.jpg', crop: { x: 0.43, y: 0.29, z: 1.2 }, flip: false, scale: 1 },   // Koschei
    vex: { splash: 'art/vex/splash.jpg', crop: { x: 0.58, y: 0.21, z: 1.2 }, flip: false, scale: 1 },   // Sica
    grimhook: { splash: 'art/grimhook/splash.jpg', crop: { x: 0.4, y: 0.32, z: 1.2 }, flip: false, scale: 1 },   // Krok
    nyx: { splash: 'art/nyx/splash.jpg', crop: { x: 0.45, y: 0.2, z: 1.2 }, flip: false, scale: 1 },   // Umbra
    harlequin: { splash: 'art/harlequin/splash.jpg', crop: { x: 0.45, y: 0.22, z: 1.2 }, flip: false, scale: 1 },   // Serra
    deadshot: { splash: 'art/deadshot/splash.jpg', crop: { x: 0.45, y: 0.22, z: 1.2 }, flip: false, scale: 1 },   // Sokol
  };
  const LOCAL = 'balance.artlab';
  const live = {}, subs = [], cache = {};
  let ver = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || '{}') || {}; } catch (_) { return {}; } };
  const lsSet = o => { try { localStorage.setItem(LOCAL, JSON.stringify(o)); return true; } catch (_) { return false; } };
  const changed = key => subs.forEach(f => { try { f(key); } catch (_) {} });

  // animations of a def (the old { poses, ax } format = one frame per pose)
  function animsOf(def) {
    const anims = {}, axs = {};
    if (def && def.anims) {
      for (const k of ANIMS) if (Array.isArray(def.anims[k]) && def.anims[k].length) { anims[k] = def.anims[k].slice(0, MAX_FRAMES * 2); axs[k] = ((def.axs && def.axs[k]) || []).slice(0, MAX_FRAMES * 2); }
    } else if (def && def.poses) {
      for (const k of POSES) if (def.poses[k]) { anims[k] = [def.poses[k]]; axs[k] = [def.ax && def.ax[k] != null ? def.ax[k] : 0.5]; }
    }
    return { anims, axs };
  }
  // decode every picture of a hero's art; it is used once all of them are ready
  function mount(key, def, from) {
    if (typeof Image === 'undefined' || !def) { delete live[key]; return; }
    const { anims, axs } = animsOf(def);
    const a = live[key] = { key, def, from, v: ++ver, splash: null, anims: {}, axs, ready: false };
    const srcs = [];
    if (def.splash) srcs.push(['splash', 0, def.splash]);
    for (const k in anims) { a.anims[k] = []; anims[k].forEach((src, i) => srcs.push([k, i, src])); }
    let left = srcs.length;
    if (!left) { a.ready = true; changed(key); return; }
    for (const [k, i, src] of srcs) {
      const im = new Image();
      const done = ok => {
        if (live[key] !== a) return;
        if (ok) { if (k === 'splash') a.splash = im; else a.anims[k][i] = im; }
        if (--left === 0) { for (const n in a.anims) { a.anims[n] = a.anims[n].filter(Boolean); if (!a.anims[n].length) delete a.anims[n]; } a.ready = true; changed(key); }
      };
      im.onload = () => done(true); im.onerror = () => done(false); im.src = src;
    }
  }
  // what a hero shows when nothing is being previewed: this device's test art, else the official art, else nothing
  function reset(key) { const L = lsGet(); if (L[key]) mount(key, L[key], 'local'); else if (OFFICIAL[key]) mount(key, OFFICIAL[key], 'official'); else { delete live[key]; changed(key); } }
  function boot() { const L = lsGet(); for (const k of new Set(Object.keys(OFFICIAL).concat(Object.keys(L)))) if (B.HEROES && B.HEROES[k]) reset(k); }

  const get = key => { const a = live[key]; return a && a.ready ? a : null; };
  function sprite(key) { const a = get(key); return a && a.anims.idle && a.anims.idle.length ? a : null; }

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

  // which animation and frame a pose shows. Looping animations (idle, walk) cycle; one-shot ones (attack, ability,
  // death) run first to last frame over the action. Each frame is held, then blends into the next during its last 40%.
  function frameOf(a, pose) {
    const A = a.anims;
    let k = 'idle', ph = 0, loop = true;
    if (pose.dead) { if (A.death) { k = 'death'; ph = pose.dead; loop = false; } else { ph = 0; loop = false; } }
    else if (pose.cast != null && (A.cast || A.attack)) { k = A.cast ? 'cast' : 'attack'; ph = pose.cast; loop = false; }
    else if (pose.atk != null && A.attack) { k = 'attack'; ph = pose.atk; loop = false; }
    else if (pose.walk != null && A.move) { k = 'move'; ph = pose.walk; }
    else ph = (((pose.t || 0) * IDLE_FPS / A.idle.length) % 1 + 1) % 1;
    const n = A[k].length, p = loop ? ph * n : clamp(ph, 0, 1) * (n - 1);
    const i = Math.floor(p) % n, j = loop ? (i + 1) % n : Math.min(n - 1, i + 1), f = p - Math.floor(p);
    return { k, i, j, blend: n > 1 && j !== i ? clamp((f - 0.6) / 0.4, 0, 1) : 0, n };
  }
  // two frames of different sizes, feet aligned, blended (1-t)·A + t·B on a shared scratch canvas
  let scratch = null;
  function mixed(A, axA, Bm, axB, t) {
    const L = Math.max(axA * A.naturalWidth, axB * Bm.naturalWidth), R = Math.max((1 - axA) * A.naturalWidth, (1 - axB) * Bm.naturalWidth);
    const W = Math.ceil(L + R), H = Math.max(A.naturalHeight, Bm.naturalHeight);
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(scratch.width, W); scratch.height = Math.max(scratch.height, H); }
    const c = scratch.getContext('2d'); c.clearRect(0, 0, scratch.width, scratch.height);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1 - t; c.drawImage(A, L - axA * A.naturalWidth, H - A.naturalHeight);
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = t; c.drawImage(Bm, L - axB * Bm.naturalWidth, H - Bm.naturalHeight);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    return { img: scratch, sw: W, sh: H, ax: L / W };
  }

  // the battle figure: feet on the hex; frames from the sheet, plus motion from code where the sheet has one frame
  function draw(c, a, x, y, S, pose, tint) {
    const d = a.def, fr = frameOf(a, pose), frames = a.anims[fr.k], axs = a.axs[fr.k] || [];
    const axOf = i => clamp(axs[i] != null ? axs[i] : 0.5, 0, 1);
    let src = frames[fr.i], sw = src.naturalWidth, sh = src.naturalHeight, ax = axOf(fr.i);
    if (fr.blend > 0.02) { const m = mixed(frames[fr.i], axOf(fr.i), frames[fr.j], axOf(fr.j), fr.blend); src = m.img; sw = m.sw; sh = m.sh; ax = m.ax; }
    const ref = a.anims.idle[0].naturalHeight || 1;
    const h = S * 1.45 * clamp(d.scale || 1, 0.4, 2.5) * sh / ref, w = h * sw / sh;
    const one = fr.n === 1;
    let dx = 0, dy = 0, sx = 1, sy = 1, rot = 0, glow = 0;
    if (pose.dead) { /* below */ }
    else if (pose.walk != null) { const s = Math.sin(pose.walk * Math.PI * 2); dy = -Math.abs(s) * S * (one ? 0.07 : 0.02); rot = one ? s * 0.05 : 0; }
    else if (pose.atk != null) { const k = Math.sin(pose.atk * Math.PI); dx = k * S * (one ? 0.2 : 0.1); if (one) { sx = 1 + k * 0.06; sy = 1 - k * 0.04; } }
    else if (pose.cast != null) { glow = Math.sin(pose.cast * Math.PI); dy = one ? -glow * S * 0.08 : 0; if (one) sx = sy = 1 + glow * 0.07; }
    else if (one) { const b = Math.sin((pose.t || 0) * 2.4); sy = 1 + b * 0.022; sx = 1 - b * 0.012; }
    c.save(); c.translate(x, y);
    { const rx = S * 0.44, g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.save(); c.scale(1, 0.34); c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore(); }
    const face = (pose.face || 1) * (d.flip ? -1 : 1);
    if (pose.dead) {
      if (fr.k === 'death') c.globalAlpha *= 1 - clamp((pose.dead - 0.75) / 0.25, 0, 1);
      else { c.globalAlpha *= 1 - pose.dead; c.rotate(pose.dead * 1.35 * (pose.face || 1)); }
    }
    if (glow > 0) {
      const R = S * 0.9, g = c.createRadialGradient(0, -S * 0.75, 0, 0, -S * 0.75, R); g.addColorStop(0, tint || '#fff'); g.addColorStop(1, 'rgba(0,0,0,0)');
      const a0 = c.globalAlpha; c.globalAlpha = a0 * 0.55 * glow; c.fillStyle = g; c.beginPath(); c.arc(0, -S * 0.75, R, 0, Math.PI * 2); c.fill(); c.globalAlpha = a0;
    }
    c.translate(dx * (pose.face || 1), dy); c.rotate(rot); c.scale(face * sx, sy);
    c.drawImage(src, 0, 0, sw, sh, -w * ax, -h, w, h);
    c.restore();
  }

  // Art Lab: cut a sheet (figures on one flat colour) into transparent frames. The background is the most common colour
  // on the border; pixels close to it turn transparent, with soft edges. Figures are found row by row (a row with
  // something in it, then the figures inside it, left to right). Text labels ("IDLE", "WALK") and specks are dropped;
  // a detached bit (a sword tip) joins the nearest figure.
  function cutSheet(im, tol = 60) {
    const k = Math.min(1, 2400 / im.naturalWidth, 2400 / im.naturalHeight);
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
    // review #46: the key colour bleeds into the outline (a pink halo on magenta). On pixels near the cut-out, take the
    // spill off the key's strong channels (magenta: red and blue down to green; green: green down to red/blue)
    const hi = [br, bgc, bb].map(v => v > 128), lo = hi.map(h => !h);
    if (hi.some(Boolean) && lo.some(Boolean)) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const j = y * W + x, i = j * 4; if (!px[i + 3]) continue;
      let edge = px[i + 3] < 250;
      for (let yy = Math.max(0, y - 2); !edge && yy <= Math.min(H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++) if (!px[(yy * W + xx) * 4 + 3]) { edge = true; break; }
      if (!edge) continue;
      let mh = 255, ml = 0; for (let ch = 0; ch < 3; ch++) { if (hi[ch]) mh = Math.min(mh, px[i + ch]); else ml = Math.max(ml, px[i + ch]); }
      const sp = mh - ml; if (sp > 0) for (let ch = 0; ch < 3; ch++) if (hi[ch]) px[i + ch] = Math.round(px[i + ch] - sp * 0.85);
    }
    c.putImageData(D, 0, 0);
    const cardRes = cutCards(px, A, W, H, tol, `rgb(${Math.round(br)},${Math.round(bgc)},${Math.round(bb)})`);
    if (cardRes) return cardRes;
    const gap = Math.max(3, Math.round(Math.min(W, H) * 0.01));
    const spans = (n, has) => { const out = []; let st = -1, last = -1; for (let i = 0; i < n; i++) if (has(i)) { if (st < 0) st = i; else if (i - last > gap) { out.push([st, last]); st = i; } last = i; } if (st >= 0) out.push([st, last]); return out; };
    let boxes = [];
    for (const [y0, y1] of spans(H, y => { for (let x = 0; x < W; x++) if (A[y * W + x]) return true; return false; })) {
      for (const [x0, x1] of spans(W, x => { for (let y = y0; y <= y1; y++) if (A[y * W + x]) return true; return false; })) {
        let t = H, b = -1, n = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (A[y * W + x]) { n++; if (y < t) t = y; b = y; }
        if (n) boxes.push({ x0, x1, y0: t, y1: b, n, band: y0 });
      }
    }
    const big = Math.max(0, ...boxes.map(b => b.n));
    boxes = boxes.filter(b => b.n >= big * 0.02);
    const mid = arr => arr.slice().sort((p, q) => p - q)[arr.length >> 1] || 0;
    const medN = mid(boxes.map(b => b.n)), medH = mid(boxes.map(b => b.y1 - b.y0 + 1));
    let dropped = 0;
    for (const sm of boxes.filter(b => b.n < medN * 0.25)) {
      const rest = boxes.filter(b => b !== sm); if (!rest.length) break;
      boxes = rest;
      if (sm.y1 - sm.y0 + 1 < medH * 0.45) { dropped++; continue; }   // short and small: a text label or a speck
      // (only within its own row: a whole frame standing apart from a packed row must not join another row)
      const cx = (sm.x0 + sm.x1) / 2, cy = (sm.y0 + sm.y1) / 2, same = rest.filter(q => q.band === sm.band);
      if (!same.length) { boxes.push(sm); continue; }
      const to = same.reduce((p, q) => Math.hypot((q.x0 + q.x1) / 2 - cx, (q.y0 + q.y1) / 2 - cy) < Math.hypot((p.x0 + p.x1) / 2 - cx, (p.y0 + p.y1) / 2 - cy) ? q : p);
      to.x0 = Math.min(to.x0, sm.x0); to.x1 = Math.max(to.x1, sm.x1); to.y0 = Math.min(to.y0, sm.y0); to.y1 = Math.max(to.y1, sm.y1); to.n += sm.n;
    }
    // reviews #46/#47: frames glued together (a swoosh reaching the next frame) or packed with no space between them
    // make boxes wider than one frame. Each row's frame pitch is the shortest strong repeat of the figures' outline
    // along the row (lower half, so effects above don't count); a box wider than 1.5 pitches is cut at the emptiest
    // column near every pitch step. Rows with nothing wide are left as they are.
    const split = [], pitches = [];
    for (const y of new Set(boxes.map(b => b.band))) {
      const row = boxes.filter(b => b.band === y).sort((p, q) => p.x0 - q.x0);
      const bh = Math.max(...row.map(b => b.y1 - b.y0 + 1)), y0 = Math.min(...row.map(b => b.y0)), y1 = Math.max(...row.map(b => b.y1));
      const X0 = row[0].x0, X1 = Math.max(...row.map(b => b.x1)), bw = X1 - X0 + 1, yb = y0 + Math.round((y1 - y0) * 0.45), col = new Float64Array(bw);
      for (let x = 0; x < bw; x++) { let n = 0; for (let yy = yb; yy <= y1; yy++) if (A[yy * W + X0 + x]) n++; col[x] = n; }
      const mean = col.reduce((p, q) => p + q, 0) / bw, lo = Math.max(8, Math.round(bh * 0.25)), hi = Math.min(bw >> 1, Math.round(bh * 1.4));
      // (the shortest repeat that is nearly as strong as the best one: twice the pitch repeats too)
      const acs = []; let bestAc = -Infinity, pitch = 0;
      for (let l = lo; l <= hi; l++) { let ac = 0; for (let x = 0; x + l < bw; x++) ac += (col[x] - mean) * (col[x + l] - mean); acs[l] = ac / (bw - l); if (acs[l] > bestAc) bestAc = acs[l]; }
      const bestL = acs.indexOf(bestAc);
      for (let l = lo + 1; l < hi && bestAc > 0; l++) {
        if (!(acs[l] >= acs[l - 1] && acs[l] >= acs[l + 1])) continue;
        const harmonic = [2, 3].some(m => Math.abs(bestL - m * l) <= l * 0.12);   // the best repeat is 2 or 3 of these
        if (acs[l] >= bestAc * 0.8 || (harmonic && acs[l] >= bestAc * 0.3)) { pitch = l; break; }
      }
      if (!pitch && row.length > 1) { const medW = mid(row.map(b => b.x1 - b.x0 + 1)), gapW = Math.max(0, mid(row.slice(1).map((b, i) => b.x0 - row[i].x1 - 1))); pitch = medW + gapW; }
      pitches.push(pitch);
      for (const b of row) {
        const w = b.x1 - b.x0 + 1;
        if (!pitch || w <= pitch * 1.5 || w < bh * 0.6) { split.push(b); continue; }
        const c = x => col[x - X0], cuts = [b.x0]; let x = b.x0;
        while (x + pitch * 1.3 < b.x1) { const a0 = Math.round(x + pitch * 0.7), a1 = Math.round(Math.min(b.x1, x + pitch * 1.3)); let bx = a0; for (let xx = a0; xx <= a1; xx++) if (c(xx) < c(bx)) bx = xx; cuts.push(bx); x = bx; }
        cuts.push(b.x1 + 1);
        const parts = [];
        for (let i = 0; i < cuts.length - 1; i++) {
          let t = H, bt = -1, n = 0, l = W, r = -1;
          for (let yy = b.y0; yy <= b.y1; yy++) for (let xx = cuts[i]; xx < cuts[i + 1]; xx++) if (A[yy * W + xx]) { n++; if (yy < t) t = yy; bt = yy; if (xx < l) l = xx; if (xx > r) r = xx; }
          if (n) parts.push({ x0: l, x1: r, y0: t, y1: bt, n, band: b.band });
        }
        const medN = mid(parts.map(q => q.n));
        split.push(...parts.filter(q => q.n >= medN * 0.25));   // a sliver of an effect is not a frame (a lying body is)
      }
    }
    boxes = split;
    const found = boxes.length;
    // rows = bands, top to bottom; frames left to right
    const bands = [...new Set(boxes.map(b => b.band))].sort((p, q) => p - q).slice(0, ANIMS.length);
    const rowsB = bands.map(y => boxes.filter(b => b.band === y).sort((p, q) => p.x0 - q.x0).slice(0, MAX_FRAMES));
    const maxH = Math.max(1, ...rowsB.flat().map(b => b.y1 - b.y0 + 1)), sc = Math.min(1, 320 / maxH);
    const cut = b => {
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, o = document.createElement('canvas');
      o.width = Math.max(1, Math.round(bw * sc)); o.height = Math.max(1, Math.round(bh * sc));
      const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(cv, b.x0, b.y0, bw, bh, 0, 0, o.width, o.height);
      // the anchor over the hex: the figure's centre of mass (steadier from frame to frame than the feet)
      let fx = 0, fn = 0; for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (A[y * W + x]) { fx += x; fn++; }
      let url = o.toDataURL('image/webp', 0.9); if (!url.startsWith('data:image/webp')) url = o.toDataURL('image/png');
      return { url, w: o.width, h: o.height, ax: fn ? clamp((fx / fn - b.x0) / bw, 0, 1) : 0.5 };
    };
    return { rows: rowsB.map(r => r.map(cut)), found, dropped, pitches, bg: `rgb(${Math.round(br)},${Math.round(bgc)},${Math.round(bb)})` };
  }
  // review #48 (David): sheets that draw every frame on a card (a tile of one colour on a sheet of another colour, with
  // a title and row labels around it). The card colour is the most common colour left once the sheet background is
  // gone; cards are the blocks of that colour, row by row. Each card is keyed on its own colour with its border trimmed,
  // and all the frames of a row keep the same size and place, so the figure moves inside the frame exactly as drawn
  // (a leap stays a leap, a thrown bomb flies). Returns null when the sheet has no cards.
  function cutCards(px, A, W, H, tol, bgName) {
    const mid = arr => arr.slice().sort((p, q) => p - q)[arr.length >> 1] || 0;
    const q4 = i => (px[i] >> 4) << 8 | (px[i + 1] >> 4) << 4 | px[i + 2] >> 4;
    const hist = new Map(); let nOp = 0;
    for (let j = 0; j < W * H; j++) if (A[j]) { nOp++; const q = q4(j * 4); hist.set(q, (hist.get(q) || 0) + 1); }
    // a flat colour with a little noise spreads over neighbouring buckets: count each bucket with its neighbours
    const near = q => { const r = q >> 8, gq = (q >> 4) & 15, b = q & 15; let n = 0; for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) { const rr = r + dr, g2 = gq + dg, b2 = b + db; if (rr >= 0 && rr < 16 && g2 >= 0 && g2 < 16 && b2 >= 0 && b2 < 16) n += hist.get(rr << 8 | g2 << 4 | b2) || 0; } return n; };
    let best = 0, bq = -1; for (const q of hist.keys()) { const n = near(q); if (n > best) { best = n; bq = q; } }
    if (!nOp || best < nOp * 0.3) return null;
    const inN = q => Math.abs((q >> 8) - (bq >> 8)) <= 1 && Math.abs(((q >> 4) & 15) - ((bq >> 4) & 15)) <= 1 && Math.abs((q & 15) - (bq & 15)) <= 1;
    let cr = 0, cg = 0, cb = 0, cn = 0; for (let j = 0; j < W * H; j++) if (A[j] && inN(q4(j * 4))) { cr += px[j * 4]; cg += px[j * 4 + 1]; cb += px[j * 4 + 2]; cn++; }
    cr /= cn; cg /= cn; cb /= cn;
    const t2 = Math.max(tol, 48), soft = Math.max(12, t2 * 0.6), K = new Uint8Array(W * H);
    for (let j = 0; j < W * H; j++) if (A[j] && Math.hypot(px[j * 4] - cr, px[j * 4 + 1] - cg, px[j * 4 + 2] - cb) < t2) K[j] = 1;
    const g = Math.max(2, Math.round(Math.min(W, H) * 0.004));
    const spans = (n, has) => { const out = []; let st = -1, last = -1; for (let i = 0; i < n; i++) if (has(i)) { if (st < 0) st = i; else if (i - last > g) { out.push([st, last]); st = i; } last = i; } if (st >= 0) out.push([st, last]); return out; };
    const rows = [];
    for (const [y0, y1] of spans(H, y => { let n = 0; for (let x = 0; x < W; x++) if (K[y * W + x] && ++n > 3) return true; return false; })) {
      if (y1 - y0 < 16) continue;
      const row = [];
      for (const [x0, x1] of spans(W, x => { let n = 0; for (let y = y0; y <= y1; y++) if (K[y * W + x] && ++n > 2) return true; return false; })) {
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1; if (cw < 16) continue;
        let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += K[y * W + x];
        // a card is a solid tile: its whole outline is drawn (a figure's bounding box is mostly empty around the edge)
        let per = 0, on = 0; for (let x = x0; x <= x1; x++) { per += 2; on += A[y0 * W + x] + A[y1 * W + x]; } for (let y = y0; y <= y1; y++) { per += 2; on += A[y * W + x0] + A[y * W + x1]; }
        if (n / (cw * ch) >= 0.3 && on >= per * 0.9) row.push({ x0, x1, y0, y1 });
      }
      // a card covered by a big effect (a white flash) shows little card colour: fill the gaps of the row's grid where
      // there is something drawn
      if (row.length > 2) {
        const cw = Math.round(mid(row.map(c => c.x1 - c.x0 + 1))), pitch = Math.round(mid(row.slice(1).map((c, i) => c.x0 - row[i].x0)));
        const drawn = x0 => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + cw && x < W; x++) n += A[y * W + x]; return n > cw * (y1 - y0 + 1) * 0.3; };
        for (let i = 0; i < row.length; i++) {
          const nx = row[i].x0 + pitch, next = row[i + 1];
          if (pitch > cw && (next ? next.x0 - row[i].x0 > pitch * 1.5 : nx + cw <= W) && drawn(nx)) row.splice(i + 1, 0, { x0: nx, x1: nx + cw - 1, y0, y1 });
        }
      }
      if (row.length) rows.push(row);
    }
    const nCards = rows.reduce((n, r) => n + r.length, 0);
    if (nCards < 4) return null;
    const hi = [cr, cg, cb].map(v => v > 128), lo = hi.map(h => !h);
    const keyed = rows.slice(0, ANIMS.length).map(row => row.slice(0, MAX_FRAMES).map(cd => {
      const m = Math.max(2, Math.round(Math.min(cd.x1 - cd.x0, cd.y1 - cd.y0) * 0.04));   // the card's border
      const x0 = cd.x0 + m, y0 = cd.y0 + m, w = Math.max(1, cd.x1 - cd.x0 + 1 - 2 * m), h = Math.max(1, cd.y1 - cd.y0 + 1 - 2 * m);
      const out = new Uint8ClampedArray(w * h * 4), mask = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * W + x0 + x) * 4, o = (y * w + x) * 4;
        const d = Math.hypot(px[i] - cr, px[i + 1] - cg, px[i + 2] - cb);
        const a = (d <= t2 ? 0 : d >= t2 + soft ? 1 : (d - t2) / soft) * px[i + 3] / 255;
        let r = px[i], gg = px[i + 1], b = px[i + 2];
        if (a > 0 && a < 1) { r = clamp((r - (1 - a) * cr) / a, 0, 255); gg = clamp((gg - (1 - a) * cg) / a, 0, 255); b = clamp((b - (1 - a) * cb) / a, 0, 255); }
        if (a > 0 && a < 1 && hi.some(Boolean) && lo.some(Boolean)) { let mh = 255, ml = 0; const v = [r, gg, b]; for (let ch = 0; ch < 3; ch++) { if (hi[ch]) mh = Math.min(mh, v[ch]); else ml = Math.max(ml, v[ch]); } const sp = mh - ml; if (sp > 0) for (let ch = 0; ch < 3; ch++) if (hi[ch]) v[ch] -= sp * 0.85; r = v[0]; gg = v[1]; b = v[2]; }
        out[o] = r; out[o + 1] = gg; out[o + 2] = b; out[o + 3] = Math.round(a * 255); mask[y * w + x] = a > 0.35 ? 1 : 0;
      }
      return { w, h, out, mask };
    }));
    // one crop per row: the union of the figure over all its frames, so every frame keeps its place in the card
    const unions = keyed.map(row => {
      let l = 1e9, t = 1e9, r = -1, b = -1;
      for (const f of row) for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.mask[y * f.w + x]) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
      return r < 0 ? null : { l, t, r, b };
    });
    const maxH = Math.max(1, ...unions.filter(Boolean).map(u => u.b - u.t + 1)), sc = Math.min(1, 320 / maxH);
    const outRows = keyed.map((row, ri) => {
      const u = unions[ri]; if (!u) return [];
      const uw = u.r - u.l + 1, uh = u.b - u.t + 1;
      return row.map(f => {
        const src = document.createElement('canvas'); src.width = f.w; src.height = f.h; src.getContext('2d').putImageData(new ImageData(f.out, f.w, f.h), 0, 0);
        const o = document.createElement('canvas'); o.width = Math.max(1, Math.round(uw * sc)); o.height = Math.max(1, Math.round(uh * sc));
        const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(src, u.l, u.t, uw, uh, 0, 0, o.width, o.height);
        // an effect that fills the whole card (a flash) would show the card's straight edges: fade it out toward them
        const id = oc.getImageData(0, 0, o.width, o.height), dd = id.data, ow = o.width, oh = o.height; let edge = 0, tot = 0;
        for (let x = 0; x < ow; x++) { tot += 2; edge += (dd[(x) * 4 + 3] > 128) + (dd[((oh - 1) * ow + x) * 4 + 3] > 128); }
        for (let y = 0; y < oh; y++) { tot += 2; edge += (dd[(y * ow) * 4 + 3] > 128) + (dd[(y * ow + ow - 1) * 4 + 3] > 128); }
        if (edge > tot * 0.35) {
          const fx = ow * 0.22, fy = oh * 0.22;
          for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const k = Math.min(1, Math.min(x, ow - 1 - x) / fx) * Math.min(1, Math.min(y, oh - 1 - y) / fy); dd[(y * ow + x) * 4 + 3] *= k * k * (3 - 2 * k); }
          oc.putImageData(id, 0, 0);
        }
        let url = o.toDataURL('image/webp', 0.9); if (!url.startsWith('data:image/webp')) url = o.toDataURL('image/png');
        return { url, w: o.width, h: o.height, ax: clamp((f.w / 2 - u.l) / uw, 0, 1) };
      });
    }).filter(r => r.length);
    return outRows.length ? { rows: outRows, found: nCards, dropped: 0, cards: true, pitches: [], bg: bgName, card: `rgb(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)})` } : null;
  }
  // what was cut -> the def's animations. Several rows: row 1 idle, 2 walk, 3 attack, 4 ability, 5 death, every frame
  // kept. A single row: the old pose sheet (idle, walk, attack, ability, one frame each).
  // `map` (review #45) says what each row is ('idle', 'move', 'attack', 'cast', 'death' or 'none'); rows given the same
  // animation are joined in order (a charge row + a spin row = one ability)
  function defaultMap(res) { return res.rows.map((_, i) => ANIMS[i] || 'none'); }
  function animsDef(res, map) {
    const o = { anims: {}, axs: {} }, r3 = v => Math.round(v * 1000) / 1000;
    if (res.rows.length === 1) res.rows[0].slice(0, 4).forEach((f, i) => { o.anims[POSES[i]] = [f.url]; o.axs[POSES[i]] = [r3(f.ax)]; });
    else res.rows.forEach((row, i) => {
      const k = (map || defaultMap(res))[i]; if (!ANIMS.includes(k)) return;
      o.anims[k] = (o.anims[k] || []).concat(row.map(f => f.url)).slice(0, MAX_FRAMES * 2); o.axs[k] = (o.axs[k] || []).concat(row.map(f => r3(f.ax))).slice(0, MAX_FRAMES * 2);
    });
    return o;
  }
  // a long ability animation plays for longer (2 ticks per frame) than the drawn model's 14-tick cast
  function castTicks(key) { const a = sprite(key), n = a && a.anims.cast ? a.anims.cast.length : 0; return n > 7 ? Math.min(32, n * 2) : 14; }
  // a death animation keeps the fallen figure on the board a little longer (the drawn model fades in 12 ticks)
  function deathTicks(key) { const a = sprite(key), n = a && a.anims.death ? a.anims.death.length : 0; return n > 1 ? Math.min(30, Math.max(12, n * 2)) : 12; }
  // a picture file -> a data URL no bigger than `max` px on its long side
  function shrink(im, max, type, q) {
    const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(im.naturalWidth * k)); cv.height = Math.max(1, Math.round(im.naturalHeight * k));
    const c = cv.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL(type || 'image/jpeg', q || 0.9);
  }

  B.Art = {
    POSES, ANIMS, MAX_FRAMES, OFFICIAL, boot, get, sprite, splash, draw, frameOf, cutSheet, animsDef, defaultMap, animsOf, castTicks, deathTicks, shrink, reset,
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
