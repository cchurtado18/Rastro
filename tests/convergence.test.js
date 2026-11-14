import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConvergences, buysFromState, createDetector } from '../lib/convergence.js';

const now = Math.floor(Date.now() / 1000);
const b = (name, mint, ago, sol = 1, sig = `${name}${mint}${ago}`) => ({ name, wallet: name + 'W', mint, ts: now - ago, sol, usd: 0, sig });

test('dos personas compran la misma moneda dentro de la ventana', () => {
  const c = findConvergences([b('Ana', 'M1', 600), b('Beto', 'M1', 100), b('Ana', 'M2', 50)], { windowSec: 1800 });
  assert.equal(c.length, 1);
  assert.equal(c[0].mint, 'M1');
  assert.deepEqual(c[0].people.map((p) => p.name), ['Ana', 'Beto']);
  assert.equal(c[0].spanSec, 500);
  assert.equal(c[0].sol, 2);
});

test('fuera de la ventana no cuenta', () => {
  assert.equal(findConvergences([b('Ana', 'M1', 7200), b('Beto', 'M1', 60)], { windowSec: 1800 }).length, 0);
});

test('la misma persona con dos wallets no es convergencia', () => {
  const x = { ...b('Ana', 'M1', 300), wallet: 'otra' };
  assert.equal(findConvergences([b('Ana', 'M1', 600), x], { windowSec: 1800 }).length, 0);
});

test('elige el grupo más grande dentro de la ventana', () => {
  const c = findConvergences([b('Ana', 'M1', 5000), b('Beto', 'M1', 900), b('Caro', 'M1', 600), b('Dani', 'M1', 100)], { windowSec: 1800 });
  assert.deepEqual(c[0].people.map((p) => p.name), ['Beto', 'Caro', 'Dani']);
});

test('del estado ignora ventas e imitaciones', () => {
  const st = {
    Ana: { active: 'A', recent: [{ side: 'buy', mint: 'M1', ts: now - 100, sol: 1, sig: 's1' }, { side: 'sell', mint: 'M2', ts: now - 50, sol: 1, sig: 's2' }], tokens: {} },
    Beto: { active: 'B', recent: [{ side: 'buy', mint: 'FAKE', ts: now - 80, sol: 1, sig: 's3' }], tokens: { FAKE: { spoof: 'USDT' } } },
  };
  const buys = buysFromState(st);
  assert.deepEqual(buys.map((x) => x.mint), ['M1']);
  assert.equal(buys[0].wallet, 'A');
});

test('detector avisa al llegar a 2 personas, otra vez con la 3ª y nunca repetido', () => {
  const d = createDetector({ windowSec: 1800 });
  d.seed([b('Ana', 'M1', 900)]);
  assert.equal(d.push(b('Ana', 'M9', 10), now), null);
  const c2 = d.push(b('Beto', 'M1', 300), now);
  assert.equal(c2.people.length, 2);
  assert.equal(d.push(b('Beto', 'M1', 300), now), null, 'la misma firma no avisa dos veces');
  assert.equal(d.push(b('Beto', 'M1', 200, 1, 'otra'), now), null, 'otra compra de la misma persona no suma');
  assert.equal(d.push(b('Caro', 'M1', 100), now).people.length, 3);
});

test('detector no avisa coincidencias que ya existían al arrancar', () => {
  const d = createDetector({ windowSec: 1800 });
  d.seed([b('Ana', 'M1', 900), b('Beto', 'M1', 600)]);
  assert.equal(d.push(b('Ana', 'M1', 100, 1, 'nueva'), now), null);
});
