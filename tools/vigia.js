// Watcher that wakes Claude only when there is work. It runs in the background of the Claude Code session
// (Bash run_in_background) and EXITS, printing one line, as soon as a player presses "Send for review" (a new batch
// in the queue). Zero tokens while idle. Heartbeat (kv 'seen') every check, so players see "Reviewer online".
// `node tools/sugestoes.js pausa` makes it ignore the queue (spam, owner away); `retoma` turns it back on.
// Usage: node tools/vigia.js
const fs = require('fs'), path = require('path');
const { q, SCHEMA } = require('./_env');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EVERY = 20e3;
// network hiccups must never kill the watcher silently (seen 2026-09-28: exit 1 with no output) -> log and go on
const LOG = path.join(__dirname, 'vigia.log');
const log = m => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch (_) {} };
process.on('unhandledRejection', e => log('unhandledRejection ' + (e && e.stack || e)));
process.on('uncaughtException', e => log('uncaughtException ' + (e && e.stack || e)));
(async () => {
  for (let i = 0; ; i++) { try { for (const s of SCHEMA) await q(s); break; } catch (e) { log('schema ' + e.message); if (i >= 20) { console.log('ERRO vigia: banco inacessível'); process.exit(1); } await sleep(15e3); } }
  let errors = 0;
  for (;;) {
    try {
      await q("insert into kv (k, v) values ('seen',$1) on conflict (k) do update set v=excluded.v", [String(Date.now())]);
      const paused = await q("select v from kv where k='paused'");
      if (!(paused.length && paused[0].v === '1')) {
        const rows = await q("select id, batch from suggestions where status='new' order by id asc");
        if (rows.length) {
          const batches = [...new Set(rows.map(r => Number(r.batch || r.id)))];
          console.log(`SUGESTOES ${rows.length} em ${batches.length} envio(s): ${batches.map(b => 'lote ' + b).join(', ')}`);
          process.exit(0);
        }
      }
      errors = 0;
    } catch (e) {
      log('poll ' + e.message);
      if (++errors >= 30) { console.log('ERRO vigia: ' + e.message); process.exit(1); }
    }
    await sleep(EVERY);
  }
})();
