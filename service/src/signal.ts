/**
 * @author Ramprasad
 * @module signal — DEMO ONLY deterministic mock alpha generator.
 *
 * Env deps: none (pure; no network calls, no env reads).
 *
 * Produces a stable, pseudo-random signal from (symbol, minute-bucket) via a
 * seeded PRNG. Makes NO network calls and uses NO real market data, so judges
 * and agents can exercise the full x402 paid-request loop without an API key.
 *
 * TODO(real-model): replace `deriveFeatures` with live features, e.g.:
 *   1. Query The Graph (Uniswap V3 / ERC-4626 subgraphs) for TVL, volume24h,
 *      fees/APY for the requested pair,
 *   2. Feed normalized features into a trained scorer,
 *   3. Return calibrated confidence + realized-vol risk bounds.
 * Keep the response shape stable so agent/ + frontend/ need no changes.
 */

export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface SignalFeatures {
  rsiProxy: number; // 0-100 oscillator proxy
  momentumProxy: number; // -1..1 trend proxy
  volatilityProxy: number; // 0..1 dispersion proxy
  volumeProxy: number; // 0..1 participation proxy
  emaSpreadBps: number; // basis points, signed
}

export interface AlphaSignal {
  symbol: string;
  signal: Direction;
  /** 0..1, never 1.0 for a demo model. */
  confidence: number;
  features: SignalFeatures;
  /** Hypothetical execution hint — NOT a trade instruction. */
  txHint: string;
  generatedAt: string;
  model: 'aegis-demo-v0';
  disclaimer: string;
}

export interface RiskScore {
  symbol: string;
  /** 0 (safe) .. 100 (extreme risk). */
  riskScore: number;
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  factors: { name: string; weight: number; value: number }[];
  generatedAt: string;
  model: 'aegis-demo-v0';
  disclaimer: string;
}

const DISCLAIMER =
  'DEMO signal from a deterministic mock — not financial advice, not based on live market data.';

/** FNV-1a 32-bit hash — small, dependency-free seed. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — deterministic PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function deriveFeatures(symbol: string, at: Date): SignalFeatures {
  // One-minute buckets: same symbol queried twice in a minute returns the
  // same signal (idempotent demo); signal drifts over time like a live feed.
  const bucket = Math.floor(at.getTime() / 60_000);
  const rand = mulberry32(fnv1a(`${symbol.toUpperCase()}:${bucket}`));
  return {
    rsiProxy: round(20 + rand() * 60, 2),
    momentumProxy: round(rand() * 2 - 1),
    volatilityProxy: round(0.05 + rand() * 0.6),
    volumeProxy: round(rand(), 2),
    emaSpreadBps: round((rand() * 2 - 1) * 120, 2),
  };
}

/**
 * Generate a deterministic demo alpha signal for a symbol and time bucket.
 * @param symbolRaw Trading-pair symbol (e.g. "ETH/USDC"); uppercased, defaults to ETH/USDC.
 * @param at Bucket timestamp (default now); same symbol+minute returns the same signal.
 * @returns AlphaSignal with direction, confidence, features, txHint and demo disclaimer.
 */
export function generateSignal(symbolRaw: string, at: Date = new Date()): AlphaSignal {
  const symbol = (symbolRaw || 'ETH/USDC').toUpperCase();
  const features = deriveFeatures(symbol, at);

  // Weighted mock edge: momentum + EMA spread vs. volatility drag.
  const edge =
    0.55 * features.momentumProxy +
    0.0035 * features.emaSpreadBps -
    0.25 * features.volatilityProxy +
    0.1 * (features.rsiProxy - 50) / 50;

  const signal: Direction = edge > 0.08 ? 'LONG' : edge < -0.08 ? 'SHORT' : 'NEUTRAL';
  const confidence = round(Math.min(0.92, 0.5 + Math.abs(edge)), 3);

  const side = signal === 'NEUTRAL' ? 'hold/no-edge' : `${signal} ${symbol}`;
  const txHint =
    `DEMO HINT — if executing ${side}, size <= ${(confidence * 2).toFixed(2)}% of allowance, ` +
    `re-check risk via POST /v1/score first. Not a trade instruction.`;

  return {
    symbol,
    signal,
    confidence,
    features,
    txHint,
    generatedAt: at.toISOString(),
    model: 'aegis-demo-v0',
    disclaimer: DISCLAIMER,
  };
}

/**
 * Generate a deterministic demo risk score for a symbol and time bucket.
 * @param symbolRaw Trading-pair symbol; uppercased, defaults to ETH/USDC.
 * @param at Bucket timestamp (default now).
 * @returns RiskScore with 0..100 score, band, factor breakdown and demo disclaimer.
 */
export function generateScore(symbolRaw: string, at: Date = new Date()): RiskScore {
  const symbol = (symbolRaw || 'ETH/USDC').toUpperCase();
  const features = deriveFeatures(`risk:${symbol}`, at);

  const factors = [
    { name: 'volatility', weight: 0.4, value: round(features.volatilityProxy, 3) },
    { name: 'thin-volume', weight: 0.25, value: round(1 - features.volumeProxy, 3) },
    { name: 'trend-exhaustion', weight: 0.2, value: round(Math.abs(features.momentumProxy), 3) },
    { name: 'spread-stress', weight: 0.15, value: round(Math.min(1, Math.abs(features.emaSpreadBps) / 120), 3) },
  ];
  const riskScore = Math.round(factors.reduce((sum, f) => sum + f.weight * f.value * 100, 0));
  const riskBand = riskScore < 25 ? 'LOW' : riskScore < 50 ? 'MEDIUM' : riskScore < 75 ? 'HIGH' : 'EXTREME';

  return {
    symbol,
    riskScore,
    riskBand,
    factors,
    generatedAt: at.toISOString(),
    model: 'aegis-demo-v0',
    disclaimer: DISCLAIMER,
  };
}
