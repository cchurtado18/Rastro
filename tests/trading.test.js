// Solo cuentan las wallets que tradean de verdad; los puentes, depósitos y wallets ajenas son el camino.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tracePerson, primeScan, clearScanCache, readTrades, setTokenSource } from '../lib/tracker.js';
import { isNotTrade } from '../lib/solana.js';

const W = (c) => c.repeat(44);
const A = W('A'), B = W('B'), C = W('C'), O = W('O'), S = W('S');
const buy = (ts, mint = 'M' + ts) => ({ side: 'buy', mint, amount: 1, sol: 0.5, usd: 0, ts, sig: 's' + ts });
const out = (to, amount, ts) => ({ dir: 'out', to, asset: 'SOL', amount, ts, sig: 'o' + ts + to[0] });
const inn = (from, amount, ts) => ({ dir: 'in', from, asset: 'SOL', amount, ts, sig: 'i' + ts + from });
const scan = (address, trades = [], moves = []) => {
  const buys = trades.filter((t) => t.side === 'buy');
  return { address, txCount: 10, busy: false, trades, moves, lastTs: 1, lastBuyTs: buys.length ? Math.max(...buys.map((b) => b.ts)) : null };
};

test('una wallet de otra persona que sigues nunca se le asigna a esta', async () => {
  clearScanCache();
  primeScan(A, scan(A, [buy(100)], [out(O, 3, 200)]));
  primeScan(O, scan(O, [buy(300), buy(400)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A }, { others: new Map([[O, 'Otro']]) });
  assert.equal(r.active, A);
  assert.equal(r.alsoActive.length, 0);
  assert.equal(r.graph.nodes.find((n) => n.id === O).status, 'other');
  assert.equal(r.graph.nodes.find((n) => n.id === O).owner, 'Otro');
});

test('pasando por un puente, una wallet que ya tradeaba antes de recibir no es una mudanza', async () => {
  clearScanCache();
  primeScan(A, scan(A, [buy(100)], [out(B, 3, 200)]));
  primeScan(B, scan(B, [], [out(C, 3, 210)]));
  primeScan(C, scan(C, [buy(50), buy(150), buy(400)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, A);
  assert.equal(r.hops.length, 0);
  assert.equal(r.graph.nodes.find((n) => n.id === C).status, 'other');
});

test('un depósito que recibe de muchas wallets no es puente ni se vigila', async () => {
  clearScanCache();
  const senders = 'DEFGHJ'.split('').map((c, i) => inn(W(c), 1, 150 + i));
  primeScan(A, scan(A, [buy(100)], [out(S, 3, 200)]));
  primeScan(S, scan(S, [], [...senders, out(C, 50, 260)]));
  primeScan(C, scan(C, [buy(300)], []));
  const r = await tracePerson({ name: 't', wallets: [A], active: A });
  assert.equal(r.active, A);
  assert.equal(r.watch.length, 0);
  assert.equal(r.graph.nodes.find((n) => n.id === S).status, 'service');
  assert.ok(!r.graph.nodes.some((n) => n.id === C), 'no sigue más allá del depósito');
});

test('imitaciones y estables no son trading', () => {
  assert.ok(isNotTrade('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', { symbol: 'USDT', name: 'USDT' }), 'copia la dirección del USDT real');
  assert.ok(isNotTrade('Q'.repeat(44), { symbol: 'USDT', name: 'Tether USD' }));
  assert.ok(isNotTrade('Q'.repeat(44), { symbol: 'JitoSOL', name: 'Jito Staked SOL' }));
  assert.ok(!isNotTrade('Q'.repeat(44), { symbol: 'SNUT', name: 'Snut' }));
  assert.ok(!isNotTrade('DKyhnqwG9KTLSc8FymPB761Mu4F1SiTGYwV1n15Npump', { symbol: 'USDC', name: 'FatCatBatRatWifHat' }), 'memecoin que solo comparte el símbolo');
});

test('una "compra" de USDT falso se lee como el envío de SOL que era', async () => {
  const fake = 'F'.repeat(44);
  const tx = {
    blockTime: 1000,
    transaction: { signatures: ['sig1'], message: {
      accountKeys: [{ pubkey: A, signer: true }, { pubkey: B, signer: false }, { pubkey: 'T'.repeat(44), signer: false }],
      instructions: [{ program: 'system', parsed: { type: 'transfer', info: { source: A, destination: B, lamports: 5e9 } } }],
    } },
    meta: { err: null, fee: 5000, preBalances: [10e9, 0, 0], postBalances: [5e9 - 5000, 5e9, 0],
      preTokenBalances: [], postTokenBalances: [{ accountIndex: 2, mint: fake, owner: A, uiTokenAmount: { uiAmountString: '100' } }], innerInstructions: [] },
  };
  setTokenSource(async () => ({ [fake]: { symbol: 'USDT' } }));
  const { parsed: [p] } = await readTrades(A, [tx]);
  setTokenSource(null);
  assert.equal(p.trades.length, 0);
  assert.equal(p.moves.length, 1);
  assert.equal(p.moves[0].to, B);
  assert.equal(p.moves[0].amount, 5);
});

test('una wallet de la cadena sin ninguna compra pasa a ser el puente entre las dos que tradean', async () => {
  const { demoteBridges } = await import('../lib/store.js');
  const p = { name: 't', wallets: [A, B, C], active: C };
  const r = { active: C, compare: { wallets: [{ address: A, total: { buys: 9, sells: 2 } }, { address: B, total: { buys: 0, sells: 0 } }, { address: C, total: { buys: 5, sells: 1 } }] },
    graph: { nodes: [{ id: A, status: 'old' }, { id: B, status: 'old' }, { id: C, status: 'active' }], edges: [{ from: A, to: B, kind: 'history' }, { from: B, to: C, kind: 'history' }] } };
  assert.deepEqual(demoteBridges(p, r), [B]);
  assert.deepEqual(p.wallets, [A, C]);
  assert.deepEqual(p.bridges, [{ id: B, from: A, to: C }]);
  assert.equal(r.graph.nodes.find((n) => n.id === B).status, 'bridge');
  // La siguiente revisión dibuja A → puente B → C.
  clearScanCache();
  primeScan(C, scan(C, [buy(100)], []));
  primeScan(A, scan(A, [buy(50)], []));
  const t = await tracePerson(p);
  assert.equal(t.graph.nodes.find((n) => n.id === B).status, 'bridge');
  assert.ok(t.graph.edges.some((e) => e.from === A && e.to === B) && t.graph.edges.some((e) => e.from === B && e.to === C));
});

test('envío de SOL envuelto sin decimales en la instrucción: 1 SOL, no 1000', async () => {
  const WSOL = 'So11111111111111111111111111111111111111112';
  const accA = 'a'.repeat(44), accB = 'b'.repeat(44);
  const tx = {
    blockTime: 1000,
    transaction: { signatures: ['sig2'], message: {
      accountKeys: [{ pubkey: A, signer: true }, { pubkey: accA }, { pubkey: accB }],
      instructions: [{ program: 'spl-token', parsed: { type: 'transfer', info: { source: accA, destination: accB, amount: '1000000000', authority: A } } }],
    } },
    meta: { err: null, fee: 5000, preBalances: [2e9, 0, 0], postBalances: [2e9 - 5000, 0, 0],
      preTokenBalances: [{ accountIndex: 1, mint: WSOL, owner: A, uiTokenAmount: { uiAmountString: '1', decimals: 9 } }, { accountIndex: 2, mint: WSOL, owner: B, uiTokenAmount: { uiAmountString: '0', decimals: 9 } }],
      postTokenBalances: [{ accountIndex: 1, mint: WSOL, owner: A, uiTokenAmount: { uiAmountString: '0', decimals: 9 } }, { accountIndex: 2, mint: WSOL, owner: B, uiTokenAmount: { uiAmountString: '1', decimals: 9 } }], innerInstructions: [] },
  };
  const { parsed: [p] } = await readTrades(A, [tx]);
  assert.deepEqual(p.moves.map((m) => [m.dir, m.to, m.asset, m.amount]), [['out', B, 'SOL', 1]]);
});

test('envolver SOL en su propia cuenta de token no es un envío', async () => {
  const WSOL = 'So11111111111111111111111111111111111111112';
  const ata = 'w'.repeat(44);
  const tx = {
    blockTime: 1000,
    transaction: { signatures: ['sig3'], message: {
      accountKeys: [{ pubkey: A, signer: true }, { pubkey: ata }],
      instructions: [{ program: 'system', parsed: { type: 'transfer', info: { source: A, destination: ata, lamports: 2e9 } } }],
    } },
    meta: { err: null, fee: 5000, preBalances: [3e9, 0], postBalances: [1e9 - 5000, 2e9], preTokenBalances: [],
      postTokenBalances: [{ accountIndex: 1, mint: WSOL, owner: A, uiTokenAmount: { uiAmountString: '2', decimals: 9 } }], innerInstructions: [] },
  };
  const { parsed: [p] } = await readTrades(A, [tx]);
  assert.equal(p.moves.length, 0);
});

test('cuenta de token (ATA) calculada igual que en Solana', async () => {
  const { ataOf } = await import('../lib/casearch.js');
  assert.equal(ataOf('3EviczcY8hYGeEjDii6iG5bUkz7rybaggB97k7B9vHdh', 'So11111111111111111111111111111111111111112'), 'J63EHspCC7KrtpKtdeBYF8xxpr9CjrDZem1zKzEgb61k');
  assert.equal(ataOf('3EviczcY8hYGeEjDii6iG5bUkz7rybaggB97k7B9vHdh', 'DjAe9u4khJhpDQ3yD6gSiLUcnsix7nYrGtt88cgwpump', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), '9Sg4bSFp53g1Vjwft2NpALa2iPfQBAXEBPtfW78kULpo');
});
