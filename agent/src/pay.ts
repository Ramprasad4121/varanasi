/**
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

export interface PayResult {
  payload: unknown;
  /** Hedera payment transaction id/hash (receipt). */
  txHash: string | null;
  hashscanUrl: string | null;
  /** True when the 402 round-trip actually executed a payment. */
  paid: boolean;
}

export function hashscanTxUrl(txId: string, network: string): string {
  const net = network === "mainnet" ? "mainnet" : "testnet";
  return `https://hashscan.io/${net}/transaction/${txId}`;
}

export interface PayerOptions {
  signalUrl?: string;
  accountId?: string;
  privateKey?: string;
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
  try {
    key = hiero.PrivateKey.fromString(privateKey);
  } catch {
    key = hiero.PrivateKey.fromStringECDSA(privateKey);
  }
  const signer = mkSigner(accountId, key, { network: caip2 });
  return { scheme: new Scheme(signer), caip2 };
}

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
    // Prefer the native HBAR leg (asset 0.0.0): the agent wallet is HBAR-funded.
    // Fall back to whatever the service lists first (e.g. USDC when funded).
    if (Array.isArray(accepts)) {
      const hbar = accepts.find((a) => a?.asset === "0.0.0");
      if (hbar) return hbar;
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

  // Receipt extraction: facilitators surface the settlement tx id in the
  // payload or in the PAYMENT-RESPONSE header.
  const txHash: string | null =
    payload?.txId ?? payload?.txHash ?? payload?.receipt?.txId ?? (res.headers.get("payment-response") as string | null) ?? null;
  return {
    payload,
    txHash,
    hashscanUrl: txHash ? hashscanTxUrl(txHash, network) : null,
    paid: txHash != null || res.headers.has("payment-response"),
  };
}
