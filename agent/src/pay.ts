/**
 * @author Ramprasad — x402 payer for the premium alpha signal (payForSignal, hashscanTxUrl; env: SIGNAL_URL, HEDERA_AGENT_ACCOUNT_ID, HEDERA_AGENT_PRIVATE_KEY, HEDERA_NETWORK).
 * pay.ts — x402 payer: buys the premium alpha signal from service//v1/signal.
 *
 * Flow (Hedera testnet, Blocky402 facilitator):
 *  1. Build a Hedera ECDSA signer from HEDERA_AGENT_ACCOUNT_ID / HEDERA_AGENT_PRIVATE_KEY.
 *  2. Wrap global fetch with @x402/fetch payment handling.
 *  3. POST SIGNAL_URL → first 402 (payment requirements) → auto-sign Transfer → retry.
 *  4. Return { payload, txHash, hashscanUrl } — receipts surface in CLI JSON + UI.
 *
 * Namespace imports + `any` casts keep this compiling across @x402 minor
 * version bumps; runtime probes verify the expected exports exist.
 */
import * as x402Fetch from "@x402/fetch";
import * as hiero from "@hiero-ledger/sdk";

/** Result of a paid signal fetch: payload plus Hedera receipt fields. */
export interface PayResult {
  /** Raw signal payload returned by the service. */
  payload: unknown;
  /** Hedera payment transaction id/hash (receipt). */
  txHash: string | null;
  /** HashScan explorer URL for the payment tx, or null when not a valid tx id. */
  hashscanUrl: string | null;
  /** True when the 402 round-trip actually executed a payment. */
  paid: boolean;
}

/** Allowlisted Hedera tx id: `shard.realm.num@sss.nnnnnnnnn` or dash form. */
const HEDERA_TXID_RE = /^(\d+\.\d+\.\d+)[@-](\d+)[.-](\d+)$/;

/**
 * Build a HashScan explorer URL for a Hedera tx id, or null for non-tx ids.
 * @param txId Hedera tx id (`shard.realm.num@sss.nnnnnnnnn` or dash form).
 * @param network Hedera network name ("mainnet" or anything else → testnet).
 * @returns HashScan transaction URL, or null when txId is not an allowlisted tx id.
 */
export function hashscanTxUrl(txId: string, network: string): string | null {
  const net = network === "mainnet" ? "mainnet" : "testnet";
  // Canonicalize ONLY the tx separators: `0.0.123@1697836800.123456789` →
  // `0.0.123-1697836800-123456789`. Never touch the entity dots (the old
  // `.replace(".", "-")` broke every link). Reject non-txIds (e.g. raw
  // base64 PAYMENT-RESPONSE) → null instead of a garbage URL.
  const m = HEDERA_TXID_RE.exec(txId);
  if (!m) return null;
  return `https://hashscan.io/${net}/transaction/${m[1]}-${m[2]}-${m[3]}`;
}

/** Overrides for the x402 payer (defaults come from SIGNAL_URL / HEDERA_* env). */
export interface PayerOptions {
  /** Signal service URL (default: env SIGNAL_URL or localhost). */
  signalUrl?: string;
  /** Hedera account id for the ECDSA signer (env HEDERA_AGENT_ACCOUNT_ID). */
  accountId?: string;
  /** Hedera ECDSA private key (env HEDERA_AGENT_PRIVATE_KEY). */
  privateKey?: string;
  /** Hedera network name (default: env HEDERA_NETWORK or testnet). */
  hederaNetwork?: string;
}

/** Build the x402 scheme client for Hedera `exact` payments (runtime-resolved). */
async function buildSchemeClient(accountId: string, privateKey: string, network: string): Promise<any> {
  const hederaMod: any = await import("@x402/hedera");
  const caip2 = network === "mainnet" ? "hedera:mainnet" : "hedera:testnet";
  const mkSigner = hederaMod.createClientHederaSigner;
  const Scheme = hederaMod.ExactHederaScheme;
  if (typeof mkSigner !== "function" || typeof Scheme !== "function") {
    throw new Error("@x402/hedera does not export createClientHederaSigner/ExactHederaScheme — check installed version.");
  }
  let key: any;
  // NOTE: fromStringECDSA FIRST. Generic fromString() on 0x-hex ECDSA keys
  // takes a deprecated path that produces signatures facilitators reject in
  // preflight (verified empirically: fromString→402, fromStringECDSA→200).
  try {
    key = hiero.PrivateKey.fromStringECDSA(privateKey);
  } catch {
    key = hiero.PrivateKey.fromString(privateKey);
  }
  const signer = mkSigner(accountId, key, { network: caip2 });
  return { scheme: new Scheme(signer), caip2 };
}

/**
 * Pay for the premium alpha signal via the x402 402 round-trip and return payload + receipt.
 * @param opts Payer overrides (signalUrl, accountId, privateKey, hederaNetwork).
 * @param body JSON body posted to the signal service.
 * @returns PayResult with payload, txHash, hashscanUrl, and paid flag.
 */
export async function payForSignal(opts: PayerOptions = {}, body: Record<string, unknown> = {}): Promise<PayResult> {
  const signalUrl = opts.signalUrl ?? process.env.SIGNAL_URL ?? "http://localhost:3001/v1/signal";
  const accountId = opts.accountId ?? process.env.HEDERA_AGENT_ACCOUNT_ID ?? "";
  const privateKey = opts.privateKey ?? process.env.HEDERA_AGENT_PRIVATE_KEY ?? "";
  const network = opts.hederaNetwork ?? process.env.HEDERA_NETWORK ?? "testnet";
  if (!accountId || !privateKey) {
    throw new Error("HEDERA_AGENT_ACCOUNT_ID / HEDERA_AGENT_PRIVATE_KEY are required to pay for the x402 signal.");
  }

  const { scheme, caip2 } = await buildSchemeClient(accountId, privateKey, network);
  const wrap = (x402Fetch as any).wrapFetchWithPayment;
  const X402Client = (x402Fetch as any).x402Client;
  if (typeof wrap !== "function" || typeof X402Client !== "function") {
    throw new Error("@x402/fetch does not export wrapFetchWithPayment/x402Client — check installed version.");
  }
  const client = new X402Client((_version: number, accepts: any[]) => {
    // Prefer the USDC leg (funded HTS token) over native HBAR: both
    // facilitators have rejected the HBAR leg in preflight during testing.
    // Fall back to whatever the service lists first.
    if (Array.isArray(accepts)) {
      const usdc = accepts.find((a) => typeof a?.asset === "string" && a.asset !== "0.0.0");
      if (usdc) return usdc;
      return accepts[0];
    }
    return accepts;
  });
  client.register(caip2, scheme);
  const paidFetch = wrap(fetch, client) as typeof fetch;

  const res = await paidFetch(signalUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Signal service ${res.status}: ${text.slice(0, 300)}`);
  }
  const payload = (await res.json().catch(async () => ({ raw: await res.text() }))) as any;

  // Receipt extraction: decode the base64 PAYMENT-RESPONSE header into the
  // settlement tx id (authoritative), else fall back to payload fields.
  let txHash: string | null =
    payload?.txId ?? payload?.txHash ?? payload?.receipt?.txId ?? null;
  const payRespHeader = res.headers.get("payment-response") as string | null;
  if (payRespHeader) {
    try {
      const decode = (x402Fetch as any).decodePaymentResponseHeader;
      if (typeof decode === "function") {
        const decoded = decode(payRespHeader) as any;
        txHash = decoded?.transaction ?? decoded?.txHash ?? decoded?.txId ?? txHash;
      }
    } catch {
      // fall through to header-as-id fallback below
    }
    if (!txHash) txHash = payRespHeader;
  }
  return {
    payload,
    txHash,
    hashscanUrl: txHash ? hashscanTxUrl(txHash, network) : null,
    paid: txHash != null || res.headers.has("payment-response"),
  };
}
