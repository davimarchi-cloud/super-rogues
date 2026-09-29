// Art Lab (owner, 2026-09-29: "a part at the bottom where David attaches the pictures and tests how the heroes look").
// Everything runs in this browser: pick a hero, add a splash picture and a pose sheet, see them on the cards and in a
// live test fight, keep them on this device, or send them for review (only Claude sees the pictures, never the queue).
(function (G) {
  const B = G.B = G.B || {};
  const S = { key: null, def: null, sheet: null, tol: 60, found: 0, bg: '', fight: null, view: null, raf: 0, open: false };
  let U = null; // helpers from ui.js: $, esc, toast, openModal, Net, store, trackBatch

  const heroes = () => Object.keys(B.HEROES).sort((a, b) => B.HEROES[a].name.localeCompare(B.HEROES[b].name));
  const pct = v => Math.round(v * 100);
  function html() {
    const H = B.HEROES, k = S.key, e = U.esc;
    return `<div class="artlab">
      <div class="shead"><b>🎨 Art Lab</b><button data-act="close">✕</button></div>
      <p class="small">Try your own pictures on a hero: a <b>splash</b> for the cards and a <b>pose sheet</b> for the battle. Only this device sees them until you send them for review.</p>
      <label class="alhero"><span>Hero</span><select id="alHero">${heroes().map(x => `<option value="${x}" ${x === k ? 'selected' : ''}>${e(H[x].name)} · ${H[x].role}</option>`).join('')}</select></label>
      <div class="algrid">
        <section class="alsec"><h3>1 · Splash picture</h3>
          <p class="small dim">One big picture of the hero. Move the sliders to frame the face on the small cards.</p>
          <label class="alfile">🖼 Choose picture<input type="file" accept="image/png,image/jpeg,image/webp" id="alSplash"></label>
          <div id="alSplashView"></div></section>
        <section class="alsec"><h3>2 · Pose sheet</h3>
          <p class="small dim">Idle, walk, attack and ability side by side, full body, on one flat colour (magenta works best). No floor, shadow, bars or effects: the game adds those.</p>
          <label class="alfile">🧍 Choose picture<input type="file" accept="image/png,image/jpeg,image/webp" id="alSheet"></label>
          <div id="alSheetView"></div></section>
      </div>
      <section class="alsec"><h3>3 · Test fight</h3>
        <div class="alboard"><canvas id="alBoard"></canvas></div>
        <div class="row"><span class="small dim grow">Your hero fights on the blue side, next to a random ally.</span><button class="chip" data-act="al-restart">↻ New fight</button></div></section>
      <section class="alsec"><h3>Keep it</h3>
        <div class="row wrap"><button class="primary" data-act="al-keep">✓ Use in my game</button><button data-act="al-drop">Remove from my game</button></div>
        <p class="small dim">"Use in my game" changes this hero on this device only, everywhere in the game.</p>
        <textarea id="alNote" maxlength="600" rows="2" placeholder="A note for Claude (optional)"></textarea>
        <div class="row"><input id="alName" maxlength="24" placeholder="Your name" value="${e(U.store.get('balance.name', ''))}"><button class="primary" data-act="al-send">Send for review</button></div>
        <p class="dim small">Only Claude sees the pictures you send; the public queue shows just your note. Send art you made or generated yourself, with no characters from other games, films or shows.</p></section>
    </div>`;
  }
  // only the pictures (while a slider is being dragged the sliders themselves stay in place)
  function splashCards() {
    const k = S.key, sz = [[44, 44, 'bust'], [96, 96, 'bust'], [120, 156, 'full']];
    U.$$('#alSplashView .alcards img').forEach((im, i) => { im.src = B.Splash.image(k, sz[i][0], sz[i][1], sz[i][2]); });
  }
  function splashView() {
    const el = U.$('#alSplashView'); if (!el) return;
    if (el.querySelector('.alcards') && S.def && S.def.splash && B.Art.get(S.key) && B.Art.get(S.key).splash) { splashCards(); return; }
    const d = S.def || {}, k = S.key, cr = Object.assign({ x: 0.5, y: 0.3, z: 1 }, d.crop);
    if (!d.splash) { el.innerHTML = `<div class="alnow"><img src="${B.Splash.image(k, 72, 72, 'bust')}" alt=""><span class="small dim">Now: the drawn splash.</span></div>`; return; }
    const ready = B.Art.get(k) && B.Art.get(k).splash;
    el.innerHTML = ready ? `<div class="alcards">
        <figure><img src="${B.Splash.image(k, 44, 44, 'bust')}" alt=""><figcaption>list</figcaption></figure>
        <figure><img src="${B.Splash.image(k, 96, 96, 'bust')}" alt=""><figcaption>card</figcaption></figure>
        <figure><img src="${B.Splash.image(k, 120, 156, 'full')}" alt=""><figcaption>banner</figcaption></figure></div>
      <div class="alsliders">
        <label>Left ↔ right<input type="range" id="alCx" min="0" max="100" value="${pct(cr.x)}"></label>
        <label>Up ↕ down<input type="range" id="alCy" min="0" max="100" value="${pct(cr.y)}"></label>
        <label>Zoom<input type="range" id="alCz" min="50" max="300" value="${pct(cr.z)}"></label></div>` : '<p class="small dim">Loading…</p>';
  }
  function sheetView() {
    const el = U.$('#alSheetView'); if (!el) return;
    const d = S.def || {}, P = d.poses || {};
    if (!P.idle) { el.innerHTML = '<p class="small dim">Now: the drawn figure.</p>'; return; }
    const names = { idle: 'idle', move: 'walk', attack: 'attack', cast: 'ability' };
    el.innerHTML = `<div class="alposes">${B.Art.POSES.map(p => `<figure class="${P[p] ? '' : 'miss'}">${P[p] ? `<img src="${P[p]}" alt="">` : '<span>—</span>'}<figcaption>${names[p]}</figcaption></figure>`).join('')}</div>
      ${S.sheet ? `<p class="small ${S.found >= 1 && S.found <= 4 ? 'dim' : 'warn'}">Found ${S.found} figure${S.found === 1 ? '' : 's'}${S.found > 4 ? ' (the first 4 are used; leave more space between the poses)' : S.found < 4 ? ' (missing poses reuse idle or attack)' : ''}. Background <span class="alsw" style="background:${S.bg}"></span></p>` : ''}
      <div class="alsliders">
        ${S.sheet ? `<label>Background cut<input type="range" id="alTol" min="15" max="160" value="${S.tol}"></label>` : ''}
        <label>Size on the board<input type="range" id="alScale" min="50" max="180" value="${pct(d.scale || 1)}"></label>
        <label class="alchk"><input type="checkbox" id="alFlip" ${d.flip ? 'checked' : ''}> Mirror (use if the hero faces left in the picture)</label></div>`;
  }
  function refresh() { B.Art.preview(S.key, S.def); }
  function load(key) {
    if (S.key && S.key !== key) B.Art.reset(S.key);
    S.key = key; S.sheet = null; S.found = 0;
    const saved = B.Art.saved(key) || B.Art.official(key);
    S.def = saved ? JSON.parse(JSON.stringify(saved)) : null;
    if (S.def) refresh();
  }
  function readFile(input, done) {
    const f = input.files && input.files[0]; if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { U.toast('Pick a PNG, JPG or WEBP picture'); return; }
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => done(im); im.onerror = () => U.toast('That picture could not be opened'); im.src = r.result; };
    r.readAsDataURL(f); input.value = '';
  }
  function cut() {
    const res = B.Art.cutSheet(S.sheet, S.tol);
    S.found = res.found; S.bg = res.bg;
    if (!res.poses.length) { U.toast('No figure found: use one flat background colour'); return; }
    S.def = Object.assign(S.def || {}, B.Art.posesDef(res.poses)); refresh();
  }

  // the test fight: the hero with its art + a random ally against a medium fight, restarting when it ends
  function newFight() {
    const R = B.Run, others = Object.keys(B.HEROES).filter(k => k !== S.key);
    const seed = (Math.random() * 2 ** 31) | 0, run = R.newRun(seed);
    R.pickStart(run, [S.key]); R.addHero(run, others[seed % others.length]);
    for (const h of run.heroes) h.lvl = 2;
    run.cur = R.makeFight(run, 'medium', 2);
    S.fight = { W: R.fightWorld(run), acc: 0, last: performance.now(), endAt: 0 };
  }
  function mountBoard() {
    const cv = U.$('#alBoard'); if (!cv) return;
    S.view = B.Render.setup(cv, Math.min(cv.parentElement.clientWidth || 340, 620));
    if (!S.fight) newFight();
    if (!S.raf) S.raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    S.raf = 0; if (!S.open || !U.$('#alBoard')) return;
    const f = S.fight, TICK = 1000 / B.Sim.TPS, dt = Math.min(100, now - f.last); f.last = now;
    if (!f.W.over) { f.acc += dt; let n = 0; while (f.acc >= TICK && !f.W.over && n++ < 30) { B.Sim.step(f.W); f.acc -= TICK; } }
    else if (!f.endAt) f.endAt = now + 1500;
    else if (now >= f.endAt) newFight();
    B.Render.draw(S.view, S.fight.W, S.fight.W.t + (S.fight.W.over ? 0 : S.fight.acc / TICK), {});
    S.raf = requestAnimationFrame(loop);
  }

  function open(ui, key) {
    U = ui; S.open = true; S.fight = null;
    load(key && B.HEROES[key] ? key : S.key && B.HEROES[S.key] ? S.key : heroes()[0]);
    U.openModal(html()); U.ui.modal = 'artlab'; U.$('#modal .sheet').classList.add('wide');
    splashView(); sheetView(); mountBoard();
  }
  function closed() {
    S.open = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; S.fight = null;
    if (S.key) B.Art.reset(S.key);
  }
  // pictures finished decoding: redraw the previews (the board picks the new poses up by itself)
  B.Art.onChange(key => { if (S.open && key === S.key) { splashView(); if (!U.$('#alSheetView input:active')) sheetView(); } });

  function onInput(e) {
    if (!S.open) return;
    const t = e.target, d = S.def = S.def || {};
    if (t.id === 'alCx' || t.id === 'alCy' || t.id === 'alCz') {
      d.crop = Object.assign({ x: 0.5, y: 0.3, z: 1 }, d.crop, { [t.id === 'alCx' ? 'x' : t.id === 'alCy' ? 'y' : 'z']: t.value / 100 });
      B.Art.touch(S.key); splashCards();
    } else if (t.id === 'alScale') d.scale = t.value / 100;
    else if (t.id === 'alName') U.store.set('balance.name', t.value.trim());
  }
  function onChange(e) {
    if (!S.open) return;
    const t = e.target;
    if (t.id === 'alHero') { load(t.value); S.fight = null; splashView(); sheetView(); mountBoard(); }
    else if (t.id === 'alSplash') readFile(t, im => { S.def = Object.assign(S.def || {}, { splash: B.Art.shrink(im, 1400, 'image/jpeg', 0.9) }); if (!S.def.crop) S.def.crop = { x: 0.5, y: 0.3, z: 1 }; refresh(); splashView(); });
    else if (t.id === 'alSheet') readFile(t, im => { S.sheet = im; cut(); sheetView(); });
    else if (t.id === 'alTol') { S.tol = +t.value; cut(); }
    else if (t.id === 'alFlip') (S.def = S.def || {}).flip = t.checked;
  }
  const actions = {
    'al-restart': () => { S.fight = null; mountBoard(); },
    'al-keep': () => {
      if (!S.def || (!S.def.splash && !(S.def.poses && S.def.poses.idle))) { U.toast('Add a splash picture or a pose sheet first'); return; }
      if (B.Art.keep(S.key, S.def)) { U.toast(`${B.HEROES[S.key].name} uses your art on this device`); }
      else U.toast('This device is out of space for pictures: remove the art of another hero first');
    },
    'al-drop': () => { B.Art.drop(S.key); load(S.key); splashView(); sheetView(); U.toast(`${B.HEROES[S.key].name} is back to the drawn art on this device`); },
    'al-send': async (_, btn) => {
      const d = S.def || {}, poses = d.poses || {};
      if (!d.splash && !poses.idle) { U.toast('Add a splash picture or a pose sheet first'); return; }
      const name = (U.$('#alName').value || '').trim(), note = (U.$('#alNote').value || '').trim().replace(/\s+/g, ' ');
      U.store.set('balance.name', name);
      const parts = [d.splash && 'a splash', poses.idle && `${Object.keys(poses).length} battle pose${Object.keys(poses).length > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
      const text = `🎨 Art Lab: new art for ${B.HEROES[S.key].name} (${parts}).${note ? ' ' + note : ''}`;
      btn.disabled = true;
      try {
        const r = await U.Net.post('suggest', { items: [text], name, art: { hero: S.key, splash: d.splash || null, poses, meta: { crop: d.crop, flip: !!d.flip, scale: d.scale || 1, ax: d.ax || {} } } });
        U.toast(`Sent! Review #${r.batch}: Claude gets your pictures for ${B.HEROES[S.key].name}.`); U.trackBatch(r.batch); U.$('#alNote').value = '';
      } catch (err) { U.toast(err.message); }
      btn.disabled = false;
    },
  };
  function init(ui) {
    U = ui;
    const m = U.$('#modal'); m.addEventListener('input', onInput); m.addEventListener('change', onChange);
  }
  B.ArtLab = { init, open, closed, actions, state: S };
})(typeof window !== 'undefined' ? window : globalThis);
