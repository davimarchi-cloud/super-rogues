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
  const setElo = r => { if (r && r.elo != null) store.set('balance.elo', r.elo); };

  const MOB_ABIL = {
    smash: 'Smash: a heavy blow that stuns its target.', mend: 'Mend: heals the weakest ally.', explode: 'Explodes when next to an enemy.',
    wall: 'Shield Wall: shields nearby allies.', curse: 'Curse: damages, silences and slows.', slam: 'Slam: stuns everything adjacent.',
    imps: 'Summons two imps.', cleave: 'Cleave: hits and stuns everything adjacent.', nova: 'Void Nova: stuns everything within 2 hexes.',
  };
  const por = (key, px = 44, full) => B.Models.portrait(key === 'clone' ? 'mirage' : key, px, !full);
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
    return `<span class="stats-row">${c('s-hp', '❤', d.hp, 'Health')}${c('s-atk', '⚔', d.atk, 'Attack')}${full ? c('s-ap', '✦', d.ap, 'Ability power') : ''}${c('s-arm', '⛨', d.armor, 'Armor')}${c('s-mr', '◈', d.mr, 'Magic resist')}${c('s-as', '»', d.as, 'Attacks per second')}${c('s-rng', '➶', d.range, 'Range (hexes)')}${d.crit ? c('s-crit', '✸', d.crit, 'Crit chance') : ''}${d.dodge ? c('s-dodge', '↯', d.dodge, 'Dodge') : ''}</span>`;
  }
  const pct = x => Math.round(x * 100) + '%';
  const TIER_COLOR = { common: '#b8c0cc', rare: '#5fa8ff', epic: '#c77dff' };
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
    const prog = g ? (g.round != null ? 'Gauntlet · round ' + (g.round + 1) : 'Gauntlet') : 'Day ' + (stepN + 1) + '/' + CFG.seq.length;
    h.innerHTML = `${elo != null ? `<span class="elo" title="Your Elo rating">⚜ ${elo}</span>` : ''}
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
      <div class="abil"><b class="abname">${esc(h.abName)}</b> ${fmt(h.abDesc)}</div>${extra}</div>`;
  }
  function startHTML() {
    const f = run.startOffer.includes(ui.focus) ? ui.focus : run.startOffer[0], h = HEROES[f], n = ui.startPick.length;
    return `<section class="start"><h2 class="sc">Choose your champions</h2><p class="hint center">Pick 2. Tap a banner to read it.</p>
      <div class="hbanners">${run.startOffer.map(k => { const d = HEROES[k], on = ui.startPick.includes(k);
        return `<button class="hbanner ${on ? 'on' : ''} ${k === f ? 'focus' : ''}" data-act="start-pick" data-arg="${k}" style="--cloth:${d.color}">
          <span class="rod"></span><img src="${por(k, 120, true)}" alt=""><b>${esc(d.name)}</b><i>${d.role}</i>${on ? '<span class="chk">✓</span>' : ''}</button>`; }).join('')}</div>
      <div class="card detail"><div class="hrow">${img(f, 48)}<b>${esc(h.name)}</b><span class="role">${h.role}</span></div>
        ${chips({ hp: h.hp, atk: h.atk, armor: h.armor, mr: h.mr, as: h.as, range: h.range, crit: h.crit ? pct(h.crit) : 0, dodge: h.dodge ? pct(h.dodge) : 0 })}
        <div class="abil"><b class="abname">${esc(h.abName)}</b> ${fmt(h.abDesc)}</div></div>
      <div class="bar"><button class="primary big" data-act="start-go" ${n === 2 ? '' : 'disabled'}>Begin the journey (${n}/2)</button></div></section>`;
  }

  function trackHTML() {
    return `<div class="track">${CFG.seq.map((t, i) => `<span class="node ${i < run.step ? 'done' : i === run.step ? 'cur' : ''} ${t === 'B' ? 'boss' : ''}" title="${t}">${NODE_ICON[t]}</span>`).join('')}</div>`;
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
  function mapHTML() {
    const t = CFG.seq[run.step];
    const title = t === 'B' ? 'A boss blocks the way' : t === 'S' ? 'One last shop' : 'Choose your path';
    return `<section>${trackHTML()}<h2 class="sc">Day ${run.step + 1} · ${title}</h2><div class="banners ${run.opts.length === 1 ? 'one' : ''}">${run.opts.map(optHTML).join('')}</div>
      <p class="hint">${run.heroes.length} hero${run.heroes.length > 1 ? 'es' : ''} · ${run.bag.length} item${run.bag.length === 1 ? '' : 's'} in bag${run.bag.length ? ' (<a href="#" data-act="team">equip them</a>)' : ''}</p></section>`;
  }

  function levelHTML() {
    const p = run.pending[0], h = run.heroes.find(x => x.uid === p.uid), d = HEROES[h.key];
    const pair = d.specs[p.lvl - 2];
    return `<section><h2>Level up!</h2>
      <div class="hrow big">${img(h.key, 64)}<b>${esc(d.name)}</b> reached <b>Lv ${p.lvl}</b></div>
      <p class="small">${fmt('+15% HP and attack, +10 ability power, +4 armor and MR')}${p.lvl >= 3 ? ', <b class="kw-gold">+1 item slot</b>' : ''}.</p>
      <h3>Choose a specialization</h3>
      <div class="opts">${pair.map((s, i) => `<button class="card opt" data-act="spec" data-arg="${i}"><div class="ctitle spec">★ ${esc(s.name)}</div><div class="small">${fmt(s.desc)}</div></button>`).join('')}</div></section>`;
  }

  function deployHTML() {
    const gau = run.cur && run.cur.type === 'gauntlet';
    const f = run.cur;
    return `<section class="deploy">
      <div class="bhead">${gau ? `⚔ Gauntlet round ${run.g.round + 1} · vs ${esc(run.g.opp.name)} (Elo ${run.g.opp.elo})` : f.diff === 'boss' ? '☠ Boss fight' : '⚔ ' + B.DIFF[f.diff].name + ' fight'} · deploy</div>
      <p class="hint tight">Drag heroes within the blue rows. Tap a unit for details.</p>
      <div class="boardwrap"><canvas id="board"></canvas></div>
      <div id="info" class="info mini ${ui.info ? '' : 'empty'}">${infoHTML()}</div>
      <div class="bar sticky"><button data-act="team">Team & items</button><button class="primary big" data-act="fight">${gau ? 'Duel!' : 'Fight!'}</button></div>
    </section>`;
  }
  function battleHTML() {
    return `<section class="deploy battle">
      <div class="hud"><div id="bhud" class="hud-l"></div>
        <div class="speed">${[1, 2, 4].map(x => `<button class="${ui.speed === x ? 'on' : ''}" data-act="speed" data-arg="${x}">${x}×</button>`).join('')}<button class="skip" data-act="skip" aria-label="Skip">⏭</button></div></div>
      <div class="boardwrap"><canvas id="board"></canvas></div>
      <div class="teamstrip" id="tstrip"></div>
      <div id="info" class="info mini ${ui.info ? '' : 'empty'}">${infoHTML()}</div></section>`;
  }
  function stripHTML(W) {
    return W.units.filter(u => u.side === 0 && u.kind === 'hero').map(u => `<div class="ts ${u.dead ? 'dead' : ''}" data-id="${u.id}">${img(u.key, 30, 'por sm')}
      <div class="tsb"><b>${esc(u.name)}</b><i class="hp"><s style="width:${Math.max(0, 100 * u.hp / u.maxHp)}%"></s></i><i class="mp"><s style="width:${u.maxMana ? Math.min(100, 100 * u.mana / u.maxMana) : 0}%"></s></i></div></div>`).join('');
  }
  function updateStrip(W) {
    const el = $('#tstrip'); if (!el) return;
    if (!el.firstChild) { el.innerHTML = stripHTML(W); return; }
    for (const d of el.querySelectorAll('.ts')) {
      const u = W.byId[d.dataset.id]; if (!u) continue;
      d.classList.toggle('dead', !!u.dead);
      d.querySelector('.hp s').style.width = Math.max(0, 100 * u.hp / u.maxHp) + '%';
      d.querySelector('.mp s').style.width = (u.maxMana ? Math.min(100, 100 * u.mana / u.maxMana) : 0) + '%';
    }
  }


  function eloLine(r) {
    if (r.pending) return '<p class="dim">Updating your Elo…</p>';
    if (r.error) return `<p class="err">${esc(r.error)}</p><button data-act="retry-elo">Try again</button>`;
    return r.delta != null ? `<p class="elo-line">Elo <b>${r.elo}</b> <span class="${r.delta >= 0 ? 'win' : 'lose'}">(${r.delta >= 0 ? '+' : ''}${r.delta})</span></p>` : '';
  }
  function resultHTML() {
    const r = ui.result;
    const table = r.gauntlet ? '' : `<table class="tbl"><tr><th>Hero</th><th>Damage</th><th>XP</th><th>Level</th></tr>
      ${r.xp.map(x => { const hk = (run.heroes.find(h => h.uid === x.uid) || {}).key; return `<tr><td class="who">${hk ? img(hk, 28, 'por sm') : ''}${esc(x.name)}</td><td><b class="num">${Math.round(r.dmg[x.uid] || 0)}</b></td><td class="kw-xp">+${x.gained}</td><td>${x.to > x.from ? '<b class="up">Lv ' + x.to + ' ▲</b>' : 'Lv ' + x.to}</td></tr>`; }).join('')}</table>`;
    const sub = r.gauntlet ? `${r.win ? 'You beat' : 'You fell to'} ${esc(r.opp.name)}'s team.`
      : r.win ? '+' + r.gold + ' gold' : 'Your run is over. ' + (r.timeout ? 'Time ran out.' : '');
    return `<section class="result"><h2 class="${r.win ? 'win' : 'lose'} sc headline">${r.win ? 'Victory' : 'Defeat'}</h2><p>${sub}</p>${eloLine(r)}${table}
      <div class="bar"><button class="primary big" data-act="result-ok" ${r.pending ? 'disabled' : ''}>Continue</button></div></section>`;
  }

  // ---------------- gauntlet (reviews #3 #4 by David)
  function teamRow(team, relics) {
    return `<div class="gteam">${team.map(h => `<div class="gh">${img(h.key, 56)}<b>${esc(HEROES[h.key].name)}</b><span>Lv ${h.lvl}${h.items.length ? ' · ' + h.items.length + ' item' + (h.items.length > 1 ? 's' : '') : ''}</span></div>`).join('')}</div>
      ${relics && relics.length ? `<div class="relics inline">${relics.filter(id => RELIC[id]).map(id => `<img class="ico sm" title="${esc(RELIC[id].name)}" src="${B.Icons.relic(id, 26)}" alt="">`).join('')}</div>` : ''}`;
  }
  function gauntletHTML() {
    const g = run.g;
    if (g.status === 'intro') {
      return `<section class="title"><h2 class="sc">The Gauntlet</h2>
        <div class="card gintro"><p class="small">Your team is saved as a <b>ghost</b> and duels the ghosts of other players' runs. Round 1 is against a ghost that lost its first duel, round 2 against one that won once, and so on. Each duel is a 1v1 Elo game. One loss ends your run. Go further than every ghost before you and you are crowned champion.</p>
          ${teamRow(Run.teamSnapshot(run), run.relics)}
          <form class="stack" data-form="gauntlet"><input name="name" maxlength="16" placeholder="Your name on the ladder" value="${esc(myName())}" required><button class="primary big">Enter the Gauntlet</button></form></div></section>`;
    }
    // match card
    const o = g.opp;
    return `<section><h2 class="sc">Gauntlet · round ${g.round + 1}</h2>
      ${g.history.length ? `<p class="small">${g.history.map(h => `${h.win ? '✔' : '✘'} ${esc(h.name)} (${h.delta >= 0 ? '+' : ''}${h.delta})`).join(' · ')}</p>` : ''}
      <div class="card opp"><div class="row"><b class="sc">👻 ${esc(o.name)}</b><span class="grow"></span><span class="elo">⚜ ${o.elo}</span></div>
        <p class="small dim">${o.own ? 'A ghost of one of your own earlier runs (no other player\'s ghost has reached this step yet).' : o.status === 'champion' ? 'Their run was crowned champion in the gauntlet.' : 'Their run went ' + o.wins + '-1 in the gauntlet.'}</p>${teamRow(o.team, o.relics)}</div>
      <div class="bar"><button data-act="team">Team & items</button><button class="primary big" data-act="to-duel">Prepare the duel</button></div></section>`;
  }
  function stockCard(s, i) {
    const dis = s.sold || run.gold < s.price || (s.kind === 'hero' && run.heroes.length >= Run.teamMax(run));
    let body = '';
    if (s.kind === 'hero') { const h = HEROES[s.id]; body = `<div class="srow">${img(s.id, 48, 'por big')}<div><div class="ctitle">${esc(h.name)}</div><div class="tier">${h.role}</div></div></div><div class="small"><b class="abname">${esc(h.abName)}</b> ${fmt(h.abDesc)}</div>`; }
    else if (s.kind === 'item') { const it = ITEM[s.id]; body = `<div class="srow">${ico('item', s.id, 52, 'ico big')}<div><div class="ctitle" style="color:${TIER_COLOR[it.tier]}">${esc(it.name)}</div><div class="tier t-${it.tier}">${it.tier}</div></div></div><div class="small">${fmt(it.desc)}</div>`; }
    else { const r = RELIC[s.id]; body = `<div class="srow">${ico('relic', s.id, 52, 'ico big')}<div><div class="ctitle relic">${esc(r.name)}</div><div class="tier t-relic">relic</div></div></div><div class="small">${fmt(r.desc)}</div>`; }
    return `<div class="card stock ${s.sold ? 'sold' : ''}">${body}<button class="${dis ? '' : 'primary'}" data-act="buy" data-arg="${i}" ${dis ? 'disabled' : ''}>${s.sold ? 'Sold' : `Buy <span class="price">${s.price}</span>`}</button></div>`;
  }
  function shopHTML() {
    const c = run.cur, rc = Run.rerollCost(run);
    const note = c.kind === 'heroShop' ? `Team ${run.heroes.length}/${Run.teamMax(run)}` : c.kind === 'itemShop' ? `Items go to your bag. Equip them in Team.` : 'Relics affect every hero.';
    return `<section>${trackHTML()}<h2>🛒 ${SHOP_NAME[c.kind]}</h2><p class="hint">${note}</p>
      <div class="grid">${c.stock.map(stockCard).join('') || '<p>Nothing left to sell.</p>'}</div>
      <div class="bar sticky"><button data-act="reroll" ${run.gold < rc ? 'disabled' : ''}>Reroll · ${rc}g</button><button data-act="team">Team</button><button class="primary" data-act="leave">Continue ➜</button></div></section>`;
  }
  function eventHTML() {
    const e = EVENT[run.cur.id];
    const ok = ch => !(ch.req && ch.req.gold && run.gold < ch.req.gold);
    return `<section>${trackHTML()}<h2>❓ ${esc(e.name)}</h2><p>${esc(e.text)}</p>
      ${run.cur.done ? `<div class="card result">${fmt(run.cur.done)}</div><div class="bar"><button class="primary big" data-act="leave">Continue ➜</button></div>`
        : `<div class="stack">${e.choices.map((ch, i) => `<button class="big" data-act="event" data-arg="${i}" ${ok(ch) ? '' : 'disabled'}>${fmt(ch.label)}</button>`).join('')}</div>`}</section>`;
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
        ${g.history.length ? `<p class="small">${g.history.map(h => `${h.win ? '✔' : '✘'} ${esc(h.name)} (${h.delta >= 0 ? '+' : ''}${h.delta})`).join(' · ')}</p>` : ''}`;
    } else {
      body = `<h2 class="sc">Your run has ended</h2><p>You fell at fight ${run.fightNo}. Won ${run.won} fight${run.won === 1 ? '' : 's'}.</p>
        ${run.eloEnd != null ? `<p class="elo-line">Elo <b>${run.eloEnd}</b> <span class="lose">(${run.eloDelta})</span></p>` : ''}`;
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
      <div class="small">${abil}</div>`;
  }

  // ------------------------------------------------------------------ board mount + input
  function worldFor(preview) {
    const t = run.cur && run.cur.type;
    return t === 'gauntlet' ? Run.gauntletWorld(run, preview) : Run.fightWorld(run, preview);
  }
  function mountBoard() {
    const cv = $('#board'); if (!cv) return;
    const wrap = cv.parentElement;
    view = Render.setup(cv, Math.min(wrap.clientWidth || 360, 560));
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
      const title = b.gau ? `⚔ Round ${run.g.round + 1} · ${esc(run.g.opp.name)}` : run.cur.diff === 'boss' ? '☠ Boss' : '⚔ ' + B.DIFF[run.cur.diff].name;
      const str = `<b>${title}</b><span class="clock ${secs >= CFG.suddenDeath ? 'sd' : ''}">${secs >= CFG.suddenDeath ? 'Sudden death · ' : ''}${secs}s</span>`;
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
      try { const r = await Net.post('elo', { op: 'result', pid: pid(), name: myName(), teamId: run.g.teamId, win }); setElo(r); Run.gauntletUpdate(run, r); Object.assign(ui.result, { delta: r.delta, elo: r.elo, pending: false }); }
      catch (e) { Object.assign(ui.result, { pending: false, error: e.message }); }
      save(); render(); return;
    }
    ui.result = Run.finishFight(run, W); ui.result.dmg = dmg; screen = 'result';
    save(); render(); window.scrollTo(0, 0);
    if (run.phase === 'over') {  // review #3: a lost fight ends the run = Elo loss against (your Elo - 200)
      ui.result.pending = true; render();
      try { const r = await Net.post('elo', { op: 'fail', pid: pid(), name: myName() }); setElo(r); run.eloEnd = r.elo; run.eloDelta = r.delta; Object.assign(ui.result, { delta: r.delta, elo: r.elo }); }
      catch (e) { ui.result.error = e.message; }
      ui.result.pending = false; save(); render();
    }
  }
  function skipBattle() { const b = battle; if (!b) return; let n = 0; while (!b.W.over && n++ < 20 * 60 * 30) Sim.step(b.W); b.endAt = performance.now(); }

  // ------------------------------------------------------------------ modals
  function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; ui.modal = true; }
  function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; ui.modal = null; clearInterval(ui.sugTimer); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }

  // Team sheet (review #2): items on the LEFT, heroes on the RIGHT. Tap an item, then tap a hero to equip it.
  function teamHTML() {
    const selId = ui.selBag >= 0 ? run.bag[ui.selBag] : null, sel = selId ? ITEM[selId] : null;
    const items = run.bag.map((id, i) => { const it = ITEM[id]; return `<button class="eqitem ${ui.selBag === i ? 'on' : ''}" style="--tier:${TIER_COLOR[it.tier]}" data-act="bag" data-arg="${i}">
      ${ico('item', id, 34)}<span class="t"><b>${esc(it.name)}</b><span>${fmt(it.desc)}</span></span></button>`; }).join('');
    const heroes = run.heroes.map(h => {
      const d = HEROES[h.key], def = Run.heroDef(run, h), sl = Run.slots(run, h), full = h.items.length >= sl;
      const next = h.lvl < CFG.maxLevel ? CFG.xpLevels[h.lvl + 1] : null, prev = CFG.xpLevels[h.lvl] || 0;
      const specs = h.specs.map(id => Run.specOf(h.key, id)).filter(Boolean);
      const slots = [];
      for (let i = 0; i < sl; i++) {
        const id = h.items[i];
        slots.push(id ? `<button class="chip slot" style="border-color:${TIER_COLOR[ITEM[id].tier]}" data-act="unequip" data-arg="${h.uid}:${i}" title="${esc(ITEM[id].desc)}">${ico('item', id, 22, 'ico sm')}${esc(ITEM[id].name)} ✕</button>`
          : `<span class="chip empty">empty</span>`);
      }
      const target = sel && !full;
      return `<div class="eqhero ${target ? 'target' : ''} ${sel && full ? 'full' : ''}" ${sel ? `data-act="equip" data-arg="${h.uid}"` : ''}>
        <div class="hrow">${img(h.key, 40)}<div><b>${esc(d.name)}</b> <span class="lv">Lv ${h.lvl}</span><div class="xpbar"><i style="width:${next ? Math.round(100 * (h.xp - prev) / (next - prev)) : 100}%"></i></div></div></div>
        ${target ? '<div class="tap">Tap to equip here</div>' : sel && full ? '<div class="tap dim">No free slot</div>' : ''}
        <div class="slots">${slots.join('')}</div>
        ${chips({ hp: Math.round(def.hp), atk: Math.round(def.atk), ap: Math.round(def.ap), armor: Math.round(def.armor), mr: Math.round(def.mr), as: def.as.toFixed(2), range: def.range, crit: def.crit ? pct(def.crit) : 0, dodge: def.dodge ? pct(def.dodge) : 0 }, true)}
        <div class="small"><b>${esc(d.abName)}</b>${specs.length ? ' · ' + specs.map(sp => `<span class="spec" title="${esc(sp.desc)}">★ ${esc(sp.name)}</span>`).join(' ') : ''}</div>
      </div>`;
    }).join('');
    return `<div class="shead"><b>Team & items</b><button data-act="close">✕</button></div>
      <p class="hint">${sel ? `<b>${esc(sel.name)}</b> selected: tap a hero on the right. <a href="#" data-act="sell">Sell for ${Run.sellValue(sel.id)}g</a>` : 'Tap an item on the left, then tap a hero on the right.'}</p>
      <div class="equip">
        <div class="eqcol"><h3>Items (${run.bag.length})</h3>${items || '<p class="dim small">Bag is empty. Buy items in the Item Shop.</p>'}</div>
        <div class="eqcol"><h3>Heroes (${run.heroes.length}/${Run.teamMax(run)})</h3>${heroes}</div>
      </div>
      <h3>Relics</h3>${run.relics.length ? `<div class="relics">${run.relics.map(id => `<div class="relic-row">${ico('relic', id, 30)}<span><b class="relic">${esc(RELIC[id].name)}</b> <span class="desc">${fmt(RELIC[id].desc)}</span></span></div>`).join('')}</div>` : '<p class="dim small">None yet.</p>'}`;
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
  async function openScores() {
    const head = '<div class="shead"><b>🏆 Ladder</b><button data-act="close">✕</button></div>';
    openModal(head + '<p class="dim">Loading…</p>');
    try {
      const e = await Net.get('elo');
      const eRows = e.top.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td><b>${p.elo}</b></td><td>${p.best}</td><td>${p.crowns ? '👑' + p.crowns : ''}</td></tr>`).join('');
      if (ui.modal) openModal(head + `<h3>Elo</h3><p class="dim small">Rated by gauntlet duels against player ghosts. A run that dies before the gauntlet counts as a loss. Best = most duels won in one run.</p>
        ${eRows ? `<table class="tbl"><tr><th>#</th><th>Name</th><th>Elo</th><th>Best</th><th></th></tr>${eRows}</table>` : '<p class="dim">No rated players yet.</p>'}`);
    } catch (err) { if (ui.modal) openModal(head + `<p class="err">${esc(err.message)}</p>`); }
  }
  const HOWTO = `<div class="shead"><b>How to play</b><button data-act="close">✕</button></div>
    <ol class="small howto">
      <li>Pick 2 starting heroes. Each has a unique ability that fires when its blue mana bar is full.</li>
      <li>Every step offers 2 options: easy/medium/hard fights, or a shop/event. Fights 3 and 6 are bosses.</li>
      <li>Before each fight, place heroes in the 4 blue rows. Then the battle plays itself.</li>
      <li>Heroes earn XP for every second they stay alive. Level ups raise stats and let you pick a specialization. From Lv 3, each level adds an item slot. Lv 5 is rare.</li>
      <li>Win fights for gold. Spend it in hero, item and relic shops. Your team holds up to 3 heroes. Lose a single fight and the run ends (and costs Elo). Heroes always heal after a fight.</li>
      <li>After the second boss and a last shop, your team enters the Gauntlet as a ghost and duels the ghosts of other players' runs, climbing one step per win. Each duel is an Elo game. One loss ends it. Beat everyone who came before and you are crowned champion.</li>
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
    'new-run': () => { run = Run.newRun((Math.random() * 2 ** 31) | 0); ui.startPick = []; screen = 'run'; save(); render(); },
    'continue-run': () => { screen = 'run'; render(); },
    menu: () => { if (battle) return; screen = 'title'; closeModal(); render(); },
    howto: () => openModal(HOWTO),
    'start-pick': k => { const i = ui.startPick.indexOf(k); ui.focus = k; if (i >= 0) ui.startPick.splice(i, 1); else if (ui.startPick.length < 2) ui.startPick.push(k); render(); },
    'start-go': () => { if (ui.startPick.length !== 2) return; Run.pickStart(run, ui.startPick); save(); render(); },
    choose: i => { Run.choose(run, +i); ui.info = null; save(); render(); window.scrollTo(0, 0); },
    spec: i => { Run.chooseSpec(run, +i); save(); render(); },
    fight: () => startBattle(),
    speed: s => { ui.speed = +s; store.set('balance.speed', ui.speed); document.querySelectorAll('[data-act=speed]').forEach(b => b.classList.toggle('on', +b.dataset.arg === ui.speed)); },
    skip: () => skipBattle(),
    'result-ok': () => { ui.result = null; screen = 'run'; render(); window.scrollTo(0, 0); },
    'to-duel': () => { run.phase = 'deploy'; run.cur = { type: 'gauntlet' }; ui.info = null; save(); render(); window.scrollTo(0, 0); },
    'retry-elo': () => { if (ui.result && ui.result.gauntlet) { const w = ui.result.win; ui.result.pending = true; render(); Net.post('elo', { op: 'result', pid: pid(), name: myName(), teamId: run.g.teamId, win: w }).then(r => { setElo(r); Run.gauntletUpdate(run, r); Object.assign(ui.result, { delta: r.delta, elo: r.elo, pending: false, error: null }); save(); render(); }).catch(e => { Object.assign(ui.result, { pending: false, error: e.message }); render(); }); } },
    buy: i => { const err = Run.buy(run, +i); if (err) toast(err); save(); render(); },
    reroll: () => { if (!Run.reroll(run)) toast('Not enough gold'); save(); render(); },
    leave: () => { Run.leave(run); save(); render(); window.scrollTo(0, 0); },
    event: i => { Run.eventAct(run, +i); save(); render(); },
    team: () => { if (!run || battle) return; openModal(teamHTML()); },
    bag: i => { ui.selBag = ui.selBag === +i ? -1 : +i; openModal(teamHTML()); },
    equip: uid => { if (ui.selBag < 0) { toast('Select an item in the bag first'); return; } const err = Run.equip(run, ui.selBag, +uid); if (err) toast(err); else ui.selBag = -1; save(); openModal(teamHTML()); refreshBehind(); },
    unequip: a => { const [uid, i] = a.split(':').map(Number); Run.unequip(run, uid, i); save(); openModal(teamHTML()); refreshBehind(); },
    sell: () => { if (ui.selBag < 0) return; Run.sell(run, ui.selBag); ui.selBag = -1; save(); openModal(teamHTML()); header(); },
    close: () => { closeModal(); ui.selBag = -1; if (!battle) render(); },
    suggest: () => openSuggest(),
    'draft-del': i => { const d = drafts(); d.splice(+i, 1); store.set('balance.drafts', d); renderDrafts(); },
    'send-review': (a, el) => sendReview(el),
    'sug-refresh': () => loadQueue(),
    scores: () => openScores(),
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
        const r = await Net.post('elo', { op: 'enter', pid: pid(), name, team: Run.teamSnapshot(run), relics: run.relics });
        setElo(r); run.g.eloStart = r.elo; Run.gauntletUpdate(run, r); save(); render(); window.scrollTo(0, 0);
      }
    } catch (err) { toast(err.message); if (btn) btn.disabled = false; }
  });
  let rz = 0;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if ($('#board')) { const cv = $('#board'); view = Render.setup(cv, Math.min(cv.parentElement.clientWidth || 360, 560)); drawPreview(); } }, 150); });

  // ------------------------------------------------------------------ boot
  run = Run.migrate(run);
  screen = 'title';
  render();
  bootNotice();
  // test hook (headless Chrome tests drive the game through this)
  window.__bal = { get run() { return run; }, get battle() { return battle; }, ACT, render, skipBattle, poll, fmt, hexScreen: (c, r) => { const b = view.canvas.getBoundingClientRect(), p = Render.hexScreen(view, c, r); return { x: b.left + p.x, y: b.top + p.y }; } };
})();
