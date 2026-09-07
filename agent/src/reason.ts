/**
 * @author Ramprasad — pure heuristic risk engine (analyzeRisk, sanitizeAlphaScore; env: RISK_THRESHOLD_BPS).
 * reason.ts — pure, unit-testable reasoning engine.
 *
 * Takes live Graph intel + the paid x402 alpha signal and produces a
 * risk score + ACT/SKIP decision with a human-readable rationale.
 *
 * No LLM key required: a transparent heuristic scores risk in basis points.
 * An LLM plug point (`llmRationale`) lets teams swap the rationale generator
 * without touching the scoring math — see README "LLM plug".
 */

/** Inputs to the heuristic risk model (Graph intel + x402 alpha + identity). */
export interface ReasonInput {
  /** Total value locked in USD (Graph intel). */
  tvlUsd: number;
  /** 24h trading volume in USD (derived from cumulative volume / 365 when 24h not available). */
  volume24hUsd: number;
  /** 24h LP fees in USD (optional, estimated from feeTier when missing). */
  fees24hUsd?: number;
  /** Premium alpha from the x402 service: -1 (bearish) … +1 (bullish). */
  alphaScore?: number;
  /** Alpha signal direction. */
  alphaDirection?: "long" | "short" | "neutral";
  /** Agent identity already expired/revoked upstream? */
  identityOk?: boolean;
}

/** Scored risk verdict: bps score, ACT/SKIP decision, rationale, and factor breakdown. */
export interface ReasonOutput {
  /** Risk score in basis points (0..10000, higher = riskier). */
  riskScoreBps: number;
  /** ACT when score <= threshold, else SKIP. */
  decision: "ACT" | "SKIP";
  /** Human-readable rationale summarizing the decision and factors. */
  rationale: string;
  /** Factor breakdown (each factor name, bps contribution, and note). */
  factors: { name: string; bps: number; note: string }[];
}

/** Default ACT/SKIP threshold in bps (from env RISK_THRESHOLD_BPS, default 5000). */
export const DEFAULT_THRESHOLD_BPS = Number(process.env.RISK_THRESHOLD_BPS ?? 5000);

/**
 * P2 trust boundary: paid-signal alpha flows into scoring math, so sanitize.
 * Accepts only finite numbers; strings (even numeric), NaN, Infinity,
 * null, and other types fall back to 0 with `invalid: true` so the caller
 * can flag it. Valid values are clamped to [-1, 1].
 * @param raw Untrusted alpha value from the paid signal.
 * @returns Sanitized value in [-1, 1] plus an invalid flag.
 */
export function sanitizeAlphaScore(raw: unknown): { value: number; invalid: boolean } {
  if (raw === undefined) return { value: 0, invalid: false };
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { value: 0, invalid: true };
  const clamped = Math.min(1, Math.max(-1, raw));
  // Out-of-range magnitudes are absorbed AND flagged: a wildly wrong feed
  // must not silently become "max bullish" without an alpha-invalid factor.
  return { value: clamped, invalid: clamped !== raw };
}

/**
 * Heuristic risk model (all terms in bps, higher = riskier):
 *  - thin liquidity:  TVL < $100k → +3500, < $1M → +1500, else +200
 *  - low activity:    vol/TVL ratio < 1% → +1500, < 10% → +500
 *  - bearish alpha:   alphaScore < -0.3 → +2000·|score|, bullish → −1000·score (floor 0 term-wise)
 *  - broken identity: +10000 (forces SKIP)
 * @param input ReasonInput (tvl, volume, fees, alpha, identity).
 * @param thresholdBps ACT/SKIP cutoff in bps.
 * @returns ReasonOutput with riskScoreBps, decision, rationale, and factors.
 */
export function analyzeRisk(input: ReasonInput, thresholdBps: number = DEFAULT_THRESHOLD_BPS): ReasonOutput {
  const factors: ReasonOutput["factors"] = [];
  let score = 0;

  if (input.identityOk === false) {
    factors.push({ name: "identity", bps: 10_000, note: "agent identity revoked/expired — hard block" });
    return finish(10_000, factors, thresholdBps);
  }

  const tvl = Math.max(0, input.tvlUsd);
  const vol = Math.max(0, input.volume24hUsd);
  if (tvl < 100_000) {
    score += 3500;
    factors.push({ name: "thin-liquidity", bps: 3500, note: `TVL $${tvl.toFixed(0)} < $100k — exit risk` });
  } else if (tvl < 1_000_000) {
    score += 1500;
    factors.push({ name: "thin-liquidity", bps: 1500, note: `TVL $${tvl.toFixed(0)} < $1M — moderate depth` });
  } else {
    score += 200;
    factors.push({ name: "liquidity", bps: 200, note: `TVL $${tvl.toFixed(0)} — deep enough` });
  }

  const turnover = tvl > 0 ? vol / tvl : 0;
  if (turnover < 0.01) {
    score += 1500;
    factors.push({ name: "low-activity", bps: 1500, note: `24h turnover ${(turnover * 100).toFixed(2)}% — stale pool` });
  } else if (turnover < 0.1) {
    score += 500;
    factors.push({ name: "activity", bps: 500, note: `24h turnover ${(turnover * 100).toFixed(1)}% — modest flow` });
  } else {
    factors.push({ name: "activity", bps: 0, note: `24h turnover ${(turnover * 100).toFixed(1)}% — healthy flow` });
  }

  const { value: alpha, invalid: alphaInvalid } = sanitizeAlphaScore(input.alphaScore);
  if (alphaInvalid) {
    factors.push({ name: "alpha-invalid", bps: 0, note: "paid signal alpha invalid — treated as neutral (0)" });
  }
  if (alpha < -0.3) {
    const add = Math.round(2000 * Math.abs(alpha));
    score += add;
    factors.push({ name: "bearish-alpha", bps: add, note: `paid signal bearish (${alpha.toFixed(2)})` });
  } else if (alpha > 0.3) {
    const sub = Math.round(1000 * alpha);
    score = Math.max(0, score - sub);
    factors.push({ name: "bullish-alpha", bps: -sub, note: `paid signal bullish (${alpha.toFixed(2)})` });
  } else {
    factors.push({ name: "alpha", bps: 0, note: `paid signal neutral (${alpha.toFixed(2)})` });
  }

  return finish(score, factors, thresholdBps);
}

function finish(score: number, factors: ReasonOutput["factors"], thresholdBps: number): ReasonOutput {
  const riskScoreBps = Math.min(10_000, Math.round(score));
  const decision = riskScoreBps <= thresholdBps ? "ACT" : "SKIP";
  const summary = factors.map((f) => `${f.name} ${f.bps >= 0 ? "+" : ""}${f.bps}bps (${f.note})`).join("; ");
  return {
    riskScoreBps,
    decision,
    rationale: `${decision} @ ${riskScoreBps}bps vs threshold ${thresholdBps}bps. ${summary}.`,
    factors,
  };
}

/**
 * LLM plug point: swap heuristic rationale for model-generated text.
 *
 * Default stays heuristic (no network, no key). Pass `{ llm: true, ... }`
 * to attempt `brain.ts:reasonWithLLM()` — ANY LLM failure falls back to
 * `base.rationale`. Dynamic import avoids a reason↔brain require cycle.
 * @param input ReasonInput scored by the heuristic/LLM paths.
 * @param base Heuristic verdict used as the fallback rationale.
 * @param opts Set llm true to attempt the brain.ts LLM path.
 * @returns Rationale string (LLM text on success, heuristic text otherwise).
 */
export async function llmRationale(
  input: ReasonInput,
  base: ReasonOutput,
  opts: { llm?: boolean } = {},
): Promise<string> {
  if (!opts.llm) return base.rationale;
  try {
    const { reasonWithLLM } = await import("./brain.js");
    const out = await reasonWithLLM(
      { tvlUsd: input.tvlUsd, volume24hUsd: input.volume24hUsd, fees24hUsd: input.fees24hUsd },
      { score: input.alphaScore, direction: input.alphaDirection },
      { identityOk: input.identityOk },
      DEFAULT_THRESHOLD_BPS,
    );
    return out.rationale;
  } catch {
    return base.rationale;
  }
}
