import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Domain constants ─────────────────────────────────────────────────────────

const BLACKLIST = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
  "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg",
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "Eo7WjKq67rjJQDd81erLuyeS2HvvhDgKQQRmgjCmGzw",
  "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bC7",
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
]);

const WSOL      = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const SOURCE_LABELS = {
  PUMP_FUN:  { label: "Pump.fun",  hue: 145 },
  RAYDIUM:   { label: "Raydium",   hue: 305 },
  ORCA:      { label: "Orca",      hue: 200 },
  METEORA:   { label: "Meteora",   hue: 75  },
  JUPITER:   { label: "Jupiter",   hue: 265 },
  MOONSHOT:  { label: "Moonshot",  hue: 60  },
  BELIEVE:   { label: "Believe",   hue: 230 },
  BOOP:      { label: "Boop",      hue: 340 },
  LIFINITY:  { label: "Lifinity",  hue: 300 },
  UNKNOWN:   { label: "Unknown",   hue: 260 },
};

const CA_HUES = [145, 230, 75, 25, 305, 180, 50, 265, 105, 345];
const hueColor  = (i, l = 0.72, c = 0.14) => `oklch(${l} ${c} ${CA_HUES[i % CA_HUES.length]})`;

const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";
const TIME_WINDOWS   = ["Todo", "1h", "3h", "6h", "12h", "24h"];
const WINDOW_SECONDS = { "1h": 3600, "3h": 10800, "6h": 21600, "12h": 43200, "24h": 86400 };
const MAX_HISTORY    = 5;

// Known Solana exchange hot wallets (incomplete by design — add as discovered)
const KNOWN_EXCHANGES = new Map([
  ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "Binance"],
  ["5tzFkiKscXHK5ZXCGbFe5YBnVvHPGVLfEnFAGY2HdV5T", "Binance"],
  ["DfiQgSvpW3Dy4gKfhtdHnWGHwFUrE8Ra5HY5GUczPHKY", "Binance"],
  ["AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2", "Binance"],
  ["H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS", "Coinbase"],
  ["GvjoFhpgfjMVkrCJAVEAcKcCLmVLjyBNMBGRvD1xkMz2", "Coinbase"],
  ["FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5", "Kraken"],
  ["5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhx5Bt6qj9c4T", "OKX"],
  ["2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S", "Bybit"],
  ["EhYXq3ANp5nAerUpbSgd7VK2RRcxK1zNuSQ755G5Dbqk", "KuCoin"],
]);

let _eid = 0;
const mkEntry = (over = {}) => ({ id: ++_eid, ca: "", windowKey: "6h", customSecs: null, minSol: 0.5, ...over });

// ─── Pump.fun bonding curve PDA derivation ────────────────────────────────────

const _B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58Decode(s) {
  let n = 0n;
  for (const c of s) { const i = _B58.indexOf(c); if (i < 0) throw new Error("bad b58"); n = n * 58n + BigInt(i); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (let i = 0; i < s.length && s[i] === "1"; i++) bytes.unshift(0);
  return new Uint8Array(bytes);
}
function b58Encode(buf) {
  let n = 0n; for (const b of buf) n = n * 256n + BigInt(b);
  let r = ""; while (n > 0n) { r = _B58[Number(n % 58n)] + r; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; r = "1" + r; }
  return r;
}

// Ed25519 on-curve check (field arithmetic mod p = 2^255 - 19)
const _P = (1n << 255n) - 19n;
const _D = (-121665n * _modInv(121666n) + _P * 2n) % _P;
function _modInv(a) { return _modPow(((a % _P) + _P) % _P, _P - 2n); }
function _modPow(b, e) {
  let r = 1n; b %= _P;
  while (e > 0n) { if (e & 1n) r = r * b % _P; e >>= 1n; b = b * b % _P; }
  return r;
}
function _isOnCurve(bytes) {
  const b = Uint8Array.from(bytes); const sign = (b[31] >> 7) & 1; b[31] &= 0x7f;
  let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i]);
  const y2 = y * y % _P;
  const u = (y2 - 1n + _P) % _P;
  const v = (_D * y2 % _P + 1n) % _P;
  const x2 = u * _modInv(v) % _P;
  if (x2 === 0n) return sign === 0;
  let x = _modPow(x2, (_P + 3n) / 8n);
  if (x * x % _P !== x2) x = x * _modPow(2n, (_P - 1n) / 4n) % _P;
  if (x * x % _P !== x2) return false;
  if ((x & 1n) !== BigInt(sign)) x = _P - x;
  return true;
}
const _PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");
async function pumpBondingCurve(mint) {
  const PUMP_PROG = b58Decode("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const mintBytes = b58Decode(mint);
  const seedLabel = new TextEncoder().encode("bonding-curve");
  for (let nonce = 255; nonce >= 0; nonce--) {
    const parts = [seedLabel, mintBytes, new Uint8Array([nonce]), PUMP_PROG, _PDA_MARKER];
    const total = parts.reduce((s, p) => s + p.length, 0);
    const buf = new Uint8Array(total); let off = 0;
    for (const p of parts) { buf.set(p, off); off += p.length; }
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    if (!_isOnCurve(hash)) return b58Encode(hash);
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shortAddr(a, l = 5, r = 5) {
  if (!a) return "";
  return a.length > l + r + 2 ? `${a.slice(0, l)}…${a.slice(-r)}` : a;
}
function fmtCustom(secs) {
  if (!secs) return "";
  if (secs % 3600 === 0) return `${secs / 3600}h`;
  if (secs % 60   === 0) return `${secs / 60}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}
function parseWindowInput(str) {
  const s = str.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/);
  if (m) return parseFloat(m[1]) * 60;
  const h = s.match(/^(\d+(?:\.\d+)?)\s*(?:h(?:r|rs|our|ours)?)?$/);
  if (h) return parseFloat(h[1]) * 3600;
  return null;
}
function vanityTag(w) {
  if (!w || w.length < 8) return null;
  if (/^(.)\1{3,}/.test(w)) return w.slice(0, 5).toUpperCase() + "+";
  const WORDS = ["DEAD","CAFE","BEEF","BABE","FACE","DOGE","MOON","BULL","BEAR","PEPE","PUMP","BONK","KOL","DEV","CHAD","ALPHA","FROG","GEM","WAGMI","APE","RICH","LUCK"];
  const up = w.toUpperCase();
  for (const word of WORDS) if (up.startsWith(word)) return word;
  return null;
}

// ─── API ──────────────────────────────────────────────────────────────────────

// Fetch token supply + decimals via Helius DAS getAsset
async function fetchTokenInfo(mint, apiKey, signal) {
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "ti", method: "getAsset", params: { id: mint } }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const ti = j?.result?.token_info;
    if (!ti) return null;
    return { supply: Number(ti.supply || 0), decimals: ti.decimals ?? 6 };
  } catch { return null; }
}

// Fetch current SOL/USD price (Jupiter, no API key needed)
async function fetchSolPriceUsd(signal) {
  try {
    const res = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", { signal });
    if (!res.ok) return null;
    const j = await res.json();
    const p = parseFloat(j?.data?.["So11111111111111111111111111111111111111112"]?.price);
    return Number.isFinite(p) ? p : null;
  } catch { return null; }
}

function fmtMcap(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

async function heliusGet(address, apiKey, before, signal) {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("type", "SWAP");
  url.searchParams.set("limit", "100");
  if (before) url.searchParams.set("before", before);
  const res = await fetch(url.toString(), { signal });
  if (res.status === 429) { const e = new Error("RATE_LIMIT"); e.code = "RATE_LIMIT"; throw e; }
  if (res.status === 401 || res.status === 403) { const e = new Error("INVALID_KEY"); e.code = "INVALID_KEY"; throw e; }
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

async function fetchAllSwaps(mint, apiKey, signal, onEvent) {
  const all = [];
  let before = null;
  let page = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let txs, retries = 0;
    while (true) {
      try {
        await sleep(1100);
        txs = await heliusGet(mint, apiKey, before, signal);
        break;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        if (e.code === "RATE_LIMIT" && retries < 6) { retries++; onEvent?.({ type: "rate_limit" }); await sleep(2000 * Math.pow(2, retries - 1)); continue; }
        throw e;
      }
    }
    if (!txs || txs.length === 0) break;
    all.push(...txs);
    page++;
    onEvent?.({ type: "page", total: all.length });
    before = txs[txs.length - 1].signature;
    if (page >= 30) break;
  }

  // mintFirstTs anchors the time window — computed BEFORE adding bonding curve txs
  const mintFirstTs = all.reduce((m, t) => Math.min(m, t.timestamp), Infinity);

  // For Pump.fun tokens: also fetch the bonding curve account to get pre-migration buyers
  if (mint.endsWith("pump")) {
    try {
      const bcAddr = await pumpBondingCurve(mint);
      if (bcAddr) {
        const seenSigs = new Set(all.map((t) => t.signature));
        let bcBefore = null, bcPage = 0;
        while (bcPage < 30) {
          if (signal?.aborted) break;
          let bcTxs, retries2 = 0;
          while (true) {
            try {
              await sleep(1100);
              bcTxs = await heliusGet(bcAddr, apiKey, bcBefore, signal);
              break;
            } catch (e) {
              if (e.name === "AbortError") break;
              if (e.code === "RATE_LIMIT" && retries2 < 6) { retries2++; onEvent?.({ type: "rate_limit" }); await sleep(2000 * Math.pow(2, retries2 - 1)); continue; }
              break;
            }
          }
          if (!bcTxs || bcTxs.length === 0) break;
          const newTxs = bcTxs.filter((t) => !seenSigs.has(t.signature));
          newTxs.forEach((t) => seenSigs.add(t.signature));
          all.push(...newTxs);
          bcPage++;
          onEvent?.({ type: "page", total: all.length });
          bcBefore = bcTxs[bcTxs.length - 1].signature;
          if (bcTxs.length < 100) break;
        }
      }
    } catch { /* bonding curve fetch is best-effort */ }
  }

  return { txs: all, mintFirstTs };
}

async function fetchWalletSwaps(wallet, apiKey, signal, oldestTs) {
  const all = [];
  let before = null;
  let page = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let txs, retries = 0;
    while (true) {
      try {
        await sleep(1100);
        txs = await heliusGet(wallet, apiKey, before, signal);
        break;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        if (e.code === "RATE_LIMIT" && retries < 6) { retries++; await sleep(2000 * Math.pow(2, retries - 1)); continue; }
        throw e;
      }
    }
    if (!txs || txs.length === 0) break;
    all.push(...txs);
    page++;
    before = txs[txs.length - 1].signature;
    const oldestInPage = Math.min(...txs.map((t) => t.timestamp));
    if (oldestInPage < oldestTs) break;
    if (page >= 5) break;
  }
  return all;
}

async function fetchWalletAllTxs(wallet, apiKey, signal) {
  // Use type=TRANSFER to skip swaps and surface funding/wallet-to-wallet transfers
  // Fetch up to 3 pages (300 transfer txs) — enough to cover several months for most wallets
  const cutoff = Math.floor(Date.now() / 1000) - 180 * 86400; // 180 days ago
  const all = [];
  let before = null;
  for (let page = 0; page < 3; page++) {
    if (signal?.aborted) return all;
    let url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${apiKey}&type=TRANSFER&limit=100`;
    if (before) url += `&before=${before}`;
    let txs;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal?.aborted) return all;
      try {
        await sleep(300);
        const res = await fetch(url, { signal });
        if (res.status === 429) { await sleep(3000); continue; }
        if (!res.ok) { txs = []; break; }
        txs = await res.json();
        break;
      } catch { txs = []; break; }
    }
    if (!txs || txs.length === 0) break;
    all.push(...txs);
    before = txs[txs.length - 1].signature;
    const oldest = Math.min(...txs.map((t) => t.timestamp || Infinity));
    if (oldest < cutoff) break; // don't go further back than 180 days
  }
  return all;
}

async function detectBundles(wallets, apiKey, signal) {
  const walletSet = new Set(wallets);
  const adj       = new Map(wallets.map((w) => [w, new Set()]));
  // funder → Set of result wallets it sent SOL to (shared-funder detection)
  const funderMap = new Map();

  const BATCH = 5;
  for (let i = 0; i < wallets.length; i += BATCH) {
    if (signal?.aborted) return null;
    const chunk   = wallets.slice(i, i + BATCH);
    const fetched = await Promise.all(chunk.map((w) => fetchWalletAllTxs(w, apiKey, signal)));

    chunk.forEach((wallet, j) => {
      for (const tx of fetched[j] || []) {
        for (const nt of tx.nativeTransfers || []) {
          const { fromUserAccount: f, toUserAccount: t, amount } = nt;
          if (!f || !t || f === t) continue;
          if (BLACKLIST.has(f) || BLACKLIST.has(t)) continue;
          if ((amount || 0) < 5_000_000) continue; // ignore dust < 0.005 SOL

          if (walletSet.has(f) && walletSet.has(t)) {
            // Direct link between two result wallets
            adj.get(f).add(t); adj.get(t).add(f);
          } else if (walletSet.has(t) && !walletSet.has(f)) {
            // External wallet f funded result wallet t
            if (!funderMap.has(f)) funderMap.set(f, new Set());
            funderMap.get(f).add(t);
          }
        }
        for (const tt of tx.tokenTransfers || []) {
          const { fromUserAccount: f, toUserAccount: t } = tt;
          if (!f || !t || f === t) continue;
          if (BLACKLIST.has(f) || BLACKLIST.has(t)) continue;
          if (walletSet.has(f) && walletSet.has(t)) {
            adj.get(f).add(t); adj.get(t).add(f);
          }
        }
      }
      void wallet; // used via chunk[j] above
    });

    if (i + BATCH < wallets.length) await sleep(1100);
  }

  // Shared-funder: same external wallet sent SOL to ≥2 result wallets → they're a bundle
  for (const recipients of funderMap.values()) {
    if (recipients.size >= 2) {
      const arr = [...recipients];
      for (let a = 0; a < arr.length; a++)
        for (let b = a + 1; b < arr.length; b++) {
          adj.get(arr[a]).add(arr[b]);
          adj.get(arr[b]).add(arr[a]);
        }
    }
  }

  // Union-Find
  const parent = new Map(wallets.map((w) => [w, w]));
  const find   = (w) => { if (parent.get(w) !== w) parent.set(w, find(parent.get(w))); return parent.get(w); };
  for (const [w, neighbors] of adj) for (const n of neighbors) if (find(w) !== find(n)) parent.set(find(w), find(n));

  const groups = new Map();
  for (const w of wallets) { const r = find(w); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(w); }

  const bundleMap = new Map();
  let bid = 1;
  for (const members of groups.values()) {
    if (members.length >= 2) { for (const w of members) bundleMap.set(w, bid); bid++; }
  }
  return bundleMap;
}

// ─── Wallet Tracer ────────────────────────────────────────────────────────────

async function traceWalletChain(startWallet, apiKey, signal, onStep, opts = {}) {
  const { mode = "sol", minUsdc = 15000, maxUsdc = 80000 } = opts;
  const MAX_HOPS = 12;
  const chain    = [];
  const visited  = new Set();
  let current    = startWallet;

  while (chain.length < MAX_HOPS) {
    if (signal?.aborted) return { chain, status: "aborted" };
    if (visited.has(current)) {
      chain.push({ wallet: current, label: "loop" });
      return { chain, status: "loop" };
    }
    visited.add(current);

    const txs = await fetchWalletAllTxs(current, apiKey, signal);

    let best = null;
    if (mode === "usdc") {
      for (const tx of txs) {
        for (const tt of tx.tokenTransfers || []) {
          if (tt.mint !== USDC_MINT) continue;
          if (tt.fromUserAccount !== current) continue;
          const { toUserAccount: t, tokenAmount } = tt;
          if (!t || BLACKLIST.has(t)) continue;
          const amt = tokenAmount || 0;
          if (amt < minUsdc || amt > maxUsdc) continue;
          if (!best || amt > best.amount) best = { to: t, amount: amt, ts: tx.timestamp };
        }
      }
    } else {
      for (const tx of txs) {
        for (const nt of tx.nativeTransfers || []) {
          const { fromUserAccount: f, toUserAccount: t, amount } = nt;
          if (f !== current) continue;
          if (!t || BLACKLIST.has(t)) continue;
          if ((amount || 0) < 1_000_000) continue;
          if (!best || amount > best.amount) best = { to: t, amount, ts: tx.timestamp };
        }
      }
    }

    if (!best) {
      chain.push({ wallet: current, label: "final" });
      return { chain, status: "final" };
    }

    const displayAmt = mode === "usdc" ? best.amount : best.amount / 1e9;
    chain.push({
      wallet: current,
      label: chain.length === 0 ? "start" : "hop",
      outAmount: displayAmt,
      outToken:  mode === "usdc" ? "USDC" : "SOL",
      outTs:     best.ts,
    });
    onStep?.([...chain]);

    const next = best.to;

    if (KNOWN_EXCHANGES.has(next)) {
      chain.push({ wallet: next, label: "exchange", exchange: KNOWN_EXCHANGES.get(next) });
      return { chain, status: "exchange" };
    }

    current = next;
  }

  chain.push({ wallet: current, label: "max_hops" });
  return { chain, status: "max_hops" };
}


function walletBoughtMint(txs, wallet, mint, windowStart, windowEnd, minSolLamports) {
  for (const tx of txs) {
    const ts = tx.timestamp;
    if (ts < windowStart || ts > windowEnd) continue;
    const received = (tx.tokenTransfers || []).some((t) => t.mint === mint && t.toUserAccount === wallet);
    if (!received) continue;
    const fp = tx.feePayer;
    const solDirect = (tx.nativeTransfers || []).filter((t) => t.fromUserAccount === fp).reduce((s, t) => s + (t.amount || 0), 0);
    const solWSOL   = (tx.tokenTransfers || []).filter((t) => t.mint === WSOL && t.fromUserAccount === fp).reduce((s, t) => s + Math.round((t.tokenAmount || 0) * 1e9), 0);
    if (solDirect + solWSOL >= minSolLamports) return true;
  }
  return false;
}

async function checkWalletsBatch(wallets, mint, windowStart, windowEnd, minSol, apiKey, signal, onProgress) {
  const BATCH = 5;
  const minSolLamports = minSol * 1e9;
  const matched = new Set();
  for (let i = 0; i < wallets.length; i += BATCH) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const chunk = wallets.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (w) => {
        const txs = await fetchWalletSwaps(w, apiKey, signal, windowStart);
        return walletBoughtMint(txs, w, mint, windowStart, windowEnd, minSolLamports);
      })
    );
    chunk.forEach((w, j) => { if (results[j]) matched.add(w); });
    onProgress?.(Math.min(i + BATCH, wallets.length));
  }
  return matched;
}

async function fetchWalletUniqueMints(wallet, apiKey, signal) {
  // Fetch 1 page of recent swaps and count unique output mints to detect volume bots
  let url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${apiKey}&type=SWAP&limit=100`;
  try {
    await sleep(300);
    const res = await fetch(url, { signal });
    if (!res.ok) return 0;
    const txs = await res.json();
    const mints = new Set();
    for (const tx of txs || []) {
      for (const t of tx.tokenTransfers || []) {
        if (t.toUserAccount === wallet && t.mint && t.mint !== WSOL) mints.add(t.mint);
      }
    }
    return mints.size;
  } catch { return 0; }
}

async function checkHighFrequencyWallets(wallets, apiKey, signal, threshold = 30) {
  // Returns Set of wallets that traded ≥threshold unique tokens recently (volume bots)
  const flagged = new Set();
  const BATCH = 5;
  for (let i = 0; i < wallets.length; i += BATCH) {
    if (signal?.aborted) break;
    const chunk = wallets.slice(i, i + BATCH);
    const counts = await Promise.all(chunk.map((w) => fetchWalletUniqueMints(w, apiKey, signal)));
    chunk.forEach((w, j) => { if (counts[j] >= threshold) flagged.add(w); });
    if (i + BATCH < wallets.length) await sleep(600);
  }
  return flagged;
}

// ─── Data processing ──────────────────────────────────────────────────────────

function extractBuyers(txs, mint, windowStart, windowEnd, minSolLamports, excludeBots) {
  // First pass: accumulate per-wallet data without filtering by minSol per tx
  const walletData = new Map();
  for (const tx of txs) {
    const ts = tx.timestamp;
    if (ts < windowStart || ts > windowEnd) continue;
    const feePayer = tx.feePayer;
    if (!feePayer || BLACKLIST.has(feePayer)) continue;
    const tokenReceived = (tx.tokenTransfers || []).filter(
      (t) => t.mint === mint && t.toUserAccount && !BLACKLIST.has(t.toUserAccount)
    );
    if (tokenReceived.length === 0) continue;

    // SOL spent by feePayer (covers most swap routers)
    const solFeePayerNative = (tx.nativeTransfers || []).filter((t) => t.fromUserAccount === feePayer).reduce((s, t) => s + (t.amount || 0), 0);
    const solFeePayerWSOL   = (tx.tokenTransfers || []).filter((t) => t.mint === WSOL && t.fromUserAccount === feePayer).reduce((s, t) => s + Math.round((t.tokenAmount || 0) * 1e9), 0);
    const solFromFeePayer   = solFeePayerNative + solFeePayerWSOL;

    for (const transfer of tokenReceived) {
      const wallet = transfer.toUserAccount;
      if (BLACKLIST.has(wallet)) continue;

      // If feePayer != buyer wallet (Jito bundles, smart-wallet relayers), also check buyer's own spend
      let solSpent = solFromFeePayer;
      if (wallet !== feePayer) {
        const solWalletNative = (tx.nativeTransfers || []).filter((t) => t.fromUserAccount === wallet).reduce((s, t) => s + (t.amount || 0), 0);
        const solWalletWSOL   = (tx.tokenTransfers || []).filter((t) => t.mint === WSOL && t.fromUserAccount === wallet).reduce((s, t) => s + Math.round((t.tokenAmount || 0) * 1e9), 0);
        solSpent = Math.max(solFromFeePayer, solWalletNative + solWalletWSOL);
      }

      if (!walletData.has(wallet)) walletData.set(wallet, { txCount: 0, timestamps: [], totalSol: 0 });
      const d = walletData.get(wallet);
      d.txCount++;
      d.timestamps.push(ts);
      d.totalSol += solSpent;
    }
  }

  // Second pass: filter by cumulative SOL spent across all buys of this token
  for (const [wallet, d] of walletData.entries()) {
    if (d.totalSol < minSolLamports) { walletData.delete(wallet); continue; }
  }

  if (excludeBots) {
    for (const [wallet, d] of walletData.entries()) {
      if (d.txCount > 5) { walletData.delete(wallet); continue; }
      const uniqueTs = new Set(d.timestamps).size;
      if (d.txCount > 2 && uniqueTs < d.txCount / 2) walletData.delete(wallet);
    }
  }
  return new Set(walletData.keys());
}

// Early KOL detection — returns wallets that bought BEFORE a volume spike,
// or the first N significant buyers, sorted by SOL spent + earliness.
function detectVolumeSpike(buyEvents, multiplier = 3) {
  // buyEvents: [{ ts, sol }] sorted ascending. Bin by 60s windows, find first window
  // where buy volume >= multiplier × avg of prior windows (min 4 prior windows for baseline).
  if (buyEvents.length < 10) return null;
  const binSize = 60;
  const t0 = buyEvents[0].ts;
  const bins = new Map();
  for (const ev of buyEvents) {
    const k = Math.floor((ev.ts - t0) / binSize);
    bins.set(k, (bins.get(k) || 0) + ev.sol);
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  let runningSum = 0, runningCount = 0;
  for (const k of keys) {
    if (runningCount >= 4) {
      const avg = runningSum / runningCount;
      if (bins.get(k) >= multiplier * avg && bins.get(k) > 0) {
        return t0 + k * binSize;
      }
    }
    runningSum += bins.get(k);
    runningCount++;
  }
  return null;
}

function extractEarlyBuyers(txs, mint, method, opts, minSolLamports, excludeBots) {
  // Aggregate per-wallet: first buy ts, total sol spent, tx count, timestamps
  const walletData = new Map();
  for (const tx of txs) {
    const ts = tx.timestamp;
    const feePayer = tx.feePayer;
    if (!feePayer || BLACKLIST.has(feePayer)) continue;
    const tokenReceived = (tx.tokenTransfers || []).filter(
      (t) => t.mint === mint && t.toUserAccount && !BLACKLIST.has(t.toUserAccount)
    );
    if (tokenReceived.length === 0) continue;
    const solFeePayerNative = (tx.nativeTransfers || []).filter((t) => t.fromUserAccount === feePayer).reduce((s, t) => s + (t.amount || 0), 0);
    const solFeePayerWSOL   = (tx.tokenTransfers || []).filter((t) => t.mint === WSOL && t.fromUserAccount === feePayer).reduce((s, t) => s + Math.round((t.tokenAmount || 0) * 1e9), 0);
    const solFromFeePayer   = solFeePayerNative + solFeePayerWSOL;
    for (const transfer of tokenReceived) {
      const wallet = transfer.toUserAccount;
      if (BLACKLIST.has(wallet)) continue;
      let solSpent = solFromFeePayer;
      if (wallet !== feePayer) {
        const solWalletNative = (tx.nativeTransfers || []).filter((t) => t.fromUserAccount === wallet).reduce((s, t) => s + (t.amount || 0), 0);
        const solWalletWSOL   = (tx.tokenTransfers || []).filter((t) => t.mint === WSOL && t.fromUserAccount === wallet).reduce((s, t) => s + Math.round((t.tokenAmount || 0) * 1e9), 0);
        solSpent = Math.max(solFromFeePayer, solWalletNative + solWalletWSOL);
      }
      const tokensReceived = transfer.tokenAmount || 0;
      if (!walletData.has(wallet)) walletData.set(wallet, { firstTs: ts, txCount: 0, timestamps: [], totalSol: 0, firstSol: 0, firstTokens: 0 });
      const d = walletData.get(wallet);
      d.txCount++;
      d.timestamps.push(ts);
      d.totalSol += solSpent;
      if (ts < d.firstTs) { d.firstTs = ts; d.firstSol = solSpent; d.firstTokens = tokensReceived; }
      else if (ts === d.firstTs) {
        if (solSpent > d.firstSol) { d.firstSol = solSpent; d.firstTokens = tokensReceived; }
      }
    }
  }
  // Filter by minSol cumulative
  for (const [w, d] of walletData.entries()) if (d.totalSol < minSolLamports) walletData.delete(w);
  // Bot filter
  if (excludeBots) {
    for (const [w, d] of walletData.entries()) {
      if (d.txCount > 5) { walletData.delete(w); continue; }
      const uniqueTs = new Set(d.timestamps).size;
      if (d.txCount > 2 && uniqueTs < d.txCount / 2) walletData.delete(w);
    }
  }

  let cutoffTs = null;
  if (method === "spike") {
    const buyEvents = [];
    for (const d of walletData.values()) buyEvents.push({ ts: d.firstTs, sol: d.firstSol / 1e9 });
    buyEvents.sort((a, b) => a.ts - b.ts);
    cutoffTs = detectVolumeSpike(buyEvents, opts.spikeMultiplier || 3);
    if (cutoffTs == null) return { wallets: [], spikeTs: null };
  }

  let entries = [...walletData.entries()].map(([wallet, d]) => ({
    wallet, firstTs: d.firstTs, totalSol: d.totalSol, txCount: d.txCount,
    firstSol: d.firstSol, firstTokens: d.firstTokens,
  }));

  if (method === "spike") {
    entries = entries.filter((e) => e.firstTs < cutoffTs);
  }
  // Sort by earliest first, tiebreak by SOL desc
  entries.sort((a, b) => a.firstTs - b.firstTs || b.totalSol - a.totalSol);

  if (method === "firstN") {
    entries = entries.slice(0, opts.n || 20);
  }
  return { wallets: entries, spikeTs: cutoffTs };
}

function detectLaunchpad(txs) {
  const counts = {};
  for (const tx of txs) {
    const src = tx.source;
    if (src && src !== "UNKNOWN") counts[src] = (counts[src] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "UNKNOWN";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function Icon({ path, size = 14, style, viewBox = "0 0 24 24" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={viewBox}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden>
      {typeof path === "string" ? <path d={path} /> : path}
    </svg>
  );
}

const IconTarget   = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>} />;
const IconPlus     = (p) => <Icon {...p} path="M12 5v14M5 12h14" />;
const IconClose    = (p) => <Icon {...p} path="M6 6l12 12M18 6l-6 6-6 6" />;
const IconCheck    = (p) => <Icon {...p} path="M4 12l5 5L20 6" />;
const IconCopy     = (p) => <Icon {...p} path={<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>} />;
const IconBookmark = (p) => <Icon {...p} path="M6 3h12v18l-6-4-6 4z" />;
const IconEdit     = (p) => <Icon {...p} path="M4 20h4L20 8l-4-4L4 16v4z" />;
const IconChevron  = (p) => <Icon {...p} path="M6 9l6 6 6-6" />;
const IconHistory  = (p) => <Icon {...p} path={<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>} />;
const IconExternal = (p) => <Icon {...p} path={<><path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>} />;
const IconDownload = (p) => <Icon {...p} path={<><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></>} />;
const IconSliders  = (p) => <Icon {...p} path={<><path d="M4 7h10M18 7h2"/><path d="M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></>} />;
const IconBot      = (p) => <Icon {...p} path={<><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 14h.01M15 14h.01"/><path d="M2 14h2M20 14h2"/></>} />;
const IconAlert    = (p) => <Icon {...p} path={<><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/></>} />;
const IconInfo     = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/></>} />;
const IconSpark    = (p) => <Icon {...p} path={<><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="M6 6l4 4M18 18l-4-4M6 18l4-4M18 6l-4 4"/></>} />;
const IconRefresh  = (p) => <Icon {...p} path={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>} />;
const IconStop     = (p) => <Icon {...p} path={<><rect x="5" y="5" width="14" height="14" rx="2"/></>} />;
const IconArrowR   = (p) => <Icon {...p} path={<><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></>} />;
const IconKeyboard = (p) => <Icon {...p} path={<><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></>} />;
const IconSearch   = (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>} />;

// ─── UI components ────────────────────────────────────────────────────────────

function HueTag({ children, hueIndex = 0, tight, style, onClick }) {
  const c = hueColor(hueIndex);
  return (
    <span onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 600,
      letterSpacing: "0.04em",
      padding: tight ? "1px 6px" : "2px 8px",
      borderRadius: 4,
      border: `1px solid color-mix(in oklch, ${c} 35%, transparent)`,
      background: `color-mix(in oklch, ${c} 14%, transparent)`,
      color: c, whiteSpace: "nowrap",
      ...(onClick ? { cursor: "pointer" } : {}),
      ...style,
    }}>{children}</span>
  );
}

function LaunchpadBadge({ source }) {
  const info = SOURCE_LABELS[source] || SOURCE_LABELS.UNKNOWN;
  const c = `oklch(0.72 0.14 ${info.hue})`;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
      padding: "1px 7px", borderRadius: 4,
      border: `1px solid color-mix(in oklch, ${c} 30%, transparent)`,
      background: `color-mix(in oklch, ${c} 12%, transparent)`,
      color: c, letterSpacing: "0.02em",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c, display: "inline-block" }} />
      {info.label}
    </span>
  );
}

function IconBtn({ title, onClick, children, active, danger, size = 26 }) {
  const [hov, setHov] = useState(false);
  return (
    <button title={title} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: size, height: size,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 5,
        border: "1px solid " + (active ? "var(--accent)" : hov ? "var(--line-2)" : "transparent"),
        background: active ? "color-mix(in oklch, var(--accent) 14%, transparent)"
                  : hov ? "var(--surface-2)" : "transparent",
        color: active ? "var(--accent-2)"
             : danger && hov ? "var(--danger)"
             : hov ? "var(--text)" : "var(--text-3)",
        transition: "all 120ms ease",
      }}>
      {children}
    </button>
  );
}

function PillBtn({ children, active, onClick, hueIndex, flex }) {
  const [hov, setHov] = useState(false);
  const c = hueIndex != null ? hueColor(hueIndex) : "var(--accent)";
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        flex: flex ? 1 : undefined, minWidth: 0,
        padding: "4px 8px",
        fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500,
        letterSpacing: "0.02em", borderRadius: 4,
        border: `1px solid ${active ? c : hov ? "var(--line-2)" : "var(--line)"}`,
        background: active ? `color-mix(in oklch, ${c} 16%, transparent)` : hov ? "var(--surface-2)" : "transparent",
        color: active ? c : hov ? "var(--text)" : "var(--text-3)",
        transition: "all 120ms ease",
      }}>
      {children}
    </button>
  );
}

function Toggle({ value, onChange, size = 18 }) {
  const w = size * 1.75;
  return (
    <button onClick={() => onChange(!value)}
      style={{
        width: w, height: size, borderRadius: size / 2, padding: 2,
        display: "flex", alignItems: "center",
        justifyContent: value ? "flex-end" : "flex-start",
        background: value ? "color-mix(in oklch, var(--accent) 80%, transparent)" : "var(--surface-2)",
        border: "1px solid " + (value ? "color-mix(in oklch, var(--accent) 50%, transparent)" : "var(--line)"),
        transition: "all 150ms ease",
      }}>
      <span style={{
        width: size - 6, height: size - 6, borderRadius: "50%",
        background: value ? "var(--accent-ink)" : "var(--text-3)",
        transition: "all 150ms ease",
      }} />
    </button>
  );
}

function SectionHead({ label, count, action, style }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "0 2px 8px",
      borderBottom: "1px solid var(--line)",
      marginBottom: 12,
      ...style,
    }}>
      <span style={{
        fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 500,
        letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)",
      }}>{label}</span>
      {count != null && (
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-4)" }}>· {count}</span>
      )}
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );
}

function Panel({ children, style, padded = true }) {
  return (
    <div style={{
      background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10,
      padding: padded ? 18 : 0, position: "relative", ...style,
    }}>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono, style, autoFocus, onKeyDown, onBlur }) {
  const [foc, setFoc] = useState(false);
  return (
    <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
      autoFocus={autoFocus} onKeyDown={onKeyDown} onBlur={onBlur}
      onFocus={() => setFoc(true)} onBlurCapture={() => setFoc(false)}
      style={{
        width: "100%", padding: "7px 10px",
        fontFamily: mono ? "var(--mono)" : "var(--sans)",
        fontSize: mono ? 11.5 : 12.5,
        background: "var(--bg)",
        border: "1px solid " + (foc ? "var(--accent)" : "var(--line)"),
        borderRadius: 5, color: "var(--text)",
        boxShadow: foc ? "0 0 0 3px color-mix(in oklch, var(--accent) 14%, transparent)" : "none",
        transition: "all 120ms ease",
        ...style,
      }}
    />
  );
}

// ─── CARow ────────────────────────────────────────────────────────────────────

function CARow({ entry, index, onChange, onRemove, canRemove, expanded, onToggle, modeLabel }) {
  const [wEditing, setWEditing] = useState(false);
  const [wInput, setWInput]     = useState("");
  const color   = hueColor(index);
  const isValid = entry.ca.length >= 32 && entry.ca.length <= 50;

  const activeLabel = entry.windowKey === "Custom" && entry.customSecs
    ? fmtCustom(entry.customSecs) : entry.windowKey;

  const applyCustom = () => {
    const secs = parseWindowInput(wInput);
    if (secs && secs > 0) onChange({ ...entry, windowKey: "Custom", customSecs: secs });
    setWEditing(false);
  };

  return (
    <div style={{
      borderBottom: "1px solid var(--line)",
      background: expanded ? "var(--bg)" : "transparent",
      transition: "background 120ms",
    }}>
      <div onClick={onToggle} style={{
        display: "grid", gridTemplateColumns: "20px 1fr auto auto auto",
        gap: 10, padding: "9px 14px", alignItems: "center", cursor: "pointer",
      }}>
        <span className="mono" style={{ fontSize: 10, color: isValid ? color : "var(--text-4)", textAlign: "right" }}>
          {modeLabel || String(index + 1).padStart(2, "0")}
        </span>
        {entry.ca ? (
          <span className="mono" style={{
            fontSize: 11.5, color: isValid ? "var(--text)" : "var(--text-3)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {shortAddr(entry.ca, 6, 6)}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-4)", fontStyle: "italic" }}>Sin dirección…</span>
        )}
        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
          {activeLabel.toUpperCase()}
        </span>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>
          ≥{entry.minSol}◎
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {canRemove && (
            <IconBtn title="Eliminar CA" danger onClick={(e) => { e.stopPropagation(); onRemove(); }} size={22}>
              <IconClose size={12} />
            </IconBtn>
          )}
          <IconBtn title={expanded ? "Colapsar" : "Expandir"} size={22}>
            <IconChevron size={12} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
          </IconBtn>
        </div>
      </div>

      <div style={{
        height: 1,
        background: isValid ? `linear-gradient(90deg, ${color} 0%, transparent 100%)` : "transparent",
        opacity: 0.7, marginTop: -1,
      }} />

      {expanded && (
        <div style={{ padding: "2px 14px 14px", animation: "fade-in 160ms ease" }}>
          <div style={{ marginTop: 6 }}>
            <TextInput mono value={entry.ca} placeholder="Contract address (base58)…"
              onChange={(v) => onChange({ ...entry, ca: v.trim() })}
              style={{ borderColor: isValid ? `color-mix(in oklch, ${color} 45%, transparent)` : undefined }}
            />
          </div>

          <div style={{ display: "flex", gap: 3, marginTop: 8, flexWrap: "wrap" }}>
            {TIME_WINDOWS.map((tw) => (
              <PillBtn key={tw} flex active={entry.windowKey === tw} hueIndex={index}
                onClick={() => { onChange({ ...entry, windowKey: tw, customSecs: null }); setWEditing(false); }}>
                {tw}
              </PillBtn>
            ))}
            {entry.windowKey === "Custom" && entry.customSecs && (
              <PillBtn active hueIndex={index} onClick={() => { setWInput(activeLabel); setWEditing(true); }}>
                {activeLabel}
              </PillBtn>
            )}
            <PillBtn active={wEditing} hueIndex={index} onClick={() => { setWEditing((v) => !v); setWInput(""); }}>
              <IconEdit size={10} />
            </PillBtn>
          </div>

          {wEditing && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <TextInput value={wInput} onChange={setWInput} placeholder="4.5h · 90m · 2"
                autoFocus onKeyDown={(e) => { if (e.key === "Enter") applyCustom(); if (e.key === "Escape") setWEditing(false); }}
                style={{ flex: 1 }}
              />
              <button onClick={applyCustom} style={{
                padding: "0 12px", borderRadius: 5, fontFamily: "var(--mono)", fontSize: 11,
                border: "1px solid var(--accent)",
                background: "color-mix(in oklch, var(--accent) 20%, transparent)",
                color: "var(--accent-2)",
              }}>OK</button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Min
            </span>
            <input type="range" min="0.1" max="5" step="0.1" value={entry.minSol}
              onChange={(e) => onChange({ ...entry, minSol: parseFloat(e.target.value) })}
              style={{ accentColor: color }}
            />
            <span className="mono" style={{ fontSize: 11, color: "var(--text-2)", minWidth: 40, textAlign: "right" }}>
              {entry.minSol.toFixed(1)}◎
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ caEntries, setCaEntries, excludeBots, setExcludeBots, phase, hunt, cancel, validCount, expandedId, setExpandedId, errorMsg, mode, setMode, earlyMethod, setEarlyMethod, earlyN, setEarlyN, earlySpikeMult, setEarlySpikeMult, viewSwitch }) {
  const addCA = () => {
    if (caEntries.length < 10) {
      const n = mkEntry();
      setCaEntries((prev) => [...prev, n]);
      setExpandedId(n.id);
    }
  };

  const canHunt  = mode === "early" ? validCount >= 1 : validCount >= 2;
  const running  = phase === "running";

  return (
    <aside style={{
      width: 340, flexShrink: 0,
      display: "flex", flexDirection: "column",
      background: "var(--bg-2)",
      borderRight: "1px solid var(--line)",
      minHeight: "100vh",
    }}>
      {/* Brand */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            width: 28, height: 28, borderRadius: 6,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "color-mix(in oklch, var(--accent) 18%, transparent)",
            border: "1px solid color-mix(in oklch, var(--accent) 45%, transparent)",
            color: "var(--accent-2)",
          }}>
            <IconTarget size={15} />
          </span>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em" }}>KOL Wallet Hunter</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "0.08em", marginTop: 2, textTransform: "uppercase" }}>
              Solana · Intersection v1
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "12px 14px 0" }}>{viewSwitch}</div>

      {/* Mode toggle */}
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ display: "flex", gap: 3, background: "var(--bg)", padding: 3, borderRadius: 7, border: "1px solid var(--line)" }}>
          {["standard", "reverse", "early"].map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: "5px 0", borderRadius: 5,
              fontFamily: "var(--mono)", fontSize: 10.5, fontWeight: 600,
              letterSpacing: "0.04em", textTransform: "uppercase",
              border: "none", transition: "all 150ms ease",
              background: mode === m ? "var(--accent)" : "transparent",
              color: mode === m ? "var(--accent-ink)" : "var(--text-4)",
            }}>
              {m === "standard" ? "Estándar" : m === "reverse" ? "Reverse" : "Early"}
            </button>
          ))}
        </div>
        {mode === "reverse" && (
          <p style={{ fontSize: 10.5, color: "var(--text-4)", margin: "8px 2px 0", lineHeight: 1.55, fontFamily: "var(--mono)" }}>
            01 = PRIMARY (lowcap). 02+ verificados por wallet del PRIMARY.
          </p>
        )}
        {mode === "early" && (
          <p style={{ fontSize: 10.5, color: "var(--text-4)", margin: "8px 2px 0", lineHeight: 1.55, fontFamily: "var(--mono)" }}>
            Solo usa el primer CA. Detecta wallets que compraron antes del spike de volumen.
          </p>
        )}
      </div>

      {/* Early KOL config */}
      {mode === "early" && (
        <div style={{ margin: "12px 16px 0", padding: "10px 13px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "var(--mono)", marginBottom: 8 }}>Método</div>
          <div style={{ display: "flex", gap: 3, background: "var(--surface-2)", padding: 3, borderRadius: 6, marginBottom: 10 }}>
            {[["spike", "Spike"], ["firstN", "Primeros N"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setEarlyMethod(k)} style={{
                flex: 1, padding: "4px 0", borderRadius: 4,
                fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", border: "none",
                background: earlyMethod === k ? "var(--accent)" : "transparent",
                color: earlyMethod === k ? "var(--accent-ink)" : "var(--text-4)",
              }}>{lbl}</button>
            ))}
          </div>
          {earlyMethod === "spike" ? (
            <>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginBottom: 4, fontFamily: "var(--mono)" }}>Multiplicador del spike: <span style={{ color: "var(--text-1)" }}>{earlySpikeMult}×</span></div>
              <div style={{ display: "flex", gap: 4 }}>
                {[2, 3, 5, 10].map((v) => (
                  <button key={v} onClick={() => setEarlySpikeMult(v)} style={{
                    flex: 1, padding: "4px 0", borderRadius: 4,
                    fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                    border: "1px solid " + (earlySpikeMult === v ? "var(--accent)" : "var(--line)"),
                    background: earlySpikeMult === v ? "color-mix(in oklch, var(--accent) 18%, transparent)" : "transparent",
                    color: earlySpikeMult === v ? "var(--accent)" : "var(--text-3)",
                  }}>{v}×</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginBottom: 4, fontFamily: "var(--mono)" }}>Top: <span style={{ color: "var(--text-1)" }}>{earlyN}</span></div>
              <div style={{ display: "flex", gap: 4 }}>
                {[5, 10, 20, 50].map((v) => (
                  <button key={v} onClick={() => setEarlyN(v)} style={{
                    flex: 1, padding: "4px 0", borderRadius: 4,
                    fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                    border: "1px solid " + (earlyN === v ? "var(--accent)" : "var(--line)"),
                    background: earlyN === v ? "color-mix(in oklch, var(--accent) 18%, transparent)" : "transparent",
                    color: earlyN === v ? "var(--accent)" : "var(--text-3)",
                  }}>{v}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* CAs header */}
      <div style={{ padding: "14px 18px 10px" }}>
        <SectionHead
          label="Contratos"
          action={
            <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em" }}>
              {String(validCount).padStart(2, "0")} / {String(caEntries.length).padStart(2, "0")}
            </span>
          }
        />
      </div>

      {/* CA list */}
      <div style={{ flex: "0 1 auto", overflowY: "auto", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", maxHeight: "calc(100vh - 460px)" }}>
        {caEntries.map((entry, i) => (
          <CARow
            key={entry.id}
            entry={entry}
            index={i}
            onChange={(updated) => setCaEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e))}
            onRemove={() => setCaEntries((prev) => prev.filter((e) => e.id !== entry.id))}
            canRemove={caEntries.length > 2}
            expanded={expandedId === entry.id}
            onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
            modeLabel={mode === "reverse" ? (i === 0 ? "P" : String(i).padStart(2, "0")) : undefined}
          />
        ))}
      </div>

      {/* Add CA */}
      {caEntries.length < 10 && (
        <button onClick={addCA} style={{
          margin: "10px 16px 0",
          padding: "7px 10px", borderRadius: 6,
          border: "1px dashed var(--line-2)",
          background: "transparent", color: "var(--text-3)",
          fontFamily: "var(--mono)", fontSize: 10.5,
          letterSpacing: "0.08em", textTransform: "uppercase",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "all 120ms",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line-2)"; e.currentTarget.style.color = "var(--text-3)"; }}>
          <IconPlus size={11} /> Agregar CA
        </button>
      )}

      {/* Bot filter */}
      <div style={{
        margin: "12px 16px 0", padding: "10px 13px", borderRadius: 8,
        background: "var(--bg)", border: "1px solid var(--line)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 5,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "var(--surface-2)", color: "var(--text-3)",
        }}>
          <IconBot size={14} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>Excluir bots</div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>Filtra sniper/bots por patrón</div>
        </div>
        <Toggle value={excludeBots} onChange={setExcludeBots} />
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{
          margin: "10px 16px 0", padding: "10px 12px", borderRadius: 6,
          border: "1px solid color-mix(in oklch, var(--danger) 40%, transparent)",
          background: "color-mix(in oklch, var(--danger) 8%, transparent)",
          color: "var(--danger)", fontSize: 11.5,
          display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <IconAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Hunt button */}
      <div style={{ padding: "14px 16px 20px", marginTop: "auto" }}>
        <button disabled={!running && !canHunt} onClick={running ? cancel : hunt}
          style={{
            width: "100%", padding: "13px 14px", borderRadius: 8,
            fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600,
            letterSpacing: "-0.005em",
            border: "1px solid " + (running
              ? "color-mix(in oklch, var(--danger) 50%, transparent)"
              : canHunt ? "color-mix(in oklch, var(--accent) 60%, transparent)"
              : "var(--line)"),
            background: running
              ? "color-mix(in oklch, var(--danger) 14%, transparent)"
              : canHunt ? "color-mix(in oklch, var(--accent) 85%, transparent)"
              : "var(--surface)",
            color: running ? "var(--danger)" : canHunt ? "var(--accent-ink)" : "var(--text-4)",
            cursor: !running && !canHunt ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 150ms ease",
          }}
          onMouseEnter={(e) => { if (canHunt && !running) e.currentTarget.style.background = "var(--accent)"; }}
          onMouseLeave={(e) => { if (canHunt && !running) e.currentTarget.style.background = "color-mix(in oklch, var(--accent) 85%, transparent)"; }}>
          {running ? <><IconStop size={13} /> Cancelar análisis</> : <>Ejecutar hunt <IconArrowR size={13} /></>}
        </button>
        <div style={{
          marginTop: 8, display: "flex", justifyContent: "space-between",
          fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)", letterSpacing: "0.04em",
        }}>
          <span><IconKeyboard size={11} style={{ verticalAlign: -2, marginRight: 4 }} />⌘ ↵ run</span>
          <span>mín 2 CAs</span>
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function StatusPhase({ phase }) {
  const map = {
    idle:    { label: "Listo",      color: "var(--text-3)", pulse: false },
    running: { label: "Buscando",   color: "var(--accent)", pulse: true  },
    done:    { label: "Completado", color: "var(--accent)", pulse: false },
    error:   { label: "Error",      color: "var(--danger)", pulse: false },
  };
  const s = map[phase] || map.idle;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 12,
      padding: "3px 9px", borderRadius: 10,
      border: "1px solid var(--line)", background: "var(--bg-2)",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: s.color,
        animation: s.pulse ? "pulse-dot 1.2s ease-in-out infinite" : "none",
      }} />
      <span className="mono" style={{ fontSize: 10, color: "var(--text-2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {s.label}
      </span>
    </span>
  );
}

function TopBar({ phase, historyCount, savedCount, watchedCount, onHistory, onSaved, onWatched, tweaksOpen, setTweaksOpen, tracerOpen, setTracerOpen }) {
  const btnStyle = {
    display: "inline-flex", alignItems: "center", gap: 7,
    padding: "6px 11px", fontFamily: "var(--sans)", fontSize: 11.5,
    borderRadius: 5, border: "1px solid var(--line)",
    background: "var(--bg-2)", color: "var(--text-2)",
  };
  const badgeStyle = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 16, height: 16, padding: "0 4px", borderRadius: 3,
    background: "var(--surface-2)", color: "var(--text-3)",
    fontFamily: "var(--mono)", fontSize: 9.5, fontWeight: 500,
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 28px", borderBottom: "1px solid var(--line)",
      background: "var(--bg)", position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Workspace /</span>
        <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}>Intersection hunt</span>
        <StatusPhase phase={phase} />
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={onSaved} style={btnStyle}>
        <IconBookmark size={12} /> Guardadas
        {savedCount > 0 && <span style={badgeStyle}>{savedCount}</span>}
      </button>
      <button onClick={onHistory} style={btnStyle}>
        <IconHistory size={12} /> Historial
        {historyCount > 0 && <span style={badgeStyle}>{historyCount}</span>}
      </button>
      <button onClick={onWatched} style={{
        ...btnStyle,
        borderColor: "var(--line)",
        color: "var(--text-2)",
      }}>
        ◉ Vigiladas
        {watchedCount > 0 && <span style={badgeStyle}>{watchedCount}</span>}
      </button>
      <button onClick={() => setTracerOpen((v) => !v)} style={{
        ...btnStyle,
        borderColor: tracerOpen ? "var(--info)" : "var(--line)",
        color:       tracerOpen ? "var(--info)"  : "var(--text-2)",
      }}>
        <IconSearch size={12} /> Rastrear
      </button>
      <button onClick={() => setTweaksOpen((v) => !v)} style={{
        ...btnStyle,
        borderColor: tweaksOpen ? "var(--accent)" : "var(--line)",
        color: tweaksOpen ? "var(--accent-2)" : "var(--text-2)",
      }}>
        <IconSliders size={12} /> Tweaks
      </button>
    </div>
  );
}

// ─── EmptyCanvas ──────────────────────────────────────────────────────────────

function EmptyCanvas({ validCount }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, minHeight: 500 }}>
      <div style={{ maxWidth: 600, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <svg width="240" height="180" viewBox="0 0 240 180" style={{ overflow: "visible" }}>
          <defs>
            {[{id:"g0",hue:145},{id:"g1",hue:230},{id:"g2",hue:75}].map(({id,hue}) => (
              <radialGradient key={id} id={id} cx="0.5" cy="0.5" r="0.6">
                <stop offset="0" stopColor={`oklch(0.72 0.14 ${hue})`} stopOpacity="0.28" />
                <stop offset="1" stopColor={`oklch(0.72 0.14 ${hue})`} stopOpacity="0.02" />
              </radialGradient>
            ))}
          </defs>
          <circle cx="90"  cy="80" r="62" fill="url(#g0)" stroke="oklch(0.72 0.14 145)" strokeOpacity="0.7" strokeWidth="1" />
          <circle cx="150" cy="80" r="62" fill="url(#g1)" stroke="oklch(0.72 0.14 230)" strokeOpacity="0.7" strokeWidth="1" />
          <circle cx="120" cy="130" r="62" fill="url(#g2)" stroke="oklch(0.72 0.14 75)"  strokeOpacity="0.7" strokeWidth="1" />
          <g fontFamily="var(--mono)" fontSize="10" fill="var(--text-3)" letterSpacing="0.1em">
            <text x="48"  y="30">CA·01</text>
            <text x="170" y="30">CA·02</text>
            <text x="98"  y="176">CA·03</text>
          </g>
          <circle cx="120" cy="95"  r="2.5" fill="var(--text)" />
          <circle cx="116" cy="99"  r="1.6" fill="var(--text-2)" />
          <circle cx="124" cy="101" r="1.6" fill="var(--text-2)" />
          <circle cx="120" cy="105" r="2"   fill="var(--accent)" />
          <line x1="120" y1="100" x2="200" y2="58" stroke="var(--line-2)" strokeDasharray="2 3" />
          <text x="204" y="60" fontFamily="var(--mono)" fontSize="9.5" fill="var(--accent-2)" letterSpacing="0.1em">INTERSECCIÓN</text>
          <text x="204" y="72" fontFamily="var(--mono)" fontSize="9"   fill="var(--text-3)">= KOL candidatos</text>
        </svg>

        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>
            Encuentra la wallet <span style={{ color: "var(--accent-2)" }}>detrás del shill</span>.
          </h2>
          <p style={{ margin: "10px auto 0", maxWidth: 440, fontSize: 13, color: "var(--text-3)", lineHeight: 1.65 }}>
            Ingresa 2 o más contratos de tokens lowcap. Identificamos las wallets que compraron
            temprano en <em style={{ fontStyle: "normal", color: "var(--text-2)" }}>todos</em> ellos — patrón típico de un KOL haciendo self-shill.
          </p>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2,
          width: "100%", maxWidth: 520,
          border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden",
          background: "var(--line)",
        }}>
          {[
            { n: "01", t: "Pega contratos", d: "De 2 a 10 tokens" },
            { n: "02", t: "Ajusta ventana", d: "Tiempo desde 1er swap" },
            { n: "03", t: "Filtra intersecciones", d: "Wallets en ≥ 50%" },
          ].map((s, i) => (
            <div key={i} style={{ background: "var(--bg-2)", padding: "14px 16px", textAlign: "left" }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "0.14em" }}>{s.n}</div>
              <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 4 }}>{s.t}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{s.d}</div>
            </div>
          ))}
        </div>

        {validCount < 2 && (
          <div style={{ fontSize: 11.5, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--warn)", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
            Necesitas al menos 2 CAs válidos
            <span className="mono" style={{ color: "var(--text-4)" }}>({validCount}/2)</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ProgressPanel ────────────────────────────────────────────────────────────

function CAStatusRow({ s, index }) {
  const color = hueColor(index);
  const statusCfg = {
    pending:  { dot: "var(--text-4)", txt: "En cola",    anim: false },
    fetching: { dot: color,           txt: "Buscando",   anim: true  },
    checking: { dot: color,           txt: "Chequeando", anim: true  },
    empty:    { dot: "var(--text-3)", txt: "Sin datos",  anim: false },
    cached:   { dot: "var(--info)",   txt: "En caché",   anim: false },
    done:     { dot: "var(--accent)", txt: "Completo",   anim: false },
  };
  const v = statusCfg[s.status] || statusCfg.pending;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "22px 1fr auto auto",
      alignItems: "center", gap: 12, padding: "8px 12px",
      background: "var(--bg)", border: "1px solid var(--line)",
      borderLeft: `2px solid ${color}`, borderRadius: 5,
    }}>
      <span className="mono" style={{ fontSize: 10, color: "var(--text-4)", textAlign: "right" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
        {shortAddr(s.ca, 6, 6)}
      </span>
      {s.launchpad && s.launchpad !== "UNKNOWN" && <LaunchpadBadge source={s.launchpad} />}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: v.dot,
          animation: v.anim ? "pulse-dot 1s infinite" : "none",
        }} />
        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.04em" }}>
          {s.status === "fetching"
            ? s.totalTxs > 0 ? `${s.totalTxs} txs` : "cargando…"
            : s.status === "checking"
            ? `${s.walletsDone || 0}/${s.walletsTotal || 0} wallets`
            : s.status === "done"
            ? `${s.walletsFound} wallets`
            : v.txt}
        </span>
      </div>
    </div>
  );
}

function ProgressPanel({ progress }) {
  const { current, total, caStatus, uniqueWallets, rateLimitHit } = progress;
  const pct = total ? (current / total) * 100 : 0;

  return (
    <Panel padded style={{ padding: "18px 20px" }}>
      <SectionHead
        label="Progreso"
        action={
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.05em" }}>
            {current}/{total} · {uniqueWallets} únicas
          </span>
        }
      />
      <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden", marginBottom: 14, position: "relative" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: "var(--accent)",
          transition: "width 400ms cubic-bezier(0.2,0.8,0.2,1)",
        }} />
        {pct > 0 && pct < 100 && (
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 6px, color-mix(in oklch, var(--accent) 30%, transparent) 6px, color-mix(in oklch, var(--accent) 30%, transparent) 12px)",
            opacity: 0.35,
            animation: "stripe 800ms linear infinite",
            pointerEvents: "none",
          }} />
        )}
      </div>

      {rateLimitHit && (
        <div style={{ fontSize: 11, color: "var(--warn)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <IconRefresh size={11} /> Rate limit — reintentando…
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {caStatus.map((s, i) => <CAStatusRow key={i} s={s} index={i} />)}
      </div>
    </Panel>
  );
}

// ─── ResultsTable ─────────────────────────────────────────────────────────────

function IntersectionBar({ totalCAs, tokens }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: totalCAs }).map((_, i) => {
        const hit = tokens.includes(i);
        const c   = hueColor(i);
        return (
          <span key={i} title={`CA #${i + 1}`} style={{
            width: 16, height: 9, borderRadius: 2,
            background: hit ? c : "transparent",
            border: `1px solid ${hit ? c : "var(--line)"}`,
            opacity: hit ? 1 : 0.45,
          }} />
        );
      })}
    </div>
  );
}

function ScoreCell({ score, isHigh }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 72, height: 3, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: isHigh ? "var(--accent)" : "var(--text-2)", transition: "width 400ms" }} />
      </div>
      <span className="mono" style={{ fontSize: 11.5, color: isHigh ? "var(--accent-2)" : "var(--text-2)", minWidth: 28, textAlign: "right" }}>
        {score}%
      </span>
    </div>
  );
}

function LinkBtn({ href, label }) {
  const [hov, setHov] = useState(false);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "3px 7px", height: 26,
        fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.05em",
        borderRadius: 4,
        border: "1px solid " + (hov ? "var(--line-2)" : "transparent"),
        background: hov ? "var(--surface-2)" : "transparent",
        color: hov ? "var(--text-2)" : "var(--text-3)",
        textDecoration: "none",
      }}>
      {label} <IconExternal size={9} />
    </a>
  );
}

function Th({ children, center, right, style }) {
  return (
    <th style={{
      padding: "10px 14px",
      fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
      color: "var(--text-4)", letterSpacing: "0.12em", textTransform: "uppercase",
      textAlign: center ? "center" : right ? "right" : "left",
      borderBottom: "1px solid var(--line)", whiteSpace: "nowrap", ...style,
    }}>{children}</th>
  );
}

function WalletRow({ rank, result, totalCAs, onCopy, isCopied, isSaved, onSave, savedEntry, onRename, bundleId, onTrace, onFollow, isHighFreq }) {
  const { wallet, matches, score, tokens, mcapAtBuy, earlyRank } = result;
  const isHigh  = matches === totalCAs;
  const tier    = isHigh ? "H" : score >= 70 ? "P" : "M";
  const tierClr = isHigh ? "var(--accent)" : score >= 70 ? "var(--info)" : "var(--warn)";
  const vtag    = vanityTag(wallet);
  const [hov, setHov] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const startEdit = () => {
    setDraft(savedEntry?.name || "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && onRename) onRename(wallet, trimmed);
    setEditing(false);
  };

  return (
    <tr onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "var(--bg)" : "transparent",
        borderBottom: "1px solid var(--line)",
        transition: "background 100ms",
      }}>
      <td style={td}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{String(rank).padStart(2, "0")}</span>
      </td>
      <td style={{ ...td, minWidth: 210 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span title={isHigh ? "Alta confianza" : score >= 70 ? "Probable" : "Monitor"} style={{
            width: 16, height: 16, borderRadius: 3,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
            color: tierClr,
            background: `color-mix(in oklch, ${tierClr} 14%, transparent)`,
            border: `1px solid color-mix(in oklch, ${tierClr} 40%, transparent)`,
            flexShrink: 0,
          }}>{tier}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {isSaved && (
              editing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
                  style={{
                    background: "var(--surface)", border: "1px solid var(--accent)",
                    borderRadius: 3, padding: "1px 5px",
                    fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: 600,
                    color: "var(--text)", width: 140, outline: "none",
                  }}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "text" }} onClick={startEdit}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", lineHeight: 1 }}>
                    {savedEntry?.name || shortAddr(wallet, 5, 5)}
                  </span>
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ opacity: hov ? 0.5 : 0, transition: "opacity 120ms", flexShrink: 0 }}>
                    <path d="M8.5 1.5a1.5 1.5 0 0 1 2.12 2.12L3.5 10.72 1 11l.28-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )
            )}
            <span className="mono" style={{ fontSize: isSaved ? 10.5 : 12, color: isSaved ? "var(--text-3)" : "var(--text)" }}>
              {shortAddr(wallet, 5, 5)}
            </span>
          </div>
          {Number.isFinite(mcapAtBuy) && mcapAtBuy > 0 && (
            <span title={`Mcap al momento de su 1ª compra · ~${fmtMcap(mcapAtBuy)}`} style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
              padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em",
              color: mcapAtBuy < 50000 ? "var(--accent-2)" : mcapAtBuy < 500000 ? "var(--info)" : "var(--text-3)",
              background: `color-mix(in oklch, ${mcapAtBuy < 50000 ? "var(--accent-2)" : mcapAtBuy < 500000 ? "var(--info)" : "var(--text-3)"} 12%, transparent)`,
              border: `1px solid color-mix(in oklch, ${mcapAtBuy < 50000 ? "var(--accent-2)" : mcapAtBuy < 500000 ? "var(--info)" : "var(--text-3)"} 35%, transparent)`,
              whiteSpace: "nowrap",
            }}>{fmtMcap(mcapAtBuy)}</span>
          )}
          {earlyRank != null && (
            <span title={`Compró en posición #${earlyRank} (early)`} style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
              padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em",
              color: "var(--text-3)", background: "var(--surface-2)",
              border: "1px solid var(--line)", whiteSpace: "nowrap",
            }}>#{earlyRank}</span>
          )}
          {vtag && <HueTag tight hueIndex={2}>{vtag}</HueTag>}
          {isHighFreq && (
            <span title="Compra 30+ tokens diferentes — posible volume bot" style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
              padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em",
              color: "oklch(0.72 0.14 25)",
              background: "color-mix(in oklch, oklch(0.72 0.14 25) 12%, transparent)",
              border: "1px solid color-mix(in oklch, oklch(0.72 0.14 25) 35%, transparent)",
              whiteSpace: "nowrap",
            }}>VOL BOT</span>
          )}
          {bundleId != null && (
            <span style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
              padding: "1px 5px", borderRadius: 3, letterSpacing: "0.04em",
              color: hueColor(bundleId - 1),
              background: `color-mix(in oklch, ${hueColor(bundleId - 1)} 12%, transparent)`,
              border: `1px solid color-mix(in oklch, ${hueColor(bundleId - 1)} 35%, transparent)`,
              whiteSpace: "nowrap",
            }}>BUNDLE #{bundleId}</span>
          )}
        </div>
      </td>
      <td style={{ ...td, textAlign: "center" }}>
        <span className="mono" style={{ fontSize: 12.5, color: isHigh ? "var(--accent-2)" : "var(--text)", fontWeight: 500 }}>
          {matches}<span style={{ color: "var(--text-4)" }}>/{totalCAs}</span>
        </span>
      </td>
      <td style={td}>
        <IntersectionBar totalCAs={totalCAs} tokens={tokens} />
      </td>
      <td style={{ ...td, textAlign: "right", minWidth: 130 }}>
        <ScoreCell score={score} isHigh={isHigh} />
      </td>
      <td style={{ ...td, textAlign: "right", minWidth: 176 }}>
        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end", opacity: hov ? 1 : 0.5, transition: "opacity 120ms" }}>
          <IconBtn title="Seguir a esta wallet (mapa de flujo y compras)" onClick={() => onFollow?.(wallet, savedEntry?.name)}>
            <IconFollow size={12} />
          </IconBtn>
          <IconBtn title="Rastrear wallet" onClick={() => onTrace?.(wallet)}>
            <IconSearch size={12} />
          </IconBtn>
          <IconBtn title={isCopied ? "¡Copiado!" : "Copiar"} onClick={() => onCopy(wallet)} active={isCopied}>
            {isCopied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          </IconBtn>
          <IconBtn title={isSaved ? "Ya guardada" : "Guardar"} onClick={() => !isSaved && onSave(wallet)} active={isSaved}>
            <IconBookmark size={12} />
          </IconBtn>
          <LinkBtn href={`https://gmgn.ai/sol/address/${wallet}`} label="GMGN" />
          <LinkBtn href={`https://solscan.io/account/${wallet}`} label="SC" />
          <LinkBtn href={`https://birdeye.so/profile/${wallet}?chain=solana`} label="BE" />
        </div>
      </td>
    </tr>
  );
}

const td = { padding: "11px 14px", verticalAlign: "middle" };

function ResultsTable({ results, totalCAs, onCopy, copiedWallet, savedWallets, onSave, onRename, onExport, onAddCA, bundles, bundlePhase, onTrace, onFollow, highFreqWallets }) {
  const highest = results.filter((r) => r.matches === totalCAs).length;
  const highFreqCount = results.filter((r) => highFreqWallets?.has(r.wallet)).length;
  return (
    <Panel padded style={{ padding: 0, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 20px", borderBottom: "1px solid var(--line)",
      }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Resultados</span>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
          · {results.length} candidatas · {highest} alta confianza
        </span>
        {bundlePhase === "running" && (
          <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>· enlazando…</span>
        )}
        {bundlePhase === "done" && bundles?.size > 0 && (() => {
          const count = new Set(bundles.values()).size;
          return <span className="mono" style={{ fontSize: 10, color: "var(--warn)" }}>· {count} bundle{count > 1 ? "s" : ""} detectado{count > 1 ? "s" : ""}</span>;
        })()}
        {highFreqCount > 0 && (
          <span className="mono" style={{ fontSize: 10, color: "oklch(0.72 0.14 25)" }}>· {highFreqCount} vol bot{highFreqCount > 1 ? "s" : ""}</span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={onAddCA} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
          fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.04em",
          border: "1px solid var(--line)", borderRadius: 5,
          background: "var(--bg)", color: "var(--text-3)",
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--text-3)"; }}>
          <IconPlus size={10} /> CA
        </button>
        <button onClick={onExport} style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
          fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.04em",
          border: "1px solid var(--line)", borderRadius: 5,
          background: "var(--bg)", color: "var(--text-2)",
        }}>
          <IconDownload size={11} /> CSV
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "var(--bg)" }}>
              <Th>#</Th><Th>Wallet</Th><Th center>Matches</Th><Th>Intersección</Th><Th right>Score</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <WalletRow
                key={r.wallet} rank={i + 1} result={r} totalCAs={totalCAs}
                onCopy={onCopy} isCopied={copiedWallet === r.wallet}
                isSaved={savedWallets.some((w) => w.address === r.wallet)} onSave={onSave}
                savedEntry={savedWallets.find((w) => w.address === r.wallet)} onRename={onRename}
                bundleId={bundles?.get(r.wallet) ?? null}
                isHighFreq={highFreqWallets?.has(r.wallet) ?? false}
                onTrace={onTrace} onFollow={onFollow}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─── SuggestionsPanel ─────────────────────────────────────────────────────────

function SuggestionsPanel({ suggestions }) {
  return (
    <Panel padded>
      <SectionHead label="Sugerencias" count={suggestions.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {suggestions.map((s, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 12,
            padding: "11px 14px", background: "var(--bg)",
            border: "1px solid var(--line)", borderRadius: 6, alignItems: "flex-start",
          }}>
            <span style={{
              width: 22, height: 22, flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4, background: "var(--surface-2)",
              color: s.tone === "warn" ? "var(--warn)" : s.tone === "info" ? "var(--info)" : "var(--accent-2)",
            }}>
              {s.tone === "warn" ? <IconAlert size={12} /> : s.tone === "info" ? <IconInfo size={12} /> : <IconSpark size={12} />}
            </span>
            <span style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55 }}>{s.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── SavedPanel ───────────────────────────────────────────────────────────────

function SavedRow({ entry, onCopy, isCopied, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(entry.name);
  const vtag = vanityTag(entry.address);

  const commit = () => {
    const t = draft.trim();
    if (t) onRename(entry.address, t); else setDraft(entry.name);
    setEditing(false);
  };

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
      padding: "9px 12px", background: "var(--bg)",
      border: "1px solid var(--line)", borderRadius: 6, alignItems: "center",
    }}>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <TextInput value={draft} onChange={setDraft} autoFocus
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(entry.name); setEditing(false); } }}
            style={{ padding: "4px 8px" }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span onClick={() => { setDraft(entry.name); setEditing(true); }}
              style={{ fontSize: 12.5, fontWeight: 500, cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.name}
            </span>
            <IconBtn title="Renombrar" onClick={() => { setDraft(entry.name); setEditing(true); }} size={20}>
              <IconEdit size={10} />
            </IconBtn>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{shortAddr(entry.address, 6, 6)}</span>
          {vtag && <HueTag tight hueIndex={2} style={{ fontSize: 9 }}>{vtag}</HueTag>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        <IconBtn title="Copiar" onClick={() => onCopy(entry.address)} active={isCopied}>
          {isCopied ? <IconCheck size={11} /> : <IconCopy size={11} />}
        </IconBtn>
        <LinkBtn href={`https://gmgn.ai/sol/address/${entry.address}`} label="GMGN" />
        <LinkBtn href={`https://solscan.io/account/${entry.address}`} label="SC" />
        <IconBtn title="Eliminar" danger onClick={() => onDelete(entry.address)}>
          <IconClose size={11} />
        </IconBtn>
      </div>
    </div>
  );
}

function SavedPanel({ saved, onCopy, copiedWallet, onDelete, onRename, onClear }) {
  if (saved.length === 0) return null;
  return (
    <Panel padded>
      <SectionHead
        label="Wallets guardadas" count={saved.length}
        action={
          <button onClick={onClear} style={{
            fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--text-4)", padding: "3px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "transparent",
          }}>Limpiar</button>
        }
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {saved.map((e) => (
          <SavedRow key={e.address} entry={e} onCopy={onCopy}
            isCopied={copiedWallet === e.address} onDelete={onDelete} onRename={onRename} />
        ))}
      </div>
    </Panel>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({ history, onLoad, onClose }) {
  return (
    <Panel padded>
      <SectionHead
        label="Historial" count={history.length}
        action={<IconBtn title="Cerrar" onClick={onClose} size={22}><IconClose size={11} /></IconBtn>}
      />
      {history.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-4)", textAlign: "center", padding: "20px 0", margin: 0 }}>Sin historial aún</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {history.map((entry) => (
            <div key={entry.id} onClick={() => onLoad(entry)}
              style={{
                padding: "10px 12px", borderRadius: 7, cursor: "pointer",
                border: "1px solid var(--line)", background: "var(--bg)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "border-color 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}>
              <div>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--accent-2)" }}>
                  {(entry.caEntries || entry.cas || []).length} CAs
                </span>
                <span style={{ margin: "0 8px", color: "var(--text-4)", fontSize: 11 }}>·</span>
                <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                  {entry.results.length} wallets
                </span>
              </div>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                {new Date(entry.ts).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── WatchedPanel ─────────────────────────────────────────────────────────────

function WatchedPanel({ watched, onRemove, onClose, onTrace, onRefresh, scanning }) {
  return (
    <Panel padded style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Wallets Vigiladas</span>
        {watched.length > 0 && (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--info)", background: "color-mix(in oklch, var(--info) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--info) 35%, transparent)", borderRadius: 3, padding: "1px 6px" }}>{watched.length}</span>
        )}
        {scanning && <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>· escaneando…</span>}
        <div style={{ flex: 1 }} />
        {watched.length > 0 && (
          <button
            disabled={scanning}
            onClick={onRefresh}
            title="Escanear ahora"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 4, cursor: scanning ? "not-allowed" : "pointer",
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
              border: `1px solid ${scanning ? "var(--line)" : "color-mix(in oklch, var(--info) 40%, transparent)"}`,
              background: scanning ? "transparent" : "color-mix(in oklch, var(--info) 10%, transparent)",
              color: scanning ? "var(--text-4)" : "var(--info)",
            }}>
            ↻ Refresh
          </button>
        )}
        <IconBtn title="Cerrar" size={22} onClick={onClose}><IconClose size={11} /></IconBtn>
      </div>

      {watched.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-4)" }}>
          Sin wallets vigiladas — usa "Vigilar" en el rastreador
        </div>
      ) : (
        <div>
          {watched.map((w) => (
            <div key={w.address} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 20px",
              borderBottom: "1px solid var(--line)",
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: "var(--info)", boxShadow: "0 0 0 3px color-mix(in oklch, var(--info) 20%, transparent)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text)" }}>{shortAddr(w.address, 6, 6)}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-4)", border: "1px solid var(--line)", borderRadius: 3, padding: "1px 5px" }}>{w.mode === "usdc" ? "USDC" : "SOL"}</span>
                  {w.mode === "usdc" && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-4)" }}>{w.minUsdc}–{w.maxUsdc}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <LinkBtn href={`https://gmgn.ai/sol/address/${w.address}`} label="GMGN" />
                  <LinkBtn href={`https://solscan.io/account/${w.address}`} label="SC" />
                </div>
              </div>
              <button
                title="Rastrear wallet"
                onClick={() => onTrace?.(w.address)}
                style={{ padding: "4px 8px", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", border: "1px solid var(--line)", background: "transparent", color: "var(--text-3)" }}>
                <IconSearch size={11} />
              </button>
              <button
                title="Dejar de vigilar"
                onClick={() => onRemove(w.address)}
                style={{ padding: "4px 8px", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 10, cursor: "pointer", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", background: "transparent", color: "var(--danger)" }}>
                <IconClose size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ─── WatchAlertModal ──────────────────────────────────────────────────────────

function WatchAlertModal({ alerts, scanning, onConfirm, onDismiss }) {
  const anyMoved = alerts.some((a) => a.moved);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--bg-2)", border: "1px solid var(--line-2)", borderRadius: 12,
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)", width: 480, maxWidth: "calc(100vw - 40px)",
        maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column",
        animation: "fade-in 200ms ease",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Vigilancia de Wallets
          </span>
          {scanning && <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>· escaneando…</span>}
          <div style={{ flex: 1 }} />
          {anyMoved
            ? <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600, color: "var(--warn)", background: "color-mix(in oklch, var(--warn) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--warn) 35%, transparent)", borderRadius: 4, padding: "2px 8px" }}>MOVIMIENTO DETECTADO</span>
            : !scanning && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--accent)", background: "color-mix(in oklch, var(--accent) 10%, transparent)", border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)", borderRadius: 4, padding: "2px 8px" }}>TODO ACTUAL</span>
          }
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {alerts.map((a) => (
            <div key={a.watched.address} style={{
              padding: "12px 20px", borderBottom: "1px solid var(--line)",
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              {/* Status dot */}
              <div style={{
                marginTop: 3, width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: a.moved ? "var(--warn)" : "var(--accent)",
                boxShadow: `0 0 0 3px color-mix(in oklch, ${a.moved ? "var(--warn)" : "var(--accent)"} 20%, transparent)`,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{shortAddr(a.watched.address, 6, 6)}</span>
                  {a.watched.label && a.watched.label !== shortAddr(a.watched.address, 6, 6) && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)", border: "1px solid var(--line)", borderRadius: 3, padding: "1px 5px" }}>{a.watched.label}</span>
                  )}
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-4)", border: "1px solid var(--line)", borderRadius: 3, padding: "1px 5px" }}>{a.watched.mode === "usdc" ? "USDC" : "SOL"}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <LinkBtn href={`https://gmgn.ai/sol/address/${a.watched.address}`} label="GMGN" />
                    <LinkBtn href={`https://solscan.io/account/${a.watched.address}`} label="SC" />
                  </div>
                </div>

                {a.moved && a.chain && (() => {
                  const hops = a.chain.slice(1); // skip origin (start), show where it went
                  const finalHop = a.chain.at(-1);
                  const canConfirm = finalHop?.label === "final";
                  return (
                    <div style={{ marginTop: 8 }}>
                      {hops.map((hop, i) => {
                        const isLast = i === hops.length - 1;
                        const labelColor = hop.label === "exchange" ? "var(--warn)" : hop.label === "final" ? "var(--accent-2)" : "var(--text-2)";
                        return (
                          <div key={`${hop.wallet}-${i}`}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)" }}>
                                {i === 0 ? "↓" : "↓↓"}
                              </span>
                              <span className="mono" style={{ fontSize: 11.5, color: labelColor }}>{shortAddr(hop.wallet, 6, 6)}</span>
                              {hop.label === "exchange" && (
                                <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, color: "var(--warn)", background: "color-mix(in oklch, var(--warn) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--warn) 35%, transparent)" }}>{hop.exchange}</span>
                              )}
                              {hop.label === "final" && (
                                <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, color: "var(--accent)", background: "color-mix(in oklch, var(--accent) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--accent) 35%, transparent)" }}>WALLET ACTUAL</span>
                              )}
                              <div style={{ display: "flex", gap: 4 }}>
                                <LinkBtn href={`https://gmgn.ai/sol/address/${hop.wallet}`} label="GMGN" />
                                <LinkBtn href={`https://solscan.io/account/${hop.wallet}`} label="SC" />
                              </div>
                              {isLast && canConfirm && (
                                <button
                                  onClick={() => onConfirm(a.watched.address, finalHop.wallet, a.watched)}
                                  title="Confirmar — actualiza la wallet vigilada a esta"
                                  style={{
                                    display: "flex", alignItems: "center", gap: 5,
                                    padding: "2px 9px", borderRadius: 4, cursor: "pointer",
                                    fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                                    background: "color-mix(in oklch, var(--accent) 15%, transparent)",
                                    border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
                                    color: "var(--accent)",
                                  }}>
                                  ✓ Confirmar
                                </button>
                              )}
                            </div>
                            {hop.outAmount != null && !isLast && (
                              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)", paddingLeft: 18, paddingTop: 2, paddingBottom: 2 }}>
                                {hop.outAmount.toLocaleString("en-US", { maximumFractionDigits: 3 })} {hop.outToken}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {!a.moved && (
                  <div style={{ marginTop: 4, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)" }}>sin movimiento</div>
                )}
              </div>
            </div>
          ))}
          {alerts.length === 0 && scanning && (
            <div style={{ padding: "32px 20px", textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-4)" }}>Escaneando wallets vigiladas…</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onDismiss}
            style={{
              padding: "6px 18px", borderRadius: 5, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600,
              background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text-2)", cursor: "pointer",
            }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TracerPanel ──────────────────────────────────────────────────────────────

function TracerPanel({ initialWallet, onClose, apiKey, onWatch, watchedWallets }) {
  const [input,       setInput]       = useState(initialWallet || "");
  const [chain,       setChain]       = useState([]);
  const [phase,       setPhase]       = useState("idle");
  const [status,      setStatus]      = useState(null);
  const [alphaSeeker, setAlphaSeeker] = useState(false);
  const [minUsdc,     setMinUsdc]     = useState("2000");
  const [maxUsdc,     setMaxUsdc]     = useState("80000");
  const abortRef = useRef(null);

  useEffect(() => {
    if (initialWallet) { setInput(initialWallet); setChain([]); setStatus(null); setPhase("idle"); }
  }, [initialWallet]);

  const fmtAmount = (amount, token) => {
    if (token === "USDC") return `${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
    return amount >= 0.01 ? `${amount.toFixed(3)} SOL` : `${(amount * 1000).toFixed(2)}m SOL`;
  };
  const fmtTs  = (ts) => {
    if (!ts) return "";
    const d = Math.floor(Date.now() / 1000) - ts;
    if (d < 3600)      return `${Math.floor(d / 60)}m atrás`;
    if (d < 86400)     return `${Math.floor(d / 3600)}h atrás`;
    if (d < 86400 * 30) return `${Math.floor(d / 86400)}d atrás`;
    return new Date(ts * 1000).toLocaleDateString("es", { day: "numeric", month: "short" });
  };

  const dotColor = (label) => ({
    start: "var(--accent)", hop: "var(--line-2)",
    final: "var(--accent)", exchange: "var(--warn)",
    loop: "var(--danger)", max_hops: "var(--warn)",
  }[label] || "var(--text-4)");

  const token = alphaSeeker ? "USDC" : "SOL";
  const statusMsg = {
    final:    { text: `Wallet final encontrada — sin transferencias ${token} salientes detectadas`, color: "var(--accent)" },
    exchange: { text: `Rastro perdido — el ${token} fue a un exchange`, color: "var(--warn)" },
    loop:     { text: "Bucle detectado — la wallet envió a una ya visitada", color: "var(--danger)" },
    max_hops: { text: "Límite de 12 saltos alcanzado — rastro demasiado largo", color: "var(--warn)" },
    aborted:  { text: "Rastreo cancelado", color: "var(--text-3)" },
  };


  const startTrace = async (wallet) => {
    if (!wallet || wallet.length < 32) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setChain([]); setStatus(null); setPhase("running");

    const opts = alphaSeeker
      ? { mode: "usdc", minUsdc: parseFloat(minUsdc) || 0, maxUsdc: parseFloat(maxUsdc) || Infinity }
      : { mode: "sol" };
    const result = await traceWalletChain(wallet, apiKey, ctrl.signal, (partial) => setChain([...partial]), opts);
    if (!ctrl.signal.aborted) { setChain(result.chain); setStatus(result.status); }
    setPhase("done");
  };

  const isRunning = phase === "running";
  const canTrace  = !isRunning && input.trim().length >= 32;

  return (
    <Panel padded style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase" }}>Rastreador de Wallets</span>
        {isRunning && <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>· buscando…</span>}
        <div style={{ flex: 1 }} />
        {isRunning && (
          <button onClick={() => abortRef.current?.abort()} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--danger)", background: "none", border: "none", cursor: "pointer" }}>Cancelar</button>
        )}
        <IconBtn title="Cerrar" size={22} onClick={() => { abortRef.current?.abort(); onClose(); }}>
          <IconClose size={11} />
        </IconBtn>
      </div>

      {/* Input */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canTrace && startTrace(input.trim())}
            placeholder="Wallet inicial para rastrear…"
            style={{
              flex: 1, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 5,
              padding: "7px 11px", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--text)", outline: "none",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
            onBlur={(e)  => { e.target.style.borderColor = "var(--line)"; }}
          />
          <button
            disabled={!canTrace}
            onClick={() => startTrace(input.trim())}
            style={{
              padding: "7px 16px", borderRadius: 5, fontFamily: "var(--mono)",
              fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", border: "none",
              background: canTrace ? "var(--accent)" : "var(--surface-2)",
              color: canTrace ? "var(--accent-ink)" : "var(--text-4)",
              cursor: canTrace ? "pointer" : "not-allowed",
            }}>
            {isRunning ? "Rastreando…" : "Rastrear"}
          </button>
        </div>

        {/* Alpha Seeker toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setAlphaSeeker((v) => !v)}
            style={{
              padding: "3px 10px", borderRadius: 4, fontFamily: "var(--mono)", fontSize: 10,
              fontWeight: 600, letterSpacing: "0.06em", cursor: "pointer",
              border: `1px solid ${alphaSeeker ? "var(--info)" : "var(--line)"}`,
              background: alphaSeeker ? "color-mix(in oklch, var(--info) 12%, transparent)" : "transparent",
              color: alphaSeeker ? "var(--info)" : "var(--text-3)",
            }}>
            α ALPHA SEEKER
          </button>
          {alphaSeeker && (
            <>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>USDC</span>
              <input
                type="number"
                value={minUsdc}
                onChange={(e) => setMinUsdc(e.target.value)}
                placeholder="Min"
                style={{
                  width: 72, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4,
                  padding: "3px 7px", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text)", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--info)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--line)"; }}
              />
              <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>→</span>
              <input
                type="number"
                value={maxUsdc}
                onChange={(e) => setMaxUsdc(e.target.value)}
                placeholder="Max"
                style={{
                  width: 72, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 4,
                  padding: "3px 7px", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text)", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--info)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--line)"; }}
              />
            </>
          )}
        </div>
      </div>

      {/* Chain */}
      {chain.length === 0 && phase !== "running" && (
        <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-4)" }}>
          Pega una wallet y sigue el rastro de SOL hasta el destino final
        </div>
      )}

      {chain.length > 0 && (
        <div style={{ padding: "20px 24px" }}>
          {chain.map((hop, i) => (
            <div key={`${hop.wallet}-${i}`}>
              {/* Node */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: dotColor(hop.label),
                  boxShadow: (hop.label === "final" || hop.label === "start") ? `0 0 0 3px color-mix(in oklch, ${dotColor(hop.label)} 22%, transparent)` : "none",
                }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" }}>
                  <span className="mono" style={{
                    fontSize: 12,
                    color: hop.label === "final" ? "var(--accent-2)" : hop.label === "exchange" ? "var(--warn)" : hop.label === "loop" || hop.label === "max_hops" ? "var(--text-4)" : "var(--text-2)",
                  }}>{shortAddr(hop.wallet, 6, 6)}</span>

                  {hop.label === "start" && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-4)", border: "1px solid var(--line)", borderRadius: 3, padding: "1px 5px" }}>INICIO</span>
                  )}
                  {hop.label === "final" && (
                    <>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, color: "var(--accent)", background: "color-mix(in oklch, var(--accent) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--accent) 35%, transparent)" }}>WALLET ACTUAL</span>
                      {onWatch && (() => {
                        const alreadyWatched = (watchedWallets || []).some((w) => w.address === hop.wallet);
                        return (
                          <button
                            disabled={alreadyWatched}
                            onClick={() => onWatch(hop.wallet, { mode: alphaSeeker ? "usdc" : "sol", minUsdc: parseFloat(minUsdc) || 0, maxUsdc: parseFloat(maxUsdc) || Infinity })}
                            style={{
                              padding: "1px 7px", borderRadius: 3, fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
                              cursor: alreadyWatched ? "default" : "pointer",
                              border: `1px solid ${alreadyWatched ? "var(--line)" : "color-mix(in oklch, var(--info) 40%, transparent)"}`,
                              background: alreadyWatched ? "transparent" : "color-mix(in oklch, var(--info) 12%, transparent)",
                              color: alreadyWatched ? "var(--text-4)" : "var(--info)",
                            }}>
                            {alreadyWatched ? "VIGILANDO" : "Vigilar"}
                          </button>
                        );
                      })()}
                    </>
                  )}
                  {hop.label === "exchange" && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, color: "var(--warn)", background: "color-mix(in oklch, var(--warn) 12%, transparent)", border: "1px solid color-mix(in oklch, var(--warn) 35%, transparent)" }}>{hop.exchange}</span>
                  )}
                  {(hop.label === "final" || hop.label === "start" || hop.label === "hop") && (
                    <div style={{ display: "flex", gap: 4, marginLeft: 2 }}>
                      <LinkBtn href={`https://gmgn.ai/sol/address/${hop.wallet}`} label="GMGN" />
                      <LinkBtn href={`https://solscan.io/account/${hop.wallet}`} label="SC" />
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow line to next node */}
              {hop.outAmount != null && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 10, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: 1, height: 30, background: "var(--line)" }} />
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-4)", paddingTop: 7 }}>
                    ↓ {fmtAmount(hop.outAmount, hop.outToken)}{hop.outTs ? ` · ${fmtTs(hop.outTs)}` : ""}
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Status message */}
          {status && statusMsg[status] && (
            <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 5, background: "var(--bg)", border: `1px solid color-mix(in oklch, ${statusMsg[status].color} 30%, transparent)` }}>
              <span className="mono" style={{ fontSize: 10.5, color: statusMsg[status].color }}>{statusMsg[status].text}</span>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─── Follow · chain analysis ──────────────────────────────────────────────────
// "Seguir": follow a person from one root wallet, map where their SOL went, and
// rank the wallets that look like their own (next trading wallet, sister wallets).

const USDT_MINT        = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const FOLLOW_STABLES   = new Set([USDC_MINT, USDT_MINT]);
const FOLLOW_DAY       = 86400;
const FOLLOW_DUST_SOL  = 0.05;  // below this a transfer is a fee, tip, rebate or spam
const FOLLOW_EDGE_SOL  = 0.5;   // minimum moved between two wallets to draw and follow the link
const FOLLOW_TRADE_SOL = 0.005; // below this a balance change is rent or fees, not a trade
const FOLLOW_GAP_MS    = 450;   // one Helius request per gap, shared by every Follow call
const FOLLOW_CAPS      = { funders: 5, l1: 6, l2: 10, l3: 8, perParent: 4, hubMatches: 3, sisters: 4 };

let _followLast  = 0;
let _followQueue = Promise.resolve();
function followSlot(signal) {
  const run = _followQueue.then(async () => {
    if (signal?.aborted) return;
    const wait = _followLast + FOLLOW_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    _followLast = Date.now();
  });
  _followQueue = run;
  return run;
}

function isSolAddress(a) {
  if (!a || a.length < 32 || a.length > 44) return false;
  try { return b58Decode(a).length === 32; } catch { return false; }
}

// One page of a wallet's history with NO type filter. Helius labels most bot-routed
// trades as TRANSFER, so trades are recognised from balance changes instead (followAnalyze).
async function followFetchPage(address, apiKey, signal, before) {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=100${before ? `&before=${before}` : ""}`;
  for (let attempt = 0; ; attempt++) {
    await followSlot(signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(url, { signal });
    if (res.status === 429 && attempt < 4) { await sleep(1500 * 2 ** attempt); continue; }
    if (res.status === 429) { const e = new Error("RATE_LIMIT"); e.code = "RATE_LIMIT"; throw e; }
    if (res.status === 401 || res.status === 403) { const e = new Error("INVALID_KEY"); e.code = "INVALID_KEY"; throw e; }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const j = await res.json();
    return Array.isArray(j) ? j : [];
  }
}

async function followFetchTxs(address, apiKey, signal, { maxPages = 1, untilTs = 0, before = null } = {}) {
  const txs = [];
  let cursor = before, complete = false;
  for (let p = 0; p < maxPages; p++) {
    const page = await followFetchPage(address, apiKey, signal, cursor);
    txs.push(...page);
    if (page.length < 100) { complete = true; break; }   // reached the wallet's first transaction
    cursor = page[page.length - 1].signature;
    if (untilTs && page[page.length - 1].timestamp < untilTs) break;
  }
  return { txs, complete, cursor };
}

// Symbols for a list of mints in one DAS call
async function followFetchTokenMeta(mints, apiKey, signal) {
  const out = {};
  for (let i = 0; i < mints.length; i += 100) {
    try {
      await followSlot(signal);
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
        method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "fm", method: "getAssetBatch", params: { ids: mints.slice(i, i + 100) } }),
      });
      if (!res.ok) continue;
      const j = await res.json();
      for (const a of j?.result || []) {
        if (!a?.id) continue;
        const symbol = (a.content?.metadata?.symbol || a.token_info?.symbol || "").trim();
        out[a.id] = { symbol: symbol.slice(0, 14), name: (a.content?.metadata?.name || "").trim().slice(0, 40) };
      }
    } catch (e) { if (e.name === "AbortError") throw e; }
  }
  return out;
}

// Reads a wallet's transactions into trades (buys / sells) and money flows per counterparty.
function followAnalyze(txs, wallet) {
  const trades = [];
  const flows  = new Map();
  const flow = (addr) => {
    let f = flows.get(addr);
    if (!f) { f = { addr, in: 0, out: 0, inUsd: 0, outUsd: 0, nIn: 0, nOut: 0, ev: [] }; flows.set(addr, f); }
    return f;
  };
  let firstTs = Infinity, lastTs = 0;

  for (const tx of txs) {
    const ts = tx.timestamp || 0;
    if (ts) { firstTs = Math.min(firstTs, ts); lastTs = Math.max(lastTs, ts); }
    if (tx.transactionError) continue;

    // Net balance change of this wallet: SOL (native + wrapped), stables, and every other token
    let sol = 0, stable = 0;
    const tok = new Map();
    if (Array.isArray(tx.accountData) && tx.accountData.length) {
      for (const a of tx.accountData) {
        if (a.account === wallet) sol += (a.nativeBalanceChange || 0) / 1e9;
        for (const c of a.tokenBalanceChanges || []) {
          if (c.userAccount !== wallet) continue;
          const amt = Number(c.rawTokenAmount?.tokenAmount || 0) / 10 ** (c.rawTokenAmount?.decimals ?? 0);
          if (!amt) continue;
          if (c.mint === WSOL) sol += amt;
          else if (FOLLOW_STABLES.has(c.mint)) stable += amt;
          else tok.set(c.mint, (tok.get(c.mint) || 0) + amt);
        }
      }
    } else {
      for (const n of tx.nativeTransfers || []) {
        if (n.toUserAccount === wallet) sol += (n.amount || 0) / 1e9;
        if (n.fromUserAccount === wallet) sol -= (n.amount || 0) / 1e9;
      }
      for (const t of tx.tokenTransfers || []) {
        const d = (t.toUserAccount === wallet ? 1 : 0) - (t.fromUserAccount === wallet ? 1 : 0);
        if (!d || t.mint === WSOL) continue;
        const amt = d * (t.tokenAmount || 0);
        if (FOLLOW_STABLES.has(t.mint)) stable += amt;
        else tok.set(t.mint, (tok.get(t.mint) || 0) + amt);
      }
    }

    let got = null, gave = null;
    for (const [mint, amt] of tok) {
      if (amt > 1e-9 && !got) got = { mint, amt };
      else if (amt < -1e-9 && !gave) gave = { mint, amt: -amt };
    }

    if (got || gave) {
      // A token moved: it is a trade when SOL or a stable moved the other way
      const paid     = sol <= -FOLLOW_TRADE_SOL || stable <= -0.5;
      const received = sol >=  FOLLOW_TRADE_SOL || stable >=  0.5;
      if (got && paid) {
        trades.push({ sig: tx.signature, ts, side: "buy", mint: got.mint, amount: got.amt,
          sol: sol <= -FOLLOW_TRADE_SOL ? -sol : 0, usd: stable <= -0.5 ? -stable : 0 });
      } else if (gave && received) {
        trades.push({ sig: tx.signature, ts, side: "sell", mint: gave.mint, amount: gave.amt,
          sol: sol >= FOLLOW_TRADE_SOL ? sol : 0, usd: stable >= 0.5 ? stable : 0 });
      }
      continue; // never read a trade's fee and pool transfers as money sent to someone
    }

    // SOL ↔ stable conversion: not a transfer to anyone
    if (Math.abs(stable) >= 0.5 && Math.abs(sol) >= FOLLOW_TRADE_SOL && Math.sign(stable) !== Math.sign(sol)) continue;

    if (Math.abs(stable) >= 1) {
      for (const t of tx.tokenTransfers || []) {
        if (!FOLLOW_STABLES.has(t.mint)) continue;
        const amt = t.tokenAmount || 0;
        if (amt < 1) continue;
        if (t.fromUserAccount === wallet && t.toUserAccount && t.toUserAccount !== wallet && !BLACKLIST.has(t.toUserAccount)) {
          const f = flow(t.toUserAccount); f.outUsd += amt; f.nOut++; f.ev.push({ ts, dir: "out", sol: 0, usd: amt });
        } else if (t.toUserAccount === wallet && t.fromUserAccount && t.fromUserAccount !== wallet && !BLACKLIST.has(t.fromUserAccount)) {
          const f = flow(t.fromUserAccount); f.inUsd += amt; f.nIn++; f.ev.push({ ts, dir: "in", sol: 0, usd: amt });
        }
      }
    }

    for (const n of tx.nativeTransfers || []) {
      const amt = (n.amount || 0) / 1e9;
      if (amt < FOLLOW_DUST_SOL) continue;
      const { fromUserAccount: from, toUserAccount: to } = n;
      if (from === wallet && to && to !== wallet && !BLACKLIST.has(to)) {
        const f = flow(to); f.out += amt; f.nOut++; f.ev.push({ ts, dir: "out", sol: amt, usd: 0 });
      } else if (to === wallet && from && from !== wallet && !BLACKLIST.has(from)) {
        const f = flow(from); f.in += amt; f.nIn++; f.ev.push({ ts, dir: "in", sol: amt, usd: 0 });
      }
    }
  }

  trades.sort((a, b) => b.ts - a.ts);
  return { trades, flows, firstTs: Number.isFinite(firstTs) ? firstTs : 0, lastTs, n: txs.length };
}

// A wallet that pays or collects from many addresses is not a plain personal wallet.
//   "exchange"    — hundreds of transfers a day: a service; its trail cannot be followed 1:1
//   "distributor" — human pace, but funds or collects from many wallets (a treasury, a farm's bank)
function followHubKind(an) {
  let outCps = 0, inCps = 0;
  for (const f of an.flows.values()) { if (f.nOut) outCps++; if (f.nIn) inCps++; }
  const spanH = an.lastTs > an.firstTs ? (an.lastTs - an.firstTs) / 3600 : 0;
  if (an.n >= 100 && spanH < 12 && an.trades.length * 5 < an.n) return "exchange";
  if (outCps >= 8 || inCps >= 10) return "distributor";
  return null;
}

function followTradeStats(trades, now) {
  let buys = 0, sells = 0, buys24 = 0, buys7 = 0, lastBuyTs = 0, firstBuyTs = 0, lastTradeTs = 0;
  const mints = new Set();
  for (const t of trades) {
    lastTradeTs = Math.max(lastTradeTs, t.ts);
    if (t.side !== "buy") { sells++; continue; }
    buys++; mints.add(t.mint);
    if (t.ts >= now - FOLLOW_DAY) buys24++;
    if (t.ts >= now - 7 * FOLLOW_DAY) buys7++;
    lastBuyTs = Math.max(lastBuyTs, t.ts);
    firstBuyTs = firstBuyTs ? Math.min(firstBuyTs, t.ts) : t.ts;
  }
  return { buys, sells, buys24, buys7, lastBuyTs, firstBuyTs, lastTradeTs, mints };
}

function followTopFlows(an, dir, limit = 6) {
  const key = dir === "in" ? "in" : "out", usdKey = dir === "in" ? "inUsd" : "outUsd";
  return [...an.flows.values()]
    .filter((f) => f[key] >= FOLLOW_DUST_SOL || f[usdKey] >= 1)
    .map((f) => ({ addr: f.addr, sol: f[key], usd: f[usdKey], ts: Math.max(0, ...f.ev.filter((e) => e.dir === dir).map((e) => e.ts)) }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

function followDur(secs) {
  if (secs < 90) return `${Math.max(1, Math.round(secs))} s`;
  if (secs < 5400) return `${Math.round(secs / 60)} min`;
  if (secs < 2 * FOLLOW_DAY) return `${Math.round(secs / 3600)} h`;
  return `${Math.round(secs / FOLLOW_DAY)} d`;
}

// How likely is this wallet to be the person's own? Every point has a stated reason.
function followScore(node, ctx) {
  const why = [];
  const deposit = node.sharesKind === "deposit";
  let s = 0;
  if (node.side === "sib") {
    s += deposit ? 30 : 18;
    why.push(deposit ? "deposita en la misma dirección de exchange que la raíz" : "manda SOL al mismo puente que la raíz");
  } else if (node.viaHub) {
    s += 4 + Math.round(12 * (node.match?.q || 0));
    why.push(`un exchange/bot le pagó ${followDur(node.match?.dt || 0)} después del depósito, el ${Math.round((node.match?.ratio || 0) * 100)}% del monto`);
  } else if (node.viaDist) {
    s += 14; why.push("fondeada por un distribuidor al que la raíz también le manda SOL");
  } else if (node.depth === 1) { s += 28; why.push("recibió SOL directo de la wallet raíz"); }
  else if (node.depth === 2)   { s += 22; why.push("recibió SOL a 2 saltos, pasando por una wallet puente"); }
  else                         { s += 15; why.push("recibió SOL a 3 saltos de la raíz"); }

  const moved = node.side === "sib" ? node.sent || 0 : node.recv || 0;
  s += moved >= 5 ? 10 : moved >= 1 ? 6 : 2;

  if (node.side !== "sib" && node.shares) {
    s += deposit ? 22 : 12;
    why.push(deposit ? "deposita en la misma dirección de exchange que la raíz" : "manda SOL al mismo puente que la raíz");
  }
  if (node.back >= FOLLOW_EDGE_SOL) {
    s += 12; why.push(`devolvió ${node.back.toFixed(2)} SOL a quien la fondeó (ida y vuelta)`);
  }
  if (node.complete && node.recvTs && node.firstTs >= node.recvTs - 3600) {
    s += 14; why.push("wallet nueva: nació con este fondeo");
  }
  if (node.buys > 0) {
    s += node.buys >= 10 ? 18 : node.buys >= 3 ? 13 : 7;
    why.push(`${node.buys} compra${node.buys > 1 ? "s" : ""} detectada${node.buys > 1 ? "s" : ""}`);
  }
  if (node.overlap > 0) {
    s += node.overlap >= 3 ? 18 : 10;
    why.push(`compró ${node.overlap} token${node.overlap > 1 ? "s" : ""} que también compró la raíz`);
  }
  if (node.buys > 0 && node.recvTs && node.lastBuyTs > node.recvTs && ctx.rootLastBuyTs < node.recvTs) {
    s += 10; why.push("la raíz dejó de comprar después de fondearla");
  }
  return { score: Math.max(1, Math.min(99, s)), why };
}

const followScored = (n) => n.side !== "in" && !["root", "alias", "exchange", "deposit"].includes(n.role);

// Full scan: root (+ confirmed wallets) → who funded it → where the money went, up to 3 hops.
async function followScan(person, apiKey, signal, onProgress) {
  const now    = Math.floor(Date.now() / 1000);
  const since  = now - 7 * FOLLOW_DAY;
  const root   = person.root;
  const own    = [root, ...(person.aliases || []).filter((a) => a !== root)];
  const ownSet = new Set(own);
  const nodes  = new Map();
  const edges  = [];
  const analyses = new Map();
  const snapshot = () => ({ nodes: [...nodes.values()], edges: [...edges] });
  const report = (label) => onProgress?.({ label, graph: snapshot() });

  const load = async (addr, opts) => {
    const r  = await followFetchTxs(addr, apiKey, signal, opts);
    const an = followAnalyze(r.txs, addr);
    an.txs = r.txs; an.complete = r.complete; an.cursor = r.cursor;
    analyses.set(addr, an);
    return an;
  };

  // 1 · the person's own wallets: 7 days of history
  const trades = [];
  const ownMints = new Set();
  for (const w of own) {
    report(`Leyendo historial de ${shortAddr(w, 4, 4)}`);
    const an = await load(w, { maxPages: w === root ? 6 : 3, untilTs: since });
    for (const t of an.trades) {
      if (t.side === "buy") ownMints.add(t.mint);
      if (t.ts >= since) trades.push({ ...t, wallet: w });
    }
  }
  const rootAn = analyses.get(root);
  const ctx = { rootLastBuyTs: followTradeStats(rootAn.trades, now).lastBuyTs };

  const describe = (node, an) => {
    const st = followTradeStats(an.trades, now);
    let senders = 0, receivers = 0;
    for (const f of an.flows.values()) { if (f.nIn) senders++; if (f.nOut) receivers++; }
    Object.assign(node, {
      buys: st.buys, sells: st.sells, buys24: st.buys24, buys7: st.buys7,
      lastBuyTs: st.lastBuyTs, firstBuyTs: st.firstBuyTs, lastTradeTs: st.lastTradeTs,
      firstTs: an.firstTs, lastTs: an.lastTs, complete: an.complete, txCount: an.n,
      senders, receivers,
      overlap: ownSet.has(node.addr) ? 0 : [...st.mints].filter((m) => ownMints.has(m)).length,
      trades: an.trades.slice(0, 12),
      flowsIn: followTopFlows(an, "in"), flowsOut: followTopFlows(an, "out"),
    });
    return st;
  };

  const rootNode = { addr: root, depth: 0, side: "root", role: "root", parent: null, recv: 0, recvTs: 0, back: 0 };
  describe(rootNode, rootAn);
  rootNode.coverTs = rootAn.complete ? 0 : rootAn.firstTs;
  nodes.set(root, rootNode);

  // Money that left `addr` from a moment on, grouped by receiver
  const outflows = (addr, afterTs) => {
    const out = [];
    for (const f of analyses.get(addr).flows.values()) {
      const ev = f.ev.filter((e) => e.dir === "out" && e.ts >= afterTs);
      if (!ev.length) continue;
      const sol = ev.reduce((s, e) => s + e.sol, 0), usd = ev.reduce((s, e) => s + e.usd, 0);
      if (sol < FOLLOW_EDGE_SOL && usd < 75) continue;
      out.push({ addr: f.addr, recv: sol, recvUsd: usd, n: ev.length, recvTs: Math.min(...ev.map((e) => e.ts)), recvLastTs: Math.max(...ev.map((e) => e.ts)), back: f.in });
    }
    return out.sort((a, b) => (b.recv + b.recvUsd / 150) - (a.recv + a.recvUsd / 150));
  };

  // 2 · where the root sent money, and who sent money to the root (one hop back is enough context)
  const rootOut = outflows(root, 0).slice(0, FOLLOW_CAPS.l1);
  const outSet  = new Set(rootOut.map((c) => c.addr));
  const funders = [...rootAn.flows.values()]
    .filter((f) => !outSet.has(f.addr) && (f.in >= FOLLOW_EDGE_SOL || f.inUsd >= 75))
    .sort((a, b) => (b.in + b.inUsd / 150) - (a.in + a.inUsd / 150)).slice(0, FOLLOW_CAPS.funders);
  for (const f of funders) {
    const ts = Math.max(...f.ev.filter((e) => e.dir === "in").map((e) => e.ts));
    nodes.set(f.addr, {
      addr: f.addr, depth: 1, side: "in", parent: root, recv: 0, recvTs: 0, back: 0,
      role: ownSet.has(f.addr) ? "alias" : KNOWN_EXCHANGES.has(f.addr) ? "exchange" : "funder",
      exName: KNOWN_EXCHANGES.get(f.addr) || null, sent: f.in, sentUsd: f.inUsd, sentTs: ts,
    });
    edges.push({ from: f.addr, to: root, sol: f.in, usd: f.inUsd, n: f.nIn, ts });
  }

  // 3 · follow the money out, breadth first
  const queue = [];
  const perDepth = { 1: 0, 2: 0, 3: 0 };
  const depthCap = { 1: FOLLOW_CAPS.l1, 2: FOLLOW_CAPS.l2, 3: FOLLOW_CAPS.l3 };
  const enqueue = (parentAddr, child, depth) => {
    if (nodes.has(child.addr) || queue.some((q) => q.addr === child.addr)) return;
    if (perDepth[depth] >= depthCap[depth]) return;
    perDepth[depth]++;
    queue.push({ ...child, parent: parentAddr, depth });
  };
  rootOut.forEach((c) => enqueue(root, c, 1));

  while (queue.length) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const item = queue.shift();
    const { addr, depth, parent } = item;
    const node = {
      addr, depth, side: "out", parent, role: "other",
      recv: item.recv, recvUsd: item.recvUsd, recvTs: item.recvTs, recvLastTs: item.recvLastTs,
      back: item.back || 0, viaHub: !!item.match, match: item.match || null, viaDist: !!item.viaDist,
    };
    nodes.set(addr, node);
    edges.push({ from: parent, to: addr, sol: item.recv, usd: item.recvUsd, n: item.n, ts: item.recvLastTs, guess: !!item.match });

    if (KNOWN_EXCHANGES.has(addr)) {
      node.role = "exchange"; node.exName = KNOWN_EXCHANGES.get(addr); node.lost = true;
      continue;
    }

    report(`Capa ${depth} · ${shortAddr(addr, 4, 4)}`);
    let an = analyses.get(addr) || await load(addr, { maxPages: 1 });
    const kind = ownSet.has(addr) ? null : followHubKind(an);

    // A busy service pushes our deposit off the first page: read back to the moment it arrived
    if (kind === "exchange" && depth < 3 && !an.complete && an.firstTs > node.recvTs) {
      const more = await followFetchTxs(addr, apiKey, signal, { maxPages: 2, untilTs: node.recvTs, before: an.cursor });
      const txs = [...an.txs, ...more.txs];
      an = followAnalyze(txs, addr);
      an.txs = txs; an.complete = more.complete; an.cursor = more.cursor;
      analyses.set(addr, an);
    }

    const st = describe(node, an);
    const sentOn = outflows(addr, node.recvTs - 600).filter((c) => c.addr !== parent);
    node.fwd = sentOn.reduce((s, c) => s + c.recv, 0);
    const toParent = an.flows.get(parent);
    if (toParent) node.back = Math.max(node.back, toParent.ev.filter((e) => e.dir === "out" && e.ts >= node.recvTs).reduce((s, e) => s + e.sol, 0));

    // Pass-through: nearly everything that comes in leaves to one single address
    let totalIn = 0, totalOut = 0, top = null;
    for (const f of an.flows.values()) { totalIn += f.in; totalOut += f.out; if (!top || f.out > top.out) top = f; }
    node.passTo = !kind && top && totalOut >= FOLLOW_EDGE_SOL && top.out >= 0.85 * totalOut && totalOut >= 0.8 * totalIn ? top.addr : null;

    if (ownSet.has(addr)) node.role = "alias";
    else if (kind) node.role = kind;
    else if (node.fwd >= FOLLOW_EDGE_SOL && node.fwd >= 0.5 * node.recv) node.role = "bridge";
    else if (st.buys + st.sells > 0) node.role = "trader";
    else if (node.recv >= 1 || node.recvUsd >= 150) node.role = "watch";

    if (followScored(node)) Object.assign(node, followScore(node, ctx));
    if (depth >= 3) continue;

    if (node.role === "exchange") {
      // Match what came out of the service against what went in: close in amount, soon after
      const deposits = (an.flows.get(parent)?.ev || []).filter((e) => e.dir === "in" && e.sol >= FOLLOW_DUST_SOL);
      node.lost = !an.complete && an.firstTs > node.recvTs;
      const best = new Map();
      for (const f of an.flows.values()) {
        if (f.addr === parent || nodes.has(f.addr)) continue;
        for (const e of f.ev) {
          if (e.dir !== "out" || !e.sol) continue;
          for (const d of deposits) {
            const dt = e.ts - d.ts, ratio = e.sol / d.sol;
            if (dt < -30 || dt > 2 * FOLLOW_DAY || ratio < 0.5 || ratio > 1.03) continue;
            const q = 0.55 * (1 - Math.abs(1 - ratio) / 0.5) + 0.45 / (1 + Math.max(0, dt) / 7200);
            const cur = best.get(f.addr);
            if (!cur || q > cur.match.q) best.set(f.addr, { addr: f.addr, recv: e.sol, recvUsd: 0, n: 1, recvTs: e.ts, recvLastTs: e.ts, match: { q, dt: Math.max(0, dt), ratio } });
          }
        }
      }
      [...best.values()].filter((c) => c.match.q >= 0.35).sort((a, b) => b.match.q - a.match.q)
        .slice(0, FOLLOW_CAPS.hubMatches).forEach((c) => enqueue(addr, c, depth + 1));
    } else if (node.role === "distributor") {
      // Wallets it funds: the ones that also send money back first, then the most recent
      outflows(addr, 0).filter((c) => c.addr !== parent)
        .sort((a, b) => (b.back > 0) - (a.back > 0) || b.recvLastTs - a.recvLastTs)
        .slice(0, FOLLOW_CAPS.perParent).forEach((c) => enqueue(addr, { ...c, viaDist: true }, depth + 1));
    } else if (node.role === "bridge" || node.role === "alias") {
      sentOn.slice(0, FOLLOW_CAPS.perParent).forEach((c) => enqueue(addr, c, depth + 1));
    }
  }

  // 4 · confirmed wallets the money trail did not reach still belong on the map
  for (const w of own) {
    if (nodes.has(w)) continue;
    const node = { addr: w, depth: 1, side: "out", parent: root, role: "alias", recv: 0, recvUsd: 0, recvTs: 0, back: 0 };
    describe(node, analyses.get(w));
    nodes.set(w, node);
    edges.push({ from: root, to: w, sol: 0, usd: 0, n: 0, ts: 0, manual: true });
  }

  // 5 · funnels. A private pass-through address fed by few wallets (typically an exchange
  //     deposit address) ties those wallets to one owner: whoever else feeds it is a sister wallet.
  const sisters = new Map();
  const funnels = new Map();
  for (const x of [...nodes.values()]) {
    if (x.parent !== root || x.side !== "out" || !x.passTo) continue;
    const feeders = [...analyses.get(x.addr).flows.values()].filter((f) => f.nIn > 0);
    if (feeders.length > 8) continue;
    const kind = nodes.get(x.passTo)?.role === "exchange" ? "deposit" : "bridge";
    if (kind === "deposit") x.role = "deposit";
    funnels.set(x.addr, kind);
    for (const f of feeders) {
      if (f.addr === root || f.in < FOLLOW_EDGE_SOL) continue;
      const n = nodes.get(f.addr);
      if (n) {
        if (n.role !== "exchange" && (!n.shares || kind === "deposit")) { n.shares = x.addr; n.sharesKind = kind; }
      } else if (!sisters.has(f.addr) || kind === "deposit") {
        sisters.set(f.addr, { addr: f.addr, funnel: x.addr, kind, sol: f.in, n: f.nIn, ts: Math.max(...f.ev.filter((e) => e.dir === "in").map((e) => e.ts)) });
      }
    }
  }
  const sisterList = [...sisters.values()].sort((a, b) => (b.kind === "deposit") - (a.kind === "deposit") || b.sol - a.sol).slice(0, FOLLOW_CAPS.sisters);
  for (const s of sisterList) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    report(`Wallet hermana · ${shortAddr(s.addr, 4, 4)}`);
    const an = analyses.get(s.addr) || await load(s.addr, { maxPages: 1 });
    const kind = followHubKind(an);
    if (kind === "exchange") continue;
    const node = {
      addr: s.addr, depth: 0, side: "sib", parent: s.funnel, role: kind || "sibling",
      recv: 0, recvUsd: 0, recvTs: 0, back: 0, sent: s.sol, sentTs: s.ts, shares: s.funnel, sharesKind: s.kind,
    };
    describe(node, an);
    nodes.set(s.addr, node);
    edges.push({ from: s.addr, to: s.funnel, sol: s.sol, usd: 0, n: s.n, ts: s.ts });
  }

  // 6 · links between wallets already on the map (money coming back is a strong tell)
  const have = new Set(edges.map((e) => `${e.from}>${e.to}`));
  for (const [addr, an] of analyses) {
    const n = nodes.get(addr);
    if (!n || n.role === "exchange") continue;
    for (const f of an.flows.values()) {
      if (f.out < FOLLOW_EDGE_SOL || !nodes.has(f.addr) || have.has(`${addr}>${f.addr}`)) continue;
      have.add(`${addr}>${f.addr}`);
      const funnel = funnels.get(f.addr);
      if (funnel && addr !== root && (!n.shares || funnel === "deposit")) { n.shares = f.addr; n.sharesKind = funnel; }
      edges.push({ from: addr, to: f.addr, sol: f.out, usd: f.outUsd, n: f.nOut, ts: Math.max(...f.ev.filter((e) => e.dir === "out").map((e) => e.ts)), extra: true });
    }
  }

  for (const n of nodes.values()) {
    if (followScored(n)) Object.assign(n, followScore(n, ctx));
    else { delete n.score; delete n.why; }
  }

  trades.sort((a, b) => b.ts - a.ts);
  report("Listo");
  return { ...snapshot(), trades: trades.slice(0, 400), scannedAt: now };
}

// Light check between full scans: new trades on the person's wallets, money leaving to
// addresses that are not on the map yet, and quiet candidates that started buying.
async function followRefresh(person, apiKey, signal) {
  const now   = Math.floor(Date.now() / 1000);
  const own   = [person.root, ...(person.aliases || [])];
  const known = new Set((person.trades || []).map((t) => t.sig + t.mint));
  const nodes = (person.graph?.nodes || []).map((n) => ({ ...n }));
  const byAddr = new Map(nodes.map((n) => [n.addr, n]));
  const fresh = [], alerts = [];

  for (const w of own) {
    const { txs } = await followFetchTxs(w, apiKey, signal, { maxPages: 1 });
    const an = followAnalyze(txs, w);
    for (const t of an.trades) {
      if (known.has(t.sig + t.mint)) continue;
      known.add(t.sig + t.mint);
      fresh.push({ ...t, wallet: w });
    }
    for (const f of an.flows.values()) {
      if (byAddr.has(f.addr)) continue;
      for (const e of f.ev) {
        if (e.dir === "out" && e.sol >= 1 && e.ts > (person.scannedAt || 0)) alerts.push({ kind: "outflow", ts: e.ts, addr: f.addr, sol: e.sol, from: w });
      }
    }
  }

  const trades   = [...fresh, ...(person.trades || [])];
  const ownMints = new Set(trades.filter((t) => t.side === "buy").map((t) => t.mint));
  const ctx = { rootLastBuyTs: Math.max(0, ...trades.filter((t) => t.side === "buy" && t.wallet === person.root).map((t) => t.ts)) };
  const recheck = nodes
    .filter((n) => followScored(n) && (n.role === "watch" || (n.score || 0) >= 50))
    .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  for (const n of recheck) {
    const { txs } = await followFetchTxs(n.addr, apiKey, signal, { maxPages: 1 });
    const an = followAnalyze(txs, n.addr);
    const st = followTradeStats(an.trades, now);
    if (st.buys > 0 && !(n.buys > 0)) alerts.push({ kind: "woke", ts: st.firstBuyTs, addr: n.addr, buys: st.buys });
    Object.assign(n, {
      buys: st.buys, sells: st.sells, buys24: st.buys24, buys7: st.buys7,
      lastBuyTs: st.lastBuyTs, firstBuyTs: st.firstBuyTs, lastTradeTs: st.lastTradeTs,
      overlap: [...st.mints].filter((m) => ownMints.has(m)).length,
      trades: an.trades.slice(0, 12),
    });
    if (n.role === "watch" && st.buys > 0) n.role = "trader";
    Object.assign(n, followScore(n, ctx));
  }

  return { fresh, alerts, nodes, checkedAt: now };
}

// ─── Follow · helpers ─────────────────────────────────────────────────────────

const FOLLOW_ROLES = {
  root:        { label: "Raíz",              color: "var(--accent)",        desc: "La wallet con la que empezaste a seguirle." },
  alias:       { label: "Su wallet",         color: "var(--accent-2)",      desc: "Wallet que tú confirmaste como suya." },
  sibling:     { label: "Hermana",           color: "oklch(0.83 0.15 105)", desc: "Deposita en la misma dirección que la raíz: casi seguro el mismo dueño." },
  trader:      { label: "Candidata",         color: "oklch(0.74 0.17 350)", desc: "Recibió su SOL y está comprando tokens." },
  watch:       { label: "Vigilar",           color: "var(--warn)",          desc: "Recibió su SOL y todavía no compra nada." },
  bridge:      { label: "Puente",            color: "oklch(0.72 0.15 295)", desc: "Recibe y reenvía: el SOL solo pasa por aquí." },
  distributor: { label: "Distribuidor",      color: "oklch(0.74 0.15 45)",  desc: "Fondea o cobra a muchas wallets: tesorería o banco de una granja." },
  deposit:     { label: "Depósito exchange", color: "oklch(0.76 0.10 200)", desc: "Dirección de depósito: todo lo que entra sale hacia un exchange." },
  exchange:    { label: "Exchange / bot",    color: "oklch(0.62 0.02 260)", desc: "Servicio con cientos de movimientos al día: ahí se pierde el rastro." },
  funder:      { label: "Le mandó SOL",      color: "var(--info)",          desc: "Le envió SOL a la raíz." },
  other:       { label: "Destino",           color: "var(--text-3)",        desc: "Recibió SOL, sin más señales." },
};
const FOLLOW_STORE = "follow_people";

const followNow = () => Math.floor(Date.now() / 1000);
const followClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function followLoad() {
  try { const v = JSON.parse(localStorage.getItem(FOLLOW_STORE) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function followSave(people) {
  try { localStorage.setItem(FOLLOW_STORE, JSON.stringify(people)); } catch { /* storage full: keep working in memory */ }
}

function fmtSol(x) {
  if (!Number.isFinite(x)) return "0";
  const a = Math.abs(x);
  return a >= 1000 ? Math.round(x).toLocaleString("en-US") : a >= 100 ? x.toFixed(1) : x.toFixed(2);
}
function fmtAmount(sol, usd) {
  if (sol > 0) return `${fmtSol(sol)} SOL`;
  if (usd > 0) return `${Math.round(usd).toLocaleString("en-US")} USD`;
  return "—";
}
function fmtAgo(ts, now) { return ts ? `hace ${followDur(Math.max(1, now - ts))}` : "—"; }
function fmtClock(ts) {
  const d = new Date(ts * 1000), t = new Date();
  const hm = d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true });
  const day0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  if (d.getTime() >= day0) return `hoy ${hm}`;
  if (d.getTime() >= day0 - 86400000) return `ayer ${hm}`;
  return `${d.toLocaleDateString("es", { weekday: "short", day: "numeric" })} ${hm}`;
}
function followVerdict(score) {
  return score >= 70 ? "muy probable" : score >= 50 ? "probable" : score >= 30 ? "posible" : "poco probable";
}
function followHue(addr) {
  let h = 7;
  for (const c of addr || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// Second line under a wallet on the map. `compact` keeps it to the role alone
// (used for wallets with children, whose label sets the width of a whole column).
function followTag(n, rootName, compact) {
  if (n.role === "root") return `Raíz${rootName ? ` · ${rootName}` : ""}`;
  const role = FOLLOW_ROLES[n.role] || FOLLOW_ROLES.other;
  if (compact) return n.exName || (n.role === "deposit" ? "Depósito" : role.label);
  if (n.members) return `${n.members.length} exchanges${n.lost ? " · sin rastro" : ""}`;
  const parts = [n.exName || (n.viaHub && n.role === "trader" ? "Vía exchange" : n.role === "exchange" ? "Exchange" : role.label)];
  if (n.role === "exchange" && n.lost) parts.push("sin rastro");
  if (n.buys > 0) parts.push(`${n.buys} compra${n.buys > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
const fmtPill = (sol, usd) => (sol > 0 ? fmtSol(sol) : usd > 0 ? `${Math.round(usd).toLocaleString("en-US")}` : "");

function followWalletStats(trades, wallet, now) {
  let b1 = 0, b24 = 0, b7 = 0, s7 = 0, vol24 = 0, vol7 = 0, last = 0;
  const m24 = new Set(), m7 = new Set();
  for (const t of trades) {
    if (wallet && t.wallet !== wallet) continue;
    const age = now - t.ts;
    if (age > 7 * FOLLOW_DAY) continue;
    if (t.side !== "buy") { s7++; continue; }
    b7++; vol7 += t.sol; m7.add(t.mint); last = Math.max(last, t.ts);
    if (age <= FOLLOW_DAY) { b24++; vol24 += t.sol; m24.add(t.mint); }
    if (age <= 3600) b1++;
  }
  return { b1, b24, b7, s7, vol24, vol7, last, tokens24: m24.size, tokens7: m7.size };
}

function followTokenRows(trades, now, span) {
  const by = new Map();
  for (const t of trades) {
    if (now - t.ts > span) continue;
    let r = by.get(t.mint);
    if (!r) { r = { mint: t.mint, buys: 0, sells: 0, spent: 0, got: 0, last: 0 }; by.set(t.mint, r); }
    if (t.side === "buy") { r.buys++; r.spent += t.sol; } else { r.sells++; r.got += t.sol; }
    r.last = Math.max(r.last, t.ts);
  }
  return [...by.values()].sort((a, b) => b.last - a.last);
}

// What the map says, in plain sentences
function followInsights(person, graph, now) {
  const nodes = graph?.nodes || [];
  const own   = new Set([person.root, ...(person.aliases || [])]);
  const stats = followWalletStats(person.trades || [], null, now);
  const cands = nodes.filter((n) => n.score != null && !own.has(n.addr)).sort((a, b) => b.score - a.score);
  const top   = cands[0];

  let status;
  const hot = [...own].filter((w) => followWalletStats(person.trades || [], w, now).b24 > 0);
  if (stats.b24 > 0) {
    const text = hot.length > 1 ? `comprando con ${hot.length} wallets` : hot[0] === person.root ? "sigue en su wallet raíz" : `ahora compra con ${shortAddr(hot[0], 4, 4)}`;
    status = { tone: "accent", chip: "activa", text };
  }
  else if (stats.last) status = { tone: "warn", chip: "en pausa", text: `sin compras desde ${fmtAgo(stats.last, now)}` };
  else status = { tone: "muted", chip: "inactiva", text: "sin compras en 7 días" };
  if (top && top.score >= 70 && top.buys > 0 && top.lastBuyTs > stats.last) {
    status = { tone: "warn", chip: status.chip, text: `posible wallet nueva: ${shortAddr(top.addr, 4, 4)}` };
  }

  const items = [];
  for (const n of cands.filter((c) => c.score >= 50).slice(0, 3)) {
    items.push({ tone: n.score >= 70 ? "accent" : "info", addr: n.addr, score: n.score,
      text: `${shortAddr(n.addr, 4, 4)} · ${followVerdict(n.score)} que sea suya`, sub: (n.why || []).slice(0, 2).join(" · ") });
  }
  for (const n of nodes.filter((x) => x.role === "deposit").slice(0, 1)) {
    items.push({ tone: "muted", addr: n.addr, text: `Mandó ${fmtSol(n.recv)} SOL a un exchange ${fmtAgo(n.recvLastTs, now)}`,
      sub: "retiro o toma de ganancias: en el exchange se pierde el rastro" });
  }
  for (const n of nodes.filter((x) => x.role === "watch" && x.recv >= 1).slice(0, 2)) {
    items.push({ tone: "warn", addr: n.addr, text: `${fmtSol(n.recv)} SOL quietos en ${shortAddr(n.addr, 4, 4)}`,
      sub: `los recibió ${fmtAgo(n.recvTs, now)} y todavía no compra` });
  }
  const root = nodes.find((n) => n.role === "root");
  if (root?.coverTs && root.coverTs > now - 7 * FOLLOW_DAY) {
    items.push({ tone: "muted", text: "Historial parcial", sub: `es muy activa: el escaneo solo cubre ${followDur(now - root.coverTs)} hacia atrás` });
  }
  return { status, items: items.slice(0, 6), stats, cands };
}

// ─── Follow · map layout ──────────────────────────────────────────────────────
// "layers": money flows left → right, one column per hop, labels beside each node.
// "radial": the root in the middle, one ring per hop.

// Several dead-end exchanges under one wallet all say the same thing ("the trail ends here"),
// so the map draws them as one node. Display only: the stored graph keeps every wallet.
function followCollapse(graph) {
  if (!graph) return graph;
  const parents = new Set(graph.nodes.map((n) => n.parent));
  const byParent = new Map();
  for (const n of graph.nodes) {
    if (n.role !== "exchange" || n.side !== "out" || parents.has(n.addr)) continue;
    if (!byParent.has(n.parent)) byParent.set(n.parent, []);
    byParent.get(n.parent).push(n);
  }
  const heads = new Map();   // the wallet that stands for a group → its members
  const hidden = new Map();  // every other member → its head
  for (const list of byParent.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (b.recv || 0) - (a.recv || 0));
    heads.set(list[0].addr, list);
    for (const n of list.slice(1)) hidden.set(n.addr, list[0].addr);
  }
  if (!hidden.size) return graph;

  const sums = new Map();
  for (const e of graph.edges) {
    const head = heads.has(e.to) ? e.to : hidden.get(e.to);
    if (!head || e.extra) continue;
    const s = sums.get(head) || { sol: 0, usd: 0, n: 0 };
    s.sol += e.sol || 0; s.usd += e.usd || 0; s.n += e.n || 0;
    sums.set(head, s);
  }
  return {
    nodes: graph.nodes.filter((n) => !hidden.has(n.addr)).map((n) => {
      const list = heads.get(n.addr);
      return list ? { ...n, members: list.map((m) => m.addr), lost: list.some((m) => m.lost) } : n;
    }),
    edges: graph.edges.filter((e) => !hidden.has(e.from) && !hidden.has(e.to))
      .map((e) => (heads.has(e.to) && !e.extra ? { ...e, ...sums.get(e.to) } : e)),
  };
}

function followLayout(graph, mode, names, rootName) {
  const nodes = graph?.nodes || [];
  const P = new Map();
  if (!nodes.length) return { P, bounds: { x0: -200, y0: -120, x1: 200, y1: 120 }, cols: [] };
  const root = nodes.find((n) => n.role === "root") || nodes[0];

  const info = (n) => {
    const line1 = ((n.role !== "root" && names?.get(n.addr)) || shortAddr(n.addr, 4, 4)) + (n.members ? ` +${n.members.length - 1}` : "");
    const tag = followTag(n, rootName, mode !== "radial" && n.side === "out" && kids.has(n.addr));
    const r = n.role === "root" ? 17 : n.role === "alias" ? 12 : n.score != null ? 7 + Math.round(n.score / 14) : n.role === "exchange" ? 6 : 8;
    // The score badge rides on whichever line is shorter, so it widens the label as little as possible
    const w1 = line1.length * 6.7, w2 = tag.length * 6.15;
    const badge = n.score == null ? 0 : w1 <= w2 ? 1 : 2;
    const lw = Math.max(w1 + (badge === 1 ? 30 : 0), w2 + (badge === 2 ? 30 : 0)) + 4;
    return { n, r, line1, tag, w1, w2, badge, lw };
  };

  const kids = new Map();
  for (const n of nodes) {
    if (n.side !== "out" || n.addr === root.addr || !n.parent) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n);
  }
  for (const list of kids.values()) list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.recv || 0) - (a.recv || 0));
  const funders = nodes.filter((n) => n.side === "in").sort((a, b) => (b.sent || 0) - (a.sent || 0));
  const sisters = nodes.filter((n) => n.side === "sib").sort((a, b) => (b.score || 0) - (a.score || 0));
  const cols = [];

  if (mode === "radial") {
    const R = 170;
    const leaves = (n) => { const ch = kids.get(n.addr) || []; return ch.length ? ch.reduce((s, c) => s + leaves(c), 0) : 1; };
    const put = (n, a, depth) => {
      const i = info(n);
      const x = Math.cos(a) * R * depth, y = Math.sin(a) * R * depth * 0.86;
      P.set(n.addr, { ...i, x, y, label: depth === 0 || kids.has(n.addr) ? "below" : x >= -1 ? "right" : "left" });
    };
    const spread = (n, a0, a1, depth) => {
      put(n, (a0 + a1) / 2, depth);
      const ch = kids.get(n.addr) || [];
      const total = ch.reduce((s, c) => s + leaves(c), 0);
      let a = a0;
      for (const c of ch) { const w = ((a1 - a0) * leaves(c)) / total; spread(c, a, a + w, depth + 1); a += w; }
    };
    const D = Math.PI / 180;
    spread(root, -118 * D, 118 * D, 0);
    const left = [...funders, ...sisters];
    left.forEach((n, i) => put(n, (180 + (left.length > 1 ? (i / (left.length - 1) - 0.5) * 96 : 0)) * D, 1.05));
  } else {
    const ROW = 38, FUND_X = -150;
    const Y = new Map();
    let slot = 0;
    const setY = (n) => {
      const ch = kids.get(n.addr) || [];
      let y;
      if (ch.length) { const ys = ch.map(setY); y = (ys[0] + ys[ys.length - 1]) / 2; }
      else y = slot++ * ROW;
      Y.set(n.addr, y);
      return y;
    };
    const rootY = setY(root);
    const infos = new Map(nodes.map((n) => [n.addr, info(n)]));

    // Each column starts where the widest label of the previous one ends
    const maxDepth = Math.max(0, ...nodes.filter((n) => n.side === "out").map((n) => n.depth || 0));
    const X = [0];
    X[1] = 180;
    for (let d = 1; d < maxDepth; d++) {
      const inner = nodes.filter((n) => n.side === "out" && n.depth === d && kids.has(n.addr));
      X[d + 1] = X[d] + 30 + Math.max(60, ...inner.map((n) => infos.get(n.addr).lw)) + 112;
    }

    for (const n of nodes) {
      if (n.side !== "out" && n.addr !== root.addr) continue;
      const i = infos.get(n.addr);
      P.set(n.addr, { ...i, x: X[n.depth || 0] ?? 0, y: Y.get(n.addr) ?? 0, label: n.addr === root.addr ? "below" : "right", inner: kids.has(n.addr) });
    }
    funders.forEach((n, i) => P.set(n.addr, { ...infos.get(n.addr), x: FUND_X, y: rootY + (i - (funders.length - 1) / 2) * ROW, label: "left" }));
    // Sister wallets go below-left of the root, clear of the fan of links leaving it
    const sisterY = Math.max(rootY + 70, funders.length ? rootY + ((funders.length - 1) / 2) * ROW + 50 : -Infinity);
    sisters.forEach((n, i) => P.set(n.addr, { ...infos.get(n.addr), x: -56, y: sisterY + i * ROW, label: "left" }));

    if (funders.length) cols.push({ x: FUND_X, label: "Fondeo" });
    cols.push({ x: 0, label: sisters.length ? "Raíz y hermanas" : "Raíz" });
    for (let d = 1; d <= maxDepth; d++) cols.push({ x: X[d], label: d === 1 ? "1 salto" : `${d} saltos` });
  }

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P.values()) {
    x0 = Math.min(x0, p.x - (p.label === "left" ? p.r + 10 + p.lw : p.label === "below" ? p.lw / 2 : p.r) - 8);
    x1 = Math.max(x1, p.x + (p.label === "right" ? p.r + 10 + p.lw : p.label === "below" ? p.lw / 2 : p.r) + 8);
    y0 = Math.min(y0, p.y - p.r - 14);
    y1 = Math.max(y1, p.y + (p.label === "below" ? p.r + 38 : p.r + 14));
  }
  if (cols.length) y0 -= 34;
  return { P, bounds: { x0, y0, x1, y1 }, cols };
}

function followEdgePath(e, a, b, mode, tree, pw) {
  if (mode === "radial") {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const sx = a.x + (dx / len) * (a.r + 3), sy = a.y + (dy / len) * (a.r + 3);
    const ex = b.x - (dx / len) * (b.r + 3), ey = b.y - (dy / len) * (b.r + 3);
    const t = e.to === a.n.parent ? 0.4 : 0.5;
    return { d: `M${sx} ${sy}L${ex} ${ey}`, pill: tree ? { x: sx + (ex - sx) * t, y: sy + (ey - sy) * t } : null };
  }
  const sx = a.x + (a.inner && a.label === "right" ? a.r + 10 + a.lw + 6 : a.r + 3);
  if (!tree) {
    // Secondary link: thin curve between the two wallets, bending sideways when they share a column
    if (Math.abs(b.x - a.x) < 40) {
      const bx = a.x - 64;
      return { d: `M${a.x - a.r - 2} ${a.y}C${bx} ${a.y} ${bx} ${b.y} ${b.x - b.r - 2} ${b.y}`, pill: null };
    }
    if (b.x < a.x) {
      const my = Math.min(a.y, b.y) - 34;
      return { d: `M${a.x} ${a.y - a.r - 2}C${a.x - 40} ${my} ${b.x + 80} ${my} ${b.x + b.r * 0.7} ${b.y - b.r * 0.7 - 2}`, pill: null };
    }
    const ex = b.x - b.r - 3, mx = (sx + ex) / 2;
    return { d: `M${sx} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${ex} ${b.y}`, pill: null };
  }
  const ex = b.x - b.r - 3;
  if (a.label === "left") {
    // Funder → root: the amount sits right after the funder, then the line bends into the root
    const px = sx + pw + 14, mx = (px + ex) / 2;
    return { d: `M${sx} ${a.y}L${px} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${ex} ${b.y}`, pill: { x: sx + pw / 2 + 7, y: a.y } };
  }
  const tx = ex - pw - 14, mx = (sx + tx) / 2;
  return { d: `M${sx} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${tx} ${b.y}L${ex} ${b.y}`, pill: { x: ex - pw / 2 - 7, y: b.y } };
}

// ─── Follow · map ─────────────────────────────────────────────────────────────

const IconFollow = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6.4-6.4"/></>} />;
const IconFit    = (p) => <Icon {...p} path="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />;
const IconMinus  = (p) => <Icon {...p} path="M5 12h14" />;

const followBtn = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px",
  fontSize: 11.5, borderRadius: 6, border: "1px solid var(--line)",
  background: "var(--bg-2)", color: "var(--text-2)", whiteSpace: "nowrap",
};
const followCaps = { fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" };

function FollowGraph({ graph, mode, selected, onSelect, names, rootName, viewCmd, busyLabel, height }) {
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [user, setUser] = useState(null);           // the user's own pan / zoom: { key, x, y, k }
  const [hover, setHover] = useState(null);
  const [legend, setLegend] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  const layout = useMemo(() => followLayout(graph, mode, names, rootName), [graph, mode, names, rootName]);
  const nodes = useMemo(() => graph?.nodes || [], [graph]);
  const edges = useMemo(() => graph?.edges || [], [graph]);
  const byAddr = useMemo(() => new Map(nodes.map((n) => [n.addr, n])), [nodes]);
  const rootAddr = nodes.find((n) => n.role === "root")?.addr;
  const ready = size.w > 0 && size.h > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Until the user pans or zooms, the view is derived: the whole map fitted, or the root centred
  // ("Raíz" button). It falls back to that whenever the map changes shape or a view button is pressed.
  const shape = `${nodes.length}|${mode}`;
  const viewKey = `${shape}|${viewCmd?.nonce || 0}`;
  const autoView = useMemo(() => {
    if (!ready) return { x: 0, y: 0, k: 1 };
    const root = layout.P.get(rootAddr);
    if (viewCmd?.type === "center" && viewCmd.shape === shape && root) {
      return { k: 1, x: size.w * (mode === "radial" ? 0.5 : 0.3) - root.x, y: size.h / 2 - root.y };
    }
    const { x0, y0, x1, y1 } = layout.bounds;
    const k = followClamp(Math.min((size.w - 40) / (x1 - x0), (size.h - 40) / (y1 - y0)), 0.5, 1.1);
    return { k, x: size.w / 2 - ((x0 + x1) / 2) * k, y: size.h / 2 - ((y0 + y1) / 2) * k };
  }, [ready, layout, rootAddr, viewCmd, shape, mode, size.w, size.h]);
  const view = user?.key === viewKey ? user : autoView;

  const live = useRef({ view, viewKey });
  useEffect(() => { live.current = { view, viewKey }; });
  const setView = useCallback((fn) => {
    const { view: v, viewKey: key } = live.current;
    const next = { ...fn(v), key };
    live.current = { view: next, viewKey: key };
    setUser(next);
  }, []);

  // Pinch or ⌘/ctrl + wheel zooms toward the cursor; a plain wheel keeps scrolling the page
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      setView((v) => {
        const k = followClamp(v.k * Math.exp(-e.deltaY * 0.012), 0.35, 2.4), f = k / v.k;
        return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  const zoom = (f) => setView((v) => {
    const k = followClamp(v.k * f, 0.35, 2.4), g = k / v.k;
    return { k, x: size.w / 2 - (size.w / 2 - v.x) * g, y: size.h / 2 - (size.h / 2 - v.y) * g };
  });

  const onDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setGrabbing(true);
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onUp = () => {
    if (drag.current && !drag.current.moved) onSelect(null);
    drag.current = null;
    setGrabbing(false);
  };

  // Hovering a wallet lights up its path back to the root and every link it touches
  const { lit, chain } = useMemo(() => {
    if (!hover) return { lit: null, chain: null };
    const chain = new Set([hover]);
    for (let n = byAddr.get(hover), guard = 0; n?.parent && n.side === "out" && guard < 6; n = byAddr.get(n.parent), guard++) chain.add(n.parent);
    const lit = new Set(chain);
    for (const e of edges) { if (e.from === hover) lit.add(e.to); if (e.to === hover) lit.add(e.from); }
    return { lit, chain };
  }, [hover, byAddr, edges]);

  const focus = hover || selected;
  const drawn = edges.map((e, i) => {
    const a = layout.P.get(e.from), b = layout.P.get(e.to);
    if (!a || !b) return null;
    const child = byAddr.get(e.to), src = byAddr.get(e.from);
    const tree = !e.extra && (child?.parent === e.from || src?.side === "in") && src?.side !== "sib";
    const colorNode = src?.side === "in" || src?.side === "sib" ? src : child;
    const color = (FOLLOW_ROLES[colorNode?.role] || FOLLOW_ROLES.other).color;
    const on = lit ? e.from === hover || e.to === hover || (tree && chain.has(e.from) && chain.has(e.to)) : true;
    const touches = focus && (e.from === focus || e.to === focus);
    const w = followClamp(1 + Math.log10(1 + (e.sol || 0) + (e.usd || 0) / 150) * 1.5, 1, 5.5);
    const twoWay = tree && child?.parent === e.from && (child.back || 0) >= FOLLOW_EDGE_SOL;
    const text = `${e.guess ? "≈ " : ""}${twoWay ? "⇄ " : ""}${fmtPill(e.sol, e.usd)}`;
    const pw = text.length * 5.9 + 12;
    return { e, i, tree, color, on, touches, w, text, pw, ...followEdgePath(e, a, b, mode, tree, pw) };
  }).filter(Boolean);

  const present = Object.keys(FOLLOW_ROLES).filter((r) => nodes.some((n) => n.role === r));

  return (
    <div ref={wrapRef} style={{
      position: "relative", height, overflow: "hidden", flexShrink: 0,
      borderBottom: "1px solid var(--line)",
      background: "radial-gradient(ellipse 70% 80% at 32% 45%, color-mix(in oklch, var(--accent) 5%, transparent), transparent 70%), var(--bg)",
    }}>
      <svg width="100%" height="100%" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ display: "block", touchAction: "none", cursor: grabbing ? "grabbing" : "grab", userSelect: "none" }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {layout.cols.map((c) => (
            <g key={c.label}>
              <line x1={c.x} x2={c.x} y1={layout.bounds.y0 + 22} y2={layout.bounds.y1 + 10}
                style={{ stroke: "var(--line)", strokeDasharray: "1 7", strokeLinecap: "round", opacity: 0.7 }} />
              <text x={c.x} y={layout.bounds.y0 + 10} textAnchor="middle"
                style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.16em", fill: "var(--text-4)", textTransform: "uppercase" }}>
                {c.label}
              </text>
            </g>
          ))}

          {drawn.filter((d) => !d.tree).map((d) => (
            <path key={`x${d.i}`} d={d.d} fill="none"
              style={{
                stroke: d.color, strokeWidth: d.touches ? 1.6 : 1.1, strokeDasharray: "3 5", strokeLinecap: "round",
                opacity: lit ? (d.on ? 0.95 : 0.06) : d.touches ? 0.9 : byAddr.get(d.e.from)?.side === "sib" ? 0.7 : 0.32, transition: "opacity 140ms ease",
              }}>
              <title>{`${shortAddr(d.e.from, 4, 4)} → ${shortAddr(d.e.to, 4, 4)} · ${fmtAmount(d.e.sol, d.e.usd)}`}</title>
            </path>
          ))}

          {drawn.filter((d) => d.tree).map((d) => (
            <g key={`t${d.i}`} style={{ opacity: d.on ? 1 : 0.1, transition: "opacity 140ms ease" }}>
              <path d={d.d} fill="none" style={{ stroke: d.color, strokeWidth: d.w, strokeLinecap: "round", opacity: 0.3, strokeDasharray: d.e.manual ? "2 6" : d.e.guess ? "5 5" : "none" }} />
              {!d.e.manual && <path d={d.d} fill="none" className="follow-flow" style={{ stroke: d.color, strokeWidth: Math.min(4, d.w + 0.6), strokeLinecap: "round", strokeDasharray: "1 10", opacity: 0.95 }} />}
            </g>
          ))}

          {drawn.filter((d) => d.pill && (d.e.sol > 0 || d.e.usd > 0)).map((d) => {
            const pw = d.pw;
            return (
              <g key={`p${d.i}`} transform={`translate(${d.pill.x} ${d.pill.y})`} style={{ opacity: d.on ? 1 : 0.1, transition: "opacity 140ms ease", pointerEvents: "none" }}>
                <rect x={-pw / 2} y={-8.5} width={pw} height={17} rx={4.5}
                  style={{ fill: "var(--bg-2)", stroke: `color-mix(in oklch, ${d.color} 35%, var(--line))`, strokeWidth: 1 }} />
                <text y={3.4} textAnchor="middle" style={{ fontFamily: "var(--mono)", fontSize: 9.5, fill: "var(--text-2)" }}>{d.text}</text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const p = layout.P.get(n.addr);
            if (!p) return null;
            const color = (FOLLOW_ROLES[n.role] || FOLLOW_ROLES.other).color;
            const isSel = selected === n.addr, isHov = hover === n.addr;
            const dim = lit && !lit.has(n.addr);
            const lx = p.label === "right" ? p.r + 10 : p.label === "left" ? -p.r - 10 : 0;
            const anchor = p.label === "right" ? "start" : p.label === "left" ? "end" : "middle";
            const y1 = p.label === "below" ? p.r + 18 : -2, y2 = y1 + 13;
            const tw = p.badge === 1 ? p.w1 : p.w2;   // width of the line the score badge sits on
            const halo ={ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 4, strokeLinejoin: "round" };
            const circ = 2 * Math.PI * (p.r + 4);
            return (
              <g key={n.addr} transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(n.addr === rootAddr ? null : n.addr)}
                onMouseEnter={() => setHover(n.addr)} onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer", opacity: dim ? 0.22 : 1, transition: "opacity 140ms ease" }}>
                <circle r={p.r + 11} style={{ fill: color, opacity: isSel || isHov ? 0.26 : 0.11 }} />
                {n.role === "root" && (
                  <circle r={p.r + 7} fill="none" className="follow-spin"
                    style={{ stroke: color, strokeWidth: 1.4, strokeDasharray: "2 6", strokeLinecap: "round", opacity: 0.9 }} />
                )}
                {n.score != null && (
                  <circle r={p.r + 4} fill="none" transform="rotate(-90)"
                    style={{ stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeDasharray: `${(n.score / 100) * circ} ${circ}`, opacity: 0.9 }} />
                )}
                <circle r={p.r} style={{
                  fill: `color-mix(in oklch, ${color} ${n.role === "exchange" || n.role === "other" ? 45 : 80}%, var(--bg))`,
                  stroke: isSel ? "var(--text)" : `color-mix(in oklch, ${color} 60%, white)`, strokeWidth: isSel ? 2 : 1.2,
                }} />
                {n.role === "root" && <circle r={4} style={{ fill: "none", stroke: "var(--accent-ink)", strokeWidth: 1.6 }} />}
                <text x={lx} y={y1} textAnchor={anchor}
                  style={{ ...halo, fontFamily: "var(--mono)", fontSize: 11, fontWeight: 500, fill: n.role === "exchange" || n.role === "other" ? "var(--text-3)" : "var(--text)" }}>
                  {p.line1}
                </text>
                {p.badge > 0 && (
                  <g transform={`translate(${p.label === "right" ? lx + tw + 7 : p.label === "left" ? lx - tw - 30 : tw / 2 + 6} ${(p.badge === 1 ? y1 : y2) - 9.5})`}>
                    <rect width={23} height={13} rx={3.5} style={{ fill: `color-mix(in oklch, ${color} 22%, var(--bg))`, stroke: `color-mix(in oklch, ${color} 45%, transparent)`, strokeWidth: 1 }} />
                    <text x={11.5} y={9.6} textAnchor="middle" style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, fill: color }}>{n.score}</text>
                  </g>
                )}
                <text x={lx} y={y2} textAnchor={anchor}
                  style={{ ...halo, fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", fill: color }}>
                  {p.tag}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {busyLabel && (
        <div style={{
          position: "absolute", left: 16, bottom: 14, display: "inline-flex", alignItems: "center", gap: 8,
          padding: "6px 11px", borderRadius: 7, background: "var(--bg-2)", border: "1px solid var(--line-2)",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse-dot 1.1s ease-in-out infinite" }} />
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-2)" }}>{busyLabel}</span>
        </div>
      )}

      <div style={{ position: "absolute", right: 14, bottom: 14, display: "flex", alignItems: "flex-end", gap: 8 }}>
        {legend && (
          <div style={{
            width: 318, padding: "12px 14px", borderRadius: 9, background: "var(--bg-2)",
            border: "1px solid var(--line-2)", boxShadow: "0 18px 44px rgba(0,0,0,0.45)", animation: "fade-in 160ms ease",
          }}>
            {present.map((r) => (
              <div key={r} style={{ display: "flex", gap: 9, padding: "4px 0", alignItems: "baseline" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: FOLLOW_ROLES[r].color, flexShrink: 0, transform: "translateY(-1px)" }} />
                <span style={{ fontSize: 11.5, lineHeight: 1.45, color: "var(--text-3)" }}>
                  <b style={{ color: "var(--text)", fontWeight: 600 }}>{FOLLOW_ROLES[r].label}.</b> {FOLLOW_ROLES[r].desc}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 11, lineHeight: 1.5, color: "var(--text-3)" }}>
              Los montos sobre las líneas están en SOL. El número junto a una wallet (1–99) mide qué tan probable es que sea suya. <b style={{ color: "var(--text-2)", fontWeight: 500 }}>⇄</b> el SOL fue y volvió.
              <b style={{ color: "var(--text-2)", fontWeight: 500 }}> ≈</b> enlace deducido por monto y hora, no directo.
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", borderRadius: 7, border: "1px solid var(--line)", background: "var(--bg-2)", overflow: "hidden" }}>
            <button title="Acercar (⌘ + rueda)" onClick={() => zoom(1.25)} style={{ width: 30, height: 28, color: "var(--text-2)", display: "grid", placeItems: "center" }}><IconPlus size={12} /></button>
            <button title="Alejar" onClick={() => zoom(0.8)} style={{ width: 30, height: 28, color: "var(--text-2)", display: "grid", placeItems: "center", borderTop: "1px solid var(--line)" }}><IconMinus size={12} /></button>
          </div>
          <button onClick={() => setLegend((v) => !v)} style={{ ...followBtn, border: `1px solid ${legend ? "var(--line-2)" : "var(--line)"}`, color: legend ? "var(--text)" : "var(--text-2)" }}>
            <IconInfo size={12} /> Colores
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Follow · activity ────────────────────────────────────────────────────────

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function FollowTimeline({ trades, wallets, range, now, tokenName }) {
  const [ref, w] = useWidth();
  const span = range === "24h" ? FOLLOW_DAY : 7 * FOLLOW_DAY;
  const t0 = now - span;
  const L = 92, R = 16, ROWH = 30, TOP = 8;
  const H = TOP + wallets.length * ROWH + 24;
  const X = (ts) => L + ((ts - t0) / span) * Math.max(1, w - L - R);

  const ticks = [];
  if (range === "24h") {
    const d = new Date(t0 * 1000); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
    for (let t = d.getTime() / 1000; t <= now; t += 3600) {
      const h = new Date(t * 1000).getHours();
      if (h % 3 === 0) ticks.push({ t, label: `${String(h).padStart(2, "0")}:00` });
    }
  } else {
    const d = new Date(t0 * 1000); d.setHours(24, 0, 0, 0);
    for (let t = d.getTime() / 1000; t <= now; t += FOLLOW_DAY) {
      ticks.push({ t, label: new Date(t * 1000).toLocaleDateString("es", { weekday: "short", day: "numeric" }) });
    }
  }
  const shown = trades.filter((t) => t.ts >= t0).sort((a, b) => b.sol - a.sol);

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {w > 0 && (
        <svg width={w} height={H} style={{ display: "block" }}>
          {ticks.map((k) => (
            <g key={k.t}>
              <line x1={X(k.t)} x2={X(k.t)} y1={TOP} y2={H - 20} style={{ stroke: "var(--line)", strokeWidth: 1 }} />
              <text x={X(k.t)} y={H - 5} textAnchor="middle" style={{ fontFamily: "var(--mono)", fontSize: 9.5, fill: "var(--text-4)" }}>{k.label}</text>
            </g>
          ))}
          {wallets.map((wal, i) => {
            const y = TOP + i * ROWH + ROWH / 2;
            return (
              <g key={wal}>
                <text x={0} y={y + 3.5} style={{ fontFamily: "var(--mono)", fontSize: 10.5, fill: "var(--text-3)" }}>{shortAddr(wal, 4, 4)}</text>
                <line x1={L} x2={w - R} y1={y} y2={y} style={{ stroke: "var(--line)", strokeDasharray: "1 5", strokeLinecap: "round" }} />
                {shown.filter((t) => t.wallet === wal).map((t) => {
                  const buy = t.side === "buy";
                  const r = followClamp(2.6 + Math.sqrt(Math.max(0, t.sol)) * 2.6, 2.6, 9);
                  return (
                    <circle key={t.sig + t.mint} cx={X(t.ts)} cy={y} r={r}
                      style={{
                        fill: buy ? "var(--accent)" : "none", fillOpacity: 0.78,
                        stroke: buy ? "color-mix(in oklch, var(--accent) 55%, var(--bg))" : "var(--danger)", strokeWidth: buy ? 1 : 1.3, strokeOpacity: buy ? 1 : 0.8,
                      }}>
                      <title>{`${buy ? "Compra" : "Venta"} ${tokenName(t.mint)} · ${fmtAmount(t.sol, t.usd)} · ${fmtClock(t.ts)}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
          <line x1={X(now)} x2={X(now)} y1={TOP - 2} y2={H - 20} style={{ stroke: "var(--danger)", strokeWidth: 1, opacity: 0.8 }} />
        </svg>
      )}
    </div>
  );
}

function FollowActivity({ person, insights, now, range, setRange, tokenName, onSelect, onHuntToken }) {
  const wallets = useMemo(() => [person.root, ...(person.aliases || [])], [person.root, person.aliases]);
  const trades = person.trades || [];
  const per = wallets.map((w) => ({ w, s: followWalletStats(trades, w, now) })).sort((a, b) => b.s.b7 - a.s.b7);
  const total = insights.stats;
  const main = per[0];
  const buying = per.filter((p) => p.s.b7 > 0);
  const span = range === "24h" ? FOLLOW_DAY : 7 * FOLLOW_DAY;
  const tokens = followTokenRows(trades, now, span).slice(0, 7);

  let headline;
  if (!total.b7) headline = "Sin compras en los últimos 7 días.";
  else if (buying.length <= 1) headline = `Solo está comprando con ${shortAddr(main.w, 4, 4)}: ${total.b24} compra${total.b24 === 1 ? "" : "s"} en 24 h (${fmtSol(total.vol24)} SOL), ${total.b7} en 7 d, última ${fmtAgo(total.last, now)}.`;
  else headline = `Compra con ${buying.length} wallets: ${total.b24} compra${total.b24 === 1 ? "" : "s"} en 24 h (${fmtSol(total.vol24)} SOL), ${total.b7} en 7 d, última ${fmtAgo(total.last, now)}.`;

  const toneColor = { accent: "var(--accent)", info: "var(--info)", warn: "var(--warn)", muted: "var(--text-4)" };
  const cell = { padding: "6px 10px 6px 0", fontSize: 12, whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "18px 24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.005em", lineHeight: 1.4, textWrap: "pretty" }}>{headline}</div>
          {total.b7 > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
              {total.b7} compras y {total.s7} ventas en 7 d · {fmtSol(total.vol7)} SOL comprados · {total.tokens7} token{total.tokens7 === 1 ? "" : "s"}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 7, border: "1px solid var(--line)", background: "var(--bg-2)", flexShrink: 0 }}>
          {[["24h", "24 h"], ["7d", "7 días"]].map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)} style={{
              padding: "4px 11px", borderRadius: 5, fontSize: 11.5, fontWeight: 500,
              background: range === k ? "var(--surface-2)" : "transparent", color: range === k ? "var(--text)" : "var(--text-3)",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        {per.map(({ w, s }, i) => (
          <div key={w} style={{
            width: 292, padding: "12px 14px", borderRadius: 10, background: "var(--bg-2)",
            border: "1px solid var(--line)", borderLeft: `3px solid ${i === 0 && s.b7 > 0 ? "var(--accent)" : "var(--line-2)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <button onClick={() => onSelect(w === person.root ? null : w)} className="mono" style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>{shortAddr(w, 4, 4)}</button>
              <div style={{ flex: 1 }} />
              {i === 0 && s.b7 > 0 && <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 4, color: "var(--accent-2)", background: "color-mix(in oklch, var(--accent) 16%, transparent)" }}>PRINCIPAL</span>}
              {w !== person.root && <span className="mono" style={{ fontSize: 9.5, color: "var(--text-4)", letterSpacing: "0.08em" }}>CONFIRMADA</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[[s.b1, "compras 1 h"], [s.b24, "compras 24 h"], [s.b7, "compras 7 d"]].map(([v, label]) => (
                <div key={label} style={{ flex: 1, padding: "7px 4px 6px", borderRadius: 7, background: "var(--bg)", border: "1px solid var(--line)", textAlign: "center" }}>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.1, color: v ? "var(--text)" : "var(--text-4)" }}>{v}</div>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 9, lineHeight: 1.55 }}>
              Volumen 24 h <b style={{ color: "var(--text)", fontWeight: 600 }}>{fmtSol(s.vol24)} SOL</b> · {s.tokens24} moneda{s.tokens24 === 1 ? "" : "s"}<br />
              Última compra {s.last ? <><b style={{ color: "var(--text)", fontWeight: 600 }}>{fmtClock(s.last)}</b> ({fmtAgo(s.last, now)})</> : "—"}
            </div>
          </div>
        ))}

        {insights.items.length > 0 && (
          <div style={{ flex: "1 1 300px", minWidth: 280, padding: "12px 14px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
            <div style={{ ...followCaps, marginBottom: 8 }}>Señales del mapa</div>
            {insights.items.map((it, i) => (
              <button key={i} disabled={!it.addr} onClick={() => it.addr && onSelect(it.addr)}
                style={{ display: "flex", gap: 9, width: "100%", textAlign: "left", padding: "5px 0", cursor: it.addr ? "pointer" : "default", alignItems: "flex-start" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: toneColor[it.tone], marginTop: 5, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                    {it.text}{it.score != null && <span className="mono" style={{ marginLeft: 7, fontSize: 10.5, color: toneColor[it.tone] }}>{it.score}</span>}
                  </span>
                  {it.sub && <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", lineHeight: 1.45 }}>{it.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {total.b7 + total.s7 > 0 && (
        <FollowTimeline trades={trades} wallets={wallets} range={range} now={now} tokenName={tokenName} />
      )}

      {tokens.length > 0 && (
        <div>
          <div style={{ ...followCaps, marginBottom: 6 }}>Tokens que movió · {range === "24h" ? "24 h" : "7 días"}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  {["Token", "Compras", "Ventas", "Neto", "Último", ""].map((h, i) => (
                    <th key={i} style={{ ...followCaps, fontSize: 9.5, fontWeight: 500, textAlign: i === 0 || i === 5 ? "left" : "right", padding: "4px 18px 6px 0", borderBottom: "1px solid var(--line)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tokens.map((r) => {
                  const net = r.got - r.spent;
                  return (
                    <tr key={r.mint} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ ...cell, paddingRight: 18 }}>
                        <a href={`https://gmgn.ai/sol/token/${r.mint}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, textDecoration: "none" }}>{tokenName(r.mint)}</a>
                      </td>
                      <td className="mono" style={{ ...cell, textAlign: "right", paddingRight: 18, color: "var(--text-2)" }}>{r.buys ? `${r.buys} · ${fmtSol(r.spent)}` : "—"}</td>
                      <td className="mono" style={{ ...cell, textAlign: "right", paddingRight: 18, color: "var(--text-2)" }}>{r.sells ? `${r.sells} · ${fmtSol(r.got)}` : "—"}</td>
                      <td className="mono" style={{ ...cell, textAlign: "right", paddingRight: 18, color: !r.sells ? "var(--text-3)" : net >= 0 ? "var(--accent-2)" : "var(--danger)" }}>
                        {!r.sells ? "abierta" : `${net >= 0 ? "+" : "−"}${fmtSol(Math.abs(net))}`}
                      </td>
                      <td style={{ ...cell, textAlign: "right", paddingRight: 18, color: "var(--text-3)", fontSize: 11.5 }}>{fmtAgo(r.last, now)}</td>
                      <td style={cell}>
                        <button title="Cazar quién más compró este token temprano" onClick={() => onHuntToken(r.mint)} style={{ ...followBtn, padding: "3px 8px", fontSize: 11 }}>
                          <IconTarget size={11} /> Cazar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 6 }}>Neto = SOL de ventas − SOL de compras en el periodo. “Abierta” = compró y aún no vende.</div>
        </div>
      )}
    </div>
  );
}

// ─── Follow · profile panel ───────────────────────────────────────────────────

function FollowProfile({ person, graph, node, group, now, tokenName, seenTs, onSelect, onAlias, onUnalias, onFollowNew, onTrace }) {
  const [copied, setCopied] = useState(false);
  const nodes = graph?.nodes || [];
  const rootNode = nodes.find((n) => n.role === "root");
  const cur = node || rootNode || { addr: person.root, role: "root" };
  const isOwn = cur.addr === person.root || (person.aliases || []).includes(cur.addr);
  const role = FOLLOW_ROLES[cur.role] || FOLLOW_ROLES.other;
  const onMap = new Set(nodes.map((n) => n.addr));
  const st = followWalletStats(person.trades || [], cur.addr, now);
  const fetched = cur.buys != null;

  const flows = [
    ...(cur.flowsIn || []).map((f) => ({ ...f, dir: "in" })),
    ...(cur.flowsOut || []).map((f) => ({ ...f, dir: "out" })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 7);

  const feed = isOwn
    ? (person.trades || []).slice(0, 80)
    : (cur.trades || []).map((t) => ({ ...t, wallet: cur.addr }));
  const copy = () => {
    navigator.clipboard.writeText(cur.addr).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const stat = (value, label) => (
    <div style={{ flex: 1, minWidth: 0, padding: "9px 8px 8px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--line)" }}>
      <div className="mono" style={{ fontSize: typeof value === "string" ? 12 : 16, fontWeight: 600, lineHeight: "19px", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, lineHeight: 1.3, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
  const linkBtn = { ...followBtn, textDecoration: "none", background: "var(--bg)" };

  return (
    <>
      <div style={{ padding: "16px 18px 18px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ ...followCaps, marginBottom: 10 }}>Perfil</div>
        <div style={{ padding: 14, borderRadius: 11, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span className="mono" style={{
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: 10,
              color: role.color, background: `color-mix(in oklch, ${role.color} 15%, transparent)`, border: `1px solid color-mix(in oklch, ${role.color} 35%, transparent)`,
            }}>
              {cur.exName || role.label}{isOwn ? ` · ${person.name}` : ""}
            </span>
            {cur.score != null && !isOwn && (
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{followVerdict(cur.score)} que sea suya</span>
            )}
          </div>
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.6, wordBreak: "break-all", color: "var(--text)" }}>{cur.addr}</div>

          {(isOwn || fetched) && (
            <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
              {isOwn ? (
                <>
                  {stat(st.b7, "compras 7 d")}
                  {stat(st.s7, "ventas 7 d")}
                  {stat(st.last ? fmtAgo(st.last, now) : "—", "últ. compra")}
                </>
              ) : (
                <>
                  {stat(cur.buys, "compras")}
                  {stat(cur.sells, "ventas")}
                  {stat(cur.lastBuyTs ? fmtAgo(cur.lastBuyTs, now) : "—", "últ. compra")}
                </>
              )}
            </div>
          )}
          {!isOwn && fetched && (
            <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 6 }}>
              Sobre sus últimas {cur.txCount} transacciones{cur.complete ? " (todo su historial)" : ""}.
            </div>
          )}

          {cur.score != null && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--bg)", border: `1px solid color-mix(in oklch, ${role.color} 28%, var(--line))` }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: role.color, lineHeight: 1 }}>{cur.score}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{isOwn ? "de 99 · señales que la ligan a la raíz" : "de 99 · por qué podría ser suya"}</span>
              </div>
              {(cur.why || []).map((w, i) => (
                <div key={i} style={{ display: "flex", gap: 7, fontSize: 11.5, lineHeight: 1.45, color: "var(--text-2)", padding: "2px 0" }}>
                  <IconCheck size={11} style={{ color: role.color, flexShrink: 0, marginTop: 3 }} /> <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {cur.side === "in" && cur.sent > 0 && (
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 12 }}>
              Le mandó <b style={{ fontWeight: 600, color: "var(--text)" }}>{fmtAmount(cur.sent, cur.sentUsd)}</b> a la raíz {fmtAgo(cur.sentTs, now)}.
            </div>
          )}
          {cur.role === "distributor" && (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 12, lineHeight: 1.5 }}>
              Paga a {cur.receivers} wallet{cur.receivers === 1 ? "" : "s"} y cobra de {cur.senders}: funciona como tesorería. Las que fondea y le devuelven SOL son las candidatas a ser del mismo dueño.
            </div>
          )}
          {group && group.length > 1 && (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 12, lineHeight: 1.6 }}>
              En el mapa este punto agrupa {group.length} exchanges donde termina el rastro:{" "}
              {group.map((a, i) => (
                <span key={a}>
                  <button onClick={() => onSelect(a)} className="mono" style={{ fontSize: 11, color: a === cur.addr ? "var(--text)" : "var(--text-2)", textDecoration: "underline", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3 }}>{shortAddr(a, 4, 4)}</button>
                  {i < group.length - 1 ? ", " : "."}
                </span>
              ))}
            </div>
          )}
          {cur.role === "exchange" && cur.lost && (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 12, lineHeight: 1.5 }}>
              Mueve demasiado volumen para emparejar entradas con salidas: desde aquí el rastro no es confiable.
            </div>
          )}

          {flows.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 3 }}>
              {flows.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
                  <span style={{ color: f.dir === "in" ? "var(--accent-2)" : "var(--text-3)" }}>{f.dir === "in" ? "←" : "→"}</span>{" "}
                  {f.dir === "in" ? "recibió" : "envió"} {fmtAmount(f.sol, f.usd)} {f.dir === "in" ? "de" : "a"}{" "}
                  {onMap.has(f.addr) ? (
                    <button onClick={() => onSelect(f.addr === person.root ? null : f.addr)} className="mono"
                      style={{ fontSize: 11.5, color: "var(--text)", textDecoration: "underline", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3 }}>
                      {shortAddr(f.addr, 4, 4)}
                    </button>
                  ) : (
                    <a href={`https://solscan.io/account/${f.addr}`} target="_blank" rel="noreferrer" className="mono"
                      style={{ fontSize: 11.5, color: "var(--text-3)", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3 }}>
                      {shortAddr(f.addr, 4, 4)}
                    </a>
                  )}{" "}
                  <span style={{ color: "var(--text-4)" }}>{fmtAgo(f.ts, now)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            <a href={`https://solscan.io/account/${cur.addr}`} target="_blank" rel="noreferrer" style={linkBtn}>Solscan</a>
            <a href={`https://gmgn.ai/sol/address/${cur.addr}`} target="_blank" rel="noreferrer" style={linkBtn}>GMGN</a>
            <button onClick={copy} style={linkBtn}>{copied ? "Copiado" : "Copiar"}</button>
            <button onClick={() => onTrace(cur.addr)} style={linkBtn} title="Abrir en el rastreador de SOL / USDC">Rastrear</button>
          </div>

          {cur.addr !== person.root && cur.role !== "exchange" && cur.role !== "deposit" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
              {isOwn ? (
                <button onClick={() => onUnalias(cur.addr)} style={linkBtn}>Quitar de sus wallets</button>
              ) : (
                <button onClick={() => onAlias(cur.addr)} title="Suma sus compras y ventas a las de esta persona"
                  style={{ ...followBtn, background: "var(--accent)", border: "1px solid var(--accent)", color: "var(--accent-ink)", fontWeight: 600 }}>
                  <IconCheck size={12} /> Es su wallet
                </button>
              )}
              {!isOwn && <button onClick={() => onFollowNew(cur.addr)} style={linkBtn}><IconPlus size={11} /> Seguir aparte</button>}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "14px 18px 6px", ...followCaps }}>
        {isOwn ? "Compras y ventas recientes (todas sus wallets)" : "Compras y ventas de esta wallet"}
      </div>
      {feed.length === 0 && (
        <div style={{ padding: "8px 18px 20px", fontSize: 12, color: "var(--text-3)" }}>
          {fetched || isOwn ? "Sin compras ni ventas en lo que se leyó." : "No se leyó el historial de esta wallet."}
        </div>
      )}
      {feed.map((t) => {
        const buy = t.side === "buy";
        return (
          <div key={t.sig + t.mint} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 18px", borderTop: "1px solid var(--line)" }}>
            <span className="mono" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", width: 50, flexShrink: 0, color: buy ? "var(--accent-2)" : "var(--danger)" }}>
              {buy ? "COMPRA" : "VENTA"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={`https://gmgn.ai/sol/token/${t.mint}`} target="_blank" rel="noreferrer"
                style={{ display: "block", fontSize: 12.5, fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tokenName(t.mint)}
                {isOwn && seenTs > 0 && t.ts > seenTs && <span title="Nuevo desde tu última visita" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginLeft: 7, transform: "translateY(-1px)" }} />}
              </a>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>{shortAddr(t.wallet, 4, 4)}</span>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div className="mono" style={{ fontSize: 12, color: "var(--text)" }}>{fmtAmount(t.sol, t.usd)}</div>
              <a href={`https://solscan.io/tx/${t.sig}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 10.5, color: "var(--text-3)", textDecorationColor: "var(--line-2)", textUnderlineOffset: 2 }}>
                {fmtClock(t.ts)}
              </a>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Follow · view ────────────────────────────────────────────────────────────

function followErrorText(e) {
  if (e.name === "AbortError") return "";
  if (e.code === "INVALID_KEY") return "API key inválida — revisa VITE_HELIUS_API_KEY en .env";
  if (e.code === "RATE_LIMIT") return "Helius está limitando las peticiones. Espera unos segundos y vuelve a escanear.";
  return `No se pudo escanear: ${e.message}`;
}

function ViewSwitch({ view, setView }) {
  return (
    <div style={{ display: "flex", gap: 3, background: "var(--bg)", padding: 3, borderRadius: 7, border: "1px solid var(--line)" }}>
      {[["hunt", "Cazar"], ["follow", "Seguir"]].map(([k, label]) => (
        <button key={k} onClick={() => setView(k)} style={{
          flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "6px 0", borderRadius: 5, fontSize: 11.5, fontWeight: 600, transition: "all 150ms ease",
          background: view === k ? "var(--surface-2)" : "transparent", color: view === k ? "var(--text)" : "var(--text-3)",
        }}>
          {k === "hunt" ? <IconTarget size={12} /> : <IconFollow size={12} />} {label}
        </button>
      ))}
    </div>
  );
}

function FollowView({ active, apiKey, seed, viewSwitch, onTrace, onHuntToken }) {
  const [people, setPeople] = useState(followLoad);
  const [selId, setSelId]   = useState(() => localStorage.getItem("follow_sel") || null);
  const [nodeSel, setNodeSel] = useState(null);     // wallet picked on the map; null = the root
  const [mode, setMode]     = useState("layers");
  const [range, setRange]   = useState("7d");
  const [busy, setBusy]     = useState(null);       // { id, kind: "scan" | "check", label, graph }
  const [error, setError]   = useState("");
  const [auto, setAuto]     = useState(() => localStorage.getItem("follow_auto") !== "0");
  const [tokens, setTokens] = useState(() => { try { return JSON.parse(localStorage.getItem("follow_tokens") || "{}"); } catch { return {}; } });
  const [now, setNow]       = useState(followNow);
  const [viewCmd, setViewCmd] = useState(null);     // "Raíz" / "Ver todo": { type, nonce, shape }
  const [seenTs, setSeenTs] = useState(0);          // trades newer than this are marked as new for the open person
  const [form, setForm]     = useState({ name: "", wallet: "" });
  const [formErr, setFormErr] = useState("");
  const [renaming, setRenaming] = useState(null);

  const peopleRef = useRef(people);
  const tokensRef = useRef(tokens);
  const opRef     = useRef(null);                   // the running scan / check: { ctrl, kind }
  useEffect(() => { peopleRef.current = people; followSave(people); }, [people]);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { localStorage.setItem("follow_auto", auto ? "1" : "0"); }, [auto]);
  useEffect(() => { const t = setInterval(() => setNow(followNow()), 30000); return () => clearInterval(t); }, []);

  const person = people.find((p) => p.id === selId) || people[0] || null;
  const graph  = busy && person && busy.id === person.id && busy.graph ? busy.graph : person?.graph || null;

  const updatePerson = useCallback((id, fn) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }, []);

  const loadTokens = useCallback(async (mints, signal) => {
    const missing = [...new Set(mints)].filter((m) => !tokensRef.current[m]).slice(0, 300);
    if (!missing.length) return;
    try {
      const meta = await followFetchTokenMeta(missing, apiKey, signal);
      setTokens((prev) => {
        const entries = Object.entries({ ...prev, ...meta }).slice(-800);
        const next = Object.fromEntries(entries);
        try { localStorage.setItem("follow_tokens", JSON.stringify(next)); } catch { /* cache only */ }
        return next;
      });
    } catch { /* names are a nicety */ }
  }, [apiKey]);

  const runScan = useCallback(async (p) => {
    if (!apiKey) { setError("API key no configurada — agrega VITE_HELIUS_API_KEY en .env"); return; }
    opRef.current?.ctrl.abort();
    const ctrl = new AbortController();
    opRef.current = { ctrl, kind: "scan" };
    setError("");
    setBusy({ id: p.id, kind: "scan", label: "Empezando…", graph: null });
    try {
      const res = await followScan(p, apiKey, ctrl.signal, (ev) => {
        if (!ctrl.signal.aborted) setBusy({ id: p.id, kind: "scan", label: ev.label, graph: ev.graph });
      });
      updatePerson(p.id, (old) => ({
        ...old, graph: { nodes: res.nodes, edges: res.edges }, trades: res.trades,
        scannedAt: res.scannedAt, checkedAt: res.scannedAt,
        alerts: (old.alerts || []).filter((a) => a.kind !== "outflow"),
      }));
      loadTokens([...res.trades.map((t) => t.mint), ...res.nodes.flatMap((n) => (n.trades || []).map((t) => t.mint))], ctrl.signal);
    } catch (e) { setError(followErrorText(e)); }
    finally {
      if (opRef.current?.ctrl === ctrl) { opRef.current = null; setBusy(null); }
    }
  }, [apiKey, updatePerson, loadTokens]);

  const runCheck = useCallback(async (p, signal) => {
    const r = await followRefresh(p, apiKey, signal);
    updatePerson(p.id, (old) => {
      const seen = new Set((old.alerts || []).map((a) => `${a.kind}:${a.addr}:${a.ts}`));
      const since = r.checkedAt - 7 * FOLLOW_DAY;
      return {
        ...old,
        trades: [...r.fresh, ...(old.trades || [])].filter((t) => t.ts >= since).sort((a, b) => b.ts - a.ts).slice(0, 400),
        graph: old.graph ? { ...old.graph, nodes: r.nodes } : old.graph,
        alerts: [...(old.alerts || []), ...r.alerts.filter((a) => !seen.has(`${a.kind}:${a.addr}:${a.ts}`))].slice(-6),
        checkedAt: r.checkedAt,
      };
    });
    loadTokens(r.fresh.map((t) => t.mint), signal);
  }, [apiKey, updatePerson, loadTokens]);

  // Light re-check of everyone, only while this view is open and the tab is visible
  useEffect(() => {
    if (!active || !auto || !apiKey) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.hidden || opRef.current) return;
      const ctrl = new AbortController();
      opRef.current = { ctrl, kind: "check" };
      try {
        for (const p of peopleRef.current) {
          if (stop || ctrl.signal.aborted) break;
          if (!p.graph || followNow() - (p.checkedAt || 0) < 170) continue;
          setBusy({ id: p.id, kind: "check", label: "Revisando compras nuevas…", graph: null });
          try { await runCheck(p, ctrl.signal); } catch (e) { if (e.name === "AbortError" || e.code) break; }
        }
      } finally {
        if (opRef.current?.ctrl === ctrl) { opRef.current = null; setBusy(null); }
      }
    };
    // The first pass waits a beat so StrictMode's mount → unmount → mount in dev starts it only once
    const first = setTimeout(tick, 1200);
    const t = setInterval(tick, 60000);
    return () => { stop = true; clearTimeout(first); clearInterval(t); if (opRef.current?.kind === "check") opRef.current.ctrl.abort(); };
  }, [active, auto, apiKey, runCheck]);

  const select = (id) => {
    const p = peopleRef.current.find((x) => x.id === id);
    if (!p) return;
    setSelId(id);
    localStorage.setItem("follow_sel", id);
    setNodeSel(null);
    setSeenTs(p.seenTs || 0);
    updatePerson(id, (old) => ({ ...old, seenTs: followNow() }));
  };

  const addPerson = (name, wallet, quiet) => {
    const w = (wallet || "").trim();
    if (!isSolAddress(w)) { setFormErr("Esa no parece una wallet de Solana válida."); return false; }
    const existing = peopleRef.current.find((p) => p.root === w || (p.aliases || []).includes(w));
    if (existing) { select(existing.id); if (!quiet) setFormErr(`Ya sigues esa wallet: ${existing.name}.`); return false; }
    const p = {
      id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      name: (name || "").trim() || shortAddr(w, 4, 4), root: w, aliases: [],
      addedAt: followNow(), seenTs: followNow(), trades: [], graph: null, alerts: [],
    };
    peopleRef.current = [p, ...peopleRef.current];
    setPeople((prev) => [p, ...prev]);
    setSelId(p.id);
    localStorage.setItem("follow_sel", p.id);
    setNodeSel(null); setSeenTs(0); setFormErr("");
    runScan(p);
    return true;
  };

  // A wallet handed over from the hunt results or a #seguir= link. Deferred one tick so
  // StrictMode's mount → unmount → mount in dev adds it (and starts its scan) only once.
  useEffect(() => {
    if (!seed?.wallet) return;
    const t = setTimeout(() => addPerson(seed.name, seed.wallet, true), 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const removePerson = (p) => {
    if (!window.confirm(`¿Dejar de seguir a ${p.name}? Se borra su mapa guardado.`)) return;
    if (busy?.id === p.id) opRef.current?.ctrl.abort();
    setPeople((prev) => prev.filter((x) => x.id !== p.id));
    if (selId === p.id) { setSelId(null); localStorage.removeItem("follow_sel"); setNodeSel(null); }
  };

  const setAlias = (addr, on) => {
    if (!person) return;
    const next = {
      ...person,
      aliases: on ? [...new Set([...(person.aliases || []), addr])] : (person.aliases || []).filter((a) => a !== addr),
      graph: person.graph && {
        ...person.graph,
        nodes: person.graph.nodes.map((n) => n.addr !== addr ? n : on
          ? { ...n, prevRole: n.role, role: "alias" }
          : { ...n, role: n.prevRole && n.prevRole !== "alias" ? n.prevRole : "other" }),
      },
    };
    if (on) {
      const have = new Set((person.trades || []).map((t) => t.sig + t.mint));
      const mine = (person.graph?.nodes.find((n) => n.addr === addr)?.trades || []).filter((t) => !have.has(t.sig + t.mint)).map((t) => ({ ...t, wallet: addr }));
      next.trades = [...mine, ...(person.trades || [])].sort((a, b) => b.ts - a.ts).slice(0, 400);
      next.checkedAt = 0;   // the next light check reads this wallet's history
    } else {
      next.trades = (person.trades || []).filter((t) => t.wallet !== addr);
    }
    updatePerson(person.id, () => next);
  };

  const names = useMemo(() => {
    const m = new Map();
    for (const p of people) {
      if (p.id === person?.id) continue;
      m.set(p.root, p.name);
      for (const a of p.aliases || []) m.set(a, p.name);
    }
    return m;
  }, [people, person?.id]);
  const tokenName = useCallback((mint) => tokens[mint]?.symbol || shortAddr(mint, 4, 4), [tokens]);
  const insights = useMemo(() => (person ? followInsights(person, graph, now) : null), [person, graph, now]);
  const shown = useMemo(() => followCollapse(graph), [graph]);
  const selNode = nodeSel ? graph?.nodes.find((n) => n.addr === nodeSel) || null : null;
  const selGroup = nodeSel ? shown?.nodes.find((n) => n.addr === nodeSel)?.members || null : null;
  const scanning = busy?.kind === "scan" && busy.id === person?.id;
  const toneColor = { accent: "var(--accent)", warn: "var(--warn)", muted: "var(--text-3)" };

  const submit = (e) => {
    e.preventDefault();
    if (addPerson(form.name, form.wallet)) setForm({ name: "", wallet: "" });
  };
  const inputStyle = {
    width: "100%", padding: "9px 11px", fontSize: 12.5, borderRadius: 7,
    background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)",
  };

  return (
    <div style={{ display: active ? "flex" : "none", height: "100vh", position: "relative", zIndex: 2 }}>
      {/* ── Left: who you follow ── */}
      <aside style={{ width: "clamp(232px, 17vw, 292px)", flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg-2)", borderRight: "1px solid var(--line)" }}>
        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--line)" }}>{viewSwitch}</div>

        <form onSubmit={submit} style={{ padding: "16px 16px 18px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...followCaps, marginBottom: 2 }}>Seguir a alguien</div>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nombre o alias" style={inputStyle} />
          <input value={form.wallet} onChange={(e) => { setForm((f) => ({ ...f, wallet: e.target.value })); setFormErr(""); }}
            placeholder="Wallet de Solana" spellCheck={false} className="mono" style={{ ...inputStyle, fontSize: 11.5 }} />
          <button type="submit" disabled={!form.wallet.trim()} style={{
            padding: "9px 0", borderRadius: 7, fontSize: 13, fontWeight: 600, marginTop: 2,
            background: form.wallet.trim() ? "var(--text)" : "var(--surface-2)", color: form.wallet.trim() ? "var(--bg)" : "var(--text-4)",
            cursor: form.wallet.trim() ? "pointer" : "default", transition: "all 140ms ease",
          }}>Seguir</button>
          {formErr && <div style={{ fontSize: 11.5, color: "var(--warn)", lineHeight: 1.4 }}>{formErr}</div>}
        </form>

        <div style={{ ...followCaps, padding: "14px 16px 8px" }}>Siguiendo{people.length ? ` · ${people.length}` : ""}</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {people.length === 0 && (
            <div style={{ padding: "4px 16px", fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>
              Todavía no sigues a nadie. Pega arriba la wallet de un KOL para ver a dónde manda su SOL y con qué wallets compra.
            </div>
          )}
          {people.map((p) => {
            const s = followWalletStats(p.trades || [], null, now);
            const isSel = person?.id === p.id;
            const hue = followHue(p.root);
            const unread = isSel ? 0 : (p.trades || []).filter((t) => t.side === "buy" && t.ts > (p.seenTs || 0)).length;
            const working = busy?.id === p.id && busy.kind === "scan";
            return (
              <div key={p.id} onClick={() => select(p.id)} className="follow-person"
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 11, padding: "10px 12px 10px 13px", cursor: "pointer",
                  borderLeft: `3px solid ${isSel ? "var(--accent)" : "transparent"}`, background: isSel ? "var(--surface)" : "transparent",
                }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700,
                    background: `linear-gradient(135deg, oklch(0.80 0.15 ${hue}), oklch(0.62 0.17 ${(hue + 50) % 360}))`, color: `oklch(0.20 0.04 ${hue})`,
                  }}>{(p.name || "?").trim().charAt(0).toUpperCase()}</div>
                  <span style={{
                    position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", border: "2px solid var(--bg-2)",
                    background: s.b24 > 0 ? "var(--accent)" : s.b7 > 0 ? "var(--warn)" : "var(--text-4)",
                    animation: working ? "pulse-dot 1.1s ease-in-out infinite" : "none",
                  }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {shortAddr(p.root, 4, 4)} · {working ? "escaneando…" : s.last ? `compró ${fmtAgo(s.last, now)}` : p.graph ? "sin compras 7 d" : "sin escanear"}
                  </div>
                </div>
                {unread > 0 && (
                  <span className="mono" title="Compras nuevas desde tu última visita" style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 9, background: "var(--accent)", color: "var(--accent-ink)" }}>{unread}</span>
                )}
                <button title="Dejar de seguir" className="follow-x" onClick={(e) => { e.stopPropagation(); removePerson(p); }}
                  style={{ position: "absolute", right: 8, top: 8, width: 20, height: 20, display: "grid", placeItems: "center", borderRadius: 5, color: "var(--text-3)", background: "var(--surface)" }}>
                  <IconClose size={10} />
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
          <Toggle value={auto} onChange={setAuto} size={16} />
          <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.35 }}>
            Revisar compras cada 3 min
            <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>solo con esta vista abierta</div>
          </div>
        </div>
      </aside>

      {/* ── Centre: the map and the activity ── */}
      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {!person && (
          <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 40 }}>
            <div style={{ maxWidth: 440, textAlign: "center" }}>
              <div style={{ width: 46, height: 46, margin: "0 auto 16px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--accent-2)", background: "color-mix(in oklch, var(--accent) 14%, transparent)", border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)" }}>
                <IconFollow size={20} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Sigue a una persona, no a una wallet</div>
              <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6, textWrap: "pretty" }}>
                Pega su wallet a la izquierda. El mapa muestra quién la fondeó, a dónde mandó su SOL hasta 3 saltos, y qué wallets parecen ser suyas — para que no la pierdas cuando cambie de wallet.
              </div>
            </div>
          </div>
        )}

        {person && insights && (
          <>
            <div style={{ padding: "16px 24px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                {renaming != null ? (
                  <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)}
                    onBlur={() => { if (renaming.trim()) updatePerson(person.id, (o) => ({ ...o, name: renaming.trim() })); setRenaming(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                    style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", background: "var(--bg-2)", border: "1px solid var(--accent)", borderRadius: 6, padding: "1px 8px", width: 280, color: "var(--text)" }} />
                ) : (
                  <button onClick={() => setRenaming(person.name)} title="Cambiar nombre" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)", lineHeight: 1.25, textAlign: "left" }}>
                    {person.name}
                  </button>
                )}
                <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
                  {1 + (person.aliases || []).length} wallet{(person.aliases || []).length ? "s" : ""} en su historial
                  {person.checkedAt ? ` · revisado ${fmtAgo(person.checkedAt, now)}` : ""}
                  {person.scannedAt && now - person.scannedAt > 1800 ? ` · mapa de ${fmtAgo(person.scannedAt, now)}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setNodeSel(null)} style={{
                    padding: "5px 11px 6px", borderRadius: 8, textAlign: "left",
                    background: `color-mix(in oklch, ${toneColor[insights.status.tone]} 10%, transparent)`,
                    border: `1px solid color-mix(in oklch, ${toneColor[insights.status.tone]} 45%, transparent)`,
                  }}>
                    <div className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: toneColor[insights.status.tone] }}>
                      Raíz · {insights.status.chip}
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--text)" }}>{shortAddr(person.root, 4, 4)}</div>
                  </button>
                  <span style={{ fontSize: 13, color: "var(--text-2)" }}>{insights.status.text}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)" }}>
                  {[["layers", "Red de flujo"], ["radial", "Radial"]].map(([k, label]) => (
                    <button key={k} onClick={() => setMode(k)} style={{
                      padding: "5px 11px", borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                      background: mode === k ? "var(--surface-2)" : "transparent", color: mode === k ? "var(--text)" : "var(--text-3)",
                    }}>{label}</button>
                  ))}
                </div>
                <button onClick={() => setViewCmd((c) => ({ type: "center", nonce: (c?.nonce || 0) + 1, shape: `${shown?.nodes.length || 0}|${mode}` }))} style={followBtn}><IconTarget size={12} /> Raíz</button>
                <button onClick={() => setViewCmd((c) => ({ type: "fit", nonce: (c?.nonce || 0) + 1 }))} style={followBtn}><IconFit size={12} /> Ver todo</button>
                {scanning ? (
                  <button onClick={() => opRef.current?.ctrl.abort()} style={{ ...followBtn, color: "var(--danger)" }}><IconStop size={11} /> Detener</button>
                ) : (
                  <button onClick={() => runScan(person)} title="Vuelve a leer la cadena completa (~35 llamadas a Helius)" style={followBtn}><IconRefresh size={12} /> Re-escanear</button>
                )}
              </div>
            </div>

            {(error || (person.alerts || []).length > 0) && (
              <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6 }}>
                {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}
                {(person.alerts || []).map((a) => (
                  <div key={`${a.kind}:${a.addr}:${a.ts}`} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.kind === "woke" ? "var(--accent)" : "var(--warn)", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {a.kind === "woke"
                        ? <><b className="mono" style={{ fontWeight: 500, color: "var(--text)" }}>{shortAddr(a.addr, 4, 4)}</b> empezó a comprar ({a.buys} compra{a.buys > 1 ? "s" : ""}) {fmtAgo(a.ts, now)}.</>
                        : <>Sacó <b style={{ fontWeight: 600, color: "var(--text)" }}>{fmtSol(a.sol)} SOL</b> hacia <b className="mono" style={{ fontWeight: 500, color: "var(--text)" }}>{shortAddr(a.addr, 4, 4)}</b> {fmtAgo(a.ts, now)}, y esa wallet aún no está en el mapa.</>}
                    </span>
                    {a.kind === "woke"
                      ? <button onClick={() => setNodeSel(a.addr)} style={{ ...followBtn, padding: "3px 9px" }}>Ver</button>
                      : <button onClick={() => runScan(person)} style={{ ...followBtn, padding: "3px 9px" }}>Re-escanear</button>}
                    <button title="Descartar" onClick={() => updatePerson(person.id, (o) => ({ ...o, alerts: (o.alerts || []).filter((x) => x !== a) }))}
                      style={{ color: "var(--text-3)", display: "grid", placeItems: "center", width: 20, height: 20 }}><IconClose size={10} /></button>
                  </div>
                ))}
              </div>
            )}

            {graph ? (
              <FollowGraph
                graph={shown} mode={mode} selected={nodeSel} onSelect={setNodeSel}
                names={names} rootName={person.name} viewCmd={viewCmd}
                busyLabel={scanning ? busy.label : null} height="clamp(440px, calc(100vh - 236px), 860px)"
              />
            ) : (
              <div style={{ height: 320, display: "grid", placeItems: "center", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 10 }}>
                    {scanning ? busy.label : "Esta persona todavía no tiene mapa."}
                  </div>
                  {!scanning && <button onClick={() => runScan(person)} style={{ ...followBtn, background: "var(--text)", color: "var(--bg)", border: "1px solid var(--text)", fontWeight: 600 }}>Escanear ahora</button>}
                </div>
              </div>
            )}

            {(person.trades || []).length > 0 || graph ? (
              <FollowActivity person={person} insights={insights} now={now} range={range} setRange={setRange}
                tokenName={tokenName} onSelect={setNodeSel} onHuntToken={onHuntToken} />
            ) : null}
          </>
        )}
      </section>

      {/* ── Right: the selected wallet ── */}
      {person && (
        <aside style={{ width: "clamp(296px, 21vw, 364px)", flexShrink: 0, overflowY: "auto", background: "var(--bg)", borderLeft: "1px solid var(--line)" }}>
          <FollowProfile
            person={person} graph={graph} node={selNode} group={selGroup} now={now} tokenName={tokenName} seenTs={seenTs}
            onSelect={setNodeSel}
            onAlias={(a) => setAlias(a, true)} onUnalias={(a) => setAlias(a, false)}
            onFollowNew={(a) => addPerson("", a)}
            onTrace={onTrace}
          />
        </aside>
      )}
    </div>
  );
}

// ─── TweaksPanel ──────────────────────────────────────────────────────────────

function TweaksPanel({ tweaks, setTweaks, onClose }) {
  const set = (k, v) => setTweaks((t) => ({ ...t, [k]: v }));
  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, width: 272,
      background: "var(--bg-2)", border: "1px solid var(--line-2)",
      borderRadius: 10, boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
      zIndex: 200, overflow: "hidden", animation: "fade-in 180ms ease",
    }}>
      <div style={{
        display: "flex", alignItems: "center", padding: "11px 14px",
        borderBottom: "1px solid var(--line)",
      }}>
        <IconSliders size={13} style={{ color: "var(--text-3)", marginRight: 8 }} />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-2)" }}>
          Tweaks
        </span>
        <div style={{ flex: 1 }} />
        <IconBtn title="Cerrar" onClick={onClose} size={22}><IconClose size={11} /></IconBtn>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Accent */}
        <TweakRow label="Acento">
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { k: "green", label: "Green", c: "oklch(0.72 0.17 145)" },
              { k: "amber", label: "Amber", c: "oklch(0.80 0.15 75)"  },
              { k: "ice",   label: "Ice",   c: "oklch(0.78 0.12 230)" },
            ].map((o) => (
              <button key={o.k} onClick={() => set("accent", o.k)} title={o.label}
                style={{
                  flex: 1, height: 28, borderRadius: 5,
                  border: "1px solid " + (tweaks.accent === o.k ? o.c : "var(--line)"),
                  background: tweaks.accent === o.k ? `color-mix(in oklch, ${o.c} 20%, transparent)` : "var(--bg)",
                  fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em",
                  color: tweaks.accent === o.k ? o.c : "var(--text-3)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: o.c }} />
                {o.label}
              </button>
            ))}
          </div>
        </TweakRow>
        {/* Density */}
        <TweakRow label="Densidad">
          <div style={{ display: "flex", gap: 4 }}>
            {["compact", "default", "comfortable"].map((d) => (
              <PillBtn key={d} flex active={tweaks.density === d} onClick={() => set("density", d)}>{d}</PillBtn>
            ))}
          </div>
        </TweakRow>
        <TweakRow label="Sugerencias">
          <Toggle value={tweaks.showSuggestions} onChange={(v) => set("showSuggestions", v)} />
        </TweakRow>
        <TweakRow label="Grain">
          <Toggle value={tweaks.grain} onChange={(v) => set("grain", v)} />
        </TweakRow>
      </div>
    </div>
  );
}

function TweakRow({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        flex: 1, fontFamily: "var(--mono)", fontSize: 10,
        letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)",
      }}>{label}</span>
      {children}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TWEAK_DEFAULTS = { accent: "green", density: "default", showSuggestions: true, grain: true };

export default function App() {
  const [tweaks, setTweaks]     = useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tracerOpen, setTracerOpen] = useState(false);
  const [tracerSeed, setTracerSeed] = useState(null); // wallet to pre-fill

  // "follow" = follow a person's wallets (the home: the app always opens here) · "hunt" = intersection hunt.
  // A #seguir=<wallet>&nombre=<x> link adds that wallet on load.
  const [linkSeed] = useState(() => {
    const q = new URLSearchParams(window.location.hash.slice(1));
    return q.get("seguir") ? { wallet: q.get("seguir"), name: q.get("nombre") || "", nonce: 1 } : null;
  });
  const [view, setView] = useState("follow");
  const [followSeed, setFollowSeed] = useState(linkSeed);
  const followWallet = (wallet, name) => { setFollowSeed({ wallet, name: name || "", nonce: Date.now() }); setView("follow"); };
  const traceFromFollow = (wallet) => { setTracerSeed(wallet); setTracerOpen(true); setView("hunt"); window.scrollTo({ top: 0 }); };
  const huntToken = (mint) => {
    setCaEntries((prev) => {
      if (prev.some((e) => e.ca === mint)) return prev;
      const blank = prev.findIndex((e) => !e.ca);
      if (blank >= 0) return prev.map((e, i) => (i === blank ? { ...e, ca: mint } : e));
      return prev.length < 10 ? [...prev, mkEntry({ ca: mint })] : prev;
    });
    setView("hunt");
  };

  const [caEntries, setCaEntries] = useState(() => [mkEntry(), mkEntry()]);
  const [expandedId, setExpandedId] = useState(null);
  const [excludeBots, setExcludeBots] = useState(true);
  const [mode, setMode]   = useState("standard");
  const [earlyMethod, setEarlyMethod] = useState("spike"); // "spike" | "firstN"
  const [earlyN, setEarlyN] = useState(20);
  const [earlySpikeMult, setEarlySpikeMult] = useState(3);
  const [earlyMeta, setEarlyMeta] = useState(null); // { spikeTs, totalBuyers, method }
  const [bundles, setBundles]         = useState(null);
  const [bundlePhase, setBundlePhase] = useState("idle");
  const [highFreqWallets, setHighFreqWallets] = useState(new Set());

  const [phase, setPhase]     = useState("idle");
  const [caList, setCaList]   = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, caStatus: [], uniqueWallets: 0, rateLimitHit: false });
  const [results, setResults] = useState([]);
  const [cachedBuyerSets, setCachedBuyerSets] = useState(new Map()); // key: `${ca}|${windowKey}|${customSecs}|${minSol}`
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedWallet, setCopiedWallet] = useState(null);

  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("hx_history") || "[]"); } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);

  const [savedWallets, setSavedWallets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kol_saved_wallets") || "[]"); } catch { return []; }
  });
  const [showSaved, setShowSaved] = useState(false);

  const [watchedWallets, setWatchedWallets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tracer_watched") || "[]"); } catch { return []; }
  });
  const [showWatched, setShowWatched] = useState(false);
  const [watchAlerts, setWatchAlerts] = useState(null);
  const [watchScanning, setWatchScanning] = useState(false);
  const watchScanAbortRef = useRef(null);

  const abortRef = useRef(null);

  const runWatchScan = useCallback((walletList) => {
    if (!HELIUS_API_KEY || walletList.length === 0) { setWatchAlerts([]); setWatchScanning(false); return; }
    watchScanAbortRef.current?.abort();
    const ctrl = new AbortController();
    watchScanAbortRef.current = ctrl;
    setWatchScanning(true);
    setWatchAlerts([]);
    (async () => {
      const results = [];
      for (const w of walletList) {
        if (ctrl.signal.aborted) break;
        try {
          const opts = w.mode === "usdc"
            ? { mode: "usdc", minUsdc: Math.min(w.minUsdc || 2000, 2000), maxUsdc: w.maxUsdc || Infinity }
            : { mode: "sol" };
          const r = await traceWalletChain(w.address, HELIUS_API_KEY, ctrl.signal, null, opts);
          const moved = r.chain[0]?.label === "start";
          results.push({ watched: w, moved, chain: r.chain, status: r.status });
          if (!ctrl.signal.aborted) setWatchAlerts([...results]);
        } catch { /* aborted or network error — skip */ }
      }
      if (!ctrl.signal.aborted) setWatchScanning(false);
    })();
  }, []);

  // Startup scan of watched wallets
  useEffect(() => {
    const initial = (() => { try { return JSON.parse(localStorage.getItem("tracer_watched") || "[]"); } catch { return []; } })();
    if (initial.length > 0) runWatchScan(initial);
    return () => watchScanAbortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addWatchedWallet = (address, opts) => {
    setWatchedWallets((prev) => {
      if (prev.some((w) => w.address === address)) return prev;
      const updated = [...prev, { address, label: shortAddr(address, 5, 5), addedAt: Date.now(), ...opts }];
      localStorage.setItem("tracer_watched", JSON.stringify(updated));
      return updated;
    });
  };

  const removeWatchedWallet = (address) => {
    setWatchedWallets((prev) => {
      const updated = prev.filter((w) => w.address !== address);
      localStorage.setItem("tracer_watched", JSON.stringify(updated));
      return updated;
    });
  };

  const confirmWatchMovement = (oldAddress, newAddress, watched) => {
    setWatchedWallets((prev) => {
      const updated = prev
        .filter((w) => w.address !== oldAddress)
        .concat([{ ...watched, address: newAddress, label: shortAddr(newAddress, 5, 5), addedAt: Date.now() }]);
      localStorage.setItem("tracer_watched", JSON.stringify(updated));
      return updated;
    });
    setWatchAlerts((prev) => (prev || []).filter((a) => a.watched.address !== oldAddress));
  };

  // Apply tweaks to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-accent",  tweaks.accent);
    document.documentElement.setAttribute("data-density", tweaks.density);
    document.documentElement.style.setProperty("--grain-opacity", tweaks.grain ? "0.025" : "0");
  }, [tweaks]);

  // ⌘↵ shortcut
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && view === "hunt") {
        e.preventDefault();
        if (phase === "running") cancel(); else hunt();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, view]);

  const validEntries = useMemo(() => caEntries.filter((e) => e.ca.length >= 32 && e.ca.length <= 50), [caEntries]);

  // Wallet management
  const saveWallet = (address) => {
    setSavedWallets((prev) => {
      if (prev.find((w) => w.address === address)) return prev;
      const updated = [{ address, name: shortAddr(address, 5, 5), savedAt: new Date().toISOString() }, ...prev];
      localStorage.setItem("kol_saved_wallets", JSON.stringify(updated));
      return updated;
    });
  };
  const renameWallet = (address, name) => {
    setSavedWallets((prev) => {
      const updated = prev.map((w) => w.address === address ? { ...w, name } : w);
      localStorage.setItem("kol_saved_wallets", JSON.stringify(updated));
      return updated;
    });
  };
  const deleteWallet = (address) => {
    setSavedWallets((prev) => {
      const updated = prev.filter((w) => w.address !== address);
      localStorage.setItem("kol_saved_wallets", JSON.stringify(updated));
      return updated;
    });
  };

  const copyWallet = (wallet) => {
    navigator.clipboard.writeText(wallet).catch(() => {});
    setCopiedWallet(wallet);
    setTimeout(() => setCopiedWallet(null), 1500);
  };

  const exportCSV = () => {
    const rows = [
      ["Wallet", "Matches", "Score%", "Tokens"],
      ...results.map((r) => [r.wallet, r.matches, r.score, r.tokens.join("|")]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `kol-hunt-${Date.now()}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const addCA = () => {
    if (caEntries.length < 10) {
      const n = mkEntry();
      setCaEntries((prev) => [...prev, n]);
      setExpandedId(n.id);
    }
  };

  const loadHistory = (entry) => {
    const entries = entry.caEntries
      || (entry.cas || []).map((ca) => ({ id: Math.random(), ca, windowKey: entry.timeWindow || "6h", customSecs: null, minSol: entry.minSol || 0.5 }));
    setCaEntries(entries.length >= 2 ? entries : [...entries, mkEntry()]);
    setExcludeBots(entry.excludeBots ?? true);
    setResults(entry.results);
    const cas = entry.cas || entries.map((e) => e.ca);
    setCaList(cas);
    setPhase("done");
    setShowHistory(false);
    setProgress({ current: cas.length, total: cas.length, caStatus: cas.map((ca) => ({ ca, status: "done", walletsFound: 0, totalTxs: 0, launchpad: null })), uniqueWallets: entry.results.length, rateLimitHit: false });
  };

  const cancel = () => { abortRef.current?.abort(); setPhase("idle"); };

  const hunt = useCallback(async () => {
    const valid = caEntries.filter((e) => e.ca.length >= 32 && e.ca.length <= 50);
    const minCAs = mode === "early" ? 1 : 2;
    if (valid.length < minCAs) { setErrorMsg(`Necesitas al menos ${minCAs} CA${minCAs > 1 ? "s" : ""} válido${minCAs > 1 ? "s" : ""}`); return; }
    if (!HELIUS_API_KEY) { setErrorMsg("API key no configurada — agrega VITE_HELIUS_API_KEY en .env"); return; }

    setErrorMsg("");
    setPhase("running");
    setResults([]);
    setBundles(null);
    setBundlePhase("idle");
    setHighFreqWallets(new Set());
    setEarlyMeta(null);
    const keys = valid.map((e) => e.ca);
    setCaList(keys);

    const controller = new AbortController();
    abortRef.current  = controller;

    const caStatus = valid.map((e) => ({ ca: e.ca, status: "pending", walletsFound: 0, totalTxs: 0, launchpad: null }));
    setProgress({ current: 0, total: valid.length, caStatus: [...caStatus], uniqueWallets: 0, rateLimitHit: false });

    try {
      const buyerSets = [];

      if (mode === "early") {
        // ── EARLY KOL MODE ───────────────────────────────────────────────────
        const target = valid[0];
        const minSolLamports = target.minSol * 1e9;

        caStatus[0].status = "fetching";
        setProgress((p) => ({ ...p, current: 0, caStatus: [...caStatus] }));

        const { txs } = await fetchAllSwaps(target.ca, HELIUS_API_KEY, controller.signal, (ev) => {
          if (ev.type === "rate_limit") setProgress((p) => ({ ...p, rateLimitHit: true }));
          if (ev.type === "page") { caStatus[0].totalTxs = ev.total; setProgress((p) => ({ ...p, caStatus: [...caStatus] })); }
        });

        if (txs.length === 0) {
          caStatus[0].status = "empty";
          setProgress((p) => ({ ...p, caStatus: [...caStatus] }));
          setResults([]);
          setPhase("done");
          return;
        }

        const opts = { n: earlyN, spikeMultiplier: earlySpikeMult };
        const { wallets, spikeTs } = extractEarlyBuyers(txs, target.ca, earlyMethod, opts, minSolLamports, excludeBots);

        if (earlyMethod === "spike" && spikeTs == null) {
          caStatus[0].status = "done";
          caStatus[0].walletsFound = 0;
          caStatus[0].launchpad = detectLaunchpad(txs);
          setProgress((p) => ({ ...p, current: 1, caStatus: [...caStatus], uniqueWallets: 0 }));
          setErrorMsg(`No se detectó spike claro (${earlySpikeMult}×). Reduce multiplicador o usa "Primeros N".`);
          setResults([]);
          setEarlyMeta({ method: earlyMethod, spikeTs: null, totalBuyers: 0 });
          setPhase("done");
          return;
        }

        caStatus[0].status = "done";
        caStatus[0].walletsFound = wallets.length;
        caStatus[0].launchpad = detectLaunchpad(txs);
        setProgress((p) => ({ ...p, current: 1, caStatus: [...caStatus], uniqueWallets: wallets.length }));

        // Fetch supply + SOL price in parallel for mcap calculation
        const [tokenInfo, solUsd] = await Promise.all([
          fetchTokenInfo(target.ca, HELIUS_API_KEY, controller.signal),
          fetchSolPriceUsd(controller.signal),
        ]);
        const supplyHuman = tokenInfo && tokenInfo.supply > 0
          ? tokenInfo.supply / Math.pow(10, tokenInfo.decimals || 6)
          : null;

        const enriched = wallets.map((e, i) => {
          let mcapUsd = null;
          if (supplyHuman && solUsd && e.firstTokens > 0 && e.firstSol > 0) {
            const solPerToken = (e.firstSol / 1e9) / e.firstTokens;
            mcapUsd = solPerToken * supplyHuman * solUsd;
          }
          // Promise score: rewards early entry + conviction (SOL) + low entry mcap.
          // Components 0..1, weighted: earliness 0.45, conviction 0.35, mcap 0.20.
          const earliness  = wallets.length === 1 ? 1 : 1 - i / (wallets.length - 1);
          const solHuman   = e.totalSol / 1e9;
          const conviction = Math.min(1, Math.log10(1 + solHuman) / Math.log10(1 + 20)); // 20 SOL = max
          const mcapBonus  = mcapUsd && mcapUsd > 0
            ? Math.max(0, Math.min(1, 1 - Math.log10(mcapUsd) / Math.log10(1e7))) // <10K=1, 10M=0
            : 0.4;
          const promise    = Math.round((earliness * 0.45 + conviction * 0.35 + mcapBonus * 0.20) * 100);
          return { ...e, idx: i, mcapUsd, promise };
        });

        // Sort by promise desc (best picks on top)
        enriched.sort((a, b) => b.promise - a.promise);

        const ranked = enriched.map((e) => ({
          wallet: e.wallet,
          matches: 1,
          score: e.promise,
          tokens: [0],
          earlyRank: e.idx + 1,
          earlyFirstTs: e.firstTs,
          earlyTotalSol: e.totalSol,
          mcapAtBuy: e.mcapUsd,
          promise: e.promise,
        }));

        setResults(ranked);
        setEarlyMeta({ method: earlyMethod, spikeTs, totalBuyers: wallets.length });
        setPhase("done");

        if (ranked.length > 0) {
          try {
            const flagged = await checkHighFrequencyWallets(ranked.map((r) => r.wallet), HELIUS_API_KEY, controller.signal, 30);
            if (!controller.signal.aborted) setHighFreqWallets(flagged);
          } catch { /* ignore */ }
        }

        const hEntry = { id: Date.now(), caEntries: valid, cas: [target.ca], excludeBots, results: ranked, ts: new Date().toISOString(), mode: "early", earlyMeta: { method: earlyMethod, spikeTs, n: earlyN, spikeMult: earlySpikeMult } };
        setHistory((h) => {
          const updated = [hEntry, ...h].slice(0, MAX_HISTORY);
          localStorage.setItem("hx_history", JSON.stringify(updated));
          return updated;
        });
        return;
      }

      if (mode === "reverse") {
        // ── PRIMARY CA ───────────────────────────────────────────────────────
        const primary = valid[0];
        const primaryWindowSecs = primary.windowKey === "Custom" ? primary.customSecs : WINDOW_SECONDS[primary.windowKey];

        caStatus[0].status = "fetching";
        setProgress((p) => ({ ...p, current: 0, caStatus: [...caStatus] }));

        const { txs: primaryTxs, mintFirstTs: primaryFirstTs } = await fetchAllSwaps(primary.ca, HELIUS_API_KEY, controller.signal, (ev) => {
          if (ev.type === "rate_limit") setProgress((p) => ({ ...p, rateLimitHit: true }));
          if (ev.type === "page") { caStatus[0].totalTxs = ev.total; setProgress((p) => ({ ...p, caStatus: [...caStatus] })); }
        });

        if (primaryTxs.length === 0) {
          caStatus[0].status = "empty";
          setProgress((p) => ({ ...p, caStatus: [...caStatus] }));
          buyerSets.push(new Set());
        } else {
          const firstTs = Number.isFinite(primaryFirstTs) ? primaryFirstTs : primaryTxs.reduce((m, t) => Math.min(m, t.timestamp), Infinity);
          const primaryEnd = primaryWindowSecs ? firstTs + primaryWindowSecs : Infinity;
          const primaryBuyers = extractBuyers(primaryTxs, primary.ca, firstTs, primaryEnd, primary.minSol * 1e9, excludeBots);
          caStatus[0].status = "done";
          caStatus[0].walletsFound = primaryBuyers.size;
          caStatus[0].launchpad    = detectLaunchpad(primaryTxs);
          buyerSets.push(primaryBuyers);
          setProgress((p) => ({ ...p, current: 1, caStatus: [...caStatus], uniqueWallets: primaryBuyers.size }));

          // ── COMPLEMENTARY CAs ─────────────────────────────────────────────
          const walletList = [...primaryBuyers];
          for (let i = 1; i < valid.length; i++) {
            const comp = valid[i];
            const compWindowSecs = comp.windowKey === "Custom" ? comp.customSecs : WINDOW_SECONDS[comp.windowKey];
            const now  = Math.floor(Date.now() / 1000);
            const compStart = compWindowSecs ? now - compWindowSecs : 0;

            caStatus[i].status        = "checking";
            caStatus[i].walletsDone   = 0;
            caStatus[i].walletsTotal  = walletList.length;
            setProgress((p) => ({ ...p, caStatus: [...caStatus] }));

            const matched = await checkWalletsBatch(
              walletList, comp.ca, compStart, now, comp.minSol,
              HELIUS_API_KEY, controller.signal,
              (done) => { caStatus[i].walletsDone = done; setProgress((p) => ({ ...p, caStatus: [...caStatus] })); }
            );

            caStatus[i].status       = "done";
            caStatus[i].walletsFound = matched.size;
            buyerSets.push(matched);
            setProgress((p) => ({ ...p, current: i + 1, caStatus: [...caStatus] }));
          }
        }
      } else {
        // ── STANDARD MODE ─────────────────────────────────────────────────
        const newCache = new Map(cachedBuyerSets);
        for (let i = 0; i < valid.length; i++) {
          const { ca, windowKey, customSecs, minSol } = valid[i];
          const cacheKey = `${ca}|${windowKey}|${customSecs ?? ""}|${minSol}`;

          if (newCache.has(cacheKey)) {
            const { buyers, launchpad } = newCache.get(cacheKey);
            caStatus[i].status       = "cached";
            caStatus[i].walletsFound = buyers.size;
            caStatus[i].launchpad    = launchpad;
            buyerSets.push(buyers);
            const allSoFar = new Set(buyerSets.flatMap((s) => [...s]));
            setProgress((p) => ({ ...p, current: i + 1, caStatus: [...caStatus], uniqueWallets: allSoFar.size }));
            continue;
          }

          const windowSecs      = windowKey === "Custom" ? customSecs : WINDOW_SECONDS[windowKey];
          const minSolLamports  = minSol * 1e9;

          caStatus[i].status = "fetching";
          setProgress((p) => ({ ...p, current: i, caStatus: [...caStatus] }));

          const { txs, mintFirstTs } = await fetchAllSwaps(ca, HELIUS_API_KEY, controller.signal, (ev) => {
            if (ev.type === "rate_limit") setProgress((p) => ({ ...p, rateLimitHit: true }));
            if (ev.type === "page") { caStatus[i].totalTxs = ev.total; setProgress((p) => ({ ...p, caStatus: [...caStatus] })); }
          });

          if (txs.length === 0) {
            caStatus[i].status = "empty";
            setProgress((p) => ({ ...p, caStatus: [...caStatus] }));
            buyerSets.push(new Set());
            continue;
          }

          // mintFirstTs anchors the window (DEX launch time).
          // windowStart extends backward by windowSecs to capture pre-migration BC buyers.
          const windowStart = windowSecs ? mintFirstTs - windowSecs : 0;
          const windowEnd   = windowSecs ? mintFirstTs + windowSecs : Infinity;
          const buyers      = extractBuyers(txs, ca, windowStart, windowEnd, minSolLamports, excludeBots);
          const launchpad   = detectLaunchpad(txs);

          caStatus[i].status       = "done";
          caStatus[i].walletsFound = buyers.size;
          caStatus[i].launchpad    = launchpad;
          buyerSets.push(buyers);
          newCache.set(cacheKey, { buyers, launchpad });

          const allSoFar = new Set(buyerSets.flatMap((s) => [...s]));
          setProgress((p) => ({ ...p, current: i + 1, caStatus: [...caStatus], uniqueWallets: allSoFar.size }));
        }
        setCachedBuyerSets(newCache);
      }

      // ── Scoring ────────────────────────────────────────────────────────────
      const scores    = new Map();
      for (const set of buyerSets) for (const w of set) scores.set(w, (scores.get(w) || 0) + 1);
      const total     = valid.length;
      const threshold = Math.max(2, Math.ceil(total * 0.5));
      const ranked    = Array.from(scores.entries())
        .filter(([, c]) => c >= threshold)
        .sort((a, b) => b[1] - a[1])
        .map(([wallet, matches]) => ({
          wallet, matches,
          score: Math.round((matches / total) * 100),
          tokens: keys.map((_, i) => i).filter((i) => buyerSets[i]?.has(wallet)),
        }));

      setResults(ranked);
      setPhase("done");

      // Bundle detection + high-frequency filter — run after results shown
      if (ranked.length >= 2) {
        setBundlePhase("running");
        try {
          const bundleMap = await detectBundles(ranked.map((r) => r.wallet), HELIUS_API_KEY, controller.signal);
          if (bundleMap && !controller.signal.aborted) setBundles(bundleMap);
        } catch { /* ignore */ }
        setBundlePhase("done");
      }
      if (ranked.length > 0) {
        try {
          const flagged = await checkHighFrequencyWallets(ranked.map((r) => r.wallet), HELIUS_API_KEY, controller.signal, 30);
          if (!controller.signal.aborted) setHighFreqWallets(flagged);
        } catch { /* ignore */ }
      }

      const hEntry = { id: Date.now(), caEntries: valid, cas: keys, excludeBots, results: ranked, ts: new Date().toISOString() };
      setHistory((h) => {
        const updated = [hEntry, ...h].slice(0, MAX_HISTORY);
        localStorage.setItem("hx_history", JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      if (e.name === "AbortError") { setPhase("idle"); return; }
      if (e.code === "INVALID_KEY") setErrorMsg("API key inválida — consigue una gratis en helius.dev");
      else if (e.code === "RATE_LIMIT") setErrorMsg("Rate limit agotado. Espera unos segundos e intenta de nuevo.");
      else setErrorMsg(`Error: ${e.message}`);
      setPhase("error");
    }
  }, [caEntries, excludeBots, mode, cachedBuyerSets, earlyMethod, earlyN, earlySpikeMult]);

  // Suggestions
  const suggestions = useMemo(() => {
    const out = [];
    if (phase !== "done") return out;
    if (results.length === 0)
      out.push({ tone: "info", text: "Sin matches — Amplía la ventana de tiempo o reduce el mínimo de SOL." });
    const maxMatches = results.filter((r) => r.matches === progress.total).length;
    if (maxMatches === 1)
      out.push({ tone: "accent", text: "Alta confianza con un único match máximo. Verifica en GMGN si el perfil coincide con un KOL activo." });
    if (maxMatches > 30)
      out.push({ tone: "info", text: "Más de 30 wallets con match completo — agrega más contratos para filtrar la intersección." });
    const heavyCA = progress.caStatus.find((s) => s.totalTxs > 1000);
    if (heavyCA)
      out.push({ tone: "warn", text: `${shortAddr(heavyCA.ca, 6, 6)} tiene >1000 swaps. Prueba ventana más corta (1h) o mínimo SOL más alto.` });
    return out;
  }, [phase, results, progress]);

  const showProgress = phase === "running" || (phase === "done" && progress.total > 0);
  const showResults  = phase === "done" && results.length > 0;
  const showEmpty    = phase === "done" && results.length === 0;

  const viewSwitch = <ViewSwitch view={view} setView={setView} />;

  return (
    <>
    <FollowView
      active={view === "follow"} apiKey={HELIUS_API_KEY} seed={followSeed} viewSwitch={viewSwitch}
      onTrace={traceFromFollow} onHuntToken={huntToken}
    />
    <div style={{ display: view === "hunt" ? "flex" : "none", minHeight: "100vh", position: "relative", zIndex: 2 }}>
      <Sidebar
        viewSwitch={viewSwitch}
        caEntries={caEntries} setCaEntries={setCaEntries}
        excludeBots={excludeBots} setExcludeBots={setExcludeBots}
        phase={phase} hunt={hunt} cancel={cancel}
        validCount={validEntries.length}
        expandedId={expandedId} setExpandedId={setExpandedId}
        errorMsg={errorMsg}
        mode={mode} setMode={setMode}
        earlyMethod={earlyMethod} setEarlyMethod={setEarlyMethod}
        earlyN={earlyN} setEarlyN={setEarlyN}
        earlySpikeMult={earlySpikeMult} setEarlySpikeMult={setEarlySpikeMult}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar
          phase={phase}
          historyCount={history.length}
          savedCount={savedWallets.length}
          watchedCount={watchedWallets.length}
          onHistory={() => { setShowHistory((v) => !v); setShowSaved(false); setShowWatched(false); }}
          onSaved={() => { setShowSaved((v) => !v); setShowHistory(false); setShowWatched(false); }}
          onWatched={() => { setShowWatched((v) => !v); setShowHistory(false); setShowSaved(false); }}
          tweaksOpen={tweaksOpen}
          setTweaksOpen={setTweaksOpen}
          tracerOpen={tracerOpen}
          setTracerOpen={setTracerOpen}
        />

        <div style={{
          flex: 1, padding: "22px 28px 40px",
          display: "flex", flexDirection: "column", gap: "var(--gap)",
        }}>
          {phase === "idle" && <EmptyCanvas validCount={validEntries.length} />}

          {showHistory && (
            <HistoryPanel history={history} onLoad={loadHistory} onClose={() => setShowHistory(false)} />
          )}

          {showWatched && (
            <WatchedPanel
              watched={watchedWallets}
              onRemove={removeWatchedWallet}
              onClose={() => setShowWatched(false)}
              onTrace={(w) => { setTracerSeed(w); setTracerOpen(true); setShowWatched(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onRefresh={() => { runWatchScan(watchedWallets); setWatchAlerts(null); }}
              scanning={watchScanning}
            />
          )}

          {showSaved && (
            <SavedPanel
              saved={savedWallets} onCopy={copyWallet} copiedWallet={copiedWallet}
              onDelete={deleteWallet} onRename={renameWallet}
              onClear={() => { setSavedWallets([]); localStorage.removeItem("kol_saved_wallets"); }}
            />
          )}

          {showProgress && <ProgressPanel progress={progress} />}

          {tracerOpen && (
            <TracerPanel
              key={tracerSeed}
              initialWallet={tracerSeed}
              apiKey={HELIUS_API_KEY}
              onClose={() => { setTracerOpen(false); setTracerSeed(null); }}
              onWatch={addWatchedWallet}
              watchedWallets={watchedWallets}
            />
          )}

          {showResults && (
            <ResultsTable
              results={results} totalCAs={caList.length}
              onCopy={copyWallet} copiedWallet={copiedWallet}
              savedWallets={savedWallets} onSave={saveWallet} onRename={renameWallet}
              bundles={bundles} bundlePhase={bundlePhase}
              highFreqWallets={highFreqWallets}
              onExport={exportCSV}
              onAddCA={() => { addCA(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onTrace={(w) => { setTracerSeed(w); setTracerOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onFollow={followWallet}
            />
          )}

          {showEmpty && (
            <Panel padded>
              <div style={{ padding: "48px 0", textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 4, fontWeight: 500 }}>Sin wallets en la intersección</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Prueba ampliar la ventana de tiempo o bajar el mínimo de SOL.</div>
              </div>
            </Panel>
          )}

          {phase === "done" && tweaks.showSuggestions && suggestions.length > 0 && (
            <SuggestionsPanel suggestions={suggestions} />
          )}
        </div>

        <footer style={{
          padding: "10px 28px", borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 14,
          fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em",
        }}>
          <span>KOL Wallet Hunter · v2</span>
          <span style={{ flex: 1 }} />
          <span>Helius · 1.1s rate</span>
        </footer>
      </main>

      {tweaksOpen && (
        <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} onClose={() => setTweaksOpen(false)} />
      )}

      {watchAlerts !== null && (
        <WatchAlertModal
          alerts={watchAlerts}
          scanning={watchScanning}
          onConfirm={confirmWatchMovement}
          onDismiss={() => setWatchAlerts(null)}
        />
      )}
    </div>
    </>
  );
}
