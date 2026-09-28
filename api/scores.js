// Leaderboard of Onslaught scores. GET: top 25. POST {name, score, wave, heroes}. The client is trusted (demo).
const { send, body, sameOrigin, ipHash, clean } = require('./_http');
const getStore = require('./_store');
const HEROES = ['bastion', 'vex', 'pyra', 'glacia', 'brakk', 'lumen', 'kestrel', 'morrow', 'tempest', 'grimhook', 'mirage', 'rook'];

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method === 'GET') return send(res, 200, { top: await st.topScores(25) });
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req);
    const name = clean(b.name, 16).replace(/\s+/g, ' ');
    const score = Math.round(Number(b.score)), wave = Math.round(Number(b.wave));
    const heroes = Array.isArray(b.heroes) ? b.heroes.filter(h => HEROES.includes(h)).slice(0, 6) : [];
    if (!name) return send(res, 400, { error: 'Pick a name.' });
    if (!(score >= 0 && score <= 5000) || !(wave >= 0 && wave <= 500)) return send(res, 400, { error: 'Invalid score.' });
    const iph = ipHash(req), now = Date.now();
    if (await st.countScores(iph, now - 3600e3) >= 12) return send(res, 429, { error: 'Too many scores this hour.' });
    await st.addScore({ name, score, wave, heroes: heroes.join(','), iph, created: now });
    return send(res, 200, { ok: true, top: await st.topScores(25) });
  } catch (e) {
    console.error('scores', e);
    return send(res, 500, { error: 'Server error' });
  }
};
