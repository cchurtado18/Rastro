// Búsqueda por CA: ¿quién de las personas que sigues (o de las wallets de su red) compró esta moneda?
// Para cada wallet se calcula su cuenta de ese token (ATA) y se lee solo el historial de esa cuenta:
// sale todo lo que hizo con la moneda (aunque ya haya vendido y cerrado la cuenta) sin leer miles de transacciones.
import crypto from 'node:crypto';
import { rpc, transaction, tokenInfo } from './solana.js';
import { readTrades } from './tracker.js';

// ---------- base58 ----------
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  let n = 0n;
  for (const c of s) { const i = ALPHA.indexOf(c); if (i < 0) throw new Error('base58 inválido'); n = n * 58n + BigInt(i); }
  const out = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Buffer.from(out);
}
export function b58encode(buf) {
  let n = BigInt('0x' + (Buffer.from(buf).toString('hex') || '0'));
  let s = '';
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; s = '1' + s; }
  return s;
}

// ---------- direcciones derivadas (PDA) ----------
const P = 2n ** 255n - 19n;
const mod = (a) => ((a % P) + P) % P;
const pow = (b, e) => { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; } return r; };
const D = mod(-121665n * pow(121666n, P - 2n));
// ¿Estos 32 bytes son un punto de la curva ed25519? (una PDA válida NO debe serlo)
function onCurve(bytes) {
  const b = Buffer.from(bytes); b[31] &= 0x7f;
  const y = mod(BigInt('0x' + Buffer.from(b).reverse().toString('hex')));
  const y2 = (y * y) % P;
  const x2 = mod((y2 - 1n) * pow(D * y2 + 1n, P - 2n));
  return x2 === 0n || pow(x2, (P - 1n) / 2n) === 1n;
}
export function findPda(seeds, programId) {
  const prog = b58decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const h = crypto.createHash('sha256');
    for (const s of seeds) h.update(s);
    h.update(Buffer.from([bump])); h.update(prog); h.update('ProgramDerivedAddress');
    const d = h.digest();
    if (!onCurve(d)) return b58encode(d);
  }
  throw new Error('sin PDA');
}
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const ataOf = (owner, mint, program = TOKEN) => findPda([b58decode(owner), b58decode(program), b58decode(mint)], ATA_PROGRAM);

// ---------- búsqueda ----------
// Qué es esta dirección: una moneda (mint), una wallet, u otra cosa.
export async function kindOf(address) {
  const acc = await rpc('getAccountInfo', [address, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  const v = acc?.value;
  if (!v) return { kind: 'empty' };
  if ((v.owner === TOKEN || v.owner === TOKEN22) && v.data?.parsed?.type === 'mint') return { kind: 'mint', program: v.owner, decimals: v.data.parsed.info.decimals };
  if (v.owner === '11111111111111111111111111111111') return { kind: 'wallet' };
  return { kind: 'other', owner: v.owner };
}

// Todo lo que una wallet hizo con una moneda (compras, ventas, cuánto le queda).
async function walletWithMint(w, mint, program) {
  const ata = ataOf(w.address, mint, program);
  const sigs = (await rpc('getSignaturesForAddress', [ata, { limit: 1000, commitment: 'confirmed' }])).filter((s) => !s.err);
  if (!sigs.length) return null;
  // Se leen las más recientes; si hay más, los conteos son "al menos" y la primera fecha sale del historial completo.
  const txs = (await Promise.all(sigs.slice(0, READ_MAX).map((s) => transaction(s.signature)))).filter(Boolean);
  const partial = sigs.length > READ_MAX;
  const { parsed } = await readTrades(w.address, txs);
  const trades = parsed.flatMap((p) => p.trades).filter((t) => t.mint === mint).sort((a, b) => b.ts - a.ts);
  // Lo que le queda: el saldo de la wallet en esa moneda después de su última transacción.
  const last = txs.sort((a, b) => b.blockTime - a.blockTime)[0];
  const bal = (last?.meta?.postTokenBalances || []).filter((b) => b.owner === w.address && b.mint === mint)
    .reduce((s, b) => s + Number(b.uiTokenAmount.uiAmountString || 0), 0);
  const buys = trades.filter((t) => t.side === 'buy');
  const sells = trades.filter((t) => t.side === 'sell');
  const sum = (l, k) => l.reduce((s, t) => s + (t[k] || 0), 0);
  return {
    ...w, ata, txCount: sigs.length, partial,
    buys: buys.length, sells: sells.length,
    solIn: sum(buys, 'sol'), usdIn: sum(buys, 'usd'), solOut: sum(sells, 'sol'), usdOut: sum(sells, 'usd'),
    firstTs: partial ? sigs.at(-1).blockTime : Math.min(...(trades.length ? trades : txs.map((t) => ({ ts: t.blockTime }))).map((t) => t.ts)),
    lastTs: Math.max(...(trades.length ? trades : txs.map((t) => ({ ts: t.blockTime }))).map((t) => t.ts)),
    holding: bal,
    trades: trades.slice(0, 12),
  };
}

const READ_MAX = 120;
const cache = new Map(); // mint → { at, result }
export async function searchMint(mint, wallets, { maxAgeMs = 60_000 } = {}) {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.result;
  const t0 = Date.now();
  const k = await kindOf(mint);
  if (k.kind !== 'mint') return { mint, kind: k.kind, error: k.kind === 'wallet' ? 'Es una wallet, no una moneda' : 'No es el CA de una moneda' };
  const [info, found] = await Promise.all([
    tokenInfo([mint]).catch(() => ({})),
    Promise.all(wallets.map((w) => walletWithMint(w, mint, k.program).catch(() => null))),
  ]);
  const hits = found.filter(Boolean).sort((a, b) => (b.buys ? 1 : 0) - (a.buys ? 1 : 0) || a.firstTs - b.firstTs);
  const result = { mint, kind: 'mint', program: k.program, token: info[mint] || null, searched: wallets.length, hits, ms: Date.now() - t0 };
  cache.set(mint, { at: Date.now(), result });
  return result;
}
