/**
 * @author Ramprasad
 * finance.test.ts — unit tests for the demo finance engine (service).
 * Run: npm test (node:test via tsx; Node >= 20).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { financeSummary, financeRecommendation, formatAmount } from '../src/finance/index.js';

const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BAD = '0xnot-an-address';

test('summary is address-seeded and stable', () => {
  const a = financeSummary(ADDR);
  const b = financeSummary(ADDR);
  assert.equal(a.address, ADDR.toLowerCase());
  assert.deepEqual(a.savings, b.savings, 'same address -> same savings');
  assert.deepEqual(a.reputation, b.reputation, 'same address -> same reputation');
  assert.equal(a.model, 'aegis-finance-demo-v0');
  assert.match(a.disclaimer, /DEMO/);
});

test('summary carries all finance surfaces', () => {
  const s = financeSummary(ADDR);
  assert.equal(s.savings.open, true);
  assert.ok(s.savings.balance > 0n, 'demo balance present');
  assert.equal(s.chit.members.length, 3);
  assert.equal(s.chit.poolEnded, false);
  assert.equal(s.loans.length, 1);
  assert.equal(s.loans[0].status, 'active');
  assert.equal(s.gold.status, 'minted');
  assert.equal(s.gold.grams, 10n);
  assert.ok(s.reputation.creditScoreBps >= 5_000n, 'baseline credit score');
});

test('recommendations return at least no_action', () => {
  const r = financeRecommendation(ADDR);
  assert.ok(Array.isArray(r.recommendations));
  assert.ok(r.recommendations.length >= 1);
  const last = r.recommendations[r.recommendations.length - 1];
  assert.equal(last.action, 'no_action');
});

test('invalid address throws', () => {
  assert.throws(() => financeSummary(BAD), /invalid address/);
  assert.throws(() => financeSummary(undefined), /invalid address/);
  assert.throws(() => financeRecommendation(BAD), /invalid address/);
});

test('formatAmount is human readable', () => {
  assert.equal(formatAmount(1_000_000_000_000_000_000_000n), '1,000 vUSD');
});