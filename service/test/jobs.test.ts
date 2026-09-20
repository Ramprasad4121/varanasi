import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJob, listAgents } from '../src/jobs.js';

test('lists 15 live agents', () => {
  const agents = listAgents();
  assert.equal(agents.length, 15);
});

test('runs scout and oracle', () => {
  const scout = createJob('scout', { pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' });
  assert.equal(scout.barPassed, true);
  const oracle = createJob('oracle', { symbol: 'ETH/USDC' });
  assert.equal(oracle.agent, 'oracle');
});

test('rejects unknown agents', () => {
  assert.throws(() => createJob('ghost', {}), /unknown agent/);
});

test('accepts any live id and fails closed on required fields', () => {
  const job = createJob('oracle', { symbol: 'ETH/USDC' });
  assert.equal(job.barPassed, true);
  const miss = createJob('watcher', {});
  assert.equal(miss.barPassed, false);
});

test('oracle fails closed on unknown pairs', () => {
  const eth = createJob('oracle', { symbol: 'ETH/USDC' });
  assert.equal(eth.barPassed, true);
  assert.equal(eth.output.price, 3420.12);
  assert.equal(typeof eth.output.asOf, 'number');
  const doge = createJob('oracle', { symbol: 'DOGE/USD' });
  assert.equal(doge.barPassed, false);
  assert.equal(doge.output.error, 'unknown pair');
  assert.equal(doge.output.price, undefined);
  assert.equal(doge.settled, 'refunded');
});

test('router and trader fail closed on junk pairs', () => {
  const eth = createJob('router', { pair: '1 ETH → USDC' });
  assert.equal(eth.barPassed, true);
  assert.deepEqual(eth.output.path, ['WETH', 'USDC']);
  const sol = createJob('router', { pair: '1000 SOL to PEPE' });
  assert.equal(sol.barPassed, false);
  assert.equal(sol.output.error, 'unknown pair');
  assert.equal(sol.settled, 'refunded');
  const buy = createJob('trader', { order: 'buy 0.5 ETH with USDC' });
  assert.equal(buy.barPassed, true);
  const doge = createJob('trader', { order: 'buy 100 DOGE with USDC' });
  assert.equal(doge.barPassed, false);
  assert.equal(doge.output.error, 'unknown order');
});

test('analyst fails closed on unknown pools', () => {
  const ok = createJob('analyst', { pool: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640' });
  assert.equal(ok.barPassed, true);
  const junk = createJob('analyst', { pool: 'not-a-pool' });
  assert.equal(junk.barPassed, false);
  assert.equal(junk.output.error, 'unknown pool');
  assert.equal(junk.settled, 'refunded');
});
