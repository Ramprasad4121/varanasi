/**
 * @author Ramprasad
 * pricing.test.ts — paid-route table includes jobs and fails closed on unknowns.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRICE_TABLE, priceFor } from '../src/pricing.js';

test('jobs is a paid route at $0.01', () => {
  const jobs = priceFor('/v1/jobs');
  assert.equal(jobs.usd, '$0.01');
  assert.equal(jobs.hbarTinybars, '1000000');
  assert.ok(PRICE_TABLE.some((p) => p.route === '/v1/jobs'));
});

test('priceFor fails closed on unknown routes', () => {
  assert.throws(() => priceFor('/v1/ghost' as never), /Unknown paid route/);
});
