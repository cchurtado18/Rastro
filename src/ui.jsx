// Icons and small controls shared by Cazar and Seguir.

// ─── Icons ────────────────────────────────────────────────────────────────────

export function Icon({ path, size = 14, style, viewBox = "0 0 24 24" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={viewBox}
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden>
      {typeof path === "string" ? <path d={path} /> : path}
    </svg>
  );
}

export const IconTarget   = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>} />;
export const IconPlus     = (p) => <Icon {...p} path="M12 5v14M5 12h14" />;
export const IconClose    = (p) => <Icon {...p} path="M6 6l12 12M18 6l-6 6-6 6" />;
export const IconCheck    = (p) => <Icon {...p} path="M4 12l5 5L20 6" />;
export const IconCopy     = (p) => <Icon {...p} path={<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>} />;
export const IconBookmark = (p) => <Icon {...p} path="M6 3h12v18l-6-4-6 4z" />;
export const IconEdit     = (p) => <Icon {...p} path="M4 20h4L20 8l-4-4L4 16v4z" />;
export const IconChevron  = (p) => <Icon {...p} path="M6 9l6 6 6-6" />;
export const IconHistory  = (p) => <Icon {...p} path={<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>} />;
export const IconExternal = (p) => <Icon {...p} path={<><path d="M14 4h6v6"/><path d="M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>} />;
export const IconDownload = (p) => <Icon {...p} path={<><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></>} />;
export const IconSliders  = (p) => <Icon {...p} path={<><path d="M4 7h10M18 7h2"/><path d="M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></>} />;
export const IconBot      = (p) => <Icon {...p} path={<><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 14h.01M15 14h.01"/><path d="M2 14h2M20 14h2"/></>} />;
export const IconAlert    = (p) => <Icon {...p} path={<><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/></>} />;
export const IconInfo     = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/></>} />;
export const IconSpark    = (p) => <Icon {...p} path={<><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="M6 6l4 4M18 18l-4-4M6 18l4-4M18 6l-4 4"/></>} />;
export const IconRefresh  = (p) => <Icon {...p} path={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>} />;
export const IconStop     = (p) => <Icon {...p} path={<><rect x="5" y="5" width="14" height="14" rx="2"/></>} />;
export const IconArrowR   = (p) => <Icon {...p} path={<><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></>} />;
export const IconKeyboard = (p) => <Icon {...p} path={<><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></>} />;
export const IconSearch   = (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>} />;

export const IconFollow = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12l6.4-6.4"/></>} />;
export const IconFit    = (p) => <Icon {...p} path="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />;
export const IconMinus  = (p) => <Icon {...p} path="M5 12h14" />;

export function Toggle({ value, onChange, size = 18 }) {
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

// The app's name, at the top of both sidebars
export function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "color-mix(in oklch, var(--accent) 18%, transparent)",
        border: "1px solid color-mix(in oklch, var(--accent) 45%, transparent)",
        color: "var(--accent-2)",
      }}>
        <IconTarget size={15} />
      </span>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em" }}>Wallet Tracker</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "0.08em", marginTop: 2, textTransform: "uppercase" }}>
          Solana · edición definitiva
        </div>
      </div>
    </div>
  );
}
