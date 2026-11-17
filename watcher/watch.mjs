#!/usr/bin/env node
// Vigilante en segundo plano: sigue a la gente de tu respaldo con el navegador cerrado y avisa
// en la Mac (y por Telegram, si lo configuras) cuando compran, mueven SOL o coinciden.
//
//   npm run watch                          usa el respaldo más reciente de ~/Downloads
//   npm run watch -- ruta/al/respaldo.json
//   npm run watch -- --prueba              manda un aviso de prueba por cada canal y sale
//   opciones: --ventas (avisar también ventas) · --sin-mac (sin notificaciones de macOS)
//
// El respaldo se exporta desde la app (Seguir → "Exportar respaldo"). Si lo vuelves a exportar
// al mismo archivo, el vigilante lo relee solo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  shortAddr, FOLLOW_EDGE_SOL, followScored, followRealtime, followFetchBySig, followRead, followMetaCache, followDetector, followDur,
} from "../src/engine.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

// .env of the project: VITE_HELIUS_API_KEY, and optionally TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
for (const line of fs.existsSync(path.join(ROOT, ".env")) ? fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const KEY = process.env.VITE_HELIUS_API_KEY;
const TG = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_CHAT_ID } : null;
const MAC = process.platform === "darwin" && !flag("--sin-mac");

const stamp = () => new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const log = (text) => console.log(`[${stamp()}] ${text}`);

// One alert, to every channel that is on. `notify: false` only prints it.
async function alert(title, body, { link = "", notify = true } = {}) {
  log(`${title} — ${body}`);
  if (!notify) return;
  if (MAC) execFile("osascript", ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)} sound name "Glass"`], () => {});
  if (TG) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TG.token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TG.chat, text: `${title}\n${body}${link ? `\n${link}` : ""}`, disable_web_page_preview: true }),
      });
      if (!res.ok) log(`  Telegram respondió ${res.status}: revisa TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID`);
    } catch (e) { log(`  Telegram no respondió: ${e.message}`); }
  }
}

if (flag("--prueba")) {
  await alert("Wallet Tracker: prueba", "Si lees esto, este canal funciona.");
  console.log(`Canales: consola sí · macOS ${MAC ? "sí" : "no"} · Telegram ${TG ? "sí" : "no (faltan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env)"}`);
  process.exit(0);
}
if (!KEY) { console.error("Falta VITE_HELIUS_API_KEY en .env"); process.exit(1); }

// Which backup: the path given, or the newest "wallet-tracker-respaldo-*.json" in ~/Downloads
function findBackup() {
  const given = args.find((a) => !a.startsWith("--"));
  if (given) return path.resolve(given);
  const dir = path.join(os.homedir(), "Downloads");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^wallet-tracker-respaldo.*\.json$/.test(f)) : [];
  if (!files.length) return null;
  return path.join(dir, files.map((f) => [f, fs.statSync(path.join(dir, f)).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0]);
}
const FILE = findBackup();
if (!FILE || !fs.existsSync(FILE)) {
  console.error("No encontré un respaldo. Expórtalo desde la app (Seguir → Exportar respaldo) o pasa la ruta: npm run watch -- ruta/respaldo.json");
  process.exit(1);
}

let people = [];
let watched = new Map();           // wallet → { person, core }
const extra = new Map();           // wallets that just received money: watched for 6 h
const seen = new Set();            // signature + wallet already handled
const told = new Set();            // alerts already sent
let meta = followMetaCache({}, KEY);
const detector = followDetector();
const sym = (mint) => meta.known[mint]?.symbol || shortAddr(mint, 4, 4);
const money = (t) => (t.sol ? `${t.sol.toFixed(2)} SOL` : `${Math.round(t.usd)} USD`);

function load() {
  let backup;
  try { backup = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) { log(`No pude leer el respaldo (${e.message}); sigo con lo anterior.`); return; }
  if (backup?.app !== "wallet-tracker") { log("Ese archivo no es un respaldo de Wallet Tracker; sigo con lo anterior."); return; }
  people = backup.data?.follow_people || [];
  meta = followMetaCache({ ...(backup.data?.follow_tokens || {}), ...meta.known }, KEY);
  watched = new Map();
  for (const p of people) {
    for (const w of [p.root, ...(p.aliases || [])]) if (!watched.has(w)) watched.set(w, { person: p, core: true });
    (p.graph?.nodes || [])
      .filter((n) => followScored(n) && n.buys != null && (n.role === "watch" || n.role === "trader" || (n.score || 0) >= 50))
      .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6)
      .forEach((n) => { if (!watched.has(n.addr)) watched.set(n.addr, { person: p, core: false }); });
  }
  sync();
  log(`Respaldo leído: ${people.length} persona${people.length === 1 ? "" : "s"}, ${watched.size} wallets vigiladas (${[...watched.values()].filter((w) => w.core).length} propias).`);
}

let live = null;
function sync() {
  const now = Date.now() / 1000;
  for (const [a, x] of extra) if (now - x.at > 6 * 3600) extra.delete(a);
  live?.setWallets([...new Set([...watched.keys(), ...extra.keys()])]);
}

async function onSig(wallet, sig) {
  const hit = watched.get(wallet) || extra.get(wallet);
  if (!hit || seen.has(sig + wallet)) return;
  seen.add(sig + wallet);
  const p = hit.person;
  let an;
  try {
    const tx = await followFetchBySig(sig, KEY);
    if (!tx) return;
    an = await followRead([tx], wallet, meta);
  } catch { return; }
  const own = wallet === p.root || (p.aliases || []).includes(wallet);
  for (const t of an.trades) {
    const key = `${t.sig}:${t.mint}`;
    if (told.has(key)) continue;
    told.add(key);
    const who = own ? p.name : `${shortAddr(wallet, 4, 4)} (red de ${p.name})`;
    const link = `https://gmgn.ai/sol/token/${t.mint}`;
    if (t.side === "sell") { await alert(`🔴 ${who} vendió ${sym(t.mint)}`, `${money(t)} con ${shortAddr(wallet, 4, 4)}`, { link, notify: flag("--ventas") }); continue; }
    await alert(`${own ? "🟢" : "🟡"} ${who} compró ${sym(t.mint)}`, `${money(t)} con ${shortAddr(wallet, 4, 4)}`, { link });
    if (!own) continue;
    const c = detector.push({ name: p.name, wallet, mint: t.mint, ts: t.ts, sol: t.sol, usd: t.usd, sig: t.sig });
    if (c) await alert(`🎯 ${c.people.length} personas compraron ${sym(c.mint)}`, `${c.people.map((x) => x.name).join(", ")} en ${followDur(Math.max(1, c.spanSec))}`, { link });
  }
  if (!hit.core) return;
  for (const f of an.flows.values()) {
    for (const e of f.ev) {
      if (e.dir !== "out" || e.sol < FOLLOW_EDGE_SOL || told.has(`move:${f.addr}:${e.ts}`)) continue;
      told.add(`move:${f.addr}:${e.ts}`);
      // Watch the receiver right away: its first buy arrives live too
      if (!watched.has(f.addr)) { extra.set(f.addr, { person: p, core: false, at: Date.now() / 1000 }); sync(); }
      await alert(`💸 ${p.name} movió ${e.sol.toFixed(2)} SOL`, `de ${shortAddr(wallet, 4, 4)} a ${shortAddr(f.addr, 4, 4)} · queda vigilada 6 h`, { link: `https://solscan.io/account/${f.addr}` });
    }
  }
}

load();
if (!people.length) { console.error("El respaldo no tiene a nadie. Sigue a alguien en la app y vuelve a exportarlo."); process.exit(1); }
let wasUp = false;
live = followRealtime(KEY, onSig, ({ connected, wallets }) => {
  if (connected && !wasUp) log(`Tiempo real conectado · ${wallets} wallets suscritas.`);
  if (!connected && wasUp) log("Tiempo real desconectado; reconectando…");
  wasUp = connected;
});
sync();
fs.watchFile(FILE, { interval: 5000 }, () => { log("El respaldo cambió: lo releo."); load(); });
log(`Vigilando con ${path.basename(FILE)} · macOS ${MAC ? "sí" : "no"} · Telegram ${TG ? "sí" : "no"} · Ctrl+C para parar`);
process.on("SIGINT", () => { live.close(); fs.unwatchFile(FILE); log("Parado."); process.exit(0); });
