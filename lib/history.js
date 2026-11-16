// Historial acumulado: cada revisión solo lee lo nuevo, así que el mapa, los envíos y quién le mandó
// dinero se suman a lo que ya se sabía en vez de reemplazarlo. Se guardan los últimos KEEP_DAYS días.

export const KEEP_DAYS = 7;
const TRANSIENT = new Set(['active', 'current', 'scanning', 'pending', 'seen']);

const edgeKey = (e) => e.from + '>' + e.to;

// Junta el mapa anterior con el nuevo. Lo nuevo manda; lo viejo se conserva si tiene menos de KEEP_DAYS.
export function mergeGraph(prev, next, { active, wallets = [], now = Math.floor(Date.now() / 1000) } = {}) {
  if (!prev?.nodes?.length) return next;
  const cutoff = now - KEEP_DAYS * 86400;
  const edges = new Map((next?.edges || []).map((e) => [edgeKey(e), { ...e }]));
  // Si la revisión nueva dice que una wallet es un depósito o de otra persona, lo que se siguió más allá se suelta.
  const stop = new Set((next?.nodes || []).filter((n) => n.status === 'service' || n.status === 'other').map((n) => n.id));
  for (const e of prev.edges || []) {
    if (stop.has(e.from)) continue;
    const k = edgeKey(e);
    const cur = edges.get(k);
    if (cur) {
      // El mismo envío visto antes y ahora: se queda lo más reciente, sin perder el monto.
      if (!(cur.sol || cur.usd) && (e.sol || e.usd)) Object.assign(cur, { sol: e.sol, usd: e.usd });
      if ((e.ts || 0) > (cur.ts || 0)) cur.ts = e.ts;
      continue;
    }
    // La cadena de wallets (history) se arma completa en cada revisión: la vieja no se arrastra.
    if (e.kind === 'history' || (e.ts || 0) < cutoff) continue;
    edges.set(k, { ...e });
  }
  const used = new Set(wallets);
  for (const e of edges.values()) { used.add(e.from); used.add(e.to); }

  const nodes = new Map((next?.nodes || []).map((n) => [n.id, { ...n }]));
  for (const n of prev.nodes || []) {
    if (nodes.has(n.id) || !used.has(n.id)) continue;
    let status = n.status;
    // Lo que era "activa" o "revisando" en la revisión vieja ya no lo es.
    if (TRANSIENT.has(status)) status = n.id === active ? 'active' : wallets.includes(n.id) ? 'old' : 'seen';
    // "Compró" / "también compra" de una revisión vieja solo sigue si de verdad compró en los últimos días.
    if (status === 'old' && !wallets.includes(n.id)) status = 'bridge'; // salió de la cadena: era un puente
    if ((status === 'buyer' || status === 'also') && !(n.buys > 0 && (n.lastBuyTs || 0) >= cutoff)) status = wallets.includes(n.id) ? 'old' : 'seen';
    nodes.set(n.id, { ...n, status });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

// Listas que se acumulan (envíos que salieron, dinero que entró), sin repetidos y con los últimos KEEP_DAYS.
export function mergeList(prev = [], next = [], keyOf, tsOf, now = Math.floor(Date.now() / 1000)) {
  const cutoff = now - KEEP_DAYS * 86400;
  const out = new Map(next.map((x) => [keyOf(x), x]));
  for (const x of prev) if (!out.has(keyOf(x)) && (tsOf(x) || 0) >= cutoff) out.set(keyOf(x), x);
  return [...out.values()].sort((a, b) => (tsOf(b) || 0) - (tsOf(a) || 0));
}

// Envíos agrupados por destino: si la revisión nueva trae firmas distintas, los montos se suman;
// si se repiten firmas (las ventanas se traslapan unos minutos), se queda el mayor para no contar doble.
export function mergeOutgoing(prev = [], next = [], now = Math.floor(Date.now() / 1000)) {
  const cutoff = now - KEEP_DAYS * 86400;
  const out = new Map(next.map((o) => [o.to, { ...o, sigs: [...(o.sigs || [])] }]));
  for (const o of prev) {
    const cur = out.get(o.to);
    if (!cur) { if ((o.lastTs || 0) >= cutoff) out.set(o.to, o); continue; }
    const overlap = (o.sigs || []).some((s) => cur.sigs.includes(s));
    if (overlap) { cur.sol = Math.max(cur.sol || 0, o.sol || 0); cur.usd = Math.max(cur.usd || 0, o.usd || 0); }
    else { cur.sol = (cur.sol || 0) + (o.sol || 0); cur.usd = (cur.usd || 0) + (o.usd || 0); }
    cur.firstTs = Math.min(cur.firstTs || Infinity, o.firstTs || Infinity);
    cur.sigs = [...new Set([...cur.sigs, ...(o.sigs || [])])];
  }
  return [...out.values()].sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
}

// Aplica todo lo anterior a un resultado nuevo de tracePerson.
export function mergeResult(prev, r, wallets) {
  if (!prev) return r;
  const now = Math.floor(Date.now() / 1000);
  r.graph = mergeGraph(prev.graph, r.graph, { active: r.active, wallets, now });
  r.outgoing = mergeOutgoing(prev.outgoing, r.outgoing, now);
  r.fundedBy = mergeList(prev.fundedBy, r.fundedBy, (f) => f.sig || f.from + f.ts, (f) => f.ts, now);
  return r;
}
