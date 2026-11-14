// Acceso a Solana: RPC con límite de ritmo, reintentos y caché de transacciones en disco.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');
const TX_CACHE = path.join(DATA, 'cache', 'tx');
fs.mkdirSync(TX_CACHE, { recursive: true });

loadEnv(path.join(ROOT, '.env'));
const RPC = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const GAP_MS = Number(process.env.RPC_GAP_MS || (RPC.includes('mainnet-beta') ? 260 : 105));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Contadores de llamadas (para medir dónde se va el tiempo).
export const stats = { rpc: {}, txCached: 0, txFetched: 0, exchangePages: 0, ms: {} };

let last = 0;
let queue = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Las llamadas salen escalonadas (una cada GAP_MS) para no pasar el límite del RPC,
// pero sin esperar a que termine la anterior: varias van en paralelo.
function throttled(fn) {
  const start = queue.then(async () => {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  });
  queue = start;
  return start.then(fn);
}

export async function rpc(method, params) {
  stats.rpc[method] = (stats.rpc[method] || 0) + 1;
  const t0 = Date.now();
  try { return await rpcInner(method, params); } finally { stats.ms[method] = (stats.ms[method] || 0) + Date.now() - t0; }
}
async function rpcInner(method, params) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await throttled(() =>
      fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }).catch((e) => ({ ok: false, status: 0, err: e })),
    );
    if (res.status === 429 || res.status >= 500 || res.status === 0) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const body = await res.json();
    if (body.error) {
      if (body.error.code === -32429 || /rate/i.test(body.error.message)) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error(`${method}: ${body.error.message}`);
    }
    return body.result;
  }
  throw new Error(`${method}: el RPC no respondió (límite de peticiones). Pon un RPC_URL de Helius en .env`);
}

// 'confirmed' en vez de 'finalized': ve las transacciones ~10 s antes.
export async function signatures(address, limit = 40, before) {
  const res = await rpc('getSignaturesForAddress', [address, { limit, commitment: 'confirmed', ...(before ? { before } : {}) }]);
  return res.filter((s) => !s.err);
}

// Todas las firmas desde `sinceTs` (al menos `minCount`), paginando de 1000 en 1000 hasta `cap`.
// Si la primera página ya muestra ritmo de exchange/bot, se detiene ahí (busy).
export async function signaturesSince(address, { minCount = 40, sinceTs = 0, cap = 3000, busyTxPerHour = 200 } = {}) {
  const out = [];
  let before;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [address, { limit: 1000, commitment: 'confirmed', ...(before ? { before } : {}) }]);
    if (!out.length && page.length >= 200) {
      const span = (page[0].blockTime - page[page.length - 1].blockTime) / 3600;
      if (span > 0 && page.length / span > busyTxPerHour) return { sigs: page.slice(0, minCount).filter((x) => !x.err), busy: true, complete: false };
    }
    out.push(...page);
    const oldest = page.at(-1)?.blockTime ?? 0;
    if (page.length < 1000 || (out.length >= minCount && oldest < sinceTs) || out.length >= cap) break;
    before = page.at(-1).signature;
  }
  const keep = out.filter((x, i) => i < minCount || (x.blockTime ?? 0) >= sinceTs);
  const complete = out.length < cap || (out.at(-1)?.blockTime ?? 0) < sinceTs;
  return { sigs: keep.filter((x) => !x.err), busy: false, complete };
}

// Retiros que salieron de una wallet de exchange entre fromTs y toTs (API enriquecida de Helius).
// Devuelve [{ to, asset: 'SOL'|'USD', amount, ts, sig }]. Sin llave de Helius devuelve null.
const USD_MINTS = new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCELxeqQBMd']);
const CEX_CACHE = path.join(DATA, 'cache', 'cex');
fs.mkdirSync(CEX_CACHE, { recursive: true });

async function enhancedPage(exchange, gte, lte, before) {
  const q = new URLSearchParams({ 'api-key': process.env.HELIUS_KEY, limit: '100', 'gte-time': String(gte), 'lte-time': String(lte) });
  if (before) q.set('before', before);
  for (let attempt = 0; attempt < 4; attempt++) {
    stats.exchangePages++;
    const res = await throttled(() => fetch(`https://api-mainnet.helius-rpc.com/v0/addresses/${exchange}/transactions?${q}`).catch(() => ({ ok: false, status: 0 })));
    if (res.ok) return res.json();
    await sleep(600 * 2 ** attempt);
  }
  return [];
}

function withdrawalsOf(list, exchange) {
  const out = [];
  for (const t of list) {
    if (t.transactionError) continue;
    for (const n of t.nativeTransfers || []) {
      if (n.fromUserAccount === exchange && n.toUserAccount !== exchange) out.push({ to: n.toUserAccount, asset: 'SOL', amount: n.amount / 1e9, ts: t.timestamp, sig: t.signature });
    }
    for (const n of t.tokenTransfers || []) {
      if (n.fromUserAccount === exchange && USD_MINTS.has(n.mint) && n.toUserAccount !== exchange) out.push({ to: n.toUserAccount, asset: 'USD', amount: Number(n.tokenAmount), ts: t.timestamp, sig: t.signature });
    }
  }
  return out;
}

// La ventana se parte en tramos de 30 min que se piden en paralelo (cada uno hasta `pagesPerChunk` páginas).
// Lo ya revisado se guarda en disco: una ventana pasada no cambia, así que no se vuelve a pedir.
export async function exchangeWithdrawals(exchange, fromTs, toTs, pagesPerChunk = 2) {
  if (!process.env.HELIUS_KEY) return null;
  const file = path.join(CEX_CACHE, `${exchange}_${fromTs}.json`);
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { coveredTo: fromTs, items: [] };
  const settled = Math.floor(Date.now() / 1000) - 60;
  const end = Math.min(toTs, settled);
  if (cache.coveredTo < end) {
    const CHUNK = 1800;
    const chunks = [];
    for (let a = cache.coveredTo; a < end; a += CHUNK) chunks.push([a, Math.min(end, a + CHUNK - 1)]);
    const parts = await Promise.all(chunks.map(async ([a, b]) => {
      const got = [];
      let before;
      for (let pg = 0; pg < pagesPerChunk; pg++) {
        const list = await enhancedPage(exchange, a, b, before);
        if (!Array.isArray(list) || !list.length) break;
        got.push(...withdrawalsOf(list, exchange));
        if (list.length < 100) break;
        before = list.at(-1).signature;
      }
      return got;
    }));
    const seen = new Set(cache.items.map((x) => x.sig + x.to));
    for (const w of parts.flat()) if (!seen.has(w.sig + w.to)) { seen.add(w.sig + w.to); cache.items.push(w); }
    cache.coveredTo = end;
    fs.writeFileSync(file, JSON.stringify(cache));
  }
  return cache.items.filter((x) => x.ts >= fromTs && x.ts <= toTs);
}

export async function transaction(sig) {
  const file = path.join(TX_CACHE, sig + '.json');
  if (fs.existsSync(file)) { stats.txCached++; return JSON.parse(fs.readFileSync(file, 'utf8')); }
  stats.txFetched++;
  const tx = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1, commitment: 'confirmed' }]);
  if (tx) fs.writeFileSync(file, JSON.stringify(tx));
  return tx;
}

// Monedas conocidas: si un token usa uno de estos símbolos pero con otro mint, es una imitación.
const KNOWN = {
  SOL: 'So11111111111111111111111111111111111111112', WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCELxeqQBMd',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  JTO: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
};
export function spoofOf(mint, symbol) {
  const sym = String(symbol || '').toUpperCase().replace(/^\$/, '');
  return KNOWN[sym] && KNOWN[sym] !== mint ? sym : null;
}

// Nombres de tokens vía DexScreener (hasta 30 por llamada), con caché.
const TOKENS_FILE = path.join(DATA, 'cache', 'tokens.json');
const tokenCache = fs.existsSync(TOKENS_FILE) ? JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) : {};

export async function tokenInfo(mints) {
  const missing = [...new Set(mints)].filter((m) => !tokenCache[m]);
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30);
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`);
      const pairs = res.ok ? await res.json() : [];
      for (const p of pairs) {
        const t = p.baseToken;
        if (t && chunk.includes(t.address) && !tokenCache[t.address]) {
          tokenCache[t.address] = { symbol: t.symbol, name: t.name, mcap: p.marketCap ?? p.fdv ?? null };
        }
      }
    } catch { /* sin nombre: se muestra el mint */ }
    for (const m of chunk) tokenCache[m] ??= { symbol: m.slice(0, 4) + '…', name: '', mcap: null };
  }
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokenCache));
  return Object.fromEntries(mints.map((m) => {
    const t = tokenCache[m];
    const spoof = spoofOf(m, t.symbol);
    return [m, spoof ? { ...t, spoof } : t];
  }));
}
