/**
 * @author Ramprasad
 * @module server — varanasi alpha-signal service: live x402-gated API on Hedera testnet.
 *
 * Paid routes (x402 `exact` scheme, verified via facilitator):
 *   POST /v1/signal  premium alpha: {signal, confidence, features, txHint}
 *   POST /v1/score   cheaper risk features: {riskScore, riskBand, factors}
 *
 * Free routes:
 *   GET  /health     liveness + config snapshot (no secrets)
 *   GET  /ready      readiness (receipt store + config ok)
 *   GET  /version    build version + git sha + uptime
 *   GET  /openapi.json machine-readable route catalog
 *   GET  /402-info   payment requirements preview for agent builders
 *   GET  /v1/receipts recent paid-request receipts (file-backed, data/receipts.json, last 100)
 *   GET  /v1/finance         demo community-finance portfolio by address (?address=0x...)
 *   GET  /v1/finance/summary  same, forced to summary mode
 *   GET  /v1/finance/recommend demo agent recommendations by address (?address=0x...)
 *
 * Flow: client POSTs without payment -> 402 + payment requirements ->
 * client signs a Hedera TransferTransaction -> retries with payment ->
 * facilitator /verify passes -> handler runs, facilitator settles async.
 *
 * Production hardening: helmet headers, gzip, request ids + access logs,
 * trust-proxy (correct req.ip behind Render/Fly/Vercel), 120 req/min/IP on
 * free routes, JSON 404 + error handler, graceful shutdown, validated config
 * (see src/config.ts — fails fast on bad env).
 *
 * Env deps: PORT, NODE_ENV, HEDERA_NETWORK (testnet|mainnet),
 * HEDERA_SERVICE_ACCOUNT_ID (required receiver), X402_FACILITATOR_URL /
 * X402_{TESTNET,MAINNET}_FACILITATOR_URL (via facilitatorUrlFor in x402.ts),
 * CORS_ORIGIN, GIT_SHA, SERVICE_VERSION.
 */
import { config } from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { paymentMiddleware } from '@x402/express';
import { createResourceServer } from './x402.js';
import { loadConfig } from './config.js';
import { accessLog, rateLimit, requestId } from './middleware.js';
import { loadReceipts, recordReceipt } from './store.js';
import {
  PRICE_TABLE,
  acceptsFor,
  priceFor,
  usdcTokenId,
  type HederaNetwork,
  type PaidRoute,
} from './pricing.js';
import { generateSignal, generateScore } from './signal.js';
import { buildReceipt, isValidHederaTxId, type PaymentReceipt } from './hashscan.js';
import { logReceipt as logReceiptToHcs } from './hcs.js';
import { financeSummary, financeRecommendation, type FinanceEndpointMode } from './finance/index.js';
import type { Address } from './finance/types.js';

config();

const cfg = loadConfig();
const PORT = cfg.port;
const NETWORK: HederaNetwork = cfg.network;
const SERVICE_ACCOUNT = cfg.serviceAccount;
const FACILITATOR_URL = cfg.facilitatorUrl;

if (cfg.corsOrigins === '*') {
  console.warn('[cors] CORS_ORIGIN unset — open `*` (non-production only). Set CORS_ORIGIN to restrict.');
} else if ((process.env.CORS_ORIGIN ?? '').trim().length === 0 && cfg.isProduction) {
  console.warn('[cors] CORS_ORIGIN unset in production — allowing default local origins only.');
}

/** File-backed receipt log — last 100 paid requests (data/receipts.json, no secrets stored). */
const receipts: PaymentReceipt[] = loadReceipts();

/**
 * Best-effort extraction of the Hedera txId from the settle response the
 * x402 middleware attaches to the outgoing response headers.
 * Returns null when the middleware version/phase doesn't expose one —
 * the receipt still carries the HashScan account link in that case.
 */
function extractSettleTxId(res: Response): string | null {
  const candidates = ['payment-response', 'x-payment-response', 'payment-settle-response'];
  for (const name of candidates) {
    const raw = res.getHeader(name);
    if (typeof raw !== 'string' || raw.length === 0) continue;
    try {
      const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as unknown;
      const txId =
        typeof decoded === 'object' && decoded !== null
          ? ((decoded as Record<string, unknown>).transactionId ??
            (decoded as Record<string, unknown>).transaction)
          : null;
      if (typeof txId === 'string' && txId.length > 0) return txId;
    } catch {
      // Header isn't base64 JSON in this middleware version — ignore.
    }
  }
  return null;
}

const app = express();
app.disable('x-powered-by');
// Trust the platform proxy (Render/Fly/Vercel) so req.ip + rate limits see
// the real client. Safe: we only use req.ip for rate limiting + logs.
app.set('trust proxy', 1);

app.use(requestId);
app.use(accessLog);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

/** CORS allowlist (validated in config.ts). Paid routes are unaffected. */
if (cfg.corsOrigins === '*') {
  app.use(
    cors({
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-402-Payment', 'Payment-Signature', 'X-Payment'],
      exposedHeaders: ['payment-response', 'x-payment-response', 'payment-settle-response', 'payment-required', 'x-payment-required', 'Retry-After', 'x-request-id'],
      origin: '*',
    }),
  );
} else {
  app.use(
    cors({
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-402-Payment', 'Payment-Signature', 'X-Payment'],
      exposedHeaders: ['payment-response', 'x-payment-response', 'payment-settle-response', 'payment-required', 'x-payment-required', 'Retry-After', 'x-request-id'],
      origin: cfg.corsOrigins,
    }),
  );
}

/** Free-route limiter: 120 req/min/IP → 429 + Retry-After. Paid routes untouched. */
const freeRouteLimiter = rateLimit({ limit: 120, windowMs: 60_000 });
app.use(express.json({ limit: '256kb' }));

/**
 * BigInt-safe JSON serialization: Express 5 uses JSON.stringify internally
 * in res.json(), which throws "Do not know how to serialize a BigInt".
 * The finance types legitimately use bigint (mirrors Solidity uint256).
 * This app-level replacer converts bigint → string in all JSON responses.
 */
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value,
);

/**
 * P2 trust boundary: symbol allowlist. Missing body/symbol keeps the
 * ETH/USDC default; a provided symbol must match BASE/QUOTE (2-10
 * uppercase letters each) or the request fails with 400.
 */
const SYMBOL_RE = /^[A-Z]{2,10}\/[A-Z]{2,10}$/;
const DEFAULT_SYMBOL = 'ETH/USDC';

function resolveSymbol(body: unknown): { ok: true; symbol: string } | { ok: false; error: string } {
  const raw = (body as { symbol?: unknown } | null | undefined)?.symbol;
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

/** P2: pass only allowlisted txIds into receipts — malformed → null. */
function settleTxId(res: Response): string | null {
  const raw = extractSettleTxId(res);
  return isValidHederaTxId(raw) ? raw : null;
}

// ---- x402 payment gate -------------------------------------------------
const resourceServer = createResourceServer(NETWORK);
app.use(
  paymentMiddleware(
    {
      'POST /v1/signal': {
        accepts: acceptsFor('/v1/signal', NETWORK, SERVICE_ACCOUNT),
        description: 'varanasi premium alpha signal (demo model)',
        mimeType: 'application/json',
      },
      'POST /v1/score': {
        accepts: acceptsFor('/v1/score', NETWORK, SERVICE_ACCOUNT),
        description: 'varanasi risk features (demo model)',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

// ---- paid handlers ------------------------------------------------------
app.post('/v1/signal', (req: Request, res: Response) => {
  const parsed = resolveSymbol(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const alpha = generateSignal(parsed.symbol);
  const receipt = buildReceipt({
    route: '/v1/signal',
    network: NETWORK,
    payTo: SERVICE_ACCOUNT,
    facilitator: FACILITATOR_URL,
    txId: settleTxId(res),
  });
  recordReceipt(receipts, receipt);
  res.json({ ...alpha, receipt });
  // Best-effort HCS audit trail — fire-and-forget AFTER the paid response;
  // a failure here never fails the paid request (see src/hcs.ts).
  void logReceiptToHcs({
    route: receipt.route,
    payTo: receipt.payTo,
    txId: receipt.txId,
    amount: priceFor('/v1/signal').usd,
    asset: 'USDC|HBAR',
    servedAt: receipt.servedAt,
  });
});

app.post('/v1/score', (req: Request, res: Response) => {
  const parsed = resolveSymbol(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const score = generateScore(parsed.symbol);
  const receipt = buildReceipt({
    route: '/v1/score',
    network: NETWORK,
    payTo: SERVICE_ACCOUNT,
    facilitator: FACILITATOR_URL,
    txId: settleTxId(res),
  });
  recordReceipt(receipts, receipt);
  res.json({ ...score, receipt });
  // Best-effort HCS audit trail — fire-and-forget AFTER the paid response;
  // a failure here never fails the paid request (see src/hcs.ts).
  void logReceiptToHcs({
    route: receipt.route,
    payTo: receipt.payTo,
    txId: receipt.txId,
    amount: priceFor('/v1/score').usd,
    asset: 'USDC|HBAR',
    servedAt: receipt.servedAt,
  });
});

// ---- free routes ----------------------------------------------------------
app.get('/health', freeRouteLimiter, (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'aegis-signal',
    network: NETWORK,
    facilitator: FACILITATOR_URL,
    receiver: SERVICE_ACCOUNT,
    paidRoutes: PRICE_TABLE.map((p) => p.route),
    receiptsServed: receipts.length,
    port: PORT,
  });
});

app.get('/ready', freeRouteLimiter, (_req: Request, res: Response) => {
  // Readiness: config validated at boot + receipt store readable.
  // No network calls — safe for k8s/Render health checks at any cadence.
  res.json({ ready: true, service: 'aegis-signal', receiptsLoaded: receipts.length });
});

app.get('/version', freeRouteLimiter, (_req: Request, res: Response) => {
  res.json({
    service: 'aegis-signal',
    version: cfg.version,
    gitSha: cfg.gitSha,
    nodeEnv: cfg.nodeEnv,
    network: NETWORK,
    startedAt: cfg.startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.get('/openapi.json', freeRouteLimiter, (_req: Request, res: Response) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'varanasi signal service',
      version: cfg.version,
      description:
        'x402-gated alpha API on Hedera. POST /v1/signal + POST /v1/score are paid ($0.01 / $0.001 USDC or HBAR equiv); everything else is free. Finance routes are simulated demos.',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    paths: {
      '/health': { get: { summary: 'Liveness + config snapshot' } },
      '/ready': { get: { summary: 'Readiness probe' } },
      '/version': { get: { summary: 'Build version + uptime' } },
      '/402-info': { get: { summary: 'Payment requirements preview' } },
      '/v1/signal': { post: { summary: 'Premium alpha signal (x402 paid $0.01)' } },
      '/v1/score': { post: { summary: 'Risk features (x402 paid $0.001)' } },
      '/v1/receipts': { get: { summary: 'Recent paid-request receipts (last 100)' } },
      '/v1/finance': { get: { summary: 'Demo portfolio by address (simulated)' } },
      '/v1/finance/summary': { get: { summary: 'Demo portfolio summary (simulated)' } },
      '/v1/finance/recommend': { get: { summary: 'Demo agent recommendations (simulated)' } },
    },
  });
});

app.get('/402-info', freeRouteLimiter, (_req: Request, res: Response) => {
  const routes: Record<PaidRoute, unknown> = {
    '/v1/signal': undefined,
    '/v1/score': undefined,
  };
  for (const p of PRICE_TABLE) {
    routes[p.route] = {
      scheme: 'exact',
      network: NETWORK,
      payTo: SERVICE_ACCOUNT,
      usdc: { tokenId: usdcTokenId(NETWORK), usdPrice: p.usd },
      hbar: { asset: '0.0.0', amountTinybars: p.hbarTinybars },
      description: p.description,
    };
  }
  res.json({
    facilitator: FACILITATOR_URL,
    facilitatorPinned: FACILITATOR_URL,
    supported: `${FACILITATOR_URL.replace(/\/$/, '')}/supported`,
    verify: `${FACILITATOR_URL.replace(/\/$/, '')}/verify`,
    routes,
    howToPay:
      'POST the route without payment to receive HTTP 402 requirements, sign a Hedera ' +
      'TransferTransaction with an ECDSA key, retry with the payment payload ' +
      '(use @x402/fetch + @x402/hedera on the client — see service/README.md).',
    billingNote:
      'Known behavior (documented, not a bug): request validation (e.g. symbol) ' +
      'runs AFTER x402 settlement, so a malformed request still settles the ' +
      'payment and receives HTTP 400. Send well-formed bodies; validate client-side first.',
  });
});

app.get('/v1/receipts', freeRouteLimiter, (_req: Request, res: Response) => {
  res.json({ count: receipts.length, receipts });
});

// ---- finance (free, demo, address-seeded) --------------------------------

/**
 * Resolve the address query param + endpoint mode. Returns an error string on
 * bad input; otherwise the caller gets { ok: true, address, mode }.
 */
function resolveFinanceRequest(
  query: Record<string, unknown>,
): { ok: true; address: Address; mode: FinanceEndpointMode } | { ok: false; error: string } {
  const raw = query.address;
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return { ok: false, error: 'invalid address: expected 0x + 40 hex chars' };
  }
  const mode: FinanceEndpointMode =
    (query.mode === 'recommend' || query.mode === 'summary') ? query.mode : 'summary';
  return { ok: true, address: raw.toLowerCase() as Address, mode };
}

app.get(
  '/v1/finance',
  freeRouteLimiter,
  (req: Request<Record<string, never>, unknown, unknown, Record<string, unknown>>, res: Response) => {
    const parsed = resolveFinanceRequest(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const body =
      parsed.mode === 'recommend'
        ? financeRecommendation(parsed.address)
        : financeSummary(parsed.address);
    res.json(body);
  },
);

app.get(
  '/v1/finance/summary',
  freeRouteLimiter,
  (req: Request, res: Response) => {
    const parsed = resolveFinanceRequest(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(financeSummary(parsed.address));
  },
);

app.get(
  '/v1/finance/recommend',
  freeRouteLimiter,
  (req: Request, res: Response) => {
    const parsed = resolveFinanceRequest(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    res.json(financeRecommendation(parsed.address));
  },
);

// ---- 404 + error handler (JSON, always after routes) -----------------------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const id = (req as Request & { requestId?: string }).requestId ?? '-';
  const message = err instanceof Error ? err.message : 'internal error';
  // Never leak stacks to clients; log the id so operators can correlate.
  console.error(`[http-error] id=${id} ${req.method} ${req.path}: ${message}`);
  if (res.headersSent) return;
  const status =
    typeof (err as { status?: unknown }).status === 'number'
      ? ((err as { status: number }).status as number)
      : 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: 'internal error', requestId: id });
});

const server = app.listen(PORT, () => {
  console.log(`\n🚀 varanasi signal service on http://localhost:${PORT}`);
  console.log(`   Network:     ${NETWORK}`);
  console.log(`   Facilitator: ${FACILITATOR_URL}`);
  console.log(`   Receiver:    ${SERVICE_ACCOUNT}`);
  console.log(`   Env:         ${cfg.nodeEnv} (version ${cfg.version}, sha ${cfg.gitSha})`);
  console.log(`   Paid:  POST /v1/signal ($0.01 USDC or 0.01 HBAR equiv)`);
  console.log(`   Paid:  POST /v1/score  ($0.001 USDC or 0.001 HBAR equiv)`);
  console.log(`   Free:  GET  /health, /ready, /version, /openapi.json, /402-info, /v1/receipts`);
  console.log(`   Free:  GET  /v1/finance?address=0x...  (demo portfolio)`);
  console.log(`   Free:  GET  /v1/finance/recommend?address=0x...  (demo agent recs)\n`);
});

// Production lifecycle: bounded shutdown, no half-open sockets on deploy.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[${signal}] draining HTTP connections…`);
  server.close(() => {
    console.log('[shutdown] closed cleanly.');
    process.exit(0);
  });
  // Hard stop if connections refuse to drain (platforms SIGKILL at ~30s).
  setTimeout(() => {
    console.error('[shutdown] forced exit after 10s drain timeout.');
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
