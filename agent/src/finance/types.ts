/**
 * @author Ramprasad — shared finance protocol types — MIRROR of frontend/finance-types/index.ts (single source of truth); keep in sync.
 * index.ts — mirrors contracts/src/finance/*.sol status enums and struct layouts.
 *
 * Imported by:
 *   frontend/            — finance pages
 *   service/src/finance/ — /v1/finance/* API handlers
 *   agent/src/finance/   — finance decision engine
 *
 * No runtime deps; dependency-free so the service (no viem) and agent can
 * both import it. Type aliases are string template literals: consumers pass
 * them straight to viem / ethers / the Hedera SDK.
 */
export type Address = `0x${string}`;
export type Hash = `0x${string}`;
export type Hex = `0x${string}`;

// ---------------------------------------------------------------------------
// SavingsVault
// ---------------------------------------------------------------------------

export interface SavingsVaultConfig {
  owner: Address;
  token: Address;
  monthlyCap: bigint;
  keptBps: bigint; // basis points 0-10_000 kept by keeper
  recurringMonths: bigint; // 0 = disabled
  roundSeconds: bigint; // 0 = no recurring schedule
}

export interface SavingsVaultState {
  open: boolean;
  balance: bigint;
  deposited: bigint;
  withdrawn: bigint;
}

// ---------------------------------------------------------------------------
// ChitPool
// ---------------------------------------------------------------------------

export type ChitPoolStatus = "open" | "ended";

export interface ChitPoolConfig {
  token: Address;
  contributionAmount: bigint;
  memberCapacity: bigint;
  totalRounds: bigint;
  roundDuration: bigint;
}

export interface ChitPoolState {
  round: bigint;
  roundDeadline: bigint;
  settledRounds: bigint;
  poolEnded: boolean;
  starter: Address;
  config: ChitPoolConfig;
  members: Address[];
}

export interface ChitRoundResult {
  round: bigint;
  winner: Address;
  corpus: bigint;
  contributedCount: bigint;
}

// ---------------------------------------------------------------------------
// LoanAgreement
// ---------------------------------------------------------------------------

export type LoanStatus = "created" | "funded" | "active" | "repaid" | "defaulted";

export interface LoanParams {
  borrower: Address;
  collateralPositionId: Hex;
  principal: bigint;
  interestBps: bigint;
  termSeconds: bigint;
  token: Address;
  collateralToken: Address;
  collateralAmount: bigint;
}

export interface LoanState {
  loanId: Hash;
  status: LoanStatus;
  fundedAt: bigint;
  principal: bigint;
  interestBps: bigint;
  termSeconds: bigint;
  borrower: Address;
  lender: Address;
  collateralPositionId: Hex;
  totalRepaid: bigint;
}

// ---------------------------------------------------------------------------
// CollateralVault
// ---------------------------------------------------------------------------

export interface CollateralPosition {
  positionId: Hex;
  token: Address;
  owner: Address;
  amount: bigint;
}

// ---------------------------------------------------------------------------
// Gold
// ---------------------------------------------------------------------------

export type GoldPositionStatus = "none" | "verified" | "revoked" | "minted" | "redeemed";

export interface GoldPosition {
  assetId: Hash;
  grams: bigint;
  finenessBps: bigint;
  custodianName: string;
  owner: Address;
  attestor: Address;
  status: GoldPositionStatus;
  version: bigint;
}

// ---------------------------------------------------------------------------
// FinancialReputation
// ---------------------------------------------------------------------------

export interface ReputationProfile {
  defaults: bigint;
  funded: bigint;
  repaid: bigint;
  settledRounds: bigint;
  missedRounds: bigint;
  slashEvents: bigint;
}

export interface ReputationScores {
  creditScoreBps: bigint; // baseline 5_000, cap 10_000
  riskScoreBps: bigint;
  isFlagged: boolean;
}

// ---------------------------------------------------------------------------
// FinancialMandate
// ---------------------------------------------------------------------------

export type MandateType =
  | "savings_deposit"
  | "loan_fund"
  | "loan_repay"
  | "chit_contribute"
  | "chit_settle";

export interface FinancialMandate {
  type: MandateType;
  targetContract: Address;
  payer: Address;
  amount: bigint;
  expiry: bigint;
  nonce: bigint;
  chainId: bigint;
}

// ---------------------------------------------------------------------------
// Agent Finance Engine
// ---------------------------------------------------------------------------

export type RecommendationAction =
  | "open_savings"
  | "deposit_savings"
  | "join_chit"
  | "contribute_chit"
  | "request_loan"
  | "fund_loan"
  | "repay_loan"
  | "redeem_gold"
  | "no_action";

export interface FinancialRecommendation {
  action: RecommendationAction;
  rationale: string;
  estimatedCost: bigint;
  riskLevel: "low" | "medium" | "high";
  mandate?: FinancialMandate;
}

export interface FinancialReceipt {
  txHash: Hash;
  blockNumber: bigint;
  action: RecommendationAction;
  timestamp: bigint;
}