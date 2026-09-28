// Hex grid 8x8, pointy-top, "odd-r" offset (odd rows shifted right). Row 0 is the TOP (enemy side).
// Works in the browser (window.B) and in Node (require sets globalThis.B).
(function (G) {
  const B = G.B = G.B || {};
  const COLS = 8, ROWS = 8;
  const DIRS = [[1, 0, -1], [1, -1, 0], [0, -1, 1], [-1, 0, 1], [-1, 1, 0], [0, 1, -1]];

  function toCube(c, r) { const x = c - (r - (r & 1)) / 2, z = r; return [x, -x - z, z]; }
  function fromCube(x, y, z) { return [x + (z - (z & 1)) / 2, z]; }
  function dist(a, b) {
    const [ax, ay, az] = toCube(a.c, a.r), [bx, by, bz] = toCube(b.c, b.r);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
  }
  function inside(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
  function neighbors(c, r) {
    const [x, y, z] = toCube(c, r), out = [];
    for (const d of DIRS) { const [nc, nr] = fromCube(x + d[0], y + d[1], z + d[2]); if (inside(nc, nr)) out.push({ c: nc, r: nr }); }
    return out;
  }
  function key(c, r) { return c + r * COLS; }
  function all() { const o = []; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) o.push({ c, r }); return o; }
  function within(c, r, rad) { return all().filter(h => dist(h, { c, r }) <= rad); }
  // pixel centre of a hex for a given hex "size" (centre to corner)
  function px(c, r, size) { const w = Math.sqrt(3) * size; return { x: w * (c + 0.5 * (r & 1)) + w / 2, y: size * 1.5 * r + size }; }
  function boardSize(size) { const w = Math.sqrt(3) * size; return { w: w * (COLS + 0.5), h: size * 1.5 * (ROWS - 1) + size * 2 }; }

  B.Hex = { COLS, ROWS, dist, inside, neighbors, key, all, within, px, boardSize };
  if (typeof module !== 'undefined') module.exports = B.Hex;
})(typeof window !== 'undefined' ? window : globalThis);
