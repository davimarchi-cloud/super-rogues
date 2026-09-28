// Auto-review window: "for the next N minutes, check the suggestion queue every M minutes".
// GET: public status. POST {key, minutes, every}: owner only (ADMIN_KEY). minutes = 0 turns it off.
// The watcher on the owner's PC (tools/vigia.js) reads this and writes a heartbeat (kv 'seen').
const { send, body, sameOrigin, adminOk } = require('./_http');
const getStore = require('./_store');

async function reviewStatus(st) {
  const [cfg, seen, lastRun] = await Promise.all([st.getKV('review'), st.getKV('seen'), st.getKV('lastRun')]);
  const c = cfg ? JSON.parse(cfg) : { until: 0, every: 5 };
  return { until: Number(c.until) || 0, every: Number(c.every) || 5, seen: Number(seen) || 0, lastRun: Number(lastRun) || 0, now: Date.now() };
}

const handler = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') return send(res, 200, await reviewStatus(st));
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req);
    if (!adminOk(b.key)) { await new Promise(r => setTimeout(r, 600)); return send(res, 403, { error: 'Wrong owner key' }); }
    const minutes = Math.max(0, Math.min(7 * 24 * 60, Math.round(Number(b.minutes) || 0)));
    const every = Math.max(1, Math.min(120, Math.round(Number(b.every) || 5)));
    await st.setKV('review', JSON.stringify({ until: minutes ? Date.now() + minutes * 60e3 : 0, every, setAt: Date.now() }));
    return send(res, 200, await reviewStatus(st));
  } catch (e) {
    console.error('review', e);
    return send(res, 500, { error: 'Server error' });
  }
};
module.exports = handler;
module.exports.reviewStatus = reviewStatus;
