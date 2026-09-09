/**
 * @author Ramprasad — PoolAnalyst worker: pool intel + alpha → analyzeRisk verdict + human brief.
 *
 * Env deps: RISK_THRESHOLD_BPS (default scoring bar); LLM_* (LLM_BASE_URL,
 * LLM_API_KEY, LLM_MODEL) only when opts.llm is true (opt-in passthrough to
 * brain.ts reasonWithLLM, heuristic fallback preserved).
 *
 * Fail-closed: non-finite intel throws via analyzeRisk's bad-intel SKIP;
 * runAnalyst never invents intel (poolId lookups use the caller's GraphClient).
 * No private-key flags — this worker is read-only reasoning, no keys involved.
 */
import { analyzeRisk, DEFAULT_THRESHOLD_BPS, type ReasonInput, type ReasonOutput } from "../reason.js";
import { reasonWithLLM, type BrainVerdict } from "../brain.js";
import { GraphClient, type PoolIntel } from "../graph.js";

/** Alpha facts feeding the analyst (paid x402 signal or neutral default). */
export interface AnalystAlpha {
  /** Alpha score in [-1, 1] (negative = bearish). */
  score?: number;
  /** Signal direction. */
  direction?: "long" | "short" | "neutral";
}

/** Overrides for runAnalyst. */
export interface AnalystOptions {
  /** ACT/SKIP cutoff in bps (default RISK_THRESHOLD_BPS / 5000). */
  thresholdBps?: number;
  /** Identity gate: false forces SKIP (default: undefined = no opinion). */
  identityOk?: boolean;
  /** Opt-in LLM reasoning via brain.ts (default false = pure heuristic). */
  llm?: boolean;
  /** Pin one pool id to fetch intel for (else the caller supplies intel). */
  poolId?: string;
  /** Force offline fixture mode for the poolId lookup (tests only). */
  offline?: boolean;
}

/** Analyst output: verdict plus a human-readable brief. */
export interface AnalystResult {
  verdict: ReasonOutput | BrainVerdict;
  brief: string;
}

/**
 * Pure core: build a one-paragraph human brief from intel + alpha + verdict.
 * @param intel Pool intel facts (tvl, volume, fees, name/symbols when present).
 * @param alpha Alpha facts scored.
 * @param verdict Scored verdict from analyzeRisk / reasonWithLLM.
 * @param thresholdBps Threshold the verdict was scored against.
 * @returns Human-readable brief string.
 */
export function buildAnalystBrief(
  intel: { tvlUsd: number; volume24hUsd: number; fees24hUsd?: number; name?: string },
  alpha: AnalystAlpha,
  verdict: ReasonOutput,
  thresholdBps: number,
): string {
  const label = intel.name ? ` (${intel.name})` : "";
  const turnover = intel.tvlUsd > 0 ? (intel.volume24hUsd / intel.tvlUsd) * 100 : 0;
  const alphaTxt =
    alpha.direction && alpha.direction !== "neutral"
      ? `${alpha.direction} ${typeof alpha.score === "number" ? alpha.score.toFixed(2) : "n/a"}`
      : "neutral";
  return (
    `Pool${label}: TVL $${intel.tvlUsd.toFixed(0)}, 24h vol $${intel.volume24hUsd.toFixed(0)} ` +
    `(${turnover.toFixed(1)}% turnover), alpha ${alphaTxt} → ` +
    `${verdict.decision} @ ${verdict.riskScoreBps}bps vs ${thresholdBps}bps. ${verdict.rationale}`
  );
}

/**
 * Pure core: score pool intel + alpha with the heuristic engine.
 * Fail-closed: analyzeRisk throws/returns SKIP on bad intel — never ACT on garbage.
 * @param intel Pool intel facts.
 * @param alpha Alpha facts.
 * @param opts Threshold + identity gate.
 * @returns AnalystResult with heuristic verdict + brief.
 */
export function analyzePool(
  intel: { tvlUsd: number; volume24hUsd: number; fees24hUsd?: number; name?: string },
  alpha: AnalystAlpha = {},
  opts: { thresholdBps?: number; identityOk?: boolean } = {},
): AnalystResult {
  const thresholdBps = opts.thresholdBps ?? DEFAULT_THRESHOLD_BPS;
  const input: ReasonInput = {
    tvlUsd: intel.tvlUsd,
    volume24hUsd: intel.volume24hUsd,
    fees24hUsd: intel.fees24hUsd,
    alphaScore: alpha.score ?? 0,
    alphaDirection: alpha.direction ?? "neutral",
    identityOk: opts.identityOk,
  };
  const verdict = analyzeRisk(input, thresholdBps);
  return { verdict, brief: buildAnalystBrief(intel, alpha, verdict, thresholdBps) };
}

/**
 * Live wrapper: optionally fetch intel for poolId, then score via the
 * heuristic path (default) or the LLM opt-in passthrough (reasonWithLLM with
 * heuristic fallback). Injectable graph for tests.
 * @param args Intel (or poolId to fetch) plus alpha facts.
 * @param opts Analyst options (threshold, identity, llm, offline).
 * @param deps Injectable { graph } (default: live GraphClient).
 * @returns AnalystResult with verdict + brief.
 */
export async function runAnalyst(
  args: { intel?: PoolIntel; poolId?: string; alpha?: AnalystAlpha },
  opts: AnalystOptions = {},
  deps: { graph?: Pick<GraphClient, "poolIntel"> } = {},
): Promise<AnalystResult> {
  const thresholdBps = opts.thresholdBps ?? DEFAULT_THRESHOLD_BPS;
  const poolId = args.poolId ?? opts.poolId;
  let intel: PoolIntel;
  if (args.intel) {
    intel = args.intel;
  } else if (poolId) {
    const graph = deps.graph ?? new GraphClient({ offline: opts.offline });
    intel = await graph.poolIntel(poolId);
  } else {
    throw new Error("Analyst: no intel or poolId supplied — refusing to score thin air.");
  }
  const alpha = args.alpha ?? {};

  if (opts.llm) {
    const verdict = await reasonWithLLM(
      { tvlUsd: intel.tvlUsd, volume24hUsd: intel.volume24hUsd, fees24hUsd: intel.fees24hUsd },
      { score: alpha.score, direction: alpha.direction },
      { identityOk: opts.identityOk },
      thresholdBps,
    );
    return { verdict, brief: buildAnalystBrief(intel, alpha, verdict, thresholdBps) };
  }
  return analyzePool(intel, alpha, { thresholdBps, identityOk: opts.identityOk });
}
