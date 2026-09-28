// Icon sheet: every item and relic icon, rendered in a real Chrome. Writes tools/tests/.saida/icones.png.
// Usage: node tools/tests/icones.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(AQUI, '..', '..'), OUT = path.join(AQUI, '.saida') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3797, CDP = 9437, sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(600);
const prof = OUT + 'chrome-icones'; fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {};
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const W = 420, H = 1000;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(1200);
await send('Runtime.evaluate', { expression: `(() => {
  document.body.innerHTML = '<div id=g style="display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:#12141a"></div>'; const g = document.getElementById('g');
  for (const it of B.ITEMS) { const i = new Image(); i.src = B.Icons.item(it.id, 44); i.width = i.height = 44; g.appendChild(i); }
  for (const r of B.RELICS) { const i = new Image(); i.src = B.Icons.relic(r.id, 44); i.width = i.height = 44; g.appendChild(i); }
})()` });
await sleep(300);
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(OUT + 'icones.png', Buffer.from(r.result.data, 'base64'));
console.log('icones:', OUT + 'icones.png');
chrome.kill(); server.kill(); process.exit(0);
