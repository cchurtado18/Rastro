import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGraph, mergeOutgoing, mergeResult } from '../lib/history.js';

const now = Math.floor(Date.now() / 1000);
const H = 3600;

test('el mapa nuevo se suma al anterior en vez de reemplazarlo', () => {
  const prev = { nodes: [{ id: 'A', status: 'active' }, { id: 'X', status: 'watch' }, { id: 'EX', status: 'busy' }],
    edges: [{ from: 'A', to: 'X', sol: 54, ts: now - 50 * H, kind: 'out' }, { from: 'A', to: 'EX', sol: 2, ts: now - 40 * H, kind: 'out' }] };
  const next = { nodes: [{ id: 'A', status: 'old' }, { id: 'B', status: 'active' }], edges: [{ from: 'A', to: 'B', kind: 'history' }] };
  const g = mergeGraph(prev, next, { active: 'B', wallets: ['A', 'B'], now });
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['A', 'B', 'EX', 'X']);
  assert.equal(g.nodes.find((n) => n.id === 'A').status, 'old', 'lo nuevo manda');
  assert.equal(g.nodes.find((n) => n.id === 'X').status, 'watch');
  assert.equal(g.edges.length, 3);
});

test('lo que tiene más de 7 días se suelta', () => {
  const prev = { nodes: [{ id: 'A' }, { id: 'OLD' }], edges: [{ from: 'A', to: 'OLD', sol: 5, ts: now - 8 * 86400, kind: 'out' }] };
  const g = mergeGraph(prev, { nodes: [{ id: 'A', status: 'active' }], edges: [] }, { active: 'A', wallets: ['A'], now });
  assert.deepEqual(g.nodes.map((n) => n.id), ['A']);
  assert.equal(g.edges.length, 0);
});

test('una wallet que era "activa" en el mapa viejo pasa a anterior', () => {
  const prev = { nodes: [{ id: 'A', status: 'active' }, { id: 'B', status: 'current' }], edges: [{ from: 'A', to: 'B', sol: 1, ts: now - H, kind: 'out' }] };
  const g = mergeGraph(prev, { nodes: [{ id: 'C', status: 'active' }], edges: [{ from: 'B', to: 'C', sol: 1, ts: now, kind: 'out' }] }, { active: 'C', wallets: ['A', 'B', 'C'], now });
  assert.equal(g.nodes.find((n) => n.id === 'A').status, 'old');
  assert.equal(g.nodes.find((n) => n.id === 'B').status, 'old');
});

test('envíos: firmas nuevas suman, firmas repetidas no cuentan doble', () => {
  const prev = [{ to: 'X', sol: 10, lastTs: now - H, sigs: ['s1', 's2'] }];
  assert.equal(mergeOutgoing(prev, [{ to: 'X', sol: 3, lastTs: now, sigs: ['s3'] }], now)[0].sol, 13);
  assert.equal(mergeOutgoing(prev, [{ to: 'X', sol: 10, lastTs: now, sigs: ['s2'] }], now)[0].sol, 10);
});

test('sin estado anterior devuelve el resultado tal cual', () => {
  const r = { active: 'A', graph: { nodes: [], edges: [] }, outgoing: [], fundedBy: [] };
  assert.equal(mergeResult(undefined, r, ['A']), r);
});

test('si una wallet resulta ser un depósito, lo que se siguió más allá se suelta', () => {
  const prev = { nodes: [{ id: 'A' }, { id: 'D', status: 'bridge' }, { id: 'X', status: 'watch' }], edges: [{ from: 'A', to: 'D', ts: now, kind: 'out' }, { from: 'D', to: 'X', ts: now, kind: 'out' }] };
  const g = mergeGraph(prev, { nodes: [{ id: 'A', status: 'active' }, { id: 'D', status: 'service' }], edges: [{ from: 'A', to: 'D', ts: now, kind: 'out' }] }, { active: 'A', wallets: ['A'], now });
  assert.deepEqual(g.nodes.map((n) => n.id).sort(), ['A', 'D']);
  assert.equal(g.nodes.find((n) => n.id === 'D').status, 'service');
});
