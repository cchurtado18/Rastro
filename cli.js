#!/usr/bin/env node
// rastro: sigue las wallets de las personas que te interesan y te dice cuál es su wallet activa.
import { execFile } from 'node:child_process';
import { addPerson, removePerson, people, state, refresh, short } from './lib/store.js';

const [cmd, ...args] = process.argv.slice(2);
const ago = (ts) => {
  if (!ts) return 'nunca';
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
};
const fmt = (n) => (n >= 1 ? n.toFixed(2) : n > 0 ? n.toPrecision(2) : '0');
const money = (sol, usd) => [sol ? fmt(sol) + ' SOL' : '', usd ? fmt(usd) + ' USD' : ''].filter(Boolean).join(' + ');

function printPerson(name) {
  const r = state()[name];
  if (!r) return console.log(`${name}: sin revisar todavía (corre: node cli.js check)`);
  console.log(`\n■ ${name}`);
  console.log(`  Wallet activa: ${r.active}   (última compra ${ago(r.lastBuyTs)})`);
  if (r.compare) {
    console.log(`  ${r.compare.summary}`);
    for (const l of r.compare.lines) console.log(`    · ${l}`);
  }
  if (r.busy) console.log('  ⚠ Esta wallet tiene actividad de exchange/bot (cientos de tx por hora); no se rastrea.');
  for (const h of r.hops) {
    const via = h.via.length ? ` vía ${h.via.map(short).join(' → ')}` : '';
    console.log(`  ↳ se mudó${h.viaExchange ? ' (vía exchange)' : ''} ${short(h.from)} → ${short(h.to)}${via}: ${money(h.sol, h.usd)} ${ago(h.ts)}, ${h.buysAfter} compras después`);
  }
  for (const a of r.alsoActive) console.log(`  ⚠ también compra: ${a.to} (recibió ${money(a.sol, a.usd)} ${ago(a.ts)})`);
  for (const w of r.watch) console.log(`  ${w.viaExchange ? '🏦' : '◌'} vigilar: ${w.to} recibió ${money(w.sol, w.usd)} ${ago(w.ts)}: ${w.note || 'todavía no compra'}${w.viaExchange ? ` (exchange ${short(w.viaExchange)})` : ''}`);
  const buys = r.recent.filter((t) => t.side === 'buy').slice(0, 10);
  if (buys.length) console.log('  Compras recientes:');
  for (const t of buys) {
    const tk = r.tokens?.[t.mint];
    console.log(`    ${ago(t.ts).padEnd(12)} ${String((tk?.spoof ? '⚠falso ' : '') + (tk?.symbol || '?')).padEnd(12)} ${(t.sol ? fmt(t.sol) + ' SOL' : fmt(t.usd) + ' USD').padEnd(11)} con ${short(t.wallet || r.active)}  ${new Date(t.ts * 1000).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}`);
  }
  for (const o of r.outgoing) console.log(`  → envió ${money(o.sol, o.usd)} a ${o.to} ${ago(o.lastTs)}`);
}

function notify(title, text) {
  if (process.platform !== 'darwin') return;
  execFile('osascript', ['-e', `display notification ${JSON.stringify(text)} with title ${JSON.stringify(title)} sound name "Glass"`]);
}

function announce(events) {
  for (const e of events) {
    if (e.type === 'switch') {
      const msg = `${e.name} cambió de wallet: ${short(e.from)} → ${short(e.to)}`;
      console.log(`\n🔁 ${msg}\n   Nueva activa: ${e.to}`);
      notify('rastro: wallet nueva', msg);
    } else {
      const tk = state()[e.name]?.tokens?.[e.trade.mint];
      const msg = `${e.name} compró ${tk?.symbol || short(e.trade.mint)} (${fmt(e.trade.sol || e.trade.usd)} ${e.trade.sol ? 'SOL' : 'USD'})`;
      console.log(`🟢 ${msg}  ${e.trade.mint}`);
      notify('rastro: compra', msg);
    }
  }
}

const log = (m) => console.log(m);

switch (cmd) {
  case 'add':
    if (args.length < 2) { console.log('Uso: node cli.js add "<nombre>" <wallet>'); break; }
    addPerson(args.slice(0, -1).join(' '), args.at(-1));
    console.log(`Agregado. Revisando…`);
    await refresh({ only: args.slice(0, -1).join(' '), log });
    printPerson(args.slice(0, -1).join(' '));
    break;
  case 'remove':
    removePerson(args.join(' '));
    console.log('Eliminado.');
    break;
  case 'list':
    for (const p of people()) console.log(`${p.name.padEnd(20)} activa ${p.active}   (${p.wallets.length} wallets conocidas)`);
    break;
  case 'check':
    announce(await refresh({ only: args.join(' ') || undefined, log }));
    for (const p of people()) if (!args.length || p.name === args.join(' ')) printPerson(p.name);
    break;
  case 'show':
    for (const p of people()) if (!args.length || p.name === args.join(' ')) printPerson(p.name);
    break;
  case 'watch': {
    const min = Number(args[0] || 5);
    console.log(`Vigilando cada ${min} min. Ctrl+C para parar.`);
    for (;;) {
      announce(await refresh({ log: () => {} }));
      console.log(`[${new Date().toLocaleTimeString()}] revisado`);
      await new Promise((r) => setTimeout(r, min * 60_000));
    }
  }
  default:
    console.log(`rastro: sigue las wallets de la gente y encuentra su wallet activa

  node cli.js add "<nombre>" <wallet>   seguir a alguien
  node cli.js check [nombre]            rastrear ahora y mostrar resultado
  node cli.js show [nombre]             mostrar el último resultado
  node cli.js watch [minutos]           vigilar en bucle con notificaciones (def. 5)
  node cli.js list | remove <nombre>
  node server.js                        panel en http://localhost:4777`);
}
