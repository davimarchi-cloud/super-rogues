// Review #13 (David: "adapt to the screen size and type of screen and device"): plays the opening of a run on 5
// devices and checks that nothing is wider than the screen (that is what makes phones zoom the page out) and that the
// board fits the screen height. Screens go to tools/tests/.saida/dev-*.png. Usage: node tools/tests/dispositivos.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(AQUI, '..', '..'), OUT = path.join(AQUI, '.saida') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3799, CDP = 9439, sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const ok = (c, msg) => { if (c) oks++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + msg); };
const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(600);
const prof = OUT + 'chrome-dev'; fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {}, errors = [];
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name + '.png', Buffer.from(r.result.data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');

const DEVICES = [
  { name: 'phone-small', w: 360, h: 640, mobile: true, dpr: 3 },
  { name: 'phone', w: 390, h: 740, mobile: true, dpr: 3 },
  { name: 'phone-landscape', w: 740, h: 360, mobile: true, dpr: 3 },
  { name: 'tablet', w: 820, h: 1180, mobile: true, dpr: 2 },
  { name: 'desktop', w: 1440, h: 900, mobile: false, dpr: 1 },
];
const noHScroll = async where => ok(await ev('document.documentElement.scrollWidth <= window.innerWidth + 1'), where + ': nothing wider than the screen');
const boardFits = async where => {
  const r = await ev(`(() => { const b = document.querySelector('#board').getBoundingClientRect(); return { right: b.right, bottom: b.bottom + window.scrollY, w: b.width, vw: innerWidth, vh: innerHeight }; })()`);
  ok(r.right <= r.vw + 1 && r.bottom <= r.vh + 1, `${where}: board fits the screen (${Math.round(r.w)}px wide, bottom ${Math.round(r.bottom)} of ${r.vh})`);
  return r;
};
for (const d of DEVICES) {
  await send('Emulation.setDeviceMetricsOverride', { width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: d.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: d.mobile });
  await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(900);
  await ev(`localStorage.clear()`); await send('Page.reload'); await sleep(900);
  await noHScroll(d.name + ' title');
  await ev(`document.querySelector('[data-act=new-run]').click()`); await sleep(200);
  await ev(`document.querySelectorAll('[data-act=start-pick]')[0].click(); document.querySelectorAll('[data-act=start-pick]')[1].click(); document.querySelector('[data-act=start-go]').click()`); await sleep(300);
  await noHScroll(d.name + ' map'); await shot('dev-' + d.name + '-map');
  await ev(`document.querySelector('[data-act=choose]').click()`); await sleep(400);
  await noHScroll(d.name + ' deploy');
  const r = await boardFits(d.name + ' deploy');
  if (d.name === 'desktop' || d.name === 'tablet') ok(r.w >= 520 && (await ev(`document.querySelector('#app').getBoundingClientRect().width`)) >= 800, `${d.name}: uses the big screen (board ${Math.round(r.w)}px)`);
  if (d.name === 'phone-landscape') ok(await ev(`(() => { const b = document.querySelector('#board').getBoundingClientRect(), bar = document.querySelector('.deploy .bar').getBoundingClientRect(); return bar.left >= b.right - 1 && bar.bottom <= innerHeight + 1; })()`), 'phone-landscape: the panel sits beside the board');
  await shot('dev-' + d.name + '-deploy');
  await ev(`document.querySelector('[data-act=fight]').click()`); await sleep(1500);
  await noHScroll(d.name + ' battle'); await boardFits(d.name + ' battle'); await shot('dev-' + d.name + '-battle');
  await ev(`document.querySelector('[data-act=skip]').click()`); for (let k = 0; k < 40 && (await ev('!!__bal.battle')); k++) await sleep(100);
  await noHScroll(d.name + ' result');
}
ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`dispositivos: ${oks} ok, ${fails} fail`);
chrome.kill(); server.kill(); process.exit(fails ? 1 : 0);
