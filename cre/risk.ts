/**
 * @author Ramprasad
 * @module risk — pure, dependency-free risk scorer for the varanasi CRE workflow.
 *
 * Env deps: none (pure function of public inputs + confidential params).
 *
 * This mirrors `agent/src/reason.ts` (same tiers, same bps math) so the
 * offchain agent heuristic and the enclave computation agree by construction.
 * The difference: threshold + strategy weights + operator allowlist are
 * CONFIDENTIAL inputs here — they are fetched from the Vault DON inside the
 * TEE (`runtime.getSecret`) and never leave the enclave. Only the returned
 * verdict crosses `usingTheDons()` for DON consensus / RiskGuard settlement.
 *
 * No CRE SDK imports: unit-testable anywhere (bun test, node, vitest).
 */

export interface PoolPublicInputs {
  /** e.g. "USDC/ETH-0.3%" — public, arrives via the HTTP trigger payload. */
  poolId: string;
  tvlUsd: number;
  volume24hUsd: number;
  /** Premium alpha from the x402 service: -1 (bearish) … +1 (bullish). */
  alphaScore: number;
  /** Agent wallet requesting the action; checked against the allowlist. */
  operator?: string;
}

export interface ConfidentialParams {
  /** Private risk threshold in bps. NEVER leaves the enclave. */
  thresholdBps: number;
  /** Private per-factor multipliers; lets the operator tune sensitivity unseen. */
  strategyWeights: {
    liquidity: number;
    activity: number;
    alpha: number;
  };
  /** Private allowlist of agent wallets; membership is checked in-enclave. */
  operatorAllowlist: string[];
}

export interface RiskVerdict {
  poolId: string;
  riskScoreBps: number;
  decision: 'ACT' | 'SKIP';
  factors: { name: string; bps: number; note: string }[];
}

export const DEFAULT_WEIGHTS: ConfidentialParams['strategyWeights'] = {
  liquidity: 1,
  activity: 1,
  alpha: 1,
};

/**
 * Heuristic risk model (all terms in bps, higher = riskier) — same tiers as
 * agent/src/reason.ts, each term scaled by its confidential strategy weight:
 *  - thin liquidity:  TVL < $100k → +3500, < $1M → +1500, else +200
 *  - low activity:    vol/TVL ratio < 1% → +1500, < 10% → +500, else +0
 *  - bearish alpha:   alphaScore < -0.3 → +2000·|score|, bullish (>0.3) → −1000·score
 *  - unlisted operator (when allowlist non-empty and operator given): +10000 (forces SKIP)
 */
export function scorePoolRisk(
  input: PoolPublicInputs,
  confidential: ConfidentialParams,
): RiskVerdict {
  const factors: RiskVerdict['factors'] = [];
  const w = { ...DEFAULT_WEIGHTS, ...confidential.strategyWeights };
  let score = 0;

  // Operator allowlist gate — evaluated inside the enclave so the roster of
  // approved agents is never revealed to node operators.
  if (input.operator && confidential.operatorAllowlist.length > 0) {
    const listed = confidential.operatorAllowlist.some(
      (a) => a.toLowerCase() === input.operator!.toLowerCase(),
    );
    if (!listed) {
      factors.push({
        name: 'operator-allowlist',
        bps: 10_000,
        note: 'operator not on confidential allowlist — hard block',
      });
      return finish(input.poolId, 10_000, factors, confidential.thresholdBps);
    }
    factors.push({ name: 'operator-allowlist', bps: 0, note: 'operator allowlisted' });
  }

  const tvl = Math.max(0, input.tvlUsd);
  const vol = Math.max(0, input.volume24hUsd);
  if (tvl < 100_000) {
    const bps = Math.round(3500 * w.liquidity);
    score += bps;
    factors.push({ name: 'thin-liquidity', bps, note: `TVL $${tvl.toFixed(0)} < $100k — exit risk` });
  } else if (tvl < 1_000_000) {
    const bps = Math.round(1500 * w.liquidity);
    score += bps;
    factors.push({ name: 'thin-liquidity', bps, note: `TVL $${tvl.toFixed(0)} < $1M — moderate depth` });
  } else {
    const bps = Math.round(200 * w.liquidity);
    score += bps;
    factors.push({ name: 'liquidity', bps, note: `TVL $${tvl.toFixed(0)} — deep enough` });
  }

  const turnover = tvl > 0 ? vol / tvl : 0;
  if (turnover < 0.01) {
    const bps = Math.round(1500 * w.activity);
    score += bps;
    factors.push({
      name: 'low-activity',
      bps,
      note: `24h turnover ${(turnover * 100).toFixed(2)}% — stale pool`,
    });
  } else if (turnover < 0.1) {
    const bps = Math.round(500 * w.activity);
    score += bps;
    factors.push({
      name: 'activity',
      bps,
      note: `24h turnover ${(turnover * 100).toFixed(1)}% — modest flow`,
    });
  } else {
    factors.push({
      name: 'activity',
      bps: 0,
      note: `24h turnover ${(turnover * 100).toFixed(1)}% — healthy flow`,
    });
  }

  const alpha = input.alphaScore ?? 0;
  if (alpha < -0.3) {
    const bps = Math.round(2000 * Math.abs(alpha) * w.alpha);
    score += bps;
    factors.push({ name: 'bearish-alpha', bps, note: `paid signal bearish (${alpha.toFixed(2)})` });
  } else if (alpha > 0.3) {
    const bps = -Math.round(1000 * alpha * w.alpha);
    score = Math.max(0, score + bps);
    factors.push({ name: 'bullish-alpha', bps, note: `paid signal bullish (${alpha.toFixed(2)})` });
  } else {
    factors.push({ name: 'alpha', bps: 0, note: `paid signal neutral (${alpha.toFixed(2)})` });
  }

  return finish(input.poolId, score, factors, confidential.thresholdBps);
}

function finish(
  poolId: string,
  score: number,
  factors: RiskVerdict['factors'],
  thresholdBps: number,
): RiskVerdict {
  const riskScoreBps = Math.min(10_000, Math.round(score));
  const decision = riskScoreBps <= thresholdBps ? 'ACT' : 'SKIP';
  return { poolId, riskScoreBps, decision, factors };
}
