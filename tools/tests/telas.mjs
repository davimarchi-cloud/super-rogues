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

// new run, pick 2 heroes
await click('[data-act=new-run]'); await sleep(200);
const picks = await ev(`[...document.querySelectorAll('[data-act=start-pick]')].length`);
ok(picks === 3, 'start offers 3 heroes side by side');
const fmtOut = await ev(`__bal.fmt('<b>x</b> deals 20% magic damage and stuns for 1.5s')`);
ok(/&lt;b&gt;/.test(fmtOut) && /class="num">20%/.test(fmtOut) && /kw-ap/.test(fmtOut) && /kw-cc/.test(fmtOut) && /class="dur">1.5s/.test(fmtOut), 'review #10: descriptions colour terms, bold numbers, italic durations, and stay escaped');
ok(await ev(`document.querySelectorAll('.detail .stat').length >= 6`), 'stat chips on the hero detail');
await click('[data-act=start-pick]'); await ev(`document.querySelectorAll('[data-act=start-pick]')[1].click()`);
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
  if (await ev(`!!document.querySelector('[data-act=result-ok]')`)) { if (fightsSeen === 1) { await sleep(900); await shot('06-result'); await noVScroll('result'); } await click('[data-act=result-ok]'); await sleep(100); continue; }
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
      await shot('08b-team'); await noHScroll('team sheet'); await noVScroll('team sheet'); await click('[data-act=close]'); await sleep(100);
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
    }
    await click('[data-act=skip]');
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
  ok(await ev(`__bal.run.eloEnd === 984 && /Elo/.test(document.querySelector('#screen').textContent) && /984/.test(document.querySelector('#top').textContent)`), 'no hearts: the lost fight ended the run and cost Elo (review #14: loss vs 1000, 1000 -> 984)');
}

// ---- review #17: events, forced so every test run sees one: 3 choices, a targeted choice with its picker, the result,
// and a next-fight modifier shown on the map
if (!REMOTE) {
  await click('[data-act=new-run]'); await sleep(150);
  await click('[data-act=start-pick]'); await ev(`document.querySelectorAll('[data-act=start-pick]')[1].click()`); await click('[data-act=start-go]'); await sleep(150);
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
  await click('[data-act=start-pick]'); await ev(`document.querySelectorAll('[data-act=start-pick]')[1].click()`); await click('[data-act=start-go]'); await sleep(150);
  await ev(`(() => { const r = __bal.run; B.Run.addHero(r, Object.keys(B.HEROES).find(k => !r.heroes.some(h => h.key === k)));
    r.heroes.forEach(h => { h.lvl = 5; h.specs = B.HEROES[h.key].specs.map(p => p[0].id); h.items = ['bloodthirster', 'warmog', 'deathcap', 'guardian']; }); r.heroes[0].items = ['obs_blade', 'obs_plate', 'obs_helm', 'mountainheart']; r.bag.push('worldsplitter', 'aegis', 'storm_boots');
    r.relics.push('drum'); r.step = B.CFG.seq.length - 2; r.fightNo = 6; B.Run.advance(r); __bal.render(); })()`);
  ok(await ev(`__bal.run.phase === 'gauntlet' && !!document.querySelector('form[data-form=gauntlet]') && !document.querySelector('form[data-form=score]') && !/Onslaught/.test(document.body.textContent)`), 'after the last shop comes the Gauntlet (no Onslaught)');
  await shot('16-gauntlet-intro');
  // itemization v16: the team sheet with 3 heroes at Lv 5, a full set and items in the bag still fits the phone
  await click('[data-act=team]'); await sleep(250); await click('[data-act=bag]'); await sleep(150);
  ok(await ev(`document.querySelectorAll('.eqhero .doll').length === 3 && /Obsidian Guard\\s*3\\/3/.test(document.querySelector('#modal').textContent) && /Mythic weapon/i.test((document.querySelector('.idetail') || {}).textContent || '')`), 'team sheet: paper dolls, set bonus 3/3, the selected mythic item card (best rarity first)');
  await shot('16b-team-full'); await noHScroll('team sheet full'); await noVScroll('team sheet, 3 heroes with items');
  await click('[data-act=close]'); await sleep(100);
  await ev(`(() => { const f = document.querySelector('form[data-form=gauntlet]'); f.name.value = 'TestBot'; f.querySelector('button').click(); })()`); await sleep(900);
  ok(await ev(`__bal.run.g.status === 'match' && document.querySelector('.opp').textContent.includes('Rival')`), 'gauntlet round 1: a card shows the stored rival team');
  ok(await ev(`!!document.querySelector('.tower .floor.cur .token') && !!document.querySelector('.tower .floor.crown') && /Floor 1/.test(document.querySelector('.tower .floor.cur').textContent) && /Rival/.test(document.querySelector('.tower .floor.cur').textContent)`), 'review #16: the gauntlet tower: your token on floor 1 facing Rival, the crown on top');
  ok(await ev(`document.querySelectorAll('.opp .gitems img').length === 2 && document.querySelectorAll('.opp .relics img').length === 1 && __bal.run.g.opp.relics.includes('feather')`), "review #15: the ghost card shows the rival's items hero by hero and its relics");
  ok(await ev(`/Reached the Gauntlet\\s*\\+\\d+/.test(document.querySelector('#screen').textContent) && __bal.run.g.history[0].win`), 'review #14: reaching the gauntlet shows as an Elo win');
  await shot('17-gauntlet-opponent'); await noHScroll('gauntlet card'); await noVScroll('gauntlet card');
  await click('[data-act=to-duel]'); await sleep(300);
  ok(await ev(`/Rival/.test(document.querySelector('.bhead').textContent) && __bal.run.cur.type === 'gauntlet'`), 'duel deploy screen');
  await shot('18-gauntlet-deploy');
  await click('[data-act=fight]'); await sleep(1200); await click('[data-act=skip]');
  for (let k = 0; k < 80 && !(await ev(`!!document.querySelector('.elo-line')`)); k++) await sleep(100);
  ok(await ev(`/Elo/.test(document.querySelector('.elo-line').textContent)`), 'duel result shows the Elo change');
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
  // review #14: a tab per kind of content with its own Elo
  const tab = async (k, n, extra, msg) => {
    await click(`[data-act=ladder-tab][data-arg=${k}]`);
    for (let i = 0; i < 40 && !(await ev(`!!document.querySelector('#modal .ctbl') && document.querySelector('[data-act=ladder-tab].on').dataset.arg === '${k}'`)); i++) await sleep(100);
    const t = await ev(`(() => { const t = document.querySelector('#modal .ctbl'); return t ? { rows: t.querySelectorAll('tr').length - 1, rated: t.querySelectorAll('tr:not(.unrated)').length - 1, text: t.textContent } : null; })()`);
    ok(t && t.rows === n && t.rated >= 1 && /\d+%/.test(t.text) && extra(t.text), msg + (t ? ` (${t.rated} rated of ${t.rows})` : ''));
    await noHScroll(k + ' tab');
  };
  await tab('hero', await ev('Object.keys(B.HEROES).length'), x => /Bastion/.test(x), 'Heroes tab: every hero listed, the played ones with Elo, fights and win rate');
  await shot('20-ladder-heroes');
  await tab('item', await ev('B.ITEMS.length'), x => /no combat effect/.test(x) && /not played yet/.test(x), 'Items tab: every item (no-combat items marked)');
  await tab('relic', await ev('B.RELICS.length'), x => /no combat effect/.test(x), 'Relics tab: every relic');
  await shot('21-ladder-relics');
  await click('[data-act=ladder-tab][data-arg=players]'); await sleep(400);
  ok(await ev(`/TestBot/.test(document.querySelector('#modal').textContent)`), 'back to the Players tab');
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

ok(errors.length === 0, 'no JS errors / CSP violations' + (errors.length ? ': ' + errors.slice(0, 5).join(' || ') : ''));
console.log(`telas: ${oks} ok, ${fails} fail (screens in ${OUT})`);
try { ws.close(); } catch (_) {}
chrome.kill(); if (server) server.kill();
process.exit(fails ? 1 : 0);
