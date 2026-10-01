// v55 (review #67): a strip of battle frames to look at how smooth the fight moves (tools/tests/.saida/quadros.png).
// Each frame is the board 120 ms after the one before, on a phone. Usage: node tools/tests/quadros.mjs [frames=12]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(AQUI, '..', '..'), OUT = path.join(AQUI, '.saida') + path.sep;
const NF = +(process.argv[2] || 12), PORT = 3798, CDP = 9438, sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(700);
const prof = OUT + 'chrome-quadros'; fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {};
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 740, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(1200);
await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(1200);
await ev(`__bal.ACT['new-run']()`); await sleep(200);
await ev(`document.querySelector('[data-act=start-pick]').click(); document.querySelector('[data-act=start-next]').click(); document.querySelector('[data-act=start-relic]').click(); document.querySelector('[data-act=start-go]').click()`); await sleep(300);
await ev(`(() => { const r = __bal.run; while (r.heroes.length < 3) B.Run.addHero(r, Object.keys(B.HEROES).find(k => !r.heroes.some(h => h.key === k))); __bal.render(); })()`); await sleep(200);
await ev(`document.querySelector('[data-act=choose]').click()`); await sleep(500);
await ev(`document.querySelector('[data-act=fight]').click()`); await sleep(700);
console.log('screen:', await ev(`__bal.run && __bal.run.phase`), await ev(`!!document.querySelector('#board')`));
const shots = [];
for (let i = 0; i < NF; i++) {
  const r = await ev(`(() => { const e = document.querySelector('#board'); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()`);
  if (!r) break;   // the fight is over
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: r[0], y: r[1], width: r[2], height: r[3], scale: 1 } });
  shots.push(s.result.data); await sleep(120);
}
fs.writeFileSync(OUT + 'quadros.json', JSON.stringify(shots));
console.log('quadros: ' + shots.length + ' frames in ' + OUT + 'quadros.json');
chrome.kill(); server.kill(); process.exit(0);
