/**
 * @author Ramprasad
 * @module x402 — resource-server factory, one server per Hedera network,
 * each bound to the facilitator that serves that network.
 *
 * Env deps: X402_FACILITATOR_URL, X402_TESTNET_FACILITATOR_URL,
 * X402_MAINNET_FACILITATOR_URL (all optional overrides; built-in defaults otherwise).
 *
 * Facilitator choice (mirrors the reference PoC):
 * - hedera:testnet -> https://x402.org/facilitator (x402 Foundation; default)
 * - hedera:mainnet -> https://api.blocky402.com (BlockyDevs; default)
 *
 * Overrides (highest precedence first):
 *   1. X402_FACILITATOR_URL            — single URL for the active network
 *   2. X402_{TESTNET,MAINNET}_FACILITATOR_URL — per-network URL
 *   3. Built-in defaults above.
 *
 * NOTE: BlockyDevs also runs a testnet facilitator at
 * https://api.testnet.blocky402.com — set X402_FACILITATOR_URL to it if the
 * default testnet facilitator lacks an asset you need (e.g. HBAR on testnet).
 */
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import type { HederaNetwork } from './pricing.js';

export const DEFAULT_TESTNET_FACILITATOR = 'https://x402.org/facilitator';
export const DEFAULT_MAINNET_FACILITATOR = 'https://api.blocky402.com';
export const BLOCKY_TESTNET_FACILITATOR = 'https://api.testnet.blocky402.com';

/**
 * Resolve the facilitator URL for a network (env overrides first, built-in default otherwise).
 * @param network 'hedera:testnet' or 'hedera:mainnet'.
 * @returns Facilitator base URL serving that network.
 */
export function facilitatorUrlFor(network: HederaNetwork): string {
  const perNetworkKey =
    network === 'hedera:mainnet' ? 'X402_MAINNET_FACILITATOR_URL' : 'X402_TESTNET_FACILITATOR_URL';
  const fallback = network === 'hedera:mainnet' ? DEFAULT_MAINNET_FACILITATOR : DEFAULT_TESTNET_FACILITATOR;
  return process.env.X402_FACILITATOR_URL ?? process.env[perNetworkKey] ?? fallback;
}

/**
 * Create an x402 resource server bound to the network's facilitator with the Hedera exact scheme.
 * @param network 'hedera:testnet' or 'hedera:mainnet'.
 * @returns Configured x402ResourceServer for the payment middleware.
 */
export function createResourceServer(network: HederaNetwork): x402ResourceServer {
  const facilitatorUrl = facilitatorUrlFor(network);
  const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
  return new x402ResourceServer(facilitatorClient).register('hedera:*', new ExactHederaScheme({}));
}
