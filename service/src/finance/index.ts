/**
 * @author Ramprasad
 * @module finance — DEMO ONLY deterministic mock community-finance engine (service side).
 *
 * Env deps: none (pure; no network calls, no env reads).
 *
 * Produces a stable, address-seeded portfolio snapshot + agent recommendations
 * for the /v1/finance/* routes. Mirrors contracts/src/finance/*.sol semantics
 * (weights, statuses, FinancialReputation logic) OFFCHAIN so agents can
 * exercise the finance decision loop without gas. Makes NO onchain writes.
 *
 * Finance build rules (see AGENTS.md): mock/demo assets only, clearly labeled
 * simulated, no sensitive PII, and the contracts remain the source of truth.
 *
 * TODO(real-index): replace deriveSnapshot with live event indexing from
 * Sepolia contracts + the HCS ledger. Keep the response shape stable so
 * agent/ and frontend/ need no changes.
 */
import type {
  Address,
  ChitPoolState,
  CollateralPosition,
  FinancialRecommendation,
  GoldPosition,
  LoanState,
  ReputationScores,
  SavingsVaultState,
} from './types.js';

export type FinanceEndpointMode = 'summary' | 'recommend';

export interface FinanceSummary {
  address: Address;
  savings: SavingsVaultState;
  chit: ChitPoolState;
  loans: LoanState[];
  collateral: CollateralPosition;
  gold: GoldPosition;
  reputation: ReputationScores;
  generatedAt: string;
  model: 'aegis-finance-demo-v0';
  disclaimer: string;
}

export interface FinanceRecommendationResponse {
  address: Address;
  recommendations: FinancialRecommendation[];
  generatedAt: string;
  model: 'aegis-finance-demo-v0';
  disclaimer: string;
}

const DISCLAIMER =
  'DEMO portfolio from a deterministic mock — simulated balances only, not real funds, not financial advice.';

/** FNV-1a 32-bit hash — small, dependency-free seed (shared shape with signal.ts). */
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

const SCALE = 10n ** 18n; // 18-decimals (vUSD/USDM mock)

/** Address -> demo portfolio is stable across calls (seeded by the address). */
function deriveSnapshot(address: string): {
  savings: SavingsVaultState;
  chit: ChitPoolState;
  loans: LoanState[];
  collateral: CollateralPosition;
  gold: GoldPosition;
  reputation: ReputationScores;
} {
  const rand = mulberry32(fnv1a(`finance:${address.toLowerCase()}`));

  // SavingsVault — deterministic demo balances.
  const balance = BigInt(Math.floor(rand() * 4900 + 100)) * SCALE; // 100..5000 vUSD
  const savings: SavingsVaultState = {
    open: true,
    balance,
    deposited: balance,
    withdrawn: 0n,
  };

  // ChitPool — fixed demo pool the address is a member of.
  const memberCount = 3n;
  const contributionAmount = 1_000n * SCALE;
  const totalRounds = 12n;
  const chit: ChitPoolState = {
    round: 4n,
    roundDeadline: BigInt(Math.floor(Date.now() / 1000) + 6 * 24 * 3600),
    settledRounds: 3n,
    poolEnded: false,
    starter: address as Address,
    config: {
      token: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0' as Address,
      contributionAmount,
      memberCapacity: memberCount,
      totalRounds,
      roundDuration: 60n * 24n * 3600n,
    },
    members: [
      address as Address,
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
    ],
  };

  // Loans — one active loan backed by vUSD collateral.
  const principal = 2_500n * SCALE;
  const loans: LoanState[] = [
    {
      loanId: (`0x${fnv1a(`loan:${address.toLowerCase()}`).toString(16).padStart(64, '0')}`) as `0x${string}`,
      status: 'active',
      fundedAt: BigInt(Math.floor(Date.now() / 1000) - 20 * 24 * 3600),
      principal,
      interestBps: 500n, // 5% simple (matches LoanAgreement demo terms)
      termSeconds: 90n * 24n * 3600n,
      borrower: address as Address,
      lender: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address,
      collateralPositionId: (`0x${fnv1a(`collat:${address.toLowerCase()}`).toString(16).padStart(64, '0')}`) as `0x${string}`,
      totalRepaid: 0n,
    },
  ];
  const collateralAmount = 3_000n * SCALE;
  const collateral: CollateralPosition = {
    positionId: loans[0].collateralPositionId,
    token: '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Address,
    owner: address as Address,
    amount: collateralAmount,
  };

  // Gold — one verified+bought bar.
  const gold: GoldPosition = {
    assetId: (`0x${fnv1a(`gold:${address.toLowerCase()}`).toString(16).padStart(64, '0')}`) as `0x${string}`,
    grams: 10n,
    finenessBps: 9990n,
    custodianName: 'Varanasi Keeper Vault',
    owner: address as Address,
    attestor: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as Address,
    status: 'minted',
    version: 0n,
  };

  // FinancialReputation — deterministic scores around the 5_000 baseline.
  const randScore = Math.floor(rand() * 2000);
  const creditScoreBps = BigInt(5_000 + randScore);
  const riskScoreBps = BigInt(Math.max(100, Math.min(9_000, 5_000 - randScore + 500)));
  const reputation: ReputationScores = {
    creditScoreBps,
    riskScoreBps,
    isFlagged: false,
  };

  return { savings, chit, loans, collateral, gold, reputation };
}

/**
 * Deterministic demo portfolio snapshot for an EVM address.
 * @param addressRaw Wallet or contract address; lowercased and checked.
 * @returns FinanceSummary with simulated savings/chit/loan/gold/reputation and demo disclaimer.
 */
export function financeSummary(addressRaw: unknown, at: Date = new Date()): FinanceSummary {
  const address = parseAddress(addressRaw);
  const snapshot = deriveSnapshot(address);
  return {
    address,
    ...snapshot,
    generatedAt: at.toISOString(),
    model: 'aegis-finance-demo-v0',
    disclaimer: DISCLAIMER,
  };
}

/**
 * Deterministic demo agent recommendations for an address.
 * Mirrors the onchain FinancialReputation + RiskGuard gates: a flagged user
 * gets no risky actions; otherwise order by score-driven opportunity.
 * @param addressRaw Wallet address.
 * @returns FinancialRecommendationResponse with one or more demo recommendations.
 */
export function financeRecommendation(addressRaw: unknown, at: Date = new Date()): FinanceRecommendationResponse {
  const address = parseAddress(addressRaw);
  const snapshot = deriveSnapshot(address);

  const recommendations: FinancialRecommendation[] = [];
  const ration = BigInt(snapshot.reputation.creditScoreBps);

  if (snapshot.reputation.isFlagged) {
    recommendations.push({
      action: 'no_action',
      rationale: 'RiskGuard flagged this user (defaults/failed settlements). Clear the flag before any new exposure.',
      estimatedCost: 0n,
      riskLevel: 'high',
    });
    return { address, recommendations, generatedAt: at.toISOString(), model: 'aegis-finance-demo-v0', disclaimer: DISCLAIMER };
  }

  if (snapshot.savings.open && snapshot.savings.balance < 1_000n * SCALE) {
    recommendations.push({
      action: 'deposit_savings',
      rationale: `Top up your savings vault (balance ${formatAmount(snapshot.savings.balance)} vUSD) toward the 1,000 vUSD comfort floor.`,
      estimatedCost: 1_000n * SCALE - snapshot.savings.balance,
      riskLevel: 'low',
    });
  } else if (snapshot.loans[0]?.status === 'active') {
    recommendations.push({
      action: 'repay_loan',
      rationale: `Repay your active ${formatAmount(snapshot.loans[0].principal)} vUSD loan (5% simple) and free ${formatAmount(snapshot.collateral.amount)} vUSD of collateral.`,
      estimatedCost: snapshot.loans[0].principal + (snapshot.loans[0].principal * 500n) / 10_000n,
      riskLevel: 'low',
    });
  } else if (ration >= 7_000n) {
    recommendations.push({
      action: 'join_chit',
      rationale: `Credit score ${Number(ration) / 100}% qualifies you for the demo chit pool — contribute ${formatAmount(snapshot.chit.config.contributionAmount)} vUSD/round, deterministic rotation winner.`,
      estimatedCost: 1_000n * SCALE,
      riskLevel: 'medium',
    });
  }
  recommendations.push({
    action: 'no_action',
    rationale: 'Portfolio is healthy — no action required this month.',
    estimatedCost: 0n,
    riskLevel: 'low',
  });

  return { address, recommendations, generatedAt: at.toISOString(), model: 'aegis-finance-demo-v0', disclaimer: DISCLAIMER };
}

/** Validates + normalizes an EVM address; throws on bad input. */
function parseAddress(raw: unknown): Address {
  if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error('invalid address: expected 0x + 40 hex chars');
  }
  const lower = raw.toLowerCase();
  return lower as Address;
}

/** Human-readable amount (e.g. "1,250 vUSD"). */
export function formatAmount(value: bigint): string {
  const whole = value / SCALE;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} vUSD`;
}