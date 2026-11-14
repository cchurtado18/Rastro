import test from 'node:test';
import assert from 'node:assert/strict';
import { tracePerson, primeScan, clearScanCache } from '../lib/tracker.js';

const W = (c) => c.repeat(44);
const A = W('A'), B = W('B'), C = W('C'), D = W('D'), E = W('E'), X = W('X');
const buy = (ts, mint = 'M' + ts) => ({ side: 'buy', mint, amount: 1, sol: 0.5, usd: 0, ts, sig: 's' + ts });
const out = (to, amount, ts) => ({ dir: 'out', to, asset: 'SOL', amount, ts, sig: 'o' + ts });
const scan = (address, trades = [], moves = [], busy = false) => {
  const buys = trades.filter((t) => t.side === 'buy');
  return { address, txCount: 10, busy, trades, moves, lastTs: 1, lastBuyTs: buys.length ? Math.max(...buys.map((b) => b.ts)) : null };
};

test('sigue A → puente B → C cuando C compra después de recibir', async () => {
  clearScanCache();
  primeScan(A, scan(A, [buy(100)], [out(B, 5, 200), out(D, 1, 210)]));
  primeScan(B, scan(B, [], [out(C, 4.9, 220)]));        // solo reenvía
  primeScan(C, scan(C, [buy(300), buy(400)], []));       // compra: nueva activa
  primeScan(D, scan(D, [], []));                          // recibió, no compra
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, C);
  assert.equal(r.hops.length, 1);
  assert.deepEqual(r.hops[0].via, [B]);
  assert.ok(r.watch.some((w) => w.to === D));
});

test('encadena varias mudanzas A → C → E', async () => {
  clearScanCache();
  primeScan(A, scan(A, [buy(100)], [out(C, 3, 200)]));
  primeScan(C, scan(C, [buy(300)], [out(E, 2, 350)]));
  primeScan(E, scan(E, [buy(500)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, E);
  assert.equal(r.hops.length, 2);
});

test('no cambia si la wallet actual compró más recientemente', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  primeScan(A, scan(A, [buy(now - 100)], [out(C, 3, now - 800)]));
  primeScan(C, scan(C, [buy(now - 700)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, A);
  assert.equal(r.alsoActive[0].to, C);
});

test('ignora exchanges y envíos chicos; marca la que recibió sin comprar', async () => {
  clearScanCache();
  primeScan(A, scan(A, [buy(100)], [out(X, 50, 200), out(C, 0.05, 210), out(D, 2, 220)]));
  primeScan(X, scan(X, [buy(300)], [], true));
  primeScan(C, scan(C, [buy(300)], []));
  primeScan(D, scan(D, [], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, A);
  assert.deepEqual(r.watch.map((w) => w.to), [D]);
});

test('si el dinero regresa a una wallet anterior y vuelve a comprar, esa es la activa', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  primeScan(A, scan(A, [buy(now - 900), buy(now - 100)], [out(C, 3, now - 800)]));
  primeScan(C, scan(C, [buy(now - 700)], [out(A, 20, now - 200)]));
  const r = await tracePerson({ name: 't', wallets: [A, C], active: C });
  assert.equal(r.active, A);
  assert.equal(r.hops[0].from, C);
});

test('compara: elige la que más compra en 24 h y avisa si la más reciente es otra', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  // A: 4 compras en las últimas 24 h. C (nueva): 1 compra hace 5 min.
  primeScan(A, scan(A, [buy(now - 20000), buy(now - 15000), buy(now - 9000), buy(now - 4000)], [out(C, 3, now - 3000)]));
  primeScan(C, scan(C, [buy(now - 300)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, A);
  assert.equal(r.compare.principal, A);
  assert.equal(r.compare.latest, C);
  const a = r.compare.wallets.find((w) => w.address === A);
  const c = r.compare.wallets.find((w) => w.address === C);
  assert.equal(a.w24.buys, 4);
  assert.equal(c.w24.buys, 1);
  assert.equal(c.w1.buys, 1);
  assert.match(r.compare.summary, /2 wallets a la vez/);
  assert.match(r.compare.summary, /más reciente fue con CCCC/);
  assert.ok(r.recent.some((t) => t.wallet === C));
});

test('compara: la nueva gana cuando ya compra más que la vieja', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  primeScan(A, scan(A, [buy(now - 80000), buy(now - 50000)], [out(C, 3, now - 40000)]));
  primeScan(C, scan(C, [buy(now - 30000), buy(now - 20000), buy(now - 600)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, C);
  assert.equal(r.changed, true);
});

import { parseTx, setExchangeSource, DUST_SOL } from '../lib/tracker.js';

function fakeSwap(wallet, solSpent) {
  return {
    blockTime: 1000,
    transaction: { signatures: ['sig1'], message: { accountKeys: [{ pubkey: wallet, signer: true }], instructions: [] } },
    meta: { err: null, fee: 5000, preBalances: [10e9], postBalances: [10e9 - 5000 - solSpent * 1e9], innerInstructions: [],
      preTokenBalances: [], postTokenBalances: [{ accountIndex: 0, owner: wallet, mint: 'Mint111', uiTokenAmount: { uiAmountString: '1000' } }] },
  };
}

test('polvo: compras de menos de 0.01 SOL no cuentan', () => {
  assert.equal(parseTx(fakeSwap(A, 0.002), A).trades.length, 0);
  assert.equal(parseTx(fakeSwap(A, 0.002), A).dust, 1);
  assert.equal(parseTx(fakeSwap(A, 0.5), A).trades.length, 1);
  assert.ok(DUST_SOL === 0.01);
});

test('exchange: depositó 5 SOL y una sola wallet nueva retiró ~5 y compró → es la nueva', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  primeScan(A, scan(A, [buy(now - 9000)], [out(X, 5, now - 3000)]));
  primeScan(X, scan(X, [], [], true));
  primeScan(C, { ...scan(C, [buy(now - 1000), buy(now - 500)], []), history: [] });
  primeScan(D, { ...scan(D, [], []), history: [] });
  setExchangeSource(async () => [
    { to: C, asset: 'SOL', amount: 4.99, ts: now - 2000, sig: 'w1' },
    { to: D, asset: 'SOL', amount: 4.995, ts: now - 2500, sig: 'w2' },  // parecida pero no compra
    { to: E, asset: 'SOL', amount: 1.2, ts: now - 2400, sig: 'w3' },    // monto distinto
  ]);
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  setExchangeSource(null);
  assert.equal(r.active, C);
  assert.equal(r.hops[0].viaExchange, X);
  assert.ok(r.watch.some((w) => w.to === D));
});

test('exchange: si varias wallets nuevas coinciden, no adivina: las marca como posibles', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  primeScan(A, scan(A, [buy(now - 9000)], [out(X, 5, now - 3000)]));
  primeScan(X, scan(X, [], [], true));
  primeScan(C, { ...scan(C, [buy(now - 1000)], []), history: [] });
  primeScan(D, { ...scan(D, [buy(now - 800)], []), history: [] });
  setExchangeSource(async () => [
    { to: C, asset: 'SOL', amount: 4.99, ts: now - 2000, sig: 'w1' },
    { to: D, asset: 'SOL', amount: 4.98, ts: now - 1900, sig: 'w2' },
  ]);
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  setExchangeSource(null);
  assert.equal(r.active, A);
  assert.deepEqual(r.watch.map((w) => w.to).sort(), [C, D].sort());
});

test('exchange: ignora wallets con historial previo (no son nuevas)', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  primeScan(A, scan(A, [buy(now - 9000)], [out(X, 5, now - 3000)]));
  primeScan(X, scan(X, [], [], true));
  primeScan(C, { ...scan(C, [buy(now - 1000)], []), history: [1, 2, 3, 4, 5].map((i) => ({ blockTime: now - 90000 - i })) });
  setExchangeSource(async () => [{ to: C, asset: 'SOL', amount: 4.99, ts: now - 2000, sig: 'w1' }]);
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  setExchangeSource(null);
  assert.equal(r.active, A);
});

test('candidatos: la mudanza reciente se revisa aunque haya envíos viejos más grandes', async () => {
  clearScanCache();
  const now = Math.floor(Date.now() / 1000);
  const moves = [out(B, 50, now - 90000), out(D, 40, now - 80000), out(E, 30, now - 70000), out(X, 20, now - 60000), out(W('F'), 10, now - 50000), out(C, 1, now - 1000)];
  primeScan(A, scan(A, [buy(now - 5000)], moves));
  for (const w of [B, D, E, X, W('F')]) primeScan(w, scan(w, [], []));
  primeScan(C, scan(C, [buy(now - 100)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, C);
});
