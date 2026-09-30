// Ability audit (review #49): for every hero, each ab value is read by its ability code (or a helper) and shows in its text; every spec's ab keys, mods and flags are read somewhere. Usage: node tools/audit-abilities.js
const root = require('path').join(__dirname, '..');
for (const f of ['hex', 'data', 'sim', 'run']) require(root + '/js/' + f + '.js');
const fs = require('fs'), sim = fs.readFileSync(root + '/js/sim.js', 'utf8'), run = fs.readFileSync(root + '/js/run.js', 'utf8');
const A = B.Sim.abilities;
const src = k => (A[k] ? A[k].toString() : '');
const nums = t => (String(t).match(/\d+(\.\d+)?/g) || []).map(Number);
const reAb = k => new RegExp('ab\\.' + k + '\\b');
const reM = k => new RegExp('(\\bm|mods|M|mod)\\.' + k + '\\b|[\'"]' + k + '[\'"]');
const out = [];
for (const [key, h] of Object.entries(B.HEROES)) {
  const code = src(h.abil), txt = h.abDesc, tn = nums(txt), issues = [];
  if (!A[h.abil]) issues.push('NO ABILITY FUNCTION ' + h.abil);
  for (const [k, v] of Object.entries(h.ab || {})) {
    if (typeof v !== 'number' || v === 0) continue;
    if (!reAb(k).test(code)) issues.push(`ab.${k}=${v} not read in ${h.abil}()` + (reAb(k).test(sim) ? ' (read elsewhere)' : ' (NEVER read)'));
    const shown = tn.some(n => Math.abs(n - v) < 1e-6 || Math.abs(n - v * 100) < 0.5);
    if (!shown) issues.push(`ab.${k}=${v} not in text`);
  }
  for (const pair of h.specs) for (const sp of pair) {
    for (const k of Object.keys(sp.ab || {})) if (!reAb(k).test(code)) issues.push(`spec ${sp.name}: ab.${k} not read in ${h.abil}()` + (reAb(k).test(sim) ? ' (read elsewhere)' : ' (NEVER read)'));
    for (const k of Object.keys(sp.mods || {})) if (!reM(k).test(sim + run)) issues.push(`spec ${sp.name}: mod ${k} NEVER read`);
    for (const f of (sp.fl || [])) if (!sim.includes(`'${f}'`)) issues.push(`spec ${sp.name}: flag ${f} NEVER read`);
  }
  for (const k of Object.keys(h.mods || {})) if (!reM(k).test(sim + run)) issues.push(`base mod ${k} NEVER read`);
  if (issues.length) out.push(`${key} (${h.name}, ${h.abil}): ${issues.join(' | ')}`);
}
console.log(out.join('\n') || 'all clean');
