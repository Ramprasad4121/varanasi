/**
 * @author Ramprasad — SignalScout worker: topPools discovery (sane-filtered) + x402 signal buy on healthy turnover.
 *
 * Env deps: GRAPH_API_KEY (live Gateway via GraphClient), SIGNAL_URL /
 * HEDERA_AGENT_ACCOUNT_ID / HEDERA_AGENT_PRIVATE_KEY / HEDERA_NETWORK (x402
 * payer via payForSignal). AEGIS_OFFLINE=1 forces fixture mode (tests only).
 *
 * Fail-closed: empty pool list, no healthy-turnover pool, or unpaid signal
 * all throw (never return a scored result without a receipt). No private-key
 * flags — keys come only from env inside payForSignal, never as args here.
 */
import { GraphClient, type PoolIntel } from "../graph.js";
import { payForSignal, type PayResult } from "../pay.js";

/** Minimum 24h turnover (volume24h/tvl) to consider a pool worth paying for. */
export const SCOUT_MIN_TURNOVER = Number(process.env.SCOUT_MIN_TURNOVER ?? 0.01);

/** Injectable Graph surface for the scout (real GraphClient or a test fake). */
export interface ScoutGraph {
  topPools(first?: number): Promise<PoolIntel[]>;
  poolIntel(poolId: string): Promise<PoolIntel>;
}

/** Injectable x402 payer: mirrors payForSignal(opts, body). */
export type ScoutPayFn = (opts: Record<string, never>, body: Record<string, unknown>) => Promise<PayResult>;

/** Overrides for runScout (all optional; env supplies the rest). */
export interface ScoutOptions {
  /** Pin one pool id (via poolIntel) instead of topPools discovery. */
  poolId?: string;
  /** How many sane pools to consider from topPools (default 5). */
  first?: number;
  /** Minimum turnover to buy the signal (default SCOUT_MIN_TURNOVER). */
  minTurnover?: number;
  /** Force offline fixture mode (default: env AEGIS_OFFLINE). */
  offline?: boolean;
}

/** Scout output: pool + intel + paid signal + confidence + receipt. */
export interface ScoutResult {
  pool: string;
  intel: PoolIntel;
  signal: "long" | "short" | "neutral";
  confidence: number;
  receipt: { paid: boolean; txHash: string | null; hashscanUrl: string | null };
}

/**
 * Pure core: 24h turnover for a pool (volume24h / tvl, 0 when tvl is 0).
 * @param intel Normalized pool intel.
 * @returns Turnover ratio (unitless).
 */
export function turnoverOf(intel: PoolIntel): number {
  if (!Number.isFinite(intel.tvlUsd) || intel.tvlUsd <= 0) return 0;
  if (!Number.isFinite(intel.volume24hUsd) || intel.volume24hUsd < 0) return 0;
  return intel.volume24hUsd / intel.tvlUsd;
}

/**
 * Pure core: pick the highest-turnover pool at or above minTurnover.
 * Fail-closed: throws on empty input or when nothing clears the bar.
 * @param pools Sanity-filtered candidate pools.
 * @param minTurnover Minimum turnover ratio (default SCOUT_MIN_TURNOVER).
 * @returns Best pool by turnover.
 */
export function pickScoutTarget(pools: PoolIntel[], minTurnover: number = SCOUT_MIN_TURNOVER): PoolIntel {
  if (!Array.isArray(pools) || pools.length === 0) {
    throw new Error("Scout: no pools to evaluate (empty discovery set) — refusing to buy a signal.");
  }
  const ranked = [...pools].sort((a, b) => turnoverOf(b) - turnoverOf(a));
  const best = ranked[0] as PoolIntel;
  if (turnoverOf(best) < minTurnover) {
    throw new Error(
      `Scout: no healthy-turnover pool (best ${(turnoverOf(best) * 100).toFixed(2)}% < ${(minTurnover * 100).toFixed(2)}% bar) — refusing to buy a signal.`,
    );
  }
  return best;
}

/**
 * Pure core: normalize a paid-signal payload into { signal, confidence }.
 * Fail-closed: unpaid receipts throw (never trust an unpaid signal).
 * @param paid PayResult from the x402 round-trip.
 * @returns Normalized direction + confidence in [0, 1].
 */
export function normalizeSignal(paid: PayResult): { signal: ScoutResult["signal"]; confidence: number } {
  if (!paid.paid) {
    throw new Error("Scout: x402 signal unpaid (no payment-response receipt) — refusing to score.");
  }
  const p = paid.payload as Record<string, unknown>;
  const dirRaw = String(p?.direction ?? p?.signal ?? "neutral").toLowerCase();
  const signal = dirRaw === "long" || dirRaw === "short" ? dirRaw : ("neutral" as const);
  const confRaw = Number(p?.confidence ?? 0);
  const confidence = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0;
  return { signal, confidence };
}

/**
 * Live wrapper: discover (topPools, sane-filtered) → turnover gate → buy
 * x402 signal → normalized ScoutResult. Injectable graph/pay for tests.
 * @param opts Scout options (poolId pin, first, minTurnover, offline).
 * @param deps Injectable { graph, pay } (defaults: live GraphClient + payForSignal).
 * @returns ScoutResult with pool, intel, signal, confidence, receipt.
 */
export async function runScout(
  opts: ScoutOptions = {},
  deps: { graph?: ScoutGraph; pay?: ScoutPayFn } = {},
): Promise<ScoutResult> {
  const minTurnover = opts.minTurnover ?? SCOUT_MIN_TURNOVER;
  const graph: ScoutGraph = deps.graph ?? new GraphClient({ offline: opts.offline });
  const pay: ScoutPayFn = deps.pay ?? ((o, b) => payForSignal(o, b));

  const intel = opts.poolId
    ? await graph.poolIntel(opts.poolId)
    : pickScoutTarget(await graph.topPools(opts.first ?? 5), minTurnover);

  if (turnoverOf(intel) < minTurnover) {
    throw new Error(
      `Scout: pool ${intel.poolId} turnover ${(turnoverOf(intel) * 100).toFixed(2)}% below ${(minTurnover * 100).toFixed(2)}% bar — refusing to buy a signal.`,
    );
  }

  const paid = await pay({}, { pool: intel.poolId });
  const { signal, confidence } = normalizeSignal(paid);
  return {
    pool: intel.poolId,
    intel,
    signal,
    confidence,
    receipt: { paid: paid.paid, txHash: paid.txHash, hashscanUrl: paid.hashscanUrl },
  };
}
