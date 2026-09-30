// v42 (review #51, David: "it needs more dopamine hits"): game sounds, synthesized with Web Audio (no audio files, so
// the CSP stays as it is). One call per moment: B.Sfx.play('coin'). Sounds are on by default and the choice is kept in
// this browser (balance.sound); the audio starts on the first tap, as browsers require. Busy sounds (hits, heals, the
// count-up ticks) are throttled so a 4x fight never turns into noise.
(function (G) {
  const B = G.B = G.B || {};
  const KEY = 'balance.sound';
  let on = true;
  try { const v = G.localStorage && G.localStorage.getItem(KEY); if (v != null) on = JSON.parse(v) !== false; } catch (_) {}
  let ctx = null, out = null, noiseBuf = null, voices = 0;
  const last = {};
  const GAP = { hit: 0.045, crit: 0.06, heal: 0.09, tick: 0.04, cast: 0.08, ko: 0.05, tap: 0.03, dodge: 0.08 };

  function ac() {
    if (!on) return null;
    if (!ctx) {
      const A = G.AudioContext || G.webkitAudioContext; if (!A) return null;
      try {
        ctx = new A();
        const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; comp.connect(ctx.destination);
        out = ctx.createGain(); out.gain.value = 0.34; out.connect(comp);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (_) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume().catch(() => {}); } catch (_) {} }
    return ctx;
  }
  if (typeof document !== 'undefined') ['pointerdown', 'keydown'].forEach(e => document.addEventListener(e, () => { if (on) ac(); }, { passive: true, capture: true }));

  // one oscillator note: frequency (and an optional slide), a quick attack and an exponential fade
  function tone(f, dur, o = {}) {
    const c = ctx, t = c.currentTime + (o.at || 0), g = c.createGain(), osc = c.createOscillator();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const v = o.vol == null ? 0.3 : o.vol, a = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || out); osc.start(t); osc.stop(t + dur + 0.02);
    voices++; osc.onended = () => { voices--; };
  }
  // filtered noise: hits, whooshes, shuffles, sparkles
  function noise(dur, o = {}) {
    const c = ctx, t = c.currentTime + (o.at || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf; src.playbackRate.value = o.rate || 1;
    f.type = o.filter || 'lowpass'; f.frequency.setValueAtTime(o.f || 1200, t); f.Q.value = o.q || 0.8;
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    const v = o.vol == null ? 0.25 : o.vol;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    voices++; src.onended = () => { voices--; };
  }
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // MIDI note → Hz
  const arp = (notes, step, o) => notes.forEach((n, i) => tone(NOTE(n), o.dur || 0.22, Object.assign({}, o, { at: (o.at || 0) + i * step })));
  const sparkle = (at, n = 5, vol = 0.05) => { for (let i = 0; i < n; i++) tone(NOTE(96 + ((i * 5) % 12)), 0.09, { type: 'sine', vol, at: at + i * 0.045 }); };

  const S = {
    tap: () => { tone(740, 0.05, { vol: 0.16 }); tone(1110, 0.04, { vol: 0.07, at: 0.012 }); },
    pick: () => { tone(NOTE(72), 0.09, { type: 'triangle', vol: 0.22 }); tone(NOTE(79), 0.14, { type: 'triangle', vol: 0.2, at: 0.06 }); },
    back: () => { tone(NOTE(76), 0.07, { type: 'triangle', vol: 0.16 }); tone(NOTE(69), 0.1, { type: 'triangle', vol: 0.14, at: 0.05 }); },
    deny: () => { tone(196, 0.1, { type: 'square', vol: 0.07 }); tone(147, 0.14, { type: 'square', vol: 0.07, at: 0.08 }); },
    coin: () => { tone(NOTE(88), 0.06, { type: 'square', vol: 0.07 }); tone(NOTE(93), 0.16, { type: 'square', vol: 0.07, at: 0.055 }); },
    tick: i => tone(NOTE(84 + Math.min(12, (i | 0) % 13)), 0.035, { type: 'square', vol: 0.04 }),
    spend: () => { tone(NOTE(81), 0.05, { type: 'square', vol: 0.05 }); tone(NOTE(76), 0.09, { type: 'square', vol: 0.05, at: 0.045 }); },
    buy: () => { noise(0.07, { f: 500, vol: 0.2 }); S.coin(); tone(NOTE(84), 0.2, { type: 'triangle', vol: 0.12, at: 0.1 }); sparkle(0.12, 3, 0.04); },
    reroll: () => { for (let i = 0; i < 4; i++) noise(0.045, { filter: 'bandpass', f: 2200 + i * 500, q: 2, vol: 0.18, at: i * 0.055 }); tone(420, 0.22, { to: 900, type: 'triangle', vol: 0.08 }); },
    go: () => { noise(0.35, { f: 160, vol: 0.45 }); tone(110, 0.35, { to: 50, vol: 0.4 }); arp([60, 67], 0.07, { type: 'square', vol: 0.06, dur: 0.12 }); },
    hit: () => { noise(0.06, { f: 900 + Math.random() * 600, vol: 0.12 }); tone(150 + Math.random() * 40, 0.06, { to: 70, vol: 0.12 }); },
    crit: () => { noise(0.09, { filter: 'bandpass', f: 2600, q: 1.2, vol: 0.22 }); tone(900, 0.12, { to: 380, type: 'square', vol: 0.06 }); tone(120, 0.1, { to: 50, vol: 0.2 }); },
    heal: () => tone(NOTE(84), 0.16, { to: NOTE(91), type: 'sine', vol: 0.06 }),
    dodge: () => noise(0.08, { filter: 'highpass', f: 3000, vol: 0.08 }),
    cast: () => { noise(0.32, { filter: 'bandpass', f: 500, fTo: 3200, q: 1.5, vol: 0.16 }); tone(NOTE(76), 0.26, { to: NOTE(88), type: 'triangle', vol: 0.07 }); },
    ko: () => { tone(620, 0.2, { to: 140, type: 'square', vol: 0.07 }); noise(0.12, { f: 700, vol: 0.14 }); },
    streak: n => { arp([76, 79, 83, 88].slice(0, Math.min(4, n + 1)), 0.06, { type: 'square', vol: 0.06, dur: 0.14 }); sparkle(0.2, 4); },
    boss: () => { noise(0.7, { f: 120, vol: 0.5 }); tone(55, 0.8, { to: 35, vol: 0.45 }); tone(82, 0.6, { type: 'sawtooth', vol: 0.05, at: 0.05 }); },
    slam: () => { noise(0.18, { f: 300, vol: 0.3 }); tone(90, 0.2, { to: 45, vol: 0.3 }); },
    win: () => { arp([72, 76, 79, 84], 0.1, { type: 'triangle', vol: 0.2, dur: 0.24 }); tone(NOTE(84), 0.7, { type: 'triangle', vol: 0.16, at: 0.4 }); tone(NOTE(88), 0.7, { type: 'sine', vol: 0.09, at: 0.4 }); sparkle(0.45, 6); },
    lose: () => { arp([67, 63, 60], 0.18, { type: 'sawtooth', vol: 0.06, dur: 0.32 }); tone(NOTE(48), 0.9, { type: 'triangle', vol: 0.14, at: 0.5 }); },
    star: i => { const n = [79, 84, 88][Math.max(0, Math.min(2, i | 0))]; tone(NOTE(n), 0.35, { type: 'triangle', vol: 0.2 }); tone(NOTE(n + 12), 0.25, { type: 'sine', vol: 0.06, at: 0.03 }); sparkle(0.05, 3); },
    levelup: () => { arp([72, 76, 79, 84, 88], 0.07, { type: 'square', vol: 0.06, dur: 0.14 }); tone(NOTE(91), 0.6, { type: 'triangle', vol: 0.14, at: 0.34 }); sparkle(0.36, 6); },
    unlock: () => { arp([79, 83, 86, 91], 0.08, { type: 'triangle', vol: 0.16, dur: 0.3 }); sparkle(0.3, 6); },
  };

  function play(name, arg) {
    if (!on || !S[name] || !ac() || ctx.state !== 'running') return;
    const now = ctx.currentTime, gap = GAP[name] || 0.02;
    if (last[name] != null && now - last[name] < gap) return;
    if (voices > 40 && GAP[name]) return;   // busy moment: drop the small sounds, keep the big ones
    last[name] = now;
    try { S[name](arg); } catch (_) {}
  }
  function set(v) { on = !!v; try { G.localStorage.setItem(KEY, JSON.stringify(on)); } catch (_) {} if (on) { ac(); play('pick'); } else if (ctx) ctx.suspend().catch(() => {}); }
  B.Sfx = { play, set, toggle: () => set(!on), get on() { return on; }, names: Object.keys(S) };
})(typeof window !== 'undefined' ? window : globalThis);
