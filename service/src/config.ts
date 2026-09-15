/**
 * @author Ramprasad
 * @module config — validated runtime configuration for the varanasi signal service.
 *
 * Env deps: PORT, NODE_ENV, HEDERA_NETWORK, HEDERA_SERVICE_ACCOUNT_ID,
 * X402_* facilitator overrides, CORS_ORIGIN, HCS_ENABLED, HCS_TOPIC_ID,
 * GIT_SHA (injected by deploy platforms), SERVICE_VERSION (override).
 *
 * All validation happens once at boot via loadConfig(). Invalid values
 * fail fast with a clear message instead of serving half-configured.
 */
import { facilitatorUrlFor } from './x402.js';
import type { HederaNetwork } from './pricing.js';

export interface ServiceConfig {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  network: HederaNetwork;
  serviceAccount: string;
  facilitatorUrl: string;
  corsOrigins: string[] | '*';
  version: string;
  gitSha: string;
  startedAt: string;
}

const ACCOUNT_RE = /^0\.0\.\d+$/;

/** Parse and validate env into a ServiceConfig. Throws on invalid config. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development').trim() || 'development';
  const isProduction = nodeEnv === 'production';

  const portRaw = (env.PORT ?? '4021').trim();
  const port = parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT: expected 1-65535, got ${JSON.stringify(portRaw)}`);
  }

  const networkRaw = (env.HEDERA_NETWORK ?? 'testnet').trim().toLowerCase();
  if (networkRaw !== 'testnet' && networkRaw !== 'mainnet') {
    throw new Error(
      `invalid HEDERA_NETWORK: expected "testnet" or "mainnet", got ${JSON.stringify(networkRaw)}`,
    );
  }
  const network: HederaNetwork = networkRaw === 'mainnet' ? 'hedera:mainnet' : 'hedera:testnet';

  const serviceAccount = (env.HEDERA_SERVICE_ACCOUNT_ID ?? '').trim();
  if (!serviceAccount) {
    throw new Error('HEDERA_SERVICE_ACCOUNT_ID is required (see service/.env.example)');
  }
  if (!ACCOUNT_RE.test(serviceAccount)) {
    throw new Error(
      `invalid HEDERA_SERVICE_ACCOUNT_ID: expected "0.0.<digits>", got ${JSON.stringify(serviceAccount)}`,
    );
  }

  // Temporarily swap env for facilitator resolution so overrides are honored.
  const facilitatorUrl = facilitatorUrlFor(network);
  try {
    const u = new URL(facilitatorUrl);
    if (u.protocol !== 'https:') {
      throw new Error(`facilitator URL must be https, got ${JSON.stringify(facilitatorUrl)}`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('facilitator URL')) throw err;
    throw new Error(`invalid facilitator URL: ${JSON.stringify(facilitatorUrl)}`);
  }

  const envOrigins = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  let corsOrigins: string[] | '*';
  if (envOrigins.length > 0) {
    corsOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
  } else if (!isProduction) {
    corsOrigins = '*';
  } else {
    corsOrigins = defaultOrigins;
  }

  return {
    port,
    nodeEnv,
    isProduction,
    network,
    serviceAccount,
    facilitatorUrl,
    corsOrigins,
    version: (env.SERVICE_VERSION ?? '0.1.0').trim() || '0.1.0',
    gitSha: (env.GIT_SHA ?? 'local').trim() || 'local',
    startedAt: new Date().toISOString(),
  };
}
