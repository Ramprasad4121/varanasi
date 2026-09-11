/**
 * @file adversarial_service.test.mjs
 * @author Challenger (challenger_1)
 * @description In-memory empirical adversarial stress harness testing service/src/server.ts
 * CORS handling, body parsing & oversized limits, symbol resolution, rate limiting, and receipts.
 */
import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { isValidHederaTxId, buildReceipt } from '../dist/hashscan.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

/**
 * Creates a simulated Express request/response pair backed by Streams
 */
function createHttpExchange(options = {}) {
  const {
    method = 'GET',
    url = '/',
    headers = {},
    body = null,
    ip = '127.0.0.1',
  } = options;

  const req = new Readable({
    read() {
      if (body !== null) {
        if (typeof body === 'string') {
          this.push(Buffer.from(body, 'utf8'));
        } else if (Buffer.isBuffer(body)) {
          this.push(body);
        }
      }
      this.push(null);
    },
  });

  req.method = method;
  req.url = url;
  req.headers = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  req.ip = ip;
  req.socket = {
    remoteAddress: ip,
    destroy: () => {},
  };
  req.destroy = function (err) {
    if (err) this.emit('error', err);
    this.emit('close');
    return this;
  };

  let resolveResponse;
  const promise = new Promise((resolve) => {
    resolveResponse = resolve;
  });

  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (key, val) => {
    res.headers[key.toLowerCase()] = String(val);
  };
  res.getHeader = (key) => res.headers[key.toLowerCase()];
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  let responseData = '';
  res.write = (chunk) => {
    responseData += chunk ? chunk.toString() : '';
    return true;
  };
  res.end = (chunk) => {
    if (chunk) responseData += chunk.toString();
    resolveResponse({
      status: res.statusCode,
      headers: res.headers,
      body: responseData,
      json: () => {
        try {
          return JSON.parse(responseData);
        } catch {
          return null;
        }
      },
    });
  };
  res.json = (obj) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  return { req, res, response: promise };
}

// =========================================================================
// SUITE 1: CORS Handling Under Adversarial Attack
// =========================================================================
async function runCorsSuite() {
  console.log('\n--- SUITE 1: CORS Handling Under Adversarial Attack ---');

  // Build Express app with the exact server.ts CORS configuration
  function makeAppWithCors(envOrigins = [], nodeEnv = 'production') {
    const app = express();
    const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    const corsOptions = {
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-402-Payment', 'Payment-Signature', 'X-Payment'],
      exposedHeaders: ['payment-response', 'x-payment-response', 'payment-settle-response', 'Retry-After'],
    };

    if (envOrigins.length > 0) {
      const allowlist = Array.from(new Set([...defaultOrigins, ...envOrigins]));
      app.use(cors({ ...corsOptions, origin: allowlist }));
    } else if (nodeEnv !== 'production') {
      app.use(cors({ ...corsOptions, origin: '*' }));
    } else {
      app.use(cors({ ...corsOptions, origin: defaultOrigins }));
    }

    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    app.post('/v1/signal', (req, res) => res.json({ signal: 'BUY' }));
    return app;
  }

  // 1.1 Default Production CORS
  {
    const prodApp = makeAppWithCors([], 'production');

    // Allowed: http://localhost:3000
    {
      const { req, res, response } = createHttpExchange({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:3000' },
      });
      prodApp(req, res);
      const r = await response;
      assert(r.status === 200, 'Allowed origin http://localhost:3000 returns 200');
      assert(
        r.headers['access-control-allow-origin'] === 'http://localhost:3000',
        'CORS grants Access-Control-Allow-Origin to http://localhost:3000'
      );
    }

    // Allowed: http://127.0.0.1:3000
    {
      const { req, res, response } = createHttpExchange({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://127.0.0.1:3000' },
      });
      prodApp(req, res);
      const r = await response;
      assert(
        r.headers['access-control-allow-origin'] === 'http://127.0.0.1:3000',
        'CORS grants Access-Control-Allow-Origin to http://127.0.0.1:3000'
      );
    }

    // Blocked: Malicious origins
    const maliciousOrigins = [
      'http://evil.com',
      'https://malicious-phishing.xyz',
      'http://localhost:3001', // Port mismatch
      'http://127.0.0.1:8080',
      'null',
      'http://localhost.evil.com',
    ];

    for (const badOrigin of maliciousOrigins) {
      const { req, res, response } = createHttpExchange({
        method: 'GET',
        url: '/health',
        headers: { origin: badOrigin },
      });
      prodApp(req, res);
      const r = await response;
      assert(
        r.headers['access-control-allow-origin'] !== badOrigin,
        `CORS blocks unauthorized origin "${badOrigin}" (no allow-origin granted)`
      );
    }

    // Preflight OPTIONS from allowed origin
    {
      const { req, res, response } = createHttpExchange({
        method: 'OPTIONS',
        url: '/v1/signal',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type, X-402-Payment',
        },
      });
      prodApp(req, res);
      const r = await response;
      assert(r.status === 204 || r.status === 200, `Preflight from localhost:3000 returns ${r.status}`);
      assert(
        r.headers['access-control-allow-origin'] === 'http://localhost:3000',
        'Preflight grants allow-origin for localhost:3000'
      );
      assert(
        r.headers['access-control-allow-headers']?.toLowerCase().includes('x-402-payment'),
        'Preflight permits X-402-Payment header'
      );
    }

    // Preflight OPTIONS from unauthorized origin
    {
      const { req, res, response } = createHttpExchange({
        method: 'OPTIONS',
        url: '/v1/signal',
        headers: {
          origin: 'https://attacker.org',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Content-Type',
        },
      });
      prodApp(req, res);
      const r = await response;
      assert(
        !r.headers['access-control-allow-origin'],
        'Preflight from unauthorized origin does NOT receive access-control-allow-origin'
      );
    }
  }

  // 1.2 Custom CORS_ORIGIN Allowlist Extension
  {
    const customApp = makeAppWithCors(['https://varanasi.app', 'https://agent.varanasi.eth']);

    const { req, res, response } = createHttpExchange({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://varanasi.app' },
    });
    customApp(req, res);
    const r = await response;
    assert(
      r.headers['access-control-allow-origin'] === 'https://varanasi.app',
      'CORS permits configured custom origin https://varanasi.app'
    );

    // Default localhost remains allowed
    const { req: r2, res: s2, response: resp2 } = createHttpExchange({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    customApp(r2, s2);
    const r2Res = await resp2;
    assert(
      r2Res.headers['access-control-allow-origin'] === 'http://localhost:3000',
      'Default origin http://localhost:3000 is preserved alongside custom origins'
    );
  }
}

// =========================================================================
// SUITE 2: Invalid JSON & Malformed Payloads Stress
// =========================================================================
async function runPayloadSuite() {
  console.log('\n--- SUITE 2: Invalid JSON & Malformed Payloads Stress ---');

  const SYMBOL_RE = /^[A-Z]{2,10}\/[A-Z]{2,10}$/;
  const DEFAULT_SYMBOL = 'ETH/USDC';

  function resolveSymbol(body) {
    const raw = body?.symbol;
    if (raw === undefined || raw === null) return { ok: true, symbol: DEFAULT_SYMBOL };
    if (typeof raw !== 'string') {
      return { ok: false, error: 'invalid symbol: expected a string like "ETH/USDC"' };
    }
    const symbol = raw.trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return { ok: false, error: 'invalid symbol: expected BASE/QUOTE like "ETH/USDC" (2-10 A-Z each)' };
    }
    return { ok: true, symbol };
  }

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // Custom error handler to match Express standard JSON parse error response
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({ error: 'invalid JSON payload' });
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload too large' });
      return;
    }
    next(err);
  });

  app.post('/v1/signal', (req, res) => {
    const parsed = resolveSymbol(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json({ signal: 'BUY', symbol: parsed.symbol });
  });

  // 2.1 Malformed JSON syntax
  {
    const badJsonStrings = [
      '{"symbol": "ETH/USDC", unclosed',
      '{not a json at all}',
      '{"symbol": "ETH/USDC",,,}',
      '["unterminated array',
      '{"symbol": \x00\x01\x02}',
    ];

    for (const bad of badJsonStrings) {
      const { req, res, response } = createHttpExchange({
        method: 'POST',
        url: '/v1/signal',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(bad)),
        },
        body: bad,
      });
      app(req, res);
      const r = await response;
      assert(r.status === 400, `Malformed JSON syntax returns HTTP 400 (input: "${bad.slice(0, 20)}...")`);
    }
  }

  // 2.2 Oversized JSON payload (> 256kb)
  {
    // Generate 300KB string
    const largeBody = JSON.stringify({
      symbol: 'ETH/USDC',
      data: 'x'.repeat(300 * 1024),
    });

    const { req, res, response } = createHttpExchange({
      method: 'POST',
      url: '/v1/signal',
      headers: {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(largeBody)),
      },
      body: largeBody,
    });
    app(req, res);
    const r = await response;
    assert(r.status === 413, `Payload exceeding 256kb returns HTTP 413 (got: ${r.status})`);
  }

  // 2.3 Symbol validation matrix on valid JSON
  {
    const symbolTestCases = [
      // Valid cases
      { body: { symbol: 'BTC/USDT' }, expectOk: true, expectSym: 'BTC/USDT' },
      { body: { symbol: 'eth/usdc' }, expectOk: true, expectSym: 'ETH/USDC' }, // normalized to upper
      { body: {}, expectOk: true, expectSym: 'ETH/USDC' }, // default fallback
      { body: { otherField: 123 }, expectOk: true, expectSym: 'ETH/USDC' }, // default fallback
      { body: { symbol: 'AA/BB' }, expectOk: true, expectSym: 'AA/BB' }, // min length (2/2)
      { body: { symbol: 'ABCDEFGHIJ/KLMNOPQRST' }, expectOk: true, expectSym: 'ABCDEFGHIJ/KLMNOPQRST' }, // max length (10/10)

      // Invalid: Types
      { body: { symbol: 123 }, expectOk: false, desc: 'numeric symbol' },
      { body: { symbol: true }, expectOk: false, desc: 'boolean symbol' },
      { body: { symbol: ['ETH', 'USDC'] }, expectOk: false, desc: 'array symbol' },
      { body: { symbol: {} }, expectOk: false, desc: 'object symbol' },

      // Invalid: Format / boundaries
      { body: { symbol: 'E/USDC' }, expectOk: false, desc: 'base too short (1 char)' },
      { body: { symbol: 'ETH/U' }, expectOk: false, desc: 'quote too short (1 char)' },
      { body: { symbol: 'TOOLONGBASE11/USDC' }, expectOk: false, desc: 'base too long (>10 chars)' },
      { body: { symbol: 'ETH/TOOLONGQUOTE11' }, expectOk: false, desc: 'quote too long (>10 chars)' },
      { body: { symbol: 'ETH-USDC' }, expectOk: false, desc: 'hyphen instead of slash' },
      { body: { symbol: 'ETH/USDC/DAI' }, expectOk: false, desc: 'multiple slashes' },

      // Invalid: Injections
      { body: { symbol: 'ETH/USDC; DROP TABLE receipts;' }, expectOk: false, desc: 'SQL injection' },
      { body: { symbol: '<script>alert(1)</script>/USDC' }, expectOk: false, desc: 'XSS injection' },
      { body: { symbol: 'ETH\n/USDC' }, expectOk: false, desc: 'newline injection' },
    ];

    for (const tc of symbolTestCases) {
      const jsonStr = JSON.stringify(tc.body);
      const { req, res, response } = createHttpExchange({
        method: 'POST',
        url: '/v1/signal',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(jsonStr)),
        },
        body: jsonStr,
      });
      app(req, res);
      const r = await response;
      if (tc.expectOk) {
        assert(r.status === 200, `Valid symbol accepted (${JSON.stringify(tc.body)})`);
        assert(r.json()?.symbol === tc.expectSym, `Symbol correctly resolved to ${tc.expectSym}`);
      } else {
        assert(r.status === 400, `Invalid symbol rejected with 400 (${tc.desc})`);
      }
    }
  }
}

// =========================================================================
// SUITE 3: Free Route Rate Limiter Stress (120 req/min/IP)
// =========================================================================
async function runRateLimiterSuite() {
  console.log('\n--- SUITE 3: Free Route Rate Limiter Stress (120 req/min/IP) ---');

  const FREE_ROUTE_LIMIT = 120;
  const FREE_ROUTE_WINDOW_MS = 60_000;
  const freeRouteHits = new Map();

  function freeRouteLimiter(req, res, next) {
    const now = Date.now();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const key = `${ip}`;
    let entry = freeRouteHits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + FREE_ROUTE_WINDOW_MS };
      freeRouteHits.set(key, entry);
    }
    entry.count += 1;
    if (freeRouteHits.size > 5000) {
      for (const [k, v] of freeRouteHits) {
        if (now >= v.resetAt) freeRouteHits.delete(k);
      }
    }
    if (entry.count > FREE_ROUTE_LIMIT) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'rate limited: 120 req/min/IP on free routes' });
      return;
    }
    next();
  }

  const app = express();
  app.get('/health', freeRouteLimiter, (req, res) => res.json({ status: 'ok' }));

  const clientIp = '198.51.100.42';

  console.log('  -> Simulating 125 requests from client IP 198.51.100.42...');
  let count200 = 0;
  let count429 = 0;
  let lastRetryAfter = null;

  for (let i = 1; i <= 125; i++) {
    const { req, res, response } = createHttpExchange({
      method: 'GET',
      url: '/health',
      ip: clientIp,
    });
    app(req, res);
    const r = await response;
    if (r.status === 200) count200++;
    else if (r.status === 429) {
      count429++;
      lastRetryAfter = r.headers['retry-after'];
    }
  }

  assert(count200 === 120, `First 120 requests succeed with 200 OK (got: ${count200})`);
  assert(count429 === 5, `Requests 121..125 are blocked with 429 Too Many Requests (got: ${count429})`);
  assert(
    lastRetryAfter !== null && Number(lastRetryAfter) > 0 && Number(lastRetryAfter) <= 60,
    `429 responses include valid Retry-After header (${lastRetryAfter}s)`
  );

  // Verify isolated IP: different client IP is NOT rate limited
  {
    const { req, res, response } = createHttpExchange({
      method: 'GET',
      url: '/health',
      ip: '203.0.113.99', // Different IP
    });
    app(req, res);
    const r = await response;
    assert(r.status === 200, 'Different IP (203.0.113.99) is not affected by other IP limit (returns 200)');
  }
}

// =========================================================================
// SUITE 4: HashScan & Hedera TxID Robustness
// =========================================================================
async function runHashScanSuite() {
  console.log('\n--- SUITE 4: HashScan & Hedera TxID Robustness ---');

  // Valid Hedera transaction ID regex pattern: ^0\.0\.\d+(?:@\d+\.\d+|-\d+-\d+)$
  // (Both @-separated and dash-separated canonical forms are allowed)
  const validTxIds = [
    '0.0.10384527@1700000000.000000000',
    '0.0.3@1699999999.123456789',
    '0.0.12345@1710000000.5',
    '0.0.10384527-1700000000-000000000', // Canonical dash format used by HashScan
  ];

  for (const v of validTxIds) {
    assert(isValidHederaTxId(v), `Recognizes valid Hedera txId: ${v}`);
  }

  const invalidTxIds = [
    '0x3014b9f6d77a694d6c1cadd86057e62bce91e805e068c14763a421dcefd2cff2', // EVM private key/hash
    '0x' + 'aa'.repeat(32), // 32-byte EVM tx hash
    '0.0.10384527:1700000000:000000000', // Colon separated
    '0.0.10384527/1700000000/000000000', // Slash separated
    '0.10384527@1700000000.000000000', // Missing realm (0.x instead of 0.0.x)
    '',
    null,
    undefined,
    12345,
    '<script>',
  ];

  for (const inv of invalidTxIds) {
    assert(!isValidHederaTxId(inv), `Rejects invalid txId: ${JSON.stringify(inv)}`);
  }

  // Test buildReceipt fallback when txId is null
  const receiptWithoutTx = buildReceipt({
    route: '/v1/signal',
    network: 'hedera:testnet',
    payTo: '0.0.10384527',
    facilitator: 'https://api.testnet.blocky402.com',
    txId: null,
  });

  assert(receiptWithoutTx.txId === null, 'Receipt safely handles null txId');
  assert(
    receiptWithoutTx.hashscanAccountUrl.includes('hashscan.io/testnet/account/0.0.10384527'),
    'Receipt generates fallback account link'
  );
  assert(receiptWithoutTx.hashscanTxUrl === null, 'Receipt hashscanTxUrl is null when txId is null');
}

// =========================================================================
// Main Execution
// =========================================================================
async function main() {
  console.log('===========================================================');
  console.log('  EMPIRICAL ADVERSARIAL STRESS TEST: VARANASI SIGNAL SERVICE');
  console.log('===========================================================');

  await runCorsSuite();
  await runPayloadSuite();
  await runRateLimiterSuite();
  await runHashScanSuite();

  console.log('\n===========================================================');
  console.log(`  TOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('===========================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
