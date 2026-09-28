// Item and relic icons (review #8), drawn in code like the unit models and cached as data: URLs (the CSP allows
// images from data:). Each item/relic maps to a glyph drawer + accent colour; the frame colour is the item tier.
(function (G) {
  const B = G.B = G.B || {};
  const TAU = Math.PI * 2;
  const M = () => B.Models;
  const steel = '#c9d2dc', wood = '#8a5a32', gold = '#e8b84a', leather = '#8a5a3a', ink = 'rgba(12,10,16,0.9)';
  function path(c, pts, col) { M().poly(c, pts, col); }
  function line(c, x1, y1, x2, y2, w, col) { M().limb(c, x1, y1, x2, y2, w, col); }
  function orb(c, x, y, r, col) { M().ball(c, x, y, r, col); }
  function ring(c, x, y, r, w, col) { c.strokeStyle = ink; c.lineWidth = w + 2; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); }

  // every drawer paints inside a 100x100 box centred on 0,0; a = accent colour
  const D = {
    sword: (c, a) => { path(c, [[-6, 30], [6, 30], [6, -34], [0, -44], [-6, -34]], a || steel); line(c, -20, 30, 20, 30, 7, gold); line(c, 0, 32, 0, 44, 7, leather); orb(c, 0, 47, 5, gold); },
    greatsword: (c, a) => { path(c, [[-9, 26], [9, 26], [9, -38], [0, -48], [-9, -38]], a || steel); line(c, -24, 26, 24, 26, 8, gold); line(c, 0, 28, 0, 44, 8, leather); },
    dagger: (c, a) => { c.rotate(-0.6); path(c, [[-5, 10], [5, 10], [3, -30], [0, -38], [-3, -30]], a || steel); line(c, -14, 10, 14, 10, 6, gold); line(c, 0, 12, 0, 26, 6, leather); },
    needle: (c, a) => { c.rotate(-0.6); path(c, [[-3, 16], [3, 16], [1, -40], [-1, -40]], a || steel); line(c, 0, 16, 0, 32, 5, '#444'); orb(c, 0, 34, 4, a || '#7f7'); },
    axe: (c, a) => { line(c, 8, 44, -4, -38, 7, wood); path(c, [[-6, -34], [-34, -44], [-40, -14], [-30, 4], [-4, -8]], a || steel); },
    scythe: (c, a) => { line(c, 18, 44, -8, -38, 6, '#4a3a2a'); c.fillStyle = a || steel; c.beginPath(); c.moveTo(-8, -38); c.quadraticCurveTo(-48, -40, -46, 4); c.quadraticCurveTo(-34, -22, -4, -26); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.3; c.stroke(); },
    spear: (c, a) => { c.rotate(-0.7); line(c, 0, 44, 0, -20, 6, wood); path(c, [[-8, -18], [8, -18], [0, -46]], a || steel); line(c, -6, -14, 6, -14, 4, '#c43a3a'); },
    hammer: (c, a) => { c.rotate(-0.5); line(c, 0, 44, 0, -14, 7, wood); path(c, [[-26, -36], [26, -36], [26, -12], [-26, -12]], a || steel); },
    bow: (c, a) => { c.strokeStyle = ink; c.lineWidth = 9; c.beginPath(); c.arc(-16, 0, 42, -1.1, 1.1); c.stroke(); c.strokeStyle = a || wood; c.lineWidth = 6; c.stroke(); line(c, -16 + Math.cos(1.1) * 42, -Math.sin(1.1) * 42, -16 + Math.cos(1.1) * 42, Math.sin(1.1) * 42, 1.5, '#eee'); line(c, -30, 0, 26, 0, 3, '#e8e2d0'); path(c, [[26, -5], [38, 0], [26, 5]], steel); },
    crossbow: (c, a) => { line(c, -34, 6, 34, 6, 7, wood); c.strokeStyle = ink; c.lineWidth = 8; c.beginPath(); c.arc(0, 30, 40, -2.4, -0.74); c.stroke(); c.strokeStyle = a || '#6a6f7a'; c.lineWidth = 5; c.stroke(); line(c, -30, 2, 30, 2, 2, '#e8e2d0'); },
    gun: (c, a) => { path(c, [[-34, -12], [30, -12], [30, 2], [-34, 2]], a || '#6a6f7a'); path(c, [[-30, 2], [-14, 2], [-20, 34], [-36, 30]], wood); orb(c, 30, -5, 4, '#222'); },
    shield: (c, a) => { path(c, [[-32, -38], [32, -38], [32, 0], [0, 42], [-32, 0]], a || '#4d6fb8'); path(c, [[-20, -26], [20, -26], [20, -2], [0, 26], [-20, -2]], M().shade(a || '#4d6fb8', 0.25)); orb(c, 0, -8, 7, gold); },
    armor: (c, a) => { path(c, [[-34, -30], [-14, -38], [0, -30], [14, -38], [34, -30], [30, -4], [24, 38], [-24, 38], [-30, -4]], a || steel); line(c, -20, 14, 20, 14, 4, gold); line(c, 0, -26, 0, 30, 2, ink); },
    helm: (c, a) => { c.fillStyle = a || steel; c.beginPath(); c.arc(0, 4, 34, Math.PI, 0); c.lineTo(34, 30); c.lineTo(-34, 30); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); line(c, -24, 8, 24, 8, 6, '#111'); line(c, 0, -30, 0, 30, 3, M().shade(a || steel, 0.3)); },
    hat: (c, a) => { path(c, [[-42, 26], [42, 26], [22, 14], [-6, -44], [-22, 14]], a || '#3a2160'); line(c, -22, 16, 22, 16, 6, gold); orb(c, -6, -44, 5, gold); },
    crown: (c, a) => { path(c, [[-36, 26], [36, 26], [36, -20], [18, 2], [0, -30], [-18, 2], [-36, -20]], a || gold); orb(c, 0, 12, 6, '#c43a3a'); orb(c, -22, 14, 4, '#3a8ac4'); orb(c, 22, 14, 4, '#3ac48a'); },
    mask: (c, a) => { c.fillStyle = a || '#f5f0ea'; c.beginPath(); c.ellipse(0, 0, 30, 38, 0, 0, TAU); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); orb(c, -12, -8, 6, '#111'); orb(c, 12, -8, 6, '#111'); c.strokeStyle = '#c2447f'; c.lineWidth = 3; c.beginPath(); c.arc(0, 12, 12, 0.2, Math.PI - 0.2); c.stroke(); },
    boots: (c, a) => { path(c, [[-24, -36], [0, -36], [2, 18], [34, 22], [34, 38], [-26, 38]], a || leather); line(c, -24, -26, 0, -26, 4, M().shade(a || leather, 0.3)); },
    glove: (c, a) => { path(c, [[-22, 40], [22, 40], [26, -2], [30, -30], [18, -32], [14, -8], [8, -40], [-4, -40], [-6, -8], [-14, -36], [-26, -30], [-24, 0]], a || leather); },
    fist: (c, a) => { path(c, [[-28, -20], [28, -20], [30, 20], [14, 36], [-20, 36], [-30, 16]], a || '#d9a07a'); for (let i = 0; i < 4; i++) line(c, -20 + i * 13, -24, -20 + i * 13, -8, 9, a || '#d9a07a'); line(c, -24, -30, 24, -30, 5, '#9aa0a8'); },
    ring: (c, a) => { ring(c, 0, 8, 26, 8, gold); path(c, [[-12, -18], [12, -18], [16, -30], [0, -42], [-16, -30]], a || '#c43a3a'); },
    amulet: (c, a) => { c.strokeStyle = gold; c.lineWidth = 3; c.beginPath(); c.arc(0, -22, 26, 0.2, Math.PI - 0.2, true); c.stroke(); orb(c, 0, 14, 18, a || '#3a8ac4'); ring(c, 0, 14, 18, 3, gold); },
    gem: (c, a) => { path(c, [[-28, -12], [-14, -32], [14, -32], [28, -12], [0, 38]], a || '#3a8ac4'); line(c, -28, -12, 28, -12, 1.5, 'rgba(255,255,255,0.5)'); line(c, -14, -32, 0, 38, 1, 'rgba(255,255,255,0.3)'); },
    vial: (c, a) => { orb(c, 0, 14, 24, a || '#5fd47a'); path(c, [[-8, -12], [8, -12], [8, -34], [-8, -34]], '#d9e6f2'); path(c, [[-11, -44], [11, -44], [11, -34], [-11, -34]], wood); },
    drop: (c, a) => { c.fillStyle = a || '#5fa8ff'; c.beginPath(); c.moveTo(0, -42); c.quadraticCurveTo(30, 0, 26, 16); c.arc(0, 16, 26, 0, Math.PI); c.quadraticCurveTo(-30, 0, 0, -42); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); orb(c, -9, 12, 6, 'rgba(255,255,255,0.6)'); },
    rod: (c, a) => { c.rotate(0.6); line(c, 0, 44, 0, -24, 7, '#6a4a3a'); orb(c, 0, -32, 12, a || '#c77dff'); },
    staff: (c, a) => { c.rotate(0.4); line(c, 0, 46, 0, -26, 6, wood); c.strokeStyle = gold; c.lineWidth = 4; c.beginPath(); c.arc(0, -34, 14, 0, TAU); c.stroke(); orb(c, 0, -34, 9, a || '#fff3a0'); },
    book: (c, a) => { path(c, [[-32, -36], [30, -36], [30, 38], [-32, 38]], a || '#5a1f24'); path(c, [[30, -32], [36, -30], [36, 40], [30, 38]], '#e8e2d0'); line(c, -24, -36, -24, 38, 4, gold); orb(c, 2, 0, 9, gold); },
    scroll: (c, a) => { path(c, [[-30, -30], [30, -30], [30, 30], [-30, 30]], a || '#e8d9b0'); line(c, -34, -32, 34, -32, 9, '#c9b080'); line(c, -34, 32, 34, 32, 9, '#c9b080'); for (let i = 0; i < 3; i++) line(c, -18, -12 + i * 12, 18, -12 + i * 12, 2, '#6a5a3a'); },
    cloak: (c, a) => { path(c, [[-14, -40], [14, -40], [38, 40], [0, 30], [-38, 40]], a || '#3d2555'); orb(c, 0, -36, 7, gold); },
    belt: (c, a) => { path(c, [[-44, -10], [44, -10], [44, 12], [-44, 12]], a || leather); c.strokeStyle = gold; c.lineWidth = 5; c.strokeRect(-12, -16, 24, 34); },
    fang: (c, a) => { path(c, [[-24, -40], [24, -40], [8, 12], [0, 44], [-8, 12]], a || '#f2ead0'); c.fillStyle = 'rgba(196,58,58,0.8)'; c.beginPath(); c.arc(0, 36, 4, 0, TAU); c.fill(); },
    coin: (c, a) => { orb(c, 0, 0, 34, a || gold); ring(c, 0, 0, 24, 3, M().shade(a || gold, -0.3)); c.fillStyle = M().shade(a || gold, -0.4); c.font = 'bold 30px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('B', 0, 2); },
    purse: (c, a) => { path(c, [[-30, -8], [30, -8], [36, 28], [22, 40], [-22, 40], [-36, 28]], a || leather); line(c, -16, -12, 16, -12, 6, gold); orb(c, 0, -24, 8, gold); },
    lens: (c, a) => { ring(c, -6, -6, 26, 7, gold); c.fillStyle = 'rgba(160,220,255,0.35)'; c.beginPath(); c.arc(-6, -6, 24, 0, TAU); c.fill(); line(c, 14, 14, 40, 40, 9, wood); },
    banner: (c, a) => { line(c, -26, -44, -26, 44, 6, wood); path(c, [[-24, -38], [32, -38], [32, 20], [4, 10], [-24, 20]], a || '#c43a3a'); orb(c, 4, -14, 8, gold); },
    totem: (c, a) => { path(c, [[-18, -40], [18, -40], [18, 40], [-18, 40]], a || wood); orb(c, -7, -24, 5, '#ffcf5a'); orb(c, 7, -24, 5, '#ffcf5a'); line(c, -10, -6, 10, -6, 4, '#222'); line(c, -18, 16, 18, 16, 5, '#c43a3a'); },
    hourglass: (c, a) => { line(c, -26, -40, 26, -40, 7, wood); line(c, -26, 40, 26, 40, 7, wood); path(c, [[-20, -36], [20, -36], [3, 0], [20, 36], [-20, 36], [-3, 0]], 'rgba(200,230,255,0.5)'); path(c, [[-12, 28], [12, 28], [0, 12]], a || gold); path(c, [[-12, -24], [12, -24], [0, -6]], a || gold); },
    heart: (c, a) => { c.fillStyle = a || '#c43a3a'; c.beginPath(); c.moveTo(0, 38); c.bezierCurveTo(-48, 4, -30, -40, 0, -18); c.bezierCurveTo(30, -40, 48, 4, 0, 38); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); orb(c, -16, -14, 6, 'rgba(255,255,255,0.5)'); },
    candle: (c, a) => { path(c, [[-12, -14], [12, -14], [12, 40], [-12, 40]], a || '#f2ead0'); c.fillStyle = '#ffcf5a'; c.beginPath(); c.ellipse(0, -28, 7, 13, 0, 0, TAU); c.fill(); c.fillStyle = '#fff6c0'; c.beginPath(); c.ellipse(0, -24, 3, 6, 0, 0, TAU); c.fill(); },
    feather: (c, a) => { c.rotate(0.5); c.fillStyle = a || '#ff7a3d'; c.beginPath(); c.moveTo(0, 44); c.quadraticCurveTo(-30, 0, 0, -44); c.quadraticCurveTo(30, 0, 0, 44); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); line(c, 0, 44, 0, -40, 2, M().shade(a || '#ff7a3d', -0.4)); },
    wing: (c, a) => { c.fillStyle = a || '#fffaf0'; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(-4 + i * 6, -10 + i * 12, 34 - i * 5, 10, -0.5, 0, TAU); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.2; c.stroke(); } },
    leaf: (c, a) => { c.fillStyle = a || '#5fa84a'; c.beginPath(); c.moveTo(-30, 34); c.quadraticCurveTo(-34, -34, 34, -38); c.quadraticCurveTo(30, 30, -30, 34); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); line(c, -30, 34, 20, -24, 2, M().shade(a || '#5fa84a', -0.4)); },
    bone: (c, a) => { line(c, -26, 26, 26, -26, 11, a || '#e8e2d0'); for (const [x, y] of [[-30, 22], [-22, 30], [30, -22], [22, -30]]) orb(c, x, y, 8, a || '#e8e2d0'); },
    horn: (c, a) => { c.fillStyle = a || '#e8dcc0'; c.beginPath(); c.moveTo(-38, -10); c.quadraticCurveTo(0, 40, 38, -30); c.lineTo(40, -6); c.quadraticCurveTo(0, 50, -38, 10); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); line(c, 30, -24, 40, -12, 5, gold); },
    skull: (c, a) => { orb(c, 0, -6, 30, a || '#e8e2d0'); path(c, [[-16, 16], [16, 16], [14, 36], [-14, 36]], a || '#e8e2d0'); orb(c, -11, -6, 8, '#111'); orb(c, 11, -6, 8, '#111'); path(c, [[-3, 10], [3, 10], [0, 4]], '#111'); },
    bolt: (c, a) => { path(c, [[6, -44], [-22, 6], [-2, 6], [-10, 44], [22, -10], [2, -10]], a || '#ffe066'); },
    stone: (c, a) => { path(c, [[-34, 10], [-20, -26], [16, -32], [36, -4], [24, 30], [-14, 34]], a || '#8a8f9a'); line(c, -10, -10, 10, 6, 2, 'rgba(0,0,0,0.4)'); },
    drum: (c, a) => { c.fillStyle = a || '#a0522d'; c.fillRect(-32, -18, 64, 44); c.strokeStyle = ink; c.lineWidth = 1.5; c.strokeRect(-32, -18, 64, 44); c.fillStyle = '#e8dcc0'; c.beginPath(); c.ellipse(0, -18, 32, 10, 0, 0, TAU); c.fill(); c.stroke(); for (let i = 0; i < 4; i++) line(c, -28 + i * 18, -8, -20 + i * 18, 22, 2, gold); line(c, 14, -40, 30, -22, 4, wood); },
    lantern: (c, a) => { path(c, [[-20, -24], [20, -24], [16, 30], [-16, 30]], '#3a3a44'); c.fillStyle = a || '#ffcf5a'; c.fillRect(-12, -18, 24, 42); line(c, -20, -30, 20, -30, 5, '#555'); c.strokeStyle = '#555'; c.lineWidth = 3; c.beginPath(); c.arc(0, -36, 10, Math.PI, 0); c.stroke(); },
    dice: (c, a) => { path(c, [[-30, -30], [30, -30], [30, 30], [-30, 30]], a || '#f2ead0'); for (const [x, y] of [[-14, -14], [14, 14], [0, 0], [14, -14], [-14, 14]]) orb(c, x, y, 4, '#222'); },
    seal: (c, a) => { orb(c, 0, 0, 34, a || '#a02a2a'); ring(c, 0, 0, 22, 2, M().shade(a || '#a02a2a', -0.4)); c.fillStyle = M().shade(a || '#a02a2a', -0.45); c.font = 'bold 26px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('M', 0, 2); },
    eye: (c, a) => { c.fillStyle = '#f2ead0'; c.beginPath(); c.moveTo(-40, 0); c.quadraticCurveTo(0, -36, 40, 0); c.quadraticCurveTo(0, 36, -40, 0); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); orb(c, 0, 0, 14, a || '#c77dff'); orb(c, 0, 0, 6, '#111'); },
    clover: (c, a) => { for (const [x, y] of [[0, -16], [16, 0], [0, 16], [-16, 0]]) orb(c, x, y, 15, a || '#5fa84a'); line(c, 4, 18, 18, 42, 4, '#3a6a2a'); },
    backpack: (c, a) => { path(c, [[-28, -26], [28, -26], [30, 40], [-30, 40]], a || leather); path(c, [[-18, 4], [18, 4], [18, 26], [-18, 26]], M().shade(a || leather, -0.2)); c.strokeStyle = leather; c.lineWidth = 5; c.beginPath(); c.arc(0, -26, 14, Math.PI, 0); c.stroke(); },
    crest: (c, a) => { D.shield(c, a || '#6a1a2a'); path(c, [[0, -30], [6, -14], [22, -14], [9, -4], [14, 12], [0, 2], [-14, 12], [-9, -4], [-22, -14], [-6, -14]], gold); },
    snowflake: (c, a) => { for (let i = 0; i < 3; i++) { const t = i * Math.PI / 3; line(c, Math.cos(t) * 40, Math.sin(t) * 40, -Math.cos(t) * 40, -Math.sin(t) * 40, 6, a || '#bff4ff'); } orb(c, 0, 0, 8, a || '#bff4ff'); },
    flame: (c, a) => { c.fillStyle = a || '#ff7a3d'; c.beginPath(); c.moveTo(0, 42); c.bezierCurveTo(-40, 30, -26, -10, 0, -44); c.bezierCurveTo(4, -16, 34, -10, 26, 22); c.quadraticCurveTo(20, 40, 0, 42); c.fill(); c.strokeStyle = ink; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#ffe066'; c.beginPath(); c.moveTo(0, 38); c.bezierCurveTo(-18, 26, -10, 4, 0, -12); c.bezierCurveTo(10, 8, 16, 22, 0, 38); c.fill(); },
    target: (c, a) => { orb(c, 0, 0, 36, '#f2ead0'); orb(c, 0, 0, 25, a || '#c43a3a'); orb(c, 0, 0, 14, '#f2ead0'); orb(c, 0, 0, 6, a || '#c43a3a'); },
    idol: (c, a) => { path(c, [[-22, 40], [22, 40], [16, 20], [-16, 20]], a || gold); path(c, [[-14, 20], [14, 20], [18, -6], [-18, -6]], a || gold); orb(c, 0, -20, 15, a || gold); orb(c, -5, -22, 3, '#c43a3a'); orb(c, 5, -22, 3, '#c43a3a'); },
    wind: (c, a) => { c.strokeStyle = a || '#bfe6ff'; c.lineWidth = 6; c.lineCap = 'round'; for (const [y, w] of [[-18, 34], [2, 42], [22, 28]]) { c.beginPath(); c.moveTo(-40, y); c.lineTo(w - 12, y); c.arc(w - 12, y - 8, 8, Math.PI / 2, -Math.PI, true); c.stroke(); } },
  };
  const IT = {
    longsword: ['sword'], chainmail: ['armor'], belt: ['belt'], recurve: ['bow'], rod: ['rod'], cloak: ['cloak', '#4a5a6a'], tear: ['drop'], boots: ['boots'], gloves: ['glove'], fang: ['fang'],
    buckler: ['shield', '#8a6a3a'], cap: ['helm', leather], whetstone: ['stone'], coin: ['coin'], charm: ['amulet', '#c77dff'], amber: ['ring', '#e8a040'], dagger: ['dagger'], moss: ['leaf'], sling: ['stone', '#a09080'], focus: ['gem', '#5fa8ff'],
    bloodthirster: ['sword', '#e05555'], thornmail: ['armor', '#6a8a4a'], warmog: ['heart'], crossbow: ['crossbow'], deathcap: ['hat'], visage: ['mask', '#bfe6ff'], bluecrystal: ['gem'], infinity: ['sword', '#ffe066'], guardplate: ['shield'],
    frozenhammer: ['hammer', '#bff4ff'], emberblade: ['sword', '#ff7a3d'], venomvial: ['vial'], quicksilver: ['amulet', '#dfe6ee'], phantomdancer: ['dagger', '#c77dff'], giantslayer: ['greatsword'], executioner: ['axe'],
    shojin: ['spear'], gunblade: ['gun'], sunfire: ['cloak', '#e0602a'], scope: ['lens'], banner: ['banner'], totem: ['totem'], needle: ['needle'], tabi: ['boots', '#9aa0a8'],
    guardian: ['wing'], titan: ['fist'], rabadon: ['hat', '#1f2f55'], crown: ['crown'], stormbringer: ['bolt'], morello: ['book'], redemption: ['heart', '#ffe066'], zeke: ['banner', '#e8b84a'], botrk: ['sword', '#5fd47a'],
    stoneplate: ['shield', '#8a8f9a'], striders: ['boots', '#bfe6ff'], archangel: ['staff'], lastwhisper: ['dagger', '#9aa0a8'], dragonclaw: ['fang', '#8ac43a'],
    knuckles: ['fist', '#9aa0a8'], warpaint: ['drop', '#c43a3a'], bandana: ['cloak', '#c43a3a'], oakshield: ['shield', '#8a5a32'], candle: ['candle'], jerky: ['bone'], whistle: ['horn'], berserkeraxe: ['axe', '#e05555'],
    stoneheart: ['heart', '#8a8f9a'], soulbinder: ['skull', '#bff4ff'], frenzyblade: ['sword', '#ff9d3d'], manaweave: ['cloak', '#3a5ac4'], lightningrod: ['bolt', '#bfe6ff'], lifeline: ['amulet', '#5fd47a'],
    crackedlens: ['lens'], colossus: ['heart', '#e05555'], eclipsecrown: ['crown', '#5a4a8a'], reaper: ['scythe'], mirrorshield: ['shield', '#dfe6ee'], hourglass: ['hourglass'],
    // itemization v16
    g_leather: ['glove', '#8a5a3a'], g_gauntlets: ['glove', '#c9d2dc'], g_silk: ['glove', '#c77dff'], g_assassin: ['glove', '#8a1f24'], g_venom: ['glove', '#5fd47a'],
    b_padded: ['boots', '#8a5a3a'], b_treads: ['boots', '#dfe6ee'], b_greaves: ['boots', '#e05555'], b_shadow: ['boots', '#3a3a5a'],
    h_iron: ['helm'], h_circlet: ['crown', '#bfe6ff'], a_jerkin: ['armor', '#8a5a3a'], a_plate: ['armor', '#dfe6ee'],
    obsidianblade: ['greatsword', '#4a3a5e'], aegis: ['shield', '#ffd27a'], magicrown: ['crown', '#5fa8ff'], dragonscale: ['armor', '#3a8a5a'],
    furygauntlets: ['glove', '#ff7a3d'], windwalkers: ['boots', '#8af4ff'], mountainheart: ['heart', '#9aa0a8'],
    worldsplitter: ['greatsword', '#ff4d5e'], eternitytome: ['book', '#c77dff'], voidmask: ['mask', '#5a3a8a'], obsidianplate: ['armor', '#2a2030'],
    ruinhands: ['fist', '#ff4d5e'], phantomboots: ['boots', '#c77dff'], phoenixheart: ['feather', '#ff7a3d'],
    obs_blade: ['sword', '#4a3a5e'], obs_helm: ['helm', '#4a3a5e'], obs_plate: ['armor', '#4a3a5e'],
    storm_gloves: ['glove', '#bfe6ff'], storm_boots: ['boots', '#5fa8ff'], storm_sigil: ['bolt', '#bfe6ff'],
    arc_hood: ['hat', '#3a5ac4'], arc_orb: ['gem', '#8ab4ff'], arc_robe: ['cloak', '#3a5ac4'],
    bm_cleaver: ['axe', '#8a1f24'], bm_grips: ['glove', '#8a1f24'], bm_pendant: ['amulet', '#c43a3a'],
    rg_hood: ['cloak', '#4a6a3a'], rg_quiver: ['bow', '#4a6a3a'], rg_boots: ['boots', '#4a6a3a'],
  };
  // the empty slot of each item type shows this glyph, faded
  const SLOT = { weapon: 'sword', offhand: 'shield', helmet: 'helm', armor: 'armor', gloves: 'glove', boots: 'boots', trinket: 'ring' };
  const RE = {
    idol: ['idol'], drum: ['drum'], standard: ['banner', '#6a6f7a'], lens: ['lantern'], feather: ['feather'], seal: ['seal'], dice: ['dice'], font: ['drop', '#5fa8ff'], bloodstone: ['gem', '#c43a3a'], tooth: ['fang'],
    wits: ['eye'], clover: ['clover'], backpack: ['backpack'], crest: ['crest'], vengeance: ['skull', '#e05555'], frostsigil: ['snowflake'], thunder: ['bolt'], spring: ['drop', '#5fd47a'], firststrike: ['shield', '#e8b84a'],
    purse: ['purse'], tome: ['book', '#1f2f55'], wind: ['wind'], mark: ['target'], ember: ['flame'], warhorn: ['horn'], ironwill: ['fist', '#9aa0a8'], seed: ['leaf', '#8ac43a'], bounty: ['scroll'], bloodpact: ['drop', '#8a1f24'],
    lastbreath: ['skull'], whetset: ['stone', '#9aa0a8'], battery: ['gem', '#c77dff'], treasure: ['scroll', '#e8c890'], rally: ['banner', '#3a5ac4'],
  };
  const tierColor = t => t === 'relic' ? '#e8b84a' : B.RARITY && B.RARITY[t] ? B.RARITY[t].color : '#9aa3b5';
  const cache = {};
  // kind 'item' | 'relic' | 'slot' (an empty equipment slot: id = item type)
  function icon(kind, id, px) {
    const key = kind + ':' + id + ':' + px; if (cache[key]) return cache[key];
    if (typeof document === 'undefined') return '';
    const slot = kind === 'slot';
    const spec = slot ? [SLOT[id] || 'gem', '#8a90a0'] : (kind === 'item' ? IT : RE)[id] || ['gem'], tier = kind === 'item' ? (B.ITEM[id] || {}).tier || 'common' : 'relic';
    const cv = document.createElement('canvas'), dpr = 3; cv.width = cv.height = px * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr);
    // frame: dark bevelled plate + rarity-coloured rim; rarer items get a tinted plate and a glow (mythic a double rim)
    const f = slot ? '#3a4050' : tierColor(tier), r = px * 0.18, hi = !slot && (tier === 'legendary' || tier === 'mythic' || tier === 'set');
    const rr = (x, y, w, h, q) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, q) : c.rect(x, y, w, h); };
    const g = c.createRadialGradient(px * 0.45, px * 0.35, px * 0.05, px / 2, px / 2, px * 0.75);
    g.addColorStop(0, slot ? '#1c2029' : hi ? M().shade(f, -0.55) : '#2c3242'); g.addColorStop(1, slot ? '#0c0e13' : '#0e1016');
    c.fillStyle = g; rr(1, 1, px - 2, px - 2, r); c.fill();
    if (slot) { c.setLineDash([3, 3]); c.strokeStyle = f; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]); }
    else {
      if (hi) { c.save(); c.shadowColor = f; c.shadowBlur = px * 0.2; c.strokeStyle = f; c.lineWidth = 2; c.stroke(); c.restore(); }
      c.strokeStyle = f; c.lineWidth = 2; c.stroke();
      if (tier === 'mythic') { c.strokeStyle = '#ffd27a'; c.lineWidth = 1; rr(4, 4, px - 8, px - 8, r * 0.7); c.stroke(); }
    }
    c.save(); c.translate(px / 2, px / 2); c.scale(px / 120, px / 120); if (slot) c.globalAlpha = 0.28; (D[spec[0]] || D.gem)(c, spec[1]); c.restore();
    return (cache[key] = cv.toDataURL());
  }
  B.Icons = { item: (id, px = 40) => icon('item', id, px), relic: (id, px = 40) => icon('relic', id, px), slot: (type, px = 40) => icon('slot', type, px), drawers: D, IT, RE, SLOT };
})(typeof window !== 'undefined' ? window : globalThis);
