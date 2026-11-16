// Lista de personas seguidas y último resultado de cada una (data/watchlist.json, data/state.json).
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './solana.js';
import { tracePerson, clearScanCache, DEFAULTS } from './tracker.js';
import { tokenInfo } from './solana.js';
import { mergeResult } from './history.js';

const WATCH = path.join(DATA, 'watchlist.json');
const STATE = path.join(DATA, 'state.json');
const read = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));

export const isAddress = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

export function people() { return read(WATCH, []); }
export function state() { return read(STATE, {}); }

export function addPerson(name, wallet) {
  if (!name || !isAddress(wallet)) throw new Error('Nombre y dirección de wallet Solana válida, por favor');
  const list = people();
  const p = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (p) { if (!p.wallets.includes(wallet)) p.wallets.push(wallet); p.active = wallet; }
  else list.push({ name, wallets: [wallet], active: wallet, addedAt: Math.floor(Date.now() / 1000) });
  write(WATCH, list);
}

export function removePerson(name) {
  write(WATCH, people().filter((p) => p.name !== name));
  const s = state(); delete s[name]; write(STATE, s);
}

// Rastrea a todos (o a uno). Devuelve los eventos nuevos: cambio de wallet y compras nuevas.
export async function refresh({ only, opts = DEFAULTS, log = () => {}, onEvent = () => {} } = {}) {
  clearScanCache();
  const list = people();
  const st = state();
  const events = [];
  for (const p of list) {
    if (only && p.name !== only) continue;
    log(`Revisando ${p.name} (${short(p.active)}) …`);
    // Lee todo lo ocurrido desde la revisión anterior (o las últimas 24 h la primera vez),
    // así no se pierde una mudanza aunque el panel haya estado apagado.
    const prevCheck = st[p.name]?.checkedAt;
    const sinceTs = prevCheck ? prevCheck - 300 : Math.floor(Date.now() / 1000) - 86400;
    let r;
    // Wallets de las demás personas: si el dinero llega a una de ellas, no se le asigna a esta.
    const others = new Map(list.filter((q) => q.name !== p.name).flatMap((q) => [...q.wallets, q.active, ...(q.bridges || []).map((b) => b.id)].map((w) => [w, q.name])));
    try { r = await tracePerson(p, { ...opts, sinceTs, others }, onEvent); }
    catch (e) { log(`  error: ${e.message}`); onEvent({ t: 'error', person: p.name, message: e.message }); continue; }

    const prev = st[p.name];
    demoteBridges(p, r);
    if (r.changed) {
      for (const h of r.hops) if (!p.wallets.includes(h.to)) p.wallets.push(h.to);
      if (!p.wallets.includes(r.active)) p.wallets.push(r.active);
      p.active = r.active;
      events.push({ type: 'switch', name: p.name, from: r.previousActive, to: r.active, hops: r.hops });
    }
    const mints = [...r.recent.map((t) => t.mint)];
    r.tokens = await tokenInfo(mints);
    // Imitaciones (p. ej. un "USDT" que no es el USDT real): se marcan y no generan aviso.
    for (const t of r.recent) if (r.tokens[t.mint]?.spoof) t.spoof = r.tokens[t.mint].spoof;
    const seen = new Set((prev?.recent || []).map((t) => t.sig + t.mint));
    // Solo compras hechas después de la revisión anterior (no las viejas de una wallet recién descubierta).
    const fresh = prev ? r.recent.filter((t) => t.side === 'buy' && !r.tokens?.[t.mint]?.spoof && !seen.has(t.sig + t.mint) && t.ts > (prev.checkedAt || 0) - 120) : [];
    for (const t of fresh) events.push({ type: 'buy', name: p.name, wallet: t.wallet || r.active, trade: t });

    // Cada revisión solo lee lo nuevo: el mapa y los envíos se suman a lo que ya se sabía (últimos 7 días).
    st[p.name] = mergeResult(prev, r, p.wallets);
    write(STATE, st);
    write(WATCH, list);
  }
  return events;
}

// Una wallet de la cadena que no tiene ni una compra ni una venta no es una wallet de trading: fue el puente
// entre la anterior y la siguiente. Sale de la cadena y queda dibujada como puente (la primera y la activa no se tocan).
export function demoteBridges(p, r) {
  const idle = p.wallets.filter((w, i) => {
    if (!i || w === r.active || w === p.active) return false;
    const c = r.compare?.wallets.find((x) => x.address === w);
    return c && !c.total.buys && !c.total.sells;
  });
  for (const w of idle) {
    const i = p.wallets.indexOf(w);
    const b = { id: w, from: p.wallets[i - 1], to: p.wallets[i + 1] };
    (p.bridges ||= []).push(b);
    p.wallets.splice(i, 1);
    // El mapa de esta revisión ya se dibujó con la cadena vieja: se corrige aquí mismo.
    const g = r.graph;
    g.edges = g.edges.filter((e) => !(e.kind === 'history' && (e.from === w || e.to === w)));
    if (b.to) g.edges.push({ from: b.from, to: w, kind: 'history' }, { from: w, to: b.to, kind: 'history' });
    const n = g.nodes.find((x) => x.id === w);
    if (n && (n.status === 'old' || n.status === 'also')) n.status = 'bridge';
  }
  return idle;
}

export const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '—');
