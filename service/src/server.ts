/**
 * AEGIS alpha-signal service — live x402-gated API on Hedera testnet.
 *
 * Paid routes (x402 `exact` scheme, verified via facilitator):
 *   POST /v1/signal  premium alpha: {signal, confidence, features, txHint}
 *   POST /v1/score   cheaper risk features: {riskScore, riskBand, factors}
 *
 * Free routes:
 *   GET  /health     liveness + config snapshot (no secrets)
 *   GET  /402-info   payment requirements preview for agent builders
 *   GET  /v1/receipts recent paid-request receipts (in-memory, last 100)
 *
 * Flow: client POSTs without payment -> 402 + payment requirements ->
 * client signs a Hedera TransferTransaction -> retries with payment ->
 * facilitator /verify passes -> handler runs, facilitator settles async.
 */
import { config } from 'dotenv';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { paymentMiddleware } from '@x402/express';
import { createResourceServer, facilitatorUrlFor } from './x402.js';
import {
  PRICE_TABLE,
  acceptsFor,
  usdcTokenId,
  type HederaNetwork,
  type PaidRoute,
} from './pricing.js';
import { generateSignal, generateScore } from './signal.js';
import { buildReceipt, type PaymentReceipt } from './hashscan.js';

config();

const PORT = parseInt(process.env.PORT ?? '4021', 10);
const NETWORK: HederaNetwork =
  (process.env.HEDERA_NETWORK ?? 'testnet').toLowerCase() === 'mainnet'
    ? 'hedera:mainnet'
    : 'hedera:testnet';
const SERVICE_ACCOUNT = process.env.HEDERA_SERVICE_ACCOUNT_ID ?? '';
const FACILITATOR_URL = facilitatorUrlFor(NETWORK);

if (!SERVICE_ACCOUNT) {
  console.error('✗ HEDERA_SERVICE_ACCOUNT_ID is required (see service/.env.example)');
  process.exit(1);
}

/** In-memory receipt log — last 100 paid requests (no secrets stored). */
const receipts: PaymentReceipt[] = [];
function recordReceipt(receipt: PaymentReceipt): void {
  receipts.unshift(receipt);
  if (receipts.length > 100) receipts.length = 100;
}

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
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// ---- x402 payment gate -------------------------------------------------
const resourceServer = createResourceServer(NETWORK);
app.use(
  paymentMiddleware(
    {
      'POST /v1/signal': {
        accepts: acceptsFor('/v1/signal', NETWORK, SERVICE_ACCOUNT),
        description: 'AEGIS premium alpha signal (demo model)',
        mimeType: 'application/json',
      },
      'POST /v1/score': {
        accepts: acceptsFor('/v1/score', NETWORK, SERVICE_ACCOUNT),
        description: 'AEGIS risk features (demo model)',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

// ---- paid handlers ------------------------------------------------------
app.post('/v1/signal', (req: Request, res: Response) => {
  const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol : 'ETH/USDC';
  const alpha = generateSignal(symbol);
  const receipt = buildReceipt({
    route: '/v1/signal',
    network: NETWORK,
    payTo: SERVICE_ACCOUNT,
    facilitator: FACILITATOR_URL,
    txId: extractSettleTxId(res),
  });
  recordReceipt(receipt);
  res.json({ ...alpha, receipt });
});

app.post('/v1/score', (req: Request, res: Response) => {
  const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol : 'ETH/USDC';
  const score = generateScore(symbol);
  const receipt = buildReceipt({
    route: '/v1/score',
    network: NETWORK,
    payTo: SERVICE_ACCOUNT,
    facilitator: FACILITATOR_URL,
    txId: extractSettleTxId(res),
  });
  recordReceipt(receipt);
  res.json({ ...score, receipt });
});

// ---- free routes ----------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
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

app.get('/402-info', (_req: Request, res: Response) => {
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
    supported: `${FACILITATOR_URL.replace(/\/$/, '')}/supported`,
    verify: `${FACILITATOR_URL.replace(/\/$/, '')}/verify`,
    routes,
    howToPay:
      'POST the route without payment to receive HTTP 402 requirements, sign a Hedera ' +
      'TransferTransaction with an ECDSA key, retry with the payment payload ' +
      '(use @x402/fetch + @x402/hedera on the client — see service/README.md).',
  });
});

app.get('/v1/receipts', (_req: Request, res: Response) => {
  res.json({ count: receipts.length, receipts });
});

app.listen(PORT, () => {
  console.log(`\n🚀 AEGIS signal service on http://localhost:${PORT}`);
  console.log(`   Network:     ${NETWORK}`);
  console.log(`   Facilitator: ${FACILITATOR_URL}`);
  console.log(`   Receiver:    ${SERVICE_ACCOUNT}`);
  console.log(`   Paid:  POST /v1/signal ($0.01 USDC or 0.01 HBAR equiv)`);
  console.log(`   Paid:  POST /v1/score  ($0.001 USDC or 0.001 HBAR equiv)`);
  console.log(`   Free:  GET  /health, /402-info, /v1/receipts\n`);
});
