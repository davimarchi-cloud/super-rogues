// Suggestion box. GET: public list + auto-review status. POST {text, name}: anyone can suggest (rate limited).
// Claude reads the queue with tools/sugestoes.js and answers each one (status + reply) — see CLAUDE.md.
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
const { reviewStatus } = require('./review');

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') {
      const [list, review] = await Promise.all([st.listSuggestions(80), reviewStatus(st)]);
      return send(res, 200, { list, review });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req);
    const text = clean(b.text, 1500), name = clean(b.name, 24).replace(/\s+/g, ' ');
    if (text.length < 5) return send(res, 400, { error: 'Write at least a few words.' });
    const iph = ipHash(req), now = Date.now();
    if (await st.countSuggestions(iph, now - 10 * 60e3) >= 4) return send(res, 429, { error: 'Too many suggestions. Try again in a few minutes.' });
    if (await st.countSuggestions(iph, now - 24 * 3600e3) >= 25) return send(res, 429, { error: 'Daily limit reached. Thanks for all the ideas!' });
    if (await st.countNew() >= 300) return send(res, 429, { error: 'The queue is full right now. Try again later.' });
    const id = await st.addSuggestion({ name, text, iph, created: now });
    return send(res, 200, { ok: true, id });
  } catch (e) {
    console.error('suggest', e);
    return send(res, 500, { error: 'Server error' });
  }
};
