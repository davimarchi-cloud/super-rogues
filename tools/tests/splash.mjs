// Splash sheet: every hero's splash art (+ some busts), rendered in a real Chrome. Writes tools/tests/.saida/splash.png.
// Usage: node tools/tests/splash.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(AQUI, '..', '..'), OUT = path.join(AQUI, '.saida') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3798, CDP = 9438, sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(600);
const prof = OUT + 'chrome-splash'; fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {};
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const W = 420, H = 1060;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(1200);
await send('Runtime.evaluate', { expression: `(() => {
  document.body.innerHTML = '<div id=g style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;background:#0c0d11"></div>'; const g = document.getElementById('g');
  for (const k of Object.keys(B.HEROES)) { const i = new Image(); i.src = B.Splash.image(k, 96, 125, 'full'); i.width = 96; i.height = 125; g.appendChild(i); }
  for (const k of ['grunt', 'brute', 'golem', 'gorewarden', 'hollowking', 'wolf', 'bastion', 'pyra', 'rex', 'pip']) { const i = new Image(); i.src = B.Splash.image(k, 64, 64, 'bust'); i.width = i.height = 64; g.appendChild(i); }
})()` });
await sleep(300);
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(OUT + 'splash.png', Buffer.from(r.result.data, 'base64'));
console.log('icones:', OUT + 'splash.png');
chrome.kill(); server.kill(); process.exit(0);
