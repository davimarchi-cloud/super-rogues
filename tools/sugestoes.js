// The suggestion queue, from Claude's side. Usage:
//   node tools/sugestoes.js                    pending (new + doing), full text, oldest first
//   node tools/sugestoes.js todas              last 40, any status
//   node tools/sugestoes.js lendo 3 4          mark as "doing" (players see "in progress")
//   node tools/sugestoes.js espera 5 6         hold for the owner's OK (players see "awaiting owner's OK"); vigia ignores it
//   node tools/sugestoes.js feito 3 "reply"    mark done with a public reply (also stamps lastRun)
//   node tools/sugestoes.js recusa 4 "reason"  decline with a public reason
//   node tools/sugestoes.js status             watcher heartbeat, pause flag, last delivery
//   node tools/sugestoes.js pausa | retoma     stop / resume waking Claude for new batches
//   node tools/sugestoes.js arte 41            save the Art Lab pictures of batch 41 to art-inbox/41-<hero>/ (to look at them)
const { q, SCHEMA } = require('./_env');
const [cmd, ...args] = process.argv.slice(2);
const fmt = ms => new Date(Number(ms)).toLocaleString('pt-BR');
(async () => {
  for (const s of SCHEMA) await q(s);
  if (!cmd || cmd === 'todas') {
    const rows = cmd ? await q('select * from suggestions order by id desc limit 40')
      : await q("select * from suggestions where status in ('new','doing','held') order by id asc");
    if (!rows.length) { console.log(cmd ? 'Nenhuma sugestão.' : 'Nenhuma sugestão pendente.'); return; }
    let last = null;
    for (const r of rows) {
      const b = Number(r.batch || r.id);
      if (b !== last) {
        console.log(`=== lote ${b} · ${r.name || 'anon'} · ${fmt(r.created)}`); last = b;
        const art = await q('select hero from art where batch=$1', [b]);
        if (art.length) console.log(`📎 ${art.length} envio(s) de arte (${art.map(a => a.hero).join(', ')}): node tools/sugestoes.js arte ${b}`);
      }
      console.log(`#${r.id} [${r.status}]\n${r.text}${r.reply ? '\n  -> ' + r.reply : ''}\n`);
    }
  } else if (cmd === 'arte') {
    const fs = require('fs'), path = require('path'), b = +args[0];
    const rows = await q('select * from art where batch=$1 order by id', [b]);
    if (!rows.length) { console.log('Nenhuma arte no lote ' + b); return; }
    const ext = u => ({ png: 'png', jpeg: 'jpg', webp: 'webp' })[u.slice(11, u.indexOf(';'))] || 'bin';
    const save = (dir, name, u) => { const f = path.join(dir, name + '.' + ext(u)); fs.writeFileSync(f, Buffer.from(u.slice(u.indexOf(',') + 1), 'base64')); return f; };
    for (const r of rows) {
      const dir = path.join(__dirname, '..', 'art-inbox', `${b}-${r.hero}-${r.id}`); fs.mkdirSync(dir, { recursive: true });
      const out = [];
      if (r.splash) out.push(save(dir, 'splash', r.splash));
      const poses = JSON.parse(r.poses || '{}'); for (const k of Object.keys(poses)) out.push(save(dir, k, poses[k]));
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(Object.assign({ hero: r.hero, batch: b }, JSON.parse(r.meta || '{}')), null, 2));
      console.log(`${r.hero}: ${out.length} imagem(ns) em ${dir}`);
    }
  } else if (cmd === 'espera') {
    for (const id of args) await q("update suggestions set status='held', updated=$2 where id=$1", [+id, Date.now()]);
    console.log('esperando o dono:', args.join(', '));
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
    console.log(kv.paused === '1' ? 'Revisão PAUSADA' : 'Revisão ligada (acorda a cada envio)');
    console.log('Vigia visto:', kv.seen ? fmt(kv.seen) : 'nunca', ' · Última entrega:', kv.lastRun ? fmt(kv.lastRun) : 'nunca');
  } else if (cmd === 'pausa' || cmd === 'retoma') {
    await q("insert into kv (k, v) values ('paused',$1) on conflict (k) do update set v=excluded.v", [cmd === 'pausa' ? '1' : '0']);
    console.log(cmd === 'pausa' ? 'Revisão pausada' : 'Revisão ligada');
  } else { console.log('comando desconhecido'); process.exit(1); }
})().catch(e => { console.error(e.message); process.exit(1); });
