// Suggestion box. A player writes one or more changes (up to 10), then presses "Send for review": that POST is one
// batch, and the watcher on the owner's PC (tools/vigia.js) wakes Claude right away to review it.
// GET: public queue + reviewer status. POST {items: [text...], name}. ({text} alone also works = batch of 1.)
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
const MAX_ITEMS = 10;

async function status(st) {
  const [seen, lastRun, paused] = await Promise.all([st.getKV('seen'), st.getKV('lastRun'), st.getKV('paused')]);
  return { seen: Number(seen) || 0, lastRun: Number(lastRun) || 0, paused: paused === '1', now: Date.now() };
}

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') {
      const [list, review] = await Promise.all([st.listSuggestions(120), status(st)]);
      return send(res, 200, { list, review });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req);
    const raw = Array.isArray(b.items) ? b.items : [b.text];
    const items = raw.slice(0, MAX_ITEMS + 1).map(t => clean(t, 1500)).filter(t => t.length > 0);
    const name = clean(b.name, 24).replace(/\s+/g, ' ');
    if (!items.length || items.some(t => t.length < 5)) return send(res, 400, { error: 'Each change needs at least a few words.' });
    if (items.length > MAX_ITEMS) return send(res, 400, { error: `Up to ${MAX_ITEMS} changes per review.` });
    const iph = ipHash(req), now = Date.now();
    if (await st.countBatches(iph, now - 10 * 60e3) >= 3) return send(res, 429, { error: 'You just sent a few reviews. Try again in a few minutes.' });
    if (await st.countBatches(iph, now - 24 * 3600e3) >= 12 || await st.countItems(iph, now - 24 * 3600e3) + items.length > 40) return send(res, 429, { error: 'Daily limit reached. Thanks for all the ideas!' });
    if (await st.countNew() + items.length > 300) return send(res, 429, { error: 'The queue is full right now. Try again later.' });
    const r = await st.addBatch({ name, items, iph, created: now });
    return send(res, 200, { ok: true, batch: r.batch, ids: r.ids });
  } catch (e) {
    console.error('suggest', e);
    return send(res, 500, { error: 'Server error' });
  }
};
