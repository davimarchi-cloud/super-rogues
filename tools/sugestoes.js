// The suggestion queue, from Claude's side. Usage:
//   node tools/sugestoes.js                    pending (new + doing), full text, oldest first
//   node tools/sugestoes.js todas              last 40, any status
//   node tools/sugestoes.js lendo 3 4          mark as "doing" (players see "in progress")
//   node tools/sugestoes.js feito 3 "reply"    mark done with a public reply (also stamps lastRun)
//   node tools/sugestoes.js recusa 4 "reason"  decline with a public reason
//   node tools/sugestoes.js status             review window + watcher heartbeat
//   node tools/sugestoes.js janela 60 1        set the review window (minutes, every N min) without the UI
const { q, SCHEMA } = require('./_env');
const [cmd, ...args] = process.argv.slice(2);
const fmt = ms => new Date(Number(ms)).toLocaleString('pt-BR');
(async () => {
  for (const s of SCHEMA) await q(s);
  if (!cmd || cmd === 'todas') {
    const rows = cmd ? await q('select * from suggestions order by id desc limit 40')
      : await q("select * from suggestions where status in ('new','doing') order by id asc");
    if (!rows.length) { console.log(cmd ? 'Nenhuma sugestão.' : 'Nenhuma sugestão pendente.'); return; }
    for (const r of rows) console.log(`#${r.id} [${r.status}] ${r.name || 'anon'} · ${fmt(r.created)}\n${r.text}${r.reply ? '\n  -> ' + r.reply : ''}\n`);
  } else if (cmd === 'lendo') {
    for (const id of args) await q("update suggestions set status='doing', updated=$2 where id=$1", [+id, Date.now()]);
    console.log('em andamento:', args.join(', '));
  } else if (cmd === 'feito' || cmd === 'recusa') {
    const [id, ...rest] = args; const reply = rest.join(' ').trim();
    if (!id || !reply) { console.log('uso: ' + cmd + ' <id> "resposta"'); process.exit(1); }
    await q('update suggestions set status=$2, reply=$3, updated=$4 where id=$1', [+id, cmd === 'feito' ? 'done' : 'declined', reply.slice(0, 600), Date.now()]);
    if (cmd === 'feito') await q("insert into kv (k, v) values ('lastRun',$1) on conflict (k) do update set v=excluded.v", [String(Date.now())]);
    console.log(`#${id} -> ${cmd === 'feito' ? 'done' : 'declined'}`);
  } else if (cmd === 'status') {
    const kv = Object.fromEntries((await q('select k, v from kv')).map(r => [r.k, r.v]));
    const c = kv.review ? JSON.parse(kv.review) : { until: 0, every: 5 };
    console.log(c.until > Date.now() ? `Janela ATIVA até ${fmt(c.until)}, de ${c.every} em ${c.every} min` : 'Janela desligada');
    console.log('Vigia visto:', kv.seen ? fmt(kv.seen) : 'nunca', ' · Última entrega:', kv.lastRun ? fmt(kv.lastRun) : 'nunca');
  } else if (cmd === 'janela') {
    const min = +args[0] || 0, every = Math.max(1, +args[1] || 5);
    await q("insert into kv (k, v) values ('review',$1) on conflict (k) do update set v=excluded.v", [JSON.stringify({ until: min ? Date.now() + min * 60e3 : 0, every, setAt: Date.now() })]);
    console.log(min ? `Janela de ${min} min, checando de ${every} em ${every} min` : 'Janela desligada');
  } else { console.log('comando desconhecido'); process.exit(1); }
})().catch(e => { console.error(e.message); process.exit(1); });
