// Suggestion box. A player writes one or more changes (up to 10), then presses "Send for review": that POST is one
// batch, and the watcher on the owner's PC (tools/vigia.js) wakes Claude right away to review it.
// GET: public queue + reviewer status. GET ?batch=N: that batch's items + how many reviews are ahead of it (the page
// polls this while "waiting for my review"). GET ?lite=1: reviewer status only (lastRun = "an update just shipped").
// POST {items: [text...], name}. ({text} alone also works = batch of 1.)
// Art Lab (owner, 2026-09-29): a POST can carry `art` = {hero, splash, poses: {idle, move, attack, cast}, meta}: pictures
// as data: URLs, checked here, kept in the `art` table for Claude's review and never served back by the API.
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
require('../js/hex.js'); require('../js/data.js');
const B = globalThis.B;
const MAX_ITEMS = 10;
const PIC = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
// the pictures of an Art Lab send, or {error}
function artOf(a) {
  if (!a || typeof a !== 'object') return { error: 'Bad art.' };
  const hero = String(a.hero || '');
  if (!Object.prototype.hasOwnProperty.call(B.HEROES, hero)) return { error: 'Unknown hero.' };
  const splash = a.splash == null || a.splash === '' ? null : String(a.splash);
  if (splash && (splash.length > 1200000 || !PIC.test(splash))) return { error: 'The splash must be a PNG, JPG or WEBP picture under 900 KB.' };
  const poses = {};
  for (const k of ['idle', 'move', 'attack', 'cast']) {
    const p = a.poses && a.poses[k]; if (p == null || p === '') continue;
    const s = String(p); if (s.length > 400000 || !PIC.test(s)) return { error: 'Each battle pose must be a picture under 300 KB.' };
    poses[k] = s;
  }
  if (!splash && !poses.idle) return { error: 'Add a splash picture or a pose sheet first.' };
  const m = a.meta || {}, cr = m.crop || {}, ax = {};
  for (const k of Object.keys(poses)) ax[k] = num(m.ax && m.ax[k], 0, 1, 0.5);
  const meta = { crop: { x: num(cr.x, 0, 1, 0.5), y: num(cr.y, 0, 1, 0.3), z: num(cr.z, 0.3, 4, 1) }, flip: !!m.flip, scale: num(m.scale, 0.4, 2.5, 1), ax };
  return { hero, splash, poses: JSON.stringify(poses), meta: JSON.stringify(meta) };
}

async function status(st) {
  const [seen, lastRun, paused] = await Promise.all([st.getKV('seen'), st.getKV('lastRun'), st.getKV('paused')]);
  return { seen: Number(seen) || 0, lastRun: Number(lastRun) || 0, paused: paused === '1', now: Date.now() };
}

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') {
      const qs = new URL(req.url || '/', 'http://x').searchParams;
      if (qs.has('lite')) return send(res, 200, { review: await status(st) });
      const batch = Math.floor(Number(qs.get('batch')) || 0);
      if (batch > 0) {
        const [items, ahead, review] = await Promise.all([st.getBatch(batch), st.countAhead(batch), status(st)]);
        return send(res, 200, { batch, items, ahead, review });
      }
      const [list, review] = await Promise.all([st.listSuggestions(120), status(st)]);
      return send(res, 200, { list, review });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req, 2600000);
    const raw = Array.isArray(b.items) ? b.items : [b.text];
    const items = raw.slice(0, MAX_ITEMS + 1).map(t => clean(t, 1500)).filter(t => t.length > 0);
    const name = clean(b.name, 24).replace(/\s+/g, ' ');
    if (!items.length || items.some(t => t.length < 5)) return send(res, 400, { error: 'Each change needs at least a few words.' });
    if (items.length > MAX_ITEMS) return send(res, 400, { error: `Up to ${MAX_ITEMS} changes per review.` });
    const iph = ipHash(req), now = Date.now();
    if (await st.countBatches(iph, now - 10 * 60e3) >= 3) return send(res, 429, { error: 'You just sent a few reviews. Try again in a few minutes.' });
    if (await st.countBatches(iph, now - 24 * 3600e3) >= 12 || await st.countItems(iph, now - 24 * 3600e3) + items.length > 40) return send(res, 429, { error: 'Daily limit reached. Thanks for all the ideas!' });
    if (await st.countNew() + items.length > 300) return send(res, 429, { error: 'The queue is full right now. Try again later.' });
    let art = null;
    if (b.art != null) {
      art = artOf(b.art); if (art.error) return send(res, 400, { error: art.error });
      if (await st.countArt(iph, now - 24 * 3600e3) >= 6) return send(res, 429, { error: 'You sent a lot of art today. Try again tomorrow.' });
      if (await st.countArt(null, now - 24 * 3600e3) >= 60) return send(res, 429, { error: 'Lots of art arrived today. Try again tomorrow.' });
    }
    const r = await st.addBatch({ name, items, iph, created: now });
    if (art) await st.addArt(Object.assign(art, { batch: r.batch, iph, created: now }));
    return send(res, 200, { ok: true, batch: r.batch, ids: r.ids });
  } catch (e) {
    console.error('suggest', e);
    return send(res, 500, { error: 'Server error' });
  }
};
