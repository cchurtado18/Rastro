import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  SOURCE_LABELS, hueColor, TIME_WINDOWS, WINDOW_SECONDS, MAX_HISTORY, mkEntry, shortAddr, fmtCustom, parseWindowInput,
  vanityTag, fetchTokenInfo, fetchSolPriceUsd, fmtMcap, fetchAllSwaps, detectBundles, traceWalletChain,
  checkWalletsBatch, checkHighFrequencyWallets, extractBuyers, extractEarlyBuyers, detectLaunchpad,
} from "./engine.js";
import {
  IconTarget, IconPlus, IconClose, IconCheck, IconCopy, IconBookmark, IconEdit, IconChevron, IconHistory,
  IconExternal, IconDownload, IconSliders, IconBot, IconAlert, IconInfo, IconSpark, IconRefresh, IconStop, IconArrowR,
  IconKeyboard, IconSearch, IconFollow, Toggle,
  Brand,
} from "./ui.jsx";
import {
  FollowView, ViewSwitch,
} from "./Follow.jsx";

const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY || "";

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
      {/* Brand + view switch: the same header as the Follow sidebar */}
      <div style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
        <Brand />
        {viewSwitch}
      </div>

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
      padding: "16px 24px 14px", borderBottom: "1px solid var(--line)",
      background: "var(--bg)", position: "sticky", top: 0, zIndex: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }}>Cazar</span>
        <span style={{ fontSize: 12.5, color: "var(--text-3)", marginLeft: 12 }}>wallets que compraron temprano en varios tokens</span>
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
            { n: "02", t: "Ajusta ventana", d: "Tiempo desde la 1ª compra" },
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
        }, { windowSecs: primaryWindowSecs });

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

          const { txs, mintFirstTs, coveredTo, complete } = await fetchAllSwaps(ca, HELIUS_API_KEY, controller.signal, (ev) => {
            if (ev.type === "rate_limit") setProgress((p) => ({ ...p, rateLimitHit: true }));
            if (ev.type === "page") { caStatus[i].totalTxs = ev.total; setProgress((p) => ({ ...p, caStatus: [...caStatus] })); }
          }, { windowSecs });

          if (txs.length === 0) {
            caStatus[i].status = "empty";
            setProgress((p) => ({ ...p, caStatus: [...caStatus] }));
            buyerSets.push(new Set());
            continue;
          }

          // The token is read forward from its first transaction, so the window simply starts at the
          // first buy (bonding-curve buys included). If 30 pages did not reach the end of the window,
          // the status row says how far it got.
          const windowStart = mintFirstTs;
          const windowEnd   = windowSecs ? mintFirstTs + windowSecs : Infinity;
          if (!complete) caStatus[i].coveredSecs = Math.max(0, coveredTo - mintFirstTs);
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
      out.push({ tone: "warn", text: `${shortAddr(heavyCA.ca, 6, 6)} tiene más de 1000 transacciones en la ventana. Prueba una ventana más corta (1h) o un mínimo de SOL más alto.` });
    const cut = progress.caStatus.find((s) => s.coveredSecs != null);
    if (cut)
      out.push({ tone: "warn", text: `${shortAddr(cut.ca, 6, 6)} es muy activo: solo se leyeron sus primeros ${Math.max(1, Math.round(cut.coveredSecs / 60))} min (el tope de lectura). Los compradores posteriores no entran.` });
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
          flex: 1, padding: "22px 24px 40px",
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
          padding: "10px 24px", borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", gap: 14,
          fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em",
        }}>
          <span>Wallet Tracker · edición definitiva</span>
          <span style={{ flex: 1 }} />
          <span>Helius · lee desde la creación del token</span>
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
