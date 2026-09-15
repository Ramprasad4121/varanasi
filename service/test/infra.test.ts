/**
 * @author Ramprasad
 * infra.test.ts — unit tests for production infrastructure: config
 * validation, receipt store atomicity, rate-limit middleware.
 * Run: npm test (node:test via tsx; Node >= 20).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { loadReceipts, recordReceipt, receiptsFile } from '../src/store.js';
import { rateLimit } from '../src/middleware.js';
import type { PaymentReceipt } from '../src/hashscan.js';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    PORT: '4021',
    NODE_ENV: 'test',
    HEDERA_NETWORK: 'testnet',
    HEDERA_SERVICE_ACCOUNT_ID: '0.0.12345',
  };
}

test('loadConfig accepts a valid env', () => {
  const cfg = loadConfig(baseEnv());
  assert.equal(cfg.port, 4021);
  assert.equal(cfg.network, 'hedera:testnet');
  assert.equal(cfg.serviceAccount, '0.0.12345');
  assert.match(cfg.facilitatorUrl, /^https:/);
});

test('loadConfig fails fast on bad env', () => {
  assert.throws(() => loadConfig({ ...baseEnv(), PORT: 'abc' }), /invalid PORT/);
  assert.throws(() => loadConfig({ ...baseEnv(), PORT: '99999' }), /invalid PORT/);
  assert.throws(() => loadConfig({ ...baseEnv(), HEDERA_NETWORK: 'devnet' }), /invalid HEDERA_NETWORK/);
  assert.throws(() => loadConfig({ ...baseEnv(), HEDERA_SERVICE_ACCOUNT_ID: '' }), /required/);
  assert.throws(
    () => loadConfig({ ...baseEnv(), HEDERA_SERVICE_ACCOUNT_ID: 'not-an-account' }),
    /invalid HEDERA_SERVICE_ACCOUNT_ID/,
  );
});

test('loadConfig locks CORS open only outside production', () => {
  const dev = loadConfig({ ...baseEnv(), NODE_ENV: 'development' });
  assert.equal(dev.corsOrigins, '*');
  const prod = loadConfig({ ...baseEnv(), NODE_ENV: 'production' });
  assert.ok(Array.isArray(prod.corsOrigins));
  const listed = loadConfig({
    ...baseEnv(),
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.example.com',
  });
  assert.ok(
    Array.isArray(listed.corsOrigins) && listed.corsOrigins.includes('https://app.example.com'),
  );
});

function receipt(txId: string | null): PaymentReceipt {
  return {
    route: '/v1/signal',
    network: 'hedera:testnet',
    payTo: '0.0.12345',
    facilitator: 'https://x402.org/facilitator',
    txId,
    hashscanTxUrl: null,
    hashscanAccountUrl: 'https://hashscan.io/testnet/account/0.0.12345',
    servedAt: new Date().toISOString(),
  };
}

test('receipt store round-trips atomically and caps at 100', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'varanasi-store-'));
  const file = path.join(dir, 'data', 'receipts.json');
  assert.equal(receiptsFile(dir).endsWith(path.join('data', 'receipts.json')), true);
  assert.deepEqual(loadReceipts(file), []);
  const receipts: PaymentReceipt[] = [];
  for (let i = 0; i < 105; i++) recordReceipt(receipts, receipt(null), file);
  assert.equal(receipts.length, 100);
  const onDisk = JSON.parse(readFileSync(file, 'utf8')) as unknown[];
  assert.equal(onDisk.length, 100);
  assert.deepEqual(loadReceipts(file).length, 100);
});

test('rate limiter allows under budget and 429s over budget', () => {
  const limiter = rateLimit({ limit: 2, windowMs: 60_000 });
  const calls: number[] = [];
  const req = { ip: '127.0.0.1', socket: {} } as never;
  for (let i = 0; i < 3; i++) {
    let status = 200;
    const res = {
      status: (s: number) => ({ json: () => undefined, statusCode: (status = s) }),
      setHeader: () => undefined,
    } as never;
    let nexted = false;
    limiter(req, res, () => {
      nexted = true;
    });
    calls.push(nexted ? 200 : status);
  }
  assert.deepEqual(calls, [200, 200, 429]);
});
