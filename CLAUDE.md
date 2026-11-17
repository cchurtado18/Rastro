# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
export PATH="/opt/homebrew/bin:$PATH"  # required before npm commands
npm run dev     # start dev server → http://localhost:5173
npm run build   # production build
```

## What this project does

This is the **definitive edition**: Wallet Tracker merged with [Rastro](https://github.com/cchurtado18/Rastro) (git history of both is kept; Rastro's `main` is a merge parent). Rastro was a Node server + CLI; its best logic was ported into this browser app and its server, CLI and test suite were not carried over. See README.md for what came from each.

Web app that finds Solana wallet intersections to identify KOLs doing self-shill.
Logic: KOL buys token BEFORE shilling → their wallet appears as early buyer across multiple CAs → intersection = candidate wallets.

Designed for lowcap tokens (<1M mcap, 50–500 holders). With 3+ CAs should return 1–5 wallets.

The app has two top-level views, switched by `ViewSwitch` (state `view` in `App`). **Seguir is the home: the app always opens there.** The view is deliberately not remembered across reloads — a remembered "Cazar" made the app look unchanged to the user.
- **Cazar** (`hunt`): the intersection hunt described below.
- **Seguir** (`follow`): follow a person from one root wallet — see "Follow view".

## Architecture

Single-file React app: **all logic lives in `src/App.jsx`**. No backend. Helius API called directly from browser. localStorage for persistence.

**Helius endpoint:** `GET /v0/addresses/{MINT}/transactions?type=SWAP&limit=100`
- Paginated via `before` cursor (last tx signature). Safety cap: 30 pages max.
- Rate limit: 1100ms sleep between pages; 3 retries with 3s backoff on 429.

**Buyer detection flow** (`extractBuyers`):
1. Filter txs by timestamp window (from first swap of the token)
2. Skip feePayer if in BLACKLIST (DEX routers / program addresses)
3. Require `tokenTransfers[].toUserAccount` received the token mint
4. Calculate `solSpent = nativeTransfers from feePayer + WSOL tokenTransfers from feePayer × 1e9`
   - WSOL (`So111...112`) must be included — Raydium/Orca/Meteora swaps use pre-wrapped SOL, not native SOL
5. Skip if `solSpent < minSolLamports`
6. Bot filter: skip wallets with >5 txns on the token, or duplicate timestamps

**Intersection scoring:**
- Per-CA buyer sets computed in parallel (sequential API pages per CA)
- `score = count of CAs wallet appears in`
- `threshold = max(2, ceil(totalCAs * 0.5))` — must appear in majority

## Key state

```js
caEntries: [{ id, ca, windowKey, customSecs, minSol }]  // per-CA config
excludeBots: bool
phase: "idle" | "running" | "done"
results: [{ wallet, count, tokens, score }]
history: []   // localStorage "hx_history", max 5 entries
savedWallets: {}  // localStorage "kol_saved_wallets", {address: label}
```

## Per-CA config system

`caEntries` replaced the old global `cas`/`timeWindow`/`minSol` state.
- `windowKey` ∈ `["Todo", "1h", "3h", "6h", "12h", "24h", "Custom"]`
- `customSecs`: number | null (used when `windowKey === "Custom"`)
- `parseWindowInput(str)`: parses `"4.5h"`, `"90m"`, `"2"` (implicit hours) → seconds
- `mkEntry()`: creates blank entry with auto-incremented id

`loadHistory` handles both new format (`caEntries`) and old format (`cas`/`timeWindow`/`minSol`) for backward compatibility.

## Launchpad detection

`detectLaunchpad(txs)` uses Helius's native `tx.source` field (already parsed: `PUMP_FUN`, `RAYDIUM`, `ORCA`, `METEORA`, `JUPITER`, `MOONSHOT`, etc.). Takes the most frequent non-UNKNOWN source.

`SOURCE_LABELS` maps source → `{ label, color, bg, emoji }` for UI badges.

## Vanity address detection

`vanityTag(wallet)`: returns tag string if wallet has 4+ identical leading chars (regex `/^(.)\1{3,}/`) or starts with a known word (DEAD, KOL, CHAD, MOON, etc.). Shown as 💎 badge in results and saved wallets.

## BLACKLIST

Expanded set of program addresses (DEX routers, AMM pools, system programs) that must never appear as "buyers". Includes Raydium AMM/CLMM/CPMM, Orca Whirlpool v1/v2, Meteora DLMM/Dynamic AMM, Moonshot, Jupiter v4/v6, Pump.fun program + fee account, Token program, ATA program, System program.

## Follow view ("Seguir")

Follow a person, not a wallet: map where the root wallet's SOL went (up to 3 hops), rank the wallets that look like theirs, and track buys/sells across their confirmed wallets. All code sits between `// ─── Follow · chain analysis` and `// ─── TweaksPanel` in `src/App.jsx`. `FollowView` stays mounted (hidden with `display: none`) so a running scan survives switching views.

**Trades are read from balance changes, never from Helius `type`.** Helius labels most bot-routed trades (Axiom, Photon, etc.) as `TRANSFER` / `SYSTEM_PROGRAM`; a `type=SWAP` filter returned 15 of ~170 trades on the test wallet. `followFetchPage` therefore requests with no type filter and `followAnalyze(txs, wallet)` classifies each tx from `accountData`: token up + SOL/stable down = buy, token down + SOL/stable up = sell, no token change = money flow to/from a counterparty.

**Engine**
- `followSlot` — one shared serial throttle (`FOLLOW_GAP_MS` = 450 ms) for every Follow request; `followFetchPage` retries 429 with backoff.
- `followScan(person, apiKey, signal, onProgress, { meta, others })` — full scan, 35–60 calls / 25–40 s. Root: up to 6 pages (7 days). Then breadth-first over outgoing SOL, capped by `FOLLOW_CAPS`, one page per wallet. `others` (wallet → name of other followed people) become role `person` and are never assigned to this person. Returns `{ nodes, edges, trades, scannedAt }`.
- `followRead(txs, wallet, meta)` — `followAnalyze` minus tokens that are not trading. Always read wallets through this, with the shared `followMetaCache` (`metaOf()` in `FollowView`).
- `followRefresh(person, …, { meta })` — light check: reads every own wallet back to the previous check (up to 5 pages, so nothing is missed while the app was closed) plus up to 3 candidates. Reports new trades, outflows to wallets not on the map, quiet candidates that started buying, and a possible move (`followMove`). Runs every ~3 min only while the view is open, the tab is visible, and the toggle is on.
- `followScore(node, ctx)` — 1–99 "is this wallet theirs" score; every point pushes a reason into `node.why`. Keep it explainable.

**Node roles** (`FOLLOW_ROLES`): `root`, `alias` (user-confirmed), `person` (wallet of someone else you follow), `funder` (sent SOL to root), `bridge` (forwards ≥50%), `deposit` (pass-through into an exchange), `exchange` (≥100 tx in <12 h: trail lost), `distributor` (pays ≥8 or collects from ≥10 wallets at human pace), `trader` (received SOL and trades), `watch` (received ≥1 SOL, no trades yet), `sibling` (feeds the same private pass-through address as the root — typically a shared exchange deposit address, the strongest same-owner signal), `other`.

**Thresholds:** `FOLLOW_DUST_SOL` 0.05 (fees/tips/rebates ignored), `FOLLOW_EDGE_SOL` 0.5 (minimum to draw/follow a link), `FOLLOW_TRADE_SOL` 0.01 / `FOLLOW_TRADE_USD` 1 (below = dust, not a trade).

**State / storage**
```js
// localStorage "follow_people"
[{ id, name, root, aliases: [], addedAt, seenTs, scannedAt, checkedAt,
   graph: { nodes, edges },
   trades: [{ sig, ts, side, mint, amount, sol, usd, wallet }],  // 7 days, max 400
   alerts: [{ kind: "outflow" | "woke" | "switch", ts, addr, sol?, buys? }] }]
// "follow_events": live feed, newest first, max 300 — { key, type: "buy" | "sell" | "move" | "woke" | "switch" | "convergence", at, pid, name, … }
// also: "follow_sel" (open person), "follow_auto" ("0" = real time and checks off), "follow_notify" ("1" = browser notifications),
//       "follow_tokens" ({ mint: { symbol, name } }), "follow_ca_recent" (last 6 CA searches)
```

**UI:** `FollowGraph` (SVG; `followLayout` does "layers" and "radial"; pan by drag, zoom with ⌘/ctrl + wheel or the buttons; the view is derived from the layout until the user pans; it draws `followCollapse(graph)`, which merges dead-end exchanges under one parent into a single node — display only, the stored graph keeps every wallet), `FollowActivity` (headline, per-wallet cards, `FollowTimeline`, token table with a "Cazar" hand-off), `FollowProfile` (selected wallet: score, reasons for and against, flows, "Es su wallet"). The right panel has three tabs: Perfil, En vivo (`FollowLive`: real-time status, convergences of the last 24 h, the event feed) and CA (`FollowCA`: results of the sidebar search box).

**Hand-offs:** hunt results row → `onFollow` → `followSeed`; `#seguir=<wallet>&nombre=<name>` in the URL opens Follow and adds that wallet; Follow → `onTrace` opens the Tracer; token row "Cazar" → `huntToken(mint)` fills a CA entry.

### Ported from Rastro

- **Real time** — `followRealtime(apiKey, onSig, onStatus)`: one `logsSubscribe` per watched wallet on the Helius websocket, with reconnect. Watched = every person's own wallets (`core`) + up to 6 network wallets per person that could become theirs + receivers of a fresh transfer for 6 h (`extraRef`). `onSig` in `FollowView` reads that one transaction (`followFetchBySig`), updates the person, and calls `pushEvent`.
- **Events** — `pushEvent` is the single entry point for the live feed, browser notifications and the convergence detector. Every event has a unique `key`, so the websocket and the periodic check never report the same thing twice.
- **Convergence** — `followConvergences` / `followDetector`: 2+ different people buying the same mint within 30 min (`FOLLOW_CONVERGE`). One person with two wallets counts once.
- **Move** — `followMove(person, nodes)`: a `trader` that received the person's SOL, bought after receiving, and bought more recently than every own wallet. It raises a `switch` alert; the user confirms ("Es su wallet"). It is never assigned automatically.
- **Via exchange** — for an `exchange` node whose first page does not reach back to the deposit: `followExchangeWithdrawals` reads the next `FOLLOW_CEX.windowH` hours in 30-min slices using `gte-time` / `lte-time` (up to 26 calls). A withdrawal of 90–101% to a wallet with ≤3 earlier transactions is a match; exactly one match that then bought gets `single`. Only deposits ≤72 h old and ≥1 SOL, one exchange per scan (`FOLLOW_CAPS.cexSearches`).
- **Not trading** — `followNotTrade(mint, info)`: `"fake"` (copies the first 6 chars of a known mint, or takes its symbol while posing as it) is read as the plain transfer it was; `"park"` (stables, staked SOL) is ignored. `FOLLOW_KNOWN` mints were verified on chain.
- **CA search** — `followSearchMint`: derives each wallet's token account for the mint (`followAta`, works for Token and Token-2022) and reads only that account's history, 1 call per wallet, max 60 wallets.

## What NOT to do

- Do not cap buyer count with `maxBuyers` — the tool is also used for group trading detection, not just KOL hunting. Time window + min SOL filters are the correct levers.
- Do not add global time/SOL controls — config is per-CA intentionally (different tokens need different windows).
- Do not make unnecessary API calls — respect rate limits; the 1100ms sleep is required.
- In the Follow view, do not filter Helius requests by `type` and do not detect trades from `tx.type` — most trades arrive labelled `TRANSFER`.
- Do not present Follow scores as facts: they are heuristics, and the UI must keep showing the reasons behind each one.
