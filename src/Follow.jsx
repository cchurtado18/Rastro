import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  shortAddr, FOLLOW_DAY, FOLLOW_EDGE_SOL, isSolAddress, followDur, followMove, followScored, followScan,
  followRefresh, followMetaCache, followRead, followFetchBySig, followRealtime, followConvergences, followDetector,
  followSearchMint, followMergeGraph, followPerformance, followFetchPrices,
} from "./engine.js";
import {
  FOLLOW_ROLES, followNow, followClamp, followLoad, followSave, fmtSol, fmtAmount, fmtAgo, fmtClock, followVerdict,
  followHue, fmtPill, followWalletStats, followTokenRows, followInsights, followCollapse, followLayout,
  followEdgePath, followBackup, followRestore,
} from "./follow-model.js";
import {
  IconTarget, IconPlus, IconClose, IconCheck, IconInfo, IconRefresh, IconStop, IconSearch, IconFollow, IconFit,
  IconMinus, Toggle, Brand,
} from "./ui.jsx";

// ─── Follow · map ─────────────────────────────────────────────────────────────


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
    const text = `${e.guess ? "≈ " : ""}${twoWay ? "⇄ " : ""}${fmtPill(e.sol, e.usd) || (e.tokens ? `${e.tokens} tok` : "")}`;
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

          {drawn.filter((d) => d.pill && (d.e.sol > 0 || d.e.usd > 0 || d.e.tokens > 0)).map((d) => {
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
                style={{ cursor: "pointer", opacity: dim ? 0.22 : n.kept ? 0.55 : 1, transition: "opacity 140ms ease" }}>
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

function FollowActivity({ person, insights, perf, now, range, setRange, tokenName, onSelect, onHuntToken }) {
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
  const flat = (x) => Math.abs(x) < 0.005;
  const signed = (x) => (flat(x) ? "0.00 SOL" : `${x > 0 ? "+" : "−"}${fmtSol(Math.abs(x))} SOL`);
  const tint = (x) => (flat(x) ? "var(--text-2)" : x > 0 ? "var(--accent-2)" : "var(--danger)");

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

        {perf && perf.closed + perf.open > 0 && (
          <div style={{ flex: "0 1 250px", minWidth: 220, padding: "12px 14px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--line)" }}>
            <div style={{ ...followCaps, marginBottom: 8 }}>Rendimiento · 7 días</div>
            {[
              ["Realizado", signed(perf.realized), tint(perf.realized)],
              ["Aún abierto", perf.priced ? signed(perf.unrealized) : "sin precio", perf.priced ? tint(perf.unrealized) : "var(--text-4)"],
              ["Aciertos", perf.closed ? `${perf.wins} de ${perf.closed} (${Math.round((perf.wins / perf.closed) * 100)} %)` : "—", "var(--text)"],
              ["Tiempo medio", perf.medianHold ? followDur(perf.medianHold) : "—", "var(--text)"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: "flex", alignItems: "baseline", padding: "3px 0", fontSize: 12 }}>
                <span style={{ color: "var(--text-3)" }}>{k}</span>
                <div style={{ flex: 1 }} />
                <span className="mono" style={{ color: c, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 6, lineHeight: 1.45 }}>
              Solo lo que compró y vendió en estos 7 días, en SOL. {perf.open > 0 && `${perf.open} ${perf.open === 1 ? "posición abierta" : "posiciones abiertas"}, ${perf.priced} con precio.`}
            </div>
          </div>
        )}

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

function FollowProfile({ person, graph, node, group, label, onLabel, now, tokenName, seenTs, onSelect, onAlias, onUnalias, onFollowNew, onTrace }) {
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
              {cur.exName || role.label}{isOwn ? ` · ${person.name}` : cur.owner ? ` · ${cur.owner}` : ""}
            </span>
            {cur.score != null && !isOwn && (
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{followVerdict(cur.score)} que sea suya</span>
            )}
          </div>
          <div className="mono" style={{ fontSize: 11.5, lineHeight: 1.6, wordBreak: "break-all", color: "var(--text)" }}>{cur.addr}</div>
          {!isOwn && (
            <input key={cur.addr} defaultValue={label || ""} placeholder="Ponle un nombre (ej. Coinbase, banco de Luffy)"
              onBlur={(e) => onLabel(cur.addr, e.target.value.trim())} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{ width: "100%", marginTop: 8, padding: "5px 8px", fontSize: 11.5, borderRadius: 6, background: "var(--bg)", border: "1px solid var(--line)", color: "var(--text)" }} />
          )}
          {cur.kept && (
            <div style={{ fontSize: 11, color: "var(--text-4)", marginTop: 8, lineHeight: 1.45 }}>
              Vista en un escaneo anterior ({fmtAgo(cur.seenAt, now)}). El último ya no llegó hasta aquí; se conserva 7 días.
            </div>
          )}

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
              {(cur.con || []).map((w, i) => (
                <div key={`c${i}`} style={{ display: "flex", gap: 7, fontSize: 11.5, lineHeight: 1.45, color: "var(--text-3)", padding: "2px 0" }}>
                  <IconClose size={10} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 4 }} /> <span>{w}</span>
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
              Aquí se pierde el rastro: no se buscaron retiros parecidos porque el depósito tiene más de 72 h, es menor a 1 SOL, o ya se revisó otro exchange en este escaneo.
            </div>
          )}
          {cur.role === "exchange" && !cur.lost && cur.searched != null && (
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 12, lineHeight: 1.5 }}>
              Se revisaron {cur.searched} retiros de este exchange en las 6 h siguientes al depósito, buscando uno del 90–101 % del monto hacia una wallet nueva.
            </div>
          )}
          {cur.role === "person" && (
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 12, lineHeight: 1.5 }}>
              Es una wallet de <b style={{ fontWeight: 600, color: "var(--text)" }}>{cur.owner}</b>, a quien también sigues: no se le asigna a esta persona.
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

          {cur.addr !== person.root && cur.role !== "exchange" && cur.role !== "deposit" && cur.role !== "person" && (
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

// ─── Follow · live feed and CA search ─────────────────────────────────────────

// One live event as a title + detail (used by the "En vivo" list and by browser notifications)
function followEventText(e, sym) {
  const w = (a) => shortAddr(a, 4, 4);
  if (e.type === "buy" || e.type === "sell") {
    return {
      title: `${e.name} ${e.type === "buy" ? "compró" : "vendió"} ${sym(e.trade.mint)}`,
      body: `${fmtAmount(e.trade.sol, e.trade.usd)} con ${w(e.wallet)}${e.own ? "" : " · wallet de su red, sin confirmar"}`,
    };
  }
  if (e.type === "move") return { title: `${e.name} movió ${fmtSol(e.sol)} SOL`, body: `de ${w(e.wallet)} a ${w(e.addr)} · esa wallet queda vigilada 6 h` };
  if (e.type === "woke") return { title: `${w(e.addr)} empezó a comprar`, body: `recibió SOL de ${e.name} y ya compra` };
  if (e.type === "switch") return { title: `Posible mudanza de ${e.name}`, body: `${w(e.addr)} recibió su SOL y compra más reciente que sus wallets` };
  if (e.type === "convergence") return { title: `${e.people.length} personas compraron ${sym(e.mint)}`, body: `${e.people.map((p) => p.name).join(", ")} en ${followDur(Math.max(1, e.spanSec))}` };
  return { title: e.type, body: "" };
}

function FollowLive({ events, convergences, rt, auto, notify, onNotify, now, tokenName, onOpen, onHuntToken, onClear }) {
  const tone  = { buy: "var(--accent-2)", sell: "var(--danger)", move: "var(--warn)", woke: "var(--accent-2)", switch: "var(--warn)", convergence: "var(--info)" };
  const label = { buy: "COMPRA", sell: "VENTA", move: "ENVÍO", woke: "DESPERTÓ", switch: "MUDANZA", convergence: "COINCIDEN" };
  return (
    <>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: rt.connected ? "var(--accent)" : "var(--text-4)", animation: rt.connected ? "pulse-dot 1.6s ease-in-out infinite" : "none" }} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text-2)", lineHeight: 1.4 }}>
          {!auto ? "Tiempo real apagado" : rt.connected ? `Tiempo real · ${rt.wallets} wallet${rt.wallets === 1 ? "" : "s"}` : "Conectando tiempo real…"}
          <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>una compra o un envío llega en 1–2 s</div>
        </div>
        <button onClick={onNotify} title="Avisos del navegador mientras esta pestaña esté abierta"
          style={{ ...followBtn, padding: "4px 9px", fontSize: 11, color: notify ? "var(--accent-2)" : "var(--text-2)", border: `1px solid ${notify ? "color-mix(in oklch, var(--accent) 45%, transparent)" : "var(--line)"}` }}>
          {notify ? "Avisos activos" : "Activar avisos"}
        </button>
      </div>

      {convergences.length > 0 && (
        <div style={{ padding: "14px 18px 6px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ ...followCaps, marginBottom: 8 }}>Coincidencias · 24 h</div>
          {convergences.slice(0, 5).map((c) => (
            <div key={c.mint} style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 9, background: "var(--bg-2)", border: "1px solid color-mix(in oklch, var(--info) 32%, var(--line))" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a href={`https://gmgn.ai/sol/token/${c.mint}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, textDecoration: "none" }}>{tokenName(c.mint)}</a>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{c.people.length} personas en {followDur(Math.max(1, c.spanSec))}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => onHuntToken(c.mint)} title="Cazar quién más compró temprano esta moneda" style={{ ...followBtn, padding: "3px 8px", fontSize: 11 }}><IconTarget size={11} /> Cazar</button>
              </div>
              {c.people.map((p) => (
                <div key={p.name} style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--text-2)", marginTop: 4, alignItems: "baseline" }}>
                  <span style={{ fontWeight: 500, color: "var(--text)" }}>{p.name}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--text-4)" }}>{shortAddr(p.wallet, 4, 4)}</span>
                  <div style={{ flex: 1 }} />
                  <span className="mono">{fmtAmount(p.sol, p.usd)}</span>
                  <span style={{ color: "var(--text-3)" }}>{fmtClock(p.ts)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", padding: "14px 18px 6px" }}>
        <span style={followCaps}>Actividad de todos</span>
        <div style={{ flex: 1 }} />
        {events.length > 0 && <button onClick={onClear} style={{ fontSize: 11, color: "var(--text-3)" }}>Limpiar</button>}
      </div>
      {events.length === 0 && (
        <div style={{ padding: "6px 18px 20px", fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>
          Compras, envíos de SOL, mudanzas de wallet y coincidencias de la gente que sigues aparecen aquí al instante.
        </div>
      )}
      {events.slice(0, 120).map((e) => {
        const text = followEventText(e, tokenName);
        return (
          <button key={e.key} onClick={() => onOpen(e)} style={{ display: "flex", gap: 9, width: "100%", textAlign: "left", padding: "9px 18px", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
            <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.05em", width: 66, flexShrink: 0, paddingTop: 2, color: tone[e.type] }}>{label[e.type]}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 500, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text.title}</span>
              <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>{text.body}</span>
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-4)", flexShrink: 0, paddingTop: 2 }}>{followDur(Math.max(1, now - e.at))}</span>
          </button>
        );
      })}
    </>
  );
}

function FollowCA({ ca, recent, now, tokenName, onSearch, onOpen, onHuntToken }) {
  const r = ca?.result;
  const err = ca?.error || r?.error;
  return (
    <>
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ ...followCaps, marginBottom: 6 }}>Buscar por CA</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>
          ¿Quién de la gente que sigues, o de las wallets de su red, compró una moneda? Pega el CA en el buscador de la izquierda.
        </div>
        {recent.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {recent.map((m) => <button key={m} onClick={() => onSearch(m)} style={{ ...followBtn, padding: "3px 8px", fontSize: 11 }}>{tokenName(m)}</button>)}
          </div>
        )}
      </div>

      {ca?.busy && (
        <div style={{ padding: "16px 18px", fontSize: 12.5, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse-dot 1.1s ease-in-out infinite" }} />
          Buscando en las wallets de todos… {ca.done}/{ca.total}
        </div>
      )}
      {err && <div style={{ padding: "16px 18px", fontSize: 12.5, color: "var(--warn)", lineHeight: 1.5 }}>{err}</div>}

      {r && !r.error && (
        <>
          <div style={{ padding: "14px 18px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href={`https://gmgn.ai/sol/token/${r.mint}`} target="_blank" rel="noreferrer" style={{ fontSize: 15, fontWeight: 600, textDecoration: "none" }}>{tokenName(r.mint)}</a>
              <div style={{ flex: 1 }} />
              <button onClick={() => onHuntToken(r.mint)} title="Cazar quién más compró temprano esta moneda" style={{ ...followBtn, padding: "3px 8px", fontSize: 11 }}><IconTarget size={11} /> Cazar</button>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--text-4)", wordBreak: "break-all", marginTop: 4 }}>{r.mint}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8, lineHeight: 1.5 }}>
              {r.hits.length
                ? `${r.hits.length} de ${r.searched} wallets la movieron.`
                : `Nadie la tocó: se revisaron ${r.searched} wallets (las de cada persona y las de su red).`}
            </div>
          </div>
          {r.hits.map((h) => {
            const left = h.bought > 0 ? Math.max(0, 1 - h.sold / h.bought) : 0;
            const net = h.solOut - h.solIn;
            const role = FOLLOW_ROLES[h.role] || FOLLOW_ROLES.other;
            return (
              <button key={h.address} onClick={() => onOpen({ pid: h.pid, addr: h.address })} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 18px", borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{h.name}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>{shortAddr(h.address, 4, 4)}</span>
                  {h.role !== "root" && <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: role.color }}>{role.label}</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: left > 0.02 ? "var(--accent-2)" : "var(--text-4)" }}>{left > 0.02 ? `aún tiene ~${Math.round(left * 100)}%` : "ya no tiene"}</span>
                </div>
                <div className="mono" style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4 }}>
                  {h.partial ? "≥ " : ""}{h.buys} compra{h.buys === 1 ? "" : "s"} · {fmtAmount(h.solIn, h.usdIn)}
                  {h.sells > 0 && ` · ${h.sells} venta${h.sells === 1 ? "" : "s"} · ${fmtAmount(h.solOut, h.usdOut)}`}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                  primera {fmtClock(h.firstTs)} · última {fmtAgo(h.lastTs, now)}
                  {h.sells > 0 && h.solIn > 0 && <span style={{ color: net >= 0 ? "var(--accent-2)" : "var(--danger)" }}> · neto {net >= 0 ? "+" : "−"}{fmtSol(Math.abs(net))} SOL</span>}
                </div>
              </button>
            );
          })}
        </>
      )}
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

export function ViewSwitch({ view, setView }) {
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

export function FollowView({ active, apiKey, seed, viewSwitch, onTrace, onHuntToken }) {
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
  const [tab, setTab]       = useState("perfil");   // right panel: "perfil" | "vivo" | "ca"
  const [events, setEvents] = useState(() => { try { return JSON.parse(localStorage.getItem("follow_events") || "[]"); } catch { return []; } });
  const [unseen, setUnseen] = useState(0);          // live events since "En vivo" was last open
  const [rt, setRt]         = useState({ connected: false, wallets: 0 });
  const [notify, setNotify] = useState(() => localStorage.getItem("follow_notify") === "1");
  const [ca, setCa]         = useState(null);       // CA search: { busy, mint, done, total } | { result } | { error }
  const [caQuery, setCaQuery] = useState("");
  const [caRecent, setCaRecent] = useState(() => { try { return JSON.parse(localStorage.getItem("follow_ca_recent") || "[]"); } catch { return []; } });
  const [extraTick, setExtraTick] = useState(0);
  const [labels, setLabels] = useState(() => { try { return JSON.parse(localStorage.getItem("follow_labels") || "{}"); } catch { return {}; } });
  const [prices, setPrices] = useState({});         // mint → SOL per token, for open positions
  const [backupMsg, setBackupMsg] = useState("");

  const peopleRef = useRef(people);
  const tokensRef = useRef(tokens);
  const opRef     = useRef(null);                   // the running scan / check: { ctrl, kind }
  const metaRef   = useRef(null);                   // followMetaCache: token names + imitation rules
  const pushRef   = useRef(null);
  const onSigRef  = useRef(null);
  const rtRef     = useRef(null);
  const detectorRef = useRef(null);
  const notifyRef = useRef(notify);
  const watchedRef = useRef(new Map());             // wallet → { pid, core } subscribed in real time
  const extraRef  = useRef(new Map());              // wallets that just received money: watched for 6 h
  const eventKeys = useRef(new Set());
  const sigsRef   = useRef(new Set());
  const rateRef   = useRef(new Map());
  const caAbort   = useRef(null);
  const scanTried = useRef(new Set());              // people a scan was started for in this session
  useEffect(() => { notifyRef.current = notify; localStorage.setItem("follow_notify", notify ? "1" : "0"); }, [notify]);
  useEffect(() => { peopleRef.current = people; followSave(people); }, [people]);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { localStorage.setItem("follow_auto", auto ? "1" : "0"); }, [auto]);
  useEffect(() => { const t = setInterval(() => setNow(followNow()), 30000); return () => clearInterval(t); }, []);

  const person = people.find((p) => p.id === selId) || people[0] || null;
  const graph  = busy && person && busy.id === person.id && busy.graph ? busy.graph : person?.graph || null;

  const updatePerson = useCallback((id, fn) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }, []);

  // One token cache for every scan, check and live update (it also decides what is an imitation)
  const metaOf = useCallback(() => {
    if (!metaRef.current) metaRef.current = followMetaCache(tokensRef.current, apiKey);
    return metaRef.current;
  }, [apiKey]);
  const syncTokens = useCallback(() => {
    if (!metaRef.current) return;
    const next = Object.fromEntries(Object.entries(metaRef.current.known).slice(-1200));
    try { localStorage.setItem("follow_tokens", JSON.stringify(next)); } catch { /* cache only */ }
    setTokens(next);
  }, []);

  // Live events: buys, sells, transfers, moves and convergences of everyone, newest first.
  // `key` makes each one unique, so the websocket and the periodic check never report it twice.
  const pushEvent = useCallback((ev) => {
    const key = ev.key || `${ev.type}:${ev.addr || ""}:${ev.at || ""}`;
    if (eventKeys.current.has(key)) return;
    eventKeys.current.add(key);
    const at = followNow();
    const e = { at, ...ev, key };
    setEvents((prev) => {
      const next = [e, ...prev].sort((a, b) => b.at - a.at).slice(0, 300);
      try { localStorage.setItem("follow_events", JSON.stringify(next)); } catch { /* log only */ }
      return next;
    });
    if (at - e.at < 600) {
      setUnseen((n) => n + 1);
      if (notifyRef.current && e.type !== "sell" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const text = followEventText(e, (m) => metaRef.current?.known[m]?.symbol || shortAddr(m, 4, 4));
        try { new Notification(text.title, { body: text.body, tag: key }); } catch { /* notifications are optional */ }
      }
    }
    // Every buy by someone you follow goes through the convergence detector
    if (e.type === "buy" && e.own && e.trade) {
      const c = detectorRef.current?.push({ name: e.name, wallet: e.wallet, mint: e.trade.mint, ts: e.trade.ts, sol: e.trade.sol, usd: e.trade.usd, sig: e.trade.sig });
      if (c) pushRef.current?.({ type: "convergence", key: `conv:${c.mint}:${c.people.length}`, at: c.lastTs, mint: c.mint, people: c.people, spanSec: c.spanSec });
    }
  }, []);
  useEffect(() => { pushRef.current = pushEvent; }, [pushEvent]);
  useEffect(() => {
    for (const e of events) eventKeys.current.add(e.key);
    const since = followNow() - FOLLOW_DAY;
    const d = followDetector();
    d.seed(peopleRef.current.flatMap((p) => (p.trades || []).filter((t) => t.side === "buy" && t.ts >= since)
      .map((t) => ({ name: p.name, wallet: t.wallet, mint: t.mint, ts: t.ts, sol: t.sol, usd: t.usd, sig: t.sig }))));
    detectorRef.current = d;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScan = useCallback(async (p) => {
    if (!apiKey) { setError("API key no configurada — agrega VITE_HELIUS_API_KEY en .env"); return; }
    opRef.current?.ctrl.abort();
    const ctrl = new AbortController();
    opRef.current = { ctrl, kind: "scan" };
    scanTried.current.add(p.id);
    setError("");
    setBusy({ id: p.id, kind: "scan", label: "Empezando…", graph: null });
    try {
      const others = new Map();
      for (const q of peopleRef.current) if (q.id !== p.id) for (const w of [q.root, ...(q.aliases || [])]) others.set(w, q.name);
      const res = await followScan(p, apiKey, ctrl.signal, (ev) => {
        if (!ctrl.signal.aborted) setBusy({ id: p.id, kind: "scan", label: ev.label, graph: ev.graph });
      }, { meta: metaOf(), others });
      const move = followMove({ ...p, trades: res.trades }, res.nodes);
      updatePerson(p.id, (old) => ({
        ...old, graph: followMergeGraph(old.graph, { nodes: res.nodes, edges: res.edges }, res.scannedAt), trades: res.trades,
        scannedAt: res.scannedAt, checkedAt: res.scannedAt,
        alerts: [...(old.alerts || []).filter((a) => a.kind === "woke"), ...(move ? [{ kind: "switch", ts: move.recvTs, addr: move.addr, buys: move.buys }] : [])],
      }));
      if (move) pushEvent({ type: "switch", key: `switch:${move.addr}:${move.recvTs}`, pid: p.id, name: p.name, addr: move.addr, buys: move.buys });
      syncTokens();
    } catch (e) { setError(followErrorText(e)); }
    finally {
      if (opRef.current?.ctrl === ctrl) { opRef.current = null; setBusy(null); }
    }
  }, [apiKey, updatePerson, metaOf, syncTokens, pushEvent]);

  const runCheck = useCallback(async (p, signal) => {
    const r = await followRefresh(p, apiKey, signal, { meta: metaOf() });
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
    // What happened since the last check also goes to the live feed (only if there was a previous check)
    if (p.checkedAt) {
      for (const t of r.fresh.slice(0, 40).reverse()) pushEvent({ type: t.side, key: `t:${t.sig}:${t.mint}`, pid: p.id, name: p.name, wallet: t.wallet, own: true, trade: t, at: t.ts });
    }
    for (const a of r.alerts) {
      if (a.kind === "outflow") pushEvent({ type: "move", key: `move:${a.addr}:${a.ts}`, pid: p.id, name: p.name, wallet: a.from, addr: a.addr, sol: a.sol, at: a.ts });
      else pushEvent({ type: a.kind, key: `${a.kind}:${a.addr}:${a.kind === "switch" ? a.ts : ""}`, pid: p.id, name: p.name, addr: a.addr, buys: a.buys });
    }
    syncTokens();
  }, [apiKey, updatePerson, metaOf, syncTokens, pushEvent]);

  // ── Real time (from Rastro): every watched wallet is subscribed over the Helius websocket ──
  // Watched: each person's own wallets, plus the wallets of their network that could become theirs.
  const watched = useMemo(() => {
    const m = new Map();
    for (const p of people) {
      for (const w of [p.root, ...(p.aliases || [])]) if (!m.has(w)) m.set(w, { pid: p.id, core: true });
      (p.graph?.nodes || [])
        .filter((n) => followScored(n) && n.buys != null && (n.role === "watch" || n.role === "trader" || (n.score || 0) >= 50))
        .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6)
        .forEach((n) => { if (!m.has(n.addr)) m.set(n.addr, { pid: p.id, core: false }); });
    }
    return m;
  }, [people]);
  const watchKey = [...watched.keys()].sort().join(",");
  useEffect(() => { watchedRef.current = watched; }, [watched]);

  useEffect(() => {
    if (!auto || !apiKey) return;
    const live = followRealtime(apiKey, (wallet, sig) => onSigRef.current?.(wallet, sig), setRt);
    rtRef.current = live;
    return () => { live.close(); rtRef.current = null; };
  }, [auto, apiKey]);
  useEffect(() => {
    const t = followNow();
    for (const [a, x] of extraRef.current) if (t - x.at > 6 * 3600) extraRef.current.delete(a);
    rtRef.current?.setWallets([...new Set([...watchKey.split(",").filter(Boolean), ...extraRef.current.keys()])]);
  }, [watchKey, extraTick, auto, apiKey]);

  // A watched wallet signed or received something: read that one transaction
  const onSig = async (wallet, sig) => {
    const hit = watchedRef.current.get(wallet) || extraRef.current.get(wallet);
    if (!hit || sigsRef.current.has(sig + wallet)) return;
    sigsRef.current.add(sig + wallet);
    if (sigsRef.current.size > 4000) sigsRef.current = new Set([...sigsRef.current].slice(-2000));
    if (!hit.core) {
      // A wallet watched in passing that moves like a bot is dropped
      const t = Date.now(), hits = (rateRef.current.get(wallet) || []).filter((x) => t - x < 60000);
      hits.push(t); rateRef.current.set(wallet, hits);
      if (hits.length > 20) { extraRef.current.delete(wallet); setExtraTick((n) => n + 1); return; }
    }
    const p = peopleRef.current.find((x) => x.id === hit.pid);
    if (!p) return;
    let an;
    try {
      const tx = await followFetchBySig(sig, apiKey);
      if (!tx) return;
      an = await followRead([tx], wallet, metaOf());
    } catch { return; }
    const own = wallet === p.root || (p.aliases || []).includes(wallet);
    const have = new Set((p.trades || []).map((t) => t.sig + t.mint));
    const fresh = an.trades.filter((t) => !have.has(t.sig + t.mint));
    if (fresh.length) {
      const buys = fresh.filter((t) => t.side === "buy");
      const node = p.graph?.nodes.find((n) => n.addr === wallet);
      updatePerson(p.id, (old) => (own
        ? { ...old, trades: [...fresh.map((t) => ({ ...t, wallet })), ...(old.trades || [])].slice(0, 400) }
        : { ...old, graph: old.graph && { ...old.graph, nodes: old.graph.nodes.map((n) => (n.addr !== wallet ? n : {
            ...n, buys: (n.buys || 0) + buys.length, sells: (n.sells || 0) + fresh.length - buys.length,
            lastBuyTs: buys.length ? Math.max(n.lastBuyTs || 0, ...buys.map((t) => t.ts)) : n.lastBuyTs,
            firstBuyTs: n.firstBuyTs || buys[0]?.ts || 0, role: n.role === "watch" && buys.length ? "trader" : n.role,
            trades: [...fresh, ...(n.trades || [])].slice(0, 12),
          })) } }));
      if (!own && buys.length && !(node?.buys > 0)) pushEvent({ type: "woke", key: `woke:${wallet}:`, pid: p.id, name: p.name, addr: wallet, buys: buys.length });
      for (const t of fresh) pushEvent({ type: t.side, key: `t:${t.sig}:${t.mint}`, pid: p.id, name: p.name, wallet, own, trade: t, at: t.ts });
      syncTokens();
    }
    if (!hit.core) return;
    for (const f of an.flows.values()) {
      for (const e of f.ev) {
        if (e.dir !== "out" || e.sol < FOLLOW_EDGE_SOL) continue;
        // Start watching the receiver right away: its first buy will arrive live too
        if (!watchedRef.current.has(f.addr)) { extraRef.current.set(f.addr, { pid: p.id, core: false, at: followNow() }); setExtraTick((n) => n + 1); }
        pushEvent({ type: "move", key: `move:${f.addr}:${e.ts}`, pid: p.id, name: p.name, wallet, addr: f.addr, sol: e.sol, at: e.ts });
      }
    }
  };
  useEffect(() => { onSigRef.current = onSig; });

  // Someone stored without a map (the page was closed or reloaded mid-scan, or they came from a
  // backup) is scanned when opened. Only once per session, so pressing "Detener" stays stopped.
  const openId = people.find((p) => p.id === selId)?.id || people[0]?.id || null;
  const openHasMap = !!(people.find((p) => p.id === openId)?.graph);
  const idle = !busy;
  useEffect(() => {
    if (!active || !apiKey || !openId || openHasMap || !idle) return;
    const t = setTimeout(() => {
      const p = peopleRef.current.find((x) => x.id === openId);
      if (p && !p.graph && !scanTried.current.has(p.id) && !opRef.current) runScan(p);
    }, 500);
    return () => clearTimeout(t);
  }, [active, apiKey, openId, openHasMap, idle, runScan]);

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

  // Search box: a wallet that is in someone's network jumps to it; anything else is searched as a CA
  const runSearch = async (raw) => {
    const q = (raw || "").trim();
    if (!q) return;
    if (!isSolAddress(q)) { setCa({ error: "Eso no parece un CA. Pega la dirección completa de la moneda." }); setTab("ca"); return; }
    for (const p of peopleRef.current) {
      const own = p.root === q || (p.aliases || []).includes(q);
      if (own || p.graph?.nodes.some((n) => n.addr === q)) { select(p.id); setNodeSel(p.root === q ? null : q); setTab("perfil"); return; }
    }
    const wallets = [], seen = new Set();
    const add = (address, p, role) => { if (!seen.has(address)) { seen.add(address); wallets.push({ address, pid: p.id, name: p.name, role }); } };
    for (const p of peopleRef.current) { add(p.root, p, "root"); (p.aliases || []).forEach((a) => add(a, p, "alias")); }
    for (const p of peopleRef.current) for (const n of p.graph?.nodes || []) if (followScored(n) && n.side !== "in") add(n.addr, p, n.role);
    caAbort.current?.abort();
    const ctrl = new AbortController();
    caAbort.current = ctrl;
    setTab("ca");
    setCa({ busy: true, mint: q, done: 0, total: Math.min(60, wallets.length) });
    try {
      const result = await followSearchMint(q, wallets.slice(0, 60), apiKey, ctrl.signal, metaOf(), (done, total) => setCa((c) => (c?.busy && c.mint === q ? { ...c, done, total } : c)));
      setCa({ result, mint: q });
      syncTokens();
      if (!result.error) setCaRecent((prev) => { const next = [q, ...prev.filter((m) => m !== q)].slice(0, 6); localStorage.setItem("follow_ca_recent", JSON.stringify(next)); return next; });
    } catch (e) { if (e.name !== "AbortError") setCa({ error: followErrorText(e), mint: q }); }
  };
  const pick = (addr) => { setNodeSel(addr); setTab("perfil"); };
  const openTab = (k) => { setTab(k); if (k === "vivo") setUnseen(0); };
  const openEvent = (e) => {
    if (!e.pid || !peopleRef.current.some((p) => p.id === e.pid)) return;
    select(e.pid);
    setNodeSel(e.type === "buy" || e.type === "sell" ? (e.own ? null : e.wallet) : e.addr || null);
    setTab("perfil");
  };
  const toggleNotify = () => {
    if (notify) { setNotify(false); return; }
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") setNotify(true);
    else Notification.requestPermission().then((perm) => setNotify(perm === "granted"));
  };
  const convergences = useMemo(() => {
    const since = now - FOLLOW_DAY;
    return followConvergences(people.flatMap((p) => (p.trades || []).filter((t) => t.side === "buy" && t.ts >= since)
      .map((t) => ({ name: p.name, wallet: t.wallet, mint: t.mint, ts: t.ts, sol: t.sol, usd: t.usd, sig: t.sig }))));
  }, [people, now]);

  const names = useMemo(() => {
    const m = new Map();
    for (const p of people) {
      if (p.id === person?.id) continue;
      m.set(p.root, p.name);
      for (const a of p.aliases || []) m.set(a, p.name);
    }
    for (const [addr, name] of Object.entries(labels)) if (name) m.set(addr, name);
    return m;
  }, [people, person?.id, labels]);
  const setLabel = (addr, name) => setLabels((prev) => {
    if ((prev[addr] || "") === name) return prev;
    const next = { ...prev };
    if (name) next[addr] = name.slice(0, 28); else delete next[addr];
    localStorage.setItem("follow_labels", JSON.stringify(next));
    return next;
  });

  // Performance: realised from the trades on record; open positions need a current price
  const openMints = useMemo(() => followPerformance(person?.trades || []).rows.filter((r) => !r.closed)
    .sort((a, b) => b.spent - a.spent).slice(0, 30).map((r) => r.mint).join(","), [person?.trades]);
  useEffect(() => {
    if (!active || !openMints) return;
    const ctrl = new AbortController();
    followFetchPrices(openMints.split(","), ctrl.signal).then((p) => setPrices((prev) => ({ ...prev, ...p }))).catch(() => {});
    return () => ctrl.abort();
  }, [active, openMints]);
  const perf = useMemo(() => (person ? followPerformance(person.trades || [], prices) : null), [person, prices]);

  // Backup: one JSON file with everyone you follow, their maps, your names, and Cazar's saved lists
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(followBackup())], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `wallet-tracker-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
    setBackupMsg("Respaldo descargado.");
  };
  const importBackup = async (file) => {
    if (!file) return;
    try {
      const r = followRestore(JSON.parse(await file.text()));
      peopleRef.current = r.people;
      setPeople(r.people);
      setLabels(JSON.parse(localStorage.getItem("follow_labels") || "{}"));
      setBackupMsg(`Importado: ${r.added} persona${r.added === 1 ? "" : "s"} nueva${r.added === 1 ? "" : "s"}. Recarga para ver también las listas de Cazar.`);
    } catch (e) { setBackupMsg(e instanceof SyntaxError ? "Ese archivo no es un JSON válido." : e.message); }
  };
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
        <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
          <Brand />
          {viewSwitch}
        </div>

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

        <form onSubmit={(e) => { e.preventDefault(); runSearch(caQuery); }} style={{ padding: "14px 16px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ ...followCaps, marginBottom: 8 }}>Buscar CA o wallet</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={caQuery} onChange={(e) => setCaQuery(e.target.value)} placeholder="¿Quién compró este CA?" spellCheck={false}
              className="mono" style={{ ...inputStyle, fontSize: 11.5, padding: "8px 10px", minWidth: 0 }} />
            <button type="submit" title="Buscar entre la gente que sigues" style={{ ...followBtn, padding: "0 10px", flexShrink: 0 }}><IconSearch size={12} /></button>
          </div>
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
            Tiempo real y revisión cada 3 min
            <div style={{ fontSize: 10.5, color: "var(--text-4)" }}>{!auto ? "apagado" : rt.connected ? `en vivo · ${rt.wallets} wallet${rt.wallets === 1 ? "" : "s"}` : "conectando…"}</div>
          </div>
        </div>
        <div style={{ padding: "0 16px 12px", fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
          <button onClick={exportBackup} title="Descarga un archivo con todo: a quién sigues, sus mapas, tus nombres y las listas de Cazar"
            style={{ color: "var(--text-2)", textDecoration: "underline", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3 }}>Exportar respaldo</button>
          {" · "}
          <label style={{ color: "var(--text-2)", textDecoration: "underline", textDecorationColor: "var(--line-2)", textUnderlineOffset: 3, cursor: "pointer" }}>
            Importar
            <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {backupMsg && <div style={{ color: "var(--text-3)", marginTop: 3 }}>{backupMsg}</div>}
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
                      {a.kind === "woke" && <><b className="mono" style={{ fontWeight: 500, color: "var(--text)" }}>{shortAddr(a.addr, 4, 4)}</b> empezó a comprar ({a.buys} compra{a.buys > 1 ? "s" : ""}) {fmtAgo(a.ts, now)}.</>}
                      {a.kind === "switch" && <>Posible mudanza: <b className="mono" style={{ fontWeight: 500, color: "var(--text)" }}>{shortAddr(a.addr, 4, 4)}</b> recibió su SOL, compró después ({a.buys} compra{a.buys > 1 ? "s" : ""}) y su última compra es más reciente que la de sus wallets.</>}
                      {a.kind === "outflow" && <>Sacó <b style={{ fontWeight: 600, color: "var(--text)" }}>{fmtSol(a.sol)} SOL</b> hacia <b className="mono" style={{ fontWeight: 500, color: "var(--text)" }}>{shortAddr(a.addr, 4, 4)}</b> {fmtAgo(a.ts, now)}, y esa wallet aún no está en el mapa.</>}
                    </span>
                    {a.kind === "outflow"
                      ? <button onClick={() => runScan(person)} style={{ ...followBtn, padding: "3px 9px" }}>Re-escanear</button>
                      : <button onClick={() => pick(a.addr)} style={{ ...followBtn, padding: "3px 9px" }}>Ver</button>}
                    {a.kind === "switch" && <button onClick={() => { setAlias(a.addr, true); updatePerson(person.id, (o) => ({ ...o, alerts: (o.alerts || []).filter((x) => x !== a) })); }} style={{ ...followBtn, padding: "3px 9px", color: "var(--accent-2)" }}>Es su wallet</button>}
                    <button title="Descartar" onClick={() => updatePerson(person.id, (o) => ({ ...o, alerts: (o.alerts || []).filter((x) => x !== a) }))}
                      style={{ color: "var(--text-3)", display: "grid", placeItems: "center", width: 20, height: 20 }}><IconClose size={10} /></button>
                  </div>
                ))}
              </div>
            )}

            {graph ? (
              <FollowGraph
                graph={shown} mode={mode} selected={nodeSel} onSelect={pick}
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
              <FollowActivity person={person} insights={insights} perf={perf} now={now} range={range} setRange={setRange}
                tokenName={tokenName} onSelect={pick} onHuntToken={onHuntToken} />
            ) : null}
          </>
        )}
      </section>

      {/* ── Right: the selected wallet ── */}
      {person && (
        <aside style={{ width: "clamp(296px, 21vw, 364px)", flexShrink: 0, overflowY: "auto", background: "var(--bg)", borderLeft: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 2, padding: "10px 14px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 3 }}>
            {[["perfil", "Perfil"], ["vivo", "En vivo"], ["ca", "CA"]].map(([k, label]) => (
              <button key={k} onClick={() => openTab(k)} style={{
                flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: tab === k ? "var(--surface-2)" : "transparent", color: tab === k ? "var(--text)" : "var(--text-3)",
              }}>
                {k === "vivo" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: rt.connected ? "var(--accent)" : "var(--text-4)" }} />}
                {label}
                {k === "vivo" && unseen > 0 && tab !== "vivo" && (
                  <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, padding: "0 5px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-ink)" }}>{unseen > 99 ? "99+" : unseen}</span>
                )}
              </button>
            ))}
          </div>
          {tab === "perfil" && (
            <FollowProfile
              person={person} graph={graph} node={selNode} group={selGroup} now={now} tokenName={tokenName} seenTs={seenTs}
              label={selNode ? labels[selNode.addr] : ""} onLabel={setLabel}
              onSelect={pick}
              onAlias={(a) => setAlias(a, true)} onUnalias={(a) => setAlias(a, false)}
              onFollowNew={(a) => addPerson("", a)}
              onTrace={onTrace}
            />
          )}
          {tab === "vivo" && (
            <FollowLive
              events={events} convergences={convergences} rt={rt} auto={auto} notify={notify} onNotify={toggleNotify}
              now={now} tokenName={tokenName} onOpen={openEvent} onHuntToken={onHuntToken}
              onClear={() => { setEvents([]); localStorage.removeItem("follow_events"); }}
            />
          )}
          {tab === "ca" && (
            <FollowCA ca={ca} recent={caRecent} now={now} tokenName={tokenName} onSearch={runSearch} onOpen={openEvent} onHuntToken={onHuntToken} />
          )}
        </aside>
      )}
    </div>
  );
}
