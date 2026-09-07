/**
 * @author Ramprasad
 * @module pricing — price table + asset switch for the varanasi x402-gated signal API.
 *
 * Env deps: none (static table; network/payTo passed in as arguments).
 *
 * Two paid routes, each payable in EITHER USDC (HTS fungible token, priced
 * as a USD `Money` string the facilitator resolves) OR native HBAR (priced
 * as an explicit `AssetAmount` in tinybars, 1 HBAR = 10^8 tinybars).
 *
 * HBAR equivalents assume the ~$1/HBAR parity convention used by the
 * reference PoC (hedera-dev/x402-inference-pay-per-request-poc), where
 * $0.001 <-> 100,000 tinybars (0.001 HBAR).
 *
 * Token IDs:
 * - Testnet USDC: 0.0.429274 (Circle faucet token on hedera:testnet)
 * - Mainnet USDC: 0.0.456858
 * - HBAR native:  0.0.0
 */

export const HBAR_ASSET_ID = '0.0.0';
export const TESTNET_USDC_ID = '0.0.429274';
export const MAINNET_USDC_ID = '0.0.456858';

export type AssetChoice = 'usdc' | 'hbar';
export type HederaNetwork = 'hedera:testnet' | 'hedera:mainnet';
export type PaidRoute = '/v1/signal' | '/v1/score';

export interface RoutePrice {
  route: PaidRoute;
  /** USD Money string for the USDC/HTS leg, e.g. '$0.01'. */
  usd: '$0.01' | '$0.001';
  /** HBAR-leg amount in tinybars (string, as the scheme expects). */
  hbarTinybars: string;
  description: string;
}

export const PRICE_TABLE: RoutePrice[] = [
  {
    route: '/v1/signal',
    usd: '$0.01',
    hbarTinybars: '1000000', // 0.01 HBAR
    description: 'Premium alpha signal: direction + confidence + features + txHint',
  },
  {
    route: '/v1/score',
    usd: '$0.001',
    hbarTinybars: '100000', // 0.001 HBAR
    description: 'Cheaper risk features: risk score + factor breakdown',
  },
];

/**
 * Look up the static price entry for a paid route.
 * @param route Paid route ("/v1/signal" or "/v1/score").
 * @returns RoutePrice with USD string + HBAR tinybars.
 * @throws When the route is not in PRICE_TABLE.
 */
export function priceFor(route: PaidRoute): RoutePrice {
  const entry = PRICE_TABLE.find((p) => p.route === route);
  if (!entry) throw new Error(`Unknown paid route: ${route}`);
  return entry;
}

/** USDC (HTS) token ID for a given network.
 * @param network 'hedera:testnet' or 'hedera:mainnet'.
 * @returns HTS token id string for USDC on that network.
 */
export function usdcTokenId(network: HederaNetwork): string {
  return network === 'hedera:mainnet' ? MAINNET_USDC_ID : TESTNET_USDC_ID;
}

export interface AcceptsEntry {
  scheme: 'exact';
  price: string | { asset: string; amount: string };
  network: HederaNetwork;
  payTo: string;
}

/**
 * Build the x402 `accepts` payment options for a route.
 *
 * Returns TWO options — the payer's x402 client picks whichever asset its
 * wallet can fund:
 *   [0] USDC leg (USD Money string; facilitator maps to the HTS token)
 *   [1] HBAR leg (explicit native AssetAmount in tinybars)
 * @param route Paid route to price.
 * @param network Hedera network the accepts entry targets.
 * @param payTo Receiver Hedera account id.
 * @returns Two-entry accepts array (USDC leg + HBAR leg).
 */
export function acceptsFor(route: PaidRoute, network: HederaNetwork, payTo: string): AcceptsEntry[] {
  const entry = priceFor(route);
  return [
    { scheme: 'exact', price: entry.usd, network, payTo },
    { scheme: 'exact', price: { asset: HBAR_ASSET_ID, amount: entry.hbarTinybars }, network, payTo },
  ];
}
