// v42 (review #51, David: "more dopamine hits ... captivate the audience"): the little rewards on screen. Confetti,
// coins that fly into the gold counter, numbers that count up, a bump when something changes, a floating "+6".
// Everything is drawn in a fixed layer above the page (#fx, never catches taps) and removed when it ends. With
// "reduce motion" switched on in the system, the effects are skipped and only the final numbers show.
(function (G) {
  const B = G.B = G.B || {};
  const doc = G.document;
  const reduced = () => { try { return G.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  let layer = null;
  function fx() {
    if (!layer || !layer.isConnected) { layer = doc.createElement('div'); layer.id = 'fx'; layer.setAttribute('aria-hidden', 'true'); doc.body.appendChild(layer); }
    return layer;
  }
  // a target can be an element or a selector: a selector is looked up again when the flight lands (the top bar may have
  // been redrawn meanwhile)
  const el$ = x => typeof x === 'string' ? doc.querySelector(x) : x;
  const center = el => { const r = (el.getBoundingClientRect ? el.getBoundingClientRect() : el); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
  const COLORS = ['#ffd23f', '#ff6b7e', '#4aa3ff', '#3ddc84', '#c29bff', '#ffffff', '#ff9a3d'];

  // confetti from a point (viewport pixels): pieces thrown up and out, falling with a spin
  function confetti(x, y, n = 60, o = {}) {
    if (reduced()) return;
    const L = fx(), H = G.innerHeight;
    for (let i = 0; i < n; i++) {
      const p = doc.createElement('i'); p.className = 'cf' + (Math.random() < 0.3 ? ' round' : '');
      const w = 6 + Math.random() * 6; p.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${w * (0.4 + Math.random() * 0.5)}px;background:${(o.colors || COLORS)[i % (o.colors || COLORS).length]}`;
      L.appendChild(p);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * (o.spread || 2.4), sp = (o.speed || 520) * (0.45 + Math.random() * 0.75);
      const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp, g = 900, T = 1.4 + Math.random() * 1.1, spin = (Math.random() - 0.5) * 1440, frames = [];
      for (let k = 0; k <= 8; k++) { const t = T * k / 8, drag = 1 - k / 8 * 0.35; frames.push({ transform: `translate(${vx * t * drag}px, ${Math.min(H, vy * t + g * t * t / 2)}px) rotate(${spin * k / 8}deg) rotateX(${k * 90}deg)`, opacity: k < 6 ? 1 : 1 - (k - 5) / 3 }); }
      p.animate(frames, { duration: T * 1000, easing: 'linear', delay: Math.random() * 120 }).onfinish = () => p.remove();
    }
  }
  const confettiAt = (el, n, o) => { el = el$(el); if (!el) return; const c = center(el); confetti(c.x, c.y, n, o); };

  // n coins fly from one element to another along an arc; onEach(i) fires as each one lands
  function flyCoins(from, to, n = 8, onEach, o = {}) {
    return new Promise(res => {
      const T = el$(to);
      if (!from || !T || reduced()) { for (let i = 0; i < n; i++) onEach && onEach(i); return res(); }
      const L = fx(), a = center(from), b = center(T);
      let left = n;
      for (let i = 0; i < n; i++) {
        const c = doc.createElement('i'); c.className = o.cls || 'fcoin'; if (o.html) c.innerHTML = o.html;
        c.style.left = a.x + 'px'; c.style.top = a.y + 'px'; L.appendChild(c);
        const sx = (Math.random() - 0.5) * (a.r.width * 0.6), sy = (Math.random() - 0.5) * (a.r.height * 0.6);
        const dx = b.x - a.x, dy = b.y - a.y, lift = -Math.min(160, 60 + Math.abs(dx) * 0.25) * (0.7 + Math.random() * 0.6), frames = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10, e = t * t * (3 - 2 * t); frames.push({ transform: `translate(${sx * (1 - e) + dx * e}px, ${sy * (1 - e) + dy * e + lift * 4 * t * (1 - t)}px) scale(${k === 0 ? 0.3 : k < 3 ? 1.25 : 1 - t * 0.35})`, opacity: k === 0 ? 0 : 1 }); }
        c.animate(frames, { duration: o.ms || 620, delay: i * (o.stagger || 55), easing: 'ease-in', fill: 'backwards' }).onfinish = () => {
          c.remove(); onEach && onEach(i); bump(el$(to) || T); if (--left === 0) res();
        };
      }
    });
  }

  // a number that counts from a to b (ease-out); fmt formats it; tick(i) fires on each visible change
  function countUp(el, a, b, ms = 700, fmt = v => String(v), tick) {
    return new Promise(res => {
      if (!el) return res();
      if (reduced() || a === b) { el.textContent = fmt(b); return res(); }
      const t0 = performance.now(); let shown = a, k = 0;
      (function step(now) {
        if (!el.isConnected) return res();
        const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3), v = Math.round(a + (b - a) * e);
        if (v !== shown) { shown = v; el.textContent = fmt(v); tick && tick(k++); }
        if (t < 1) requestAnimationFrame(step); else res();
      })(t0);
    });
  }
  // restart a CSS "bump" animation on an element
  function bump(el, cls = 'bump') { el = el$(el); if (!el || reduced()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  // "+6" rising from an element
  function floater(el, text, cls = '') {
    if (!el || reduced()) return;
    const c = center(el), f = doc.createElement('b'); f.className = 'floater ' + cls; f.textContent = text;
    f.style.left = c.x + 'px'; f.style.top = c.r.bottom + 'px'; fx().appendChild(f);
    f.animate([{ transform: 'translate(-50%, 0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%, 6px) scale(1.15)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%, 26px) scale(1)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).onfinish = () => f.remove();
  }
  // a copy of an element's picture flies to another element (a bought item into the Team button)
  function flyCopy(img, to, onLand) {
    const T = el$(to);
    if (!img || !T || reduced()) { onLand && onLand(); return; }
    const a = center(img), b = center(T), c = img.cloneNode(true); c.className = 'flycopy';
    c.style.cssText = `left:${a.r.left}px;top:${a.r.top}px;width:${a.r.width}px;height:${a.r.height}px`; fx().appendChild(c);
    const dx = b.x - a.x, dy = b.y - a.y;
    c.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 70}px) scale(1.25) rotate(-8deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${dx}px, ${dy}px) scale(.3) rotate(10deg)`, opacity: 0.6 }], { duration: 640, easing: 'ease-in' }).onfinish = () => { c.remove(); bump(el$(to) || T); onLand && onLand(); };
  }
  B.Juice = { confetti, confettiAt, flyCoins, countUp, bump, floater, flyCopy, reduced, wait: ms => new Promise(r => setTimeout(r, reduced() ? 0 : ms)) };
})(typeof window !== 'undefined' ? window : globalThis);
