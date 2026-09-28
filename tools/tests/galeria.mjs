// Model gallery: every unit model in 4 poses (idle, walk, attack, cast), rendered in a real Chrome.
// Writes tools/tests/.saida/galeria.png. Usage: node tools/tests/galeria.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(AQUI, '..', '..'), OUT = path.join(AQUI, '.saida') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3794, CDP = 9434, sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(600);
const prof = OUT + 'chrome-galeria'; fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {};
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const keys = ['bastion', 'vex', 'pyra', 'glacia', 'brakk', 'lumen', 'kestrel', 'morrow', 'tempest', 'grimhook', 'mirage', 'rook', 'grunt', 'wolf', 'archer', 'brute', 'skulker', 'shaman', 'bomber', 'shieldbearer', 'hexer', 'golem', 'summoner', 'spitter', 'knight', 'imp', 'gorewarden', 'hollowking', 'skeleton', 'turret'];
const W = 4 * 90 + 110, H = keys.length * 92 + 20;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(1200);
await send('Runtime.evaluate', { expression: `(() => {
  document.body.innerHTML = ''; const cv = document.createElement('canvas'); cv.width = ${W}; cv.height = ${H}; document.body.appendChild(cv);
  const c = cv.getContext('2d'); c.fillStyle = '#1a1f2b'; c.fillRect(0, 0, ${W}, ${H}); c.font = '11px sans-serif'; c.fillStyle = '#ccc';
  const keys = ${JSON.stringify(keys)}; const poses = [{ t: 1 }, { t: 1, walk: 0.25 }, { t: 1, atk: 0.55 }, { t: 1, cast: 0.5 }];
  keys.forEach((k, i) => { c.fillStyle = '#ccc'; c.fillText(k, 6, i * 92 + 56); poses.forEach((p, j) => B.Models.draw(c, k, 150 + j * 90, i * 92 + 86, 34, Object.assign({ face: 1 }, p), '#9df')); });
})()` });
await sleep(300);
const r = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(OUT + 'galeria.png', Buffer.from(r.result.data, 'base64'));
console.log('galeria:', OUT + 'galeria.png');
chrome.kill(); server.kill(); process.exit(0);
