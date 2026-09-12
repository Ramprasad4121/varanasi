"use client";

// Author: Ramprasad — client-side deterministic demo finance engine.
// Mirrors service/src/finance/index.ts and agent/src/finance/finance.ts so the
// /finance page can render standalone (no network). All values are SIMULATED
// and clearly labeled — no real funds, no onchain calls.
import type {
  Address,
  ChitPoolState,
  CollateralPosition,
  FinancialRecommendation,
  GoldPosition,
  LoanState,
  ReputationScores,
  SavingsVaultState,
} from "@/finance-types";

const SCALE = BigInt(10) ** BigInt(18);

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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

export interface FinanceSnapshot {
  savings: SavingsVaultState;
  chit: ChitPoolState;
  loans: LoanState[];
  collateral: CollateralPosition;
  gold: GoldPosition;
  reputation: ReputationScores;
}

export function demoFinance(address: Address): FinanceSnapshot {
  const A = address.toLowerCase();
  const rand = mulberry32(fnv1a(`fin:${A}`));

  const balance = BigInt(Math.floor(100 + rand() * 4_900)) * SCALE;
  const savings: SavingsVaultState = {
    open: true,
    balance,
    deposited: balance,
        withdrawn: BigInt(0),
  };

  const contribution = BigInt(1_000) * SCALE;
  const chit: ChitPoolState = {
    round: BigInt(4),
    roundDeadline: BigInt(Math.floor(Date.now() / 1000) + 6 * 24 * 3600),
    settledRounds: BigInt(3),
    poolEnded: false,
    starter: address,
    config: {
      token: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      contributionAmount: contribution,
      memberCapacity: BigInt(3),
      totalRounds: BigInt(12),
      roundDuration: BigInt(60) * BigInt(24) * BigInt(3600),
    },
    members: [
      address,
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    ],
  };

  const principal = BigInt(2_500) * SCALE;
  const loans: LoanState[] = [
    {
      loanId: peek(`loan:${A}`, 64),
      status: "active",
            fundedAt: BigInt(0),
      principal,
      interestBps: BigInt(500),
      termSeconds: BigInt(90) * BigInt(24) * BigInt(3600),
      borrower: address,
      lender: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      collateralPositionId: peek(`collat:${A}`, 64),
            totalRepaid: BigInt(0),
    },
  ];

  const collateral: CollateralPosition = {
    positionId: loans[0].collateralPositionId,
    token: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
    owner: address,
    amount: BigInt(3_000) * SCALE,
  };

  const gold: GoldPosition = {
    assetId: peek(`gold:${A}`, 64),
    grams: BigInt(10),
    finenessBps: BigInt(9_990),
    custodianName: "Varanasi Keeper Vault",
    owner: address,
    attestor: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    status: "minted",
        version: BigInt(0),
  };

  const repRand = rand();
  const creditScoreBps = BigInt(5_000) + BigInt(Math.floor(repRand * 2_000));
  const reputation: ReputationScores = {
    creditScoreBps,
    riskScoreBps: BigInt(5_500) - BigInt(Math.floor(repRand * 2_000)),
    isFlagged: false,
  };

  return { savings, chit, loans, collateral, gold, reputation };
}

function peek(namespace: string, hexLen: number): `0x${string}` {
  return `0x${fnv1a(namespace).toString(16).padStart(hexLen, "0")}` as `0x${string}`;
}

export function recommendFrom(
  s: FinanceSnapshot,
  _address: Address,
): FinancialRecommendation[] {
  const out: FinancialRecommendation[] = [];

  if (s.reputation.isFlagged) {
    return [
      {
        action: "no_action",
        rationale: "RiskGuard flags this user — clear outstanding defaults before any new exposure.",
        estimatedCost: BigInt(0),
        riskLevel: "high",
      },
    ];
  }

  const floor = BigInt(1_000) * SCALE;
  if (s.savings.open && s.savings.balance < floor) {
    out.push({
      action: "deposit_savings",
      rationale: `Top up the savings vault toward a 1,000 vUSD comfort floor. Current balance: ${fmt(s.savings.balance)}.`,
      estimatedCost: floor - s.savings.balance,
      riskLevel: "low",
    });
  }

  const active = s.loans.find((l) => l.status === "active");
  if (active) {
    const interest = (active.principal * active.interestBps) / BigInt(10_000);
    out.push({
      action: "repay_loan",
      rationale: `Repay the active ${fmt(active.principal)} vUSD loan (${fmt(interest)} interest due) and free ${fmt(s.collateral.amount)} of collateral.`,
      estimatedCost: active.principal + interest,
      riskLevel: "medium",
    });
  } else if (s.reputation.creditScoreBps >= BigInt(7_000)) {
    out.push({
      action: "join_chit",
      rationale: `Credit score ${pct(s.reputation.creditScoreBps)} — you qualify for the demo chit pool. Contribute ${fmt(s.chit.config.contributionAmount)} per round.`,
      estimatedCost: s.chit.config.contributionAmount,
      riskLevel: "medium",
    });
  }

  if (s.gold.status === "verified") {
    out.push({
      action: "redeem_gold",
      rationale: `${s.gold.grams.toString()}g is verified but unminted — mint it to keep the position live.`,
      estimatedCost: BigInt(0),
      riskLevel: "low",
    });
  } else if (s.gold.status === "minted") {
    out.push({
      action: "no_action",
      rationale: `${s.gold.grams.toString()}g ${s.gold.custodianName} bar is minted and settled. No action needed.`,
      estimatedCost: BigInt(0),
      riskLevel: "low",
    });
  } else {
    out.push({
      action: "no_action",
      rationale: "Portfolio is healthy — no action required this month.",
      estimatedCost: BigInt(0),
      riskLevel: "low",
    });
  }

  if (out.length === 0) {
    out.push({
      action: "no_action",
      rationale: "Portfolio is healthy — no action required this month.",
      estimatedCost: BigInt(0),
      riskLevel: "low",
    });
  }
  return out;
}

export function fmt(v: bigint): string {
  const whole = v / SCALE;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} vUSD`;
}

export function pct(v: bigint): string {
  return `${(Number(v) / 100).toFixed(2)}%`;
}