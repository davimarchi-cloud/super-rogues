// Local server: static files + /api/* with in-memory storage (no database needed).
// Usage: node tools/dev-server.js [port=3790]   Owner key for the review form: "dev-key".
global.__BAL_MEM = true;
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'dev-key';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = +(process.argv[2] || 3790);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const HEADERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers[0].headers;
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  for (const h of HEADERS) res.setHeader(h.key, h.value);
  // dev-only: play Claude's part in tests (mark a batch reviewed and "ship" it). Never deployed: not under api/.
  if (u.pathname === '/__dev/resolve') {
    const M = global.__BAL_MEMDATA, b = +u.searchParams.get('batch'), now = Date.now();
    if (M) { M.sug.filter(s => !b || s.batch === b).forEach((s, i) => { s.status = i === 0 && u.searchParams.has('decline1') ? 'declined' : 'done'; s.reply = 'Done in test'; s.updated = now; }); M.kv.lastRun = String(now); }
    res.setHeader('Content-Type', 'application/json'); return res.end('{"ok":true}');
  }
  // dev-only: give a test player crowns (v27 Crown Shop tests)
  if (u.pathname === '/__dev/grant') { const P = global.__BAL_MEMDATA && global.__BAL_MEMDATA.players, p = P && P[u.searchParams.get('pid')]; if (p) p.gems += +u.searchParams.get('n') || 0; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: !!p })); }
  if (u.pathname === '/__dev/ship') { if (global.__BAL_MEMDATA) global.__BAL_MEMDATA.kv.lastRun = String(Date.now()); return res.end('{"ok":true}'); }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z]/g, '');
    const f = path.join(ROOT, 'api', name + '.js');
    if (!name || name.startsWith('_') || !fs.existsSync(f)) { res.statusCode = 404; return res.end('{}'); }
    try { await require(f)(req, res); } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  if (!/^\/(index\.html|style\.css|js\/[a-z]+\.js|fonts\/[a-z]+\.woff2|art\/[a-z_]+\/[a-z0-9-]+\.(webp|jpg|png))$/.test(p)) { res.statusCode = 404; return res.end('not found'); }
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('Balance on http://localhost:' + PORT));
