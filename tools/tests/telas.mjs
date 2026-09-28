// Plays a whole run in a real (headless) Chrome at phone size, clicking the real buttons.
// Checks: no JS errors, no CSP violations, no horizontal scroll, smooth movement (fractional positions mid-move),
// suggestion box + owner review window + leaderboard. Screenshots go to tools/tests/.saida/.
// Usage: node tools/tests/telas.mjs [baseUrl]   (without baseUrl it starts tools/dev-server.js)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(AQUI, '..', '..');
const OUT = path.join(AQUI, '.saida') + path.sep;
fs.mkdirSync(OUT, { recursive: true });
const PORT = 3791, CDP = 9431;
const BASE = process.argv[2] || `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const ok = (c, msg) => { if (c) oks++; else fails++; console.log((c ? 'OK   ' : 'FAIL ') + msg); };

let server = null;
if (!process.argv[2]) {
  server = spawn(process.execPath, [path.join(ROOT, 'tools', 'dev-server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', d => (log += d)); server.stderr.on('data', d => (log += d));
  for (let i = 0; i < 40 && !log.includes('localhost'); i++) await sleep(150);
}
const prof = OUT + 'chrome-profile';
fs.rmSync(prof, { recursive: true, force: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = {}, errors = [];
for (let i = 0; i < 60 && !ws; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find(x => x.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (_) {} await sleep(250); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; }
  if (d.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 400));
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || String(d.params.args?.[0]?.value || '').startsWith('CSP'))) errors.push('console: ' + JSON.stringify(d.params.args).slice(0, 300));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) errors.push('eval: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(OUT + name + '.png', Buffer.from(r.result.data, 'base64')); };
const click = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.disabled) return false; e.click(); return true; })()`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('securitypolicyviolation', e => console.error('CSP ' + e.violatedDirective + ' ' + e.blockedURI));` });
await send('Page.navigate', { url: BASE + '/' });
await sleep(1200);

const noHScroll = async where => ok(await ev('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'no horizontal scroll: ' + where);
ok(await ev(`!!document.querySelector('.title h1') && document.title === 'Balance'`), 'title screen renders');
await shot('01-title'); await noHScroll('title');

// new run, pick 2 heroes
await click('[data-act=new-run]'); await sleep(200);
const picks = await ev(`[...document.querySelectorAll('[data-act=start-pick]')].length`);
ok(picks === 4, 'start offers 4 heroes');
await click('[data-act=start-pick]'); await ev(`document.querySelectorAll('[data-act=start-pick]')[1].click()`);
await shot('02-start'); await noHScroll('start');
ok(await click('[data-act=start-go]'), 'start run');
await sleep(200);
ok(await ev(`document.querySelectorAll('[data-act=choose]').length`) === 2, 'first map step shows 2 options');
await shot('03-map'); await noHScroll('map');

let fightsSeen = 0, sawSmooth = false, sawShop = false, sawEvent = false, sawLevel = false, sawBoss = 0, steps = 0;
while (steps++ < 80) {
  const st = await ev(`(() => { const r = __bal.run; return { phase: r.phase, screen: document.querySelector('#screen').innerHTML.slice(0, 200), pending: r.pending.length, type: r.cur && r.cur.type, diff: r.cur && r.cur.diff, gold: r.gold, bag: r.bag.length, battle: !!__bal.battle }; })()`);
  if (!st) break;
  if (st.phase === 'over') break;
  if (await ev(`!!document.querySelector('[data-act=result-ok]')`)) { if (fightsSeen === 1) await shot('06-result'); await click('[data-act=result-ok]'); await sleep(100); continue; }
  if (await ev(`!!document.querySelector('[data-act=spec]')`)) { if (!sawLevel) { await shot('07-levelup'); sawLevel = true; } await click('[data-act=spec]'); await sleep(80); continue; }
  if (st.phase === 'map') {
    // prefer medium fights and shops so the run goes the distance
    await ev(`(() => { const b = [...document.querySelectorAll('[data-act=choose]')]; const pref = b.find(x => /Item Shop|Hero Shop|Medium|Easy/.test(x.textContent)) || b[0]; pref.click(); })()`);
    await sleep(120); continue;
  }
  if (st.phase === 'shop') {
    if (!sawShop) { await shot('08-shop'); await noHScroll('shop'); sawShop = true; }
    await ev(`[...document.querySelectorAll('[data-act=buy]')].forEach(b => { if (!b.disabled) b.click(); })`);
    await sleep(80);
    // equip everything through the Team sheet
    for (let k = 0; k < 6; k++) {
      const did = await ev(`(() => { if (!__bal.run.bag.length) return false; document.querySelector('[data-act=team]').click(); const bag = document.querySelector('[data-act=bag]'); if (!bag) return false; bag.click(); const slot = document.querySelector('[data-act=equip]'); if (!slot) { document.querySelector('[data-act=close]').click(); return false; } slot.click(); document.querySelector('[data-act=close]').click(); return true; })()`);
      if (!did) break;
    }
    await click('[data-act=leave]'); await sleep(100); continue;
  }
  if (st.phase === 'event') {
    if (!sawEvent) { await shot('09-event'); sawEvent = true; }
    if (!(await click('[data-act=event]:not([disabled])'))) await ev(`document.querySelectorAll('[data-act=event]')[1]?.click()`);
    await sleep(80); await click('[data-act=leave]'); await sleep(80); continue;
  }
  if (st.phase === 'deploy' && !st.battle) {
    fightsSeen++;
    if (fightsSeen === 1) {
      await shot('04-deploy'); await noHScroll('deploy');
      // drag a hero to another blue hex with real pointer events
      const moved = await ev(`(async () => {
        const cv = document.querySelector('#board'), r = cv.getBoundingClientRect(), h = __bal.run.heroes[0], size = r.width / (Math.sqrt(3) * 8.5);
        const a = B.Hex.px(h.pos.c, h.pos.r, size), tgt = { c: h.pos.c === 0 ? 1 : 0, r: 6 }, b = B.Hex.px(tgt.c, tgt.r, size);
        const fire = (type, p) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + p.x, clientY: r.top + p.y, pointerId: 1 }));
        fire('pointerdown', a); fire('pointermove', b); fire('pointerup', b);
        return __bal.run.heroes[0].pos.c === tgt.c && __bal.run.heroes[0].pos.r === tgt.r; })()`);
      ok(moved, 'drag a hero to a new hex while deploying');
    }
    if (st.diff === 'boss') sawBoss++;
    await click('[data-act=fight]');
    if (fightsSeen === 1) {
      // watch the battle for a moment and look for a unit caught between two hexes
      for (let k = 0; k < 40 && !sawSmooth; k++) {
        sawSmooth = await ev(`(() => { const b = __bal.battle; if (!b) return false; const W = b.W, T = W.t + b.acc / 50; return W.units.some(u => !u.dead && u.m1t > T && u.m0t < T && (u.fc !== u.c || u.fr !== u.r)); })()`);
        await sleep(60);
      }
      await sleep(900); await shot('05-battle'); await noHScroll('battle');
    }
    if (st.type === 'onslaught') { await sleep(2500); await shot('10-onslaught'); }
    await click('[data-act=skip]');
    for (let k = 0; k < 60 && (await ev('!!__bal.battle')); k++) await sleep(100);
    continue;
  }
  await sleep(100);
}
ok(sawSmooth, 'units are drawn between hexes while moving (smooth movement)');
ok(fightsSeen >= 3, 'played ' + fightsSeen + ' battles');
ok(sawShop, 'visited a shop');
const fin = await ev(`({ phase: __bal.run.phase, result: __bal.run.result, score: __bal.run.score, fightNo: __bal.run.fightNo })`);
ok(fin.phase === 'over', `run reached the end (${fin.result}, fight ${fin.fightNo}, score ${fin.score})`);
await shot('11-over'); await noHScroll('over');
if (fin.result === 'onslaught') {
  ok(sawBoss === 2, 'fought both bosses');
  await ev(`(() => { const f = document.querySelector('form[data-form=score]'); f.name.value = 'TestBot'; f.querySelector('button').click(); })()`);
  await sleep(700);
  ok(await ev(`document.querySelector('#modal:not([hidden]) table') ? document.querySelector('#modal').textContent.includes('TestBot') : false`), 'score shows on the leaderboard');
  await click('[data-act=close]');
}

// suggestion box
await click('[data-act=suggest]'); await sleep(500);
await ev(`(() => { const f = document.querySelector('form[data-form=suggest]'); f.text.value = 'Please add a hero that <b>reflects</b> spells'; f.name.value = 'Tester'; f.querySelector('button').click(); })()`);
await sleep(700);
ok(await ev(`document.querySelector('#modal').textContent.includes('reflects') && !document.querySelector('#modal b.injected') && document.querySelector('#modal .sug .txt').innerHTML.includes('&lt;b&gt;')`), 'suggestion posted and shown escaped');
await ev(`(() => { document.querySelector('details.owner').open = true; const f = document.querySelector('form[data-form=review]'); f.key.value = 'dev-key'; f.minutes.value = '60'; f.every.value = '1'; f.querySelector('button').click(); })()`);
await sleep(700);
ok(await ev(`document.querySelector('.review').textContent.includes('ON') && document.querySelector('.review').textContent.includes('every 1 min')`), 'owner turns on review: 1 h, every 1 min');
await shot('12-suggest'); await noHScroll('suggest sheet');
await click('[data-act=close]');

ok(errors.length === 0, 'no JS errors / CSP violations' + (errors.length ? ': ' + errors.slice(0, 5).join(' || ') : ''));
console.log(`telas: ${oks} ok, ${fails} fail (screens in ${OUT})`);
try { ws.close(); } catch (_) {}
chrome.kill(); if (server) server.kill();
process.exit(fails ? 1 : 0);
