// UI: DOM screens + battle loop. No inline handlers (CSP): every button has data-act, handled by one listener.
(function () {
  const { Run, Sim, Render, Net, HEROES, ITEM, RELIC, EVENT, CFG } = B;
  const I = (n, c) => B.UI ? B.UI.i(n, c) : '';   // v49 (review #61): the interface icons (js/uiicons.js)
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const SAVE = 'balance.run.v1';
  let run = store.get(SAVE, null);
  let screen = 'title';
  let battle = null, view = null, preview = null;
  const ui = { startPick: [], gsel: null, selUid: 0, info: null, result: null, speed: store.get('balance.speed', 1), drag: null, modal: null };
  const save = () => { if (run) store.set(SAVE, run); };
  // player identity for Elo (reviews #3 #4): a random id kept in this browser
  function pid() {
    let id = store.get('balance.pid', '');
    if (!/^[a-f0-9]{32}$/.test(id)) { const a = new Uint8Array(16); crypto.getRandomValues(a); id = [...a].map(x => x.toString(16).padStart(2, '0')).join(''); store.set('balance.pid', id); }
    return id;
  }
  const myName = () => store.get('balance.name', '') || '';
  const setElo = (r, quiet) => { if (r && r.elo != null) store.set('balance.elo', r.elo); if (r && r.league != null) store.set('balance.league', { league: r.league, lp: r.lp }); setAcct(r, quiet); };
  // v27 (owner + review #25 by David): the account. Crowns (earned the first time you reach a league each season, and
  // from invited friends), Crown Shop unlocks, the King Tier, profiles and the invite link. The server is the source of
  // truth (api/player.js); this cache only decides what to show before it answers.
  const ACCT = 'balance.acct';
  const acct = Object.assign({ account: false, crowns: 0, perks: [] }, store.get(ACCT, null) || {});
  const hasPerk = id => B.hasPerk(acct.perks, id);
  const isDefaultName = n => !n || /^Player [a-f0-9]{4}$/.test(n);
  const ACCT_KEYS = ['axp', 'level', 'cleared', 'pfloor', 'bosses', 'crowns', 'perks', 'name', 'code', 'league', 'lp', 'season', 'sreach', 'seasonEnds', 'refs', 'refCrowns', 'titles', 'best', 'elo', 'runs', 'peakLeague', 'lastLeague', 'account'];
  function setAcct(r, quiet) {
    if (!r || typeof r !== 'object') return;
    for (const k of ACCT_KEYS) if (r[k] != null) acct[k] = r[k];
    if (r.code) acct.account = true;
    store.set(ACCT, acct); if (acct.account) store.del('balance.ref');
    if (Array.isArray(r.xp) && r.xp.length && !quiet) xpToast(r.xp);
    applySkin();
  }
  // v30 (review #28, PC boy): account XP and level. A toast for what was earned; a level up names what it unlocked
  const unlockName = u => (u.kind === 'hero' ? HEROES[u.id] : u.kind === 'item' ? ITEM[u.id] : RELIC[u.id]).name;
  function xpToast(list) {
    const n = list.reduce((a, g) => a + g.xp, 0), up = list.filter(g => g.up).pop();
    const u = up && B.UNLOCKS.find(x => x.lvl === up.level);
    clearTimeout(xpToast.h); xpToast.h = setTimeout(() => toast(`✨ +${n} XP` + (list.length === 1 ? ` (${list[0].why})` : '') + (up ? ` · Level ${up.level}!${u ? ` New ${u.kind}: ${unlockName(u)}` : ''}` : '')), 700);
  }
  const lvlNow = () => B.levelOf(acct.axp || 0);
  // v46 (review #57, David: "Bring the player xp progression to the forefront of the game ... visually show progress after
  // each run with looming rewards. It should be a rewarding dopamine hit and encourage playing again"): the title shows
  // your level, its bar and the next reward; every game keeps the XP it earned (run.xpLog) and the game-over screen fills
  // the bar line by line (level ups burst with confetti) and ends on the next reward waiting for you
  const unlockPic = (u, px) => u.kind === 'hero' ? img(u.id, px, 'por') : ico(u.kind, u.id, px);
  const nextUnlock = lvl => B.UNLOCKS.find(u => u.lvl > lvl) || null;
  const capFirst = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
  function logGameXp(r) { if (run && r && Array.isArray(r.xp) && r.xp.length) { (run.xpLog = run.xpLog || []).push(...r.xp.map(g => ({ why: g.why, xp: g.xp | 0, k: g.k || 'first' }))); } }
  function levelCardHTML() {
    const L = B.levelProgress(acct.axp || 0), u = nextUnlock(L.lvl);
    return `<button class="lvcard" data-act="player-tab" aria-label="Account level ${L.lvl}: see the rewards">
      <span class="lvb">${L.lvl}</span>
      <span class="lvm"><b>Level ${L.lvl}</b><span class="xpbar big"><i style="width:${Math.round(100 * L.into / L.need)}%"></i></span><small>${L.into}/${L.need} XP${u ? ` · next: <b>${esc(unlockName(u))}</b>` : ""}</small></span>
      ${u ? `<span class="lvnext" title="Level ${u.lvl}: ${esc(unlockName(u))}">${unlockPic(u, 40)}<i>🔒</i><small>Lv ${u.lvl}</small></span>` : '<span class="lvnext done">✓</span>'}
    </button>`;
  }
  const XP_ICON = { game: I('gamepad'), fight: I('swords'), boss: I('skull'), reach: I('trophy'), duel: I('sword'), champ: I('crown'), first: I('star'), crowns: I('gem') };
  const XP_ORDER = ['game', 'fight', 'boss', 'reach', 'duel', 'champ', 'first', 'crowns'];
  const XP_NAME = { game: 'Played', reach: 'Gauntlet', champ: 'Crown', first: 'Firsts', crowns: 'Crowns spent' };
  function xpChips(log) {
    const by = {};
    for (const g of log) { const c = by[g.k] = by[g.k] || { k: g.k, xp: 0, n: 0, why: [] }; c.xp += g.xp; c.n++; c.why.push(capFirst(g.why)); }
    return XP_ORDER.concat(Object.keys(by).filter(k => !XP_ORDER.includes(k))).filter(k => by[k]).map(k => { const c = by[k];
      c.name = XP_NAME[k] || (c.n === 1 ? c.why[0].replace(/ beaten$/, '').replace(/ won$/, '') : k === 'duel' ? c.n + ' duels' : capFirst(k)); return c; });
  }
  function xpPanelHTML() {
    const log = run.xpLog || [], got = log.reduce((a, g) => a + g.xp, 0), to = acct.axp || 0, from = Math.max(0, to - got);
    const A = B.levelProgress(from), Z = B.levelProgress(to), done = !!run.xpShown || !log.length, S = done ? Z : A, u = nextUnlock(Z.lvl);
    const ups = B.UNLOCKS.filter(x => x.lvl > A.lvl && x.lvl <= Z.lvl);
    const note = run.xpWait ? 'Counting your XP…' : run.xpErr ? 'Your XP could not be saved (no connection).' : '';
    return `<div class="xppanel ${done ? '' : 'pre'}" id="xppanel" data-from="${from}" data-to="${to}">
      <div class="xph"><span class="lvb" id="xplv">${S.lvl}</span><div class="xpm"><b>Level <span id="xplv2">${S.lvl}</span></b>
        <span class="xpbar big"><i id="xpfill" style="width:${Math.round(100 * S.into / S.need)}%"></i></span><small id="xpnum">${S.into}/${S.need} XP</small></div>
        <b class="xpgot" id="xpgot">+${done ? got : 0}</b></div>
      ${log.length ? `<ul class="xplines">${xpChips(log).map(c => `<li data-xp="${c.xp}" title="${esc(c.why.join(' · '))}"><i>${XP_ICON[c.k] || '✨'}</i><span>${esc(c.name)}</span><b>+${c.xp}</b></li>`).join('')}</ul>` : note ? `<p class="small center">${note}</p>` : ''}
      ${ups.length ? `<div class="xpups ${ups.length > 2 ? 'many' : ''}">${ups.map(x => `<div class="xpup" data-lvl="${x.lvl}">${unlockPic(x, 34)}<span><small>New ${x.kind}!</small><b>${esc(unlockName(x))}</b></span></div>`).join('')}</div>` : ''}
      ${u ? `<div class="xpnext">${unlockPic(u, 48)}<span><small>Next reward · level ${u.lvl}</small><b>${esc(unlockName(u))}</b><i>${B.xpForLevel(u.lvl) - to} XP to go</i></span><em>🔒</em></div>` : '<p class="small center">🏅 Every reward unlocked!</p>'}
    </div>`;
  }
  async function animXp() {
    const el = $('#xppanel'); if (!el || run.xpShown || !(run.xpLog || []).length) return;
    run.xpShown = true; save();
    const wait = ms => new Promise(r => setTimeout(r, B.Juice && B.Juice.reduced() ? 0 : ms));
    const fill = $('#xpfill'), num = $('#xpnum'), lv = $('#xplv'), lv2 = $('#xplv2'), gotEl = $('#xpgot');
    let cur = +el.dataset.from, got = 0;
    await wait(350);
    el.classList.remove('pre');
    for (const li of el.querySelectorAll('.xplines li')) {
      if (!li.isConnected) return;
      li.classList.add('in'); sfx('coin');
      let left = +li.dataset.xp;
      while (left > 0) {
        const L = B.levelProgress(cur), room = L.need - L.into, step = Math.min(left, room), ms = 220 + Math.round(520 * step / L.need);
        fill.style.transition = `width ${ms}ms ease-out`; fill.style.width = (step === room ? 100 : Math.round(100 * (L.into + step) / L.need)) + '%';
        if (B.Juice) B.Juice.countUp(num, L.into, L.into + step, ms, v => v + '/' + L.need + ' XP');
        await wait(ms + 40); cur += step; left -= step;
        if (step === room) {   // a level up: the badge bumps, confetti, the reward it unlocked pops in
          const N = B.levelProgress(cur); lv.textContent = lv2.textContent = N.lvl; sfx('levelup');
          if (B.Juice) { B.Juice.bump(lv); B.Juice.confettiAt(lv, 60); }
          const card = el.querySelector(`.xpup[data-lvl="${N.lvl}"]`); if (card) card.classList.add('in');
          fill.style.transition = 'none'; fill.style.width = '0%'; num.textContent = '0/' + N.need + ' XP';
          await wait(420);
        }
      }
      if (B.Juice) B.Juice.countUp(gotEl, got, got + +li.dataset.xp, 300, v => '+' + v); got += +li.dataset.xp;
      await wait(140);
    }
    const nx = el.querySelector('.xpnext'); if (nx) { nx.classList.add('loom'); sfx('star'); }
  }
  async function loadAcct() { try { setAcct(await Net.post('player', { op: 'me', pid: pid() })); } catch (_) {} }
  const refCode = () => store.get('balance.ref', '') || undefined;
  // the King Tier's Royal board (on by default for Kings; they can switch back to the classic stone)
  function applySkin() { if (B.Render) B.Render.skin = hasPerk('king') && store.get('balance.skin', 'royal') === 'royal' ? 'royal' : null; }
  // a player's name anywhere in the game opens their profile
  const plink = (name, code) => code ? `<button class="plink" data-act="profile" data-arg="${esc(code)}" title="Open profile">${esc(name)}</button>` : esc(name);
  const crowns = n => `<span class="crn">👑 ${n | 0}</span>`;
  // review #21 (David): leagues. A shield in the league's colours; pips for Bronze..Platinum, a gem for Diamond, a star
  // for Celestial.
  let embN = 0;
  function emblem(i, px) {
    const l = B.LEAGUES[i] || B.LEAGUES[0], g = 'lg' + (++embN);
    const mark = i >= 5 ? '<path d="M32 18 l4 9 10 1 -7.5 6.5 2.5 10 -9-5.5 -9 5.5 2.5-10 -7.5-6.5 10-1z" fill="#fff" opacity=".92"/>'
      : i === 4 ? '<path d="M32 18 l10 11 -10 16 -10-16z" fill="#fff" opacity=".9"/><path d="M22 29h20" stroke="#3f7dff" stroke-width="1.5"/>'
      : Array.from({ length: i + 1 }, (_, k) => { const x = 32 + (k - i / 2) * 8; return `<circle cx="${x}" cy="32" r="3.2" fill="#fff" opacity=".92"/>`; }).join('');
    return `<svg class="lgem" width="${px}" height="${px}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.hi}"/><stop offset="1" stop-color="${l.color}"/></linearGradient></defs>
      <path d="M32 4 L56 12 V30 C56 45 45 55 32 60 C19 55 8 45 8 30 V12 Z" fill="url(#${g})" stroke="#0c0d11" stroke-width="3"/>
      <path d="M32 11 L49 17 V30 C49 41 41 48 32 52 C23 48 15 41 15 30 V17 Z" fill="none" stroke="#ffffff66" stroke-width="2"/>${mark}</svg>`;
  }
  const leagueName = i => (B.LEAGUES[i] || B.LEAGUES[0]).name;
  function leagueProgress(lg) { const top = B.LEAGUES.length - 1; return lg.league >= top ? `${lg.lp} point${lg.lp === 1 ? '' : 's'}` : `${lg.lp}/${B.LEAGUE_RULES.step}`; }
  function leagueLine(lg) {
    if (!lg) return '';
    const d = lg.delta, when = lg.promoted ? `<div class="promo" style="--lc:${B.LEAGUES[lg.league].color}">${emblem(lg.league, 44)}<b>Promoted to ${leagueName(lg.league)}!</b></div>` : '';
    return `${when}<p class="lgline">${emblem(lg.league, 20)}<span class="${d > 0 ? 'win' : d < 0 ? 'lose' : 'dim'}">${d > 0 ? '+' : ''}${d} league point${Math.abs(d) === 1 ? '' : 's'}</span><span class="dim">· ${leagueName(lg.league)} ${leagueProgress(lg)}</span></p>`;
  }

  const MOB_ABIL = {
    smash: 'Smash: a heavy blow that stuns its target.', mend: 'Mend: heals the weakest ally.', explode: 'Explodes when next to an enemy.',
    wall: 'Shield Wall: shields nearby allies.', curse: 'Curse: damages, silences and slows.', slam: 'Slam: stuns everything adjacent.',
    imps: 'Summons two imps.', cleave: 'Cleave: hits and stuns everything adjacent.', nova: 'Void Nova: stuns everything within 2 hexes.',
  };
  // review #12: every portrait is splash art (bust for small squares, full figure for banners)
  const por = (key, px = 44, full) => full ? B.Splash.image(key, px, Math.round(px * 1.3), 'full') : B.Splash.image(key, px, px, 'bust');
  const img = (key, px, cls = 'por') => `<img class="${cls}" src="${por(key, px)}" alt="">`;
  const EMBLEM = '<svg class="emblem" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M32 9v45M20 56h24M9 17h46"/><path d="M9 17 3 35M9 17l6 18M55 17l-6 18M55 17l6 18"/></g><path d="M1 35a8 6 0 0 0 16 0zM47 35a8 6 0 0 0 16 0z" fill="currentColor"/><circle cx="32" cy="8" r="4" fill="currentColor"/></svg>';
  const ico = (kind, id, px = 36, cls = 'ico') => `<img class="${cls}" src="${kind === 'item' ? B.Icons.item(id, px) : B.Icons.relic(id, px)}" alt="">`;
  // review #10 (David): readable at a glance. fmt() colours game terms and bolds numbers in any description;
  // durations ("1.5s") are italic. It tokenises the RAW text and escapes every piece, so it is XSS-safe.
  const KW = [
    ['kw-atk', 'attack speed|attacks?|physical|damage|AD'], ['kw-ap', 'magic damage|magic|ability power|abilities|ability|AP'],
    ['kw-def', 'magic resist|armor|MR|shields?|invulnerable|untargetable|dodge'], ['kw-hp', 'max HP|HP|heals?|healing|healed|regenerates?|regen|lifesteal|revives?|resurrect\\w*'],
    ['kw-cc', 'stuns?|stunned|stunning|freezes?|frozen|freeze|roots?|slows?|slowed|silence[sd]?|taunts?|pulls?|knock\\w*'],
    ['kw-dot', 'burns?|burning|burn|poisons?|poison|bleed'], ['kw-crit', 'crit chance|crit damage|critical|crits?'],
    ['kw-mana', 'mana'], ['kw-gold', 'gold'], ['kw-xp', 'XP|level'], ['kw-move', 'move speed|range|hex(?:es)?'],
  ];
  const KW_RE = new RegExp('([+\\-−]?\\d+(?:\\.\\d+)?(?:%|x|s\\b)?)|\\b(' + KW.map(k => k[1]).join('|') + ')\\b', 'gi');
  const KW_CLS = w => { for (const [c, re] of KW) if (new RegExp('^(?:' + re + ')$', 'i').test(w)) return c; return ''; };
  function fmt(text) {
    const t = String(text == null ? '' : text); let out = '', last = 0, m;
    KW_RE.lastIndex = 0;
    while ((m = KW_RE.exec(t))) {
      out += esc(t.slice(last, m.index)); last = m.index + m[0].length;
      if (m[1]) out += /\ds$/.test(m[1]) ? `<em class="dur">${esc(m[1])}</em>` : `<b class="num">${esc(m[1])}</b>`;
      else out += `<span class="${KW_CLS(m[2])}">${esc(m[2])}</span>`;
    }
    return out + esc(t.slice(last));
  }
  // stat chips: coloured, with a symbol, instead of "HP 600 · ATK 58 · ..."
  function chips(d, full) {
    const c = (cls, sym, v, tip) => `<span class="stat ${cls}" title="${tip}"><i>${sym}</i>${v}</span>`;
    return `<span class="stats-row">${c('s-hp', '❤', d.hp, 'Health')}${c('s-atk', '⚔', d.atk, 'Attack (AD): physical abilities deal a % of it')}${full ? c('s-ap', '✦', d.ap, 'Ability power (AP): magic abilities, burns and heals deal a % of it. 100 at Lv 1, +30 per level') : ''}${c('s-arm', '⛨', d.armor, 'Armor')}${c('s-mr', '◈', d.mr, 'Magic resist')}${c('s-as', '»', d.as, 'Attacks per second')}${c('s-rng', '➶', d.range, 'Range (hexes)')}${d.crit ? c('s-crit', '✸', d.crit, 'Crit chance') : ''}${d.dodge ? c('s-dodge', '↯', d.dodge, 'Dodge') : ''}</span>`;
  }
  const pct = x => Math.round(x * 100) + '%';
  // review #19 (David: "not clear how hero abilities scale with AP, attack etc.") and review #26 (David: "abilities
  // should clearly scale with AD or AP or both, AP not a multiplier"): how every ability is computed in js/sim.js, part
  // by part. P = % of AD (attack) as physical damage; M = % of AP as magic damage; MX = [% of AD, % of AP] added, as magic
  // damage; A = % of AD as magic damage; B = burn per second, % of AP, for 3s; BA = the same with AD; H = heal, % of AP;
  // X = heal, % of own max HP; S = shield, % of own max HP; D = % of the target's max HP per second; Z = a sentence.
  const lvF = d => 1 + 0.15 * ((d.lvl || 1) - 1);
  const SCALE = {
    bulwark: ab => [['S', ab.shield, 'on himself'], ab.allyShield && ['Z', `allies within 2 hexes get a shield of ${pct(ab.shield * ab.allyShield)} of his max HP`], ab.burst && ['Z', `adjacent enemies take ${pct(ab.burst)} of the shield as magic damage`]],
    shadowstep: ab => [['P', ab.dmg, 'to the weakest enemy, can crit']],
    fireball: ab => [['M', ab.dmg, `to every enemy in ${ab.radius} hex`], ['B', ab.burn, 'burn']],
    blizzard: ab => [['M', ab.dmg, 'to the frozen group'], ab.iceArmor && ['S', ab.iceArmor, 'on her and the weakest ally']],
    charge: ab => [['P', ab.dmg, 'to the enemies hit']],
    radiance: ab => [['H', ab.heal, 'the weakest ally'], ['H', ab.splash, 'allies next to it'], ab.smite && ['M', ab.smite, 'smite']],
    volley: ab => [['P', ab.dmg, `per arrow, ${ab.count} arrows, can crit`]],
    overcharge: ab => [['M', ab.dmg, 'per second to the enemy in a beam'], ['H', ab.heal, 'per second to the hurt ally in a beam'], ['Z', `Overcharge: x${ab.mult} for ${ab.dur}s and +${ab.extra} beam`]],   // v60
    garrison: ab => [['Z', d => `footman: ${Math.round(ab.fhp * (1 + ab.vet) * d.ap)} HP and ${Math.round(ab.fatk * (1 + ab.vet) * d.ap)} attack; archer: ${Math.round(ab.ahp * (1 + ab.vet) * d.ap)} HP and ${Math.round(ab.aatk * (1 + ab.vet) * d.ap)} attack`]],   // v60
    raise: ab => [['Z', d => `each skeleton: ${Math.round(3 * d.ap * ab.hpMul)} HP (${pct(3 * ab.hpMul)} AP) and ${Math.round(0.3 * d.ap)} attack (30% AP)`], ab.explode && ['M', ab.explode, 'when a skeleton dies, 1 hex']],
    chain: ab => [['M', ab.dmg, `per bounce, ${ab.bounces} enemies, ${pct(ab.falloff)} less each bounce`]],
    hook: ab => [['P', ab.dmg, 'to the pulled enemy']],
    mirror: ab => [['Z', d => `each clone: ${pct(ab.stat)} of her HP, attack and armor (${Math.round(d.hp * ab.stat)} HP, ${Math.round(d.atk * ab.stat)} attack)`]],
    turret: ab => [['Z', d => `each turret: ${Math.round(340 * lvF(d) * ab.hpMul)} HP and 80% of his AD as attack (${Math.round(0.8 * d.atk)})`]],
    whirl: ab => [['P', ab.dmg, 'to every adjacent enemy'], ['Z', `heals ${pct(ab.heal)} of the damage dealt`]],
    consecrate: ab => [['M', ab.dps, `per second to enemies on the ground, ${ab.dur}s`], ['Z', `allies on it heal ${pct(ab.heal)} of their max HP per second`]],
    eclipse: ab => [['A', ab.bonus, `extra on each of the next ${ab.hits} attacks`], ['Z', `heals ${pct(ab.heal)} of that damage`]],
    entangle: ab => [['M', ab.dmg, `to every enemy within ${ab.radius} hexes`]],
    anthem: ab => [['H', ab.heal, 'allies within 2 hexes'], ['Z', `+${pct(ab.atk)} attack for 4s`]],
    fan: ab => [['P', ab.dmg, `per shot, ${ab.shots} shots, can crit`]],
    javelin: ab => [['P', ab.dmg, `per javelin, ${ab.count} javelins, can crit`], ['D', ab.poison, 'poison for 4s']],
    headshot: ab => [['P', ab.dmg, '+8% per hex of distance, can crit']],
    bloodfeast: ab => [['MX', [ab.dmg, ab.apdmg], `to every enemy within ${ab.radius} hexes, heals all of it`]],
    smoke: ab => [['P', ab.dmg, `per shuriken, ${ab.count} shuriken, can crit`]],
    howl: ab => [['P', ab.dmg, 'pounce, can crit'], ['D', ab.bleed, 'bleed for 3s'], ['Z', `allies get +${pct(ab.buff)} attack and attack speed for 4s`]],
    hypnosis: ab => [['M', ab.dmg, 'to the hypnotized group']],
    trick: ab => [['P', 1.5, 'pie'], ['H', ab.heal, 'balloons, every ally'], ['P', 1, `per knife, ${ab.knives} knives`], ['MX', [0.4, 0.2], 'confetti']],
    keg: ab => [['P', ab.dmg, 'to adjacent enemies'], ab.burn && ['BA', ab.burn, 'burn'], ['X', ab.heal, 'swig']],
    hellfire: ab => [['MX', [ab.dmg, ab.apdmg], `to every enemy within ${ab.radius} hexes`], ['BA', ab.burn, 'burn'], ['Z', `costs ${pct(ab.cost)} of his current HP`]],
    boulder: ab => [['P', ab.dmg, 'to the target'], ['P', 1, 'to enemies next to it']],
    wrap: ab => [['D', ab.decay, `decay on ${ab.count} enemies while rooted`]],
    phalanx: ab => [['P', ab.dmg, `per enemy, ${ab.hits} enemies, can crit`], ['Z', `allies next to him take ${pct(ab.dr)} less damage for 4s`]],
    waltz: ab => [['P', ab.dmg, `per enemy, up to ${ab.hits}, can crit`]],
    flask: ab => [['M', ab.acid, 'acid flask'], ['H', ab.heal, 'healing flask']],
    galekick: ab => [['P', ab.dmg, 'kick, can crit'], ['P', 1, 'to anyone it crashes into']],
    hive: ab => [['M', ab.dps, `per second to enemies in the hive, ${ab.dur}s`], ['H', ab.honey, 'honey, the weakest ally'], ab.slow && ['Z', `enemies in the hive are slowed ${pct(ab.slow)}`], ab.twin && ['Z', 'a second hive on another group']],
    wave: ab => [['M', ab.dmg, `to every enemy within ${ab.radius} hex, pushed ${ab.push} back`], ab.echo && ['Z', `a second wave 1s later deals ${pct(ab.echo)} of it`], ab.foam && ['Z', `allies next to her get a shield of ${pct(ab.foam)} of their max HP`]],
    starfall: ab => [['MX', [ab.dmg, ab.apdmg], `where the star lands, ${ab.radius} hex, after ${Math.max(0.3, ab.delay)}s`], ab.shards && ['Z', `${ab.shards} shards hit random enemies for 50% of it`], ab.veil && ['Z', `allies within 2 hexes get a shield of ${pct(ab.veil)} of their max HP`]],
  };
  // d = { abil, ab, atk, ap, hp, lvl, name } from Run.heroDef or a unit in the fight
  function scaleParts(d) {
    const S = SCALE[d.abil]; if (!S) return [];
    const n = x => Math.round(x);
    return S(d.ab).filter(Boolean).map(([k, v, note]) => {
      if (k === 'Z') return { k, t: typeof v === 'function' ? v(d) : v };
      const txt = { P: `<b>${pct(v)} AD</b> → <b class="num">${n(v * d.atk)}</b> physical`, M: `<b>${pct(v)} AP</b> → <b class="num">${n(v * d.ap)}</b> magic`,
        MX: `<b>${pct(v[0])} AD + ${pct(v[1])} AP</b> → <b class="num">${n(v[0] * d.atk + v[1] * d.ap)}</b> magic`, A: `<b>${pct(v)} AD</b> → <b class="num">${n(v * d.atk)}</b> magic`,
        B: `burn <b>${pct(v)} AP</b> → <b class="num">${n(v * d.ap)}</b> per second for 3s`, BA: `burn <b>${pct(v)} AD</b> → <b class="num">${n(v * d.atk)}</b> per second for 3s`,
        H: `heals <b>${pct(v)} AP</b> → <b class="num">${n(v * d.ap)}</b> HP`, X: `heals <b>${pct(v)}</b> of max HP → <b class="num">${n(v * d.hp)}</b>`,
        S: `shield <b>${pct(v)}</b> of max HP → <b class="num">${n(v * d.hp)}</b>`, D: `<b>${pct(v)}</b> of the target's max HP per second` }[k];
      return { k, t: txt + (note ? ` <span class="dim">(${note})</span>` : '') };
    });
  }
  const SCALE_ICON = { P: '⚔', M: '✦', MX: '✦', A: '⚔', B: '🔥', BA: '🔥', H: '✚', X: '✚', S: '🛡', D: '🧪', Z: '•' };
  function scalingHTML(d, compact) {
    const parts = scaleParts(d); if (!parts.length) return '';
    const head = compact ? '' : `<div class="scal-h">How it scales <span class="dim">now: ⚔ ${Math.round(d.atk)} AD · ✦ ${Math.round(d.ap)} AP</span></div>`;
    return `<div class="scal ${compact ? 'compact' : ''}">${head}<ul>${parts.map(p => `<li class="sk-${p.k}"><i>${SCALE_ICON[p.k]}</i><span>${p.t}</span></li>`).join('')}</ul></div>`;
  }
  // "scales with AD · AP · max HP" under a hero's name (shops, start)
  function scaleTag(key) {
    const h = HEROES[key], S = SCALE[h.abil]; if (!S) return '';
    const ks = new Set(S(h.ab).filter(Boolean).map(p => p[0])), w = [];
    if (['P', 'A', 'BA', 'MX'].some(k => ks.has(k)) || h.abil === 'turret' || h.abil === 'mirror') w.push('<span class="kw-atk">AD</span>');
    if (['M', 'B', 'H', 'MX'].some(k => ks.has(k)) || h.abil === 'raise') w.push('<span class="kw-ap">AP</span>');
    if (['S', 'X'].some(k => ks.has(k)) || h.abil === 'mirror') w.push('<span class="kw-hp">max HP</span>');
    return w.length ? `<span class="scaletag">scales with ${w.join(' · ')}</span>` : '';
  }
  const TIER_COLOR = {}; for (const r of B.RARITIES) TIER_COLOR[r.id] = r.color;
  // itemization v16: "Legendary weapon" under the name, and the set an item belongs to
  const itemTag = it => `<span class="itag" style="color:${TIER_COLOR[it.tier]}">${B.RARITY[it.tier].name} ${B.TYPE[it.type].name.toLowerCase()}</span>`;
  const setInfo = it => { const S = it.set && B.SETS[it.set]; return S ? `<div class="setline">◆ <b>${esc(S.name)}</b> set · 2 pieces: ${fmt(S.bonus[2].desc)} · 3 pieces: ${fmt(S.bonus[3].desc)}</div>` : ''; };
  const RANK = id => B.RARITIES.findIndex(r => r.id === ITEM[id].tier);
  const DOLL = ['helmet', 'trinket', 'weapon', 'offhand', 'gloves', 'armor', 'boots'];
  const NODE_ICON = { F: I('swords'), X: I('help'), B: I('skull'), S: I('cart'), G: I('trophy') };  // v29: friendlier icons; v49: the icon set
  const SHOP_NAME = { heroShop: 'Hero Shop', itemShop: 'Item Shop', relicShop: 'Relic Shop' };
  const SHOP_DESC = { heroShop: 'Recruit new heroes.', itemShop: 'Buy items to equip.', relicShop: 'Team-wide relics.' };
  // v42 (review #51): each event has its own picture (map card and a big medallion on the event screen; icon in data.js)
  const evIcon = id => (EVENT[id] && EVENT[id].icon) || '❓';
  const EV_RAR = { uncommon: 'Uncommon', rare: '★ Rare event' };

  // ------------------------------------------------------------------ header
  function header() {
    const h = $('#top');
    if (!run || screen === 'title') {
      // v49 (review #60): the landing keeps only Play and the trailer; everything else sits up here (your level, crowns,
      // the ladder, suggestions, and the menu sheet with the rest)
      const L = B.levelProgress(acct.axp || 0);
      h.innerHTML = `<button class="lvchip" data-act="player-tab" aria-label="Level ${L.lvl}: your rewards"><span class="lvb sm">${L.lvl}</span><span class="lvchipbar"><i style="width:${Math.round(100 * L.into / L.need)}%"></i></span></button><span class="grow"></span><button class="crownchip" data-act="shop" aria-label="Crown Shop: ${acct.crowns | 0} crowns">${I('crown')}<b>${acct.crowns | 0}</b></button><button class="ibtn" data-act="scores" aria-label="Ladder">${I('trophy')}</button><button data-act="suggest" class="sugg ibtn" aria-label="Suggest a change">${I('bulb')}</button><button class="ibtn" data-act="home-menu" aria-label="Menu">${I('menu')}</button>`;
      return;
    }
    const stepN = Math.max(0, run.step);
    const elo = store.get('balance.elo', null), g = run.g;
    const prog = g ? I('trophy') + (g.round != null ? ' Floor ' + (g.round + 1) : ' Gauntlet') : 'Day ' + (stepN + 1) + '/' + Run.seqOf(run).length;
    const lgs = store.get('balance.league', null);
    h.innerHTML = `${elo != null ? `<button class="lgchip" data-act="player-tab" title="${lgs ? leagueName(lgs.league) + ' league · ' : ''}Elo ${elo}" aria-label="Your league and Elo">${emblem(lgs ? lgs.league : 0, 18)}<span>${elo}</span></button>` : ''}
      <span class="gold" title="Gold">${shownGold()}</span><button class="prog" data-act="path" aria-label="See the journey">${prog}</button>
      <span class="grow"></span>${battle ? soundBtn() : `<button data-act="team">${I('bag')} Team</button>`}<button data-act="suggest" class="sugg ibtn" aria-label="Suggest a change">${I('bulb')}</button><button class="ibtn" data-act="menu" aria-label="Menu">${I('menu')}</button>`;
    animGold();
  }
  // v42 (review #51, David: "more dopamine hits"): sounds (js/sfx.js) with a switch, and a gold counter that counts up or
  // down with a bump and a "+6" whenever the gold changes. After a won fight it waits for the coins to fly in.
  const soundBtn = () => `<button class="sndbtn ibtn" data-act="sound" aria-label="Sound ${B.Sfx && B.Sfx.on ? 'on' : 'off'}" title="Sound">${I(B.Sfx && B.Sfx.on ? 'sound' : 'mute')}</button>`;
  const sfx = (n, a) => { if (B.Sfx) B.Sfx.play(n, a); };
  const shownGold = () => ui.goldHold != null ? ui.goldHold : run.gold;
  function animGold() {
    const el = $('#top .gold'); if (!el || !run) return;
    const g = shownGold(), was = ui.lastGold; ui.lastGold = g;
    if (was == null || was === g || !B.Juice) return;
    el.textContent = was; B.Juice.countUp(el, was, g, 450); B.Juice.bump(el); B.Juice.floater(el, (g > was ? '+' : '−') + Math.abs(g - was), g > was ? 'up' : 'down');
  }

  // ------------------------------------------------------------------ screens
  function render() {
    header();
    const m = $('#screen');
    const key = screenKey();
    if (screen === 'title' || !run) m.innerHTML = titleHTML();
    else if (screen === 'battle') { m.innerHTML = battleHTML(); mountBoard(); }
    else if (screen === 'result') m.innerHTML = resultHTML();
    else if (run.phase === 'over') m.innerHTML = overHTML();
    else if (run.pending.length && run.phase !== 'deploy') m.innerHTML = levelHTML();
    else if (run.phase === 'gauntlet') m.innerHTML = gauntletHTML();
    else if (run.phase === 'start') m.innerHTML = startHTML();
    else if (run.phase === 'map') m.innerHTML = mapHTML();
    else if (run.phase === 'deploy') { m.innerHTML = deployHTML(); mountBoard(); }
    else if (run.phase === 'shop') m.innerHTML = shopHTML();
    else if (run.phase === 'event') m.innerHTML = eventHTML();
    // v42: the screen plays its entrance only when it is a new screen (buying an item no longer makes the shop jump)
    const sec = m.firstElementChild;
    if (sec && key !== ui.lastKey) { sec.classList.add('enter'); onEnter(key); clearLeftovers(); }
    ui.lastKey = key;
    if (screen === 'result' && ui.result && !ui.result.fx) celebrate(ui.result);
    if (run && screen === 'run' && run.phase === 'over' && !run.xpShown) animXp();
    if (screen === 'title' || !run) startTrailer();
    autoGear();
  }
  function screenKey() {
    if (screen === 'title' || !run) return 'title';
    if (screen !== 'run') return screen;
    if (run.pending.length && run.phase !== 'deploy') return 'level:' + run.pending[0].uid + ':' + run.pending[0].lvl;
    return run.phase + (run.phase === 'start' ? ui.startStep || 1 : '') + ':' + run.step + ':' + (run.g ? run.g.round + ':' + run.g.status : '') + ':' + (run.cur && run.cur.pick != null ? 'pick' : '') + (run.cur && run.cur.done ? 'done' : '');
  }
  function onEnter(key) {
    if (!B.Juice) return;
    if (key.startsWith('level:')) { sfx('levelup'); const el = $('.lufull'); if (el) setTimeout(() => B.Juice.confettiAt(el, 50), 150); }
    else if (key.startsWith('event:') && key.endsWith('done')) { const g = $('.gains'); if (g) { sfx('unlock'); B.Juice.confettiAt(g, 40); } else sfx('back'); }
  }

  // v45 (review #56, David: "We are losing new players without experience ... make the intro screen and the selection to
  // start the run and select hero and relic more simple and intuitive ... call it game instead of run ... remove the
  // portraits from the start menu. Dont call it a roguelike"): the title says what you do in three steps and has one big
  // Play button; a run is called a "game" everywhere a player reads it
  // v49 (review #60, David: "New game identity: Super Rogues ... Super simple landing page, put most stuff into the bar or
  // icons. Just a play button. Beneath it put the board with random teams fighting mobs, refreshing when fight is over.
  // Like a trailer. While old run is on ... small white flag beneath continue game button saying give up. A run doesnt
  // count as started unless hero and relic are chosen"): a game still picking its hero and relic shows Play, not Continue
  const logoHTML = () => `<h1 class="logo-big" aria-label="Super Rogues">${B.UI ? B.UI.mark('lg') : ''}<span class="wm"><span class="w1">Super</span><span class="w2">${[...'ROGUES'].map((c, k) => `<i style="--k:${k}">${c}</i>`).join('')}</span></span></h1>`;
  function titleHTML() {
    const has = run && run.phase !== 'over' && run.phase !== 'start';
    return `<section class="title home">
      ${logoHTML()}
      <div class="stack">
        ${has ? `<button class="primary big cta" data-act="continue-run"><span>${I('play')} Continue</span><small>${run.phase === 'gauntlet' ? 'Gauntlet' : 'Day ' + (Math.max(0, run.step) + 1) + '/' + Run.seqOf(run).length} · ${run.heroes.length} hero${run.heroes.length === 1 ? '' : 'es'} · ${run.gold} gold</small></button>
        <button class="giveup" data-act="give-up">${I('flag')} Give up</button>`
        : `<button class="primary big cta play" data-act="new-run">${I('play')} Play</button>`}
      </div>
      <div class="trailer"><canvas id="trailer" aria-label="A fight playing by itself"></canvas></div>
    </section>`;
  }
  // the menu sheet of the landing: every other place of the game, one tap each
  function homeMenuHTML() {
    const L = B.levelProgress(acct.axp || 0), u = nextUnlock(L.lvl), on = B.Sfx && B.Sfx.on;
    const row = (act, icon, t, s) => `<button class="mrow" data-act="${act}">${I(icon)}<span><b>${t}</b>${s ? `<small>${s}</small>` : ''}</span>${I('arrow', 'chev')}</button>`;
    return `<div class="shead"><b>Menu</b><button data-act="close" aria-label="Close">✕</button></div><div class="mlist">
      ${row('howto', 'help', 'How to play', 'The basics in five lines')}
      ${row('player-tab', 'star', 'Level ' + L.lvl + ' rewards', u ? 'Next: ' + esc(unlockName(u)) + ' at level ' + u.lvl : 'Every reward unlocked')}
      ${row('my-profile', 'user', 'Profile', esc(acct.account && acct.name ? acct.name : 'You'))}
      ${row('shop', 'crown', 'Crown Shop', (acct.crowns | 0) + ' crown' + ((acct.crowns | 0) === 1 ? '' : 's'))}
      ${row('scores', 'trophy', 'Ladder', 'Top players and leagues')}
      ${row('art-lab', 'palette', 'Art Lab', 'Your art on the heroes')}
      ${row('sound', on ? 'sound' : 'mute', 'Sound', on ? 'On' : 'Off')}
      ${row('suggest', 'bulb', 'Suggest a change', 'Help build the game')}</div>`;
  }
  // the trailer: three random heroes against a random fight, played with no sound; a new one starts when it ends
  const trailer = { W: null, view: null, cv: null, raf: 0, last: 0, acc: 0, overAt: 0, end: null };
  function trailerWorld() {
    const r = Run.newRun((Math.random() * 2 ** 31) | 0, { locked: B.lockedFor(lvlNow()) });
    const keys = Object.keys(HEROES).filter(k => !(r.locked || []).includes(k)).sort(() => Math.random() - 0.5);
    Run.pickStart(r, [keys[0]], (r.relicOffer || [])[0]); Run.addHero(r, keys[1]); Run.addHero(r, keys[2]);
    const n = 2 + Math.floor(Math.random() * 3);
    r.fightNo = n; r.cur = Run.makeFight(r, ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)], n); r.phase = 'deploy';
    return Run.fightWorld(r);
  }
  function trailerLoop(now) {
    const cv = document.getElementById('trailer');
    if (!cv || document.hidden || (run && screen !== 'title')) { trailer.raf = 0; return; }
    if (trailer.cv !== cv) { trailer.cv = cv; trailer.view = Render.setup(cv, Math.max(240, Math.floor(cv.parentElement.clientWidth))); }
    if (!trailer.W) { try { trailer.W = trailerWorld(); } catch (e) { trailer.raf = 0; return; } trailer.acc = 0; trailer.overAt = 0; trailer.end = null; trailer.last = now; }
    const W = trailer.W, dt = Math.min(100, now - trailer.last), TICK = 1000 / Sim.TPS; trailer.last = now;
    if (!W.over) { trailer.acc += dt * 1.5; let n = 0; while (trailer.acc >= TICK && !W.over && n++ < 40) { Sim.step(W); trailer.acc -= TICK; } }
    if (W.over && !trailer.overAt) { trailer.overAt = now; trailer.end = { win: W.winner === 0, k: 0 }; }
    if (trailer.end) trailer.end.k = (now - trailer.overAt) / 1600;
    const T = W.over ? W.t + (now - trailer.overAt) / TICK * 0.3 : W.t + trailer.acc / TICK;
    Render.draw(trailer.view, W, T, Object.assign({ mute: true }, trailer.end ? { end: trailer.end } : {}));
    if (trailer.overAt && now - trailer.overAt > 2600) trailer.W = null;
    trailer.raf = requestAnimationFrame(trailerLoop);
  }
  function startTrailer() { if (!trailer.raf && document.getElementById('trailer')) trailer.raf = requestAnimationFrame(trailerLoop); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startTrailer(); });
  // review #44 (David: "Name → short effect → small scaling note"): the ability name, then its passive and its active
  // part on their own lines (same words, easier to scan); the scaling note stays small under it
  // v47 (review #58, David: "make every decision understandable in under 2 seconds ... showing consequences instead of
  // mechanics ... hide complexity behind taps"): quick views (start, shops) say what an ability does without the
  // "90% AP" formulas; the hero card in Team keeps every number
  const ABTOK = '\\d+(?:\\.\\d+)?% (?:AD|AP)(?: \\+ \\d+(?:\\.\\d+)?% (?:AD|AP))?';
  const AB_RX = [[/, each with [^.;]*? as attack/g, ''], [new RegExp(`(heal(?:s|ing)?(?: \\()?)(?: for)? ?${ABTOK} ?`, 'g'), '$1 '],
    [new RegExp(` (?:for|of) ${ABTOK}(?! (?:as |physical|magic|true|damage|\\+))`, 'g'), ''], [new RegExp(`(?:an extra )?${ABTOK} (?:as )?(?=(?:physical|magic|true|damage)\\b)`, 'g'), m => /^an extra/.test(m) ? 'extra ' : ''],
    [new RegExp(ABTOK, 'g'), 'damage'], [/\s+([.,;)])/g, '$1'], [/\(\s+/g, '('], [/\s{2,}/g, ' ']];
  const plainAb = s => AB_RX.reduce((t, [rx, to]) => t.replace(rx, to), String(s || '')).trim();
  function abilHTML(h, plain) {
    const d = plain ? plainAb(h.abDesc) : String(h.abDesc || ''), m = d.match(/^Passive(?: \(([^)]+)\))?:\s*(.*?)\s*Active:\s*(.*)$/);
    if (plain && m) return `<b class="abname">${esc(h.abName)}</b> ${fmt(m[3].charAt(0).toUpperCase() + m[3].slice(1))}`;   // quick view: what it does when it fires
    return `<b class="abname">${esc(h.abName)}</b>` + (m ? `<span class="abl"><i class="abk">Passive</i>${m[1] ? `<b>${esc(m[1])}</b>: ` : ''}${fmt(m[2])}</span><span class="abl"><i class="abk act">Active</i>${fmt(m[3].charAt(0).toUpperCase() + m[3].slice(1))}</span>` : ` ${fmt(d)}`);
  }
  function heroCard(key, extra = '') {
    const h = HEROES[key];
    return `<div class="hcard">
      <div class="hrow">${img(key, 48)}<b>${esc(h.name)}</b><span class="role">${h.role}</span></div>
      ${chips({ hp: h.hp, atk: h.atk, armor: h.armor, mr: h.mr, as: h.as, range: h.range })}
      <div class="abil">${abilHTML(h)}</div>${scaleTag(key)}${extra}</div>`;
  }
  // review #22 (David): the game starts with 1 hero and 1 relic: pick one of each (3 offered).
  // v45 (review #56): two short steps instead of one busy screen. Step 1: tap a hero (its ability shows under the three,
  // no stat table), then Next. Step 2: the three relics with what they do written on them, then Start.
  const stepsHTML = s => `<ol class="ssteps">${['Hero', 'Relic', 'Fight!'].map((t, i) => `<li class="${i + 1 < s ? 'done' : i + 1 === s ? 'on' : ''}"><i>${i + 1 < s ? '✓' : i + 1}</i>${t}</li>`).join('')}</ol>`;
  function startHTML() {
    const relics = run.relicOffer || [], n = ui.startPick.length;
    if (ui.startStep === 2 && n === CFG.startHeroes && relics.length) {
      const rsel = ui.startRelic && relics.includes(ui.startRelic) ? ui.startRelic : null;
      return `<section class="start s2">${stepsHTML(2)}<h2 class="sc">Pick a relic</h2><p class="ssub">A bonus for your whole team, all game long.</p>
        <div class="srelics big">${relics.map(id => `<button class="srelic ${rsel === id ? 'on' : ''}" data-act="start-relic" data-arg="${id}">${ico('relic', id, 44)}<span class="srt"><b class="relic">${esc(RELIC[id].name)}</b><small class="srd">${esc(RELIC[id].short)}</small></span>${rsel === id ? '<span class="chk">✓</span>' : ''}</button>`).join('')}</div>
        <div class="bar"><button data-act="start-back">◀ Back</button><button class="primary big" data-act="start-go" ${rsel ? '' : 'disabled'}>${rsel ? 'Start the game!' : 'Tap a relic'}</button></div></section>`;
    }
    const f = run.startOffer.includes(ui.focus) ? ui.focus : ui.startPick[0] || null, h = f && HEROES[f];
    return `<section class="start s1">${stepsHTML(1)}<h2 class="sc">Pick your first hero</h2><p class="ssub">You can buy 2 more heroes later.</p>
      <div class="hbanners">${run.startOffer.map(k => { const d = HEROES[k], on = ui.startPick.includes(k);
        return `<button class="hbanner ${on ? 'on' : ''} ${k === f ? 'focus' : ''}" data-act="start-pick" data-arg="${k}" style="--cloth:${d.color}">
          <span class="rod"></span><img src="${por(k, 120, true)}" alt=""><b>${esc(d.name)}</b><i>${d.role}</i>${on ? '<span class="chk">✓</span>' : ''}</button>`; }).join('')}</div>
      ${h ? `<div class="card detail"><div class="hrow">${img(f, 48)}<b>${esc(h.name)}</b><span class="role">${h.role} · ${h.range <= 1 ? I('sword') + ' fights up close' : I('bow') + ' attacks from afar'}</span></div>
        <p class="htag">${esc(h.tag || h.abName)}</p><button class="hdet" data-act="hero-peek" data-arg="${f}">${I('info')} Details</button></div>` : '<p class="ssub tap">Tap a hero to see what it does</p>'}
      ${(run.locked || []).length ? `<p class="center"><span class="lockpill" title="More heroes, items and relics unlock as your account levels up">🔒 ${run.locked.length} more unlock as you level up</span></p>` : ''}
      <div class="bar"><button class="primary big" data-act="start-next" ${n === CFG.startHeroes ? '' : 'disabled'}>${n === CFG.startHeroes ? (relics.length ? 'Next ▶' : 'Start the game!') : 'Tap a hero'}</button></div></section>`;
  }

  function pathHTML() {
    return `<div class="shead"><b>🗺 Your journey</b><button data-act="close">✕</button></div>${trackHTML()}
      <ul class="plegend"><li>${I('swords')} Fight</li><li>${I('help')} Shop or event</li><li>${I('skull')} Boss</li><li>${I('cart')} Last shop</li><li>${I('trophy')} Gauntlet</li></ul>`;
  }
  function trackHTML() {
    return `<div class="track">${Run.seqOf(run).map((t, i) => `<span class="node ${i < run.step ? 'done' : i === run.step ? 'cur' : ''} ${t === 'B' ? 'boss' : ''}" title="${t}">${NODE_ICON[t]}</span>`).join('')}</div>`;
  }
  function enemyList(f) {
    const cnt = {};
    for (const e of f.enemies) { const k = e.key + (e.elite ? '*' : ''); cnt[k] = (cnt[k] || 0) + 1; }
    return Object.keys(cnt).map(k => { const key = k.replace('*', ''), m = B.MOBS[key] || B.BOSSES[key]; return `<span class="en ${k.endsWith('*') ? 'elite' : ''}">${img(key, 22, 'por sm')}${esc(m.name)}${cnt[k] > 1 ? ' ×' + cnt[k] : ''}${k.endsWith('*') ? ' ★' : ''}</span>`; }).join(' ');
  }
  function bannerHTML(i, kind, emblem, title, body, reward) {
    return `<button class="banner b-${kind}" data-act="choose" data-arg="${i}"><span class="rod"></span><span class="emb">${emblem}</span>
      <span class="bt">${title}</span><span class="bd">${body}</span>${reward ? `<span class="rw">${reward}</span>` : ''}</button>`;
  }
  function optHTML(o, i) {
    if (o.type === 'fight') {
      if (o.diff === 'boss') { const b = o.enemies.map(e => B.BOSSES[e.key]).find(Boolean); return bannerHTML(i, 'boss', img(b.key, 72, 'por emb-img'), esc(b.name), `<span class="small">${fmt(b.desc)}</span><span class="ens">${enemyList(o)}</span>`, '+' + o.gold + ' gold'); }
      return bannerHTML(i, o.diff, o.diff === 'hard' ? I('swords') + I('swords') : o.diff === 'medium' ? I('swords') : I('sword'), B.DIFF[o.diff].name + ' fight', `<span class="ens">${enemyList(o)}</span>`, '+' + o.gold + ' gold');
    }
    if (o.type === 'shop') return bannerHTML(i, 'shop', o.kind === 'heroShop' ? I('user') : o.kind === 'itemShop' ? I('shield') : I('gem'), SHOP_NAME[o.kind] + (o.final ? ' (last)' : ''), `<span class="small">${SHOP_DESC[o.kind]}</span>`);
    if (o.type === 'event') { const e = EVENT[o.id]; return bannerHTML(i, 'event' + (e.rar === 'rare' ? ' b-rare' : ''), evIcon(o.id), esc(e.name), `<span class="small">${esc(e.text)}</span>`, EV_RAR[e.rar] || ''); }
    return '';
  }
  // review #17: what an event did to the next fight, in words
  function modText(M) {
    const pc = v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%', out = [];
    if (M.enemyHp) out.push(`enemies ${pc(M.enemyHp)} HP`);
    if (M.enemyAtk) out.push(`enemies ${pc(M.enemyAtk)} attack`);
    if (M.atkPct) out.push(`your heroes ${pc(M.atkPct)} attack`);
    if (M.manaStart) out.push(`your heroes start with +${M.manaStart} mana`);
    if (M.regen) out.push(`your heroes regenerate ${Math.round(M.regen * 100)}% HP per second`);
    if (M.goldPct) out.push(`${pc(M.goldPct)} gold`);
    if (M.reward) out.push(`win it for a ${M.reward} item`);
    if (M.rewardGold) out.push(`win it for +${M.rewardGold} gold`);
    return out.join(', ');
  }
  function mapHTML() {
    const t = Run.seqOf(run)[run.step];
    const title = t === 'B' ? 'A boss blocks the way' : t === 'S' ? 'One last shop' : 'Choose your path';
    return `<section class="map"><div class="mapmain"><h2 class="sc">${title}</h2>${run.nextMod ? `<p class="nextmod">${I('bolt')} Next fight: ${fmt(modText(run.nextMod))}</p>` : ''}<div class="banners ${run.opts.length === 1 ? 'one' : run.opts.length === 3 ? 'three' : ''}">${run.opts.map(optHTML).join('')}</div>
      </div><aside class="mapside">${partyHTML()}</aside></section>`;
  }
  // review #18: the party under the map (levels, XP, worn items, relics) and the next boss, so each choice is informed
  function partyHTML() {
    const heroes = run.heroes.map(h => {
      const next = h.lvl < CFG.maxLevel ? CFG.xpLevels[h.lvl + 1] : null, prev = CFG.xpLevels[h.lvl] || 0;
      return `<button class="pm" data-act="team">${img(h.key, 38, 'por')}<span class="pmb"><span class="pmn"><b>${esc(HEROES[h.key].name)}</b><span class="lv">Lv ${h.lvl}</span></span>
        <span class="xpbar"><i style="width:${next ? Math.round(100 * (h.xp - prev) / (next - prev)) : 100}%"></i></span>
        <span class="pmi">${h.items.map(id => `<img class="ico xs" src="${B.Icons.item(id, 20)}" alt="">`).join('') || '<i class="noitem" title="No items yet"></i>'}</span></span></button>`;
    }).join('');
    let boss = '';
    const seq = Run.seqOf(run);
    for (let k = Math.max(0, run.step); k < seq.length; k++) if (seq[k] === 'B') {
      const nth = seq.slice(0, k + 1).filter(x => x === 'B').length, b = B.BOSSES[Run.bossOf(run, nth)], d = k - run.step;
      boss = `<button class="nextboss" data-act="form-info" data-arg="${esc(b.name + ': ' + b.desc)}">${img(b.key, 40, 'por')}<div><b>${I('skull')} ${esc(b.name)}</b> <span class="dim">${d <= 0 ? 'today' : 'in ' + d + ' day' + (d > 1 ? 's' : '')}</span></div>${I('info', 'chev')}</button>`;
      break;
    }
    return `<div class="party"><div class="bph"><b>Your team</b><span class="dim small">${run.bag.length ? `<a href="#" data-act="team" class="bagnote">${I('bag')} ${run.bag.length} to equip</a>` : `${run.heroes.length}/${Run.teamMax(run)}`}</span></div>
      <div class="pgrid">${heroes}</div>${run.relics.length ? `<div class="relicline"><b>Relics</b>${run.relics.map(id => `<button class="relicbtn" data-act="relic-info" data-arg="${id}" aria-label="${esc(RELIC[id].name)}">${ico('relic', id, 26)}</button>`).join('')}</div>` : ''}${boss}</div>`;
  }

  // v49 (review #61, David: "On level-up, make choices feel impactful with concise effects/playstyle tags and transform the
  // specialization path into a clear branching progression with the current choice highlighted and future nodes
  // subdued"): each power gets up to two playstyle tags read from what it does, and the path is a tree (two branches a
  // level; the ones you took in gold, today's pair glowing, later ones dim) with a fork from the branch you took
  const STYLE = [['Summon', 'ghost', /skeleton|turret|clone|summon|decoy|\bbees?\b|spawn|minion/i], ['Heal', 'heart', /heal|lifesteal|regenerat|revive|rises/i],
    ['Control', 'lock', /stun|root|slow|freez|taunt|blind|pull|push|knock|silence|hypno|charm|fear|longer/i], ['Tank', 'shield', /armor|\bMR\b|max HP|shield|invulnerab|untargetable|less damage|damage taken/i],
    ['Area', 'swords', /radius|every enemy|all enemies|adjacent|within \d+ hex|group|bounce|chain|splash|nearby|around|more enemies|more targets|\d+ targets/i],
    ['Speed', 'bolt', /attack speed|move speed|faster|sooner|dodge|blink|dash|mana|cooldown|twice|range/i], ['Damage', 'sword', /damage|crit|execut|burn|poison|bleed|\battack\b|\bAD\b|\bAP\b|strike|kill|double|\d+% more|more (?:knives|flasks|shots|arrows)/i]];
  const specTags = sp => { const t = STYLE.filter(x => x[2].test(sp.desc)).slice(0, 2); return (t.length ? t : [['Upgrade', 'star']]).map(([n, ic]) => `<span class="ptag pt-${n.toLowerCase()}">${I(ic)}${n}</span>`).join(''); };
  function levelHTML() {
    const p = run.pending[0], h = run.heroes.find(x => x.uid === p.uid), d = HEROES[h.key];
    const pair = d.specs[p.lvl - 2];
    // review #18: a big splash, what the level gives, the two choices as big cards and the whole specialization path
    const side = k => { const id = h.specs[k]; return id == null ? -1 : d.specs[k].findIndex(sp => sp.id === id); };
    const path = d.specs.map((pr, k) => {
      const lv = k + 2, st = lv === p.lvl ? 'now' : lv < p.lvl ? 'done' : 'later', from = k ? side(k - 1) : -2;
      const fork = k ? `<div class="sp-fork ${st} from-${from === 0 ? 'a' : from === 1 ? 'b' : 'mid'}"><i></i></div>` : '';
      return fork + `<div class="sp-row ${st}"><span class="sp-lv">Lv ${lv}</span>${pr.map((sp, j) => `<span class="sp-n ${h.specs[k] === sp.id ? 'on' : st === 'done' ? 'off' : ''}">${esc(sp.name)}</span>`).join('')}</div>`;
    }).join('');
    return `<section class="levelup"><h2 class="sc headline win">Level up!</h2>
      <div class="luhero"><img class="lufull" src="${por(h.key, 104, true)}" alt=""><div><b class="luname">${esc(d.name)}</b><span class="lulv">Lv ${p.lvl - 1} → <b>Lv ${p.lvl}</b></span>
        <p class="small lugain" title="+15% HP and attack, +30 AP, +4 armor and MR">${I('up')} Stronger in every way${p.lvl >= 3 ? `<br><b class="kw-gold">${I('bag')} +1 item slot</b>` : ''}</p></div></div>
      <h3>Pick a new power</h3>
      <div class="opts spec2">${pair.map((sp, i) => `<button class="card opt" data-act="spec" data-arg="${i}" title="${esc(sp.desc)}"><div class="ptags">${specTags(sp)}</div><div class="ctitle spec">${esc(sp.name)}</div><div class="small">${fmt(plainAb(sp.desc))}</div></button>`).join('')}</div>
      <div class="sp-path tree"><div class="bph"><b>Power path</b><span class="dim small">one of two at each level</span></div>${path}</div></section>`;
  }

  // review #18: the enemy roster on the deploy screen, grouped, with what each one does (positioning is the decision here)
  function foesHTML(gau, f) {
    const groups = [];
    if (gau) for (const h of run.g.opp.team) groups.push({ key: h.key, n: 1, name: HEROES[h.key].name + ' Lv ' + h.lvl, what: HEROES[h.key].tag || HEROES[h.key].abName, peek: true });   // v53: a few words, More for the rest
    else {
      const by = {};
      for (const e of f.enemies) {
        const k = e.key + '|' + (e.elite || ''), m = B.MOBS[e.key] || B.BOSSES[e.key], el = e.elite && B.ELITES.find(x => x.id === e.elite);
        if (!by[k]) groups.push(by[k] = { key: e.key, n: 0, boss: !!B.BOSSES[e.key], elite: el ? el.name : '', name: m.name,
          what: B.BOSSES[e.key] ? m.desc : m.abil ? MOB_ABIL[m.abil] || '' : (m.fl || []).includes('dive') ? 'Leaps to your back line.' : '', ranged: m.range > 1 });
        by[k].n++;
      }
    }
    // v52 (review #64, David: "Pre battle screen highlight only the enemies with abilities, the rest is smaller"): enemies
    // that do something special get a card with what they do; the plain ones are small chips under them
    const big = groups.filter(g => g.what), small = groups.filter(g => !g.what);
    const nm = g => `${esc(g.name)}${g.n > 1 ? ' ×' + g.n : ''}`;
    return `<div class="foes"><div class="bph"><b>${gau ? 'Their team' : 'Enemies'}</b><span class="dim small">${groups.reduce((a, g) => a + g.n, 0)}</span></div>
      ${big.length ? `<div class="fgrid">${big.map(g => `<div class="fo ${g.boss ? 'boss' : ''} ${g.elite ? 'elite' : ''}">${img(g.key, 34, 'por')}<div><b>${nm(g)}${g.ranged ? ' ' + I('bow') : ''}${g.elite ? ` <span class="elt">★ ${esc(g.elite)}</span>` : ''}</b><small class="fw">${fmt(g.what)}</small>${g.peek ? `<button class="hdet sm" data-act="hero-peek" data-arg="${g.key}">${I('info')} More</button>` : ''}</div></div>`).join('')}</div>` : ''}
      ${small.length ? `<div class="fsmall">${small.map(g => `<span class="fs ${g.elite ? 'elite' : ''}" title="${g.elite ? esc(g.elite) + ' ' : ''}${esc(g.name)}${g.ranged ? ', attacks from range' : ''}">${img(g.key, 24, 'por')}<b>${nm(g)}</b>${g.elite ? '<i class="st">★</i>' : ''}${g.ranged ? I('bow') : ''}</span>`).join('')}</div>` : ''}</div>`;
  }
  function deployHTML() {
    const gau = run.cur && run.cur.type === 'gauntlet';
    const f = run.cur;
    const map = Run.mapOf(run);
    return `<section class="deploy">
      <div class="bhead">${gau ? `${I('trophy')} Gauntlet floor ${run.g.round + 1} · vs ${esc(run.g.opp.name)} (Elo ${run.g.opp.elo})` : f.challenge ? `${I('bolt')} ${esc(f.challenge.name)}` : f.diff === 'boss' ? I('skull') + ' Boss fight' : I('swords') + ' ' + B.DIFF[f.diff].name + ' fight'}</div>
      ${!gau && f.challenge ? `<p class="hint tight"><span class="nextmod chal">${f.challenge.intro ? esc(f.challenge.intro) + ' ' : ''}${f.solo ? `Only ${esc(HEROES[f.challenge.hero].name)} fights. ` : ''}<b>Win:</b> ${esc(winText(f.challenge.win))}. <b>Lose:</b> the game goes on.</span></p>`
        : !gau && f.mod ? `<p class="hint tight"><span class="nextmod">⚑ ${fmt(modText(f.mod))}</span></p>` : (store.get('balance.tips.deploy', 0) | 0) < 3 ? '<p class="hint tight tip">Drag your heroes: tanks in front, ranged behind.</p>' : ''}
      ${run.relics.some(id => RELIC[id] && RELIC[id].form) ? `<p class="formline" id="formline">${formHTML(worldFor(true))}</p>` : ''}
      <div class="boardwrap"><canvas id="board"></canvas></div>
      <div id="info" class="info mini ${ui.info ? '' : 'empty'}">${infoHTML()}</div>
      ${foesHTML(gau, f)}
      <div class="bar sticky"><button data-act="team">${I('bag')} Items</button><button class="primary big" data-act="fight">${gau ? 'Duel!' : 'Fight!'}</button></div>
      <div class="dparty">${partyHTML()}</div>
    </section>`;
  }
  // v44: what a challenge pays
  function winText(w) {
    const out = [];
    if (w.gold) out.push('+' + w.gold + ' gold');
    if (w.item) out.push((/^[aeiou]/.test(w.item) ? 'an ' : 'a ') + w.item + ' item');
    if (w.relic) out.push('a relic');
    if (w.boost) out.push('+' + Math.round((w.boost.hpPct || 0) * 100) + '% HP and attack for good');
    if (w.xp) out.push('+' + w.xp + ' XP');
    return out.join(', ');
  }
  // review #40 (David): who gets what from the formation relics, from where the heroes stand right now
  // v42 (review #51, "cut needless text"): one chip per formation relic with how many heroes it reaches; the chip's
  // tooltip and a tap still give the full "who gets what"
  function formHTML(W) {
    const got = W ? Sim.formation(W, 0) : [];
    return run.relics.filter(id => RELIC[id] && RELIC[id].form).map(id => {
      const r = RELIC[id], who = got.filter(b => b.fl === r.fl);
      const full = `${r.name}: ` + (who.length ? who.map(b => `${b.u.name} ${B.FORMATION[b.fl](b.n)}`).join(', ') : 'nobody yet (move your heroes)');
      return `<button class="fr ${who.length ? 'got' : 'none'}" data-act="form-info" data-arg="${esc(full)}" title="${esc(full)}" aria-label="${esc(r.name)}">${ico('relic', id, 22)}<span>${who.length ? '✓' : '✗'}</span></button>`;
    }).join('');
  }
  // review #18 (David: "another pass of the ui and battle ui ... pretty, functional, visible, engaging"): under the
  // board, a card per hero (HP and shield in numbers, mana bar named after the ability that glows when READY, status
  // badges, live damage with the leader crowned) and the enemy roster with its own HP bars and a count of who is left.
  function battleHTML() {
    return `<section class="deploy battle">
      <div class="hud"><div id="bhud" class="hud-l"></div>
        <div class="speed">${[1, 2, 4].map(x => x === 4 && !hasPerk('speed4') ? `<button class="locked" data-act="speed" data-arg="4" title="4× speed: a Crown Shop unlock">4×🔒</button>` : `<button class="${ui.speed === x ? 'on' : ''}" data-act="speed" data-arg="${x}">${x}×</button>`).join('')}${hasPerk('skip') ? '<button class="skip" data-act="skip" aria-label="Skip">⏭</button>' : '<button class="skip locked" data-act="skip" aria-label="Skip (Crown Shop)">⏭🔒</button>'}</div></div>
      <div class="boardwrap"><canvas id="board"></canvas></div>
      <div class="bpanel"><div class="teamstrip v2" id="tstrip"></div>
        <div class="bph"><b>Enemies</b><span id="ecount" class="dim small"></span></div><div class="estrip" id="estrip"></div></div>
      <div id="info" class="info mini ${ui.info ? '' : 'empty'}">${infoHTML()}</div></section>`;
  }
  const kfmt = n => n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
  // damage per hero, summons counted for their owner
  function dmgBy(W) { const d = {}; for (const u of W.units) { const o = u.owner && W.byId[u.owner] ? W.byId[u.owner] : u; if (o.side === 0 && o.kind === 'hero') d[o.id] = (d[o.id] || 0) + (u.dmgDone || 0); } return d; }
  const CC_STATUS = [['stun', 'STUN', 'st'], ['silence', 'SILENCE', 'si'], ['root', 'ROOT', 'ro'], ['frozenU', 'FROZEN', 'fr'], ['confuseU', 'CONFUSED', 'co'], ['blindU', 'BLIND', 'bl'], ['slowU', 'SLOW', 'sl'], ['tauntU', 'TAUNTED', 'ta']];
  function ccHTML(W, u) { return u.dead ? '' : CC_STATUS.filter(([k]) => u.st[k] > W.t).slice(0, 2).map(([, t, c]) => `<span class="sb sb-${c}">${t}</span>`).join(''); }
  function stripHTML(W) {
    return W.units.filter(u => u.side === 0 && u.kind === 'hero').map(u => `<div class="ts" data-id="${u.id}">
      <div class="tsp">${img(u.key, 40, 'por')}<span class="tslv">${u.lvl}</span><span class="crown">👑</span></div>
      <div class="tsb"><div class="tsn"><b>${esc(u.name)}</b><span class="tsst"></span><span class="tsd"></span></div>
        <i class="hp"><s></s><em></em></i><i class="mp"><s></s><em>${esc((HEROES[u.key] || {}).abName || '')}</em></i><i class="dm"><s></s></i></div></div>`).join('');
  }
  function updateStrip(W) {
    const el = $('#tstrip'); if (!el) return;
    if (!el.firstChild) el.innerHTML = stripHTML(W);
    const dmg = dmgBy(W), top = Math.max(1, ...Object.values(dmg));
    for (const d of el.querySelectorAll('.ts')) {
      const u = W.byId[d.dataset.id]; if (!u) continue;
      const ready = !u.dead && u.maxMana > 0 && u.mana >= u.maxMana, dd = dmg[u.id] || 0, sh = u.shield > 0 && u.shieldU > W.t ? Math.round(u.shield) : 0;
      d.classList.toggle('dead', !!u.dead); d.classList.toggle('ready', ready); d.classList.toggle('mvp', dd > 0 && dd >= top);
      d.querySelector('.hp s').style.width = Math.max(0, 100 * u.hp / u.maxHp) + '%';
      d.querySelector('.hp em').textContent = u.dead ? 'fallen' : Math.max(0, Math.round(u.hp)) + ' / ' + u.maxHp + (sh ? '  +' + sh + ' shield' : '');
      d.querySelector('.mp s').style.width = (u.maxMana ? Math.min(100, 100 * u.mana / u.maxMana) : 0) + '%';
      d.querySelector('.dm s').style.width = 100 * dd / top + '%';
      d.querySelector('.tsd').textContent = '⚔ ' + kfmt(dd);
      const st = ccHTML(W, u), sd = d.querySelector('.tsst'); if (sd.innerHTML !== st) sd.innerHTML = st;
    }
    const es = $('#estrip'); if (!es) return;
    const foes = W.units.filter(u => u.side === 1 && u.kind !== 'summon'), summons = W.units.filter(u => u.side === 1 && u.kind === 'summon' && !u.dead).length;
    for (const u of foes) if (!es.querySelector(`[data-id="${u.id}"]`)) {
      const c = document.createElement('span'); c.className = 'ec' + (u.boss ? ' boss' : '') + (u.elite ? ' elite' : ''); c.dataset.id = u.id;
      c.innerHTML = `${img(u.key, u.boss ? 34 : 26, 'por')}<i><s></s></i>`; c.title = u.name; es.appendChild(c);
    }
    for (const c of es.querySelectorAll('.ec')) { const u = W.byId[c.dataset.id]; if (!u) continue; c.classList.toggle('dead', !!u.dead); c.querySelector('s').style.width = Math.max(0, 100 * u.hp / u.maxHp) + '%'; }
    const left = foes.filter(u => !u.dead).length, ec = $('#ecount');
    if (ec) ec.textContent = `${left} of ${foes.length} left${summons ? ' · +' + summons + ' summoned' : ''}`;
  }


  function eloLine(r) {
    if (r.pending) return '<p class="dim center">Updating your Elo…</p>';
    if (r.error) return `<p class="err center">${esc(r.error)}</p><p class="center"><button data-act="retry-elo">Try again</button></p>`;
    return '';
  }
  const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  // review #25 (David #34: "redesign the after battle screen to be more intuitive, pretty and more info"): a banner
  // with what was fought and how long it took, every reward as a chip, then one card per hero (damage dealt with its
  // share, damage taken, kills, fallen or standing, XP) and the enemy line-up with who went down.
  function resultHTML() {
    const r = ui.result, S = r.stats || {};
    const hs = r.xp.map(x => ({ x, h: run.heroes.find(q => q.uid === x.uid), s: S[x.uid] || { dmg: (r.dmg || {})[x.uid] || 0, taken: 0, kills: 0, alive: true } })).filter(o => o.h);
    const top = Math.max(1, ...hs.map(o => o.s.dmg)), total = Math.max(1, hs.reduce((a, o) => a + o.s.dmg, 0));
    const mvpUid = hs.length > 1 || r.win ? (hs.slice().sort((a, b) => b.s.dmg - a.s.dmg)[0] || {}).x : null;
    const what = r.gauntlet ? `Gauntlet · floor ${r.floor || '?'} · vs ${plink(r.opp.name, r.opp.code)}` : r.boss ? `👹 ${esc(r.bossName || 'Boss')}` : esc(r.fightName || 'Fight');
    const foesDown = r.foes ? r.foes.filter(f => f.dead).length : null, fx = r.fx || {};
    // v42 (review #51): short meta (time, foes down, heroes standing) as icons; 1-3 stars on a win: 1 for the win, 1 if
    // nobody fell, 1 more if the team also kept 60% of its health. They light up one by one (celebrate()).
    const meta = [r.time != null ? `<span title="Time">⏱ ${clock(r.time)}</span>` : '', r.foes ? `<span title="Enemies down">💥 ${foesDown}/${r.foes.length}</span>` : '', `<span title="Heroes standing">♥ ${hs.filter(o => o.s.alive).length}/${hs.length}</span>`, r.timeout ? '<span>time ran out</span>' : ''].filter(Boolean).join('');
    const stars = r.stars || 0;
    const starRow = r.win ? `<div class="rstars" aria-label="${stars} of 3 stars">${[0, 1, 2].map(i => `<i class="st ${i < (fx.stars || 0) ? 'lit' : ''} ${i < stars ? 'earn' : ''}">★</i>`).join('')}${stars === 3 ? `<b class="flawless ${fx.stars >= 3 ? 'on' : ''}">Flawless!</b>` : ''}</div>` : '';
    const chips = [];
    if (r.win && !r.gauntlet) chips.push(`<span class="rw rw-gold"><i class="coin"></i><b>+${fx.gold ? r.gold : 0}</b><em>gold</em></span>`);
    if (r.relic && RELIC[r.relic]) chips.push(`<span class="rw rw-prize" style="--tier:#ffd23f">${ico('relic', r.relic, 26)}<b>${esc(RELIC[r.relic].name)}</b><em>relic</em></span>`);
    if (r.bank) chips.push(`<span class="rw ${r.bank > 0 ? 'rw-pos' : 'rw-neg'}"><i>🏦</i><b>${r.bank > 0 ? '+' : ''}${r.bank}</b><em>${r.bank > 0 ? 'investment' : 'loan paid'}</em></span>`);
    // v50 (review #62): what the run relics did after this fight
    if (r.phoenix) chips.push(`<span class="rw rw-prize" style="--tier:#ff7a3d">${ico('relic', 'phoenix', 26)}<b>Phoenix Egg</b><em>hatched, gone</em></span>`);
    if (r.anvil && ITEM[r.anvil.to]) chips.push(`<span class="rw rw-prize" style="--tier:${TIER_COLOR[ITEM[r.anvil.to].tier]}">${ico('item', r.anvil.to, 26)}<b>${esc(ITEM[r.anvil.to].name)}</b><em>anvil upgrade</em></span>`);
    if (r.changeling && HEROES[r.changeling.to]) chips.push(`<span class="rw rw-up">${img(r.changeling.to, 22, 'por sm')}<b>${esc(HEROES[r.changeling.from].name)} → ${esc(HEROES[r.changeling.to].name)}</b><em>changeling</em></span>`);
    if (r.double) chips.push(`<span class="rw ${r.double === 'won' ? 'rw-pos' : 'rw-neg'}">${ico('relic', 'double', 22)}<b>${r.double === 'won' ? 'Double!' : 'Nothing'}</b><em>double or nothing</em></span>`);
    if (r.snow != null) chips.push(`<span class="rw ${r.snow ? 'rw-pos' : 'rw-neg'}">${ico('relic', 'snowball', 22)}<b>${r.snow ? '+' + 4 * r.snow + '%' : 'Melted'}</b><em>snowball</em></span>`);
    if (r.boost) chips.push(`<span class="rw rw-up">${img(r.boost.key, 22, 'por sm')}<b>${esc(r.boost.text)}</b><em>for good</em></span>`);
    if (r.bonusXp) chips.push(`<span class="rw rw-xp"><i>🏆</i><b>+${r.bonusXp}</b><em>bonus XP</em></span>`);
    if (r.prize) chips.push(`<span class="rw rw-prize" style="--tier:${TIER_COLOR[ITEM[r.prize].tier]}">${ico('item', r.prize, 26)}<b>${esc(ITEM[r.prize].name)}</b><em>${B.RARITY[ITEM[r.prize].tier].name} ${B.TYPE[ITEM[r.prize].type].name.toLowerCase()}</em></span>`);
    const xp = hs.reduce((a, o) => a + o.x.gained, 0), ups = hs.filter(o => o.x.to > o.x.from).length;
    if (!r.gauntlet && xp) chips.push(`<span class="rw rw-xp"><i>✨</i><b>+${xp}</b><em>XP</em></span>`);
    if (ups) chips.push(`<span class="rw rw-up"><i>▲</i><b>${ups}</b><em>level up${ups > 1 ? 's' : ''}</em></span>`);
    if (r.delta != null) chips.push(`<span class="rw ${r.delta >= 0 ? 'rw-pos' : 'rw-neg'}"><i>⚜</i><b>${r.delta >= 0 ? '+' : ''}${r.delta}</b><em>Elo ${r.elo}</em></span>`);
    if (r.lg) chips.push(`<span class="rw ${r.lg.delta > 0 ? 'rw-pos' : r.lg.delta < 0 ? 'rw-neg' : ''}">${emblem(r.lg.league, 20)}<b>${r.lg.delta > 0 ? '+' : ''}${r.lg.delta}</b><em>${leagueName(r.lg.league)} ${leagueProgress(r.lg)}</em></span>`);
    if (r.lg && r.lg.crowns) chips.push(`<span class="rw rw-crown"><i>👑</i><b>+${r.lg.crowns}</b><em>crowns</em></span>`);
    const promo = r.lg && r.lg.promoted ? `<div class="promo" style="--lc:${B.LEAGUES[r.lg.league].color}">${emblem(r.lg.league, 40)}<b>Promoted to ${leagueName(r.lg.league)}!</b>${r.lg.crowns ? `<span class="crn">+${r.lg.crowns} 👑</span>` : ''}</div>` : '';
    const heroes = hs.map(({ x, h, s: st }) => {
      const mvp = mvpUid === x && st.dmg > 0, next = h.lvl < CFG.maxLevel ? CFG.xpLevels[h.lvl + 1] : null, prev = CFG.xpLevels[h.lvl] || 0;
      // the XP bar starts where it was before the fight (empty after a level up) and fills when the rewards play
      const w1 = next ? Math.round(100 * (h.xp - prev) / (next - prev)) : 100, w0 = x.to > x.from ? 0 : next ? Math.max(0, Math.round(100 * (h.xp - x.gained - prev) / (next - prev))) : 100;
      return `<div class="rh ${mvp ? 'mvp' : ''} ${st.alive ? '' : 'ko'}"><span class="rhp">${img(h.key, 46, 'por')}${st.alive ? '' : '<i class="kox">✝</i>'}</span><div class="rhb">
        <div class="rhn"><b>${esc(x.name)}</b>${mvp ? `<span class="mvpb ${fx.done ? 'stamp' : 'wait'}">★ MVP</span>` : ''}<span class="grow"></span>${x.to > x.from ? `<b class="up ${fx.done ? 'on' : 'wait'}">Level up! Lv ${x.to}</b>` : `<span class="lv">Lv ${x.to}</span>`}</div>
        <div class="dmgbar"><s style="width:${100 * st.dmg / top}%"></s><em>⚔ ${kfmt(st.dmg)} · ${Math.round(100 * st.dmg / total)}%</em></div>
        <div class="rst"><span title="Damage taken">🛡 ${kfmt(st.taken)}</span><span title="Kills">💥 ${st.kills}</span>${r.gauntlet ? '' : `<span class="rxp"><span class="xpbar"><i style="width:${fx.xp ? w1 : w0}%" data-w="${w1}"></i></span><span class="kw-xp">+${x.gained} XP</span></span>`}</div></div></div>`;
    }).join('');
    const foes = r.foes && r.foes.length && !r.win ? `<div class="rfoes">${r.foes.map(f => `<span class="rf ${f.dead ? 'dead' : ''} ${f.boss ? 'boss' : ''} ${f.elite ? 'elite' : ''}">${img(f.key, f.boss ? 30 : 24, 'por')}</span>`).join('')}</div>` : '';
    const bl = r.boss && r.bossElo && hasPerk('elo') ? `<p class="small dim ghostline">👹 ${esc(r.bossElo.name)}'s Elo: <b>${r.bossElo.elo}</b> (${r.bossElo.delta >= 0 ? '+' : ''}${r.bossElo.delta})</p>` : '';
    const gh = r.gauntlet && r.ghost ? `<p class="small dim ghostline">👻 ${plink(r.ghost.name, r.opp.code)}'s ghost: Elo <b>${r.ghost.elo}</b> (${r.ghost.delta >= 0 ? '+' : ''}${r.ghost.delta})</p>` : '';
    const lostRun = !r.win && !r.gauntlet ? `<p class="small dim center">${r.challenge ? 'The challenge beat you. No reward, but the game goes on.' : 'Game over.'}</p>` : '';
    return `<section class="result v2 ${ui.rmore ? 'more' : ''}"><div class="rhead ${r.win ? 'win' : 'lose'}"><span class="rays"></span><h2 class="sc headline ${r.win ? 'win' : 'lose'}">${r.win ? 'Victory' : 'Defeat'}</h2>
        ${starRow}<p class="rwhat">${what}</p><p class="rmeta">${meta}</p></div>
      ${eloLine(r)}${chips.length ? `<div class="rewards2">${chips.join('')}</div>` : ''}${promo}${lostRun}
      <div class="rheroes">${heroes}</div>${foes}${gh}${bl}
      <div class="bar"><button class="rmorebtn" data-act="result-more">${ui.rmore ? 'Less' : I('chart') + ' Details'}</button><button class="primary big" data-act="result-ok" ${r.pending ? 'disabled' : ''}>Continue</button></div></section>`;
  }

  // v42 (review #51, David: "more dopamine hits"): the rewards play in order. Confetti, the stars one by one, the gold
  // counting up and flying into the top bar, the XP bars filling, then the level ups and the MVP stamp. Every step is
  // written into r.fx, so a re-render mid-way (the Elo answer arriving) keeps what was already shown.
  async function celebrate(r) {
    if (r.fx) return;
    const fx = r.fx = {}, J = B.Juice, live = () => ui.result === r && screen === 'result';
    if (!J || J.reduced() || !r.win) { Object.assign(fx, { stars: r.stars || 0, gold: true, xp: true, done: true }); ui.goldHold = null; render(); return; }
    const head = $('.rhead'); if (head) { J.confettiAt(head, 90); head.classList.add('rflash'); }   // v58 (review #70, P1): stronger rewards
    await J.wait(380);
    for (let i = 0; i < (r.stars || 0); i++) {
      if (!live()) return; fx.stars = i + 1;
      const el = document.querySelectorAll('.rstars .st')[i]; if (el) { el.classList.add('lit', 'slam'); J.confettiAt(el, 22, { speed: 320 }); }
      sfx('star', i); if (i === 2) { const fl = $('.flawless'); if (fl) fl.classList.add('on'); }
      await J.wait(300);
    }
    if (!live()) return;
    const chip = $('.rw-gold'), gold = !r.gauntlet ? r.gold || 0 : 0;
    if (gold && chip) {
      J.bump(chip, 'pop'); chip.classList.add('glow'); J.confettiAt(chip, 18, { speed: 240 }); await J.countUp(chip.querySelector('b'), 0, gold, 620, v => '+' + v, k => sfx('tick', k)); fx.gold = true;
      J.flyCoins(chip, $('#top .gold'), Math.min(18, 6 + Math.round(gold * 0.8)), () => sfx('coin')).then(() => { if (ui.goldHold != null) { ui.goldHold = null; animGold(); } });
    } else { fx.gold = true; ui.goldHold = null; animGold(); }
    await J.wait(260); if (!live()) return;
    fx.xp = true; for (const i of document.querySelectorAll('.rh .xpbar i[data-w]')) { i.style.width = i.dataset.w + '%'; i.parentElement.classList.add('shine'); }
    { const xc = $('.rw-xp b'); if (xc) { const n = +String(xc.textContent).replace(/[^0-9]/g, '') || 0; J.bump(xc.parentElement, 'pop'); J.countUp(xc, 0, n, 600, v => '+' + v); } }
    await J.wait(750); if (!live()) return;
    fx.done = true;
    const ups = document.querySelectorAll('.rh .up.wait');
    if (ups.length) { sfx('levelup'); ups.forEach(u => { u.classList.remove('wait'); u.classList.add('on'); J.confettiAt(u, 14, { speed: 280 }); }); }
    const mvp = $('.mvpb.wait'); if (mvp) { mvp.classList.remove('wait'); mvp.classList.add('stamp'); setTimeout(() => sfx('slam'), 180); }
  }

  // ---------------- gauntlet (reviews #3 #4 by David)
  function teamRow(team, relics) {
    // review #15: the ghost's items are shown hero by hero (they fight with them, like its relics)
    return `<div class="gteam">${team.map(h => `<div class="gh">${img(h.key, 56)}<b>${esc(HEROES[h.key].name)}</b><span>Lv ${h.lvl}</span>
      <span class="gitems">${h.items.filter(id => ITEM[id]).map(id => `<img class="ico xs" src="${B.Icons.item(id, 22)}" title="${esc(ITEM[id].name + ': ' + ITEM[id].desc)}" alt="${esc(ITEM[id].name)}">`).join('') || '<i>no items</i>'}</span></div>`).join('')}</div>
      ${relics && relics.length ? `<div class="relics inline">${relics.filter(id => RELIC[id]).map(id => `<button class="relicbtn" data-act="relic-info" data-arg="${id}" title="${esc(RELIC[id].name + ': ' + RELIC[id].desc)}" aria-label="${esc(RELIC[id].name)}"><img class="ico sm" src="${B.Icons.relic(id, 26)}" alt=""></button>`).join('')}</div>` : ''}`;
  }
  // review #16 (David: "a cool UI for the gauntlet, moving up in the gauntlet"): the gauntlet is a tower. Floor k holds a
  // ghost that won at least k duels; above the last floor (the best ghost so far, `peak`) waits the crown. Your token
  // (your lead hero) stands on the floor you are fighting and climbs one floor, animated, after every win.
  const isReach = h => h.reach || h.name === 'Reached the Gauntlet';
  function towerHTML(g, mode) {
    const duels = g.history.filter(h => !isReach(h)), reach = g.history.find(isReach);
    const champion = g.status === 'champion', lost = g.status === 'lost';
    const cur = mode === 'intro' ? -1 : champion ? null : lost ? duels.length - 1 : g.round;
    const known = g.peak != null && g.peak >= 0 ? g.peak + 1 : null;   // review #27: floor k = ghosts that lost there; the champion on floor peak + 1
    const floors = Math.max(known || 0, (cur == null ? duels.length : cur + 1) + (known ? 0 : 1), 1);
    const near = mode === 'near' || mode === 'end' ? 1 : 2, lo = Math.max(0, (cur == null ? floors : Math.max(cur, 0)) - near), hi = Math.min(floors - 1, Math.max(cur == null ? floors - 1 : cur, 0) + (mode === 'near' || mode === 'end' ? 1 : 3));
    const token = run.heroes[0] ? `<span class="token">${img(run.heroes[0].key, 24, 'por')}</span>` : '<span class="token"></span>';
    const climb = ui.climb; ui.climb = false;
    const rows = [];
    rows.push(`<div class="floor crown ${champion ? 'cur' : ''}">${champion ? token : ''}<span class="fn">${I('crown')}</span><span class="grow">${champion ? '<b>Champion!</b> The crown is yours' : 'The crown'}</span></div>`);
    if (hi < floors - 1) rows.push(`<div class="floor gap">⋯ ${floors - 1 - hi} more floor${floors - 1 - hi > 1 ? 's' : ''}</div>`);
    for (let k = hi; k >= lo; k--) {
      const d = duels[k], isCur = k === cur, o = isCur && !lost ? g.opp : null;
      if (d && (d.win || lost)) {
        rows.push(`<div class="floor ${d.win ? 'cleared' : 'fell'} ${isCur ? 'cur' : ''} ${climb && k === duels.length - 1 ? 'just' : ''}">${isCur ? token : ''}<span class="fn">Floor ${k + 1}</span>
          <span class="grow">${d.win ? '✔' : '✘'} ${plink(d.name, d.code)}</span><span class="${d.delta >= 0 ? 'win' : 'lose'}">${d.delta >= 0 ? '+' : ''}${d.delta}</span></div>`);
      } else if (isCur) {
        rows.push(`<div class="floor cur">${token}<span class="fn">Floor ${k + 1}</span><span class="grow">vs <b>${o ? plink(o.name, o.code) : '?'}</b></span>${o ? `<span class="elo">⚜ ${o.elo}</span>` : ''}</div>`);
      } else {
        rows.push(`<div class="floor locked"><span class="fn">Floor ${k + 1}</span><span class="grow dim">${known && k + 1 === known ? 'the champion' : 'ghosts that fell here'}</span>${I('lock')}</div>`);
      }
    }
    if (lo > 0) rows.push(`<div class="floor gap">⋯ ${lo} floor${lo > 1 ? 's' : ''} cleared below</div>`);
    if (mode !== 'end') rows.push(`<div class="floor ground ${cur === -1 ? 'cur' : ''}">${cur === -1 ? token : ''}<span class="fn">Gate</span><span class="grow">${reach ? `Reached the Gauntlet <span class="win">+${reach.delta}</span>` : 'Your ghost enters here'}</span></div>`);
    // v53: a stack that narrows toward the crown (--n = the row's place from the top)
    return `<div class="tower ${climb ? 'climb' : ''}">${rows.map((r, i) => r.replace('<div class="floor', `<div style="--n:${i};--rows:${rows.length}" class="floor`)).join('')}</div>`;
  }
  // v27: the ladder name is picked once, here; changing it later is a Crown Shop purchase
  function gateForm() {
    const named = acct.account && !isDefaultName(acct.name);
    return `<form class="stack" data-form="gauntlet">${named ? `<input type="hidden" name="name" value="${esc(acct.name)}"><p class="small center">You enter as <b>${esc(acct.name)}</b> <span class="dim">(name changes: 👑 Crown Shop)</span></p>`
      : `<input name="name" maxlength="16" placeholder="Your name on the ladder" value="${esc(myName())}" required><p class="small dim center">Pick it well: changing it later costs 👑 ${B.SHOP_ITEM.rename.price}.</p>`}<button class="primary big">Enter the Gauntlet</button></form>`;
  }
  function gauntletHTML() {
    const g = run.g;
    if (g.status === 'intro') {
      if (g.peak == null && !ui.peakAsked) { ui.peakAsked = true; Net.get('elo?peak=1').then(r => { g.peak = r.peak; if (run.g === g && g.status === 'intro') render(); }).catch(() => {}); }
      // v53 (review #65, David: "Make the gauntlet ui more epic, its just a list right now. And it makes me scroll on my phone"):
      // a crest, one line of what it is, the tower, your team and the gate; the rules wait behind "How it works"
      return `<section class="title gintro2"><div class="gcrest">${I('trophy')}</div><h2 class="sc gtitle">The Gauntlet</h2>
        <p class="gsub">Climb a tower of other players' teams. Every win takes you up a floor; one loss ends the climb.</p>
        ${g.peak != null ? towerHTML(g, 'intro') : ''}
        ${teamRow(Run.teamSnapshot(run), run.relics)}
        <button class="hdet" data-act="g-rules">${I('help')} How it works</button>
        ${gateForm()}</section>`;
    }
    // match card
    const o = g.opp;
    const def = o.defW || o.defL ? ` As a ghost it defended ${o.defW} time${o.defW === 1 ? '' : 's'} and fell ${o.defL}.` : '';
    return `<section class="gauntlet g2"><h2 class="sc">${I('trophy')} Floor ${g.round + 1}</h2>
      <div class="gwrap">${towerHTML(g, 'near')}
      <div class="card opp vsc"><div class="vsme">${run.heroes.map(h => img(h.key, 40, 'por')).join('')}<b>You</b></div><div class="vsb">VS</div>
        <div class="row"><b class="sc">${I('ghost')} ${plink(o.name, o.code)}</b><span class="grow"></span><span class="elo">⚜ ${o.elo}</span></div>
        <p class="small vsline" title="${esc(def.trim())}">${o.status === 'champion' ? 'The reigning champion: beat it and the crown is yours.' : (o.own ? 'Your own old ghost. ' : '') + 'It lost on this floor (went ' + o.wins + '-1).'}</p>${teamRow(o.team, o.relics)}</div></div>
      <div class="bar"><button data-act="team">Team & items</button><button class="primary big" data-act="to-duel">Prepare the duel</button></div></section>`;
  }
  function stockCard(s, i) {
    const dis = s.sold || run.gold < s.price || (s.kind === 'hero' && run.heroes.length >= Run.teamMax(run));
    let body = '';
    if (s.kind === 'hero') { const h = HEROES[s.id]; body = `<div class="srow">${img(s.id, 48, 'por big')}<div><div class="ctitle">${esc(h.name)}</div><div class="tier">${h.role}</div></div></div><p class="htag">${esc(h.tag || h.abName)}</p><div class="hfoot"><span class="rangeline">${h.range <= 1 ? I('sword') + ' Up close' : I('bow') + ' From afar'}</span><button class="hdet" data-act="hero-peek" data-arg="${s.id}" aria-label="Details">${I('info')} More</button></div>`; }
    else if (s.kind === 'item') { const it = ITEM[s.id]; body = `<div class="srow">${ico('item', s.id, 52, 'ico big')}<div><div class="ctitle" style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</div>${itemTag(it)}</div></div><div class="small">${fmt(it.desc)}</div>${setInfo(it)}`; }
    else { const r = RELIC[s.id]; body = `<div class="srow">${ico('relic', s.id, 52, 'ico big')}<div><div class="ctitle relic">${esc(r.name)}</div><div class="tier t-relic">relic</div></div></div><p class="htag">${esc(r.short)}</p>${r.short !== r.desc ? `<div class="hfoot"><span></span><button class="hdet" data-act="relic-info" data-arg="${s.id}">${I('info')} More</button></div>` : ''}`; }
    // review #44: a stripe in the rarity colour (hero colour for heroes, gold for relics) makes the rarity readable at a glance
    const rc = s.kind === 'item' ? TIER_COLOR[ITEM[s.id].tier] : s.kind === 'hero' ? HEROES[s.id].color : '#ffd23f';
    // v42 (review #51): epic, set, legendary and mythic items shine; a bought card gets a SOLD stamp
    const shine = s.kind === 'item' && RANK(s.id) >= 3 ? ' shine' : s.kind === 'relic' ? ' shine soft' : '';
    return `<div class="card stock k-${s.kind}${shine} ${s.sold ? 'sold' : ''} ${ui.justSold === i ? 'just' : ''}" style="--rc:${rc}" data-i="${i}">${body}<button class="${dis ? '' : 'primary'} buyb" data-act="buy" data-arg="${i}" ${dis ? 'disabled' : ''} aria-label="${s.sold ? 'Sold' : s.price ? 'Buy for ' + s.price + ' gold' : 'Take it for free'}">${s.sold ? 'Sold' : s.price ? `<span class="price">${s.price}</span>` : 'Free!'}</button></div>`;
  }
  function shopHTML() {
    const c = run.cur, rc = Run.rerollCost(run);
    const note = c.kind === 'heroShop' ? `<p class="center"><span class="lockpill">Team ${run.heroes.length}/${Run.teamMax(run)}</span></p>` : '';
    return `<section class="shop"><h2>${c.kind === 'heroShop' ? I('user') : c.kind === 'itemShop' ? I('cart') : I('gem')} ${SHOP_NAME[c.kind]}</h2>${note}
      <div class="grid ${ui.deal ? 'deal' : ''}">${c.stock.map(stockCard).join('') || '<p>Nothing left to sell.</p>'}</div>
      <div class="bar sticky"><button data-act="reroll" class="reroll" ${run.gold < rc || (run.relics.includes('deck') && c.stock.length <= 1) ? 'disabled' : ''} aria-label="New offers for ${rc} gold">${I('refresh')} New <span class="price">${rc}</span></button><button data-act="team">${I('bag')} Team</button><button class="primary" data-act="leave">Continue ${I('arrow')}</button></div></section>`;
  }
  // v44: what an event gave, as pictures (items, relics, a hero joining, gold, XP, boosts)
  function gainsHTML(G) {
    if (!G || !G.length) return '';
    const one = g => {
      if (g.kind === 'item') { const it = ITEM[g.v]; return it ? `<div class="gain" style="--tier:${TIER_COLOR[it.tier]}">${ico('item', g.v, 56)}<b style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</b><span>${B.RARITY[it.tier].name} ${B.TYPE[it.type].name.toLowerCase()}</span></div>` : ''; }
      if (g.kind === 'relic') { const r = RELIC[g.v]; return r ? `<div class="gain" style="--tier:#ffd23f">${ico('relic', g.v, 56)}<b class="relic">${esc(r.name)}</b><span>relic</span></div>` : ''; }
      if (g.kind === 'hero') return `<div class="gain" style="--tier:${HEROES[g.v].color}">${img(g.v, 56, 'por')}<b>${esc(HEROES[g.v].name)}</b><span>joins the team</span></div>`;
      if (g.kind === 'gold') return `<div class="gain gg"><i class="bigcoin"></i><b>+${g.v}</b><span>gold</span></div>`;
      if (g.kind === 'bank') return `<div class="gain gg"><i class="gicon">🏦</i><b>+${g.v}</b><span>after your next win</span></div>`;
      if (g.kind === 'xp') return `<div class="gain gx">${g.t ? img(g.t, 56, 'por') : '<i class="gicon">✨</i>'}<b>+${g.v} XP</b><span>${g.t ? esc(HEROES[g.t].name) : 'every hero'}</span></div>`;
      if (g.kind === 'level') return `<div class="gain gx">${g.t ? img(g.t, 56, 'por') : '<i class="gicon">▲</i>'}<b>Level up!</b><span>${g.t ? esc(HEROES[g.t].name) : 'every hero'}</span></div>`;
      return `<div class="gain gb">${g.t ? img(g.t, 56, 'por') : '<i class="gicon">💪</i>'}<b>${esc(g.v)}</b><span>${g.t ? esc(HEROES[g.t].name) : 'every hero'}</span></div>`;
    };
    return `<div class="gains">${G.map(one).join('')}</div>`;
  }
  // v47 (review #58): "Sharpen: +10 attack to one hero" reads as a bold name and what it does, on two lines
  function evLabel(t) {
    const m = String(t).match(/^([^:0-9]{2,32}):\s+(.+)$/);
    return m ? `<b class="evn">${esc(m[1])}</b><span class="eve">${fmt(m[2].charAt(0).toUpperCase() + m[2].slice(1))}</span>` : fmt(t);
  }
  // review #17: 3 choices with a visible price or risk; some ask you to pick the hero, item or item type they apply to
  function eventHTML() {
    const e = EVENT[run.cur.id], chs = Run.eventChoices(run);
    const head = `<section class="event ev-${e.rar || 'common'}"><div class="evmed">${evIcon(e.id)}</div>${EV_RAR[e.rar] ? `<p class="center"><span class="evrar">${EV_RAR[e.rar]}</span></p>` : ''}<h2>${esc(e.name)}</h2><p>${esc(e.text)}</p>`;
    if (run.cur.done) return head + `${gainsHTML(run.cur.gains)}<div class="card result">${fmt(run.cur.done)}</div><div class="bar"><button class="primary big" data-act="leave">Continue ${I('arrow')}</button></div></section>`;
    const pickCh = run.cur.pick != null ? chs[run.cur.pick] : null;
    if (pickCh) {
      const ts = Run.eventTargets(run, pickCh);
      let grid;
      if (pickCh.target === 'hero') grid = ts.map(t => { const h = run.heroes.find(x => x.uid === t.uid); return `<button class="tpick" data-act="event-target" data-arg="${t.arg}">${img(h.key, 48)}<b>${esc(HEROES[h.key].name)}</b><span>Lv ${h.lvl}${pickCh.act === 'respec' && h.specs.length ? ' · ★ ' + esc((Run.specOf(h.key, h.specs[h.specs.length - 1]) || {}).name || '') : ''}</span></button>`; }).join('');
      else if (pickCh.target === 'type') grid = ts.map(t => `<button class="tpick" data-act="event-target" data-arg="${t.arg}"><img class="ico" src="${B.Icons.slot(t.type, 40)}" alt=""><b>${B.TYPE[t.type].name}</b></button>`).join('');
      else grid = ts.map(t => { const it = ITEM[t.id], who = t.uid ? run.heroes.find(h => h.uid === t.uid) : null; return `<button class="tpick item" data-act="event-target" data-arg="${t.arg}">${ico('item', t.id, 40)}<b style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</b><span>${B.RARITY[it.tier].name} ${B.TYPE[it.type].name.toLowerCase()}${who ? ' · on ' + esc(HEROES[who.key].name) : ' · bag'}</span></button>`; }).join('');
      return head + `<div class="card evpick"><div class="small">${fmt(pickCh.label)}${pickCh.cost ? ` <span class="price">${pickCh.cost}</span>` : ''}</div>
        <h3>${pickCh.target === 'hero' ? 'Choose a hero' : pickCh.target === 'type' ? 'Choose an item type' : 'Choose an item'}</h3><div class="tgrid">${grid}</div></div>
        <div class="bar"><button data-act="event-back">Back</button></div></section>`;
    }
    return head + `<div class="stack evchoices">${chs.map((ch, i) => {
      const c = Run.canChoose(run, ch), pic = ch.hero ? img(ch.hero, 40) : ch.item ? ico('item', ch.item, 40) : ch.relic ? ico('relic', ch.relic, 40) : '';
      const tag = ch.item ? `<span class="itag" style="color:${TIER_COLOR[ITEM[ch.item].tier]}">${B.RARITY[ITEM[ch.item].tier].name} ${B.TYPE[ITEM[ch.item].type].name.toLowerCase()}</span>` : '';
      // v44 (review #54): a challenge, a choice only some heroes unlock (FTL's blue options), a risk
      const tags = [], rq = ch.req && B.EVENT_REQ[ch.req], who = rq ? Run.reqHeroes(run, ch.req) : [];
      if (ch.fight) tags.push(`<span class="etag efight">${I('swords')} Challenge · fight now</span>`);
      if (rq) tags.push(who.length ? `<span class="etag ereq">${img(who[0].key, 18, 'por xs')}${esc(HEROES[who[0].key].name)} unlocks this</span>` : `<span class="etag ereq no">${I('lock')} Needs ${esc(rq.name)}</span>`);
      if (ch.risk) tags.push(`<span class="etag erisk">${I('warn')} ${esc(ch.risk)}</span>`);
      const cls = ['evch', pic ? 'haspic' : '', ch.fight ? 'isfight' : '', rq ? (who.length ? 'isreq' : 'isreq locked') : ''].filter(Boolean).join(' ');
      return `<button class="${cls}" data-act="event" data-arg="${i}" ${c.ok ? '' : 'disabled'}>${pic}<span class="t">${tags.length ? `<span class="etags">${tags.join('')}</span>` : ''}${tag}${evLabel(ch.label)}${c.ok || c.req ? '' : `<span class="why">${esc(c.why)}</span>`}</span>${ch.cost ? `<span class="price">${ch.cost}</span>` : ''}${ch.target ? '<i class="chev" title="You choose">›</i>' : ''}</button>`;
    }).join('')}</div></section>`;
  }
  function overHTML() {
    const g = run.g;
    let body;
    if (run.result === 'gauntlet' && g) {
      const d = g.elo - g.eloStart;
      // v46: the score and the Elo on one line (room for the XP panel); the tower says the rest
      body = `<h2 class="sc">${g.status === 'champion' ? '👑 Champion' : 'The Gauntlet is over'}</h2>
        <p class="gline"><b class="score sm">${g.wins}</b> duel${g.wins === 1 ? '' : 's'} won · Elo ${g.eloStart} → <b>${g.elo}</b> <span class="${d >= 0 ? 'win' : 'lose'}">(${d >= 0 ? '+' : ''}${d})</span></p>
        ${g.lgNow ? leagueLine(Object.assign({}, g.lgNow, { delta: g.lgGain, promoted: g.lgPromoted })) : ''}
        ${g.history.length ? towerHTML(g, 'end') : ''}${xpPanelHTML()}`;
    } else {
      // v42 (review #51): the end of a run as a small scoreboard: the team, fights won, the fight it fell at
      body = `<div class="evmed over">${I('flag')}</div><h2 class="sc">Game over</h2>
        <div class="overteam">${run.heroes.map(h => `<span>${img(h.key, 52, 'por')}<b>Lv ${h.lvl}</b></span>`).join('')}</div>
        <div class="overstats"><div><b>${run.won}</b><span>fight${run.won === 1 ? '' : 's'} won</span></div><div><b>${run.fightNo}</b><span>fell at fight</span></div></div>
        ${run.eloEnd != null ? `<p class="elo-line">Elo <b>${run.eloEnd}</b> <span class="lose">(${run.eloDelta})</span></p>` : ''}${leagueLine(run.lgEnd)}${xpPanelHTML()}`;
    }
    return `<section class="title">${body}
      <div class="stack againrow"><button class="primary big cta again" data-act="new-run">▶ Play again</button><button data-act="scores" aria-label="Ladder">🏆</button></div>
      <p class="hint">Something felt off? <a href="#" data-act="suggest">Suggest a change</a>.</p></section>`;
  }

  // ------------------------------------------------------------------ unit info panel
  function infoHTML() {
    const W = battle ? battle.W : preview;
    if (!W || !ui.info) return '';
    if (typeof ui.info === 'string') { const T = B.TERRAIN[ui.info]; return T ? `<div class="hrow"><span class="ticon">${T.icon}</span><b>${T.name}</b><span class="dim small">terrain</span></div><div class="small">${esc(T.desc)}</div>` : ''; }
    const u = W.byId[ui.info]; if (!u) return '';
    const hd = HEROES[u.key];
    const abil = hd ? `${abilHTML(hd)}` : u.boss ? fmt(B.BOSSES[u.key].desc) : u.abil ? fmt(MOB_ABIL[u.abil] || '') : u.fl.has('dive') ? 'Leaps to your back line at the start.' : u.kind === 'summon' ? 'Summoned unit.' : 'No special ability.';
    return `<div class="hrow">${img(u.key, 40)}<b>${esc(u.name)}</b>${u.kind === 'hero' ? ' Lv ' + u.lvl : ''}${u.elite ? ' <span class="elite">★ elite</span>' : ''}</div>
      ${chips({ hp: Math.max(0, Math.round(u.hp)) + '/' + u.maxHp, atk: Math.round(Sim.atkOf(W, u)), ap: Math.round(u.ap), armor: Math.round(Sim.armorOf(W, u)), mr: Math.round(Sim.mrOf(W, u)), as: Sim.asOf(W, u).toFixed(2), range: u.range, crit: u.crit ? pct(u.crit) : 0, dodge: u.dodge ? pct(u.dodge) : 0 }, true)}
      <div class="small">${abil}</div>${hd ? scalingHTML({ abil: u.abil, ab: u.ab, atk: Sim.atkOf(W, u), ap: u.ap, hp: u.maxHp, lvl: u.lvl, name: u.name }, true) : ''}`;
  }

  // ------------------------------------------------------------------ board mount + input
  function worldFor(preview) {
    const t = run.cur && run.cur.type;
    return t === 'gauntlet' ? Run.gauntletWorld(run, preview) : Run.fightWorld(run, preview, { takeMul: (acct.league | 0) === 0 ? 0.8 : 1 });   // review #53 (David)
  }
  // review #13 (David: "randomly adjusted to 75% of my screen ... adapt to the screen size and device"):
  // the board takes the width AND the height left on screen, on phones (portrait/landscape), tablets and desktops.
  const BOARD_RATIO = 0.703; // board height / width (render.js setup: 10.35 * size + 4 over 14.72 * size)
  function layoutClasses() {
    const vw = window.innerWidth, vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.body.classList.toggle('landscape', vw > vh * 1.25 && vh < 600);
    document.body.classList.toggle('wide', vw >= 760 && !document.body.classList.contains('landscape'));
    document.body.classList.toggle('side', document.body.classList.contains('wide') && vw >= vh * 1.1);  // review #18: panel beside the board
    document.body.classList.toggle('desk', document.body.classList.contains('side') && vw >= 1024 && vh >= 560);  // v29: a full-screen stage on computers
  }
  function boardWidth(wrap) {
    const vw = window.innerWidth, vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const land = document.body.classList.contains('landscape');
    // review #18: on tablets/desktops the deploy and battle screens put their panel in a column beside the board
    // v29 (owner: "on PC the framing is horrible"): the board takes all the height the screen has, the panel sits beside it
    if (document.body.classList.contains('desk')) return Math.floor(Math.max(300, Math.min(vw - 474, (vh - 124) / BOARD_RATIO, 1360)));
    if (document.body.classList.contains('side')) return Math.floor(Math.max(300, Math.min(Math.min(vw, 1180) - 36 - 356, (vh - 64 - 8) / BOARD_RATIO, 1000)));
    const reserved = land ? 64 : screen === 'battle' ? 175 : 215;
    const byHeight = Math.max(200, (vh - reserved - 4) / BOARD_RATIO);
    const maxW = land ? vw * 0.62 : 1000;
    return Math.floor(Math.min(wrap.clientWidth || vw - 16, byHeight, maxW));
  }
  function mountBoard() {
    const cv = $('#board'); if (!cv) return;
    const wrap = cv.parentElement;
    view = Render.setup(cv, boardWidth(wrap));
    if (screen !== 'battle') { preview = worldFor(true); drawPreview(); }
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', () => { ui.drag = null; drawPreview(); });
  }
  function drawPreview(extra) { if (view && preview && screen !== 'battle') Render.draw(view, preview, performance.now() / 50, Object.assign({ deploy: true, sel: ui.selUid }, extra || {})); }
  (function idle() { if (screen !== 'battle' && preview && document.querySelector('#board') && !ui.drag) drawPreview(); requestAnimationFrame(idle); })();
  function evHex(e) { const r = view.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return { x, y, h: Render.hexAt(view, x, y) }; }
  function unitAt(W, h) { return h && W ? W.units.find(u => !u.dead && u.c === h.c && u.r === h.r) : null; }
  function onDown(e) {
    const { h } = evHex(e); const W = battle ? battle.W : preview; const u = unitAt(W, h);
    const tk = !u && h && W && W.tk ? W.tk[B.Hex.key(h.c, h.r)] : null;
    if (u || tk) { ui.info = u ? u.id : tk; const el = $('#info'); if (el) { el.innerHTML = infoHTML(); el.classList.remove('empty'); } }
    if (battle || !h) return;
    if (u && u.side === 0 && u.uid) { ui.drag = { uid: u.uid, from: h, key: u.key }; view.canvas.setPointerCapture(e.pointerId); }
  }
  function onMove(e) { if (!ui.drag || battle) return; const { x, y, h } = evHex(e); drawPreview({ drop: h && h.r >= 4 && !Run.blockedAt(run, h.c, h.r) ? h : null, dragGhost: { x, y, key: ui.drag.key } }); }
  // review #39: a hero can't be placed on a tree, boulder, ridge or pond
  function onTerrain(h) { const x = h && (Run.mapOf(run) || { cells: [] }).cells.find(t => t.c === h.c && t.r === h.r); if (x) toast(`${B.TERRAIN[x.k].icon} ${B.TERRAIN[x.k].name}: heroes can't stand here`); return !!x; }
  function onUp(e) {
    if (battle) return;
    const { h } = evHex(e); const d = ui.drag; ui.drag = null;
    if (d && h && (h.c !== d.from.c || h.r !== d.from.r)) { if (h.r >= 4 && !onTerrain(h)) { Run.setPos(run, d.uid, h.c, h.r); ui.selUid = 0; save(); } }
    else if (d) ui.selUid = ui.selUid === d.uid ? 0 : d.uid;
    else if (ui.selUid && h && h.r >= 4 && !onTerrain(h)) { Run.setPos(run, ui.selUid, h.c, h.r); ui.selUid = 0; save(); }
    preview = worldFor(true);
    const fl = $('#formline'); if (fl) fl.innerHTML = formHTML(preview);
    drawPreview();
  }

  // ------------------------------------------------------------------ battle
  function startBattle() {
    const gau = run.cur && run.cur.type === 'gauntlet';
    const W = worldFor(false);
    save();
    battle = { W, acc: 0, last: performance.now(), endAt: 0, gau };
    store.set('balance.tips.deploy', (store.get('balance.tips.deploy', 0) | 0) + 1);
    ui.info = null; screen = 'battle'; render();
    requestAnimationFrame(loop);
  }
  function loop(now) {
    const b = battle; if (!b) return;
    const dt = Math.min(100, now - b.last); b.last = now;
    const TICK = 1000 / Sim.TPS;
    if (!b.W.over) { b.acc += dt * ui.speed; let n = 0; while (b.acc >= TICK && !b.W.over && n++ < 60) { Sim.step(b.W); b.acc -= TICK; } }
    // v42 (review #51): the last blow plays on in slow motion under a big VICTORY / DEFEAT (render.js drawEnd)
    if (b.W.over && !b.overAt) { b.overAt = now; b.end = { win: b.W.winner === 0, k: 0 }; if (!b.endAt) b.endAt = now + 1800; sfx(b.end.win ? 'win' : 'lose'); }
    const T = b.W.over ? b.W.t + (now - b.overAt) / TICK * 0.3 : b.W.t + b.acc / TICK;
    if (b.end) b.end.k = (now - b.overAt) / 1600;
    if (view) Render.draw(view, b.W, T, b.end ? { end: b.end } : {});
    const hud = $('#bhud');
    if (hud) {
      const secs = Math.floor(b.W.t / Sim.TPS);
      const title = b.gau ? `${I('trophy')} Floor ${run.g.round + 1} · ${esc(run.g.opp.name)}` : run.cur.challenge ? I('bolt') + ' ' + esc(run.cur.challenge.name) : run.cur.diff === 'boss' ? I('skull') + ' Boss' : I('swords') + ' ' + B.DIFF[run.cur.diff].name;
      const toSd = CFG.suddenDeath - secs, clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      const str = `<b>${title}</b><span class="clock ${toSd <= 0 ? 'sd' : toSd <= 10 ? 'warn' : ''}">⏱ ${clock}${toSd <= 0 ? ' · SUDDEN DEATH' : toSd <= 10 ? ' · sudden death in ' + toSd + 's' : ''}</span>`;
      if (str !== b.hudStr) { hud.innerHTML = str; b.hudStr = str; }
    }
    if ((b.frame = (b.frame || 0) + 1) % 6 === 0) { updateStrip(b.W); if (ui.info) { const el = $('#info'); if (el) { el.innerHTML = infoHTML(); el.classList.remove('empty'); } } }
    if (b.endAt && now >= b.endAt) { endBattle(); return; }
    requestAnimationFrame(loop);
  }
  async function endBattle() {
    const b = battle; battle = null; const W = b.W;
    // review #25: per hero (its summons count for it): damage dealt and taken, kills, standing at the end
    const stats = {}, dmg = {};
    for (const u of W.units) {
      const o = u.owner && W.byId[u.owner] ? W.byId[u.owner] : u; if (o.side !== 0 || !o.uid) continue;
      const st = stats[o.uid] = stats[o.uid] || { dmg: 0, taken: 0, kills: 0, alive: false };
      st.dmg += u.dmgDone || 0; st.kills += u.kb || 0;
      if (o === u) { st.taken += u.dmgTaken || 0; st.alive = !u.dead; }
    }
    for (const k in stats) dmg[k] = stats[k].dmg;
    const foes = W.units.filter(u => u.side === 1 && u.kind !== 'summon').map(u => ({ key: u.key, dead: !!u.dead, boss: !!u.boss, elite: !!u.elite }));
    const hs = W.units.filter(u => u.side === 0 && u.kind === 'hero'), hpLeft = hs.reduce((a, u) => a + Math.max(0, u.hp), 0) / Math.max(1, hs.reduce((a, u) => a + u.maxHp, 0));
    const stars = W.winner === 0 ? 1 + (hs.every(u => !u.dead) ? 1 : 0) + (hs.every(u => !u.dead) && hpLeft >= 0.6 ? 1 : 0) : 0;
    const extra = { stats, dmg, foes, time: W.t / Sim.TPS, stars };
    if (b.gau) {
      const win = W.winner === 0;
      ui.result = Object.assign({ gauntlet: true, win, xp: run.heroes.map(h => ({ uid: h.uid, name: HEROES[h.key].name, gained: 0, from: h.lvl, to: h.lvl })), opp: run.g.opp, floor: run.g.round + 1, pending: true }, extra);
      screen = 'result'; save(); render();
      try { const r = await Net.post('elo', { op: 'result', pid: pid(), ref: refCode(), teamId: run.g.teamId, win, team: Run.teamSnapshot(run), relics: run.relics }); setElo(r, r.over); logGameXp(r); Run.gauntletUpdate(run, r); Object.assign(ui.result, { delta: r.delta, elo: r.elo, ghost: r.ghost, lg: r.lg, pending: false }); ui.climb = win; }
      catch (e) { Object.assign(ui.result, { pending: false, error: e.message }); }
      save(); render(); return;
    }
    const bossKey = run.cur && run.cur.diff === 'boss' && !run.cur.challenge ? (run.cur.enemies.find(e => B.BOSSES[e.key]) || {}).key : null;
    const fightName = run.cur && run.cur.challenge ? 'Challenge · ' + run.cur.challenge.name : run.cur && run.cur.diff && B.DIFF[run.cur.diff] ? `${B.DIFF[run.cur.diff].name} fight · #${run.cur.fightNo}` : 'Fight';
    ui.result = Object.assign(Run.finishFight(run, W), extra, { fightName, bossName: bossKey ? B.BOSSES[bossKey].name : null }); screen = 'result';
    if (ui.result.win && (ui.result.gold || ui.result.bank)) ui.goldHold = run.gold - (ui.result.gold || 0) - (ui.result.bank || 0);   // the top bar waits for the coins to fly in
    if (bossKey) {  // review #20: the boss's own Elo (never the player's); v27: shown with the Content Elo unlock
      const res = ui.result;
      Net.post('elo', { op: 'boss', pid: pid(), ref: refCode(), boss: bossKey, win: res.win }).then(r => { setAcct(r); logGameXp(r); if (r.boss) { res.bossElo = r.boss; if (ui.result === res && screen === 'result') render(); } }).catch(() => {});
    }
    save(); render(); window.scrollTo(0, 0);
    if (run.phase === 'over') {  // review #3: a lost fight ends the run = Elo loss (review #14: against 1000; the fight's pieces lose too)
      ui.result.pending = true; render();
      run.xpWait = true;   // v46: the game's XP (fights won, the boss beaten) comes back with the answer
      try { const r = await Net.post('elo', Object.assign({ op: 'fail', pid: pid(), ref: refCode(), game: { fights: run.won, bosses: run.fightNo > Run.bossFight(run, 1) ? 1 : 0 } }, run.lastFight)); setElo(r, true); logGameXp(r); run.lgEnd = r.lg || null; Object.assign(ui.result, { lg: r.lg }); }  // review #24: no Elo before the gauntlet
      catch (e) { ui.result.error = e.message; run.xpErr = true; }
      run.xpWait = false;
      ui.result.pending = false; save(); render();
    }
  }
  function skipBattle() { const b = battle; if (!b) return; let n = 0; while (!b.W.over && n++ < 20 * 60 * 30) Sim.step(b.W); b.endAt = performance.now(); }

  // ------------------------------------------------------------------ modals
  // v52 (review #64, David: "Make sure menus and messages disappear between menu switches, nothing stays over"): when
  // the screen changes, a toast or a sheet left from the screen before goes away (the ones this tap just opened stay)
  function clearLeftovers() {
    const now = performance.now();
    clearTimeout(xpToast.h);
    if (toast.t && now - toast.t > 350) { const t = $('#toast'); if (t) t.classList.remove('on'); }
    if (ui.modal && ui.modal !== 'artlab' && now - (ui.modalT || 0) > 350) closeModal();
  }
  function openModal(html) { ui.modalT = performance.now(); const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; ui.modal = true; }
  function closeModal() { if (ui.modal === 'artlab' && B.ArtLab) B.ArtLab.closed(); const m = $('#modal'); m.hidden = true; m.innerHTML = ''; ui.modal = null; ui.confirmBuy = null; clearInterval(ui.sugTimer); }
  function toast(msg) { toast.t = performance.now(); const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), Math.max(2200, String(msg).length * 45)); }

  // v54 (review #66, David: "Equipping items ... is still difficult and unintuitive. Theres so many tiny slots. Cant you
  // think of a cooler inventory system that a 14yo kid will understand? Intuitive drag drop, easy, satisfying, any child
  // could do it, dopamine power fantasy"): the Gear screen. One hero at a time, big: its art, its main stats and a few big
  // gear sockets (as many as it can wear; the next ones show the level that opens them). The bag below holds big item
  // tiles. Drag an item onto the hero (or onto another hero's tab) to put it on, drag it back to the bag to take it off,
  // or tap it and use the big button. Auto-equip dresses the whole team with the best gear in one tap. Every equip pops:
  // the socket bounces, the item's effect flies onto the hero and the stat it raised counts up.
  const GEAR_PAGE = 10;
  const shortName = n => n.length > 14 ? n.split(' ').slice(-1)[0] : n;
  const gearHero = () => run.heroes.find(h => h.uid === ui.gHero) || run.heroes[0];
  const SLOT_LV = [3, 4, 5];   // each of these levels opens one more item slot (run.js slots)
  const futureSlots = h => SLOT_LV.filter(l => l > h.lvl);
  const maxSlots = h => Run.slots(run, h) + futureSlots(h).length;
  const gearStats = h => { const d = Run.heroDef(run, h); return { hp: Math.round(d.hp), atk: Math.round(d.atk), ap: Math.round(d.ap) }; };
  function gearHTML() {
    if (ui.heroInfo && run.heroes.some(h => h.uid === ui.heroInfo)) return `<div class="shead"><b>${I('user')} Hero</b><button data-act="close" aria-label="Close">✕</button></div>${heroCardHTML(run.heroes.find(h => h.uid === ui.heroInfo))}`;
    const h = gearHero(); if (!h) return '';
    ui.gHero = h.uid;
    const d = HEROES[h.key], sl = Run.slots(run, h), st = gearStats(h), sel = ui.gsel;
    const tabs = run.heroes.map(x => `<button class="gtab ${x.uid === h.uid ? 'on' : ''}" data-act="gear-hero" data-arg="${x.uid}" data-drop="hero:${x.uid}">${img(x.key, 44, 'por')}<b>${esc(HEROES[x.key].name)}</b><i>${x.items.length}/${Run.slots(run, x)}</i></button>`).join('');
    // sockets: worn items, empty ones, then the ones a level opens
    const socks = [];
    for (let i = 0; i < maxSlots(h); i++) {
      const id = h.items[i];
      if (id) { const it = ITEM[id], on = sel && sel.k === 'w' && sel.uid === h.uid && sel.i === i;
        socks.push(`<button class="gsock full ${on ? 'on' : ''}" style="--tier:${TIER_COLOR[it.tier]}" data-act="gear-pick" data-arg="w:${h.uid}:${i}" data-drag="w:${h.uid}:${i}" data-drop="sock:${h.uid}:${i}">${ico('item', id, 48)}<span>${esc(shortName(it.name))}</span></button>`); }
      else if (i < sl) socks.push(`<span class="gsock empty" data-drop="hero:${h.uid}">${I('bag')}<span>Free</span></span>`);
      else socks.push(`<span class="gsock locked">${I('lock')}<span>Lv ${futureSlots(h)[i - sl]}</span></span>`);
    }
    const sc = Run.setCounts(h.items), sets = Object.keys(sc).map(sid => `<span class="gset ${sc[sid] >= 2 ? 'on' : ''}">◆ ${esc(B.SETS[sid].name)} ${sc[sid]}/3${sc[sid] >= 2 ? ' ✓' : ''}</span>`).join('');
    // the bag, best first, a page at a time
    const order = run.bag.map((id, i) => i).sort((a, b) => RANK(run.bag[b]) - RANK(run.bag[a]) || DOLL.indexOf(ITEM[run.bag[a]].type) - DOLL.indexOf(ITEM[run.bag[b]].type));
    const pages = Math.max(1, Math.ceil(order.length / GEAR_PAGE)), pg = Math.min(ui.gPage || 0, pages - 1);
    const tiles = order.slice(pg * GEAR_PAGE, (pg + 1) * GEAR_PAGE).map(i => { const id = run.bag[i], it = ITEM[id], on = sel && sel.k === 'b' && sel.i === i, fits = Run.canEquip(run, h, id);
      return `<button class="gitem ${on ? 'on' : ''} ${fits ? '' : 'nofit'}" style="--tier:${TIER_COLOR[it.tier]}" data-act="gear-pick" data-arg="b:${i}" data-drag="b:${i}" aria-label="${esc(it.name)}">${ico('item', id, 46)}<span>${esc(shortName(it.name))}</span></button>`; }).join('');
    // what the selected item does, and the one big button
    let det = '';
    if (sel && sel.k === 'b' && run.bag[sel.i]) {
      const id = run.bag[sel.i], it = ITEM[id], same = h.items.findIndex(x => ITEM[x].type === it.type), full = same < 0 && h.items.length >= sl;
      const worst = full ? h.items.reduce((w, x, j) => RANK(x) < RANK(h.items[w]) ? j : w, 0) : -1;
      const label = same >= 0 ? `Swap for ${esc(shortName(ITEM[h.items[same]].name))}` : full ? `Swap for ${esc(shortName(ITEM[h.items[worst]].name))}` : `Put on ${esc(d.name)}`;
      det = `<div class="gdet" style="--tier:${TIER_COLOR[it.tier]}">${ico('item', id, 40)}<div class="gdt"><b style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</b> ${itemTag(it)}<span class="small">${fmt(it.desc)}</span></div>
        <div class="gdb"><button class="primary" data-act="gear-equip">${I('up')} ${label}</button><button data-act="sell">Sell ${Run.sellValue(id)}g</button></div></div>`;
    } else if (sel && sel.k === 'w' && h.items[sel.i]) {
      const id = h.items[sel.i], it = ITEM[id];
      det = `<div class="gdet" style="--tier:${TIER_COLOR[it.tier]}">${ico('item', id, 40)}<div class="gdt"><b style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</b> ${itemTag(it)}<span class="small">${fmt(it.desc)}</span></div>
        <div class="gdb"><button data-act="gear-off">${I('back')} Take off</button></div></div>`;
    } else det = `<p class="ghint">${run.bag.length ? `${I('bag')} Drag gear onto a hero, or tap it` : 'Your bag is empty. Item Shops and events fill it.'}</p>`;
    return `<div class="shead"><b>${I('bag')} Gear up</b><button data-act="close" aria-label="Close">✕</button></div>
      <div class="gtabs">${tabs}</div>
      <div class="gstage" data-drop="hero:${h.uid}">
        <button class="gart" data-act="hero-info" data-arg="${h.uid}" aria-label="${esc(d.name)}: see the hero"><img src="${por(h.key, 104, true)}" alt=""><span class="glv">Lv ${h.lvl}</span>${I('info', 'gi')}</button>
        <div class="gside"><div class="gstats"><span data-st="hp">${I('heart')}<b>${st.hp}</b></span><span data-st="atk">${I('sword')}<b>${st.atk}</b></span><span data-st="ap">${I('bolt')}<b>${st.ap}</b></span></div>
          <div class="gsockets n${Math.min(maxSlots(h), 6)}">${socks.join('')}</div>${sets ? `<div class="gsets">${sets}</div>` : ''}</div>
      </div>
      ${det}
      <div class="gbag" data-drop="bag"><div class="gbh"><b>Bag</b><span>${run.bag.length}</span>${pages > 1 ? `<span class="grow"></span><button class="gpg" data-act="gear-page" data-arg="-1" ${pg ? '' : 'disabled'} aria-label="Previous">${I('back')}</button><span>${pg + 1}/${pages}</span><button class="gpg" data-act="gear-page" data-arg="1" ${pg < pages - 1 ? '' : 'disabled'} aria-label="Next">${I('arrow')}</button>` : ''}</div>
        <div class="gbgrid">${tiles || `<p class="dim small">Empty</p>`}</div></div>
      <div class="bar gbar"><button class="gauto ${autoOn() ? 'on' : ''}" data-act="gear-auto" ${run.bag.length || run.heroes.some(h => h.items.length) ? '' : 'disabled'}>${I('bolt')} Auto-equip${autoOn() ? '<i class="gon">ON</i>' : ''}</button><button class="primary" data-act="close">Done</button></div>`;
  }
  function openGear() { openModal(gearHTML()); ui.modal = 'gear'; const sh = $('#modal .sheet'); if (sh) sh.classList.add('gearsheet'); }
  // put a bag item on hero uid: same type = swap; full = replaces the socket j (or the weakest one); returns the socket it went into
  function gearPut(bagIdx, uid, j) {
    const h = run.heroes.find(x => x.uid === uid), id = run.bag[bagIdx]; if (!h || !id) return -1;
    const same = h.items.findIndex(x => ITEM[x].type === ITEM[id].type);
    if (same < 0 && h.items.length >= Run.slots(run, h)) {
      const out = j != null && h.items[j] ? j : h.items.reduce((w, x, k) => RANK(x) < RANK(h.items[w]) ? k : w, 0);
      Run.unequip(run, uid, out);   // goes to the end of the bag: the dragged index stays valid
    }
    const err = Run.equip(run, bagIdx, uid); if (err) { toast(err); return -1; }
    return h.items.indexOf(id);
  }
  // the pop after an equip: the socket bounces, the effect flies onto the hero, the stats that rose count up
  function gearFx(uid, sock, id, before) {
    sfx('buy'); const h = run.heroes.find(x => x.uid === uid); if (!h || !B.Juice) return;
    const after = gearStats(h), s = $(`#modal .gsock[data-arg="w:${uid}:${sock}"]`), art = $('#modal .gart');
    if (s) { B.Juice.bump(s, 'pop'); B.Juice.confettiAt(s, 16, { speed: 220 }); }
    if (art && id && ITEM[id]) B.Juice.floater(art, ITEM[id].desc.split(',')[0], 'up');
    for (const k of ['hp', 'atk', 'ap']) if (after[k] !== before[k]) { const el = $(`#modal .gstats [data-st=${k}] b`); if (el) { B.Juice.countUp(el, before[k], after[k], 500); B.Juice.bump(el.parentElement); } }
  }
  // v58 (review #70, "Make Auto-equip the default gear experience"): with Auto on (the default), gear that lands in the
  // bag goes on by itself; a choice by hand in Gear turns Auto off, the purple button turns it on again
  const autoOn = () => run && run.autoGear !== false;
  function autoGear() {
    if (!autoOn() || battle || !run.bag.length || run.phase === 'over' || ui.modal === 'gear') return;
    const n = Run.autoEquip(run); if (!n) return;
    save(); header(); const t = $('#top [data-act=team]'); if (t && B.Juice) B.Juice.bump(t, 'pop');
    clearTimeout(autoGear.h); autoGear.h = setTimeout(() => toast('Auto-equip put on your new gear'), 500);
  }
  function manualGear() { if (autoOn()) { run.autoGear = false; toast('Auto-equip is off: you choose. The purple button turns it back on.'); } }
  function gearDo(fn, uid) { manualGear(); const h = run.heroes.find(x => x.uid === uid), before = h ? gearStats(h) : null; const r = fn(); ui.gsel = null; ui.gHero = uid; save(); openGear(); refreshBehind(); if (r && r.sock >= 0 && before) gearFx(uid, r.sock, r.id, before); }
  // v57 (review #69): the decisions live in run.js (Run.autoEquip: hero profiles, item scores, best match first)
  function gearAuto() { return Run.autoEquip(run); }

  // drag and drop with the pointer (mouse and touch): a ghost follows the finger, drop targets glow
  const gdrag = { on: false };
  function gearDown(e) {
    ui.gNoClick = 0;   // a new touch: an old drop no longer eats taps
    const src = e.target.closest('#modal [data-drag]'); if (!src || e.button > 0) return;
    Object.assign(gdrag, { src, x: e.clientX, y: e.clientY, on: false, id: e.pointerId, ghost: null });
  }
  function gearMove(e) {
    if (!gdrag.src || e.pointerId !== gdrag.id) return;
    if (!gdrag.on) {
      if (Math.hypot(e.clientX - gdrag.x, e.clientY - gdrag.y) < 8) return;
      gdrag.on = true; const im = gdrag.src.querySelector('img'); const g = gdrag.ghost = document.createElement('div'); g.className = 'gghost';
      if (im) g.appendChild(im.cloneNode()); document.body.appendChild(g); document.body.classList.add('gdragging'); gdrag.src.classList.add('lifted'); sfx('pick');
    }
    e.preventDefault();
    gdrag.ghost.style.left = e.clientX + 'px'; gdrag.ghost.style.top = e.clientY + 'px';
    const t = document.elementFromPoint(e.clientX, e.clientY), drop = t && t.closest('[data-drop]');
    for (const x of document.querySelectorAll('#modal .dropover')) if (x !== drop) x.classList.remove('dropover');
    if (drop) drop.classList.add('dropover');
  }
  function gearUp(e) {
    if (!gdrag.src || e.pointerId !== gdrag.id) return;
    const was = gdrag.on, src = gdrag.src.dataset.drag; gdrag.src.classList.remove('lifted');
    if (gdrag.ghost) gdrag.ghost.remove(); document.body.classList.remove('gdragging'); gdrag.src = null; gdrag.on = false;
    for (const x of document.querySelectorAll('#modal .dropover')) x.classList.remove('dropover');
    if (!was) return;
    ui.gNoClick = performance.now();
    const t = document.elementFromPoint(e.clientX, e.clientY), drop = t && t.closest('[data-drop]'); if (!drop) return;
    const [dk, da, db] = drop.dataset.drop.split(':'), [sk, sa, sb] = src.split(':');
    if (dk === 'bag' && sk === 'w') gearDo(() => { Run.unequip(run, +sa, +sb); sfx('back'); }, +sa);
    else if ((dk === 'hero' || dk === 'sock') && sk === 'b') { const id = run.bag[+sa]; gearDo(() => ({ sock: gearPut(+sa, +da, dk === 'sock' ? +db : null), id }), +da); }
    else if ((dk === 'hero' || dk === 'sock') && sk === 'w' && +da !== +sa) {
      const from = run.heroes.find(x => x.uid === +sa), id = from && from.items[+sb];
      if (id) gearDo(() => { Run.unequip(run, +sa, +sb); return { sock: gearPut(run.bag.length - 1, +da, dk === 'sock' ? +db : null), id }; }, +da);
    }
  }
  document.addEventListener('pointerdown', gearDown);
  document.addEventListener('pointermove', gearMove, { passive: false });
  document.addEventListener('pointerup', gearUp); document.addEventListener('pointercancel', gearUp);
  // a drag ends with a click on what was under the finger: that click is not a tap
  document.addEventListener('click', e => { if (ui.gNoClick && performance.now() - ui.gNoClick < 250 && e.target.closest('#modal')) { e.stopPropagation(); e.preventDefault(); ui.gNoClick = 0; } }, true);

  // review #19 (David: "include ability to read hero ability in item screen"): the hero card on top of the team sheet
  // v51 (review #63): a hero's Details from the shop or the start: the picture, what it does in plain words, the whole
  // ability with its numbers, its stats, and every level's two powers
  function heroPeekHTML(key) {
    const d = HEROES[key]; if (!d) return '';
    const def = Run.heroDef({ relics: [], heroes: [], bag: [] }, { key, lvl: 1, specs: [], items: [], bonus: {}, uid: 0 });
    return `<div class="shead"><b>${esc(d.name)}</b><button data-act="close" aria-label="Close">✕</button></div>
      <div class="peek"><img class="peekart" src="${por(key, 110, true)}" alt=""><div class="peekt"><span class="role">${esc(d.role)} · ${d.range <= 1 ? I('sword') + ' fights up close' : I('bow') + ' attacks from afar'}</span><p class="htag big">${esc(d.tag || '')}</p></div></div>
      <div class="abil peekab">${abilHTML(d)}</div>${scalingHTML(def)}
      <h3 class="peekh">Powers it can learn</h3><div class="peekpow">${d.specs.map((pr, k) => `<div class="pp"><span class="sp-lv">Lv ${k + 2}</span><div>${pr.map(sp => `<p><b class="spec">${esc(sp.name)}</b> ${fmt(plainAb(sp.desc))}</p>`).join('')}</div></div>`).join('')}</div>`;
  }
  function heroCardHTML(h) {
    const d = HEROES[h.key], def = Run.heroDef(run, h), specs = h.specs.map(id => Run.specOf(h.key, id)).filter(Boolean);
    return `<div class="hdetail"><div class="row">${img(h.key, 44)}<div class="grow"><b>${esc(d.name)}</b> <span class="lv">Lv ${h.lvl}</span> <span class="dim small">${esc(d.role)}</span>
        <div class="small">${abilHTML(d)}</div></div><button class="chip" data-act="hero-info" data-arg="0" aria-label="Close">✕</button></div>
      ${scalingHTML(def)}
      ${specs.length ? `<div class="hspecs">${specs.map(sp => `<div class="small"><b class="spec">★ ${esc(sp.name)}</b> ${fmt(sp.desc)}</div>`).join('')}</div>` : ''}
      ${Object.entries(Run.setCounts(h.items)).filter(([, n]) => n >= 2).map(([sid, n]) => `<div class="small setfull">◆ <b>${esc(B.SETS[sid].name)}</b> ${n}/3 · ${fmt(B.SETS[sid].bonus[2].desc)}${n >= 3 ? ' · ' + fmt(B.SETS[sid].bonus[3].desc) : ''}</div>`).join('')}</div>`;
  }
  function ago(ms, now) { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; }
  // Suggestions: the player writes changes into a local list (up to 10), then presses "Send for review".
  // That sends the whole list as one batch and wakes Claude (tools/vigia.js) right away.
  const MAX_DRAFTS = 10;
  const drafts = () => store.get('balance.drafts', []);
  function statusHTML(r, list) {
    if (!r) return '';
    const working = (list || []).some(s => s.status === 'doing');
    const online = working || (r.seen && r.now - r.seen < 3 * 60e3);
    const main = r.paused ? '⏸ Reviews are paused by the owner. Your list waits in the queue.'
      : working ? '🛠 Claude is reviewing a list right now. Yours goes next.'
      : online ? '🟢 Reviewer online. Claude starts as soon as you press <b>Send for review</b>.'
      : '⚪ Reviewer offline right now. Your list waits in the queue and is reviewed when it is back.';
    return `<div class="review ${online && !r.paused ? 'on' : ''}">${main}${r.lastRun ? ` <span class="dim">Last update shipped ${ago(r.lastRun, r.now)}.</span>` : ''}</div>`;
  }
  const STATUS = { new: 'queued', doing: 'in progress', held: "awaiting owner's OK", done: 'done ✓', declined: 'declined' };
  function queueHTML(list) {
    if (!list.length) return '<p class="dim small">Nothing yet. Be the first!</p>';
    const groups = [], by = {};
    for (const s of list) { if (!by[s.batch]) { by[s.batch] = []; groups.push(s.batch); } by[s.batch].push(s); }
    return groups.map(b => {
      const items = by[b].sort((x, y) => x.id - y.id), f = items[0];
      const st = items.some(x => x.status === 'doing') ? 'doing' : items.some(x => x.status === 'new') ? 'new' : items.some(x => x.status === 'held') ? 'held' : 'done';
      return `<div class="batch"><div class="row"><b>Review #${b}</b><span class="dim small">${esc(f.name || 'anonymous')} · ${new Date(f.created).toLocaleDateString()} · ${items.length} change${items.length > 1 ? 's' : ''}</span><span class="st ${st}">${STATUS[st]}</span></div>
        ${items.map(s => `<div class="sug ${s.status}"><div class="row"><span class="dim small">#${s.id}</span><span class="st">${STATUS[s.status] || esc(s.status)}</span></div><div class="txt">${esc(s.text)}</div>${s.reply ? `<div class="reply">🤖 ${esc(s.reply)}</div>` : ''}</div>`).join('')}</div>`;
    }).join('');
  }
  function draftsHTML() {
    const d = drafts();
    return d.length ? `<ol class="drafts">${d.map((t, i) => `<li><span>${esc(t)}</span><button class="chip" data-act="draft-del" data-arg="${i}" aria-label="Remove">✕</button></li>`).join('')}</ol>`
      : '<p class="dim small">Your list is empty.</p>';
  }
  function renderDrafts() {
    const el = $('#drafts'); if (el) el.innerHTML = draftsHTML();
    const n = drafts().length, btn = $('[data-act=send-review]');
    if (btn) btn.textContent = n ? `Send ${n} change${n > 1 ? 's' : ''} for review` : 'Send for review';
    const add = $('form[data-form=draft] button'); if (add) add.disabled = n >= MAX_DRAFTS;
  }
  function suggestShell() {
    return `<div class="shead"><b>${I('bulb')} Suggest changes</b><button data-act="close">✕</button></div>
      <div id="sugStatus"></div>
      <p class="small">Write each change and tap <b>Add</b>. Got 5 ideas? Add all 5, then tap <b>Send for review</b>. Claude reviews the whole list and ships it. A bar at the top of the page tells you when it is ready: press F5 and play the new version.</p>
      <form data-form="draft" class="stack">
        <textarea name="text" maxlength="1500" rows="3" placeholder="A bug, a rebalance, a new hero, item or relic, a UI change, a full restructure... One change per note. Any language is fine."></textarea>
        <button>+ Add to my list</button>
      </form>
      <h3>My list</h3><div id="drafts">${draftsHTML()}</div>
      <div class="row"><input id="sugName" maxlength="24" placeholder="Your name (optional)" value="${esc(store.get('balance.name', ''))}"><button class="primary" data-act="send-review">Send for review</button></div>
      <p class="small">Made hero art? <a href="#" data-act="art-lab">Try it in the 🎨 Art Lab</a> and send the pictures from there.</p>
      <p class="dim small">Everything sent is public. Claude implements what fits the game, replies to each change, and declines anything harmful or unrelated to the game.</p>
      <div class="row"><h3>Queue</h3><span class="grow"></span><button class="chip" data-act="sug-refresh">↻ Refresh</button></div><div id="sugQueue"><p class="dim">Loading…</p></div>`;
  }
  async function loadQueue() {
    try {
      const d = await Net.get('suggest');
      if (ui.modal !== 'suggest') return;
      $('#sugStatus').innerHTML = statusHTML(d.review, d.list); $('#sugQueue').innerHTML = queueHTML(d.list);
    } catch (e) { const q = $('#sugQueue'); if (q && ui.modal === 'suggest') q.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  function openSuggest() {
    openModal(suggestShell()); ui.modal = 'suggest'; renderDrafts(); loadQueue();
    clearInterval(ui.sugTimer); ui.sugTimer = setInterval(() => { if (ui.modal === 'suggest') loadQueue(); else clearInterval(ui.sugTimer); }, 20000);
  }
  async function sendReview(btn) {
    const ta = $('form[data-form=draft] textarea'), extra = ta ? ta.value.trim() : '';
    const items = drafts().concat(extra ? [extra] : []).slice(0, MAX_DRAFTS);
    if (!items.length) { toast('Add at least one change first'); return; }
    const name = (($('#sugName') || {}).value || '').trim(); store.set('balance.name', name);
    btn.disabled = true;
    try {
      const r = await Net.post('suggest', { items, name });
      store.set('balance.drafts', []); if (ta) ta.value = '';
      renderDrafts(); toast(`Sent! Review #${r.batch} (${items.length} change${items.length > 1 ? 's' : ''}) is in the queue.`); trackBatch(r.batch); loadQueue();
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  }
  // review #14 (David): a tab per kind of content with its own Elo, to balance heroes, items and relics
  const LADDER_TABS = [['player', 'Player'], ['players', 'Ranking'], ['hero', 'Heroes'], ['item', 'Items'], ['relic', 'Relics']];
  const CONTENT_TABS = ['hero', 'item', 'relic'];
  // review #21 (David: "a player tab with scrolling banners for the leagues and the path between tiers")
  function playerTabHTML(me) {
    const L = B.LEAGUES, R = B.LEAGUE_RULES, cur = me.league | 0, top = L.length - 1, lp = me.lp | 0;
    const paid = me.sreach | 0;
    const banners = L.map((l, i) => {
      const st = i < cur ? 'Reached ✓' : i === cur ? (i === top ? `${lp} points · no ceiling` : `${lp} / ${R.step} points`) : i === top ? `${R.step} points in ${L[i - 1].name} · no ceiling` : `${R.step} points in ${L[i - 1].name}`;
      const cr = i ? `<span class="lgc ${paid >= i ? 'got' : ''}">👑 ${B.CROWNS.league[i]}${paid >= i ? ' ✓' : ''}</span>` : '';
      return `<div class="lgb ${i < cur ? 'done' : i === cur ? 'cur' : 'locked'}" style="--lc:${l.color};--lh:${l.hi}"><span class="rod"></span>${emblem(i, 40)}<b>${l.name}</b><span class="lgs">${st}</span>${cr}
        ${i === cur && i < top ? `<span class="lgbar"><i style="width:${100 * lp / R.step}%"></i></span>` : i === cur ? '<span class="here">You are here</span>' : ''}</div>`;
    }).join('');
    const path = L.map((l, i) => `<span class="pn ${i < cur ? 'done' : i === cur ? 'cur' : ''}" title="${l.name}">${emblem(i, i === cur ? 30 : 22)}</span>${i < top ? `<span class="pl"><i style="width:${i < cur ? 100 : i === cur ? Math.round(100 * lp / R.step) : 0}%"></i></span>` : ''}`).join('');
    const season = me.season || B.seasonOf(Date.now()), days = Math.max(0, Math.ceil((B.seasonEnds(season) - Date.now()) / 864e5));
    return `<div class="ptab"><div class="pme">${emblem(cur, 52)}<div><b>${me.code ? plink(me.name || 'You', me.code) : esc(me.name || 'You')}</b><span class="pl1" style="color:${L[cur].hi}">${L[cur].name} league</span>
        <span class="small">${cur >= top ? `${lp} points in Celestial` : `${lp}/${R.step} points to ${L[cur + 1].name}`}</span><span class="dim small">Elo ${me.elo} · ${me.runs} games · best ${me.best}${me.titles ? ' · 🏆 ' + me.titles : ''} · ${crowns(me.crowns)}</span></div></div>
      ${roadmapHTML(me)}
      <h3 class="lgh">Leagues <span class="seasonl">Season ${season} · ${days} day${days === 1 ? '' : 's'} left</span></h3>
      <div class="lgscroll mini" id="lgscroll">${banners}</div>
      <div class="lgpath">${path}</div>
      <p class="small dim">+${R.duelWin} league point for each Gauntlet duel you win, ${R.pveLoss} when a game ends before the Gauntlet (a PvE loss). ${R.step} points move you up one league and you never drop a league during a season. Celestial has no ceiling. The first time you reach a league in a season you earn the crowns on its banner. A season lasts ${B.SEASON.days} days; then everyone starts again from Bronze (your best league stays on your profile).</p>
      <div class="row center"><button data-act="my-profile">👤 My profile</button><button data-act="shop">👑 Crown Shop</button></div></div>`;
  }
  // review #28 (PC boy): the account level and the road of rewards (one new hero, item or relic per level)
  function roadmapHTML(me) {
    const xp = me.axp | 0, L = B.levelProgress(xp), lvl = L.lvl, per = L.need, inLv = L.into, max = B.UNLOCKS[B.UNLOCKS.length - 1].lvl, X = B.GAME_XP;
    const pic = u => u.kind === 'hero' ? img(u.id, 44, 'por') : ico(u.kind, u.id, 44);
    const nodes = B.UNLOCKS.map(u => `<div class="rmn ${u.lvl <= lvl ? 'got' : u.lvl === lvl + 1 ? 'next' : ''}"><span class="rml">Lv ${u.lvl}</span>${pic(u)}<b>${esc(unlockName(u))}</b><i>${u.kind}</i><em>${u.lvl <= lvl ? '✓' : '🔒'}</em></div>`).join('');
    return `<div class="acctlv"><div class="alh"><span class="lvb">${lvl}</span><div class="alb"><b>Account level ${lvl}</b>
        <span class="xpbar big"><i style="width:${lvl > max ? 100 : Math.round(100 * inLv / per)}%"></i></span>
        <span class="small">${lvl > max ? `${xp} XP · every reward unlocked` : `${inLv}/${per} XP to level ${lvl + 1}`}</span></div></div>
      <div class="roadmap" id="roadmap">${nodes}</div>
      <p class="small xpways">Every game: 🎮 +${X.played} for playing · ⚔️ +${X.fight} per fight won · 👹 +${X.boss} per boss beaten · 🏆 +${X.reached} for reaching the Gauntlet · 🤺 +${X.duel} per duel won · 👑 +${X.champion} for the crown. Each level needs a bit more XP than the last.</p>
      <p class="small xpways">Bonus firsts: ⭐ first PvE clear with each hero +${B.ACCOUNT.heroClear} <span class="dim">(${me.cleared | 0}/${Object.keys(HEROES).length})</span> · 🏆 each new Gauntlet floor +${B.ACCOUNT.floor} <span class="dim">(best floor ${me.pfloor | 0})</span> · 👹 each boss beaten the first time +${B.ACCOUNT.boss} <span class="dim">(${me.bosses | 0}/${Object.keys(B.BOSSES).length})</span> · 💎 +${B.ACCOUNT.crownXp} per crown spent${hasPerk('xp2') ? ' · <b class="kw-gold">✨ Double XP on</b>' : ''}</p></div>`;
  }
  function contentTable(kind, ratings) {
    // review #20: the bosses sit in the heroes tab with their own Elo
    const by = {}; for (const r of ratings) if (r.kind === kind || (kind === 'hero' && r.kind === 'boss')) by[r.id] = r;
    const ids = kind === 'hero' ? Object.keys(HEROES).concat(Object.keys(B.BOSSES)) : kind === 'item' ? B.ITEMS.map(i => i.id) : B.RELICS.map(r => r.id);
    const def = id => kind === 'hero' ? HEROES[id] || B.BOSSES[id] : kind === 'item' ? ITEM[id] : RELIC[id];
    const pic = id => kind === 'hero' ? img(id, 28, 'por sm') : ico(kind, id, 28, 'ico sm');
    const noFight = id => kind !== 'hero' && B.NONCOMBAT[kind].includes(id);
    const rated = ids.filter(id => by[id] && by[id].games).sort((a, b) => by[b].elo - by[a].elo || by[b].games - by[a].games);
    const rest = ids.filter(id => !rated.includes(id)).sort((a, b) => noFight(a) - noFight(b));
    const name = id => `<td class="who">${pic(id)}<span${kind === 'item' ? ` style="color:${TIER_COLOR[ITEM[id].tier]}"` : B.BOSSES[id] ? ' class="bossname"' : ''}>${B.BOSSES[id] ? '👹 ' : ''}${esc(def(id).name)}</span></td>`;
    const rows = rated.map((id, i) => { const r = by[id]; return `<tr><td>${i + 1}</td>${name(id)}<td><b>${r.elo}</b></td><td>${r.games}</td><td>${Math.round(100 * r.wins / r.games)}%</td></tr>`; }).join('')
      + rest.map(id => `<tr class="unrated"><td></td>${name(id)}<td colspan="3">${noFight(id) ? 'no combat effect' : 'not played yet'}</td></tr>`).join('');
    return `<p class="dim small">📊 Content Elo unlocked. Every ${kind} has its own Elo, apart from the players, to guide balance. It only counts in fights where it acted: heroes on the board, equipped items and relics with a combat effect. Losing a game is a loss against 1000, reaching the Gauntlet a win against 1000, and a duel is a game against the other team's ${kind === 'hero' ? 'heroes' : kind + 's'}.${kind === 'hero' ? ' ☠ Bosses have their own Elo: it rises when they beat a player and falls when they lose (against that player\'s Elo), and never changes the player\'s.' : ''}</p>
      <table class="tbl ctbl"><tr><th>#</th><th>${kind === 'hero' ? 'Hero' : kind === 'item' ? 'Item' : 'Relic'}</th><th>Elo</th><th>Fights</th><th>Won</th></tr>${rows}</table>`;
  }
  async function openScores(tab) {
    tab = ui.ladderTab = tab || ui.ladderTab || 'players';
    const head = `<div class="shead"><b>${I('trophy')} Ladder</b><button data-act="close">✕</button></div>
      <div class="tabs">${LADDER_TABS.map(([k, n]) => `<button data-act="ladder-tab" data-arg="${k}" class="${k === tab ? 'on' : ''}">${n}${CONTENT_TABS.includes(k) && !hasPerk('elo') ? ' 🔒' : ''}</button>`).join('')}</div>`;
    openModal(head + '<p class="dim">Loading…</p>');
    try {
      if (tab === 'player') {
        const me = await Net.post('elo', { op: 'hello', pid: pid() }); setElo(me);
        if (ui.modal && ui.ladderTab === tab) {
          openModal(head + playerTabHTML(me)); header();
          const sc = $('#lgscroll'), c = sc && sc.querySelector('.lgb.cur');
          if (c) sc.scrollLeft = c.offsetLeft - (sc.clientWidth - c.clientWidth) / 2;
          const rm = $('#roadmap'), n = rm && (rm.querySelector('.rmn.next') || rm.querySelector('.rmn:last-child'));
          if (n) rm.scrollLeft = n.offsetLeft - (rm.clientWidth - n.clientWidth) / 2;
        }
        return;
      }
      if (tab !== 'players') {
        if (!hasPerk('elo')) await loadAcct();
        if (!hasPerk('elo')) {
          if (ui.modal && ui.ladderTab === tab) openModal(head + `<div class="klock"><span class="hi">📊</span><b>Content Elo is a Crown Shop unlock</b>
            <p class="small">Every hero, boss, item and relic has its own Elo, fights and win rate, to guide balance. Unlock the Heroes, Items and Relics tabs for 👑 ${B.SHOP_ITEM.elo.price} (the King Tier includes it).</p>
            <button class="primary" data-act="shop">👑 Crown Shop</button></div>`);
          return;
        }
        const e = await Net.post('player', { op: 'ratings', pid: pid() });
        if (ui.modal && ui.ladderTab === tab) openModal(head + contentTable(tab, e.ratings || []));
        return;
      }
      const e = await Net.get('elo');
      const eRows = e.top.map((p, i) => `<tr><td>${i + 1}</td><td class="who">${emblem(p.league || 0, 20)}${p.king ? '<span class="kingmark" title="King Tier">👑</span>' : ''}${plink(p.name, p.code)}</td><td><b>${p.elo}</b></td><td>${p.best}</td><td>${p.titles ? '🏆' + p.titles : ''}</td></tr>`).join('');
      if (ui.modal && ui.ladderTab === tab) openModal(head + `<p class="dim small">Rated only by Gauntlet duels against player ghosts (a ghost's defenses do not move its player's Elo). Best = most duels won in one run, 🏆 = champion titles, 👑 = King Tier. Tap a name to open the profile.</p>
        ${eRows ? `<table class="tbl"><tr><th>#</th><th>Name</th><th>Elo</th><th>Best</th><th></th></tr>${eRows}</table>` : '<p class="dim">No rated players yet.</p>'}`);
    } catch (err) { if (ui.modal && ui.ladderTab === tab) openModal(head + `<p class="err">${esc(err.message)}</p>`); }
  }
  // ---------------- v27 (owner + review #25 by David): Crown Shop, profiles, invites
  function crownShopHTML() {
    const a = acct, season = a.season || B.seasonOf(Date.now()), days = Math.max(0, Math.ceil((B.seasonEnds(season) - Date.now()) / 864e5)), paid = a.account ? a.sreach | 0 : 0;
    const buyBtn = it => { const conf = ui.confirmBuy === it.id, cant = !a.account || (a.crowns | 0) < it.price;
      return `<button class="cprice ${conf ? 'confirm' : ''}" data-act="buy-perk" data-arg="${it.id}" ${cant ? 'disabled' : ''}>${conf ? 'Tap again to buy · ' : ''}👑 ${it.price}</button>`; };
    const perk = it => { const own = hasPerk(it.id);
      return `<div class="perk ${own ? 'own' : ''}"><span class="pi">${it.icon}</span><div class="pb"><b>${esc(it.name)}</b><p class="small">${esc(it.desc)}</p></div>${own ? '<span class="owned">Owned ✓</span>' : buyBtn(it)}</div>`; };
    const rn = B.SHOP_ITEM.rename, K = B.SHOP_ITEM.king, king = hasPerk('king'), skin = store.get('balance.skin', 'royal');
    const leagues = B.LEAGUES.map((l, i) => i ? `<div class="crl ${paid >= i ? 'got' : ''}">${emblem(i, 24)}<b>${l.name}</b><span>👑 ${B.CROWNS.league[i]}</span><i>${paid >= i ? '✓' : ''}</i></div>` : '').join('');
    const link = a.account && a.code ? location.origin + '/?ref=' + a.code : '';
    return `<div class="shead"><b>${I('crown')} Crown Shop</b><button data-act="close">✕</button></div>
      <div class="wallet"><span class="wc">👑</span><div><b>${a.crowns | 0}</b> crown${(a.crowns | 0) === 1 ? '' : 's'}<span class="small dim">Season ${season} · ${days} day${days === 1 ? '' : 's'} left</span></div></div>
      ${a.account ? '' : '<p class="small center dim">Your account starts when your first game ends. Then crowns, unlocks and your invite link live here.</p>'}
      <h3>Earn crowns</h3>
      <p class="small">Reach a league for the first time this season (win Gauntlet duels for league points). A new season every ${B.SEASON.days} days sends everyone back to Bronze, so the crowns come again.</p>
      <div class="crlist">${leagues}</div>
      <h3>Perks</h3>
      ${perk(B.SHOP_ITEM.speed4)}${perk(B.SHOP_ITEM.elo)}${perk(B.SHOP_ITEM.xp2)}${perk(B.SHOP_ITEM.skip)}
      <div class="perk"><span class="pi">${rn.icon}</span><div class="pb"><b>${esc(rn.name)}</b><p class="small">${esc(rn.desc)}${a.account ? ` Now: <b>${esc(a.name || '')}</b>.` : ''}</p>
        <form class="row" data-form="rename"><input name="name" maxlength="16" placeholder="New name" ${a.account ? '' : 'disabled'}><button class="cprice" ${!a.account || (a.crowns | 0) < rn.price ? 'disabled' : ''}>👑 ${rn.price}</button></form></div></div>
      <div class="king ${king ? 'own' : ''}"><div class="kh"><span class="kcrown">👑</span><div><b>King Tier</b><span class="small">${king ? 'You are a King' : 'The top of the shop'}</span></div><span class="rboard" aria-hidden="true"></span></div>
        <ul class="small"><li><b>Royal board</b>: violet and gold stone, only for Kings</li><li><b>Deeper profiles</b>, yours and everyone else's: most played heroes, best win rate heroes, the wins and losses of all their ghosts</li><li>A 👑 next to your name on the ladder and on your profile</li><li>Includes <b>4× speed</b> and <b>Content Elo</b></li></ul>
        ${king ? `<div class="row"><span class="small">Board</span><button class="${skin === 'royal' ? 'on' : ''}" data-act="skin" data-arg="royal">Royal</button><button class="${skin !== 'royal' ? 'on' : ''}" data-act="skin" data-arg="classic">Classic</button></div>` : buyBtn(K)}</div>
      <h3>Invite friends</h3>
      <div class="invite"><p class="small">A friend who starts playing from your link is yours for good: every time they earn crowns by playing, you get ${Math.round(B.CROWNS.referPct * 100)}% of it (at least ${B.CROWNS.referMin} crown).</p>
        ${link ? `<div class="row"><input id="refLink" readonly value="${esc(link)}"><button data-act="copy-ref">Copy</button></div><p class="small dim">${a.refs | 0} friend${(a.refs | 0) === 1 ? '' : 's'} joined · they earned you 👑 ${a.refCrowns | 0}</p>` : '<p class="small dim">Your invite link appears after your first run.</p>'}</div>`;
  }
  function openShop(noFetch) {
    openModal(crownShopHTML()); ui.modal = 'shop';
    if (!noFetch) loadAcct().then(() => { if (ui.modal === 'shop') { const sc = $('#modal .sheet'), y = sc ? sc.scrollTop : 0; openModal(crownShopHTML()); ui.modal = 'shop'; const s2 = $('#modal .sheet'); if (s2) s2.scrollTop = y; } header(); });
  }
  function refreshShop() { const sc = $('#modal .sheet'), y = sc ? sc.scrollTop : 0; openModal(crownShopHTML()); ui.modal = 'shop'; const s2 = $('#modal .sheet'); if (s2) s2.scrollTop = y; if (screen === 'title') render(); else header(); }
  function heroList(rows, what) {
    return rows.length ? `<div class="phl">${rows.map(r => `<span class="phh">${img(r.hero, 34, 'por')}<b>${esc((HEROES[r.hero] || { name: r.hero }).name)}</b><em>${what(r)}</em></span>`).join('')}</div>` : '<p class="small dim">Not enough games yet.</p>';
  }
  function profileHTML(p, viewerKing) {
    const L = B.LEAGUES, l = L[p.league] || L[0], top = L.length - 1, R = B.LEAGUE_RULES;
    const since = p.since ? new Date(p.since).toLocaleDateString() : '';
    const stat = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
    const more = p.more ? `<div class="pmore"><h3>👑 King's view</h3>
        <div class="pmh">Most played heroes</div>${heroList(p.more.most, r => `${r.games} game${r.games === 1 ? '' : 's'}`)}
        <div class="pmh">Best win rate <span class="dim">(3+ games)</span></div>${heroList(p.more.best, r => `${Math.round(100 * r.wins / r.games)}% of ${r.games}`)}
        <div class="pmh">Ghosts</div><p class="gw"><b class="win">${p.more.ghosts.w}</b> wins · <b class="lose">${p.more.ghosts.l}</b> losses <span class="dim small">defending, over ${p.more.ghosts.n} ghost${p.more.ghosts.n === 1 ? '' : 's'}</span></p>
        <p class="small dim">Games = finished games (lost or reached the Gauntlet) and Gauntlet duels.</p></div>`
      : `<div class="klock"><span class="hi">👑</span><b>King Tier</b><p class="small">Kings also see ${p.own ? 'your' : "this player's"} most played heroes, best win rate heroes and the wins and losses of ${p.own ? 'your' : 'their'} ghosts.</p><button data-act="shop">👑 Crown Shop</button></div>`;
    return `<div class="shead"><b>${I('user')} Profile</b><button data-act="close">✕</button></div>
      <div class="prof" style="--lc:${l.color};--lh:${l.hi}">
        <div class="phead">${emblem(p.league, 66)}<div><b class="pname">${p.king ? '<span class="kingmark" title="King Tier">👑</span>' : ''}${esc(p.name)} <span class="lvb sm" title="Account level">${p.level || 1}</span></b><span class="pl1" style="color:${l.hi}">${l.name} league</span>
          <span class="small dim">${p.league >= top ? `${p.lp} points` : `${p.lp}/${R.step} points`} · Season ${p.season}${since ? ' · since ' + since : ''}</span></div></div>
        <div class="pstats">${stat(p.elo, 'Elo')}${stat(p.best ? `${p.best} win${p.best === 1 ? '' : 's'}` : '—', 'Best Gauntlet')}${stat(p.titles ? '🏆 ' + p.titles : '—', 'Champion titles')}${stat(p.runs, 'Games')}
          <div>${emblem(p.peakLeague, 24)}<span>Best league</span></div><div>${p.lastLeague >= 0 ? emblem(p.lastLeague, 24) : '<b>—</b>'}<span>Last season</span></div></div>
        ${more}
        ${p.own ? `<div class="row center"><button data-act="shop">👑 Crown Shop · ${acct.crowns | 0}</button></div>` : ''}</div>`;
  }
  async function openProfile(code) {
    const shell = b => `<div class="shead"><b>${I('user')} Profile</b><button data-act="close">✕</button></div>${b}`;
    openModal(shell('<p class="dim">Loading…</p>')); ui.modal = 'profile'; ui.profile = code;
    try {
      const r = await Net.post('player', { op: 'profile', pid: pid(), code });
      if (ui.modal === 'profile' && ui.profile === code) { openModal(profileHTML(r.profile, r.viewerKing)); ui.modal = 'profile'; }
    } catch (e) { if (ui.modal === 'profile' && ui.profile === code) { openModal(shell(`<p class="err">${esc(e.message)}</p>`)); ui.modal = 'profile'; } }
  }
  async function openMyProfile() {
    if (!acct.account) await loadAcct();
    if (acct.account && acct.code) return openProfile(acct.code);
    openModal(`<div class="shead"><b>${I('user')} Profile</b><button data-act="close">✕</button></div>
      <div class="klock"><span class="hi">👤</span><b>Your profile starts with your first game</b><p class="small">When a game ends, your league, Elo, best Gauntlet and champion titles show up here, and anyone can open your profile by tapping your name.</p>
      <button class="primary" data-act="new-run">▶ Play</button></div>`);
  }
  // v45 (review #56): the basics first, in five short lines for someone who never played this kind of game; the full
  // rules fold under them
  const HOWTO = `<div class="shead"><b>How to play</b><button data-act="close">✕</button></div>
    <ol class="howbasics">
      <li>${I('user')}<span><b>Pick a hero and a relic.</b> Buy up to 2 more heroes in the Hero Shop.</span></li>
      <li>${I('map')}<span><b>Every day, pick a path:</b> a fight, a shop or an event.</span></li>
      <li>${I('shield')}<span><b>Before a fight, drag your heroes onto the board.</b> Tanks in front, ranged behind.</span></li>
      <li>${I('swords')}<span><b>The fight plays by itself.</b> Win for gold and XP. Heroes level up and use their power when the blue bar is full.</span></li>
      <li>${I('skull')}<span><b>Beat 2 bosses, then climb the Gauntlet</b> against other players' teams. Lose one fight and the game is over.</span></li>
    </ol>
    <details class="howmore"><summary>All the rules</summary>
    <ol class="small howto">
      <li>Start with 1 hero and 1 relic (3 of each offered). Each hero has a unique ability that fires when its blue mana bar is full. Recruit up to 3 heroes in the Hero Shop.</li>
      <li>Every step offers 2 options: easy/medium/hard fights, or a shop/event. Fights 4 and 8 are bosses.</li>
      <li>❓ Events: trades, bets, relics and items to pick, and <b>challenges</b> (optional fights that start right away: win for a reward; lose and only that reward is gone, the game goes on). Some choices only open with the right hero in your team.</li>
      <li>Before each fight, place heroes in the 4 blue rows. Then the battle plays itself.</li>
      <li>⚑ Formation relics reward where you place your heroes (next to each other, alone, in the front or back row, in one line, next to terrain). While deploying, the line above the board shows who gets what.</li>
      <li>🗺 Every fight after the first is on a map with terrain: 🌳 trees, 🪨 boulders, ⛰️ ridges and 💧 ponds block the way (nobody can stand on them or walk through; arrows and spells fly over). Units pushed into a tree, boulder or ridge are slammed and stunned. Bosses fight at the Standing Stones.</li>
      <li>How abilities scale: every ability names its stat. <b>AD</b> = attack (⚔). <b>AP</b> = ability power (✦): 100 at Lv 1, +30 per level, more from items. <span class="kw-atk">Physical</span> abilities deal a % of AD; <span class="kw-ap">magic</span> abilities deal a % of AP, of AD, or of both added together (like "40% AD + 20% AP"); heals scale with AP; shields are a % of max HP. AP never multiplies AD. Tap a hero (in battle or in Team) to see its numbers.</li>
      <li>Heroes earn XP for every second they stay alive. Level ups raise stats and let you pick a specialization. From Lv 3, each level adds an item slot. Lv 5 is rare.</li>
      <li>Items have a type (weapon, off-hand, helmet, armor, gloves, boots, trinket) and a rarity: <span class="r-common">common</span>, <span class="r-uncommon">uncommon</span>, <span class="r-rare">rare</span>, <span class="r-epic">epic</span>, <span class="r-set">set</span>, <span class="r-legendary">legendary</span> and <span class="r-mythic">mythic</span>. A hero wears one item of each type, up to their slot count. Two or three pieces of a set on the same hero unlock set bonuses.</li>
      <li>Win fights for gold. Spend it in hero, item and relic shops. Your team holds up to 3 heroes. Lose a single fight and the game ends (and costs 2 league points). Heroes always heal after a fight.</li>
      <li>After the second boss and a last shop, your team enters the Gauntlet as a ghost and climbs a tower of other players' ghosts, one floor per win: each floor holds the ghosts that lost there. One loss ends it and your ghost stays on that floor. The top floor holds the one champion: beat it (or reach a floor nobody reached) and you are the champion until someone beats your ghost. Each duel is an Elo game; your Elo only moves in duels. The ghost keeps its own Elo and record.</li>
      <li>Leagues: +1 point per duel won, -2 when a game ends before the Gauntlet; 10 points move you up a league. A season lasts ${B.SEASON.days} days, then everyone starts again from Bronze.</li>
      <li>👑 Crowns: earned the first time you reach each league in a season, and from friends who joined with your invite link (1% of what they earn, at least 1). Spend them in the Crown Shop: 4× battle speed, Content Elo (the Elo of every hero, item and relic), name changes, and the King Tier (Royal board, deeper profiles).</li>
      <li>Tap any player's name to open their profile: league, Elo, best Gauntlet and champion titles.</li>
      <li>✨ Account level: every game earns XP by how far it went (+${B.GAME_XP.played} for playing, +${B.GAME_XP.fight} per fight won, +${B.GAME_XP.boss} per boss, +${B.GAME_XP.reached} for reaching the Gauntlet, +${B.GAME_XP.duel} per duel won, +${B.GAME_XP.champion} for the crown), plus bonuses the first time you clear PvE with each hero (+${B.ACCOUNT.heroClear}), reach each Gauntlet floor (+${B.ACCOUNT.floor}) and beat each boss (+${B.ACCOUNT.boss}), and for crowns spent (+${B.ACCOUNT.crownXp} each). Each level needs a bit more XP than the last, and levels 2 to 19 each unlock a new hero, item or relic (see the road on the title or in Ladder → Player).</li>
    </ol></details>`;


  // ------------------------------------------------------------------ review notice (top bar)
  // After "Send for review" the page follows that batch: queued -> Claude working -> READY ("press F5"). Claude marks
  // items done only AFTER the update is deployed, so "all items answered" means the new version is already live.
  // Everyone else gets a softer "the game was just updated" when a new update ships while the page is open.
  const PEND = 'balance.pending';
  const nt = { lastRun: null, latest: 0, update: false, timer: 0 };
  function renderNotice() {
    const el = $('#notice'); if (!el) return;
    const p = store.get(PEND, null);
    let cls = '', html = '';
    if (p && p.state === 'waiting') {
      cls = 'wait';
      const where = p.held ? `#${p.batch} waits for the owner` : p.working ? `#${p.batch} in progress` : p.ahead ? `#${p.batch} queued (${p.ahead} ahead)` : `#${p.batch} sent`;
      html = `⏳ ${where}`;   // v58 (review #70, "Remove or minimise the review-status banner"): one short line, tap for details
    } else if (p && p.state === 'ready' && p.done > 0) {
      cls = 'ready'; html = `✅ Your changes are live: tap to reload`;
    } else if (p && (p.state === 'shown' || (p.state === 'ready' && !p.done))) {
      cls = 'info';
      html = p.done ? `✅ #${p.batch} live: tap for replies` : `#${p.batch} done: tap for replies`;
      html += '<span class="nx" data-act="notice-x" aria-label="Dismiss">✕</span>';
    } else if (nt.update) {
      cls = 'info'; html = '🔄 New version: tap to reload<span class="nx" data-act="notice-x" aria-label="Dismiss">✕</span>';
    }
    el.className = cls; el.innerHTML = html; el.hidden = !html;
  }
  function trackBatch(batch) { store.set(PEND, { batch, state: 'waiting', sentAt: Date.now() }); nt.update = false; renderNotice(); schedulePoll(1500); }
  async function poll() {
    const p = store.get(PEND, null);
    try {
      if (p && p.state === 'waiting') {
        const d = await Net.get('suggest?batch=' + p.batch);
        const items = d.items || [];
        if (!items.length) { store.del(PEND); }
        else if (items.every(i => i.status === 'done' || i.status === 'declined')) {
          Object.assign(p, { state: 'ready', done: items.filter(i => i.status === 'done').length, declined: items.filter(i => i.status === 'declined').length, readyAt: Date.now() });
          store.set(PEND, p); nt.lastRun = d.review.lastRun;
        } else {
          Object.assign(p, { ahead: d.ahead, working: items.some(i => i.status === 'doing'), held: !items.some(i => i.status === 'doing' || i.status === 'new') && items.some(i => i.status === 'held'), offline: !(d.review.seen && d.review.now - d.review.seen < 3 * 60e3) });
          store.set(PEND, p);
        }
        if (nt.lastRun == null) nt.lastRun = d.review.lastRun;
        nt.latest = d.review.lastRun;
      } else {
        const d = await Net.get('suggest?lite=1');
        nt.latest = d.review.lastRun;
        if (nt.lastRun == null) nt.lastRun = d.review.lastRun;
        else if (d.review.lastRun > nt.lastRun) nt.update = true;
      }
    } catch (_) { /* offline: try again later */ }
    renderNotice(); schedulePoll();
  }
  function schedulePoll(ms) {
    clearTimeout(nt.timer);
    const p = store.get(PEND, null);
    nt.timer = setTimeout(() => { if (document.hidden) schedulePoll(); else poll(); }, ms || (p && p.state === 'waiting' ? 8000 : 45000));
  }
  function bootNotice() {
    const p = store.get(PEND, null);
    // loaded after the review was ready = the player already pressed F5: show what shipped, once
    if (p && p.state === 'ready') { p.state = 'shown'; store.set(PEND, p); }
    renderNotice(); poll();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedulePoll(500); });
  }
  $('#notice').addEventListener('click', e => {
    if (e.target.closest('[data-act=notice-x]')) { e.stopPropagation(); const p = store.get(PEND, null); if (p && p.state !== 'waiting') store.del(PEND); nt.update = false; nt.lastRun = Math.max(nt.lastRun || 0, nt.latest); renderNotice(); return; }
    const p = store.get(PEND, null);
    if ((p && p.state === 'ready' && p.done > 0) || (!p && nt.update)) { location.reload(); return; }
    openSuggest();
  });

  // ------------------------------------------------------------------ actions
  const ACT = {
    'new-run': () => { run = Run.newRun((Math.random() * 2 ** 31) | 0, { locked: B.lockedFor(lvlNow()) }); ui.startPick = []; ui.startRelic = null; ui.focusRelic = null; ui.focus = null; ui.startStep = 1; ui.lastGold = null; ui.goldHold = null; screen = 'run'; save(); render(); },
    'continue-run': () => { screen = 'run'; render(); },
    menu: () => { if (battle) return; screen = 'title'; closeModal(); render(); },
    howto: () => openModal(HOWTO),
    'start-pick': k => { ui.focus = k; ui.focusRelic = null; ui.startPick = [k]; render(); },
    'start-next': () => { if (ui.startPick.length !== CFG.startHeroes) return; if ((run.relicOffer || []).length) { ui.startStep = 2; render(); } else ACT['start-go'](); },
    'start-back': () => { ui.startStep = 1; render(); },
    'start-relic': id => { ui.focusRelic = id; ui.startRelic = id; render(); },
    'start-go': () => { if (ui.startPick.length !== CFG.startHeroes || ((run.relicOffer || []).length && !ui.startRelic)) return; Run.pickStart(run, ui.startPick, ui.startRelic); ui.startRelic = null; ui.startStep = 1; save(); render(); },
    choose: i => { Run.choose(run, +i); ui.info = null; save(); render(); window.scrollTo(0, 0); },
    spec: i => { Run.chooseSpec(run, +i); save(); render(); },
    fight: () => startBattle(),
    speed: s => { if (+s === 4 && !hasPerk('speed4')) { toast(`4× speed is a Crown Shop unlock (👑 ${B.SHOP_ITEM.speed4.price}). 2× is free.`); return; } ui.speed = +s; store.set('balance.speed', ui.speed); document.querySelectorAll('[data-act=speed]').forEach(b => b.classList.toggle('on', +b.dataset.arg === ui.speed)); },
    skip: () => { if (!hasPerk('skip')) { toast(`Skipping fights is a Crown Shop unlock (👑 ${B.SHOP_ITEM.skip.price}).`); return; } skipBattle(); },
    'result-ok': () => { ui.result = null; ui.goldHold = null; screen = 'run'; render(); window.scrollTo(0, 0); },
    'to-duel': () => { run.phase = 'deploy'; run.cur = { type: 'gauntlet' }; ui.info = null; save(); render(); window.scrollTo(0, 0); },
    'retry-elo': () => { if (ui.result && ui.result.gauntlet) { const w = ui.result.win; ui.result.pending = true; render(); Net.post('elo', { op: 'result', pid: pid(), ref: refCode(), teamId: run.g.teamId, win: w, team: Run.teamSnapshot(run), relics: run.relics }).then(r => { setElo(r, r.over); logGameXp(r); Run.gauntletUpdate(run, r); ui.climb = w; Object.assign(ui.result, { delta: r.delta, elo: r.elo, ghost: r.ghost, pending: false, error: null }); save(); render(); }).catch(e => { Object.assign(ui.result, { pending: false, error: e.message }); render(); }); } },
    // v42 (review #51): a bought card flies into the Team button with a coin sound and gets a SOLD stamp; a reroll deals
    // the new cards in with a shuffle
    buy: i => {
      const card = $(`.card.stock[data-i="${+i}"]`), pic = card && card.querySelector('.ico.big, .por.big');
      const err = Run.buy(run, +i);
      if (err) { toast(err); sfx('deny'); if (B.Juice) B.Juice.bump(card, 'shake'); return; }
      sfx('buy'); if (B.Juice && pic) { B.Juice.flyCopy(pic, '#top [data-act=team]'); B.Juice.confettiAt(card, 16, { speed: 300 }); }
      ui.justSold = +i; save(); render(); ui.justSold = null;
    },
    reroll: () => { if (!Run.reroll(run)) { toast('Not enough gold'); sfx('deny'); return; } sfx('reroll'); ui.deal = true; save(); render(); ui.deal = false; },
    sound: () => { if (!B.Sfx) return; B.Sfx.toggle(); for (const b of document.querySelectorAll('.sndbtn')) { b.innerHTML = I(B.Sfx.on ? 'sound' : 'mute'); b.setAttribute('aria-label', 'Sound ' + (B.Sfx.on ? 'on' : 'off')); } if (ui.modal === 'home') { openModal(homeMenuHTML()); ui.modal = 'home'; } },
    'home-menu': () => { openModal(homeMenuHTML()); ui.modal = 'home'; },
    'give-up': () => { openModal(`<div class="shead"><b>Give up?</b><button data-act="close" aria-label="Close">✕</button></div><div class="giveupask">${I('flag', 'big')}<p>Your team goes home and this game ends. It does not count as a loss.</p><div class="bar"><button data-act="close">Keep playing</button><button class="danger" data-act="give-up-yes">${I('flag')} Give up</button></div></div>`); },
    'give-up-yes': () => { run = null; store.del(SAVE); closeModal(); ui.lastGold = null; ui.goldHold = null; screen = 'title'; render(); },
    'form-info': t => toast(t),
    'g-rules': () => openModal(`<div class="shead"><b>${I('trophy')} How the Gauntlet works</b><button data-act="close" aria-label="Close">✕</button></div><ol class="howbasics">
      <li>${I('ghost')}<span><b>Your team becomes a ghost</b> and enters the tower.</span></li>
      <li>${I('swords')}<span><b>Every floor holds ghosts that fell there.</b> You duel one of them.</span></li>
      <li>${I('up')}<span><b>Win and you climb.</b> Lose and your ghost stays on that floor for the next players.</span></li>
      <li>${I('crown')}<span><b>Beat the champion on top</b> (or reach a floor nobody reached) and the crown is yours until someone beats your ghost.</span></li>
      <li>${I('chart')}<span><b>Your Elo only moves here:</b> every duel is a 1v1 Elo game.</span></li></ol>`),
    'hero-peek': k => { if (HEROES[k]) { openModal(heroPeekHTML(k)); ui.modal = 'peek'; } },
    path: () => { if (run) { openModal(pathHTML()); ui.modal = 'path'; } },
    'result-more': () => { ui.rmore = !ui.rmore; render(); },
    leave: () => { Run.leave(run); save(); render(); window.scrollTo(0, 0); },
    event: i => {
      const ch = Run.eventChoices(run)[+i]; if (!ch) return;
      if (ch.target) { run.cur.pick = +i; render(); return; }
      Run.eventAct(run, +i); run.cur.pick = null; save(); render();
    },
    'event-target': arg => { const i = run.cur.pick; run.cur.pick = null; if (i == null) return; Run.eventAct(run, i, arg); save(); render(); },
    'event-back': () => { run.cur.pick = null; render(); },
    team: () => { if (!run || battle) return; ui.gsel = null; ui.heroInfo = 0; ui.gPage = 0; openGear(); },
    'hero-info': uid => { ui.heroInfo = +uid && ui.heroInfo !== +uid ? +uid : 0; ui.gsel = null; openGear(); },
    'gear-hero': uid => { ui.gHero = +uid; ui.gsel = null; openGear(); },
    'gear-pick': a => { const [k, x, y] = a.split(':'), sl = k === 'b' ? { k, i: +x } : { k, uid: +x, i: +y }; ui.gsel = ui.gsel && JSON.stringify(ui.gsel) === JSON.stringify(sl) ? null : sl; if (k === 'w') ui.gHero = +x; openGear(); },
    'gear-equip': () => { const g = ui.gsel; if (!g || g.k !== 'b') return; const h = gearHero(), id = run.bag[g.i]; gearDo(() => ({ sock: gearPut(g.i, h.uid, null), id }), h.uid); },
    'gear-off': () => { const g = ui.gsel; if (!g || g.k !== 'w') return; gearDo(() => { Run.unequip(run, g.uid, g.i); }, g.uid); },
    'gear-auto': () => { run.autoGear = true; const n = gearAuto(); ui.gsel = null; save(); openGear(); refreshBehind(); if (n) { sfx('unlock'); const st = $('#modal .gstage'); if (st && B.Juice) { B.Juice.confettiAt(st, 50); B.Juice.bump(st, 'pop'); } toast(n > 1 ? n + ' heroes got better gear' : 'A hero got better gear'); } else toast('Your team already wears its best gear'); },
    'gear-page': d => { ui.gPage = Math.max(0, (ui.gPage || 0) + +d); openGear(); },
    sell: () => { const g = ui.gsel; if (!g || g.k !== 'b') return; Run.sell(run, g.i); ui.gsel = null; sfx('coin'); save(); openGear(); header(); },
    close: () => { closeModal(); ui.gsel = null; ui.heroInfo = 0; if (!battle) render(); },
    suggest: () => openSuggest(),
    'art-lab': arg => { if (ui.modal) closeModal(); B.ArtLab.open(labKit, arg); },
    'draft-del': i => { const d = drafts(); d.splice(+i, 1); store.set('balance.drafts', d); renderDrafts(); },
    'send-review': (a, el) => sendReview(el),
    'sug-refresh': () => loadQueue(),
    scores: () => openScores(),
    'player-tab': () => openScores('player'),
    'relic-info': id => { const r = RELIC[id]; if (r) toast(r.name + ': ' + r.desc); },
    'ladder-tab': k => openScores(k),
    shop: () => openShop(),
    profile: code => openProfile(code),
    'my-profile': () => openMyProfile(),
    'buy-perk': async id => {
      if (ui.confirmBuy !== id) { ui.confirmBuy = id; refreshShop(); return; }   // two taps: nobody spends 300 crowns by accident
      ui.confirmBuy = null;
      try { const r = await Net.post('player', { op: 'buy', pid: pid(), item: id }); setAcct(r); toast(`${B.SHOP_ITEM[id].name} unlocked!`); } catch (e) { toast(e.message); }
      if (ui.modal === 'shop') refreshShop();
    },
    skin: k => { store.set('balance.skin', k === 'royal' ? 'royal' : 'classic'); applySkin(); refreshShop(); toast(k === 'royal' ? 'Royal board on' : 'Classic board on'); },
    'copy-ref': () => { const i = $('#refLink'); if (!i) return; i.select(); const done = () => toast('Invite link copied'); if (navigator.clipboard) navigator.clipboard.writeText(i.value).then(done, () => { try { document.execCommand('copy'); done(); } catch (_) {} }); else { try { document.execCommand('copy'); done(); } catch (_) {} } },
  };
  // Art Lab (owner, 2026-09-29): its buttons join the one click listener; it gets the helpers it needs
  const labKit = { $, $$: s => [...document.querySelectorAll(s)], esc, toast, openModal, Net, store, trackBatch, ui };
  Object.assign(ACT, B.ArtLab.actions); B.ArtLab.init(labKit);
  // hero pictures (this device's test art or the official art) finish loading after the first screen: redraw it
  B.Art.onChange(() => { if (screen === 'battle' || ui.modal || ui.drag) return; clearTimeout(ui.artH); ui.artH = setTimeout(() => { if (screen !== 'battle' && !ui.modal && !ui.drag) render(); }, 80); });
  B.Art.boot();
  function refreshBehind() { header(); if (run && run.phase === 'deploy' && screen !== 'battle') { preview = worldFor(true); drawPreview(); } }

  // v42: every tap has a sound; these actions have their own (null = the action plays it, it depends on the outcome)
  const ACT_SFX = { 'gear-equip': null, 'gear-auto': null, sell: null, buy: null, reroll: null, sound: null, fight: 'go', 'start-go': 'go', 'to-duel': 'go', choose: 'pick', 'start-pick': 'pick', 'start-relic': 'pick', 'start-next': 'pick', 'start-back': 'back',
    spec: 'unlock', event: 'pick', 'event-target': 'pick', equip: 'pick', bag: 'pick', unequip: 'back', close: 'back', 'event-back': 'back', sell: 'coin', 'result-ok': 'pick' };
  document.addEventListener('click', e => {
    if (e.target.closest('#notice')) return;
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    e.preventDefault(); const act = el.dataset.act, f = ACT[act];
    const snd = act in ACT_SFX ? ACT_SFX[act] : 'tap'; if (snd) sfx(snd);
    if (f) f(el.dataset.arg, el);
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') ACT.close(); });
  document.addEventListener('input', e => { if (e.target.id === 'sugName') store.set('balance.name', e.target.value.trim()); });
  document.addEventListener('submit', async e => {
    const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
    const kind = f.dataset.form, btn = f.querySelector('button'); if (btn) btn.disabled = true;
    try {
      if (kind === 'draft') {
        const t = f.text.value.trim(); if (btn) btn.disabled = false;
        if (t.length < 5) { toast('Write at least a few words'); return; }
        const d = drafts(); if (d.length >= MAX_DRAFTS) { toast('Up to ' + MAX_DRAFTS + ' changes per review'); return; }
        d.push(t); store.set('balance.drafts', d); f.text.value = ''; renderDrafts(); f.text.focus();
      } else if (kind === 'rename') {
        const name = f.name.value.trim().replace(/\s+/g, ' ');
        if (name.length < 2) { toast('Pick a name of 2 to 16 characters'); if (btn) btn.disabled = false; return; }
        const r = await Net.post('player', { op: 'rename', pid: pid(), name }); setAcct(r); toast(`You are now ${r.name}`); refreshShop();
      } else if (kind === 'gauntlet') {
        const name = f.name.value.trim(); if (!acct.account || isDefaultName(acct.name)) store.set('balance.name', name);
        const r = await Net.post('elo', { op: 'enter', pid: pid(), ref: refCode(), name, team: Run.teamSnapshot(run), relics: run.relics, reached: run.lastFight, game: { fights: run.won } });
        setElo(r); logGameXp(r); Run.gauntletUpdate(run, r); save(); render(); window.scrollTo(0, 0);
      }
    } catch (err) { toast(err.message); if (btn) btn.disabled = false; }
  });
  let rz = 0;
  function onResize() {
    clearTimeout(rz);
    rz = setTimeout(() => {
      const was = document.body.className; layoutClasses();
      if (!battle && was !== document.body.className && !ui.modal) { render(); return; }
      const cv = $('#board'); if (cv) { view = Render.setup(cv, boardWidth(cv.parentElement)); drawPreview(); }
      trailer.cv = null;   // v49: the trailer sizes itself again on its next frame
    }, 120);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  // ------------------------------------------------------------------ boot
  run = Run.migrate(run);
  // v27: an invite link (?ref=<code>) is kept until this browser's first run creates the account, then sent with it
  try {
    const u = new URL(location.href), ref = (u.searchParams.get('ref') || '').toLowerCase();
    if (/^[a-f0-9]{12}$/.test(ref) && !acct.account && ref !== acct.code) store.set('balance.ref', ref);
    if (u.searchParams.has('ref')) { u.searchParams.delete('ref'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
  } catch (_) {}
  applySkin();
  if (ui.speed === 4 && !hasPerk('speed4')) ui.speed = 2;
  loadAcct().then(() => { if (ui.speed === 4 && !hasPerk('speed4')) ui.speed = 2; if (screen === 'title' && !ui.modal) render(); });
  screen = 'title';
  layoutClasses();
  render();
  bootNotice();
  // test hook (headless Chrome tests drive the game through this)
  window.__bal = { get run() { return run; }, get battle() { return battle; }, get acct() { return acct; }, get result() { return ui.result; }, loadAcct, ACT, render, skipBattle, poll, fmt, scaleParts, hexScreen: (c, r) => { const b = view.canvas.getBoundingClientRect(), p = Render.hexScreen(view, c, r); return { x: b.left + p.x, y: b.top + p.y }; } };
})();
