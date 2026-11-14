// Tiempo real: websocket de Helius suscrito a cada wallet vigilada (logsSubscribe).
// Cuando una wallet firma o recibe algo, avisa en menos de un segundo con la firma.
// Se reconecta solo y vuelve a suscribirse si se cae la conexión.

export function startRealtime({ onTx, log = () => {} }) {
  const key = process.env.HELIUS_KEY;
  if (!key) {
    log('Tiempo real apagado: falta HELIUS_KEY en .env (se sigue revisando cada pocos minutos).');
    return { setWallets() {}, status: () => ({ connected: false, wallets: 0, enabled: false }) };
  }
  let ws = null;
  let connected = false;
  let retry = 0;
  let nextId = 1;
  let want = new Map();          // dirección → persona
  const subs = new Map();        // dirección → id de suscripción
  const bySub = new Map();       // id de suscripción → dirección
  const pending = new Map();     // id de petición → dirección

  const send = (o) => { try { ws?.send(JSON.stringify(o)); } catch { /* se reintenta al reconectar */ } };
  const subscribe = (a) => {
    const id = nextId++;
    pending.set(id, a);
    send({ jsonrpc: '2.0', id, method: 'logsSubscribe', params: [{ mentions: [a] }, { commitment: 'confirmed' }] });
  };
  const unsubscribe = (a) => {
    const sid = subs.get(a);
    if (sid == null) return;
    subs.delete(a); bySub.delete(sid);
    send({ jsonrpc: '2.0', id: nextId++, method: 'logsUnsubscribe', params: [sid] });
  };

  function connect() {
    ws = new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${key}`);
    ws.onopen = () => {
      connected = true; retry = 0;
      subs.clear(); bySub.clear(); pending.clear();
      for (const a of want.keys()) subscribe(a);
      log(`Tiempo real conectado: vigilando ${want.size} wallets.`);
    };
    ws.onmessage = (m) => {
      let d;
      try { d = JSON.parse(m.data); } catch { return; }
      if (d.id != null && pending.has(d.id)) {
        const a = pending.get(d.id);
        pending.delete(d.id);
        if (typeof d.result === 'number') {
          if (want.has(a)) { subs.set(a, d.result); bySub.set(d.result, a); }
          else send({ jsonrpc: '2.0', id: nextId++, method: 'logsUnsubscribe', params: [d.result] });
        }
        return;
      }
      if (d.method === 'logsNotification') {
        const a = bySub.get(d.params?.subscription);
        const v = d.params?.result?.value;
        if (a && v && !v.err) onTx(a, want.get(a), v.signature);
      }
    };
    ws.onclose = () => {
      if (connected) log('Tiempo real desconectado; reconectando…');
      connected = false;
      setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
    ws.onerror = () => {};
  }
  connect();
  // Mantiene viva la conexión (Helius corta conexiones inactivas).
  setInterval(() => connected && send({ jsonrpc: '2.0', id: nextId++, method: 'getHealth' }), 30000);

  return {
    // Ajusta las suscripciones a esta lista (Map dirección → persona).
    setWallets(map) {
      want = new Map(map);
      if (!connected) return;
      for (const a of want.keys()) if (!subs.has(a) && ![...pending.values()].includes(a)) subscribe(a);
      for (const a of [...subs.keys()]) if (!want.has(a)) unsubscribe(a);
    },
    status: () => ({ connected, wallets: subs.size, enabled: true }),
  };
}
