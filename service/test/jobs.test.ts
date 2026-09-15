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
