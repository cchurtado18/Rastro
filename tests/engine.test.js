// Engine tests. Run with `npm test`. No network: every transaction here is hand-built.
import test from "node:test";
import assert from "node:assert/strict";
import {
  WSOL, USDT_MINT, followAnalyze, followNotTrade, followHubKind, followScore, followMove, followConvergences,
  followDetector, followMergeGraph, followPerformance, followAta, isSolAddress, extractBuyers, TOKEN22_PROGRAM,
} from "../src/engine.js";
import { followCollapse, followLayout, followTag } from "../src/follow-model.js";

const ME = "MeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMeMe11";
const MEME = "MemeCoinAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
let n = 0;
// One enhanced transaction as Helius returns it, reduced to the fields the engine reads
function tx({ ts = 1000, wallet = ME, sol = 0, tokens = {}, native = [], moved = [], type = "TRANSFER" }) {
  return {
    signature: `sig${++n}`, timestamp: ts, slot: ts, type, feePayer: wallet, transactionError: null,
    nativeTransfers: native.map(([from, to, amount]) => ({ fromUserAccount: from, toUserAccount: to, amount: Math.round(amount * 1e9) })),
    tokenTransfers: moved.map(([from, to, mint, tokenAmount]) => ({ fromUserAccount: from, toUserAccount: to, mint, tokenAmount })),
    accountData: [
      { account: wallet, nativeBalanceChange: Math.round(sol * 1e9), tokenBalanceChanges: [] },
      ...Object.entries(tokens).map(([mint, amount]) => ({
        account: `ata-${mint}`, nativeBalanceChange: 0,
        tokenBalanceChanges: [{ userAccount: wallet, mint, rawTokenAmount: { tokenAmount: String(Math.round(amount * 1e6)), decimals: 6 } }],
      })),
    ],
  };
}

test("una compra hecha con bot (etiquetada TRANSFER) se lee como compra, no como envío", () => {
  const an = followAnalyze([tx({ sol: -1.01, tokens: { [MEME]: 5000 }, native: [[ME, "pool", 1], [ME, "fee", 0.01]] })], ME);
  assert.equal(an.trades.length, 1);
  assert.deepEqual([an.trades[0].side, an.trades[0].mint, Math.round(an.trades[0].sol * 100)], ["buy", MEME, 101]);
  assert.equal(an.flows.size, 0, "el SOL que va al pool no es dinero enviado a alguien");
});

test("venta, envío real y polvo", () => {
  const an = followAnalyze([
    tx({ ts: 10, sol: 2.5, tokens: { [MEME]: -5000 } }),
    tx({ ts: 20, sol: -3.0001, native: [[ME, "Friend", 3]] }),
    tx({ ts: 30, sol: -0.0101, native: [[ME, "Tip", 0.01]] }),
    tx({ ts: 40, sol: -0.004, tokens: { [MEME]: 10 } }),
  ], ME);
  assert.deepEqual(an.trades.map((t) => t.side), ["sell"], "la compra de 0.004 SOL es polvo");
  assert.deepEqual([...an.flows.keys()], ["Friend"], "0.01 SOL es propina, no un envío");
  assert.equal(an.flows.get("Friend").out, 3);
});

test("SOL envuelto cuenta como SOL", () => {
  const an = followAnalyze([tx({ sol: -0.001, tokens: { [WSOL]: -2, [MEME]: 900 } })], ME);
  assert.equal(an.trades.length, 1);
  assert.equal(Math.round(an.trades[0].sol * 1000), 2001);
});

test("un USDT falso que llega con un envío se lee como el envío que era", () => {
  const fakeUsdt = USDT_MINT.slice(0, 6) + "x".repeat(38);
  const an = followAnalyze([tx({ sol: 3, tokens: { [fakeUsdt]: 100 }, native: [["Sender", ME, 3]] })], ME);
  assert.equal(an.trades.length, 0);
  assert.equal(an.flows.get("Sender").in, 3);
});

test("comprar una estable o SOL en staking no es trading ni un envío", () => {
  const an = followAnalyze([tx({ sol: -5, tokens: { JitoMint: 4.4 }, native: [[ME, "pool", 5]] })], ME, new Map([["JitoMint", "park"]]));
  assert.equal(an.trades.length, 0);
  assert.equal(an.flows.size, 0);
});

test("pasar tokens a otra wallet sin recibir nada queda como enlace", () => {
  const an = followAnalyze([tx({ sol: -0.00001, tokens: { [MEME]: -700 }, moved: [[ME, "Other", MEME, 700]] })], ME);
  assert.equal(an.trades.length, 0);
  assert.equal(an.flows.get("Other").tok, 1);
});

test("imitaciones, estables y memecoins que solo comparten símbolo", () => {
  assert.equal(followNotTrade(USDT_MINT.slice(0, 6) + "y".repeat(38), {}), "fake");
  assert.equal(followNotTrade("OtherMintOtherMintOtherMintOtherMintOther11", { symbol: "USDT", name: "Tether USD" }), "fake");
  assert.equal(followNotTrade("OtherMintOtherMintOtherMintOtherMintOther11", { symbol: "USDC", name: "FatCatBatRatWifHat" }), null);
  assert.equal(followNotTrade("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", { symbol: "JitoSOL", name: "Jito Staked SOL" }), "park");
  assert.equal(followNotTrade(MEME, { symbol: "MEME", name: "Meme" }), null);
});

test("servicio con cientos de movimientos = exchange; muchas contrapartes a ritmo humano = distribuidor", () => {
  const flows = (k) => new Map(Array.from({ length: k }, (_, i) => [`w${i}`, { addr: `w${i}`, nIn: 0, nOut: 1 }]));
  assert.equal(followHubKind({ flows: flows(40), n: 100, firstTs: 0, lastTs: 3600, trades: [] }), "exchange");
  assert.equal(followHubKind({ flows: flows(9), n: 100, firstTs: 0, lastTs: 3 * 86400, trades: [] }), "distributor");
  assert.equal(followHubKind({ flows: flows(3), n: 40, firstTs: 0, lastTs: 3 * 86400, trades: [] }), null);
  const heavyTrader = { flows: flows(2), n: 100, firstTs: 0, lastTs: 3600, trades: Array(80).fill({}) };
  assert.equal(followHubKind(heavyTrader), null, "mucho ritmo pero casi todo son compras: es alguien que tradea");
});

test("puntaje: cada punto tiene su razón, y haber tradeado antes de recibir resta", () => {
  const direct = followScore({ side: "out", depth: 1, recv: 6, back: 1, buys: 12, overlap: 3, recvTs: 100, lastBuyTs: 300, firstBuyTs: 200 }, { rootLastBuyTs: 50 });
  assert.ok(direct.score >= 90);
  assert.equal(direct.why.length, 5);
  const paid = followScore({ side: "out", depth: 2, recv: 2, buys: 5, recvTs: 1000, firstBuyTs: 10, lastBuyTs: 2000 }, { rootLastBuyTs: 3000 });
  assert.equal(paid.con.length, 1);
  assert.ok(paid.score < 35);
});

test("mudanza: recibió su SOL, compró después y más reciente que sus wallets", () => {
  const person = { root: "R", aliases: [], trades: [{ side: "buy", wallet: "R", ts: 100 }] };
  const node = { addr: "N", role: "trader", side: "out", depth: 1, buys: 3, recvTs: 150, firstBuyTs: 160, lastBuyTs: 400 };
  assert.equal(followMove(person, [node])?.addr, "N");
  assert.equal(followMove({ ...person, trades: [{ side: "buy", wallet: "R", ts: 500 }] }, [node]), null, "la raíz compró más reciente");
  assert.equal(followMove(person, [{ ...node, depth: 2, firstBuyTs: 20 }]), null, "pasando por un puente, ya tradeaba antes de recibir");
  assert.equal(followMove(person, [{ ...node, viaHub: true }]), null, "vía exchange con varias coincidencias no adivina");
  assert.equal(followMove(person, [{ ...node, viaHub: true, single: true }])?.addr, "N");
});

test("coincidencias: personas distintas, dentro de la ventana, sin repetir aviso", () => {
  const buy = (name, wallet, ts, sig) => ({ name, wallet, mint: MEME, ts, sol: 1, sig });
  assert.equal(followConvergences([buy("A", "a1", 0, "1"), buy("B", "b1", 1700, "2")]).length, 1);
  assert.equal(followConvergences([buy("A", "a1", 0, "1"), buy("B", "b1", 1900, "2")]).length, 0, "fuera de 30 min");
  assert.equal(followConvergences([buy("A", "a1", 0, "1"), buy("A", "a2", 60, "2")]).length, 0, "una persona con dos wallets cuenta una vez");
  const d = followDetector();
  assert.equal(d.push(buy("A", "a1", 0, "1"), 100), null);
  assert.equal(d.push(buy("B", "b1", 60, "2"), 100).people.length, 2);
  assert.equal(d.push(buy("B", "b1", 60, "2"), 100), null, "la misma compra no avisa dos veces");
  assert.equal(d.push(buy("C", "c1", 90, "3"), 100).people.length, 3, "avisa de nuevo cuando se suma una tercera");
  const seeded = followDetector();
  seeded.seed([buy("A", "a1", 0, "1"), buy("B", "b1", 60, "2")]);
  assert.equal(seeded.push(buy("A", "a1", 70, "9"), 100), null, "lo que ya existía al arrancar no avisa");
});

test("el mapa se acumula entre escaneos y suelta lo viejo", () => {
  const now = 1_000_000, day = 86400;
  const prev = {
    nodes: [{ addr: "R", role: "root" }, { addr: "A", role: "bridge", side: "out", parent: "R", seenAt: now - day },
      { addr: "B", role: "trader", side: "out", parent: "A", seenAt: now - day }, { addr: "Old", role: "trader", side: "out", parent: "R", seenAt: now - 9 * day }],
    edges: [{ from: "R", to: "A", sol: 5 }, { from: "A", to: "B", sol: 4 }, { from: "R", to: "Old", sol: 1 }],
  };
  const merged = followMergeGraph(prev, { nodes: [{ addr: "R", role: "root" }, { addr: "C", role: "watch", side: "out", parent: "R" }], edges: [{ from: "R", to: "C", sol: 2 }] }, now);
  assert.deepEqual(merged.nodes.map((x) => x.addr).sort(), ["A", "B", "C", "R"]);
  assert.equal(merged.nodes.find((x) => x.addr === "B").kept, true);
  assert.equal(merged.edges.length, 3);
  const cut = followMergeGraph(prev, { nodes: [{ addr: "R", role: "root" }, { addr: "A", role: "exchange", side: "out", parent: "R" }], edges: [{ from: "R", to: "A", sol: 5 }] }, now);
  assert.ok(!cut.nodes.some((x) => x.addr === "B"), "si ahora A es un exchange, lo que colgaba de A se suelta");
});

test("rendimiento: realizado, abierto con precio y aciertos", () => {
  const t = (side, mint, amount, sol, ts) => ({ side, mint, amount, sol, ts });
  const p = followPerformance([
    t("buy", "W", 100, 1, 10), t("sell", "W", 100, 3, 50),      // closed, +2
    t("buy", "L", 100, 2, 10), t("sell", "L", 95, 0.5, 30),     // closed (≥90% sold), about −1.4
    t("buy", "O", 100, 1, 10),                                  // open, price doubles it
    t("sell", "X", 50, 9, 10),                                  // bought before the window: left out
  ], { O: 0.02 });
  assert.equal(p.closed, 2);
  assert.equal(p.wins, 1);
  assert.equal(p.open, 1);
  assert.equal(Math.round(p.realized * 100), 60);
  assert.equal(Math.round(p.unrealized * 100), 100);
  assert.equal(p.medianHold, 40);
});

test("Cazar: un comprador cuenta aunque Helius no etiquete la compra como swap", () => {
  const buy = (wallet, ts, type) => tx({ ts, wallet, type, native: [[wallet, "pool", 1]], moved: [["pool", wallet, MEME, 1000]] });
  const txs = [buy("Early", 100, "TRANSFER"), buy("Swapper", 120, "SWAP"), buy("Late", 9000, "TRANSFER"),
    tx({ ts: 130, wallet: "Sender", moved: [["Sender", "Gifted", MEME, 5]] })];
  assert.deepEqual([...extractBuyers(txs, MEME, 100, 3700, 0.5e9, true)].sort(), ["Early", "Swapper"]);
});

test("cuenta de token (ATA) calculada igual que en la cadena, Token-2022 incluido", async () => {
  const ata = await followAta("AxYYjhddAr6pCz7CUhtNh5fgTQocKm2jzaaGKxu14CU7", "Bp5PCTcWrwjV9Sn87oJPCPEbqogDeXuetNaWDUT9pump", TOKEN22_PROGRAM);
  assert.equal(ata, "giTcxhCi6WBQnupY3Dvv2UXgws4aMRVZmUXWAhFim2u");
  assert.equal(isSolAddress(ata), true);
  assert.equal(isSolAddress("no-es-una-wallet"), false);
});

test("mapa: varios exchanges sin rastro bajo la misma wallet se dibujan como uno", () => {
  const graph = {
    nodes: [{ addr: "R", role: "root", side: "root", depth: 0 }, { addr: "Br", role: "bridge", side: "out", depth: 1, parent: "R", recv: 9 },
      ...["E1", "E2", "E3"].map((addr, i) => ({ addr, role: "exchange", side: "out", depth: 2, parent: "Br", recv: 3 - i, lost: true }))],
    edges: [{ from: "R", to: "Br", sol: 9 }, { from: "Br", to: "E1", sol: 3 }, { from: "Br", to: "E2", sol: 2 }, { from: "Br", to: "E3", sol: 1 }],
  };
  const shown = followCollapse(graph);
  assert.equal(shown.nodes.length, 3);
  const head = shown.nodes.find((x) => x.members);
  assert.deepEqual(head.members, ["E1", "E2", "E3"]);
  assert.equal(shown.edges.find((e) => e.to === "E1").sol, 6);
  assert.equal(followTag(head), "3 exchanges · sin rastro");
  const layout = followLayout(shown, "layers", new Map(), "Ana");
  assert.equal(layout.P.size, 3);
  assert.ok(layout.P.get("E1").x > layout.P.get("Br").x && layout.P.get("Br").x > layout.P.get("R").x, "el dinero fluye de izquierda a derecha");
});
