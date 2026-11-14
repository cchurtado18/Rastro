// Lógica de rastreo: qué hizo una wallet (compras, ventas, envíos) y a cuál se mudó.
import { signatures, signaturesSince, transaction, exchangeWithdrawals, tokenInfo } from './solana.js';

const WSOL = 'So11111111111111111111111111111111111111112';
const QUOTES = new Set([
  WSOL,
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCELxeqQBMd', // USDT
]);
const STABLES = new Set([...QUOTES].filter((m) => m !== WSOL));

export const DEFAULTS = {
  scanLimit: 40,      // transacciones recientes que se leen por wallet
  minMoveSol: 0.2,    // envío mínimo en SOL para considerarlo "mudanza"
  minMoveUsd: 20,     // envío mínimo en USDC/USDT
  maxHops: 6,         // máximo de saltos de wallet en wallet por pasada
  maxCandidates: 5,   // destinos que se revisan por wallet
  bridgeDepth: 2,     // wallets puente sin compras que se atraviesan (A → puente → C)
  busyTxPerHour: 200, // más que esto = exchange / bot / programa, no se sigue
  compareLimit: 150,  // transacciones por wallet al comparar con cuál compra más
  sinceTs: 0,         // además, todo lo ocurrido desde aquí (la revisión anterior): no se pierde ninguna mudanza
  catchupCap: 3000,   // máximo de transacciones por wallet al ponerse al día
  cexWindowH: 6,      // tras depositar en un exchange, horas en que se buscan retiros parecidos
  cexMaxAgeH: 72,     // depósitos más viejos que esto ya no se investigan
  cexPages: 2,        // páginas de 100 movimientos por cada tramo de 30 min del exchange
};

// Compras/ventas de menos de esto son polvo (bots, pruebas, airdrops): no cuentan.
export const DUST_SOL = 0.01;
export const DUST_USD = 1;

// ---------- Lectura de una transacción ----------

function instructionsOf(tx) {
  const outer = tx.transaction.message.instructions || [];
  const inner = (tx.meta.innerInstructions || []).flatMap((i) => i.instructions);
  return [...outer, ...inner];
}

export function parseTx(tx, wallet) {
  if (!tx || tx.meta?.err) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? { pubkey: k } : k));
  const idx = keys.findIndex((k) => k.pubkey === wallet);
  const signer = idx >= 0 && !!keys[idx].signer;
  const ts = tx.blockTime;
  const sig = tx.transaction.signatures[0];

  // Cambio de SOL de la wallet (sin la comisión si ella pagó).
  let sol = 0;
  if (idx >= 0) {
    sol = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9;
    if (idx === 0) sol += tx.meta.fee / 1e9;
  }

  // Cambio de tokens por mint de las cuentas cuyo dueño es la wallet.
  const tok = {};
  const add = (b, sign) => {
    if (b.owner !== wallet) return;
    tok[b.mint] = (tok[b.mint] || 0) + sign * Number(b.uiTokenAmount.uiAmountString || 0);
  };
  (tx.meta.preTokenBalances || []).forEach((b) => add(b, -1));
  (tx.meta.postTokenBalances || []).forEach((b) => add(b, +1));
  const wsol = tok[WSOL] || 0;
  const quoteSol = sol + wsol;
  const quoteUsd = [...STABLES].reduce((s, m) => s + (tok[m] || 0), 0);

  const trades = [];
  let dust = 0;
  if (signer) {
    for (const [mint, delta] of Object.entries(tok)) {
      if (QUOTES.has(mint) || Math.abs(delta) < 1e-12) continue;
      if (Math.abs(quoteSol) < DUST_SOL && Math.abs(quoteUsd) < DUST_USD) { dust++; continue; }
      if (delta > 0 && (quoteSol < -0.0005 || quoteUsd < -0.01)) {
        trades.push({ side: 'buy', mint, amount: delta, sol: -Math.min(quoteSol, 0), usd: -Math.min(quoteUsd, 0), ts, sig });
      } else if (delta < 0 && (quoteSol > 0.0005 || quoteUsd > 0.01)) {
        trades.push({ side: 'sell', mint, amount: -delta, sol: Math.max(quoteSol, 0), usd: Math.max(quoteUsd, 0), ts, sig });
      }
    }
  }

  // Envíos y recepciones directos de SOL / USDC / USDT (solo en transacciones que no son swaps).
  const moves = [];
  if (!trades.length) {
    const tokenOwner = {};
    for (const b of [...(tx.meta.preTokenBalances || []), ...(tx.meta.postTokenBalances || [])]) {
      tokenOwner[keys[b.accountIndex].pubkey] = { owner: b.owner, mint: b.mint };
    }
    for (const ins of instructionsOf(tx)) {
      const p = ins.parsed;
      if (!p || typeof p !== 'object') continue;
      const i = p.info || {};
      if (ins.program === 'system' && (p.type === 'transfer' || p.type === 'transferWithSeed')) {
        const amount = i.lamports / 1e9;
        if (i.source === wallet && i.destination !== wallet) moves.push({ dir: 'out', to: i.destination, asset: 'SOL', amount, ts, sig });
        if (i.destination === wallet && i.source !== wallet) moves.push({ dir: 'in', from: i.source, asset: 'SOL', amount, ts, sig });
      }
      if ((ins.program === 'spl-token' || ins.program === 'spl-token-2022') && (p.type === 'transfer' || p.type === 'transferChecked')) {
        const src = tokenOwner[i.source];
        const dst = tokenOwner[i.destination];
        const mint = i.mint || src?.mint || dst?.mint;
        if (!STABLES.has(mint) && mint !== WSOL) continue;
        const amount = Number(i.tokenAmount?.uiAmountString ?? i.amount / 1e6);
        const asset = mint === WSOL ? 'SOL' : 'USD';
        const owner = i.authority || i.multisigAuthority;
        if (owner === wallet && dst && dst.owner !== wallet) moves.push({ dir: 'out', to: dst.owner, asset, amount, ts, sig });
        if (dst?.owner === wallet && src && src.owner !== wallet) moves.push({ dir: 'in', from: src.owner, asset, amount, ts, sig });
      }
    }
  }
  return { sig, ts, signer, sol, trades, moves, dust };
}

// ---------- Búsqueda en vivo ----------
// Cada paso del rastreo se emite como evento (wallet revisada, dinero que se movió, veredicto)
// para que el panel dibuje la red mientras se busca. También queda guardado como grafo.
let emit = () => {};

// ---------- Resumen de una wallet ----------

const scanCache = new Map();

export async function scanWallet(address, opts = DEFAULTS) {
  const key = address + ':' + opts.scanLimit + ':' + (opts.sinceTs || 0);
  emit({ t: 'scan', id: address });
  if (primed.has(address)) return scanned(primed.get(address));
  if (scanCache.has(key)) return scanned(scanCache.get(key));
  // Las últimas `scanLimit` y, además, todas desde la revisión anterior (aunque hayan sido miles).
  const { sigs, busy, complete } = await signaturesSince(address, { minCount: opts.scanLimit, sinceTs: opts.sinceTs || 0, cap: opts.catchupCap, busyTxPerHour: opts.busyTxPerHour });
  const out = { address, txCount: sigs.length, busy, complete, dust: 0, trades: [], moves: [], lastTs: sigs[0]?.blockTime || null, oldestTs: sigs.at(-1)?.blockTime || null, limit: complete ? Infinity : sigs.length };
  // Pocas firmas pero a ritmo de exchange/bot también cuenta como busy.
  if (!busy && sigs.length >= opts.scanLimit) {
    const recent = sigs.slice(0, Math.max(opts.scanLimit, 200));
    const span = (recent[0].blockTime - recent.at(-1).blockTime) / 3600;
    if (span > 0 && recent.length / span > opts.busyTxPerHour) out.busy = true;
  }
  if (!out.busy) {
    const txs = await Promise.all(sigs.map((s) => transaction(s.signature)));
    for (const tx of txs) {
      const p = parseTx(tx, address);
      if (!p) continue;
      out.trades.push(...p.trades);
      out.moves.push(...p.moves);
      out.dust += p.dust;
    }
  }
  const buys = out.trades.filter((t) => t.side === 'buy');
  out.lastBuyTs = buys.length ? Math.max(...buys.map((b) => b.ts)) : null;
  out.buys = buys.length;
  out.sells = out.trades.length - buys.length;
  scanCache.set(key, out);
  return scanned(out);
}

function scanned(sc) {
  emit({ t: 'scanned', id: sc.address, buys: sc.buys ?? sc.trades.filter((x) => x.side === 'buy').length, sells: sc.sells ?? 0, busy: sc.busy, lastBuyTs: sc.lastBuyTs, txCount: sc.txCount });
  return sc;
}

const primed = new Map();
export function clearScanCache() { scanCache.clear(); primed.clear(); }
// Para pruebas: fija el resultado de scanWallet de una dirección (para cualquier profundidad).
export function primeScan(address, scan) { primed.set(address, scan); }

function bigEnough(m, opts) {
  return m.asset === 'SOL' ? m.amount >= opts.minMoveSol : m.amount >= opts.minMoveUsd;
}

// Destinos de dinero que salió de una wallet, agrupados, del más grande al más chico.
function outgoing(scan, opts, sinceTs = 0) {
  const by = {};
  for (const m of scan.moves) {
    if (m.dir !== 'out' || m.ts < sinceTs || !bigEnough(m, opts)) continue;
    const d = (by[m.to] ||= { to: m.to, sol: 0, usd: 0, firstTs: m.ts, lastTs: m.ts, sigs: [] });
    if (m.asset === 'SOL') d.sol += m.amount; else d.usd += m.amount;
    d.firstTs = Math.min(d.firstTs, m.ts);
    d.lastTs = Math.max(d.lastTs, m.ts);
    d.sigs.push(m.sig);
  }
  // Lo más reciente primero: una mudanza nueva no queda tapada por envíos grandes viejos.
  return Object.values(by).sort((a, b) => b.lastTs - a.lastTs || b.sol + b.usd / 150 - (a.sol + a.usd / 150)).slice(0, opts.maxCandidates);
}

// Busca a qué wallet se mudó `from`: recibió dinero y empezó a comprar después de recibirlo.
// Atraviesa wallets puente que solo reenvían (hasta opts.bridgeDepth).
async function findNext(from, fromScan, opts, visited, depth = 0, path = []) {
  const found = [];
  const watch = [];
  // Todos los destinos se revisan a la vez (en paralelo), no uno por uno.
  const cands = outgoing(fromScan, opts).filter((c) => !visited.has(c.to));
  cands.forEach((c) => { visited.add(c.to); emit({ t: 'edge', from, to: c.to, sol: c.sol, usd: c.usd, ts: c.lastTs }); });
  const scans = await Promise.all(cands.map((c) => scanWallet(c.to, opts)));
  // Si entró a un exchange, busca quién retiró una cantidad parecida (también en paralelo).
  const exch = await Promise.all(cands.map((c, i) => (scans[i].busy
    ? (emit({ t: 'mark', id: c.to, status: 'busy' }), searchExchange({ from, exchange: c.to, sol: c.sol, usd: c.usd, ts: c.lastTs, path }, opts, visited))
    : null)));
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const scan = scans[i];
    if (exch[i]) {
      found.push(...exch[i].found);
      watch.push(...exch[i].watch);
      continue;
    }
    const buysAfter = scan.trades.filter((t) => t.side === 'buy' && t.ts >= c.firstTs);
    const hop = { from, to: c.to, sol: c.sol, usd: c.usd, ts: c.lastTs, firstTs: c.firstTs, sig: c.sigs[0], via: path };
    if (buysAfter.length) {
      emit({ t: 'mark', id: c.to, status: 'buyer', buysAfter: buysAfter.length });
      found.push({ ...hop, buysAfter: buysAfter.length, firstBuyTs: Math.min(...buysAfter.map((b) => b.ts)), lastBuyTs: Math.max(...buysAfter.map((b) => b.ts)) });
    } else if (depth < opts.bridgeDepth && outgoing(scan, opts, c.firstTs).length) {
      emit({ t: 'mark', id: c.to, status: 'bridge' });
      const deeper = await findNext(c.to, scan, opts, visited, depth + 1, [...path, c.to]);
      found.push(...deeper.found.map((f) => ({ ...f, from })));
      watch.push(...deeper.watch);
    } else {
      emit({ t: 'mark', id: c.to, status: 'watch' });
      watch.push({ ...hop, note: 'recibió dinero, todavía no compra' });
    }
  }
  return { found, watch };
}

// ---------- Mudanzas a través de un exchange ----------
// Depositó X en un exchange → busca retiros de ese exchange de ~X en las horas siguientes
// hacia wallets nuevas que después compraron. Si solo una cumple, es la nueva wallet;
// si varias cumplen, se muestran como "posibles" para que tú decidas.
let withdrawalsSource = exchangeWithdrawals;
export function setExchangeSource(fn) { withdrawalsSource = fn || exchangeWithdrawals; }

async function searchExchange(dep, opts, visited) {
  const now = Math.floor(Date.now() / 1000);
  const out = { found: [], watch: [] };
  if (!dep.ts || now - dep.ts > opts.cexMaxAgeH * 3600) return out;
  const asset = dep.sol >= opts.minMoveSol ? 'SOL' : 'USD';
  const amount = asset === 'SOL' ? dep.sol : dep.usd;
  const toTs = Math.min(now, dep.ts + opts.cexWindowH * 3600);
  emit({ t: 'cex', id: dep.exchange, amount, asset, ts: dep.ts });
  const list = await withdrawalsSource(dep.exchange, dep.ts, toTs, opts.cexPages);
  if (!list) return out;
  // Retiro parecido: entre 90% y 101% de lo depositado (el exchange cobra comisión o retiró casi todo).
  const near = new Map();
  for (const w of list) {
    if (w.asset !== asset || w.ts < dep.ts || visited.has(w.to)) continue;
    const ratio = w.amount / amount;
    if (ratio < 0.9 || ratio > 1.01) continue;
    const prev = near.get(w.to);
    if (!prev || Math.abs(1 - ratio) < Math.abs(1 - prev.amount / amount)) near.set(w.to, w);
  }
  const passing = [];
  const picks = [...near.values()].sort((a, b) => Math.abs(1 - a.amount / amount) - Math.abs(1 - b.amount / amount)).slice(0, 8);
  picks.forEach((w) => visited.add(w.to));
  // Wallet nueva: casi sin historial antes de ese retiro (se revisan todas a la vez).
  const checks = await Promise.all(picks.map(async (w) => {
    const hist = primed.has(w.to) ? primed.get(w.to).history || [] : await signatures(w.to, 20);
    if (hist.filter((h) => h.blockTime < w.ts).length > 3) return null;
    return scanWallet(w.to, opts);
  }));
  for (let i = 0; i < picks.length; i++) {
    const w = picks[i];
    const scan = checks[i];
    if (!scan || scan.busy) continue;
    const buysAfter = scan.trades.filter((t) => t.side === 'buy' && t.ts >= w.ts);
    emit({ t: 'edge', from: dep.exchange, to: w.to, sol: asset === 'SOL' ? w.amount : 0, usd: asset === 'USD' ? w.amount : 0, ts: w.ts, kind: 'cex' });
    const hop = { from: dep.from, to: w.to, sol: asset === 'SOL' ? w.amount : 0, usd: asset === 'USD' ? w.amount : 0, ts: w.ts, firstTs: w.ts, sig: w.sig, via: [...dep.path, dep.exchange], viaExchange: dep.exchange, depositTs: dep.ts };
    if (buysAfter.length) passing.push({ ...hop, buysAfter: buysAfter.length, firstBuyTs: Math.min(...buysAfter.map((b) => b.ts)), lastBuyTs: Math.max(...buysAfter.map((b) => b.ts)) });
    else { emit({ t: 'mark', id: w.to, status: 'cex' }); out.watch.push({ ...hop, note: 'retiró del exchange una cantidad parecida, aún no compra' }); }
  }
  if (passing.length === 1) {
    emit({ t: 'mark', id: passing[0].to, status: 'buyer', buysAfter: passing[0].buysAfter });
    out.found.push(passing[0]);
  } else {
    for (const p of passing) { emit({ t: 'mark', id: p.to, status: 'cex' }); out.watch.push({ ...p, note: `posible wallet nueva vía exchange (${passing.length} coincidencias)` }); }
  }
  return out;
}

// ---------- Rastreo completo de una persona ----------

export async function tracePerson(person, opts = DEFAULTS, onEvent = () => {}) {
  const nodes = {};
  const edges = {};
  emit = (e) => {
    if (e.t === 'scan') nodes[e.id] ||= { id: e.id, status: 'scanning' };
    if (e.t === 'scanned') Object.assign((nodes[e.id] ||= { id: e.id }), { buys: e.buys, sells: e.sells, busy: e.busy, lastBuyTs: e.lastBuyTs, txCount: e.txCount, status: nodes[e.id]?.status === 'scanning' ? 'seen' : nodes[e.id]?.status });
    if (e.t === 'mark') Object.assign((nodes[e.id] ||= { id: e.id }), { status: e.status });
    if (e.t === 'edge') { nodes[e.to] ||= { id: e.to, status: 'pending' }; edges[e.from + '>' + e.to] = { from: e.from, to: e.to, sol: e.sol, usd: e.usd, ts: e.ts, kind: e.kind || 'out' }; }
    onEvent({ ...e, person: person.name });
  };
  // Solo se excluye la wallet actual: si el dinero regresa a una wallet anterior y esa vuelve a comprar,
  // vuelve a ser la activa.
  const visited = new Set();
  // Las wallets anteriores de la persona forman la cadena ya conocida.
  person.wallets.forEach((w, i) => {
    nodes[w] = { id: w, status: 'old' };
    if (i) edges[person.wallets[i - 1] + '>' + w] = { from: person.wallets[i - 1], to: w, kind: 'history' };
  });
  onEvent({ t: 'start', person: person.name, wallets: person.wallets });
  let current = person.active || person.wallets[person.wallets.length - 1];
  emit({ t: 'mark', id: current, status: 'current' });
  visited.add(current);
  let scan = await scanWallet(current, opts);
  const hops = [];
  const watch = [];
  const alsoActive = [];

  for (let i = 0; i < opts.maxHops; i++) {
    const { found, watch: w } = await findNext(current, scan, opts, visited);
    watch.push(...w);
    if (!found.length) break;
    // La nueva activa es la que compró más recientemente; las demás que también compran se reportan.
    found.sort((a, b) => b.lastBuyTs - a.lastBuyTs);
    const best = found[0];
    if (scan.lastBuyTs && scan.lastBuyTs > best.lastBuyTs) {
      // La wallet actual sigue comprando más reciente que cualquier destino: sigue siendo la activa.
      alsoActive.push(...found);
      found.forEach((f) => emit({ t: 'mark', id: f.to, status: 'also' }));
      break;
    }
    alsoActive.push(...found.slice(1));
    found.slice(1).forEach((f) => emit({ t: 'mark', id: f.to, status: 'also' }));
    hops.push(best);
    emit({ t: 'mark', id: current, status: 'old' });
    emit({ t: 'hop', from: current, to: best.to });
    current = best.to;
    visited.add(current);
    emit({ t: 'mark', id: current, status: 'current' });
    scan = await scanWallet(current, opts);
  }

  // ---- Comparación: ¿con cuál wallet está comprando más? ----
  // Se revisan a fondo todas sus wallets conocidas, la de la cadena y las que también compran.
  const cmpOpts = { ...opts, scanLimit: opts.compareLimit };
  const pool = [...new Set([...person.wallets, current, ...hops.map((h) => h.to), ...alsoActive.map((a) => a.to)])];
  const scans = {};
  const pooled = await Promise.all(pool.map((w) => scanWallet(w, cmpOpts)));
  pool.forEach((w, i) => { if (!pooled[i].busy) scans[w] = pooled[i]; });
  // Las compras de imitaciones (un "USDT" falso, etc.) no cuentan para decidir con cuál compra más.
  const mints = [...new Set(Object.values(scans).flatMap((sc) => sc.trades.map((t) => t.mint)))].filter((m) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m));
  const info = mints.length ? await tokenInfo(mints).catch(() => ({})) : {};
  for (const w of Object.keys(scans)) {
    const sc = scans[w];
    if (sc.trades.some((t) => info[t.mint]?.spoof)) {
      const trades = sc.trades.filter((t) => !info[t.mint]?.spoof);
      const buys = trades.filter((t) => t.side === 'buy');
      scans[w] = { ...sc, trades, lastBuyTs: buys.length ? Math.max(...buys.map((b) => b.ts)) : null };
    }
  }
  const compare = compareWallets(scans);
  const principal = compare.principal || current;
  if (principal !== current) {
    emit({ t: 'mark', id: current, status: 'also' });
    emit({ t: 'principal', id: principal, reason: compare.summary });
  }
  for (const c of compare.wallets) if (c.address !== principal && c.w24.buys) emit({ t: 'mark', id: c.address, status: 'also' });
  current = principal;
  scan = scans[current] || scan;

  // "También compra" solo cuenta si compró en las últimas 2 semanas.
  const fresh = Math.floor(Date.now() / 1000) - 14 * 86400;
  // Si al quitar polvo e imitaciones ya no le quedan compras tras recibir, pasa a "vigilar".
  const realBuyer = (a) => !scans[a.to] || scans[a.to].trades.some((t) => t.side === 'buy' && t.ts >= (a.firstTs || a.ts));
  for (const a of alsoActive) if (!realBuyer(a) && a.to !== current) watch.push({ ...a, note: 'recibió dinero, todavía no compra' });
  const alsoRecent = alsoActive.filter((a) => a.lastBuyTs >= fresh && a.to !== current && realBuyer(a));
  // Compras y ventas recientes de todas sus wallets activas, cada una con la wallet que la hizo.
  const recent = Object.values(scans).flatMap((sc) => sc.trades.map((t) => ({ ...t, wallet: sc.address })))
    .sort((a, b) => b.ts - a.ts).slice(0, 40);
  const fundedBy = scan.moves.filter((m) => m.dir === 'in' && bigEnough(m, opts)).sort((a, b) => b.ts - a.ts).slice(0, 5);
  // De dónde le llegó dinero a la activa: se dibujan como nodos de origen.
  for (const m of fundedBy) {
    nodes[m.from] ||= { id: m.from, status: 'funder' };
    const k = m.from + '>' + current;
    if (!edges[k]) edges[k] = { from: m.from, to: current, sol: 0, usd: 0, ts: m.ts, kind: 'in' };
    if (edges[k].kind === 'in') edges[k][m.asset === 'SOL' ? 'sol' : 'usd'] += m.amount;
  }
  for (const c of compare.wallets) Object.assign((nodes[c.address] ||= { id: c.address, status: 'old' }), { buys: c.total.buys, sells: c.total.sells, lastBuyTs: c.lastBuyTs, buys24: c.w24.buys });
  emit({ t: 'mark', id: current, status: scan.busy ? 'busy' : 'active' });
  const graph = { nodes: Object.values(nodes), edges: Object.values(edges) };
  onEvent({ t: 'done', person: person.name, active: current, graph, compare });
  emit = () => {};
  const previousActive = person.active || person.wallets[person.wallets.length - 1];
  return {
    graph,
    compare,
    name: person.name,
    previousActive,
    active: current,
    busy: scan.busy,
    changed: current !== previousActive,
    hops,
    alsoActive: alsoRecent,
    watch: watch.filter((w) => w.to !== current),
    lastBuyTs: scan.lastBuyTs,
    lastTs: scan.lastTs,
    recent,
    fundedBy,
    outgoing: outgoing(scan, opts),
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

// ---------- Comparación entre wallets ----------

const WINDOWS = { w1: 3600, w24: 86400, w7: 7 * 86400 };
const shortA = (a) => a.slice(0, 4) + '…' + a.slice(-4);

export function walletStats(sc, now = Math.floor(Date.now() / 1000)) {
  const buys = sc.trades.filter((t) => t.side === 'buy');
  const sells = sc.trades.filter((t) => t.side === 'sell');
  // Si se leyó el máximo de transacciones, lo anterior a la más vieja no se vio: el conteo es "al menos".
  const full = sc.txCount >= (sc.limit || Infinity);
  const out = { address: sc.address, lastBuyTs: sc.lastBuyTs, lastTs: sc.lastTs };
  for (const [k, secs] of Object.entries(WINDOWS)) {
    const from = now - secs;
    const b = buys.filter((t) => t.ts >= from);
    out[k] = {
      buys: b.length,
      sells: sells.filter((t) => t.ts >= from).length,
      sol: b.reduce((x, t) => x + t.sol, 0),
      usd: b.reduce((x, t) => x + t.usd, 0),
      tokens: new Set(b.map((t) => t.mint)).size,
      atLeast: full && sc.oldestTs > from,
    };
  }
  out.total = { buys: buys.length, sells: sells.length };
  // Compras de los últimos 7 días para la línea de tiempo.
  out.timeline = buys.filter((t) => t.ts >= now - WINDOWS.w7).map((t) => ({ ts: t.ts, sol: t.sol, usd: t.usd, mint: t.mint, sig: t.sig }));
  return out;
}

const vol = (w) => w.sol + w.usd / 150;

// Ordena las wallets por cuánto compran: primero compras en 24 h, luego volumen, luego 7 días, luego la más reciente.
export function compareWallets(scans, now = Math.floor(Date.now() / 1000)) {
  const wallets = Object.values(scans).map((sc) => walletStats(sc, now))
    .sort((a, b) => b.w24.buys - a.w24.buys || vol(b.w24) - vol(a.w24) || b.w7.buys - a.w7.buys || (b.lastBuyTs || 0) - (a.lastBuyTs || 0));
  const buying = wallets.filter((w) => w.w7.buys > 0);
  const principal = buying[0]?.address || null;
  const latest = [...buying].sort((a, b) => b.lastBuyTs - a.lastBuyTs)[0];
  wallets.forEach((w) => (w.role = w.address === principal ? 'principal' : w.w7.buys ? 'secundaria' : 'inactiva'));

  const lines = [];
  const ago = (ts) => { const s = now - ts; return s < 3600 ? `hace ${Math.max(1, Math.floor(s / 60))} min` : s < 86400 ? `hace ${Math.floor(s / 3600)} h` : `hace ${Math.floor(s / 86400)} d`; };
  const n = (c, w) => `${w.atLeast ? 'al menos ' : ''}${c} compra${c === 1 ? '' : 's'}`;
  const money = (w) => [w.sol ? w.sol.toFixed(2) + ' SOL' : '', w.usd ? w.usd.toFixed(0) + ' USD' : ''].filter(Boolean).join(' + ');
  const describe = (w) => {
    const parts = [];
    if (w.w24.buys) parts.push(`${n(w.w24.buys, w.w24)} en 24 h (${money(w.w24)})`);
    if (w.w7.buys > w.w24.buys) parts.push(`${n(w.w7.buys, w.w7)} en 7 d`);
    if (w.w1.buys) parts.push(`${w.w1.buys} en la última hora`);
    parts.push(`última ${ago(w.lastBuyTs)}`);
    return parts.join(', ');
  };
  let summary;
  if (!buying.length) summary = 'No ha comprado en los últimos 7 días con ninguna de sus wallets.';
  else if (buying.length === 1) summary = `Solo está comprando con ${shortA(principal)}: ${describe(buying[0])}.`;
  else {
    const two24 = buying.filter((w) => w.w24.buys).length;
    summary = two24 > 1
      ? `Está comprando con ${two24} wallets a la vez. Compra más con ${shortA(principal)}.`
      : `Compra más con ${shortA(principal)}; las otras tienen menos actividad.`;
    if (latest && latest.address !== principal) summary += ` Ojo: su compra más reciente fue con ${shortA(latest.address)} (${ago(latest.lastBuyTs)}).`;
  }
  for (const w of buying) lines.push(`${w.role === 'principal' ? 'Principal' : 'Secundaria'} ${shortA(w.address)}: ${describe(w)}.`);
  const idle = wallets.filter((w) => !w.w7.buys);
  if (idle.length) lines.push(`Sin compras en 7 d: ${idle.map((w) => `${shortA(w.address)}${w.lastBuyTs ? ` (última ${ago(w.lastBuyTs)})` : ''}`).join(', ')}.`);
  return { principal, latest: latest?.address || null, summary, lines, wallets };
}
