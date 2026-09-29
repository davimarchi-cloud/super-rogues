// v27 (owner + review #25 by David): the Crown Shop, player profiles, name change and the content Elo tabs (now an
// unlock). POST only, and it never creates a player (accounts start in api/elo.js when a first run ends).
//   {op:'me', pid}                 your wallet, perks, league, season and referral numbers
//   {op:'profile', pid?, code}     anyone's public profile; King Tier viewers also get most played / best win rate
//                                  heroes and the record of that player's ghosts
//   {op:'buy', pid, item}          a Crown Shop unlock (B.SHOP), paid atomically
//   {op:'rename', pid, name}       a name change (paid each time); the player's ghosts take the new name
//   {op:'ratings', pid}            the Elo of every hero, boss, item and relic (needs Content Elo or the King Tier)
const { send, body, sameOrigin, clean } = require('./_http');
const getStore = require('./_store');
const P = require('./_player');
const D = globalThis.B;

module.exports = async (req, res) => {
  const st = getStore();
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'Bad origin' });
    const b = await body(req);
    const pid = String(b.pid || '');
    const p = /^[a-f0-9]{32}$/.test(pid) ? await st.getPlayer(pid) : null;
    if (p) await P.sync(st, p);

    if (b.op === 'me') {
      if (!p) return send(res, 200, { account: false, crowns: 0, perks: [], league: 0, lp: 0, season: D.seasonOf(Date.now()), seasonEnds: D.seasonEnds(D.seasonOf(Date.now())) });
      return send(res, 200, await P.ownView(st, p));
    }
    if (b.op === 'profile') {
      const code = clean(b.code, 16).toLowerCase();
      const t = /^[a-f0-9]{12}$/.test(code) ? await st.getPlayerByCode(code) : null;
      if (!t) return send(res, 404, { error: 'No player with that id' });
      const v = P.profileView(t), king = P.isKing(p);
      v.own = !!p && p.pid === t.pid;
      if (king) v.more = await P.kingExtras(st, t.pid);
      return send(res, 200, { profile: v, viewerKing: king });
    }
    if (!p) return send(res, 404, { error: 'Your account starts when your first run ends. Play one first!' });

    if (b.op === 'buy') {
      const it = D.SHOP_ITEM[String(b.item || '')];
      if (!it || it.use) return send(res, 400, { error: 'Unknown item' });
      const perks = P.perksOf(p);
      if (perks.includes(it.id) || D.hasPerk(perks, it.id)) return send(res, 409, { error: 'You already have ' + it.name });
      const left = await st.spend(pid, it.price, p.perks || '[]', JSON.stringify(perks.concat(it.id)));
      if (left == null) return send(res, 400, { error: `Not enough crowns: ${it.name} costs ${it.price} 👑` });
      Object.assign(p, { gems: left, perks: JSON.stringify(perks.concat(it.id)) });
      return send(res, 200, Object.assign(await P.ownView(st, p), { bought: it.id }));
    }
    if (b.op === 'rename') {
      const name = clean(b.name, 16).replace(/\s+/g, ' ');
      if (name.length < 2) return send(res, 400, { error: 'Pick a name of 2 to 16 characters' });
      if (name === p.name) return send(res, 400, { error: 'That is already your name' });
      const price = D.SHOP_ITEM.rename.price;
      const left = await st.spend(pid, price, p.perks || '[]', p.perks || '[]', name);
      if (left == null) return send(res, 400, { error: `Not enough crowns: a name change costs ${price} 👑` });
      await st.renameTeams(pid, name);
      Object.assign(p, { gems: left, name });
      return send(res, 200, Object.assign(await P.ownView(st, p), { renamed: name }));
    }
    if (b.op === 'ratings') {
      if (!D.hasPerk(P.perksOf(p), 'elo')) return send(res, 403, { error: 'Unlock Content Elo in the Crown Shop' });
      return send(res, 200, { ratings: await st.listRatings() });
    }
    return send(res, 400, { error: 'Unknown op' });
  } catch (e) {
    console.error('player', e);
    return send(res, 500, { error: 'Server error' });
  }
};
