// Watcher that wakes Claude only when there is work. It runs in the background of the Claude Code session
// (Bash run_in_background) and EXITS, printing one line, when the review window is on and new suggestions exist.
// Zero tokens while idle. The window ("for the next N min, every M min") is set in the game (Owner controls) or with
// `node tools/sugestoes.js janela N M`. It writes a heartbeat (kv 'seen') so players can see the reviewer is online.
// Usage: node tools/vigia.js
const { q, SCHEMA } = require('./_env');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const s of SCHEMA) await q(s);
  let errors = 0, lastCheck = 0;
  for (;;) {
    try {
      const now = Date.now();
      await q("insert into kv (k, v) values ('seen',$1) on conflict (k) do update set v=excluded.v", [String(now)]);
      const cfgRow = await q("select v from kv where k='review'");
      const cfg = cfgRow.length ? JSON.parse(cfgRow[0].v) : { until: 0, every: 5 };
      const every = Math.max(1, Number(cfg.every) || 5) * 60e3;
      if (cfg.until > now) {
        if (now - lastCheck >= every - 1000) {
          lastCheck = now;
          const rows = await q("select id from suggestions where status='new' order by id asc");
          if (rows.length) { console.log(`SUGESTOES ${rows.length}: ${rows.map(r => '#' + r.id).join(' ')}`); process.exit(0); }
        }
        await sleep(Math.min(every, 60e3));
      } else await sleep(2 * 60e3);
      errors = 0;
    } catch (e) {
      if (++errors >= 10) { console.log('ERRO vigia: ' + e.message); process.exit(1); }
      await sleep(30e3);
    }
  }
})();
