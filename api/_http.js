// Shared HTTP helpers for the serverless functions (plain Node req/res, so the local dev server can run them too).
const crypto = require('crypto');

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(obj));
}
async function body(req, max = 20000) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (_) { return {}; } }
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > max) return {}; }
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}
// CSRF: a browser POST from another site carries its Origin; ours matches the Host we were called on
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (_) { return false; }
}
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function ipHash(req) {
  const ip = String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || '?').trim();
  return sha((process.env.ADMIN_KEY || 'dev') + '|' + ip).slice(0, 24);
}
// strip control characters (keep newlines and tabs), trim, cap length
function clean(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max); }

module.exports = { send, body, sameOrigin, ipHash, clean };
