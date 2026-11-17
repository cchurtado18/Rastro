// Engines: Cazar (early-buyer intersection) and Seguir (follow a person's wallets). No UI, no React:
// this file also runs in Node, for the tests and the background watcher.

// ─── Domain constants ─────────────────────────────────────────────────────────

export const BLACKLIST = new Set([
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

export const WSOL      = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const SOURCE_LABELS = {
  PUMP_FUN:  { label: "Pump.fun",  hue: 145 },
  PUMP_AMM:  { label: "PumpSwap",  hue: 160 },
  RAYDIUM_LAUNCHLAB: { label: "LaunchLab", hue: 320 },
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

export const CA_HUES = [145, 230, 75, 25, 305, 180, 50, 265, 105, 345];
export const hueColor  = (i, l = 0.72, c = 0.14) => `oklch(${l} ${c} ${CA_HUES[i % CA_HUES.length]})`;

export const TIME_WINDOWS   = ["Todo", "1h", "3h", "6h", "12h", "24h"];
export const WINDOW_SECONDS = { "1h": 3600, "3h": 10800, "6h": 21600, "12h": 43200, "24h": 86400 };
export const MAX_HISTORY    = 5;

// Known Solana exchange hot wallets (incomplete by design — add as discovered)
export const KNOWN_EXCHANGES = new Map([
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

export let _eid = 0;
export const mkEntry = (over = {}) => ({ id: ++_eid, ca: "", windowKey: "6h", customSecs: null, minSol: 0.5, ...over });

// ─── Base58 and program-derived addresses ─────────────────────────────────────

export const _B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58Decode(s) {
  let n = 0n;
  for (const c of s) { const i = _B58.indexOf(c); if (i < 0) throw new Error("bad b58"); n = n * 58n + BigInt(i); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (let i = 0; i < s.length && s[i] === "1"; i++) bytes.unshift(0);
  return new Uint8Array(bytes);
}
export function b58Encode(buf) {
  let n = 0n; for (const b of buf) n = n * 256n + BigInt(b);
  let r = ""; while (n > 0n) { r = _B58[Number(n % 58n)] + r; n /= 58n; }
  for (const b of buf) { if (b !== 0) break; r = "1" + r; }
  return r;
}

// Ed25519 on-curve check (field arithmetic mod p = 2^255 - 19)
export const _P = (1n << 255n) - 19n;
export const _D = (-121665n * _modInv(121666n) + _P * 2n) % _P;
export function _modInv(a) { return _modPow(((a % _P) + _P) % _P, _P - 2n); }
export function _modPow(b, e) {
  let r = 1n; b %= _P;
  while (e > 0n) { if (e & 1n) r = r * b % _P; e >>= 1n; b = b * b % _P; }
  return r;
}
export function _isOnCurve(bytes) {
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
export const _PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shortAddr(a, l = 5, r = 5) {
  if (!a) return "";
  return a.length > l + r + 2 ? `${a.slice(0, l)}…${a.slice(-r)}` : a;
}
export function fmtCustom(secs) {
  if (!secs) return "";
  if (secs % 3600 === 0) return `${secs / 3600}h`;
  if (secs % 60   === 0) return `${secs / 60}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}
export function parseWindowInput(str) {
  const s = str.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*m(?:in)?$/);
  if (m) return parseFloat(m[1]) * 60;
  const h = s.match(/^(\d+(?:\.\d+)?)\s*(?:h(?:r|rs|our|ours)?)?$/);
  if (h) return parseFloat(h[1]) * 3600;
  return null;
}
export function vanityTag(w) {
  if (!w || w.length < 8) return null;
  if (/^(.)\1{3,}/.test(w)) return w.slice(0, 5).toUpperCase() + "+";
  const WORDS = ["DEAD","CAFE","BEEF","BABE","FACE","DOGE","MOON","BULL","BEAR","PEPE","PUMP","BONK","KOL","DEV","CHAD","ALPHA","FROG","GEM","WAGMI","APE","RICH","LUCK"];
  const up = w.toUpperCase();
  for (const word of WORDS) if (up.startsWith(word)) return word;
  return null;
}

// ─── API ──────────────────────────────────────────────────────────────────────

// Fetch token supply + decimals via Helius DAS getAsset
export async function fetchTokenInfo(mint, apiKey, signal) {
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
export async function fetchSolPriceUsd(signal) {
  try {
    const res = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", { signal });
    if (!res.ok) return null;
    const j = await res.json();
    const p = parseFloat(j?.data?.["So11111111111111111111111111111111111111112"]?.price);
    return Number.isFinite(p) ? p : null;
  } catch { return null; }
}

export function fmtMcap(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

// One page of everything that touched an address. Nothing in this file filters by Helius "type":
// most bot-routed trades are labelled TRANSFER, so a type=SWAP filter loses 70–85% of early buyers.
export async function heliusGet(address, apiKey, { before = null, gteSlot = 0, asc = false } = {}, signal) {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", "100");
  if (asc) url.searchParams.set("sort-order", "asc");
  if (gteSlot) url.searchParams.set("gte-slot", String(gteSlot));
  if (before) url.searchParams.set("before", before);
  const res = await fetch(url.toString(), { signal });
  if (res.status === 429) { const e = new Error("RATE_LIMIT"); e.code = "RATE_LIMIT"; throw e; }
  if (res.status === 401 || res.status === 403) { const e = new Error("INVALID_KEY"); e.code = "INVALID_KEY"; throw e; }
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

// Someone received the token and the fee payer spent SOL for it
function isBuyTx(tx, mint) {
  const payer = tx.feePayer;
  if (!payer || BLACKLIST.has(payer)) return false;
  if (!(tx.tokenTransfers || []).some((t) => t.mint === mint && t.toUserAccount && !BLACKLIST.has(t.toUserAccount))) return false;
  const native = (tx.nativeTransfers || []).filter((t) => t.fromUserAccount === payer).reduce((a, t) => a + (t.amount || 0), 0);
  const wsol   = (tx.tokenTransfers || []).filter((t) => t.mint === WSOL && t.fromUserAccount === payer).reduce((a, t) => a + (t.tokenAmount || 0) * 1e9, 0);
  return native + wsol >= 10_000_000;
}

// A token's history read forward from its very first transaction (bonding-curve buys included),
// up to HUNT_MAX_PAGES. With `windowSecs` it stops once it is past that long after the first buy.
// Ascending order has no cursor, so pages are walked by slot (gte-slot = last slot seen): a slot
// holds far fewer transactions than a second, so little of each page is a repeat.
// Returns { txs, mintFirstTs: time of the first buy, coveredTo, complete }.
// A hot launch does ~250–450 tx/min, so the cap covers roughly its first 15–20 minutes.
export const HUNT_MAX_PAGES = 60;
export async function fetchAllSwaps(mint, apiKey, signal, onEvent, { windowSecs = null } = {}) {
  const all = [];
  const seen = new Set();
  let gteSlot = 0, firstBuyTs = null, complete = false;
  for (let page = 0; page < HUNT_MAX_PAGES; page++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let txs, retries = 0;
    while (true) {
      try {
        await sleep(1100);
        txs = await heliusGet(mint, apiKey, { asc: true, gteSlot }, signal);
        break;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        if (e.code === "RATE_LIMIT" && retries < 6) { retries++; onEvent?.({ type: "rate_limit" }); await sleep(2000 * Math.pow(2, retries - 1)); continue; }
        throw e;
      }
    }
    if (!Array.isArray(txs) || txs.length === 0) { complete = true; break; }
    const fresh = txs.filter((t) => !seen.has(t.signature));
    for (const t of fresh) seen.add(t.signature);
    all.push(...fresh);
    onEvent?.({ type: "page", total: all.length });
    if (txs.length < 100) { complete = true; break; }
    const last = txs[txs.length - 1];
    if (firstBuyTs == null) firstBuyTs = all.find((t) => isBuyTx(t, mint))?.timestamp ?? null;
    if (windowSecs && firstBuyTs != null && last.timestamp > firstBuyTs + windowSecs) { complete = true; break; }
    gteSlot = fresh.length ? last.slot : last.slot + 1;   // a full page inside one slot: step past it
  }
  if (firstBuyTs == null) firstBuyTs = all.find((t) => isBuyTx(t, mint))?.timestamp ?? null;
  return { txs: all, mintFirstTs: firstBuyTs ?? all[0]?.timestamp ?? Infinity, coveredTo: all.length ? all[all.length - 1].timestamp : 0, complete };
}

export async function fetchWalletAllTxs(wallet, apiKey, signal) {
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

// Post-hunt bundle detection, from each wallet's money flows (trades excluded, so a pool or a
// bonding curve paying out two sellers is not mistaken for a shared funder):
//   · SOL or tokens moved directly between two result wallets
//   · the same outside wallet (not an exchange) sent SOL to two or more of them
export async function detectBundles(wallets, apiKey, signal) {
  const walletSet = new Set(wallets);
  const adj       = new Map(wallets.map((w) => [w, new Set()]));
  const funderMap = new Map();

  const BATCH = 5;
  for (let i = 0; i < wallets.length; i += BATCH) {
    if (signal?.aborted) return null;
    const chunk   = wallets.slice(i, i + BATCH);
    const fetched = await Promise.all(chunk.map((w) => fetchWalletAllTxs(w, apiKey, signal)));
    chunk.forEach((wallet, j) => {
      for (const f of followAnalyze(fetched[j] || [], wallet).flows.values()) {
        if (walletSet.has(f.addr)) {
          adj.get(wallet).add(f.addr); adj.get(f.addr).add(wallet);
        } else if (f.in > 0 && !KNOWN_EXCHANGES.has(f.addr)) {
          if (!funderMap.has(f.addr)) funderMap.set(f.addr, new Set());
          funderMap.get(f.addr).add(wallet);
        }
      }
    });
    if (i + BATCH < wallets.length) await sleep(1100);
  }

  for (const recipients of funderMap.values()) {
    if (recipients.size < 2) continue;
    const arr = [...recipients];
    for (let a = 0; a < arr.length; a++) {
      for (let b = a + 1; b < arr.length; b++) { adj.get(arr[a]).add(arr[b]); adj.get(arr[b]).add(arr[a]); }
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

export async function traceWalletChain(startWallet, apiKey, signal, onStep, opts = {}) {
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

    // The largest single transfer out, read from money flows: trades are excluded, so the SOL a
    // bot-routed buy sends to a pool is never taken for a transfer
    let best = null;
    for (const f of followAnalyze(txs, current).flows.values()) {
      for (const e of f.ev) {
        if (e.dir !== "out") continue;
        const amount = mode === "usdc" ? e.usd : e.sol * 1e9;
        if (mode === "usdc" ? amount < minUsdc || amount > maxUsdc : amount <= 0) continue;
        if (!best || amount > best.amount) best = { to: f.addr, amount, ts: e.ts };
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


export function walletBoughtMint(txs, wallet, mint, windowStart, windowEnd, minSolLamports) {
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

// Reverse mode: which of these wallets bought `mint` inside the window? Each wallet's token
// account for the mint holds everything it did with that coin, so it is one call per wallet.
export async function checkWalletsBatch(wallets, mint, windowStart, windowEnd, minSol, apiKey, signal, onProgress) {
  const acc = (await followRpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }], apiKey, signal))?.value;
  const program = acc?.owner === TOKEN22_PROGRAM ? TOKEN22_PROGRAM : TOKEN_PROGRAM;
  const minSolLamports = minSol * 1e9;
  const matched = new Set();
  let done = 0;
  for (const w of wallets) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const txs = await followFetchPage(await followAta(w, mint, program), apiKey, signal);
    if (walletBoughtMint(txs, w, mint, windowStart, windowEnd, minSolLamports)) matched.add(w);
    onProgress?.(++done);
  }
  return matched;
}

// How many different tokens a wallet bought in its last 100 transactions (volume-bot check)
export async function fetchWalletUniqueMints(wallet, apiKey, signal) {
  try {
    const txs = await followFetchPage(wallet, apiKey, signal);
    return new Set(followAnalyze(txs, wallet).trades.filter((t) => t.side === "buy").map((t) => t.mint)).size;
  } catch (e) {
    if (e.name === "AbortError") throw e;
    return 0;
  }
}

export async function checkHighFrequencyWallets(wallets, apiKey, signal, threshold = 30) {
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

export function extractBuyers(txs, mint, windowStart, windowEnd, minSolLamports, excludeBots) {
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
export function detectVolumeSpike(buyEvents, multiplier = 3) {
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

export function extractEarlyBuyers(txs, mint, method, opts, minSolLamports, excludeBots) {
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

// Where a token trades: the most frequent source that is a launchpad or DEX. Bot-routed trades
// arrive as SYSTEM_PROGRAM / SOLANA_PROGRAM_LIBRARY, which say nothing, so those are not counted.
export function detectLaunchpad(txs) {
  const counts = {};
  for (const tx of txs) {
    const src = tx.source;
    if (src && src !== "UNKNOWN" && SOURCE_LABELS[src]) counts[src] = (counts[src] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "UNKNOWN";
}

// ─── Follow · chain analysis ──────────────────────────────────────────────────
// "Seguir": follow a person from one root wallet, map where their SOL went, and
// rank the wallets that look like their own (next trading wallet, sister wallets).

export const USDT_MINT        = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const FOLLOW_STABLES   = new Set([USDC_MINT, USDT_MINT]);
export const FOLLOW_DAY       = 86400;
export const FOLLOW_DUST_SOL  = 0.05;  // below this a transfer is a fee, tip, rebate or spam
export const FOLLOW_EDGE_SOL  = 0.5;   // minimum moved between two wallets to draw and follow the link
export const FOLLOW_TRADE_SOL = 0.01;  // a trade under this (or under FOLLOW_TRADE_USD) is dust: bots, tests, airdrops
export const FOLLOW_TRADE_USD = 1;
export const FOLLOW_GAP_MS    = 450;   // one Helius request per gap, shared by every Follow call
export const FOLLOW_CAPS      = { funders: 5, l1: 6, l2: 10, l3: 8, perParent: 4, hubMatches: 5, sisters: 4, cexSearches: 1 };
// After a deposit into an exchange: look for withdrawals of 90–101% of it during the next
// windowH hours. Deposits older than maxAgeH, or under minSol, are not chased.
export const FOLLOW_CEX       = { windowH: 6, maxAgeH: 72, chunk: 1800, minSol: 1 };

// Well-known coins. A token that copies the start of one of these addresses (address poisoning),
// or takes its symbol while posing as it, is an imitation: it never counts as a buy.
export const FOLLOW_KNOWN = {
  SOL: WSOL, WSOL, USDC: USDC_MINT, USDT: USDT_MINT,
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
  JTO: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL", PYTH: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
};
// Stables and staked SOL: buying them is parking money, not trading
export const FOLLOW_PARKED = new Set(["USDT", "USDC", "USDS", "USD1", "PYUSD", "USDE", "USDH", "FDUSD", "DAI", "EURC", "USDG", "USDY", "UXD",
  "SOL", "WSOL", "MSOL", "JITOSOL", "BSOL", "JUPSOL", "INF", "HSOL", "BNSOL", "DSOL", "VSOL", "PICOSOL", "STSOL", "LST"]);
export const followSym = (x) => String(x || "").toUpperCase().replace(/^\$/, "");
// Does the name pass itself off as the real coin? A memecoin that merely shares a symbol is a real buy.
export function followPoses(sym, name) {
  const n = followSym(name).replace(/[^A-Z0-9]/g, "");
  return !n || n.includes(sym) || /USD|DOLLAR|TETHER|STAKED|STAKING|WRAPPED/.test(n);
}
export function followPoison(mint) {
  for (const real of Object.values(FOLLOW_KNOWN)) if (mint !== real && mint.slice(0, 6) === real.slice(0, 6)) return true;
  return false;
}
// "fake" = imitation of a known coin · "park" = a stable or staked SOL · null = real trading
export function followNotTrade(mint, info) {
  if (followPoison(mint)) return "fake";
  const sym = followSym(info?.symbol);
  if (FOLLOW_KNOWN[sym] && FOLLOW_KNOWN[sym] !== mint && followPoses(sym, info?.name)) return "fake";
  return FOLLOW_PARKED.has(sym) && followPoses(sym, info?.name) ? "park" : null;
}

export let _followLast  = 0;
export let _followQueue = Promise.resolve();
export function followSlot(signal) {
  const run = _followQueue.then(async () => {
    if (signal?.aborted) return;
    const wait = _followLast + FOLLOW_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    _followLast = Date.now();
  });
  _followQueue = run;
  return run;
}

export function isSolAddress(a) {
  if (!a || a.length < 32 || a.length > 44) return false;
  try { return b58Decode(a).length === 32; } catch { return false; }
}

// One page of a wallet's history with NO type filter. Helius labels most bot-routed
// trades as TRANSFER, so trades are recognised from balance changes instead (followAnalyze).
export async function followFetchPage(address, apiKey, signal, before) {
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

export async function followFetchTxs(address, apiKey, signal, { maxPages = 1, untilTs = 0, before = null } = {}) {
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
export async function followFetchTokenMeta(mints, apiKey, signal) {
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
// `skip`: Map mint → "fake" | "park" for tokens that are not trading (see followNotTrade).
export function followAnalyze(txs, wallet, skip) {
  const fake = (m) => skip?.get(m) === "fake" || followPoison(m);
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
    let sol = 0, stable = 0, parked = false;
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
          else if (fake(c.mint)) continue;
          else if (skip?.get(c.mint) === "park") parked = true;
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
        else if (fake(t.mint)) continue;
        else if (skip?.get(t.mint) === "park") parked = true;
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
      const paid     = sol <= -FOLLOW_TRADE_SOL || stable <= -FOLLOW_TRADE_USD;
      const received = sol >=  FOLLOW_TRADE_SOL || stable >=  FOLLOW_TRADE_USD;
      if (got && paid) {
        trades.push({ sig: tx.signature, ts, side: "buy", mint: got.mint, amount: got.amt,
          sol: sol <= -FOLLOW_TRADE_SOL ? -sol : 0, usd: stable <= -FOLLOW_TRADE_USD ? -stable : 0 });
      } else if (gave && received) {
        trades.push({ sig: tx.signature, ts, side: "sell", mint: gave.mint, amount: gave.amt,
          sol: sol >= FOLLOW_TRADE_SOL ? sol : 0, usd: stable >= FOLLOW_TRADE_USD ? stable : 0 });
      } else if (gave && !got) {
        // Tokens left with nothing coming back: the wallet handed them to someone (often itself)
        for (const t of tx.tokenTransfers || []) {
          if (t.mint !== gave.mint || t.fromUserAccount !== wallet || !t.toUserAccount || t.toUserAccount === wallet || BLACKLIST.has(t.toUserAccount)) continue;
          const f = flow(t.toUserAccount);
          f.tok = (f.tok || 0) + 1;
          f.ev.push({ ts, dir: "tok", sol: 0, usd: 0 });
        }
      }
      continue; // never read a trade's fee and pool transfers as money sent to someone
    }
    if (parked) continue; // swapped into a stable or staked SOL: parked money, neither a trade nor a transfer

    // SOL ↔ stable conversion: not a transfer to anyone
    if (Math.abs(stable) >= FOLLOW_TRADE_USD && Math.abs(sol) >= FOLLOW_TRADE_SOL && Math.sign(stable) !== Math.sign(sol)) continue;

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
export function followHubKind(an) {
  let outCps = 0, inCps = 0;
  for (const f of an.flows.values()) { if (f.nOut) outCps++; if (f.nIn) inCps++; }
  const spanH = an.lastTs > an.firstTs ? (an.lastTs - an.firstTs) / 3600 : 0;
  if (an.n >= 100 && spanH < 12 && an.trades.length * 5 < an.n) return "exchange";
  if (outCps >= 8 || inCps >= 10) return "distributor";
  return null;
}

export function followTradeStats(trades, now) {
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

export function followTopFlows(an, dir, limit = 6) {
  const key = dir === "in" ? "in" : "out", usdKey = dir === "in" ? "inUsd" : "outUsd";
  return [...an.flows.values()]
    .filter((f) => f[key] >= FOLLOW_DUST_SOL || f[usdKey] >= 1)
    .map((f) => ({ addr: f.addr, sol: f[key], usd: f[usdKey], ts: Math.max(0, ...f.ev.filter((e) => e.dir === dir).map((e) => e.ts)) }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

export function followDur(secs) {
  if (secs < 90) return `${Math.max(1, Math.round(secs))} s`;
  if (secs < 5400) return `${Math.round(secs / 60)} min`;
  if (secs < 2 * FOLLOW_DAY) return `${Math.round(secs / 3600)} h`;
  return `${Math.round(secs / FOLLOW_DAY)} d`;
}

// How likely is this wallet to be the person's own? Every point has a stated reason.
export function followScore(node, ctx) {
  const why = [];
  const deposit = node.sharesKind === "deposit";
  let s = 0;
  if (node.side === "sib") {
    s += deposit ? 30 : 18;
    why.push(deposit ? "deposita en la misma dirección de exchange que la raíz" : "manda SOL al mismo puente que la raíz");
  } else if (node.viaHub) {
    s += 4 + Math.round(12 * (node.match?.q || 0)) + (node.single ? 16 : 0);
    why.push(`un exchange le pagó ${followDur(node.match?.dt || 0)} después del depósito, el ${Math.round((node.match?.ratio || 0) * 100)}% del monto`);
    if (node.single) why.push("es la única wallet nueva que retiró esa cantidad y después compró");
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
  if (node.tokens > 0) {
    s += 16; why.push(`le pasaron tokens directamente (${node.tokens} envío${node.tokens > 1 ? "s" : ""}): se hace entre wallets propias`);
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
  // Rastro's rule: past a bridge, a wallet that was already trading before the money arrived
  // is usually someone else who got paid, not a move
  const con = [];
  if (node.side === "out" && node.depth >= 2 && !node.viaHub && node.firstBuyTs && node.recvTs && node.firstBuyTs < node.recvTs - 60) {
    s -= 14; con.push("ya compraba antes de recibir este SOL: puede ser otra persona a la que le pagaron");
  }
  return { score: Math.max(1, Math.min(99, s)), why, con };
}

// Rastro's "mudanza": a wallet that received the person's SOL, bought after receiving it, and
// has bought more recently than any of the person's own wallets.
export function followMove(person, nodes) {
  const own = new Set([person.root, ...(person.aliases || [])]);
  const ownLast = Math.max(0, ...(person.trades || []).filter((t) => t.side === "buy" && own.has(t.wallet)).map((t) => t.ts));
  return (nodes || [])
    .filter((n) => n.role === "trader" && n.side === "out" && !own.has(n.addr) && n.buys > 0 && n.recvTs
      && n.lastBuyTs > n.recvTs && n.lastBuyTs > ownLast
      && (!n.viaHub || n.single) && (n.depth === 1 || !(n.firstBuyTs < n.recvTs - 60)))
    .sort((a, b) => b.lastBuyTs - a.lastBuyTs)[0] || null;
}

export const followScored = (n) => n.side !== "in" && !["root", "alias", "exchange", "deposit", "person"].includes(n.role);

// Full scan: root (+ confirmed wallets) → who funded it → where the money went, up to 3 hops.
// `meta`: followMetaCache (token rules) · `others`: Map wallet → name, for wallets of other people you follow.
export async function followScan(person, apiKey, signal, onProgress, { meta = null, others = null } = {}) {
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
    const an = await followRead(r.txs, addr, meta, signal);
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
      out.push({ addr: f.addr, recv: sol, recvUsd: usd, n: ev.length, recvTs: Math.min(...ev.map((e) => e.ts)), recvLastTs: Math.max(...ev.map((e) => e.ts)), back: f.in, tokens: f.tok || 0 });
    }
    // Wallets that only received tokens (no SOL) still count: people move bags between their own wallets
    for (const f of analyses.get(addr).flows.values()) {
      const ev = f.ev.filter((e) => e.dir === "tok" && e.ts >= afterTs);
      if (!ev.length || out.some((o) => o.addr === f.addr)) continue;
      out.push({ addr: f.addr, recv: 0, recvUsd: 0, n: 0, recvTs: Math.min(...ev.map((e) => e.ts)), recvLastTs: Math.max(...ev.map((e) => e.ts)), back: f.in, tokens: ev.length });
    }
    return out.sort((a, b) => (b.recv + b.recvUsd / 150 + (b.tokens ? 0.4 : 0)) - (a.recv + a.recvUsd / 150 + (a.tokens ? 0.4 : 0)));
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
  let cexLeft = FOLLOW_CAPS.cexSearches;
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
      back: item.back || 0, viaHub: !!item.match, match: item.match || null, viaDist: !!item.viaDist, tokens: item.tokens || 0,
    };
    nodes.set(addr, node);
    edges.push({ from: parent, to: addr, sol: item.recv, usd: item.recvUsd, n: item.n, ts: item.recvLastTs, guess: !!item.match, tokens: item.tokens || 0 });

    if (KNOWN_EXCHANGES.has(addr)) {
      node.role = "exchange"; node.exName = KNOWN_EXCHANGES.get(addr); node.lost = true;
      continue;
    }
    if (others?.has(addr)) {
      // A wallet of someone else you follow is never assigned to this person
      node.role = "person"; node.owner = others.get(addr);
      continue;
    }

    report(`Capa ${depth} · ${shortAddr(addr, 4, 4)}`);
    const an = analyses.get(addr) || await load(addr, { maxPages: 1 });
    const kind = ownSet.has(addr) ? null : followHubKind(an);

    // Paid by an exchange: only a wallet with almost no history before that withdrawal is "new"
    if (node.viaHub && an.txs.filter((t) => (t.timestamp || 0) < node.recvTs - 60).length > 3) {
      nodes.delete(addr); edges.pop(); perDepth[depth]--;
      continue;
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
    else if (node.recv >= 1 || node.recvUsd >= 150 || node.tokens > 0) node.role = "watch";

    if (followScored(node)) Object.assign(node, followScore(node, ctx));
    if (depth >= 3) continue;

    if (node.role === "exchange") {
      // Rastro's rule: after a deposit, look for withdrawals of about the same amount (90–101%)
      // in the following hours, to wallets that are new. One match is the new wallet; several are "possible".
      const deposits = (analyses.get(parent)?.flows.get(addr)?.ev || []).filter((e) => e.dir === "out" && (e.sol >= FOLLOW_DUST_SOL || e.usd >= 20));
      if (!deposits.length) deposits.push({ sol: node.recv, usd: node.recvUsd || 0, ts: node.recvTs });
      const span = FOLLOW_CEX.windowH * 3600, maxAge = FOLLOW_CEX.maxAgeH * 3600;
      let outs = null;
      if (an.complete || an.firstTs <= node.recvTs) {
        outs = [...an.flows.values()].flatMap((f) => f.ev.filter((e) => e.dir === "out").map((e) => ({ to: f.addr, sol: e.sol, usd: e.usd, ts: e.ts })));
      } else if (cexLeft > 0 && (node.recv >= FOLLOW_CEX.minSol || node.recvUsd >= 150) && now - node.recvLastTs <= maxAge) {
        cexLeft--;
        report(`Exchange ${shortAddr(addr, 4, 4)} · buscando retiros parecidos`);
        const recent = deposits.filter((d) => now - d.ts <= maxAge);
        const from = Math.min(...recent.map((d) => d.ts));
        outs = await followExchangeWithdrawals(addr, from, Math.min(now - 60, Math.max(...recent.map((d) => d.ts)) + span), apiKey, signal);
        node.searched = outs.length;
      }
      node.lost = !outs;
      const best = new Map();
      for (const e of outs || []) {
        if (e.to === parent || nodes.has(e.to)) continue;
        for (const d of deposits) {
          // like with like: a SOL deposit against SOL withdrawals, a stable deposit against stables
          const [put, got] = d.sol > 0 ? [d.sol, e.sol] : [d.usd, e.usd];
          if (!put || !got) continue;
          const dt = e.ts - d.ts, ratio = got / put;
          if (dt < -30 || dt > span || ratio < 0.9 || ratio > 1.01) continue;
          const q = 0.6 * (1 - Math.abs(1 - ratio) / 0.1) + 0.4 / (1 + Math.max(0, dt) / 3600);
          const cur = best.get(e.to);
          if (!cur || q > cur.match.q) best.set(e.to, { addr: e.to, recv: e.sol || 0, recvUsd: e.usd || 0, n: 1, recvTs: e.ts, recvLastTs: e.ts, match: { q, dt: Math.max(0, dt), ratio } });
        }
      }
      [...best.values()].sort((a, b) => b.match.q - a.match.q).slice(0, FOLLOW_CAPS.hubMatches).forEach((c) => enqueue(addr, c, depth + 1));
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

  // Via an exchange: when exactly one new wallet withdrew about the same and then bought, it is the one
  for (const x of nodes.values()) {
    if (x.role !== "exchange") continue;
    const hits = [...nodes.values()].filter((n) => n.parent === x.addr && n.viaHub && n.buys > 0 && n.lastBuyTs >= n.recvTs);
    if (hits.length === 1) hits[0].single = true;
  }

  for (const n of nodes.values()) {
    if (followScored(n)) Object.assign(n, followScore(n, ctx));
    else { delete n.score; delete n.why; delete n.con; }
  }

  trades.sort((a, b) => b.ts - a.ts);
  report("Listo");
  return { ...snapshot(), trades: trades.slice(0, 400), scannedAt: now };
}

// The map adds up across scans (Rastro's "historial acumulado"): what a new scan no longer reaches
// is kept for `keepDays` as long as it still hangs from a wallet that is on the new map.
export function followMergeGraph(prev, next, now, keepDays = 7) {
  for (const n of next.nodes) n.seenAt = now;
  if (!prev?.nodes?.length) return next;
  const cutoff = now - keepDays * FOLLOW_DAY;
  const have = new Map(next.nodes.map((n) => [n.addr, n]));
  const old = prev.nodes.filter((n) => !have.has(n.addr) && n.role !== "root" && n.role !== "alias" && (n.seenAt || 0) >= cutoff);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of old) {
      if (have.has(n.addr) || !have.has(n.parent)) continue;
      const parent = have.get(n.parent);
      // a wallet the new scan decided is a dead end drops whatever used to hang from it
      if (!parent.kept && ["exchange", "deposit", "person"].includes(parent.role) && n.side === "out") continue;
      have.set(n.addr, { ...n, kept: true });
      grew = true;
    }
  }
  const keys = new Set(next.edges.map((e) => `${e.from}>${e.to}`));
  const edges = [...next.edges];
  for (const e of prev.edges || []) {
    const k = `${e.from}>${e.to}`;
    if (keys.has(k) || !have.has(e.from) || !have.has(e.to)) continue;
    if (!have.get(e.from).kept && !have.get(e.to).kept) continue;   // between two fresh wallets the new scan is the truth
    keys.add(k); edges.push(e);
  }
  return { nodes: [...have.values()], edges };
}

// How the person is doing with what they traded, from the trades on record (7 days).
// prices: { mint: SOL per token }. A token is "closed" once at least 90% of what was bought is sold.
export function followPerformance(trades, prices = {}) {
  const by = new Map();
  for (const t of trades) {
    if (!t.sol) continue;   // stable-quoted trades are left out: everything here is in SOL
    let r = by.get(t.mint);
    if (!r) { r = { mint: t.mint, bought: 0, sold: 0, spent: 0, got: 0, firstBuy: 0, lastSell: 0 }; by.set(t.mint, r); }
    if (t.side === "buy") { r.bought += t.amount; r.spent += t.sol; r.firstBuy = r.firstBuy ? Math.min(r.firstBuy, t.ts) : t.ts; }
    else { r.sold += t.amount; r.got += t.sol; r.lastSell = Math.max(r.lastSell, t.ts); }
  }
  const rows = [];
  let realized = 0, unrealized = 0, wins = 0, closed = 0, open = 0, priced = 0;
  const holds = [];
  for (const r of by.values()) {
    if (!r.bought) continue;                       // sold something bought before the window: cost unknown
    const cost = r.spent / r.bought;
    const soldPart = Math.min(r.sold, r.bought);
    r.realized = r.got * (r.sold ? soldPart / r.sold : 0) - cost * soldPart;
    r.left = Math.max(0, r.bought - r.sold);
    r.closed = r.sold >= 0.9 * r.bought;
    realized += r.realized;
    if (r.closed) {
      closed++;
      if (r.realized > 0) wins++;
      if (r.lastSell > r.firstBuy) holds.push(r.lastSell - r.firstBuy);
    } else {
      open++;
      const price = prices[r.mint];
      if (price > 0) { r.value = r.left * price; r.unrealized = r.value - cost * r.left; unrealized += r.unrealized; priced++; }
    }
    rows.push(r);
  }
  holds.sort((a, b) => a - b);
  return { rows, realized, unrealized, wins, closed, open, priced, medianHold: holds.length ? holds[Math.floor(holds.length / 2)] : 0 };
}

// Current price in SOL per token, from DexScreener (no key; 30 mints per call). Many pools are
// not quoted in SOL (other tokens, tokenised stocks), so each token's USD price from its deepest
// pool is divided by SOL's USD price. Tokens with no pool are left out.
export async function followFetchPrices(mints, signal) {
  const usd = {};
  const list = [WSOL, ...mints.filter((m) => m !== WSOL)];
  for (let i = 0; i < list.length; i += 30) {
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${list.slice(i, i + 30).join(",")}`, { signal });
      for (const p of res.ok ? await res.json() : []) {
        const mint = p?.baseToken?.address, price = Number(p?.priceUsd), liq = p?.liquidity?.usd || 0;
        if (mint && price > 0 && (!usd[mint] || liq > usd[mint].liq)) usd[mint] = { price, liq };
      }
    } catch (e) { if (e.name === "AbortError") throw e; }
  }
  const sol = usd[WSOL]?.price;
  if (!sol) return {};
  return Object.fromEntries(Object.entries(usd).filter(([m]) => m !== WSOL).map(([m, v]) => [m, v.price / sol]));
}

// Light check between full scans: everything new on the person's wallets since the last check
// (nothing is missed while the app was closed), money leaving to addresses that are not on the
// map yet, quiet candidates that started buying, and a possible move to a new wallet.
export async function followRefresh(person, apiKey, signal, { meta = null } = {}) {
  const now   = Math.floor(Date.now() / 1000);
  const own   = [person.root, ...(person.aliases || [])];
  const known = new Set((person.trades || []).map((t) => t.sig + t.mint));
  const nodes = (person.graph?.nodes || []).map((n) => ({ ...n }));
  const byAddr = new Map(nodes.map((n) => [n.addr, n]));
  const fresh = [], alerts = [];
  const since = person.checkedAt ? person.checkedAt - 300 : 0;

  for (const w of own) {
    const { txs } = await followFetchTxs(w, apiKey, signal, { maxPages: since ? 5 : 1, untilTs: since });
    const an = await followRead(txs, w, meta, signal);
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
    .filter((n) => followScored(n) && n.buys != null && (n.role === "watch" || (n.score || 0) >= 50))
    .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  for (const n of recheck) {
    const { txs } = await followFetchTxs(n.addr, apiKey, signal, { maxPages: 1 });
    const an = await followRead(txs, n.addr, meta, signal);
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

  const move = followMove({ ...person, trades }, nodes);
  if (move) alerts.push({ kind: "switch", ts: move.recvTs, addr: move.addr, buys: move.buys });
  return { fresh, alerts, nodes, checkedAt: now };
}

// ─── Follow · real time, convergence, CA search (ported from Rastro) ──────────

// Token symbols, fetched once per mint and shared by every scan, check and live update.
export function followMetaCache(initial, apiKey) {
  const known = { ...initial };
  return {
    known,
    async ensure(mints, signal) {
      const missing = [...new Set(mints)].filter((m) => !known[m]);
      if (!missing.length) return;
      Object.assign(known, await followFetchTokenMeta(missing, apiKey, signal));
      for (const m of missing) known[m] ||= { symbol: "", name: "" };
    },
    skipOf(mints) {
      const skip = new Map();
      for (const m of mints) { const kind = followNotTrade(m, known[m]); if (kind) skip.set(m, kind); }
      return skip;
    },
  };
}

// followAnalyze, minus imitations and parked money: what is left is real trading.
export async function followRead(txs, wallet, meta, signal) {
  const an = followAnalyze(txs, wallet);
  const mints = [...new Set(an.trades.map((t) => t.mint))];
  if (!meta || !mints.length) return an;
  await meta.ensure(mints, signal);
  const skip = meta.skipOf(mints);
  return skip.size ? followAnalyze(txs, wallet, skip) : an;
}

// One transaction by signature (it can take a moment to be indexed after the websocket fires)
export async function followFetchBySig(sig, apiKey, signal) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await followSlot(signal);
    try {
      const res = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${apiKey}`, {
        method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactions: [sig] }),
      });
      if (res.ok) { const j = await res.json(); if (Array.isArray(j) && j[0]) return j[0]; }
    } catch (e) { if (e.name === "AbortError") throw e; }
    await sleep(900);
  }
  return null;
}

// SOL that left an exchange-scale wallet inside a time window, read in 30-minute slices
// (a busy hot wallet moves ~100 transactions per slice, so "latest pages" never reach back).
export async function followExchangeWithdrawals(exchange, fromTs, toTs, apiKey, signal) {
  const out = [];
  let calls = 0;
  for (let a = fromTs; a < toTs && calls < 26; a += FOLLOW_CEX.chunk) {
    const b = Math.min(toTs, a + FOLLOW_CEX.chunk - 1);
    let before = null;
    for (let page = 0; page < 2 && calls < 26; page++) {
      calls++;
      await followSlot(signal);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const res = await fetch(`https://api.helius.xyz/v0/addresses/${exchange}/transactions?api-key=${apiKey}&limit=100&gte-time=${a}&lte-time=${b}${before ? `&before=${before}` : ""}`, { signal });
      if (res.status === 429) { await sleep(2000); page--; continue; }
      const list = res.ok ? await res.json() : [];
      if (!Array.isArray(list) || !list.length) break;
      for (const t of list) {
        if (t.transactionError) continue;
        for (const n of t.nativeTransfers || []) {
          if (n.fromUserAccount === exchange && n.toUserAccount && n.toUserAccount !== exchange && n.amount >= FOLLOW_DUST_SOL * 1e9) {
            out.push({ to: n.toUserAccount, sol: n.amount / 1e9, usd: 0, ts: t.timestamp });
          }
        }
        for (const n of t.tokenTransfers || []) {
          if (FOLLOW_STABLES.has(n.mint) && n.fromUserAccount === exchange && n.toUserAccount && n.toUserAccount !== exchange && n.tokenAmount >= 20) {
            out.push({ to: n.toUserAccount, sol: 0, usd: n.tokenAmount, ts: t.timestamp });
          }
        }
      }
      if (list.length < 100) break;
      before = list[list.length - 1].signature;
    }
  }
  return out;
}

// Helius websocket: one logsSubscribe per watched wallet. A buy or a transfer arrives in 1–2 s.
// Reconnects by itself and subscribes again.
export function followRealtime(apiKey, onSig, onStatus) {
  let ws = null, connected = false, closed = false, retry = 0, nextId = 1, timer = null;
  let want = new Set();
  const subs = new Map(), bySub = new Map(), pending = new Map();
  const status = () => onStatus?.({ connected, wallets: subs.size });
  const send = (o) => { try { ws?.send(JSON.stringify(o)); } catch { /* sent again on reconnect */ } };
  const subscribe = (a) => {
    const id = nextId++;
    pending.set(id, a);
    send({ jsonrpc: "2.0", id, method: "logsSubscribe", params: [{ mentions: [a] }, { commitment: "confirmed" }] });
  };
  const unsubscribe = (a) => {
    const sid = subs.get(a);
    if (sid == null) return;
    subs.delete(a); bySub.delete(sid);
    send({ jsonrpc: "2.0", id: nextId++, method: "logsUnsubscribe", params: [sid] });
  };
  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${apiKey}`);
    ws.onopen = () => {
      connected = true; retry = 0;
      subs.clear(); bySub.clear(); pending.clear();
      for (const a of want) subscribe(a);
      status();
    };
    ws.onmessage = (m) => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d.id != null && pending.has(d.id)) {
        const a = pending.get(d.id);
        pending.delete(d.id);
        if (typeof d.result === "number") {
          if (want.has(a)) { subs.set(a, d.result); bySub.set(d.result, a); status(); }
          else send({ jsonrpc: "2.0", id: nextId++, method: "logsUnsubscribe", params: [d.result] });
        }
        return;
      }
      if (d.method === "logsNotification") {
        const a = bySub.get(d.params?.subscription), v = d.params?.result?.value;
        if (a && v && !v.err) onSig(a, v.signature);
      }
    };
    ws.onclose = () => {
      connected = false;
      status();
      if (!closed) timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
    ws.onerror = () => {};
  };
  connect();
  // Helius drops idle connections
  const ping = setInterval(() => connected && send({ jsonrpc: "2.0", id: nextId++, method: "getHealth" }), 30000);
  return {
    setWallets(list) {
      want = new Set(list);
      if (!connected) return;
      const waiting = new Set(pending.values());
      for (const a of want) if (!subs.has(a) && !waiting.has(a)) subscribe(a);
      for (const a of [...subs.keys()]) if (!want.has(a)) unsubscribe(a);
      status();
    },
    close() {
      closed = true; onStatus = null;
      clearInterval(ping); clearTimeout(timer);
      try { ws?.close(); } catch { /* already closed */ }
    },
  };
}

// Convergence: two or more different people buy the same coin within a short window. It is the
// strongest signal following gives: not one person, a group arriving at the same place.
export const FOLLOW_CONVERGE = { windowSec: 30 * 60, minPeople: 2 };

// buys: [{ name, wallet, mint, ts, sol, usd, sig }] → coins bought by at least `minPeople` people
// inside `windowSec` (each person's first buy in the window; one person with two wallets counts once).
export function followConvergences(buys, { windowSec = FOLLOW_CONVERGE.windowSec, minPeople = FOLLOW_CONVERGE.minPeople } = {}) {
  const byMint = new Map();
  for (const b of buys) {
    if (!b?.mint || !b.name) continue;
    if (!byMint.has(b.mint)) byMint.set(b.mint, []);
    byMint.get(b.mint).push(b);
  }
  const out = [];
  for (const [mint, list] of byMint) {
    list.sort((a, b) => a.ts - b.ts);
    let best = null;   // sliding window: the largest group of different people
    for (let i = 0; i < list.length; i++) {
      const first = new Map();
      for (let j = i; j < list.length && list[j].ts - list[i].ts <= windowSec; j++) {
        if (!first.has(list[j].name)) first.set(list[j].name, list[j]);
      }
      const newer = best && first.size === best.size && [...first.values()].at(-1).ts > [...best.values()].at(-1).ts;
      if (first.size >= minPeople && (!best || first.size > best.size || newer)) best = first;
    }
    if (!best) continue;
    const people = [...best.values()].map((b) => ({ name: b.name, wallet: b.wallet, ts: b.ts, sol: b.sol || 0, usd: b.usd || 0, sig: b.sig }));
    out.push({
      mint, people, firstTs: people[0].ts, lastTs: people.at(-1).ts, spanSec: people.at(-1).ts - people[0].ts,
      sol: people.reduce((s, p) => s + p.sol, 0), usd: people.reduce((s, p) => s + p.usd, 0),
    });
  }
  return out.sort((a, b) => b.lastTs - a.lastTs);
}

// Live detector: feed it buys one by one; it answers with a convergence when a coin reaches
// `minPeople` people, and again each time one more person joins. Never twice for the same group.
export function followDetector(opts = {}) {
  const o = { ...FOLLOW_CONVERGE, ...opts };
  let buys = [];
  const seen = new Set();
  const announced = new Map();
  const add = (b) => {
    const k = `${b.sig}:${b.mint}:${b.name}`;
    if (seen.has(k)) return false;
    seen.add(k); buys.push(b);
    return true;
  };
  return {
    seed(list) {
      for (const b of list) add(b);
      for (const c of followConvergences(buys, o)) announced.set(c.mint, c.people.length);
    },
    push(b, now = Math.floor(Date.now() / 1000)) {
      if (!add(b)) return null;
      buys = buys.filter((x) => x.ts >= now - Math.max(o.windowSec * 4, FOLLOW_DAY));
      const c = followConvergences(buys.filter((x) => x.mint === b.mint), o)[0];
      if (!c || !c.people.some((p) => p.name === b.name)) return null;
      if ((announced.get(b.mint) || 0) >= c.people.length) return null;
      announced.set(b.mint, c.people.length);
      return c;
    },
  };
}

// Search by CA: who, among the people you follow and the wallets of their networks, traded this
// coin? Each wallet's token account for the mint (its ATA) is derived and only that account's
// history is read: it holds everything the wallet did with the coin, even after selling it all.
export const TOKEN_PROGRAM   = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN22_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM     = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

export async function followFindPda(seeds, programId) {
  const prog = b58Decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, new Uint8Array([bump]), prog, _PDA_MARKER];
    const buf = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let off = 0;
    for (const p of parts) { buf.set(p, off); off += p.length; }
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    if (!_isOnCurve(hash)) return b58Encode(hash);
  }
  return null;
}
export const followAta = (owner, mint, program = TOKEN_PROGRAM) => followFindPda([b58Decode(owner), b58Decode(program), b58Decode(mint)], ATA_PROGRAM);

export async function followRpc(method, params, apiKey, signal) {
  await followSlot(signal);
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "fr", method, params }),
  });
  if (res.status === 401 || res.status === 403) { const e = new Error("INVALID_KEY"); e.code = "INVALID_KEY"; throw e; }
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

// wallets: [{ address, pid, name, role }]
export async function followSearchMint(mint, wallets, apiKey, signal, meta, onProgress) {
  const acc = (await followRpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }], apiKey, signal))?.value;
  const program = acc?.owner;
  if (!acc || acc.data?.parsed?.type !== "mint" || (program !== TOKEN_PROGRAM && program !== TOKEN22_PROGRAM)) {
    return { mint, error: program === "11111111111111111111111111111111" ? "Esa dirección es una wallet que no está en la red de nadie que sigues." : "Esa dirección no es el CA de una moneda." };
  }
  await meta?.ensure([mint], signal);
  const hits = [];
  let done = 0;
  for (const w of wallets) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onProgress?.(++done, wallets.length);
    const ata = await followAta(w.address, mint, program);
    const txs = await followFetchPage(ata, apiKey, signal);
    if (!txs.length) continue;
    const trades = followAnalyze(txs, w.address).trades.filter((t) => t.mint === mint);
    if (!trades.length) continue;
    const buys = trades.filter((t) => t.side === "buy"), sells = trades.filter((t) => t.side === "sell");
    const sum = (list, k) => list.reduce((s, t) => s + (t[k] || 0), 0);
    hits.push({
      ...w, partial: txs.length >= 100, buys: buys.length, sells: sells.length,
      solIn: sum(buys, "sol"), solOut: sum(sells, "sol"), usdIn: sum(buys, "usd"), usdOut: sum(sells, "usd"),
      bought: sum(buys, "amount"), sold: sum(sells, "amount"),
      firstTs: Math.min(...trades.map((t) => t.ts)), lastTs: Math.max(...trades.map((t) => t.ts)),
    });
  }
  hits.sort((a, b) => a.firstTs - b.firstTs);
  return { mint, searched: wallets.length, hits, at: Math.floor(Date.now() / 1000) };
}
