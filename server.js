#!/usr/bin/env node
// Panel local: http://localhost:4777 — muestra a quién sigues, su wallet activa y sus compras.
// Tiempo real: cada wallet vigilada está suscrita por websocket; una compra o un envío avisa al instante.
// Además revisa a todos cada REFRESH_MIN minutos (def. 5) como respaldo.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { addPerson, removePerson, people, state, refresh, short } from './lib/store.js';
import { startRealtime } from './lib/realtime.js';
import { transaction, tokenInfo } from './lib/solana.js';
import { parseTx, DEFAULTS } from './lib/tracker.js';
import { createDetector, findConvergences, buysFromState } from './lib/convergence.js';

const PORT = Number(process.env.PORT || 4777);
const REFRESH_MIN = Number(process.env.REFRESH_MIN || 5);
const CONVERGE_MIN = Number(process.env.CONVERGE_MIN || 30); // ventana para "varios compraron lo mismo"
const HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'index.html');

let running = null;
let lastRun = null;
const events = []; // últimos avisos (cambios de wallet y compras nuevas)
const clients = new Set(); // navegadores conectados al stream en vivo
const broadcast = (e) => { const line = `data: ${JSON.stringify(e)}\n\n`; for (const c of clients) c.write(line); };

const pending = new Set(); // búsquedas pedidas mientras otra estaba corriendo ('*' = todos)
const alerted = new Set(); // compras ya avisadas (firma:mint), para no avisar dos veces
const extraWatch = new Map(); // wallets que acaban de recibir dinero: se vigilan al instante

// Notificación nativa de macOS.
function notify(title, text) {
  if (process.platform !== 'darwin') return;
  execFile('osascript', ['-e', `display notification ${JSON.stringify(text)} with title ${JSON.stringify(title)} sound name "Glass"`], () => {});
}

function pushEvent(e) {
  const ev = { ...e, at: e.at || Math.floor(Date.now() / 1000) };
  events.unshift(ev); events.splice(100);
  broadcast({ t: 'alert', event: ev });
  if (ev.type === 'buy') checkConvergence(ev);
  if (ev.type === 'buy') notify(`🟢 ${ev.name} compró ${ev.symbol || short(ev.trade.mint)}`, `${ev.trade.sol ? ev.trade.sol.toFixed(2) + ' SOL' : ev.trade.usd.toFixed(0) + ' USD'} con ${short(ev.wallet)}`);
  if (ev.type === 'switch') notify(`🔁 ${ev.name} cambió de wallet`, `Nueva activa: ${short(ev.to)}`);
  if (ev.type === 'convergence') {
    const who = ev.people.map((p) => p.name).join(', ');
    notify(`🎯 ${ev.people.length} compraron ${ev.symbol || short(ev.mint)}`, `${who} en ${spanTxt(ev.spanSec)}`);
  }
  if (ev.type === 'move') notify(`💸 ${ev.name} movió dinero`, `${ev.amount.toFixed(2)} ${ev.asset} de ${short(ev.from)} a ${short(ev.to)}. Vigilando la nueva wallet.`);
}

// ---------- Convergencia ----------
const spanTxt = (s) => (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`);
const detector = createDetector({ windowSec: CONVERGE_MIN * 60 });
detector.seed(buysFromState(state(), Math.floor(Date.now() / 1000) - 86400));
// Cada compra avisada pasa por aquí: si otra persona compró lo mismo hace poco, se avisa la coincidencia.
async function checkConvergence(ev) {
  const t = ev.trade;
  const c = detector.push({ name: ev.name, wallet: ev.wallet, mint: t.mint, ts: t.ts, sol: t.sol, usd: t.usd, sig: t.sig });
  if (!c) return;
  const info = await tokenInfo([c.mint]).catch(() => ({}));
  if (info[c.mint]?.spoof) return;
  pushEvent({ type: 'convergence', ...c, symbol: info[c.mint]?.symbol, mcap: info[c.mint]?.mcap ?? null });
}
// Coincidencias de las últimas 24 h (para el panel).
function convergences() {
  const st = state();
  return findConvergences(buysFromState(st, Math.floor(Date.now() / 1000) - 86400), { windowSec: CONVERGE_MIN * 60 })
    .map((c) => ({ ...c, symbol: Object.values(st).map((r) => r.tokens?.[c.mint]?.symbol).find(Boolean) }));
}

function run(only) {
  if (running) { pending.add(only || '*'); return running; }
  broadcast({ t: 'run', running: true });
  running = refresh({ only, log: (m) => console.log(m), onEvent: broadcast })
    .then((ev) => {
      for (const e of ev.reverse()) {
        if (e.type === 'buy') { const k = e.trade.sig + ':' + e.trade.mint; if (alerted.has(k)) continue; alerted.add(k); e.symbol = state()[e.name]?.tokens?.[e.trade.mint]?.symbol; }
        pushEvent(e);
      }
      syncRealtime();
    })
    .catch((e) => console.error(e.message))
    .finally(() => {
      running = null; lastRun = Math.floor(Date.now() / 1000);
      broadcast({ t: 'run', running: false });
      if (pending.size) { const next = pending.has('*') ? undefined : [...pending][0]; next ? pending.delete(next) : pending.clear(); run(next); }
    });
  return running;
}

// ---------- Tiempo real ----------
// Wallets que se vigilan por websocket: la activa, sus wallets anteriores recientes, las que también
// compran, las que recibieron dinero y aún no compran, y las que acaban de recibir un envío.
function watched() {
  const st = state();
  const map = new Map();
  for (const p of people()) {
    const r = st[p.name];
    const add = (a) => a && !map.has(a) && map.set(a, p.name);
    add(p.active);
    p.wallets.slice(-3).forEach(add);
    r?.compare?.wallets.filter((w) => w.w7.buys).forEach((w) => add(w.address));
    r?.alsoActive?.forEach((a) => add(a.to));
    r?.watch?.forEach((w) => add(w.to));
  }
  for (const [a, n] of extraWatch) if (!map.has(a)) map.set(a, n);
  return map;
}
const rt = startRealtime({ onTx: onRealtimeTx, log: (m) => { console.log(m); broadcast({ t: 'rt' }); } });
function syncRealtime() { rt.setWallets(watched()); broadcast({ t: 'rt' }); }

const recheck = new Map(); // persona → temporizador (agrupa varias firmas seguidas en una revisión)
async function onRealtimeTx(wallet, name, sig) {
  let tx = null;
  for (let i = 0; i < 4 && !tx; i++) { tx = await transaction(sig).catch(() => null); if (!tx) await new Promise((r) => setTimeout(r, 800)); }
  const p = parseTx(tx, wallet);
  if (p) {
    const buys = p.trades.filter((t) => t.side === 'buy');
    const info = buys.length ? await tokenInfo(buys.map((t) => t.mint)).catch(() => ({})) : {};
    for (const t of buys) {
      const k = t.sig + ':' + t.mint;
      if (alerted.has(k) || info[t.mint]?.spoof) continue;
      alerted.add(k);
      pushEvent({ type: 'buy', name, wallet, trade: t, symbol: info[t.mint]?.symbol, instant: true });
    }
    for (const m of p.moves) {
      const big = m.asset === 'SOL' ? m.amount >= DEFAULTS.minMoveSol : m.amount >= DEFAULTS.minMoveUsd;
      if (m.dir !== 'out' || !big) continue;
      // Empieza a vigilar el destino ya mismo: su primera compra también llega al instante.
      extraWatch.set(m.to, name);
      pushEvent({ type: 'move', name, from: wallet, to: m.to, amount: m.amount, asset: m.asset, sig: m.sig });
      syncRealtime();
    }
  }
  // Revisión completa de esa persona unos segundos después (mudanza, comparación, mapa).
  clearTimeout(recheck.get(name));
  recheck.set(name, setTimeout(() => { recheck.delete(name); run(name); }, 5000));
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(HTML)); }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write(': hola\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { people: people(), state: state(), events, running: !!running, lastRun, refreshMin: REFRESH_MIN, convergeMin: CONVERGE_MIN, convergences: convergences(), realtime: rt.status() });
    if (req.method === 'POST' && url.pathname === '/api/people') {
      const { name, wallet } = await body(req);
      addPerson(String(name || '').trim(), String(wallet || '').trim());
      run(String(name).trim());
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && url.pathname === '/api/people') { removePerson(url.searchParams.get('name')); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/refresh') { run(url.searchParams.get('name') || undefined); return json(res, 200, { ok: true }); }
    json(res, 404, { error: 'no existe' });
  } catch (e) { json(res, 400, { error: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.log(`rastro en http://localhost:${PORT} (revisa cada ${REFRESH_MIN} min)`));

setInterval(() => run(), REFRESH_MIN * 60_000);
// Al arrancar, revisa a quien todavía no tenga resultado.
for (const p of people()) if (!state()[p.name]) run(p.name);
syncRealtime();
