// v29 (owner: "on the PC the framing is horrible"): a photo of every main screen on a phone and on 3 computer screens,
// for design review. Screens go to tools/tests/.saida/vit-<screen size>-<screen>.png (and a copy to the owner's
// Downloads\balance-prints when that folder exists). Checks nothing is wider than the screen and that the board fits.
// Usage: node tools/tests/vitrine.mjs [only=desk|phone]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(AQUI, '..', '..'), OUT = path.join(AQUI, '.saida') + path.sep;
const PRINTS = 'C:/Users/davi_/Downloads/balance-prints/';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3797, CDP = 9437, sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const ok = (c, msg) => { if (c) oks++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + msg); };
const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: 'ignore' });
await sleep(700);
const prof = OUT + 'chrome-vit'; fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {}, errors = [];
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300)); };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
const only = process.argv[2];
const SIZES = [
  { name: 'phone', w: 390, h: 740, mobile: true, dpr: 2 },
  { name: 'laptop', w: 1366, h: 768, mobile: false, dpr: 1 },
  { name: 'desk', w: 1440, h: 900, mobile: false, dpr: 1 },
  { name: 'fullhd', w: 1920, h: 1080, mobile: false, dpr: 1 },
].filter(s => !only || (only === 'phone' ? s.mobile : !s.mobile));
const printsOk = fs.existsSync(PRINTS) || (() => { try { fs.mkdirSync(PRINTS, { recursive: true }); return true; } catch (_) { return false; } })();
for (const d of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: d.mobile });
  await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(900);
  await ev(`localStorage.clear()`); await send('Page.navigate', { url: `http://localhost:${PORT}/` }); await sleep(1100);
  const shot = async name => {
    await sleep(350);
    const r = await send('Page.captureScreenshot', { format: 'png' }); const f = `vit-${d.name}-${name}.png`;
    fs.writeFileSync(OUT + f, Buffer.from(r.result.data, 'base64')); if (printsOk) fs.copyFileSync(OUT + f, PRINTS + f);
    ok(await ev('document.documentElement.scrollWidth <= window.innerWidth + 1'), `${d.name} ${name}: nothing wider than the screen`);
  };
  await shot('01-title');
  await ev(`__bal.ACT['new-run']()`); await sleep(200);
  await ev(`document.querySelector('[data-act=start-pick]').click(); document.querySelector('[data-act=start-relic]').click()`); await shot('02-start');
  await ev(`document.querySelector('[data-act=start-go]').click()`); await sleep(200);
  await ev(`(() => { const r = __bal.run; B.Run.addHero(r, 'lumen'); B.Run.addHero(r, 'kestrel'); r.relics.push('drum', 'shieldwall', 'rearguard'); r.heroes[0].items = ['longsword']; __bal.render(); })()`);
  await shot('03-map');
  // review #39: show a map with terrain (trees and boulders) instead of fight 1's open meadow
  await ev(`(() => { for (const o of __bal.run.opts) if (o.type === 'fight') o.map = 'oaks'; __bal.render(); })()`);
  await ev(`(() => { const b = [...document.querySelectorAll('[data-act=choose]')].find(x => /fight/i.test(x.textContent)) || document.querySelector('[data-act=choose]'); b.click(); })()`); await sleep(500);
  if (await ev(`!!document.querySelector('#board')`)) {
    const r = await ev(`(() => { const b = document.querySelector('#board').getBoundingClientRect(); return { right: b.right, bottom: b.bottom, w: b.width, h: b.height }; })()`);
    ok(r.right <= d.w + 1 && r.bottom <= d.h + 1, `${d.name} deploy: the board fits (${Math.round(r.w)}x${Math.round(r.h)}, bottom ${Math.round(r.bottom)} of ${d.h})`);
    if (!d.mobile) ok(r.h >= d.h * 0.6, `${d.name} deploy: the board uses most of the height (${Math.round(r.h)} of ${d.h})`);
    await shot('04-deploy');
    await ev(`(() => { __bal.run.cur.map = 'pond'; __bal.render(); })()`); await sleep(300); await shot('04b-deploy-pond');
    await ev(`(() => { __bal.run.cur.map = 'ridge'; __bal.render(); })()`); await sleep(300);
    await ev(`document.querySelector('[data-act=fight]').click()`); await sleep(2600); await shot('05-battle');
    await ev(`__bal.skipBattle()`); await sleep(1800); await shot('06-result');
  }
  await ev(`__bal.ACT['result-ok']()`); await sleep(150);
  await ev(`(() => { const r = __bal.run; r.pending = []; r.phase = 'map'; r.cur = null; r.gold = 40; r.opts = [{ type: 'shop', kind: 'itemShop' }]; B.Run.choose(r, 0); __bal.render(); })()`);
  await shot('07-shop');
  await ev(`(() => { const r = __bal.run; r.phase = 'map'; r.cur = null; r.opts = [{ type: 'event', id: 'smith' }]; r.bag.push('cap'); B.Run.choose(r, 0); __bal.render(); })()`);
  await shot('08-event');
  await ev(`__bal.ACT.team()`); await sleep(300); await shot('09-team'); await ev(`__bal.ACT.close()`);
  await ev(`__bal.ACT.shop()`); await sleep(500); await shot('10-crown-shop'); await ev(`__bal.ACT.close()`);
  // Art Lab (owner, 2026-09-29): a splash picture (the owner's sample when it is on this PC) and a pose sheet made from
  // the drawn model on magenta, cut by the lab, then the test fight
  {
    const setFile = async (sel, file) => { const dd = await send('DOM.getDocument', { depth: 0 }); const n = await send('DOM.querySelector', { nodeId: dd.result.root.nodeId, selector: sel }); await send('DOM.setFileInputFiles', { nodeId: n.result.nodeId, files: [file] }); };
    const sample = 'C:/Users/davi_/.claude/uploads/681d121e-0bd6-48d0-9b04-0a67c1e91cf5/13c6b00b-image.jpg';
    const sheetU = await ev(`(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 380; const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 1200, 380);
      [{ t: 0.3, face: 1 }, { t: 0.3, face: 1, walk: 0.25 }, { t: 0.3, face: 1, atk: 0.55 }, { t: 0.3, face: 1, atk: 0.95 }].forEach((p, i) => B.Models.draw(x, 'barley', 150 + i * 300, 345, 200, p, '#b8792a'));
      x.fillStyle = '#ff00ff'; x.fillRect(0, 347, 1200, 40); return c.toDataURL('image/png'); })()`);
    fs.writeFileSync(OUT + 'vit-sheet.png', Buffer.from(sheetU.split(',')[1], 'base64'));
    await ev(`__bal.ACT['art-lab']('barley')`); await sleep(400);
    if (fs.existsSync(sample)) { await setFile('#alSplash', sample); await sleep(900); }
    await setFile('#alSheet', OUT + 'vit-sheet.png'); await sleep(1200);
    ok(await ev(`document.querySelectorAll('.alposes img').length === 4`), `${d.name}: the lab cuts the 4 poses`);
    await shot('11-art-lab');
    await ev(`(() => { const m = document.querySelector('#modal .sheet'), t = document.querySelector('#alSheetView'); m.scrollTop = t.closest('.alsec').offsetTop - 10; })()`); await sleep(1500);
    await shot('12-art-lab-poses');
    await ev(`(() => { const m = document.querySelector('#modal .sheet'); m.scrollTop = document.querySelector('#alBoard').closest('.alsec').offsetTop - 10; })()`); await sleep(2500);
    await shot('13-art-lab-fight');
    await ev(`__bal.ACT.close()`);
  }
  await ev(`__bal.ACT.menu()`); await sleep(200);
}
ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`vitrine: ${oks} ok, ${fails} fail${printsOk ? ' (copies in ' + PRINTS + ')' : ''}`);
try { ws.close(); } catch (_) {}
chrome.kill(); server.kill();
process.exit(fails ? 1 : 0);
