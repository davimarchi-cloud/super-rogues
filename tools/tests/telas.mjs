// Plays a whole run in a real (headless) Chrome at phone size, clicking the real buttons.
// Checks: no JS errors, no CSP violations, no horizontal scroll, smooth movement (fractional positions mid-move),
// suggestion list + 'Send for review' button + leaderboard. Screenshots go to tools/tests/.saida/.
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
const REMOTE = !!process.argv[2]; // against the live site: play, but never write to the public queue/leaderboard
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 740, deviceScaleFactor: 2, mobile: true });  // review #9: usable height of a phone browser
await send('Emulation.setTouchEmulationEnabled', { enabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('securitypolicyviolation', e => console.error('CSP ' + e.violatedDirective + ' ' + e.blockedURI));` });
await send('Page.navigate', { url: BASE + '/' });
await sleep(1200);

const noHScroll = async where => ok(await ev('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'no horizontal scroll: ' + where);
// review #9 (David): the whole game without scrolling on a phone
const noVScroll = async where => { const r = await ev(`(() => { const m = document.querySelector('#modal:not([hidden]) .sheet'); return m ? [m.scrollHeight, m.clientHeight] : [document.documentElement.scrollHeight, window.innerHeight]; })()`); ok(r[0] <= r[1] + 2, `fits without scrolling: ${where} (${r[0]}px of ${r[1]}px)`); };
ok(await ev(`!!document.querySelector('.title h1') && document.title === 'Balance'`), 'title screen renders');
await shot('01-title'); await noHScroll('title'); await noVScroll('title');
// v27 (owner + review #25): the start menu has the Crown Shop and your profile; the suggestion box stays only at the top
ok(await ev(`!!document.querySelector('#top [data-act=shop].crownchip') && document.querySelectorAll('.homeicons button').length === 3 && !!document.querySelector('.homeicons [data-act=shop]') && !!document.querySelector('.homeicons [data-act=my-profile]') && !document.querySelector('.live') && document.querySelectorAll('[data-act=suggest]').length === 1 && !!document.querySelector('#top [data-act=suggest]')`), 'start menu: crown icon + Crown Shop and Profile tiles; the suggestion box only at the top');
ok(await ev(`!!document.querySelector('.title .labtile[data-act=art-lab]')`), 'start menu: the Art Lab at the bottom');
await click('.homeicons [data-act=my-profile]'); await sleep(400);
ok(await ev(`/first run/.test(document.querySelector('#modal').textContent)`), 'profile before the first run: explains when it starts');
await click('[data-act=close]'); await sleep(100);

// new run, pick 1 hero and 1 relic (review #22)
await click('[data-act=new-run]'); await sleep(200);
const picks = await ev(`[...document.querySelectorAll('[data-act=start-pick]')].length`);
ok(picks === 3, 'start offers 3 heroes side by side');
const fmtOut = await ev(`__bal.fmt('<b>x</b> deals 20% magic damage and stuns for 1.5s')`);
ok(/&lt;b&gt;/.test(fmtOut) && /class="num">20%/.test(fmtOut) && /kw-ap/.test(fmtOut) && /kw-cc/.test(fmtOut) && /class="dur">1.5s/.test(fmtOut), 'review #10: descriptions colour terms, bold numbers, italic durations, and stay escaped');
ok(await ev(`document.querySelectorAll('.detail .stat').length >= 6`), 'stat chips on the hero detail');
await click('[data-act=start-pick]');
ok(await ev(`document.querySelectorAll('[data-act=start-relic]').length === 3 && document.querySelector('[data-act=start-go]').disabled`), 'review #22: 3 relics offered; you need a hero AND a relic to begin');
await click('[data-act=start-relic]');
await shot('02-start'); await noHScroll('start'); await noVScroll('start');
ok(await click('[data-act=start-go]'), 'start run');
await sleep(200);
ok(await ev(`document.querySelectorAll('[data-act=choose]').length`) === 2, 'first map step shows 2 options');
await shot('03-map'); await noHScroll('map'); await noVScroll('map');

let fightsSeen = 0, sawSmooth = false, sawShop = false, sawEvent = false, sawPicker = false, sawLevel = false, sawBoss = 0, steps = 0;
while (steps++ < 80) {
  const st = await ev(`(() => { const r = __bal.run; return { phase: r.phase, screen: document.querySelector('#screen').innerHTML.slice(0, 200), pending: r.pending.length, type: r.cur && r.cur.type, diff: r.cur && r.cur.diff, gold: r.gold, bag: r.bag.length, battle: !!__bal.battle }; })()`);
  if (!st) break;
  if (st.phase === 'gauntlet') {
    if (await ev(`!!document.querySelector('form[data-form=gauntlet]')`)) { if (REMOTE) break; await ev(`(() => { const f = document.querySelector('form[data-form=gauntlet]'); f.name.value = 'TestBot'; f.querySelector('button').click(); })()`); await sleep(800); continue; }
    await click('[data-act=to-duel]'); await sleep(150); continue;
  }
  if (await ev(`!!document.querySelector('[data-act=result-ok]')`)) { if (fightsSeen === 1) { await sleep(900); await shot('06-result'); await noVScroll('result');
      ok(await ev(`!!document.querySelector('.result.v2 .rhead .headline') && /⏱/.test(document.querySelector('.rmeta').textContent) && /foes down/.test(document.querySelector('.rmeta').textContent) && !!document.querySelector('.rh .rst') && /taken/.test(document.querySelector('.rh .rst').textContent) && document.querySelectorAll('.rfoes .rf').length > 0 && !/NaN|undefined/.test(document.querySelector('.result').textContent)`), 'review #25: the after-battle screen: banner, time and foes down, damage dealt and taken and kills per hero, the enemy line-up'); } await click('[data-act=result-ok]'); await sleep(100); continue; }
  if (st.phase === 'over') break;
  if (await ev(`!!document.querySelector('[data-act=spec]')`)) { if (!sawLevel) { await shot('07-levelup'); await noVScroll('level up'); sawLevel = true; } await click('[data-act=spec]'); await sleep(80); continue; }
  if (st.phase === 'map') {
    // prefer medium fights and shops so the run goes the distance
    await ev(`(() => { const b = [...document.querySelectorAll('[data-act=choose]')]; const pref = b.find(x => /Item Shop|Hero Shop|Medium|Easy/.test(x.textContent)) || b[0]; pref.click(); })()`);
    await sleep(120); continue;
  }
  if (st.phase === 'shop') {
    if (!sawShop) { await shot('08-shop'); await noHScroll('shop'); await noVScroll('shop'); sawShop = true; }
    await ev(`[...document.querySelectorAll('[data-act=buy]')].forEach(b => { if (!b.disabled) b.click(); })`);
    await sleep(80);
    if (!globalThis.__teamShot && await ev(`__bal.run.bag.length > 0`)) {
      globalThis.__teamShot = 1;
      await ev(`document.querySelector('[data-act=team]').click(); document.querySelector('[data-act=bag]').click()`); await sleep(150);
      ok(await ev(`(() => { const c = document.querySelectorAll('.equip .eqcol'); return c.length === 2 && !!c[0].querySelector('.eqitem') && !!c[1].querySelector('.eqhero') && c[0].getBoundingClientRect().left < c[1].getBoundingClientRect().left; })()`), 'equip sheet: items on the left, heroes on the right');
      await shot('08b-team'); await noHScroll('team sheet'); await noVScroll('team sheet');
      // review #19: tapping a hero's portrait shows its ability and how it scales, with its current numbers
      await click('[data-act=bag]'); await click('.dpor'); await sleep(150);
      ok(await ev(`!!document.querySelector('.hdetail .scal li') && /How it scales/.test(document.querySelector('.hdetail').textContent) && !/NaN|undefined/.test(document.querySelector('.hdetail').textContent)`), 'team sheet: the hero card shows its ability and how it scales');
      await shot('08c-hero-card'); await click('[data-act=close]'); await sleep(100);
    }
    // equip everything through the Team sheet
    for (let k = 0; k < 6; k++) {
      const did = await ev(`(() => { if (!__bal.run.bag.length) return false; document.querySelector('[data-act=team]').click(); const bag = document.querySelector('[data-act=bag]'); if (!bag) return false; bag.click(); const slot = document.querySelector('.eqhero.target'); if (!slot) { document.querySelector('[data-act=close]').click(); return false; } slot.click(); document.querySelector('[data-act=close]').click(); return true; })()`);
      if (!did) break;
    }
    await click('[data-act=leave]'); await sleep(100); continue;
  }
  if (st.phase === 'event') {
    if (!sawEvent) { await shot('09-event'); await noVScroll('event'); sawEvent = true; }
    if (await ev(`!!(__bal.run.cur && __bal.run.cur.done)`)) { await click('[data-act=leave]'); await sleep(80); continue; }  // back from a level-up the event gave
    ok(await ev(`document.querySelectorAll('[data-act=event]').length === 3`), 'review #17: the event offers 3 choices');
    await click('[data-act=event]:not([disabled])'); await sleep(80);
    if (await ev(`!!document.querySelector('[data-act=event-target]')`)) {  // a targeted choice: pick the hero / item / type
      if (!sawPicker) { await shot('09b-event-target'); await noVScroll('event target picker'); sawPicker = true; }
      await click('[data-act=event-target]'); await sleep(80);
    }
    ok(await ev(`!!__bal.run.cur && !!__bal.run.cur.done`), 'the event choice resolved: ' + (await ev(`(__bal.run.cur && __bal.run.cur.done) || ''`)));
    await click('[data-act=leave]'); await sleep(80); continue;
  }
  if (st.phase === 'deploy' && !st.battle) {
    fightsSeen++;
    if (fightsSeen === 1) {
      await shot('04-deploy'); await noHScroll('deploy'); await noVScroll('deploy');
      // drag a hero to another blue hex with real pointer events
      const moved = await ev(`(async () => {
        const cv = document.querySelector('#board'), h = __bal.run.heroes[0], tgt = { c: h.pos.c === 0 ? 1 : 0, r: 6 };
        const a = __bal.hexScreen(h.pos.c, h.pos.r), b = __bal.hexScreen(tgt.c, tgt.r);
        const fire = (type, p) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, pointerId: 1 }));
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
      await sleep(900); await shot('05-battle'); await noHScroll('battle'); await noVScroll('battle');
      ok(await ev(`/4×🔒/.test(document.querySelector('.speed').textContent) && !!document.querySelector('.speed [data-arg="2"]')`), 'v27: 2× speed is free, 4× is locked (Crown Shop)');
      await click('.speed [data-arg="4"]'); ok(await ev(`/Crown Shop/.test(document.querySelector('#toast').textContent)`), 'tapping the locked 4× says where to get it');
      ok(await ev(`!!document.querySelector('.speed .skip.locked')`), 'v30: the skip button is locked (Crown Shop perk)'); await click('.speed .skip'); ok(await ev(`/Skipping fights/.test(document.querySelector('#toast').textContent) && !!__bal.battle`), 'tapping it explains the unlock and the fight goes on');
    }
    await ev('__bal.skipBattle()');  // v30: the ⏭ button is a Crown Shop perk now
    for (let k = 0; k < 60 && (await ev('!!__bal.battle')); k++) await sleep(100);
    continue;
  }
  await sleep(100);
}
ok(sawSmooth, 'units are drawn between hexes while moving (smooth movement)');
ok(fightsSeen >= 1, 'played ' + fightsSeen + ' battles (no hearts: a run can end at the first loss)');
ok(sawShop, 'visited a shop');
const fin = await ev(`({ phase: __bal.run.phase, result: __bal.run.result, score: __bal.run.score, fightNo: __bal.run.fightNo })`);
ok(fin.phase === 'over' || (REMOTE && fin.phase === 'gauntlet'), `run reached the end (${fin.result}, fight ${fin.fightNo}, score ${fin.score})`);
await shot('11-over'); await noHScroll('over');
if (fin.result === 'defeat' && !REMOTE) {
  await sleep(600);
  ok(await ev(`__bal.run.eloEnd == null && !!__bal.run.lgEnd && /league point/.test(document.querySelector('#screen').textContent) && /1000/.test(document.querySelector('#top').textContent)`), 'no hearts: the lost fight ended the run; review #24: it costs league points but no Elo');
}

// ---- review #19: every hero ability has a scaling explanation with real numbers
ok(await ev(`Object.keys(B.HEROES).every(k => { const d = B.Run.heroDef({ relics: [] }, { key: k, lvl: 3, specs: [], items: [], bonus: {} }); const ps = __bal.scaleParts(d); return ps.length > 0 && ps.every(p => p.t && !/NaN|undefined|Infinity/.test(p.t)); })`), 'every hero ability explains how it scales (33 heroes, no NaN)');

// ---- review #17: events, forced so every test run sees one: 3 choices, a targeted choice with its picker, the result,
// and a next-fight modifier shown on the map
if (!REMOTE) {
  await click('[data-act=new-run]'); await sleep(150);
  await click('[data-act=start-pick]'); await click('[data-act=start-relic]'); await click('[data-act=start-go]'); await sleep(150);
  await ev(`(() => { const r = __bal.run; r.gold = 30; r.bag.push('cap', 'bloodthirster'); r.phase = 'map'; r.opts = [{ type: 'event', id: 'smith' }]; B.Run.choose(r, 0); __bal.render(); })()`); await sleep(150);
  ok(await ev(`document.querySelectorAll('[data-act=event]').length === 3 && !document.querySelector('[data-act=event][data-arg="2"]').disabled && !!document.querySelector('[data-act=event][data-arg="2"] .price')`), 'event: 3 choices, the priced one is available');
  await shot('09-event'); await noHScroll('event'); await noVScroll('event');
  await click('[data-act=event][data-arg="2"]'); await sleep(120);
  ok(await ev(`document.querySelectorAll('[data-act=event-target]').length === 2 && /Choose an item/.test(document.querySelector('#screen').textContent)`), 'event: Reforge asks which item (the 2 in the bag)');
  await shot('09b-event-target'); await noVScroll('event target picker');
  await click('[data-act=event-target]'); await sleep(120);
  ok(await ev(`/reforged into/.test(document.querySelector('#screen').textContent) && __bal.run.gold === 25`), 'event: the reforge happened and cost 5 gold');
  await shot('09c-event-done');
  await ev(`(() => { const r = __bal.run; r.cur = null; r.phase = 'map'; r.fightNo = 4; r.opts = [{ type: 'event', id: 'armory' }]; B.Run.choose(r, 0); __bal.render(); })()`); await sleep(150);
  ok(await ev(`document.querySelectorAll('.evch.haspic img').length === 3 && document.querySelectorAll('.evch .itag').length === 3`), 'Armory: 3 items to pick from, with icon, rarity and type');
  await shot('09e-armory'); await noVScroll('armory event');
  await ev(`(() => { const r = __bal.run; r.cur = null; r.phase = 'map'; r.opts = [{ type: 'event', id: 'arena' }]; B.Run.choose(r, 0); __bal.render(); })()`); await sleep(100);
  await click('[data-act=event][data-arg="0"]'); await sleep(100); await click('[data-act=leave]'); await sleep(150);
  ok(await ev(`/Next fight/.test((document.querySelector('.nextmod') || {}).textContent || '') && /legendary/.test(document.querySelector('.nextmod').textContent)`), 'the Arena challenge shows on the map as the next-fight modifier');
  await shot('09d-nextmod'); await noVScroll('map with a next-fight modifier');
  // review #18: the level-up screen (splash, gains, the 2 choices, the whole specialization path)
  await ev(`(() => { const r = __bal.run, h = r.heroes[0]; h.lvl = 3; h.specs = [B.HEROES[h.key].specs[0][1].id]; r.pending = [{ uid: h.uid, lvl: 3 }]; __bal.render(); })()`); await sleep(150);
  ok(await ev(`!!document.querySelector('.lufull') && document.querySelectorAll('.sp-row').length === 4 && !!document.querySelector('.sp-row.done .sp-n.on') && document.querySelectorAll('[data-act=spec]').length === 2`), 'level up: splash, 2 choices and the 4-step specialization path (the earlier pick marked)');
  await shot('07b-levelup'); await noVScroll('level up (forced)');
  await click('[data-act=spec]'); await sleep(100);
  await ev(`(() => { __bal.run.phase = 'over'; __bal.run.result = 'defeat'; __bal.render(); })()`); await sleep(100);
}

// ---- gauntlet: Rival's ghost is already stored; take a strong team past the last shop into the duels
if (!REMOTE) {
  await ev(`fetch('/api/elo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'enter', pid: 'b'.repeat(32), name: 'Rival', team: [{ key: 'bastion', lvl: 3, specs: [], items: ['warmog', 'longsword'], bonus: {}, pos: { c: 3, r: 4 } }], relics: ['feather'] }) })`);
  await click('[data-act=new-run]'); await sleep(150);
  await click('[data-act=start-pick]'); await click('[data-act=start-relic]'); await click('[data-act=start-go]'); await sleep(150);
  await ev(`(() => { const r = __bal.run; while (r.heroes.length < 3) B.Run.addHero(r, Object.keys(B.HEROES).find(k => !r.heroes.some(h => h.key === k)));
    r.heroes.forEach(h => { h.lvl = 5; h.specs = B.HEROES[h.key].specs.map(p => p[0].id); h.items = ['bloodthirster', 'warmog', 'deathcap', 'guardian']; }); r.heroes[0].items = ['obs_blade', 'obs_plate', 'obs_helm', 'mountainheart']; r.bag.push('worldsplitter', 'aegis', 'storm_boots');
    r.relics.push('drum'); r.step = B.Run.seqOf(r).length - 2; r.fightNo = 8; B.Run.advance(r); __bal.render(); })()`);
  ok(await ev(`__bal.run.phase === 'gauntlet' && !!document.querySelector('form[data-form=gauntlet]') && !document.querySelector('form[data-form=score]') && !/Onslaught/.test(document.body.textContent)`), 'after the last shop comes the Gauntlet (no Onslaught)');
  await shot('16-gauntlet-intro');
  // itemization v16: the team sheet with 3 heroes at Lv 5, a full set and items in the bag still fits the phone
  await click('[data-act=team]'); await sleep(250); await click('[data-act=bag]'); await sleep(150);
  ok(await ev(`document.querySelectorAll('.eqhero .doll').length === 3 && /Nightglass Guard\\s*3\\/3/.test(document.querySelector('#modal').textContent) && /Mythic weapon/i.test((document.querySelector('.idetail') || {}).textContent || '')`), 'team sheet: paper dolls, set bonus 3/3, the selected mythic item card (best rarity first)');
  await shot('16b-team-full'); await noHScroll('team sheet full'); await noVScroll('team sheet, 3 heroes with items');
  await click('[data-act=close]'); await sleep(100);
  await ev(`(() => { const f = document.querySelector('form[data-form=gauntlet]'); f.name.value = 'TestBot'; f.querySelector('button').click(); })()`); await sleep(900);
  ok(await ev(`__bal.run.g.status === 'match' && document.querySelector('.opp').textContent.includes('Rival')`), 'gauntlet round 1: a card shows the stored rival team');
  ok(await ev(`!!document.querySelector('.tower .floor.cur .token') && !!document.querySelector('.tower .floor.crown') && /Floor 1/.test(document.querySelector('.tower .floor.cur').textContent) && /Rival/.test(document.querySelector('.tower .floor.cur').textContent)`), 'review #16: the gauntlet tower: your token on floor 1 facing Rival, the crown on top');
  ok(await ev(`document.querySelectorAll('.opp .gitems img').length === 2 && document.querySelectorAll('.opp .relics img').length === 1 && __bal.run.g.opp.relics.includes('feather')`), "review #15: the ghost card shows the rival's items hero by hero and its relics");
  ok(await ev(`!__bal.run.g.history.some(h => h.reach || h.name === 'Reached the Gauntlet') && __bal.run.g.eloStart === __bal.run.g.elo`), 'review #24: reaching the gauntlet no longer moves the Elo');
  await shot('17-gauntlet-opponent'); await noHScroll('gauntlet card'); await noVScroll('gauntlet card');
  await click('[data-act=to-duel]'); await sleep(300);
  ok(await ev(`/Rival/.test(document.querySelector('.bhead').textContent) && __bal.run.cur.type === 'gauntlet'`), 'duel deploy screen');
  await shot('18-gauntlet-deploy');
  await click('[data-act=fight]'); await sleep(1200); await ev('__bal.skipBattle()');
  for (let k = 0; k < 80 && !(await ev(`[...document.querySelectorAll('.rewards2 .rw')].some(x => /Elo/.test(x.textContent))`)); k++) await sleep(100);
  ok(await ev(`[...document.querySelectorAll('.rewards2 .rw')].some(x => /Elo [0-9]+/.test(x.textContent) && /[+-][0-9]+/.test(x.textContent))`), 'duel result shows the Elo change (a reward chip)');
  await shot('18b-duel-result'); await noVScroll('duel result');
  await click('[data-act=result-ok]'); await sleep(200);
  const g = await ev(`({ phase: __bal.run.phase, status: __bal.run.g.status, wins: __bal.run.g.wins, elo: __bal.run.g.elo })`);
  ok(g.phase === 'over' && (g.status === 'champion' || g.status === 'lost'), `gauntlet ends (${g.status}, ${g.wins} win, Elo ${g.elo})`);
  await shot('19-gauntlet-over');
  ok(await ev(`!!document.querySelector('.tower') && (__bal.run.g.status === 'champion' ? !!document.querySelector('.floor.crown.cur .token') && !!document.querySelector('.floor.cleared') : !!document.querySelector('.floor.fell'))`), 'the final tower shows where the run ended (crown or the floor it fell on)');
  await noVScroll('gauntlet over');
  await click('[data-act=scores]');
  for (let k = 0; k < 30 && !(await ev(`!!document.querySelector('#modal table')`)); k++) await sleep(100);
  const ladder = await ev(`document.querySelector('#modal').textContent`);
  ok(ladder.includes('Rival') && ladder.includes('TestBot') && !/Onslaught/.test(ladder), 'Elo ladder lists the players' + (ladder.includes('Rival') && ladder.includes('TestBot') ? '' : ': ' + ladder.replace(/\s+/g, ' ').slice(0, 400)));
  // v27: the content Elo tabs are a Crown Shop unlock: locked first, then bought with crowns (two taps), and the King Tier
  await click('[data-act=ladder-tab][data-arg=hero]');
  for (let i = 0; i < 30 && !(await ev(`!!document.querySelector('#modal .klock')`)); i++) await sleep(100);
  ok(await ev(`/Crown Shop unlock/.test(document.querySelector('#modal .klock').textContent) && /🔒/.test(document.querySelector('[data-act=ladder-tab][data-arg=item]').textContent)`), 'v27: Heroes/Items/Relics tabs are locked without Content Elo');
  await ev(`fetch('/__dev/grant?pid=' + JSON.parse(localStorage.getItem('balance.pid')) + '&n=400')`); await sleep(200);
  await click('#modal .klock [data-act=shop]');
  for (let i = 0; i < 30 && !(await ev(`!!document.querySelector('#modal .wallet') && /40[0-9]/.test(document.querySelector('#modal .wallet').textContent)`)); i++) await sleep(100);
  ok(await ev(`document.querySelectorAll('#modal .crl').length === 5 && document.querySelectorAll('#modal .perk').length === 5 && !!document.querySelector('#modal .king') && !!document.querySelector('#refLink') && /[?]ref=[a-f0-9]{12}$/.test(document.querySelector('#refLink').value)`), 'Crown Shop: wallet, crowns per league, 5 perks (Double XP and Skip fights too), the King Tier and your invite link');
  await shot('23-crown-shop'); await noHScroll('crown shop');
  await click('[data-act=buy-perk][data-arg=elo]'); await sleep(150);
  ok(await ev(`/Tap again/.test(document.querySelector('[data-act=buy-perk][data-arg=elo]').textContent) && !__bal.acct.perks.includes('elo')`), 'the first tap only asks to confirm');
  await click('[data-act=buy-perk][data-arg=elo]'); await sleep(400);
  ok(await ev(`__bal.acct.perks.includes('elo') && __bal.acct.crowns === 400 - B.SHOP_ITEM.elo.price`), 'Content Elo bought');
  await click('[data-act=buy-perk][data-arg=king]'); await sleep(150); await click('[data-act=buy-perk][data-arg=king]'); await sleep(400);
  ok(await ev(`__bal.acct.perks.includes('king') && B.Render.skin === 'royal' && !!document.querySelector('.king.own [data-act=skin]')`), 'the King Tier: bought, the Royal board is on');
  await shot('24-king'); await noHScroll('king tier');
  await ev(`(() => { const f = document.querySelector('form[data-form=rename]'); f.name.value = 'Tester King'; f.querySelector('button').click(); })()`); await sleep(400);
  ok(await ev(`__bal.acct.name === 'Tester King' && __bal.acct.crowns === 400 - B.SHOP_ITEM.elo.price - B.SHOP_ITEM.king.price - B.SHOP_ITEM.rename.price`), 'a name change from the shop');
  await click('[data-act=close]'); await sleep(100); await ev('__bal.ACT.scores()'); await sleep(300);
  // review #14: a tab per kind of content with its own Elo
  const tab = async (k, n, extra, msg) => {
    await click(`[data-act=ladder-tab][data-arg=${k}]`);
    for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('#modal .ctbl') && document.querySelector('[data-act=ladder-tab].on').dataset.arg === '${k}'`)); i++) await sleep(100);
    const t = await ev(`(() => { const t = document.querySelector('#modal .ctbl'); return t ? { rows: t.querySelectorAll('tr').length - 1, rated: t.querySelectorAll('tr:not(.unrated)').length - 1, text: t.textContent } : null; })()`);
    ok(t && t.rows === n && t.rated >= 1 && /\d+%/.test(t.text) && extra(t.text), msg + (t ? ` (${t.rated} rated of ${t.rows})` : ''));
    await noHScroll(k + ' tab');
  };
  await tab('hero', await ev('Object.keys(B.HEROES).length + Object.keys(B.BOSSES).length'), x => /Bjornar/.test(x) && /Gorewarden/.test(x) && /Ashen Sovereign/.test(x), 'Heroes tab: every hero and both bosses listed (review #20), the played ones with Elo, fights and win rate');
  await shot('20-ladder-heroes');
  await tab('item', await ev('B.ITEMS.length'), x => /no combat effect/.test(x) && /not played yet/.test(x), 'Items tab: every item (no-combat items marked)');
  await tab('relic', await ev('B.RELICS.length'), x => /no combat effect/.test(x), 'Relics tab: every relic');
  await shot('21-ladder-relics');
  // review #21: the Player tab: league banners you can scroll, the path between the leagues
  await click('[data-act=ladder-tab][data-arg=player]');
  for (let i = 0; i < 30 && !(await ev(`!!document.querySelector('#lgscroll')`)); i++) await sleep(100);
  ok(await ev(`document.querySelectorAll('.lgb').length === 6 && document.querySelectorAll('.lgb.cur').length === 1 && document.querySelectorAll('.lgpath .pn').length === 6 && /Bronze|Silver/.test(document.querySelector('.pme').textContent) && document.querySelector('#lgscroll').scrollWidth > document.querySelector('#lgscroll').clientWidth`), 'Player tab: 6 league banners in a scrolling row, your league marked, the path between tiers');
  ok(await ev(`document.querySelectorAll('#roadmap .rmn').length === B.UNLOCKS.length && !!document.querySelector('.acctlv .lvb') && /Account level/.test(document.querySelector('.acctlv').textContent)`), 'v30: the Player tab shows the account level and the road of 18 rewards');
  await shot('22-player-tab'); await noHScroll('player tab');
  await click('[data-act=ladder-tab][data-arg=players]'); await sleep(400);
  ok(await ev(`/Tester King/.test(document.querySelector('#modal').textContent) && !!document.querySelector('#modal .kingmark') && document.querySelectorAll('#modal .tbl .plink').length >= 2`), 'back to the Ranking: the new name, a 👑 for the King, names link to profiles');
  // v27: tap a name, see the profile; a King also sees most played heroes, best win rate and the ghost record
  await ev(`[...document.querySelectorAll('#modal .plink')].find(b => b.textContent === 'Rival').click()`);
  for (let i = 0; i < 30 && !(await ev(`!!document.querySelector('#modal .prof')`)); i++) await sleep(100);
  ok(await ev(`(() => { const t = document.querySelector('#modal .prof').textContent; return /Rival/.test(t) && /Elo/.test(t) && /Best Gauntlet/.test(t) && /league/i.test(t) && !!document.querySelector('.pmore') && /Ghosts/.test(t) && /Most played/.test(t); })()`), "a player's profile: name, league, Elo, best Gauntlet; the King's view adds heroes and ghosts");
  await shot('25-profile'); await noHScroll('profile');
  await click('[data-act=close]');
  // your own profile from the start menu, and the opponent's name in the gauntlet opens theirs
  await click('#top [data-act=menu]'); await sleep(200); await click('.homeicons [data-act=my-profile]');
  for (let i = 0; i < 30 && !(await ev(`!!document.querySelector('#modal .prof')`)); i++) await sleep(100);
  ok(await ev(`/Tester King/.test(document.querySelector('#modal .pname').textContent) && !!document.querySelector('#modal .pname .kingmark') && !!document.querySelector('#modal .phl')`), 'your own profile from the start menu (King mark, most played heroes)');
  await shot('26-my-profile'); await noHScroll('my profile');
  await click('[data-act=close]');
}

// suggestion box: write several changes into the list, then ONE button sends them all for review
if (REMOTE) {
  await click('[data-act=suggest]'); await sleep(1800);
  ok(await ev(`!!document.querySelector('#sugStatus .review') && !!document.querySelector('form[data-form=draft]') && !!document.querySelector('[data-act=send-review]')`), 'live suggestion box loads with reviewer status');
  await shot('12-suggest-live'); await click('[data-act=close]');
} else {
  await click('[data-act=suggest]'); await sleep(600);
  const addNote = t => ev(`(() => { const f = document.querySelector('form[data-form=draft]'); f.text.value = ${JSON.stringify(t)}; f.querySelector('button').click(); })()`);
  await addNote('Please add a hero that <b>reflects</b> spells'); await addNote('Make the ghosts smarter'); await addNote('Pyra burn lasts 1s longer');
  await sleep(150);
  ok(await ev(`document.querySelectorAll('#drafts li').length === 3 && document.querySelector('[data-act=send-review]').textContent.includes('Send 3 changes')`), 'three notes wait in the list before sending');
  await ev(`document.querySelectorAll('[data-act=draft-del]')[2].click()`);
  ok(await ev(`document.querySelectorAll('#drafts li').length === 2`), 'a note can be removed from the list');
  ok(await ev(`(async () => { const r = await fetch('/api/suggest').then(r => r.json()); return r.list.length === 0; })()`), 'nothing is sent until the button is pressed');
  await ev(`document.querySelector('#sugName').value = 'Tester'`);
  await shot('12-suggest-list'); await noHScroll('suggest sheet');
  await click('[data-act=send-review]'); await sleep(900);
  ok(await ev(`(() => { const b = document.querySelector('#sugQueue .batch'); return !!b && b.querySelectorAll('.sug').length === 2 && b.textContent.includes('Tester') && b.innerHTML.includes('&lt;b&gt;reflects'); })()`), 'the 2 changes arrive as one review, text escaped');
  ok(await ev(`document.querySelectorAll('#drafts li').length === 0`), 'list is cleared after sending');
  await shot('13-suggest-sent');
  await click('[data-act=close]');

  // the page waits for that review, then says "ready, press F5"; after F5 it shows what shipped
  const batch = await ev(`JSON.parse(localStorage.getItem('balance.pending')).batch`);
  ok(await ev(`(() => { const n = document.querySelector('#notice'); return !n.hidden && n.className === 'wait' && n.textContent.includes('#' + ${batch}); })()`), 'top bar follows the review while it waits');
  await shot('14-notice-waiting');
  await ev(`fetch('/__dev/resolve?batch=${batch}')`); await ev(`__bal.poll()`); await sleep(300);
  ok(await ev(`(() => { const n = document.querySelector('#notice'); return n.className === 'ready' && /ready/.test(n.textContent) && /F5/.test(n.textContent); })()`), 'when Claude finishes: "Your changes are ready! Press F5"');
  await shot('15-notice-ready');
  await click('#notice'); await sleep(1800);
  ok(await ev(`(() => { const n = document.querySelector('#notice'); return !n.hidden && n.textContent.includes('is live: 2 applied'); })()`), 'after reloading, the bar says what went live');
  ok(await ev(`__bal.run && __bal.run.phase === 'over'`), 'the run survives the reload');
  await ev(`document.querySelector('#notice [data-act=notice-x]').click()`);
  ok(await ev(`document.querySelector('#notice').hidden && !localStorage.getItem('balance.pending')`), 'the bar can be dismissed');
  // somebody else's update ships while this page is open
  await ev(`__bal.poll()`); await sleep(200); await ev(`fetch('/__dev/ship')`); await sleep(50); await ev(`__bal.poll()`); await sleep(300);
  ok(await ev(`/just updated/.test(document.querySelector('#notice').textContent)`), 'other players get "the game was just updated"');
}

// ---- Art Lab (owner, 2026-09-29): attach a splash and a pose sheet, see them on the cards and in a test fight
if (!REMOTE) {
  const pic = async (file, js) => { const u = await ev(js); fs.writeFileSync(OUT + file, Buffer.from(u.split(',')[1], 'base64')); return OUT + file; };
  const sheet = await pic('art-sheet.png', `(() => { const c = document.createElement('canvas'); c.width = 880; c.height = 280; const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 880, 280);
    ['#2a6', '#26a', '#a62', '#aa2'].forEach((col, i) => { x.fillStyle = col; x.fillRect(50 + i * 210, 80, 90, 170); x.beginPath(); x.arc(95 + i * 210, 60, 34, 0, 7); x.fill(); if (i === 2) x.fillRect(140 + i * 210, 120, 60, 16); });
    return c.toDataURL('image/png'); })()`);
  const splashPic = await pic('art-splash.png', `(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 900, 600); g.addColorStop(0, '#f84'); g.addColorStop(1, '#48f'); x.fillStyle = g; x.fillRect(0, 0, 900, 600);
    x.fillStyle = '#fde'; x.beginPath(); x.arc(450, 200, 90, 0, 7); x.fill(); x.fillStyle = '#333'; x.fillRect(360, 300, 180, 300); return c.toDataURL('image/png'); })()`);
  const setFile = async (sel, file) => { const d = await send('DOM.getDocument', { depth: 0 }); const n = await send('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: sel }); await send('DOM.setFileInputFiles', { nodeId: n.result.nodeId, files: [file] }); };
  // review #47: the lab starts with no hero picked, so art can't go to the wrong hero by accident
  await ev(`__bal.ACT['art-lab']()`); await sleep(400);
  ok(await ev(`document.querySelector('#alHero').value === '' && /Choose the hero first/.test(document.querySelector('#alSplashView').textContent) && !B.ArtLab.state.fight`), 'Art Lab: no hero is picked for you');
  await click('[data-act=close]'); await sleep(200);
  await ev(`__bal.ACT['art-lab']('rook')`); await sleep(400);
  ok(await ev(`!!document.querySelector('.artlab') && document.querySelector('#alHero').value === 'rook' && !!document.querySelector('#alBoard')`), 'Art Lab opens on the chosen hero, with a test board');
  await setFile('#alSheet', sheet); await sleep(900);
  ok(await ev(`document.querySelectorAll('.alframes img').length === 4 && /One row: 4 poses/.test(document.querySelector('#alSheetView').textContent)`), 'a one-row sheet is cut into 4 poses (the detached bit joins its figure)');
  ok(await ev(`!!B.Art.sprite('rook') && B.Art.sprite('rook').anims.cast[0].naturalWidth > 0`), 'the poses are live on the board right away');
  const tpx = await ev(`(() => { const im = B.Art.sprite('rook').anims.idle[0], c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, 3, 3).data; return [d[3], x.getImageData(im.naturalWidth >> 1, im.naturalHeight - 5, 1, 1).data[3]]; })()`);
  ok(tpx[0] === 0 && tpx[1] === 255, 'the flat background turns transparent, the figure stays solid');
  await sleep(900);
  ok(await ev(`B.ArtLab.state.fight && B.ArtLab.state.fight.W.t > 5`), 'the test fight runs');
  // review #43 (David): an animation sheet, a labelled row per animation with several frames; every frame is used
  const anim = await pic('art-anim.png', `(() => { const c = document.createElement('canvas'); c.width = 1100; c.height = 760; const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 1100, 760);
    const rows = [['IDLE', 5], ['WALK', 6], ['ATTACK', 4], ['SPIN', 3]];
    rows.forEach(([label, n], r) => { x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText(label, 10, 60 + r * 185);
      for (let i = 0; i < n; i++) { const X = 150 + i * 150, Y = 20 + r * 185; x.fillStyle = 'hsl(' + (r * 90) + ',60%,45%)'; x.fillRect(X, Y + 40, 60, 110 - (i % 2) * 8); x.beginPath(); x.arc(X + 30, Y + 22, 22, 0, 7); x.fill(); x.fillRect(X + 60, Y + 60 + i * 6, 30, 12);
        if (r === 2 && i === 1) { x.strokeStyle = '#ff9fd2'; x.lineWidth = 9; x.beginPath(); x.arc(X + 110, Y + 90, 95, -2.2, -0.5); x.stroke(); } } });  // a swoosh that reaches the next frame (review #46)
    return c.toDataURL('image/png'); })()`);
  await setFile('#alSheet', anim); await sleep(1200);
  ok(await ev(`(() => { const a = B.Art.sprite('rook'); return !!a && a.anims.idle.length === 5 && a.anims.move.length === 6 && a.anims.attack.length === 4 && a.anims.cast.length === 3 && !a.anims.death; })()`), 'an animation sheet: 4 rows = idle 5, walk 6, attack 4, ability 3 frames, all kept (two attack frames glued by a swoosh are cut apart)');
  ok(await ev(`/4 animations, 18 frames; 4 labels or specks left out/.test(document.querySelector('#alSheetView').textContent) && document.querySelectorAll('.alframes img').length === 18`), 'the row labels are left out and every frame is shown');
  // review #45: each row can be told what it is; two rows can make one animation (a charge + a spin = the ability)
  await ev(`(() => { const s = document.querySelectorAll('.alrowsel'); s[3].value = 'attack'; s[3].dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500);
  ok(await ev(`(() => { const a = B.Art.sprite('rook'); return document.querySelectorAll('.alrowsel').length === 4 && a.anims.attack.length === 7 && !a.anims.cast && /Attack<.b> 7/.test(document.querySelector('#alSheetView').innerHTML); })()`), 'Art Lab: a row can be set to another animation, rows of the same animation are joined');
  await ev(`(() => { const s = document.querySelectorAll('.alrowsel'); s[3].value = 'cast'; s[3].dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(500);
  ok(await ev(`(() => { const a = B.Art.sprite('rook'), f = t => B.Art.frameOf(a, { t }); const s = new Set(); for (let t = 0; t < 1; t += 0.05) s.add(f(t).i); const m = B.Art.frameOf(a, { walk: 0.55 }), at = B.Art.frameOf(a, { atk: 0.99 }), mid = [0.05, 0.15, 0.25].map(t => f(t).blend); return s.size === 5 && m.k === 'move' && at.k === 'attack' && at.i >= 2 && mid.some(b => b > 0) && mid.some(b => b === 0); })()`), 'idle cycles through all its frames, walk and attack play theirs, frames hold then blend into the next');
  // review #47: frames packed with no space between them (each row one long strip) are cut by their pitch
  const packed = await pic('art-packed.png', `(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 430; const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 900, 430);
    [[9, 60], [7, 75]].forEach(([n, p], r) => { for (let i = 0; i < n; i++) { const X = 20 + i * p, Y = 20 + r * 210; x.fillStyle = 'hsl(' + (40 + r * 150) + ',60%,45%)'; x.beginPath(); x.arc(X + p / 2, Y + 28, 26, 0, 7); x.fill(); x.fillRect(X + 6, Y + 50, p - 10, 90); x.fillRect(X + 2, Y + 140, 14, 40); x.fillRect(X + p - 16, Y + 140, 14, 40); x.fillRect(X + p - 8, Y + 70, 10, 10); } });
    return c.toDataURL('image/png'); })()`);
  await setFile('#alSheet', packed); await sleep(1200);
  ok(await ev(`(() => { const a = B.Art.sprite('rook'); return !!a && a.anims.idle.length === 9 && a.anims.move.length === 7; })()`), 'a sheet with no space between the frames: 9 and 7 frames found by their pitch');
  await setFile('#alSheet', anim); await sleep(1200);
  // review #48: animated previews, one little stage per animation
  ok(await ev(`(() => { const cs = [...document.querySelectorAll('#alSheetView canvas.alprev')]; return cs.length === 4 && cs.every(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 16) if (d[i]) return true; return false; }); })()`), 'Art Lab: every animation plays in its own preview');
  // review #48: a sheet of cards (a pink tile per frame on a dark sheet, a title, row labels, one card hidden by a flash)
  const cardsheet = await pic('art-cards.png', `(() => { const c = document.createElement('canvas'); c.width = 760; c.height = 560; const x = c.getContext('2d'); x.fillStyle = '#23242b'; x.fillRect(0, 0, 760, 560);
    x.fillStyle = '#000'; x.fillRect(10, 8, 740, 34); x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif'; x.fillText('HERO SPRITESHEET', 20, 33);
    [['Idle', 6], ['Walk', 6], ['Attack', 5]].forEach(([label, n], r) => { const Y = 70 + r * 160; x.fillStyle = '#fff'; x.font = '16px sans-serif'; x.fillText(label, 14, Y - 6);
      for (let i = 0; i < n; i++) { const X = 14 + i * 120; x.fillStyle = '#b04c90'; x.fillRect(X, Y, 110, 140); x.fillStyle = '#f067ad'; x.fillRect(X + 3, Y + 3, 104, 134);
        if (r === 2 && i === 4) { const g = x.createRadialGradient(X + 55, Y + 70, 5, X + 55, Y + 70, 90); g.addColorStop(0, '#fff'); g.addColorStop(1, '#9cf'); x.fillStyle = g; x.fillRect(X + 3, Y + 3, 104, 134); continue; }
        x.fillStyle = '#3a2a4a'; x.beginPath(); x.arc(X + 50 + i * 2, Y + 30 + (r === 1 ? i % 2 * 4 : 0), 14, 0, 7); x.fill(); x.fillRect(X + 38 + i * 2, Y + 44, 24, 60); x.fillRect(X + 38, Y + 104, 9, 26); x.fillRect(X + 55, Y + 104, 9, 26); } });
    return c.toDataURL('image/png'); })()`);
  await setFile('#alSheet', cardsheet); await sleep(1400);
  ok(await ev(`(() => { const a = B.Art.sprite('rook'); return !!a && a.anims.idle.length === 6 && a.anims.move.length === 6 && a.anims.attack.length === 5 && a.anims.idle.every(i => i.naturalWidth === a.anims.idle[0].naturalWidth && i.naturalHeight === a.anims.idle[0].naturalHeight) && /cards/.test(document.querySelector('#alSheetView').textContent); })()`), 'a sheet of cards: every card is a frame (the flash card too), the frames of a row keep one size and place');
  await setFile('#alSheet', anim); await sleep(1200);
  await ev(`B.ArtLab.state.fight = null`); await sleep(900);
  ok(await ev(`B.ArtLab.state.fight && B.ArtLab.state.fight.W.t > 5`), 'the test fight runs with the animated hero');
  await setFile('#alSplash', splashPic); await sleep(900);
  ok(await ev(`document.querySelectorAll('.alcards img').length === 3 && [...document.querySelectorAll('.alcards img')].every(i => i.src.startsWith('data:image/jpeg'))`), 'the splash shows as list portrait, card and banner');
  const before = await ev(`document.querySelectorAll('.alcards img')[1].src.length`);
  await ev(`(() => { const r = document.querySelector('#alCz'); r.value = 200; r.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(200);
  ok(await ev(`document.querySelectorAll('.alcards img')[1].src.length !== ${before} && !!document.querySelector('#alCz')`), 'the zoom slider reframes the card and stays in place');
  await noHScroll('art lab');
  await shot('16-art-lab');
  await click('[data-act=al-keep]'); await sleep(200);
  ok(await ev(`JSON.parse(localStorage.getItem('balance.artlab')).rook.anims.idle.length === 5`), '"Use in my game" keeps it on this device');
  await ev(`document.querySelector('#alName').value = 'David'; document.querySelector('#alNote').value = 'Rook with my art'`);
  await click('[data-act=al-send]'); await sleep(900);
  ok(await ev(`/Sent! Review #[0-9]+/.test(document.querySelector('#toast').textContent)`), 'the pictures are sent for review with a note');
  // review #50: splash art for several heroes at once, matched by file name (or picked in the list)
  const sp = await ev(`(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#48c'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#fc8'; x.beginPath(); x.arc(300, 120, 60, 0, 7); x.fill(); return c.toDataURL('image/png'); })()`);
  for (const f of ['feuer.png', 'Snezhana_splash.png', 'mystery.png']) fs.writeFileSync(OUT + f, Buffer.from(sp.split(',')[1], 'base64'));
  { const d = await send('DOM.getDocument', { depth: 0 }); const n = await send('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: '#alBulk' }); await send('DOM.setFileInputFiles', { nodeId: n.result.nodeId, files: ['feuer.png', 'Snezhana_splash.png', 'mystery.png'].map(f => OUT + f) }); }
  await sleep(1200);
  ok(await ev(`(() => { const s = [...document.querySelectorAll('.albsel')]; return s.length === 3 && s.filter(x => x.value).length === 2 && s.some(x => x.value === 'pyra') && s.some(x => x.value === 'glacia'); })()`), 'Art Lab: several splashes at once, matched to heroes by file name');
  await ev(`(() => { const s = [...document.querySelectorAll('.albsel')].find(x => !x.value); s.value = 'lumen'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
  await click('[data-act=al-bulk-keep]'); await sleep(300);
  ok(await ev(`(() => { const L = JSON.parse(localStorage.getItem('balance.artlab')); return ['pyra', 'glacia', 'lumen'].every(k => L[k] && L[k].splash && L[k].splash.startsWith('data:image/jpeg')) && !!L.rook.anims; })()`), '"Use all in my game" keeps every matched splash (and the art already kept for others)');
  await click('[data-act=al-bulk-send]'); await sleep(900);
  ok(await ev(`/Sent! Review #[0-9]+: splash art for 3 heroes/.test(document.querySelector('#toast').textContent) && !document.querySelector('.albrow')`), 'the splashes go for review in one send');
  await ev(`(() => { const L = JSON.parse(localStorage.getItem('balance.artlab')); for (const k of ['pyra', 'glacia', 'lumen']) delete L[k]; localStorage.setItem('balance.artlab', JSON.stringify(L)); ['pyra', 'glacia', 'lumen'].forEach(k => B.Art.reset(k)); })()`);
  await click('[data-act=close]'); await sleep(300);
  ok(await ev(`!!B.Art.sprite('rook') && B.Splash.image('rook', 44, 44, 'bust').startsWith('data:image/jpeg')`), 'after closing the lab the kept art is used across the game');
  await ev(`__bal.ACT['art-lab']('rook')`); await sleep(300); await click('[data-act=al-drop]'); await sleep(200); await click('[data-act=close]'); await sleep(200);
  ok(await ev(`!B.Art.sprite('rook') && !JSON.parse(localStorage.getItem('balance.artlab') || '{}').rook && !B.Splash.image('rook', 44, 44, 'bust').startsWith('data:image/jpeg')`), '"Remove from my game" brings the drawn art back');
}

ok(errors.length === 0, 'no JS errors / CSP violations' + (errors.length ? ': ' + errors.slice(0, 5).join(' || ') : ''));
console.log(`telas: ${oks} ok, ${fails} fail (screens in ${OUT})`);
try { ws.close(); } catch (_) {}
chrome.kill(); if (server) server.kill();
process.exit(fails ? 1 : 0);
