/**
 * HashScan link builders + paid-request receipt shape.
 *
 * Every paid response carries a `receipt` so agents (and the demo video) can
 * prove settlement: receiver account link always, transaction link whenever
 * the facilitator's settle response surfaced a txId.
 */

export type HashscanScope = 'testnet' | 'mainnet';

export function hashscanScope(network: 'hedera:testnet' | 'hedera:mainnet'): HashscanScope {
  return network === 'hedera:mainnet' ? 'mainnet' : 'testnet';
}

const BASE = 'https://hashscan.io';

/**
 * P2 trust boundary: Hedera txId allowlist. Accepts only the two canonical
 * forms — `0.0.123@1697836800.123456789` or `0.0.123-1697836800-123456789`.
 * Anything else is rejected so a malformed txId is never embedded in
 * receipts or HashScan URLs.
 */
const HEDERA_TXID_RE = /^0\.0\.\d+(?:@\d+\.\d+|-\d+-\d+)$/;

export function isValidHederaTxId(txId: unknown): txId is string {
  return typeof txId === 'string' && HEDERA_TXID_RE.test(txId);
}

/** Link to an account page, e.g. the service receiver account. */
export function hashscanAccountUrl(accountId: string, scope: HashscanScope): string {
  return `${BASE}/${scope}/account/${encodeURIComponent(accountId)}`;
}

/**
 * Link to a transaction page. Hedera txIds look like
 * `0.0.123@1697836800.123456789` — HashScan canonical form uses dashes:
 * `0.0.123-1697836800-123456789` under `/transaction/`.
 * Returns null when no txId was captured (verify-only flows).
 */
export function hashscanTxUrl(txId: string | null | undefined, scope: HashscanScope): string | null {
  if (!isValidHederaTxId(txId)) return null;
  // Canonicalize @-form to dashes without touching the 0.0 shard.realm prefix.
  const dash = txId.includes('@')
    ? txId.replace('@', '-').replace(/\.(\d+)$/, '-$1')
    : txId;
  return `${BASE}/${scope}/transaction/${dash}`;
}

export interface PaymentReceipt {
  route: string;
  network: 'hedera:testnet' | 'hedera:mainnet';
  /** Receiver account configured on the service. */
  payTo: string;
  /** Facilitator that verified/settled the payment. */
  facilitator: string;
  /** Hedera txId from the settle response, when available. */
  txId: string | null;
  hashscanTxUrl: string | null;
  hashscanAccountUrl: string;
  servedAt: string;
}

export function buildReceipt(args: {
  route: string;
  network: 'hedera:testnet' | 'hedera:mainnet';
  payTo: string;
  facilitator: string;
  txId?: string | null;
  servedAt?: string;
}): PaymentReceipt {
  const scope = hashscanScope(args.network);
  // P2: never persist a raw malformed txId — store null unless allowlisted.
  const txId = isValidHederaTxId(args.txId) ? args.txId : null;
  return {
    route: args.route,
    network: args.network,
    payTo: args.payTo,
    facilitator: args.facilitator,
    txId,
    hashscanTxUrl: hashscanTxUrl(txId, scope),
    hashscanAccountUrl: hashscanAccountUrl(args.payTo, scope),
    servedAt: args.servedAt ?? new Date().toISOString(),
  };
}
