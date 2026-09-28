// API handlers against the in-memory store (no network). Usage: node tools/tests/api.js
global.__BAL_MEM = true; process.env.ADMIN_KEY = 'test-key';
const { Readable } = require('stream');
const suggest = require('../../api/suggest'), review = require('../../api/review'), scores = require('../../api/scores');
let fails = 0, oks = 0;
const ok = (c, msg) => { if (c) oks++; else { fails++; console.log('FAIL ' + msg); } };

async function call(h, method, data, hdr = {}) {
  const req = Readable.from(data ? [JSON.stringify(data)] : []);
  req.method = method; req.headers = Object.assign({ host: 'balance.test', 'x-real-ip': '1.2.3.4' }, hdr);
  let out = { code: 0, body: '' , headers: {} };
  const res = { statusCode: 200, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, end(b) { out.code = this.statusCode; out.body = b; } };
  await h(req, res);
  return { code: out.code, json: JSON.parse(out.body || '{}'), headers: out.headers };
}

(async () => {
  let r = await call(suggest, 'GET');
  ok(r.code === 200 && Array.isArray(r.json.list) && r.json.review, 'GET suggest lists + review status');
  r = await call(suggest, 'POST', { text: 'Add a hero that steals buffs', name: 'Ana' });
  ok(r.code === 200 && r.json.id > 0, 'POST suggestion');
  r = await call(suggest, 'POST', { text: 'hi' });
  ok(r.code === 400, 'too short is rejected');
  r = await call(suggest, 'POST', { text: 'evil cross-site post' }, { origin: 'https://evil.example' });
  ok(r.code === 403, 'foreign Origin is rejected (CSRF)');
  r = await call(suggest, 'POST', { text: 'same origin is fine' }, { origin: 'https://balance.test' });
  ok(r.code === 200, 'same Origin accepted');
  for (let i = 0; i < 3; i++) r = await call(suggest, 'POST', { text: 'spam spam spam ' + i });
  ok(r.code === 429, 'rate limit per IP (4 per 10 min)');
  r = await call(suggest, 'POST', { text: 'another person' }, { 'x-real-ip': '5.6.7.8' });
  ok(r.code === 200, 'other IPs unaffected');
  r = await call(suggest, 'GET');
  ok(r.json.list[0].text === 'another person' && !('iph' in r.json.list[0]), 'list newest first, no IP hash leaked');
  r = await call(suggest, 'POST', { text: '<script>alert(1)</script>\u0000 ok', name: 'x'.repeat(80) });
  const last = (await call(suggest, 'GET', null, { 'x-real-ip': '9.9.9.9' })).json.list[0];
  ok(!last || !last.text.includes('\u0000'), 'control chars stripped (escaping is done at render time)');

  r = await call(review, 'POST', { key: 'wrong', minutes: 60, every: 1 });
  ok(r.code === 403, 'review needs the owner key');
  r = await call(review, 'POST', { key: 'test-key', minutes: 60, every: 1 });
  ok(r.code === 200 && r.json.until > Date.now() + 59 * 60e3 && r.json.every === 1, 'owner sets a 1h window checking every 1 min');
  r = await call(review, 'POST', { key: 'test-key', minutes: 99999999, every: -3 });
  ok(r.json.every === 1 && r.json.until <= Date.now() + 7 * 24 * 3600e3 + 1000, 'window and interval are clamped');
  r = await call(review, 'POST', { key: 'test-key', minutes: 0 });
  ok(r.json.until === 0, 'minutes 0 turns review off');
  r = await call(review, 'GET');
  ok(r.code === 200 && 'seen' in r.json, 'GET review status');

  r = await call(scores, 'POST', { name: 'Zed', score: 42, wave: 7, heroes: ['pyra', 'bastion', 'nope'] });
  ok(r.code === 200 && r.json.top[0].score === 42 && r.json.top[0].heroes.length === 2, 'score saved, unknown heroes dropped');
  r = await call(scores, 'POST', { name: 'Cheat', score: 1e9, wave: 1 });
  ok(r.code === 400, 'absurd score rejected');
  r = await call(scores, 'POST', { name: '', score: 1, wave: 1 });
  ok(r.code === 400, 'name required');
  r = await call(scores, 'GET');
  ok(r.json.top.length === 1, 'leaderboard GET');
  ok(r.headers['cache-control'] === 'no-store', 'no caching of API responses');

  console.log(`api: ${oks} ok, ${fails} fail`);
  process.exit(fails ? 1 : 0);
})();
