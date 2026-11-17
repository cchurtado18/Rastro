// Seguir · view model: roles, formatting, plain-language insights and map layout. Pure functions.
import {
  shortAddr, FOLLOW_DAY, followDur, followMove,
} from "./engine.js";

// ─── Follow · helpers ─────────────────────────────────────────────────────────

export const FOLLOW_ROLES = {
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
  person:      { label: "Otra persona",      color: "oklch(0.76 0.08 250)", desc: "Wallet de otra persona que también sigues: nunca se mezcla con esta." },
  other:       { label: "Destino",           color: "var(--text-3)",        desc: "Recibió SOL, sin más señales." },
};
export const FOLLOW_STORE = "follow_people";

export const followNow = () => Math.floor(Date.now() / 1000);
export const followClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function followLoad() {
  try { const v = JSON.parse(localStorage.getItem(FOLLOW_STORE) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function followSave(people) {
  try { localStorage.setItem(FOLLOW_STORE, JSON.stringify(people)); } catch { /* storage full: keep working in memory */ }
}

// Everything lives in this browser's localStorage, so a backup is the only copy that survives
// clearing site data. The same file feeds the background watcher (watcher/watch.mjs).
const BACKUP_KEYS = [FOLLOW_STORE, "follow_tokens", "follow_labels", "kol_saved_wallets", "tracer_watched"];
export function followBackup() {
  const data = {};
  for (const k of BACKUP_KEYS) {
    try { const v = localStorage.getItem(k); if (v) data[k] = JSON.parse(v); } catch { /* skip a corrupt key */ }
  }
  return { app: "wallet-tracker", version: 1, exportedAt: new Date().toISOString(), data };
}
// Restoring never overwrites: people are added by root wallet, names and lists only where missing.
export function followRestore(backup) {
  if (backup?.app !== "wallet-tracker" || !backup.data) throw new Error("Ese archivo no es un respaldo de Wallet Tracker.");
  const d = backup.data;
  const people = followLoad();
  const have = new Set(people.map((p) => p.root));
  let added = 0;
  for (const p of Array.isArray(d[FOLLOW_STORE]) ? d[FOLLOW_STORE] : []) {
    if (!p?.root || have.has(p.root)) continue;
    people.push(p); have.add(p.root); added++;
  }
  followSave(people);
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; } };
  for (const k of ["follow_tokens", "follow_labels"]) {
    if (d[k] && typeof d[k] === "object") localStorage.setItem(k, JSON.stringify({ ...d[k], ...read(k, {}) }));
  }
  for (const k of ["kol_saved_wallets", "tracer_watched"]) {
    if (!Array.isArray(d[k])) continue;
    const cur = read(k, []);
    const seen = new Set(cur.map((w) => w.address));
    localStorage.setItem(k, JSON.stringify([...cur, ...d[k].filter((w) => w?.address && !seen.has(w.address))]));
  }
  return { people, added };
}

export function fmtSol(x) {
  if (!Number.isFinite(x)) return "0";
  const a = Math.abs(x);
  return a >= 1000 ? Math.round(x).toLocaleString("en-US") : a >= 100 ? x.toFixed(1) : x.toFixed(2);
}
export function fmtAmount(sol, usd) {
  if (sol > 0) return `${fmtSol(sol)} SOL`;
  if (usd > 0) return `${Math.round(usd).toLocaleString("en-US")} USD`;
  return "—";
}
export function fmtAgo(ts, now) { return ts ? `hace ${followDur(Math.max(1, now - ts))}` : "—"; }
export function fmtClock(ts) {
  const d = new Date(ts * 1000), t = new Date();
  const hm = d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: true });
  const day0 = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  if (d.getTime() >= day0) return `hoy ${hm}`;
  if (d.getTime() >= day0 - 86400000) return `ayer ${hm}`;
  return `${d.toLocaleDateString("es", { weekday: "short", day: "numeric" })} ${hm}`;
}
export function followVerdict(score) {
  return score >= 70 ? "muy probable" : score >= 50 ? "probable" : score >= 30 ? "posible" : "poco probable";
}
export function followHue(addr) {
  let h = 7;
  for (const c of addr || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// Second line under a wallet on the map. `compact` keeps it to the role alone
// (used for wallets with children, whose label sets the width of a whole column).
export function followTag(n, rootName, compact) {
  if (n.role === "root") return `Raíz${rootName ? ` · ${rootName}` : ""}`;
  const role = FOLLOW_ROLES[n.role] || FOLLOW_ROLES.other;
  if (n.role === "person") return n.owner || role.label;
  if (compact) return n.exName || (n.role === "deposit" ? "Depósito" : role.label);
  if (n.members) return `${n.members.length} exchanges${n.lost ? " · sin rastro" : ""}`;
  const parts = [n.exName || (n.viaHub && n.role === "trader" ? "Vía exchange" : n.role === "exchange" ? "Exchange" : role.label)];
  if (n.role === "exchange" && n.lost) parts.push("sin rastro");
  if (n.buys > 0) parts.push(`${n.buys} compra${n.buys > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
export const fmtPill = (sol, usd) => (sol > 0 ? fmtSol(sol) : usd > 0 ? `${Math.round(usd).toLocaleString("en-US")}` : "");

export function followWalletStats(trades, wallet, now) {
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

export function followTokenRows(trades, now, span) {
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
export function followInsights(person, graph, now) {
  const nodes = graph?.nodes || [];
  const own   = new Set([person.root, ...(person.aliases || [])]);
  const stats = followWalletStats(person.trades || [], null, now);
  const cands = nodes.filter((n) => n.score != null && !own.has(n.addr)).sort((a, b) => b.score - a.score);

  let status;
  const hot = [...own].filter((w) => followWalletStats(person.trades || [], w, now).b24 > 0);
  if (stats.b24 > 0) {
    const text = hot.length > 1 ? `comprando con ${hot.length} wallets` : hot[0] === person.root ? "sigue en su wallet raíz" : `ahora compra con ${shortAddr(hot[0], 4, 4)}`;
    status = { tone: "accent", chip: "activa", text };
  }
  else if (stats.last) status = { tone: "warn", chip: "en pausa", text: `sin compras desde ${fmtAgo(stats.last, now)}` };
  else status = { tone: "muted", chip: "inactiva", text: "sin compras en 7 días" };
  const move = followMove(person, nodes);
  if (move) status = { tone: "warn", chip: status.chip, text: `posible mudanza a ${shortAddr(move.addr, 4, 4)}` };

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
export function followCollapse(graph) {
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

export function followLayout(graph, mode, names, rootName) {
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

export function followEdgePath(e, a, b, mode, tree, pw) {
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
