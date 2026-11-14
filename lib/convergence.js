// Convergencia: dos o más personas distintas compran la misma moneda en poco tiempo.
// Es la señal más fuerte que da el seguimiento: no es una persona, es un grupo coincidiendo.

export const CONVERGE_DEFAULTS = { windowSec: 30 * 60, minPeople: 2 };

// Agrupa compras por moneda y devuelve las monedas compradas por al menos `minPeople` personas
// dentro de `windowSec` (cuenta la primera compra de cada persona dentro de la ventana).
// buys: [{ name, wallet, mint, ts, sol, usd, sig }]
export function findConvergences(buys, { windowSec = CONVERGE_DEFAULTS.windowSec, minPeople = CONVERGE_DEFAULTS.minPeople } = {}) {
  const byMint = new Map();
  for (const b of buys) {
    if (!b?.mint || !b.name) continue;
    if (!byMint.has(b.mint)) byMint.set(b.mint, []);
    byMint.get(b.mint).push(b);
  }
  const out = [];
  for (const [mint, list] of byMint) {
    list.sort((a, b) => a.ts - b.ts);
    // Ventana deslizante: el grupo más grande de personas distintas dentro de windowSec.
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const first = new Map();
      for (let j = i; j < list.length && list[j].ts - list[i].ts <= windowSec; j++) {
        if (!first.has(list[j].name)) first.set(list[j].name, list[j]);
      }
      if (first.size >= minPeople && (!best || first.size > best.size || (first.size === best.size && [...first.values()].at(-1).ts > [...best.values()].at(-1).ts))) best = first;
    }
    if (!best) continue;
    const people = [...best.values()].map((b) => ({ name: b.name, wallet: b.wallet, ts: b.ts, sol: b.sol || 0, usd: b.usd || 0, sig: b.sig }));
    out.push({
      mint,
      people,
      firstTs: people[0].ts,
      lastTs: people.at(-1).ts,
      spanSec: people.at(-1).ts - people[0].ts,
      sol: people.reduce((s, p) => s + p.sol, 0),
      usd: people.reduce((s, p) => s + p.usd, 0),
    });
  }
  return out.sort((a, b) => b.lastTs - a.lastTs);
}

// Compras de todos a partir del estado guardado (recent de cada persona), sin imitaciones.
export function buysFromState(st, sinceTs = 0) {
  const buys = [];
  for (const [name, r] of Object.entries(st || {})) {
    for (const t of r?.recent || []) {
      if (t.side !== 'buy' || t.spoof || r.tokens?.[t.mint]?.spoof || t.ts < sinceTs) continue;
      buys.push({ name, wallet: t.wallet || r.active, mint: t.mint, ts: t.ts, sol: t.sol, usd: t.usd, sig: t.sig });
    }
  }
  return buys;
}

// Detector en vivo: se le pasan compras una por una y devuelve un aviso cuando una moneda
// llega a `minPeople` personas, y otra vez cada vez que se suma una persona más.
export function createDetector(opts = {}) {
  const o = { ...CONVERGE_DEFAULTS, ...opts };
  let buys = [];
  const seen = new Set();      // sig:mint:name ya contados
  const announced = new Map(); // mint → cuántas personas ya se avisaron
  const add = (b) => {
    const k = `${b.sig}:${b.mint}:${b.name}`;
    if (seen.has(k)) return false;
    seen.add(k); buys.push(b);
    return true;
  };
  return {
    // Carga compras ya conocidas sin avisar (al arrancar el servidor).
    seed(list) {
      for (const b of list) add(b);
      for (const c of findConvergences(buys, o)) announced.set(c.mint, c.people.length);
    },
    // Agrega una compra; devuelve la convergencia si hay algo nuevo que avisar, o null.
    push(b, now = Math.floor(Date.now() / 1000)) {
      if (!add(b)) return null;
      buys = buys.filter((x) => x.ts >= now - Math.max(o.windowSec * 4, 86400));
      const c = findConvergences(buys.filter((x) => x.mint === b.mint), o)[0];
      if (!c || !c.people.some((p) => p.name === b.name)) return null;
      if ((announced.get(b.mint) || 0) >= c.people.length) return null;
      announced.set(b.mint, c.people.length);
      return c;
    },
  };
}
