// UI: DOM screens + battle loop. No inline handlers (CSP): every button has data-act, handled by one listener.
(function () {
  const { Run, Sim, Render, Net, HEROES, ITEM, RELIC, EVENT, CFG } = B;
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
  const ui = { startPick: [], selBag: -1, selUid: 0, info: null, result: null, speed: store.get('balance.speed', 1), drag: null, modal: null };
  const save = () => { if (run) store.set(SAVE, run); };
  // player identity for Elo (reviews #3 #4): a random id kept in this browser
  function pid() {
    let id = store.get('balance.pid', '');
    if (!/^[a-f0-9]{32}$/.test(id)) { const a = new Uint8Array(16); crypto.getRandomValues(a); id = [...a].map(x => x.toString(16).padStart(2, '0')).join(''); store.set('balance.pid', id); }
    return id;
  }
  const myName = () => store.get('balance.name', '') || '';
  const setElo = r => { if (r && r.elo != null) store.set('balance.elo', r.elo); if (r && r.league != null) store.set('balance.league', { league: r.league, lp: r.lp }); };
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
    ['kw-atk', 'attack speed|attacks?|physical|damage'], ['kw-ap', 'magic damage|magic|ability power|abilities|ability|AP'],
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
    return `<span class="stats-row">${c('s-hp', '❤', d.hp, 'Health')}${c('s-atk', '⚔', d.atk, 'Attack')}${full ? c('s-ap', '✦', d.ap, 'Ability power: multiplies magic ability damage, burns and heals (100 AP = ×1)') : ''}${c('s-arm', '⛨', d.armor, 'Armor')}${c('s-mr', '◈', d.mr, 'Magic resist')}${c('s-as', '»', d.as, 'Attacks per second')}${c('s-rng', '➶', d.range, 'Range (hexes)')}${d.crit ? c('s-crit', '✸', d.crit, 'Crit chance') : ''}${d.dodge ? c('s-dodge', '↯', d.dodge, 'Dodge') : ''}</span>`;
  }
  const pct = x => Math.round(x * 100) + '%';
  // review #19 (David: "not clear how hero abilities scale with AP, attack etc."): how every ability is computed in
  // js/sim.js, part by part. P = % of attack as physical damage; M = % of attack x AP/100 as magic damage; A = % of attack
  // as magic damage (no AP); B = burn per second, % of attack x AP/100, for 3s; H = heal, % of the ally's max HP x AP/100;
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
    raise: ab => [['Z', d => `each skeleton: ${Math.round(300 * lvF(d) * ab.hpMul * d.ap / 100)} HP and ${Math.round(30 * lvF(d) * d.ap / 100)} attack (300 HP and 30 attack × level × AP)`]],
    chain: ab => [['M', ab.dmg, `per bounce, ${ab.bounces} enemies, ${pct(ab.falloff)} less each bounce`]],
    hook: ab => [['P', ab.dmg, 'to the pulled enemy']],
    mirror: ab => [['Z', d => `each clone: ${pct(ab.stat)} of her HP, attack and armor (${Math.round(d.hp * ab.stat)} HP, ${Math.round(d.atk * ab.stat)} attack)`]],
    turret: ab => [['Z', d => `each turret: ${Math.round(340 * lvF(d) * ab.hpMul)} HP and 80% of his attack (${Math.round(0.8 * d.atk)})`]],
    whirl: ab => [['P', ab.dmg, 'to every adjacent enemy'], ['Z', `heals ${pct(ab.heal)} of the damage dealt`]],
    consecrate: ab => [['M', ab.dps, `per second to enemies on the ground, ${ab.dur}s`], ['Z', `allies on it heal ${pct(ab.heal)} of max HP per second`]],
    eclipse: ab => [['A', ab.bonus, `extra on each of the next ${ab.hits} attacks`], ['Z', `heals ${pct(ab.heal)} of that damage`]],
    entangle: ab => [['M', ab.dmg, `to every enemy within ${ab.radius} hexes`]],
    anthem: ab => [['H', ab.heal, 'allies within 2 hexes'], ['Z', `+${pct(ab.atk)} attack for 4s`]],
    fan: ab => [['P', ab.dmg, `per shot, ${ab.shots} shots, can crit`]],
    javelin: ab => [['P', ab.dmg, `per javelin, ${ab.count} javelins, can crit`], ['D', ab.poison, 'poison for 4s']],
    headshot: ab => [['P', ab.dmg, '+8% per hex of distance, can crit']],
    bloodfeast: ab => [['M', ab.dmg, `to every enemy within ${ab.radius} hexes, heals all of it`]],
    smoke: ab => [['P', ab.dmg, `per shuriken, ${ab.count} shuriken, can crit`]],
    howl: ab => [['P', ab.dmg, 'pounce, can crit'], ['D', ab.bleed, 'bleed for 3s'], ['Z', `allies get +${pct(ab.buff)} attack and attack speed for 4s`]],
    hypnosis: ab => [['M', ab.dmg, 'to the hypnotized group']],
    trick: ab => [['P', 1.5, 'pie'], ['H', ab.heal, 'balloons, every ally'], ['P', 1, `per knife, ${ab.knives} knives`], ['M', 0.8, 'confetti']],
    keg: ab => [['P', ab.dmg, 'to adjacent enemies'], ['X', ab.heal, 'swig']],
    hellfire: ab => [['M', ab.dmg, `to every enemy within ${ab.radius} hexes`], ['B', ab.burn, 'burn'], ['Z', `costs ${pct(ab.cost)} of his current HP`]],
    boulder: ab => [['P', ab.dmg, 'to the target'], ['P', 1, 'to enemies next to it']],
    wrap: ab => [['D', ab.decay, `decay on ${ab.count} enemies while rooted`]],
    phalanx: ab => [['P', ab.dmg, `per enemy, ${ab.hits} enemies, can crit`], ['Z', `allies next to him take ${pct(ab.dr)} less damage for 4s`]],
    waltz: ab => [['P', ab.dmg, `per enemy, up to ${ab.hits}, can crit`]],
    flask: ab => [['M', 1.5, 'acid flask'], ['H', ab.heal, 'healing flask']],
    galekick: ab => [['P', ab.dmg, 'kick, can crit'], ['P', 1, 'to anyone it crashes into']],
  };
  // d = { abil, ab, atk, ap, hp, lvl, name } from Run.heroDef or a unit in the fight
  function scaleParts(d) {
    const S = SCALE[d.abil]; if (!S) return [];
    const apm = d.ap / 100, n = x => Math.round(x);
    return S(d.ab).filter(Boolean).map(([k, v, note]) => {
      if (k === 'Z') return { k, t: typeof v === 'function' ? v(d) : v };
      const txt = { P: `<b>${pct(v)}</b> attack → <b class="num">${n(v * d.atk)}</b> physical`, M: `<b>${pct(v)}</b> attack × AP → <b class="num">${n(v * d.atk * apm)}</b> magic`,
        A: `<b>${pct(v)}</b> attack → <b class="num">${n(v * d.atk)}</b> magic`, B: `burn <b>${pct(v)}</b> attack × AP → <b class="num">${n(v * d.atk * apm)}</b> per second for 3s`,
        H: `heals <b>${pct(v)}</b> of max HP × AP → <b class="num">${pct(v * apm)}</b>`, X: `heals <b>${pct(v)}</b> of max HP → <b class="num">${n(v * d.hp)}</b>`,
        S: `shield <b>${pct(v)}</b> of max HP → <b class="num">${n(v * d.hp)}</b>`, D: `<b>${pct(v)}</b> of the target's max HP per second` }[k];
      return { k, t: txt + (note ? ` <span class="dim">(${note})</span>` : '') };
    });
  }
  const SCALE_ICON = { P: '⚔', M: '✦', A: '✦', B: '🔥', H: '✚', X: '✚', S: '🛡', D: '☠', Z: '•' };
  function scalingHTML(d, compact) {
    const parts = scaleParts(d); if (!parts.length) return '';
    const head = compact ? '' : `<div class="scal-h">How it scales <span class="dim">now: ⚔ ${Math.round(d.atk)} attack · ✦ ${Math.round(d.ap)} AP = ×${(d.ap / 100).toFixed(2)}</span></div>`;
    return `<div class="scal ${compact ? 'compact' : ''}">${head}<ul>${parts.map(p => `<li class="sk-${p.k}"><i>${SCALE_ICON[p.k]}</i><span>${p.t}</span></li>`).join('')}</ul></div>`;
  }
  // "scales with attack · AP" for the hero shop and the start screen (base stats)
  function scaleTag(key) {
    const h = HEROES[key], S = SCALE[h.abil]; if (!S) return '';
    const ks = new Set(S(h.ab).filter(Boolean).map(p => p[0])), w = [];
    if (['P', 'M', 'A', 'B'].some(k => ks.has(k)) || h.abil === 'turret' || h.abil === 'mirror') w.push('<span class="kw-atk">attack</span>');
    if (['M', 'B', 'H'].some(k => ks.has(k)) || h.abil === 'raise') w.push('<span class="kw-ap">AP</span>');
    if (['S', 'X'].some(k => ks.has(k)) || h.abil === 'mirror') w.push('<span class="kw-hp">max HP</span>');
    return w.length ? `<span class="scaletag">scales with ${w.join(' · ')}</span>` : '';
  }
  const TIER_COLOR = {}; for (const r of B.RARITIES) TIER_COLOR[r.id] = r.color;
  // itemization v16: "Legendary weapon" under the name, and the set an item belongs to
  const itemTag = it => `<span class="itag" style="color:${TIER_COLOR[it.tier]}">${B.RARITY[it.tier].name} ${B.TYPE[it.type].name.toLowerCase()}</span>`;
  const setInfo = it => { const S = it.set && B.SETS[it.set]; return S ? `<div class="setline">◆ <b>${esc(S.name)}</b> set · 2 pieces: ${fmt(S.bonus[2].desc)} · 3 pieces: ${fmt(S.bonus[3].desc)}</div>` : ''; };
  const RANK = id => B.RARITIES.findIndex(r => r.id === ITEM[id].tier);
  const DOLL = ['helmet', 'trinket', 'weapon', 'offhand', 'gloves', 'armor', 'boots'];
  const NODE_ICON = { F: '⚔', X: '?', B: '☠', S: '🛒', G: '♛' };
  const SHOP_NAME = { heroShop: 'Hero Shop', itemShop: 'Item Shop', relicShop: 'Relic Shop' };
  const SHOP_DESC = { heroShop: 'Recruit new heroes.', itemShop: 'Buy items to equip.', relicShop: 'Team-wide relics.' };

  // ------------------------------------------------------------------ header
  function header() {
    const h = $('#top');
    if (!run || screen === 'title') {
      h.innerHTML = `<b class="logo">${EMBLEM}Balance</b><span class="grow"></span><button data-act="scores" aria-label="Ladder">🏆</button><button data-act="suggest" class="sugg">💡 Suggest</button>`;
      return;
    }
    const stepN = Math.max(0, run.step);
    const elo = store.get('balance.elo', null), g = run.g;
    const prog = g ? (g.round != null ? 'Gauntlet · floor ' + (g.round + 1) : 'Gauntlet') : 'Day ' + (stepN + 1) + '/' + Run.seqOf(run).length;
    const lgs = store.get('balance.league', null);
    h.innerHTML = `${elo != null ? `<button class="lgchip" data-act="player-tab" title="${lgs ? leagueName(lgs.league) + ' league · ' : ''}Elo ${elo}" aria-label="Your league and Elo">${emblem(lgs ? lgs.league : 0, 18)}<span>${elo}</span></button>` : ''}
      <span class="gold" title="Gold">${run.gold}</span><span class="prog">${prog}</span>
      <span class="grow"></span>${battle ? '' : '<button data-act="team">Team</button>'}<button data-act="suggest" class="sugg">💡</button><button data-act="menu">☰</button>`;
  }

  // ------------------------------------------------------------------ screens
  function render() {
    header();
    const m = $('#screen');
    if (screen === 'title' || !run) { m.innerHTML = titleHTML(); return; }
    if (screen === 'battle') { m.innerHTML = battleHTML(); mountBoard(); return; }
    if (screen === 'result') { m.innerHTML = resultHTML(); return; }
    if (run.phase === 'over') { m.innerHTML = overHTML(); return; }
    if (run.pending.length && run.phase !== 'deploy') { m.innerHTML = levelHTML(); return; }
    if (run.phase === 'gauntlet') { m.innerHTML = gauntletHTML(); return; }
    if (run.phase === 'start') m.innerHTML = startHTML();
    else if (run.phase === 'map') m.innerHTML = mapHTML();
    else if (run.phase === 'deploy') { m.innerHTML = deployHTML(); mountBoard(); }
    else if (run.phase === 'shop') m.innerHTML = shopHTML();
    else if (run.phase === 'event') m.innerHTML = eventHTML();
  }

  function titleHTML() {
    const has = run && run.phase !== 'over';
    const lineup = ui.lineup = ui.lineup || Object.keys(HEROES).sort(() => Math.random() - 0.5).slice(0, 3);
    return `<section class="title">
      <div class="crest">${EMBLEM}</div>
      <h1 class="sc">Balance</h1>
      <p class="tag">A roguelike of heroes, hexes and ghosts</p>
      <div class="lineup">${lineup.map((k, i) => `<img class="${i === 1 ? 'mid' : ''}" src="${por(k, 120, true)}" alt="">`).join('')}</div>
      <p class="small dim">Deploy your champions, let them fight, beat two bosses, then climb the Gauntlet of other players' ghosts.</p>
      <div class="stack">
        ${has ? '<button class="primary big" data-act="continue-run">Continue run</button>' : ''}
        <button class="${has ? '' : 'primary '}big" data-act="new-run">New run</button>
        <button data-act="howto">How to play</button>
        <button data-act="scores">🏆 Ladder</button>
      </div>
      <div class="live"><b class="sc">Forged by its players</b><br>Write down your changes (a new hero, a rebalance, a whole restructure), press Send for review, and Claude reviews them and ships what fits.
        <button class="primary" data-act="suggest">💡 Suggest a change</button></div>
    </section>`;
  }
  function heroCard(key, extra = '') {
    const h = HEROES[key];
    return `<div class="hcard">
      <div class="hrow">${img(key, 48)}<b>${esc(h.name)}</b><span class="role">${h.role}</span></div>
      ${chips({ hp: h.hp, atk: h.atk, armor: h.armor, mr: h.mr, as: h.as, range: h.range })}
      <div class="abil"><b class="abname">${esc(h.abName)}</b> ${fmt(h.abDesc)}</div>${scaleTag(key)}${extra}</div>`;
  }
  // review #22 (David): the run starts with 1 hero and 1 relic: pick one of each (3 offered)
  function startHTML() {
    const f = run.startOffer.includes(ui.focus) ? ui.focus : ui.startPick[0] || run.startOffer[0], h = HEROES[f], n = ui.startPick.length;
    const relics = run.relicOffer || [], rsel = ui.startRelic && relics.includes(ui.startRelic) ? ui.startRelic : null, ready = n === CFG.startHeroes && (!relics.length || rsel);
    const relicRow = relics.length ? `<div class="srelics">${relics.map(id => `<button class="srelic ${rsel === id ? 'on' : ''} ${ui.focusRelic === id ? 'focus' : ''}" data-act="start-relic" data-arg="${id}">${ico('relic', id, 30)}<b class="relic">${esc(RELIC[id].name)}</b>${rsel === id ? '<span class="chk">✓</span>' : ''}</button>`).join('')}</div>` : '';
    const fr = ui.focusRelic && relics.includes(ui.focusRelic) ? RELIC[ui.focusRelic] : null;
    return `<section class="start"><h2 class="sc">Choose your champion</h2><p class="hint center">Pick 1 hero and 1 relic (tap to read). More heroes join in the Hero Shop.</p>
      <div class="hbanners">${run.startOffer.map(k => { const d = HEROES[k], on = ui.startPick.includes(k);
        return `<button class="hbanner ${on ? 'on' : ''} ${k === f ? 'focus' : ''}" data-act="start-pick" data-arg="${k}" style="--cloth:${d.color}">
          <span class="rod"></span><img src="${por(k, 120, true)}" alt=""><b>${esc(d.name)}</b><i>${d.role}</i>${on ? '<span class="chk">✓</span>' : ''}</button>`; }).join('')}</div>
      ${relicRow}
      ${fr ? `<div class="card detail"><div class="hrow">${ico('relic', fr.id, 44)}<b class="relic">${esc(fr.name)}</b><span class="role">relic</span></div><div class="abil">${fmt(fr.desc)}</div></div>`
        : `<div class="card detail"><div class="hrow">${img(f, 48)}<b>${esc(h.name)}</b><span class="role">${h.role}</span></div>
        ${chips({ hp: h.hp, atk: h.atk, armor: h.armor, mr: h.mr, as: h.as, range: h.range, crit: h.crit ? pct(h.crit) : 0, dodge: h.dodge ? pct(h.dodge) : 0 })}
        <div class="abil"><b class="abname">${esc(h.abName)}</b> ${fmt(h.abDesc)}</div>${scaleTag(f)}</div>`}
      <div class="bar"><button class="primary big" data-act="start-go" ${ready ? '' : 'disabled'}>${ready ? 'Begin the journey' : !n ? 'Pick a hero' : 'Pick a relic'}</button></div></section>`;
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
      return bannerHTML(i, o.diff, o.diff === 'hard' ? '⚔⚔' : '⚔', B.DIFF[o.diff].name + ' fight', `<span class="ens">${enemyList(o)}</span>`, '+' + o.gold + ' gold' + (o.enemies.some(e => e.elite) ? ' · ★ elite' : ''));
    }
    if (o.type === 'shop') return bannerHTML(i, 'shop', o.kind === 'heroShop' ? '♞' : o.kind === 'itemShop' ? '⚒' : '◆', SHOP_NAME[o.kind] + (o.final ? ' (last)' : ''), `<span class="small">${SHOP_DESC[o.kind]}</span>`);
    if (o.type === 'event') return bannerHTML(i, 'event', '?', esc(EVENT[o.id].name), `<span class="small">${esc(EVENT[o.id].text)}</span>`);
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
    return `<section>${trackHTML()}<h2 class="sc">Day ${run.step + 1} · ${title}</h2>${run.nextMod ? `<p class="nextmod">⚑ Next fight: ${fmt(modText(run.nextMod))}</p>` : ''}<div class="banners ${run.opts.length === 1 ? 'one' : ''}">${run.opts.map(optHTML).join('')}</div>
      ${partyHTML()}</section>`;
  }
  // review #18: the party under the map (levels, XP, worn items, relics) and the next boss, so each choice is informed
  function partyHTML() {
    const heroes = run.heroes.map(h => {
      const next = h.lvl < CFG.maxLevel ? CFG.xpLevels[h.lvl + 1] : null, prev = CFG.xpLevels[h.lvl] || 0;
      return `<button class="pm" data-act="team">${img(h.key, 38, 'por')}<span class="pmb"><span class="pmn"><b>${esc(HEROES[h.key].name)}</b><span class="lv">Lv ${h.lvl}</span></span>
        <span class="xpbar"><i style="width:${next ? Math.round(100 * (h.xp - prev) / (next - prev)) : 100}%"></i></span>
        <span class="pmi">${h.items.map(id => `<img class="ico xs" src="${B.Icons.item(id, 20)}" alt="">`).join('') || '<i class="dim">no items</i>'}</span></span></button>`;
    }).join('');
    let boss = '';
    const seq = Run.seqOf(run);
    for (let k = Math.max(0, run.step); k < seq.length; k++) if (seq[k] === 'B') {
      const nth = seq.slice(0, k + 1).filter(x => x === 'B').length, b = nth === 1 ? B.BOSSES.gorewarden : B.BOSSES.hollowking, d = k - run.step;
      boss = `<div class="nextboss">${img(b.key, 40, 'por')}<div><b>☠ ${esc(b.name)}</b> <span class="dim">${d <= 0 ? 'today' : 'in ' + d + ' day' + (d > 1 ? 's' : '')}</span><span class="small">${fmt(b.desc)}</span></div></div>`;
      break;
    }
    return `<div class="party"><div class="bph"><b>Your party</b><span class="dim small">${run.bag.length ? `${run.bag.length} in bag · <a href="#" data-act="team">equip</a>` : `${run.heroes.length}/${Run.teamMax(run)} heroes`}</span></div>
      <div class="pgrid">${heroes}</div>${run.relics.length ? `<div class="relicline"><b>Relics</b>${run.relics.map(id => `<button class="relicbtn" data-act="relic-info" data-arg="${id}" aria-label="${esc(RELIC[id].name)}">${ico('relic', id, 26)}</button>`).join('')}</div>` : ''}${boss}</div>`;
  }

  function levelHTML() {
    const p = run.pending[0], h = run.heroes.find(x => x.uid === p.uid), d = HEROES[h.key];
    const pair = d.specs[p.lvl - 2];
    // review #18: a big splash, what the level gives, the two choices as big cards and the whole specialization path
    const path = d.specs.map((pr, k) => { const lv = k + 2, chosen = h.specs[k]; return `<div class="sp-row ${lv === p.lvl ? 'now' : lv < p.lvl ? 'done' : 'later'}"><span class="sp-lv">Lv ${lv}</span>${pr.map(sp => `<span class="sp-n ${chosen === sp.id ? 'on' : ''}">${esc(sp.name)}</span>`).join('<i>or</i>')}</div>`; }).join('');
    return `<section class="levelup"><h2 class="sc headline win">Level up!</h2>
      <div class="luhero"><img class="lufull" src="${por(h.key, 104, true)}" alt=""><div><b class="luname">${esc(d.name)}</b><span class="lulv">Lv ${p.lvl - 1} → <b>Lv ${p.lvl}</b></span>
        <p class="small">${fmt('+15% HP and attack, +10 ability power, +4 armor and MR')}${p.lvl >= 3 ? ', <b class="kw-gold">+1 item slot</b>' : ''}.</p></div></div>
      <h3>Choose a specialization</h3>
      <div class="opts spec2">${pair.map((sp, i) => `<button class="card opt" data-act="spec" data-arg="${i}"><div class="ctitle spec">★ ${esc(sp.name)}</div><div class="small">${fmt(sp.desc)}</div></button>`).join('')}</div>
      <div class="sp-path"><div class="bph"><b>Specialization path</b><span class="dim small">one choice at each level</span></div>${path}</div></section>`;
  }

  // review #18: the enemy roster on the deploy screen, grouped, with what each one does (positioning is the decision here)
  function foesHTML(gau, f) {
    const groups = [];
    if (gau) for (const h of run.g.opp.team) groups.push({ key: h.key, n: 1, name: HEROES[h.key].name + ' Lv ' + h.lvl, what: HEROES[h.key].abName + ': ' + HEROES[h.key].abDesc });
    else {
      const by = {};
      for (const e of f.enemies) {
        const k = e.key + '|' + (e.elite || ''), m = B.MOBS[e.key] || B.BOSSES[e.key], el = e.elite && B.ELITES.find(x => x.id === e.elite);
        if (!by[k]) groups.push(by[k] = { key: e.key, n: 0, boss: !!B.BOSSES[e.key], elite: el ? el.name : '', name: m.name,
          what: B.BOSSES[e.key] ? m.desc : m.abil ? MOB_ABIL[m.abil] || '' : (m.fl || []).includes('dive') ? 'Leaps to your back line at the start.' : m.range > 1 ? 'Attacks from range.' : 'Fights up close.' });
        by[k].n++;
      }
    }
    return `<div class="foes"><div class="bph"><b>${gau ? 'Their ghost team' : 'You will face'}</b><span class="dim small">${groups.reduce((a, g) => a + g.n, 0)} ${gau ? 'heroes' : 'enemies'}</span></div>
      <div class="fgrid">${groups.map(g => `<div class="fo ${g.boss ? 'boss' : ''} ${g.elite ? 'elite' : ''}">${img(g.key, 34, 'por')}<div><b>${esc(g.name)}${g.n > 1 ? ' ×' + g.n : ''}${g.elite ? ` <span class="elt">★ ${esc(g.elite)}</span>` : ''}</b><small class="fw">${fmt(g.what)}</small></div></div>`).join('')}</div></div>`;
  }
  function deployHTML() {
    const gau = run.cur && run.cur.type === 'gauntlet';
    const f = run.cur;
    return `<section class="deploy">
      <div class="bhead">${gau ? `⚔ Gauntlet floor ${run.g.round + 1} · vs ${esc(run.g.opp.name)} (Elo ${run.g.opp.elo})` : f.diff === 'boss' ? '☠ Boss fight' : '⚔ ' + B.DIFF[f.diff].name + ' fight'} · deploy</div>
      <p class="hint tight">${!gau && f.mod ? `<span class="nextmod">⚑ ${fmt(modText(f.mod))}</span>` : 'Drag heroes within the blue rows: tanks in front, ranged behind. Tap a unit for details.'}</p>
      <div class="boardwrap"><canvas id="board"></canvas></div>
      <div id="info" class="info mini ${ui.info ? '' : 'empty'}">${infoHTML()}</div>
      ${foesHTML(gau, f)}
      <div class="bar sticky"><button data-act="team">Team & items</button><button class="primary big" data-act="fight">${gau ? 'Duel!' : 'Fight!'}</button></div>
    </section>`;
  }
  // review #18 (David: "another pass of the ui and battle ui ... pretty, functional, visible, engaging"): under the
  // board, a card per hero (HP and shield in numbers, mana bar named after the ability that glows when READY, status
  // badges, live damage with the leader crowned) and the enemy roster with its own HP bars and a count of who is left.
  function battleHTML() {
    return `<section class="deploy battle">
      <div class="hud"><div id="bhud" class="hud-l"></div>
        <div class="speed">${[1, 2, 4].map(x => `<button class="${ui.speed === x ? 'on' : ''}" data-act="speed" data-arg="${x}">${x}×</button>`).join('')}<button class="skip" data-act="skip" aria-label="Skip">⏭</button></div></div>
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
    if (r.pending) return '<p class="dim">Updating your Elo…</p>';
    if (r.error) return `<p class="err">${esc(r.error)}</p><button data-act="retry-elo">Try again</button>`;
    return r.delta != null ? `<p class="elo-line">Elo <b>${r.elo}</b> <span class="${r.delta >= 0 ? 'win' : 'lose'}">(${r.delta >= 0 ? '+' : ''}${r.delta})</span></p>` : '';
  }
  function resultHTML() {
    const r = ui.result;
    // review #18: one card per hero: damage bar (the leader is the MVP), XP gained and the bar toward the next level
    const top = Math.max(1, ...r.xp.map(x => r.dmg[x.uid] || 0));
    const table = `<div class="rheroes">${r.xp.map(x => {
      const h = run.heroes.find(q => q.uid === x.uid); if (!h) return '';
      const dmg = Math.round(r.dmg[x.uid] || 0), mvp = dmg > 0 && dmg >= top, next = h.lvl < CFG.maxLevel ? CFG.xpLevels[h.lvl + 1] : null, prev = CFG.xpLevels[h.lvl] || 0;
      return `<div class="rh ${mvp ? 'mvp' : ''}">${img(h.key, 46, 'por')}<div class="rhb"><div class="rhn"><b>${esc(x.name)}</b>${mvp ? '<span class="mvpb">👑 MVP</span>' : ''}<span class="grow"></span>${x.to > x.from ? `<b class="up">Lv ${x.to} ▲</b>` : `<span class="lv">Lv ${x.to}</span>`}</div>
        <div class="dmgbar"><s style="width:${100 * dmg / top}%"></s><em>⚔ ${dmg} damage</em></div>
        ${r.gauntlet ? '' : `<div class="rxp"><span class="xpbar"><i style="width:${next ? Math.round(100 * (h.xp - prev) / (next - prev)) : 100}%"></i></span><span class="kw-xp">+${x.gained} XP</span></div>`}</div></div>`;
    }).join('')}</div>`;
    const sub = r.gauntlet ? `${r.win ? 'You beat' : 'You fell to'} ${esc(r.opp.name)}'s team.`
      : r.win ? `<span class="rewards"><span class="price big">+${r.gold}</span>${r.prize ? `<span class="prize">${ico('item', r.prize, 30)}<b style="color:${TIER_COLOR[ITEM[r.prize].tier]}">${esc(ITEM[r.prize].name)}</b></span>` : ''}</span>` : 'Your run is over. ' + (r.timeout ? 'Time ran out.' : '');
    const bl = r.boss ? `<p class="small dim ghostline">☠ ${esc(r.boss.name)}'s Elo: <b>${r.boss.elo}</b> (${r.boss.delta >= 0 ? '+' : ''}${r.boss.delta})</p>` : '';
    const gh = r.gauntlet && r.ghost ? `<p class="small dim ghostline">👻 ${esc(r.ghost.name)}'s ghost: Elo <b>${r.ghost.elo}</b> (${r.ghost.delta >= 0 ? '+' : ''}${r.ghost.delta})${r.ghost.ownerDelta != null ? ` · its player ${r.ghost.ownerDelta >= 0 ? '+' : ''}${r.ghost.ownerDelta}` : ''}</p>` : '';
    return `<section class="result"><h2 class="${r.win ? 'win' : 'lose'} sc headline">${r.win ? 'Victory' : 'Defeat'}</h2><p>${sub}</p>${eloLine(r)}${leagueLine(r.lg)}${gh}${bl}${table}
      <div class="bar"><button class="primary big" data-act="result-ok" ${r.pending ? 'disabled' : ''}>Continue</button></div></section>`;
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
    const known = g.peak != null && g.peak >= 0 ? g.peak + 1 : null;             // number of ghost floors
    const floors = Math.max(known || 0, (cur == null ? duels.length : cur + 1) + (known ? 0 : 1), 1);
    const lo = Math.max(0, (cur == null ? floors : Math.max(cur, 0)) - 2), hi = Math.min(floors - 1, Math.max(cur == null ? floors - 1 : cur, 0) + 3);
    const token = run.heroes[0] ? `<span class="token">${img(run.heroes[0].key, 24, 'por')}</span>` : '<span class="token"></span>';
    const climb = ui.climb; ui.climb = false;
    const rows = [];
    rows.push(`<div class="floor crown ${champion ? 'cur' : ''}">${champion ? token : ''}<span class="fn">👑</span><span>${champion ? '<b>Champion!</b> You went further than every ghost' : `Champion · beat ${known ? known + ' ghost' + (known > 1 ? 's' : '') : 'every ghost'} in a row`}</span></div>`);
    if (hi < floors - 1) rows.push(`<div class="floor gap">⋯ ${floors - 1 - hi} more floor${floors - 1 - hi > 1 ? 's' : ''}</div>`);
    for (let k = hi; k >= lo; k--) {
      const d = duels[k], isCur = k === cur, o = isCur && !lost ? g.opp : null;
      if (d && (d.win || lost)) {
        rows.push(`<div class="floor ${d.win ? 'cleared' : 'fell'} ${isCur ? 'cur' : ''} ${climb && k === duels.length - 1 ? 'just' : ''}">${isCur ? token : ''}<span class="fn">Floor ${k + 1}</span>
          <span class="grow">${d.win ? '✔' : '✘'} ${esc(d.name)}</span><span class="${d.delta >= 0 ? 'win' : 'lose'}">${d.delta >= 0 ? '+' : ''}${d.delta}</span></div>`);
      } else if (isCur) {
        rows.push(`<div class="floor cur">${token}<span class="fn">Floor ${k + 1}</span><span class="grow">vs <b>${esc(o ? o.name : '?')}</b></span>${o ? `<span class="elo">⚜ ${o.elo}</span>` : ''}</div>`);
      } else {
        rows.push(`<div class="floor locked"><span class="fn">Floor ${k + 1}</span><span class="grow dim">a ghost with ${k}+ win${k === 1 ? '' : 's'}</span><span>🔒</span></div>`);
      }
    }
    if (lo > 0) rows.push(`<div class="floor gap">⋯ ${lo} floor${lo > 1 ? 's' : ''} cleared below</div>`);
    rows.push(`<div class="floor ground ${cur === -1 ? 'cur' : ''}">${cur === -1 ? token : ''}<span class="fn">Gate</span><span class="grow">${reach ? `Reached the Gauntlet <span class="win">+${reach.delta}</span>` : 'Your team enters as a ghost'}</span></div>`);
    return `<div class="tower ${climb ? 'climb' : ''}">${rows.join('')}</div>`;
  }
  function gauntletHTML() {
    const g = run.g;
    if (g.status === 'intro') {
      if (g.peak == null && !ui.peakAsked) { ui.peakAsked = true; Net.get('elo?peak=1').then(r => { g.peak = r.peak; if (run.g === g && g.status === 'intro') render(); }).catch(() => {}); }
      return `<section class="title"><h2 class="sc">The Gauntlet</h2>
        <div class="card gintro"><p class="small">Your team is saved as a <b>ghost</b> and duels the ghosts of other players' runs. Round 1 is against a ghost that lost its first duel, round 2 against one that won once, and so on. Reaching the Gauntlet already counts as an Elo win against a 1000 rated opponent. Each duel is a 1v1 Elo game. One loss ends your run. Go further than every ghost before you and you are crowned champion.</p>
          ${teamRow(Run.teamSnapshot(run), run.relics)}
          ${g.peak != null ? towerHTML(g, 'intro') : ''}
          <form class="stack" data-form="gauntlet"><input name="name" maxlength="16" placeholder="Your name on the ladder" value="${esc(myName())}" required><button class="primary big">Enter the Gauntlet</button></form></div></section>`;
    }
    // match card
    const o = g.opp;
    const def = o.defW || o.defL ? ` As a ghost it defended ${o.defW} time${o.defW === 1 ? '' : 's'} and fell ${o.defL}.` : '';
    return `<section class="gauntlet"><h2 class="sc">Gauntlet · floor ${g.round + 1}</h2>
      <div class="gwrap">${towerHTML(g)}
      <div class="card opp"><div class="row"><b class="sc">👻 ${esc(o.name)}</b><span class="grow"></span><span class="elo">⚜ ${o.elo}</span></div>
        <p class="small dim">${o.own ? 'A ghost of one of your own earlier runs (no other player\'s ghost has reached this step yet).' : o.status === 'champion' ? 'Their run was crowned champion in the gauntlet.' : 'Their run went ' + o.wins + '-1 in the gauntlet.'}${def}</p>${teamRow(o.team, o.relics)}</div></div>
      <div class="bar"><button data-act="team">Team & items</button><button class="primary big" data-act="to-duel">Prepare the duel</button></div></section>`;
  }
  function stockCard(s, i) {
    const dis = s.sold || run.gold < s.price || (s.kind === 'hero' && run.heroes.length >= Run.teamMax(run));
    let body = '';
    if (s.kind === 'hero') { const h = HEROES[s.id]; body = `<div class="srow">${img(s.id, 48, 'por big')}<div><div class="ctitle">${esc(h.name)}</div><div class="tier">${h.role}</div></div></div><div class="small"><b class="abname">${esc(h.abName)}</b> ${fmt(h.abDesc)}</div>${scaleTag(s.id)}`; }
    else if (s.kind === 'item') { const it = ITEM[s.id]; body = `<div class="srow">${ico('item', s.id, 52, 'ico big')}<div><div class="ctitle" style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</div>${itemTag(it)}</div></div><div class="small">${fmt(it.desc)}</div>${setInfo(it)}`; }
    else { const r = RELIC[s.id]; body = `<div class="srow">${ico('relic', s.id, 52, 'ico big')}<div><div class="ctitle relic">${esc(r.name)}</div><div class="tier t-relic">relic</div></div></div><div class="small">${fmt(r.desc)}</div>`; }
    return `<div class="card stock ${s.sold ? 'sold' : ''}">${body}<button class="${dis ? '' : 'primary'}" data-act="buy" data-arg="${i}" ${dis ? 'disabled' : ''}>${s.sold ? 'Sold' : `Buy <span class="price">${s.price}</span>`}</button></div>`;
  }
  function shopHTML() {
    const c = run.cur, rc = Run.rerollCost(run);
    const note = c.kind === 'heroShop' ? `Team ${run.heroes.length}/${Run.teamMax(run)}` : c.kind === 'itemShop' ? `Items go to your bag. Each hero wears one item of each type.` : 'Relics affect every hero.';
    return `<section>${trackHTML()}<h2>🛒 ${SHOP_NAME[c.kind]}</h2><p class="hint">${note}</p>
      <div class="grid">${c.stock.map(stockCard).join('') || '<p>Nothing left to sell.</p>'}</div>
      <div class="bar sticky"><button data-act="reroll" ${run.gold < rc ? 'disabled' : ''}>Reroll · ${rc}g</button><button data-act="team">Team</button><button class="primary" data-act="leave">Continue ➜</button></div></section>`;
  }
  // review #17: 3 choices with a visible price or risk; some ask you to pick the hero, item or item type they apply to
  function eventHTML() {
    const e = EVENT[run.cur.id], chs = Run.eventChoices(run);
    const head = `<section class="event">${trackHTML()}<h2>❓ ${esc(e.name)}</h2><p>${esc(e.text)}</p>`;
    if (run.cur.done) return head + `<div class="card result">${fmt(run.cur.done)}</div><div class="bar"><button class="primary big" data-act="leave">Continue ➜</button></div></section>`;
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
      const c = Run.canChoose(run, ch), pic = ch.hero ? img(ch.hero, 40) : ch.item ? ico('item', ch.item, 40) : '';
      const tag = ch.item ? `<span class="itag" style="color:${TIER_COLOR[ITEM[ch.item].tier]}">${B.RARITY[ITEM[ch.item].tier].name} ${B.TYPE[ITEM[ch.item].type].name.toLowerCase()}</span>` : '';
      return `<button class="evch ${pic ? 'haspic' : ''}" data-act="event" data-arg="${i}" ${c.ok ? '' : 'disabled'}>${pic}<span class="t">${tag}${fmt(ch.label)}${ch.target ? ' <i class="dim">(you choose)</i>' : ''}${c.ok ? '' : `<span class="why">${esc(c.why)}</span>`}</span>${ch.cost ? `<span class="price">${ch.cost}</span>` : ''}</button>`;
    }).join('')}</div></section>`;
  }
  function overHTML() {
    const g = run.g;
    let body;
    if (run.result === 'gauntlet' && g) {
      const d = g.elo - g.eloStart;
      body = `<h2 class="sc">${g.status === 'champion' ? '👑 Champion' : 'The Gauntlet is over'}</h2>
        <div class="score">${g.wins}</div><p>duel${g.wins === 1 ? '' : 's'} won</p>
        <p class="elo-line">Elo ${g.eloStart} → <b>${g.elo}</b> <span class="${d >= 0 ? 'win' : 'lose'}">(${d >= 0 ? '+' : ''}${d})</span></p>
        ${g.status === 'champion' ? '<p class="small">No one had ever gone this far. Your team now guards the top of the ladder.</p>' : ''}
        ${g.lgNow ? leagueLine(Object.assign({}, g.lgNow, { delta: g.lgGain, promoted: g.lgPromoted })) : ''}
        ${g.history.length ? towerHTML(g) : ''}`;
    } else {
      body = `<h2 class="sc">Your run has ended</h2><p>You fell at fight ${run.fightNo}. Won ${run.won} fight${run.won === 1 ? '' : 's'}.</p>
        ${run.eloEnd != null ? `<p class="elo-line">Elo <b>${run.eloEnd}</b> <span class="lose">(${run.eloDelta})</span></p>` : ''}${leagueLine(run.lgEnd)}`;
    }
    return `<section class="title">${body}
      <div class="stack"><button class="primary big" data-act="new-run">New run</button><button data-act="scores">🏆 Ladder</button></div>
      <p class="hint">Something felt off? <a href="#" data-act="suggest">Suggest a change</a>.</p></section>`;
  }

  // ------------------------------------------------------------------ unit info panel
  function infoHTML() {
    const W = battle ? battle.W : preview;
    if (!W || !ui.info) return '<span class="dim">Tap a unit to see its stats.</span>';
    const u = W.byId[ui.info]; if (!u) return '';
    const hd = HEROES[u.key];
    const abil = hd ? `<b class="abname">${esc(hd.abName)}</b> ${fmt(hd.abDesc)}` : u.boss ? fmt(B.BOSSES[u.key].desc) : u.abil ? fmt(MOB_ABIL[u.abil] || '') : u.fl.has('dive') ? 'Leaps to your back line at the start.' : u.kind === 'summon' ? 'Summoned unit.' : 'No special ability.';
    return `<div class="hrow">${img(u.key, 40)}<b>${esc(u.name)}</b>${u.kind === 'hero' ? ' Lv ' + u.lvl : ''}${u.elite ? ' <span class="elite">★ elite</span>' : ''}</div>
      ${chips({ hp: Math.max(0, Math.round(u.hp)) + '/' + u.maxHp, atk: Math.round(Sim.atkOf(W, u)), ap: Math.round(u.ap), armor: Math.round(Sim.armorOf(W, u)), mr: Math.round(Sim.mrOf(W, u)), as: Sim.asOf(W, u).toFixed(2), range: u.range, crit: u.crit ? pct(u.crit) : 0, dodge: u.dodge ? pct(u.dodge) : 0 }, true)}
      <div class="small">${abil}</div>${hd ? scalingHTML({ abil: u.abil, ab: u.ab, atk: Sim.atkOf(W, u), ap: u.ap, hp: u.maxHp, lvl: u.lvl, name: u.name }, true) : ''}`;
  }

  // ------------------------------------------------------------------ board mount + input
  function worldFor(preview) {
    const t = run.cur && run.cur.type;
    return t === 'gauntlet' ? Run.gauntletWorld(run, preview) : Run.fightWorld(run, preview);
  }
  // review #13 (David: "randomly adjusted to 75% of my screen ... adapt to the screen size and device"):
  // the board takes the width AND the height left on screen, on phones (portrait/landscape), tablets and desktops.
  const BOARD_RATIO = 0.703; // board height / width (render.js setup: 10.35 * size + 4 over 14.72 * size)
  function layoutClasses() {
    const vw = window.innerWidth, vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.body.classList.toggle('landscape', vw > vh * 1.25 && vh < 600);
    document.body.classList.toggle('wide', vw >= 760 && !document.body.classList.contains('landscape'));
    document.body.classList.toggle('side', document.body.classList.contains('wide') && vw >= vh * 1.1);  // review #18: panel beside the board
  }
  function boardWidth(wrap) {
    const vw = window.innerWidth, vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const land = document.body.classList.contains('landscape');
    // review #18: on tablets/desktops the deploy and battle screens put their panel in a column beside the board
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
    if (u) { ui.info = u.id; const el = $('#info'); if (el) { el.innerHTML = infoHTML(); el.classList.remove('empty'); } }
    if (battle || !h) return;
    if (u && u.side === 0 && u.uid) { ui.drag = { uid: u.uid, from: h, key: u.key }; view.canvas.setPointerCapture(e.pointerId); }
  }
  function onMove(e) { if (!ui.drag || battle) return; const { x, y, h } = evHex(e); drawPreview({ drop: h && h.r >= 4 ? h : null, dragGhost: { x, y, key: ui.drag.key } }); }
  function onUp(e) {
    if (battle) return;
    const { h } = evHex(e); const d = ui.drag; ui.drag = null;
    if (d && h && (h.c !== d.from.c || h.r !== d.from.r)) { if (h.r >= 4) { Run.setPos(run, d.uid, h.c, h.r); ui.selUid = 0; save(); } }
    else if (d) ui.selUid = ui.selUid === d.uid ? 0 : d.uid;
    else if (ui.selUid && h && h.r >= 4) { Run.setPos(run, ui.selUid, h.c, h.r); ui.selUid = 0; save(); }
    preview = worldFor(true);
    drawPreview();
  }

  // ------------------------------------------------------------------ battle
  function startBattle() {
    const gau = run.cur && run.cur.type === 'gauntlet';
    const W = worldFor(false);
    save();
    battle = { W, acc: 0, last: performance.now(), endAt: 0, gau };
    ui.info = null; screen = 'battle'; render();
    requestAnimationFrame(loop);
  }
  function loop(now) {
    const b = battle; if (!b) return;
    const dt = Math.min(100, now - b.last); b.last = now;
    const TICK = 1000 / Sim.TPS;
    if (!b.W.over) { b.acc += dt * ui.speed; let n = 0; while (b.acc >= TICK && !b.W.over && n++ < 60) { Sim.step(b.W); b.acc -= TICK; } }
    else if (!b.endAt) b.endAt = now + 1000;
    const T = b.W.t + (b.W.over ? 0 : b.acc / TICK);
    if (view) Render.draw(view, b.W, T, {});
    const hud = $('#bhud');
    if (hud) {
      const secs = Math.floor(b.W.t / Sim.TPS);
      const title = b.gau ? `⚔ Floor ${run.g.round + 1} · ${esc(run.g.opp.name)}` : run.cur.diff === 'boss' ? '☠ Boss' : '⚔ ' + B.DIFF[run.cur.diff].name;
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
    const dmg = {}; for (const u of W.units) if (u.uid) dmg[u.uid] = u.dmgDone || 0;
    for (const u of W.units) if (u.owner && W.byId[u.owner] && W.byId[u.owner].uid) dmg[W.byId[u.owner].uid] = (dmg[W.byId[u.owner].uid] || 0) + (u.dmgDone || 0);
    if (b.gau) {
      const win = W.winner === 0;
      ui.result = { gauntlet: true, win, dmg, xp: run.heroes.map(h => ({ uid: h.uid, name: HEROES[h.key].name, gained: 0, from: h.lvl, to: h.lvl })), opp: run.g.opp, pending: true };
      screen = 'result'; save(); render();
      try { const r = await Net.post('elo', { op: 'result', pid: pid(), name: myName(), teamId: run.g.teamId, win, team: Run.teamSnapshot(run), relics: run.relics }); setElo(r); Run.gauntletUpdate(run, r); Object.assign(ui.result, { delta: r.delta, elo: r.elo, ghost: r.ghost, lg: r.lg, pending: false }); ui.climb = win; }
      catch (e) { Object.assign(ui.result, { pending: false, error: e.message }); }
      save(); render(); return;
    }
    const bossKey = run.cur && run.cur.diff === 'boss' ? (run.cur.enemies.find(e => B.BOSSES[e.key]) || {}).key : null;
    ui.result = Run.finishFight(run, W); ui.result.dmg = dmg; screen = 'result';
    if (bossKey) {  // review #20: the boss's own Elo (never the player's)
      const res = ui.result;
      Net.post('elo', { op: 'boss', pid: pid(), name: myName(), boss: bossKey, win: res.win }).then(r => { if (r.boss) { res.boss = r.boss; if (ui.result === res && screen === 'result') render(); } }).catch(() => {});
    }
    save(); render(); window.scrollTo(0, 0);
    if (run.phase === 'over') {  // review #3: a lost fight ends the run = Elo loss (review #14: against 1000; the fight's pieces lose too)
      ui.result.pending = true; render();
      try { const r = await Net.post('elo', Object.assign({ op: 'fail', pid: pid(), name: myName() }, run.lastFight)); setElo(r); run.eloEnd = r.elo; run.eloDelta = r.delta; run.lgEnd = r.lg || null; Object.assign(ui.result, { delta: r.delta, elo: r.elo, lg: r.lg }); }
      catch (e) { ui.result.error = e.message; }
      ui.result.pending = false; save(); render();
    }
  }
  function skipBattle() { const b = battle; if (!b) return; let n = 0; while (!b.W.over && n++ < 20 * 60 * 30) Sim.step(b.W); b.endAt = performance.now(); }

  // ------------------------------------------------------------------ modals
  function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; ui.modal = true; }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; ui.modal = null; clearInterval(ui.sugTimer); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), Math.max(2200, String(msg).length * 45)); }

  // Team sheet (review #2): items on the LEFT, heroes on the RIGHT. Tap an item, then tap a hero to equip it.
  // Itemization v16: the bag is an inventory grid of rarity-framed icons (best first) and the selected item's card sits
  // on top; each hero is a paper doll with one slot per item type around the portrait, stats beside it (tap a worn item
  // to take it off; equipping a type the hero already wears swaps the two).
  function teamHTML() {
    const selId = ui.selBag >= 0 ? run.bag[ui.selBag] : null, sel = selId ? ITEM[selId] : null;
    const order = run.bag.map((id, i) => i).sort((a, b) => RANK(run.bag[b]) - RANK(run.bag[a]) || DOLL.indexOf(ITEM[run.bag[a]].type) - DOLL.indexOf(ITEM[run.bag[b]].type));
    const items = order.map(i => { const id = run.bag[i], it = ITEM[id]; return `<button class="eqitem tile ${ui.selBag === i ? 'on' : ''}" style="--tier:${TIER_COLOR[it.tier]}" data-act="bag" data-arg="${i}" title="${esc(it.name)}" aria-label="${esc(it.name + ', ' + B.RARITY[it.tier].name + ' ' + B.TYPE[it.type].name)}">${ico('item', id, 44)}</button>`; }).join('');
    const heroes = run.heroes.map(h => {
      const d = HEROES[h.key], def = Run.heroDef(run, h), sl = Run.slots(run, h);
      const next = h.lvl < CFG.maxLevel ? CFG.xpLevels[h.lvl + 1] : null, prev = CFG.xpLevels[h.lvl] || 0;
      const specs = h.specs.map(id => Run.specOf(h.key, id)).filter(Boolean);
      const worn = {}; h.items.forEach((id, i) => { worn[ITEM[id].type] = i; });
      const can = !!sel && Run.canEquip(run, h, selId), swap = can && worn[sel.type] != null;
      const cell = t => {
        const i = worn[t], fit = sel && sel.type === t && can ? ' fit' : '';
        if (i == null) return `<span class="dslot d-${t} empty${fit}" title="${B.TYPE[t].name}"><img src="${B.Icons.slot(t, 34)}" alt="${B.TYPE[t].name}"></span>`;
        const id = h.items[i], it = ITEM[id], pic = `<img src="${B.Icons.item(id, 34)}" alt="${esc(it.name)}">`;
        // while an item is selected the whole card is the tap target (equip / swap), so worn items are not buttons
        return sel ? `<span class="dslot d-${t}${fit}" style="--rc:${TIER_COLOR[it.tier]}" title="${esc(it.name)}">${pic}</span>`
          : `<button class="dslot d-${t}" style="--rc:${TIER_COLOR[it.tier]}" data-act="unequip" data-arg="${h.uid}:${i}" title="${esc(it.name + ': ' + it.desc + ' (tap to take off)')}">${pic}</button>`;
      };
      const sc = Run.setCounts(h.items);
      const sets = Object.keys(sc).map(sid => { const S = B.SETS[sid], n = sc[sid]; return `<div class="setline ${n >= 2 ? 'on' : ''}">◆ <b>${esc(S.name)}</b> ${n}/3${n >= 2 ? ' · ' + fmt(S.bonus[2].desc) : ''}${n >= 3 ? ' · ' + fmt(S.bonus[3].desc) : ''}</div>`; }).join('');
      return `<div class="eqhero ${can ? 'target' : ''} ${sel && !can ? 'full' : ''}" ${sel ? `data-act="equip" data-arg="${h.uid}"` : ''}>
        <div class="hrow"><b>${esc(d.name)}</b> <span class="lv">Lv ${h.lvl}</span> <span class="dim small">items ${h.items.length}/${sl}</span>
          <div class="xpbar" title="XP"><i style="width:${next ? Math.round(100 * (h.xp - prev) / (next - prev)) : 100}%"></i></div>
          ${can ? `<span class="tap">${swap ? 'tap to swap' : 'tap to equip'}</span>` : sel ? '<span class="tap dim">no free slot</span>' : ''}</div>
        <div class="hbody"><div class="doll">${DOLL.map(cell).join('')}<button class="dpor" data-act="hero-info" data-arg="${h.uid}" aria-label="${esc(d.name)}: ability">${img(h.key, 52)}</button></div>
        ${chips({ hp: Math.round(def.hp), atk: Math.round(def.atk), ap: Math.round(def.ap), armor: Math.round(def.armor), mr: Math.round(def.mr), as: def.as.toFixed(2), range: def.range, crit: def.crit ? pct(def.crit) : 0, dodge: def.dodge ? pct(def.dodge) : 0 }, true)}</div>${sets}
        <button class="small abline" data-act="hero-info" data-arg="${h.uid}"><span class="ib">ⓘ</span> <b>${esc(d.abName)}</b>${specs.length ? ' · ' + specs.map(sp => `<span class="spec">★ ${esc(sp.name)}</span>`).join(' ') : ''}</button>
      </div>`;
    }).join('');
    return `<div class="shead"><b>Team & items</b><button data-act="close">✕</button></div>
      ${!sel && ui.heroInfo && run.heroes.some(h => h.uid === ui.heroInfo) ? heroCardHTML(run.heroes.find(h => h.uid === ui.heroInfo)) : ''}
      ${sel ? `<div class="idetail" style="--tier:${TIER_COLOR[sel.tier]}">${ico('item', selId, 44)}<div class="t"><div><b style="color:${TIER_COLOR[sel.tier]}">${esc(sel.name)}</b> ${itemTag(sel)}</div><div class="small">${fmt(sel.desc)}</div>${setInfo(sel)}</div>
        <button class="chip" data-act="sell">Sell ${Run.sellValue(sel.id)}g</button></div>`
        : `<p class="hint">${run.bag.length ? 'Tap an item on the left, then a hero on the right. One item of each type per hero.' : 'Your bag is empty: buy items in the Item Shop. Tap a worn item to take it off.'}</p>`}
      <div class="equip">
        <div class="eqcol bagcol"><h3>Bag</h3><div class="baggrid">${items || '<p class="dim small">Empty</p>'}</div></div>
        <div class="eqcol"><h3>Heroes (${run.heroes.length}/${Run.teamMax(run)})</h3>${heroes}</div>
      </div>
      <div class="relicline"><b>Relics</b>${run.relics.length ? run.relics.map(id => `<button class="relicbtn" data-act="relic-info" data-arg="${id}" title="${esc(RELIC[id].name + ': ' + RELIC[id].desc)}" aria-label="${esc(RELIC[id].name)}">${ico('relic', id, 30)}</button>`).join('') + '<span class="dim small">tap one to read it</span>' : '<span class="dim small">none yet</span>'}</div>`;
  }

  // review #19 (David: "include ability to read hero ability in item screen"): the hero card on top of the team sheet
  function heroCardHTML(h) {
    const d = HEROES[h.key], def = Run.heroDef(run, h), specs = h.specs.map(id => Run.specOf(h.key, id)).filter(Boolean);
    return `<div class="hdetail"><div class="row">${img(h.key, 44)}<div class="grow"><b>${esc(d.name)}</b> <span class="lv">Lv ${h.lvl}</span> <span class="dim small">${esc(d.role)}</span>
        <div class="small"><b class="abname">${esc(d.abName)}</b> ${fmt(d.abDesc)}</div></div><button class="chip" data-act="hero-info" data-arg="0" aria-label="Close">✕</button></div>
      ${scalingHTML(def)}
      ${specs.length ? `<div class="hspecs">${specs.map(sp => `<div class="small"><b class="spec">★ ${esc(sp.name)}</b> ${fmt(sp.desc)}</div>`).join('')}</div>` : ''}</div>`;
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
    return `<div class="shead"><b>💡 Suggest changes</b><button data-act="close">✕</button></div>
      <div id="sugStatus"></div>
      <p class="small">Write each change and tap <b>Add</b>. Got 5 ideas? Add all 5, then tap <b>Send for review</b>. Claude reviews the whole list and ships it. A bar at the top of the page tells you when it is ready: press F5 and play the new version.</p>
      <form data-form="draft" class="stack">
        <textarea name="text" maxlength="1500" rows="3" placeholder="A bug, a rebalance, a new hero, item or relic, a UI change, a full restructure... One change per note. Any language is fine."></textarea>
        <button>+ Add to my list</button>
      </form>
      <h3>My list</h3><div id="drafts">${draftsHTML()}</div>
      <div class="row"><input id="sugName" maxlength="24" placeholder="Your name (optional)" value="${esc(store.get('balance.name', ''))}"><button class="primary" data-act="send-review">Send for review</button></div>
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
  // review #21 (David: "a player tab with scrolling banners for the leagues and the path between tiers")
  function playerTabHTML(me) {
    const L = B.LEAGUES, R = B.LEAGUE_RULES, cur = me.league | 0, top = L.length - 1, lp = me.lp | 0;
    const banners = L.map((l, i) => {
      const st = i < cur ? 'Reached ✓' : i === cur ? (i === top ? `${lp} points · no ceiling` : `${lp} / ${R.step} points`) : i === top ? `${R.step} points in ${L[i - 1].name} · no ceiling` : `${R.step} points in ${L[i - 1].name}`;
      return `<div class="lgb ${i < cur ? 'done' : i === cur ? 'cur' : 'locked'}" style="--lc:${l.color};--lh:${l.hi}"><span class="rod"></span>${emblem(i, 70)}<b>${l.name}</b><span class="lgs">${st}</span>
        ${i === cur && i < top ? `<span class="lgbar"><i style="width:${100 * lp / R.step}%"></i></span>` : i === cur ? '<span class="here">You are here</span>' : ''}</div>`;
    }).join('');
    const path = L.map((l, i) => `<span class="pn ${i < cur ? 'done' : i === cur ? 'cur' : ''}" title="${l.name}">${emblem(i, i === cur ? 30 : 22)}</span>${i < top ? `<span class="pl"><i style="width:${i < cur ? 100 : i === cur ? Math.round(100 * lp / R.step) : 0}%"></i></span>` : ''}`).join('');
    return `<div class="ptab"><div class="pme">${emblem(cur, 52)}<div><b>${esc(myName() || 'You')}</b><span class="pl1" style="color:${L[cur].hi}">${L[cur].name} league</span>
        <span class="small">${cur >= top ? `${lp} points in Celestial` : `${lp}/${R.step} points to ${L[cur + 1].name}`}</span><span class="dim small">Elo ${me.elo} · ${me.runs} runs · best ${me.best} · 👑 ${me.crowns}</span></div></div>
      <div class="lgscroll" id="lgscroll">${banners}</div>
      <div class="lgpath">${path}</div>
      <p class="small dim">+${R.duelWin} league point for each Gauntlet duel you win, ${R.pveLoss} when a run ends before the Gauntlet (a PvE loss). ${R.step} points move you up one league and you never drop a league. Celestial has no ceiling.</p></div>`;
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
    const name = id => `<td class="who">${pic(id)}<span${kind === 'item' ? ` style="color:${TIER_COLOR[ITEM[id].tier]}"` : B.BOSSES[id] ? ' class="bossname"' : ''}>${B.BOSSES[id] ? '☠ ' : ''}${esc(def(id).name)}</span></td>`;
    const rows = rated.map((id, i) => { const r = by[id]; return `<tr><td>${i + 1}</td>${name(id)}<td><b>${r.elo}</b></td><td>${r.games}</td><td>${Math.round(100 * r.wins / r.games)}%</td></tr>`; }).join('')
      + rest.map(id => `<tr class="unrated"><td></td>${name(id)}<td colspan="3">${noFight(id) ? 'no combat effect' : 'not played yet'}</td></tr>`).join('');
    return `<p class="dim small">Every ${kind} has its own Elo, apart from the players, to guide balance. It only counts in fights where it acted: heroes on the board, equipped items and relics with a combat effect. Losing a run is a loss against 1000, reaching the Gauntlet a win against 1000, and a duel is a game against the other team's ${kind === 'hero' ? 'heroes' : kind + 's'}.${kind === 'hero' ? ' ☠ Bosses have their own Elo: it rises when they beat a player and falls when they lose (against that player\'s Elo), and never changes the player\'s.' : ''}</p>
      <table class="tbl ctbl"><tr><th>#</th><th>${kind === 'hero' ? 'Hero' : kind === 'item' ? 'Item' : 'Relic'}</th><th>Elo</th><th>Fights</th><th>Won</th></tr>${rows}</table>`;
  }
  async function openScores(tab) {
    tab = ui.ladderTab = tab || ui.ladderTab || 'players';
    const head = `<div class="shead"><b>🏆 Ladder</b><button data-act="close">✕</button></div>
      <div class="tabs">${LADDER_TABS.map(([k, n]) => `<button data-act="ladder-tab" data-arg="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    openModal(head + '<p class="dim">Loading…</p>');
    try {
      if (tab === 'player') {
        const me = await Net.post('elo', { op: 'hello', pid: pid() }); setElo(me);
        if (ui.modal && ui.ladderTab === tab) {
          openModal(head + playerTabHTML(me)); header();
          const sc = $('#lgscroll'), c = sc && sc.querySelector('.lgb.cur');
          if (c) sc.scrollLeft = c.offsetLeft - (sc.clientWidth - c.clientWidth) / 2;
        }
        return;
      }
      if (tab !== 'players') {
        const e = await Net.get('elo?ratings=1');
        if (ui.modal && ui.ladderTab === tab) openModal(head + contentTable(tab, e.ratings || []));
        return;
      }
      const e = await Net.get('elo');
      const eRows = e.top.map((p, i) => `<tr><td>${i + 1}</td><td class="who">${emblem(p.league || 0, 20)}<span>${esc(p.name)}</span></td><td><b>${p.elo}</b></td><td>${p.best}</td><td>${p.crowns ? '👑' + p.crowns : ''}</td></tr>`).join('');
      if (ui.modal && ui.ladderTab === tab) openModal(head + `<p class="dim small">Rated by gauntlet duels against player ghosts. A run that dies before the Gauntlet is a loss against a 1000 rated opponent, reaching it is a win against one. Best = most duels won in one run.</p>
        ${eRows ? `<table class="tbl"><tr><th>#</th><th>Name</th><th>Elo</th><th>Best</th><th></th></tr>${eRows}</table>` : '<p class="dim">No rated players yet.</p>'}`);
    } catch (err) { if (ui.modal && ui.ladderTab === tab) openModal(head + `<p class="err">${esc(err.message)}</p>`); }
  }
  const HOWTO = `<div class="shead"><b>How to play</b><button data-act="close">✕</button></div>
    <ol class="small howto">
      <li>Start with 1 hero and 1 relic (3 of each offered). Each hero has a unique ability that fires when its blue mana bar is full. Recruit up to 3 heroes in the Hero Shop.</li>
      <li>Every step offers 2 options: easy/medium/hard fights, or a shop/event. Fights 4 and 8 are bosses.</li>
      <li>Before each fight, place heroes in the 4 blue rows. Then the battle plays itself.</li>
      <li>How abilities scale: <span class="kw-atk">physical</span> abilities deal a % of <b>attack</b>; <span class="kw-ap">magic</span> abilities deal a % of attack multiplied by <b>ability power</b> (100 AP = ×1, 150 AP = ×1.5), and so do burns and heals; shields are a % of <b>max HP</b>. Tap a hero (in battle or in Team) to see its numbers.</li>
      <li>Heroes earn XP for every second they stay alive. Level ups raise stats and let you pick a specialization. From Lv 3, each level adds an item slot. Lv 5 is rare.</li>
      <li>Items have a type (weapon, off-hand, helmet, armor, gloves, boots, trinket) and a rarity: <span class="r-common">common</span>, <span class="r-uncommon">uncommon</span>, <span class="r-rare">rare</span>, <span class="r-epic">epic</span>, <span class="r-set">set</span>, <span class="r-legendary">legendary</span> and <span class="r-mythic">mythic</span>. A hero wears one item of each type, up to their slot count. Two or three pieces of a set on the same hero unlock set bonuses.</li>
      <li>Win fights for gold. Spend it in hero, item and relic shops. Your team holds up to 3 heroes. Lose a single fight and the run ends (an Elo loss against a 1000 rated opponent). Heroes always heal after a fight.</li>
      <li>After the second boss and a last shop, your team enters the Gauntlet (an Elo win against a 1000 rated opponent) as a ghost and climbs a tower of ghosts of other players' runs, one floor per win. Each duel is an Elo game, for the ghost too (its own Elo and its player's). One loss ends it. Beat everyone who came before and you are crowned champion.</li>
    </ol>`;


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
      const where = p.held ? `Review #${p.batch} is waiting for the owner's OK<span class="dots"></span>` : p.working ? `Claude is working on your review #${p.batch}<span class="dots"></span>`
        : p.ahead ? `Review #${p.batch} is queued, ${p.ahead} ahead of yours<span class="dots"></span>`
        : `Review #${p.batch} sent. Waiting for Claude<span class="dots"></span>`;
      html = `⏳ ${where}${p.offline && !p.working ? ' <span class="dim">(reviewer offline, it will start when back)</span>' : ''}<span class="nx">details</span>`;
    } else if (p && p.state === 'ready' && p.done > 0) {
      cls = 'ready'; html = `✅ Your changes are ready! Press F5 (or tap here) to see them.`;
    } else if (p && (p.state === 'shown' || (p.state === 'ready' && !p.done))) {
      cls = 'info';
      html = p.done ? `✅ Review #${p.batch} is live: ${p.done} applied${p.declined ? ', ' + p.declined + ' declined' : ''}. Tap to read the replies.`
        : `Review #${p.batch} is done: nothing shipped (${p.declined} declined). Tap to read why.`;
      html += '<span class="nx" data-act="notice-x" aria-label="Dismiss">✕</span>';
    } else if (nt.update) {
      cls = 'info'; html = '🔄 The game was just updated. Press F5 (or tap here) to get the new version.<span class="nx" data-act="notice-x" aria-label="Dismiss">✕</span>';
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
    'new-run': () => { run = Run.newRun((Math.random() * 2 ** 31) | 0); ui.startPick = []; ui.startRelic = null; ui.focusRelic = null; screen = 'run'; save(); render(); },
    'continue-run': () => { screen = 'run'; render(); },
    menu: () => { if (battle) return; screen = 'title'; closeModal(); render(); },
    howto: () => openModal(HOWTO),
    'start-pick': k => { ui.focus = k; ui.focusRelic = null; ui.startPick = ui.startPick[0] === k ? [] : [k]; render(); },
    'start-relic': id => { ui.focusRelic = id; ui.startRelic = ui.startRelic === id ? null : id; render(); },
    'start-go': () => { if (ui.startPick.length !== CFG.startHeroes || ((run.relicOffer || []).length && !ui.startRelic)) return; Run.pickStart(run, ui.startPick, ui.startRelic); ui.startRelic = null; save(); render(); },
    choose: i => { Run.choose(run, +i); ui.info = null; save(); render(); window.scrollTo(0, 0); },
    spec: i => { Run.chooseSpec(run, +i); save(); render(); },
    fight: () => startBattle(),
    speed: s => { ui.speed = +s; store.set('balance.speed', ui.speed); document.querySelectorAll('[data-act=speed]').forEach(b => b.classList.toggle('on', +b.dataset.arg === ui.speed)); },
    skip: () => skipBattle(),
    'result-ok': () => { ui.result = null; screen = 'run'; render(); window.scrollTo(0, 0); },
    'to-duel': () => { run.phase = 'deploy'; run.cur = { type: 'gauntlet' }; ui.info = null; save(); render(); window.scrollTo(0, 0); },
    'retry-elo': () => { if (ui.result && ui.result.gauntlet) { const w = ui.result.win; ui.result.pending = true; render(); Net.post('elo', { op: 'result', pid: pid(), name: myName(), teamId: run.g.teamId, win: w, team: Run.teamSnapshot(run), relics: run.relics }).then(r => { setElo(r); Run.gauntletUpdate(run, r); ui.climb = w; Object.assign(ui.result, { delta: r.delta, elo: r.elo, ghost: r.ghost, pending: false, error: null }); save(); render(); }).catch(e => { Object.assign(ui.result, { pending: false, error: e.message }); render(); }); } },
    buy: i => { const err = Run.buy(run, +i); if (err) toast(err); save(); render(); },
    reroll: () => { if (!Run.reroll(run)) toast('Not enough gold'); save(); render(); },
    leave: () => { Run.leave(run); save(); render(); window.scrollTo(0, 0); },
    event: i => {
      const ch = Run.eventChoices(run)[+i]; if (!ch) return;
      if (ch.target) { run.cur.pick = +i; render(); return; }
      Run.eventAct(run, +i); run.cur.pick = null; save(); render();
    },
    'event-target': arg => { const i = run.cur.pick; run.cur.pick = null; if (i == null) return; Run.eventAct(run, i, arg); save(); render(); },
    'event-back': () => { run.cur.pick = null; render(); },
    team: () => { if (!run || battle) return; openModal(teamHTML()); },
    bag: i => { ui.selBag = ui.selBag === +i ? -1 : +i; ui.heroInfo = 0; openModal(teamHTML()); },
    'hero-info': uid => { ui.heroInfo = +uid && ui.heroInfo !== +uid ? +uid : 0; ui.selBag = -1; openModal(teamHTML()); },
    equip: uid => { if (ui.selBag < 0) { toast('Select an item in the bag first'); return; } const err = Run.equip(run, ui.selBag, +uid); if (err) toast(err); else ui.selBag = -1; save(); openModal(teamHTML()); refreshBehind(); },
    unequip: a => { const [uid, i] = a.split(':').map(Number); Run.unequip(run, uid, i); save(); openModal(teamHTML()); refreshBehind(); },
    sell: () => { if (ui.selBag < 0) return; Run.sell(run, ui.selBag); ui.selBag = -1; save(); openModal(teamHTML()); header(); },
    close: () => { closeModal(); ui.selBag = -1; if (!battle) render(); },
    suggest: () => openSuggest(),
    'draft-del': i => { const d = drafts(); d.splice(+i, 1); store.set('balance.drafts', d); renderDrafts(); },
    'send-review': (a, el) => sendReview(el),
    'sug-refresh': () => loadQueue(),
    scores: () => openScores(),
    'player-tab': () => openScores('player'),
    'relic-info': id => { const r = RELIC[id]; if (r) toast(r.name + ': ' + r.desc); },
    'ladder-tab': k => openScores(k),
  };
  function refreshBehind() { header(); if (run && run.phase === 'deploy' && screen !== 'battle') { preview = worldFor(true); drawPreview(); } }

  document.addEventListener('click', e => {
    if (e.target.closest('#notice')) return;
    const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
    e.preventDefault(); const f = ACT[el.dataset.act]; if (f) f(el.dataset.arg, el);
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
      } else if (kind === 'gauntlet') {
        const name = f.name.value.trim(); store.set('balance.name', name);
        const r = await Net.post('elo', { op: 'enter', pid: pid(), name, team: Run.teamSnapshot(run), relics: run.relics, reached: run.lastFight });
        setElo(r); Run.gauntletUpdate(run, r); save(); render(); window.scrollTo(0, 0);
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
    }, 120);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  // ------------------------------------------------------------------ boot
  run = Run.migrate(run);
  screen = 'title';
  layoutClasses();
  render();
  bootNotice();
  // test hook (headless Chrome tests drive the game through this)
  window.__bal = { get run() { return run; }, get battle() { return battle; }, ACT, render, skipBattle, poll, fmt, scaleParts, hexScreen: (c, r) => { const b = view.canvas.getBoundingClientRect(), p = Render.hexScreen(view, c, r); return { x: b.left + p.x, y: b.top + p.y }; } };
})();
