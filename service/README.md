# AEGIS Signal Service — live x402-gated alpha API (Hedera)

Express + TypeScript resource server. Two paid routes on **Hedera testnet**,
verified/settled via an x402 facilitator. Adapted from the reference PoC
[hedera-dev/x402-inference-pay-per-request-poc](https://github.com/hedera-dev/x402-inference-pay-per-request-poc)
(Express + `@x402/express` + `@x402/hedera`) — but a **signal service, no LLM required**.

| Route | Price | Returns |
|---|---|---|
| `POST /v1/signal` | **$0.01** USDC *or* 0.01 HBAR equiv | `{signal, confidence, features, txHint}` + `receipt` |
| `POST /v1/score` | **$0.001** USDC *or* 0.001 HBAR equiv | `{riskScore, riskBand, factors}` + `receipt` |
| `GET /health`, `GET /402-info`, `GET /v1/receipts` | free | status / pay-preview / receipt log |

Each paid route accepts **two** payment options (USDC leg + HBAR leg) — the
payer's x402 client picks whichever asset its wallet can fund.

## 1. Setup (5 min, one-time)

1. **Receiver wallet** — create an **ECDSA** account at
   [portal.hedera.com](https://portal.hedera.com) (testnet). Save Account ID
   (`0.0.XXXXXX`) + private key. This account *receives* every payment.
2. **Fund it** — testnet HBAR from [faucet.hedera.com](https://faucet.hedera.com)
   (covers token-association + tx fees).
3. **Associate USDC** (testnet token `0.0.429274`) on the receiver account —
   required before the facilitator can settle USDC to it. Any Hedera wallet
   with “associate token” works; HBAR needs no association.
4. **Payer wallet** — a second testnet ECDSA account for the agent. Fund with
   HBAR (faucet) and USDC ([faucet.circle.com](https://faucet.circle.com) →
   Hedera Testnet), and associate USDC there too.
5. **Configure**:
   ```bash
   cd service
   npm install
   cp .env.example .env
   # edit .env: HEDERA_SERVICE_ACCOUNT_ID=<receiver 0.0.x>, PORT=4021
   ```

## 2. Run

```bash
npm run dev    # tsx watch, port 4021
# or
npm run build && npm start
```

## 3. Smoke tests — proving 402, then the paid flow

```bash
# Free: liveness + config snapshot
curl -s localhost:4021/health | python3 -m json.tool

# Free: machine-readable payment requirements preview
curl -s localhost:4021/402-info | python3 -m json.tool

# UNPAID signal call -> HTTP 402 with payment requirements (this is the gate)
curl -si -X POST localhost:4021/v1/signal \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"ETH/USDC"}' | head -20
# ^ look for: HTTP/1.1 402 Payment Required + PAYMENT-REQUIRED header

# UNPAID score call -> 402 as well
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:4021/v1/score \
  -H 'Content-Type: application/json' -d '{"symbol":"BTC/USDC"}'
# ^ 402
```

**Paid call** (needs the payer wallet funded, see §1). Minimal Node payer
using `@x402/fetch` + `@x402/hedera` (both already in `package.json`):

```ts
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner } from '@x402/hedera';
import { PrivateKey } from '@hiero-ledger/sdk';

const signer = createClientHederaSigner(
  process.env.HEDERA_PAYER_ACCOUNT_ID!, // e.g. 0.0.YYYYY
  PrivateKey.fromStringECDSA(process.env.HEDERA_PAYER_PRIVATE_KEY!),
);
const client = new x402Client().register('hedera:testnet', new ExactHederaScheme(signer));
const fetchWithPayment = wrapFetchWithPayment(fetch, client); // 402 -> sign -> retry

const res = await fetchWithPayment('http://localhost:4021/v1/signal', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ symbol: 'ETH/USDC' }),
});
const alpha = await res.json(); // {signal, confidence, features, txHint, receipt}
// Authoritative post-settlement tx, straight from the response header:
const settle = decodePaymentResponseHeader(res.headers.get('payment-response')!);
console.log('tx:', (settle as any).transactionId,
  '-> https://hashscan.io/testnet/tx/' + (settle as any).transactionId);
```

After a paid call, the receipt is also listed at `GET /v1/receipts`, and every
paid response embeds `receipt: {payTo, facilitator, txId?, hashscanTxUrl?,
hashscanAccountUrl}`.

## 4. Facilitators

| Network | Default facilitator | Override |
|---|---|---|
| `hedera:testnet` | `https://x402.org/facilitator` (x402 Foundation) | `X402_FACILITATOR_URL` (or `X402_TESTNET_FACILITATOR_URL`) |
| `hedera:mainnet` | `https://api.blocky402.com` (BlockyDevs) | `X402_FACILITATOR_URL` (or `X402_MAINNET_FACILITATOR_URL`) |

BlockyDevs also runs a testnet endpoint, `https://api.testnet.blocky402.com` —
point `X402_FACILITATOR_URL` at it if you need an asset the default testnet
facilitator doesn't serve (e.g. testnet HBAR). Liveness checks:

```bash
curl -s https://x402.org/facilitator/supported | head -c 300; echo
curl -s https://api.blocky402.com/supported | head -c 300; echo
```

## 5. What judges see in the video (≤5 min segment)

1. `curl POST /v1/signal` → **402** on screen (the gate is real).
2. Agent pays (HBAR or USDC on **hedera:testnet**) → **200** with
   `{signal: "LONG", confidence, features, txHint}`.
3. `receipt.hashscanTxUrl` opened → HashScan testnet shows the settled
   transfer to the service account. `GET /v1/receipts` shows the log.
4. Say it: *"No LLM, no mocks in the pay path — deterministic demo signal
   behind a real x402 settlement. Swap `signal.ts` for the Graph-fed model
   without touching agent or frontend."*

## 6. Files

```
service/
  src/server.ts    Express app, x402 gate, paid + free routes, receipt log
  src/pricing.ts   price table ($0.01 signal / $0.001 score) + USDC/HBAR switch
  src/signal.ts    DEMO deterministic mock alpha (TODO: real Graph-fed model)
  src/hashscan.ts  HashScan link builders + PaymentReceipt shape
  src/x402.ts      resource-server factory + facilitator URL resolution
  .env.example     HEDERA_SERVICE_ACCOUNT_ID, HEDERA_NETWORK, X402_* , PORT
```
