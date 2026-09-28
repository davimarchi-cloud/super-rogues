// All checks before publishing. Usage: node tools/tests/run-all.js [--quick]  (--quick skips the Chrome test)
const { spawnSync } = require('child_process'), path = require('path');
const R = p => path.join(__dirname, '..', '..', p);
const steps = [['motor', ['tools/tests/motor.js']], ['api', ['tools/tests/api.js']], ['bosses', ['tools/boss-matrix.js', '2']], ['bot runs', ['tools/sim-run.js', '30', '3', '9']]];
if (!process.argv.includes('--quick')) steps.push(['chrome', ['tools/tests/telas.mjs']]);
let bad = 0;
for (const [name, args] of steps) {
  const r = spawnSync(process.execPath, args.map((a, i) => i === 0 ? R(a) : a), { encoding: 'utf8', timeout: 400000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const tail = out.trim().split('\n').filter(l => /FAIL|CRASH|ok,|boss|runs|reached|NaN|never/.test(l)).slice(-6).join('\n  ');
  console.log(`${r.status === 0 ? 'OK  ' : 'FAIL'} ${name}\n  ${tail}`);
  if (r.status !== 0) bad++;
}
process.exit(bad ? 1 : 0);
