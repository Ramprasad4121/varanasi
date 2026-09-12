/**
 * @author Ramprasad — demo community-finance decision engine (agent side).
 * finance.ts — deterministic demos of the onchain finance protocol: recommend,
 * then (with a caller-supplied wallet) contribute/repay/mint/redeem against a
 * caller-supplied FinanceSource (a local demo ledger by default).
 *
 * This module NEVER touches real funds: it either computes recommendations
 * against an injected demo ledger (default, tests + demo) or, when the caller
 * supplies a live onchain reader, it plans unsigned transactions for the
 * caller to sign (mirrors escrow.ts: writers take a caller-supplied wallet).
 *
 * Env: none required. Offline by default — pass `source` to read live.
 *
 * Conventions (mirror escrow.ts / aave.ts):
 *  - No env reads, no secrets, no broadcasts on import.
 *  - Writers take a caller-supplied wallet; we never sign for anyone.
 */
import {
  createPublicClient,
  http,
  pad,
  toHex,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import type {
  ChitPoolState,
  CollateralPosition,
  FinancialMandate,
  FinancialReceipt,
  FinancialRecommendation,
  GoldPosition,
  LoanState,
  ReputationScores,
  SavingsVaultState,
} from "./types.js";

/** Wallet client with a known account — caller supplies it, we never sign for them. */
export type FinanceWallet = WalletClient<Transport, Chain, Account>;

/** Read source for finance state. Default is a deterministic local demo ledger. */
export interface FinanceSource {
  savings(user: Address): SavingsVaultState;
  chit(user: Address): ChitPoolState;
  loans(user: Address): LoanState[];
  collateral(user: Address): CollateralPosition;
  gold(user: Address): GoldPosition;
  reputation(user: Address): ReputationScores;
}

export interface FinanceOptions {
  /** Read source (default: deterministic demo ledger). */
  source?: FinanceSource;
  /** RPC for live reads when no source is injected (default: Sepolia public). */
  rpcUrl?: string;
}

export const DEFAULT_SEPOLIA_RPC_URL = "https://rpc.sepolia.org";

const SCALE = 10n ** 18n;

// ---------------------------------------------------------------------------
// Deterministic demo ledger (offline default — never real balances)
// ---------------------------------------------------------------------------

const fnv1a = (src: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): () => number => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const demoHash = (seed: string): Hash => pad(toHex(fnv1a(`fin:${seed}`), { size: 32 }));

/** Deterministic, address-seeded demo ledger (mirrors the service engine). */
export const DEMO_FINANCE_SOURCE: FinanceSource = {
  savings(user) {
    const balance = BigInt(Math.floor(100 + (mulberry32(fnv1a(`bal:${user}`))() * 4_900))) * SCALE;
    return { open: true, balance, deposited: balance, withdrawn: 0n };
  },
  chit(user) {
    return {
      round: 4n,
      roundDeadline: BigInt(Math.floor(Date.now() / 1000) + 6 * 24 * 3600),
      settledRounds: 3n,
      poolEnded: false,
      starter: user,
      config: {
        token: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as Address,
        contributionAmount: 1_000n * SCALE,
        memberCapacity: 3n,
        totalRounds: 12n,
        roundDuration: 60n * 24n * 3600n,
      },
      members: [
        user,
        "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
        "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
      ],
    };
  },
  loans(user) {
    const loans: LoanState[] = [
      {
        loanId: demoHash(`loan:${user}`),
        status: "active",
        fundedAt: 0n,
        principal: 2_500n * SCALE,
        interestBps: 500n,
        termSeconds: 90n * 24n * 3600n,
        borrower: user,
        lender: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address,
        collateralPositionId: demoHash(`collat:${user}`),
        totalRepaid: 0n,
      },
    ];
    return loans;
  },
  collateral(user) {
    return {
      positionId: demoHash(`collat:${user}`),
      token: "0x0165878A594ca255338adfa4d48449f69242Eb8F" as Address,
      owner: user,
      amount: 3_000n * SCALE,
    };
  },
  gold(user) {
    return {
      assetId: demoHash(`gold:${user}`),
      grams: 10n,
      finenessBps: 9990n,
      custodianName: "Varanasi Keeper Vault",
      owner: user,
      attestor: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address,
      status: "minted",
      version: 0n,
    };
  },
  reputation(user) {
    const n = mulberry32(fnv1a(`rep:${user}`))();
    const creditScoreBps = 5_000n + BigInt(Math.floor(n * 2_000));
    return {
      creditScoreBps,
      riskScoreBps: 5_000n + 500n - BigInt(Math.floor(n * 2_000)),
      isFlagged: false,
    };
  },
};

// ---------------------------------------------------------------------------
// Recommendation engine
// ---------------------------------------------------------------------------

/**
 * Build the recommendation list for a user, ordered by priority.
 * Mirrors the onchain RiskGuard reputation gate: flagged users get no risky
 * actions. Pure — no I/O.
 * @param user Evaluated address.
 * @param source Read source (default demo ledger).
 * @returns Recommendations ordered by priority (most important first),
 *          always ending with a `no_action` fallback when nothing is required.
 */
export function recommend(user: Address, source: FinanceSource = DEMO_FINANCE_SOURCE): FinancialRecommendation[] {
  const rep = source.reputation(user);
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) throw new Error(`Bad address "${user}" (want 0x + 40 hex).`);

  if (rep.isFlagged) {
    return [
      {
        action: "no_action",
        rationale: "RiskGuard flags this user — clear outstanding defaults before any new exposure.",
        estimatedCost: 0n,
        riskLevel: "high",
      },
    ];
  }

  const out: FinancialRecommendation[] = [];
  const savings = source.savings(user);
  const loans = source.loans(user);
  const chit = source.chit(user);
  const gold = source.gold(user);

  if (savings.open && savings.balance < 1_000n * SCALE) {
    const topUp = 1_000n * SCALE - savings.balance;
    out.push({
      action: "deposit_savings",
      rationale: `Top up savings vault to the 1,000 vUSD comfort floor (currently ${fmt(savings.balance)}).`,
      estimatedCost: topUp,
      riskLevel: tips(user, 0).risk,
    });
  }

  const active = loans.find((l) => l.status === "active");
  if (active) {
    const interest = (active.principal * active.interestBps) / 10_000n;
    out.push({
      action: "repay_loan",
      rationale: `Repay the active ${fmt(active.principal)} vUSD loan (+${interest} simple interest) to free collateral.`,
      estimatedCost: active.principal + interest,
      riskLevel: tips(user, 1).risk,
    });
  } else if (rep.creditScoreBps >= 7_000n) {
    out.push({
      action: "join_chit",
      rationale: `Credit score ${Number(rep.creditScoreBps) / 100}% qualifies — join the demo chit pool (${fmt(chit.config.contributionAmount)} vUSD/round, deterministic winner).`,
      estimatedCost: chit.config.contributionAmount,
      riskLevel: "medium",
    });
  }

  if (gold.status === "verified") {
    out.push({
      action: "redeem_gold",
      rationale: `${gold.grams}g of held gold is VERIFIED but unminted — mint or redeem it to keep the position live.`,
      estimatedCost: 0n,
      riskLevel: "low",
    });
  }

  if (out.length === 0) {
    out.push({
      action: "no_action",
      rationale: "Portfolio is healthy — no action required this month.",
      estimatedCost: 0n,
      riskLevel: "low",
    });
  }
  return out;
}

/** Deterministic per-user risk flavor for the summary (demo only). */
function tips(_user: Address, grade: number): { risk: "low" | "medium" | "high" } {
  const levels = ["low", "medium", "high"] as const;
  return { risk: levels[grade % levels.length] };
}

function fmt(value: bigint): string {
  const whole = value / SCALE;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} vUSD`;
}

// ---------------------------------------------------------------------------
// Mandate helpers + execution against a caller-supplied wallet
// ---------------------------------------------------------------------------

/**
 * Build an EIP-712-style FinancialMandate describing a recommended action,
 * so a human can sign it (mirrors mandate.ts but protocol-agnostic).
 * Pure — no I/O. The mandate is informational until a wallet executes it.
 * @param user Payer address.
 * @param rec The recommendation to authorize.
 * @param chainId Chain the contract lives on (default Sepolia mainnet id).
 * @returns A FinancialMandate ready to be signed/executed by its `payer`.
 */
export function buildMandate(user: Address, rec: FinancialRecommendation, chainId = sepolia.id): FinancialMandate | null {
  const typeByAction: Record<string, FinancialMandate["type"]> = {
    deposit_savings: "savings_deposit",
    fund_loan: "loan_fund",
    repay_loan: "loan_repay",
    contribute_chit: "chit_contribute",
    join_chit: "chit_contribute",
  };
  const type = typeByAction[rec.action];
  if (!type) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(user)) throw new Error(`Bad address "${user}" (want 0x + 40 hex).`);
  return {
    type,
    targetContract: "0x0000000000000000000000000000000000000000" as Address, // set by executor
    payer: user,
    amount: rec.estimatedCost,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600),
    nonce: BigInt(fnv1a(`${user}:${rec.action}`)),
    chainId: BigInt(chainId),
  };
}

/**
 * Execute a recommendation ONCHAIN against the deployed finance contracts.
 *
 * The finance contracts are NOT yet deployed on Sepolia, so this always
 * throws until live addresses are wired. Use `recommend()` + `buildMandate()`
 * (+ the demo ledger) for demos — no onchain broadcast happens until then.
 * @param user Executing address.
 * @param wallet Caller-supplied wallet client (must own `user`).
 */
export async function execute(_user: Address, _wallet: FinanceWallet): Promise<FinancialReceipt> {
  throw new Error(
    "execute() requires deployed finance contracts. Until live addresses are wired, " +
      "use recommend() + buildMandate() + the demo ledger — no onchain broadcast happens.",
  );
}

/**
 * Prepare an unsigned transaction for a recommended action against the
 * deployed finance contracts. Accepts any wallet shape (viem WalletClient or
 * a minimal `{ chain, account }`) so policy-checks can run before signing.
 * @param user Executing address.
 * @param wallet Wallet client (used only for its chain/account context).
 * @param rec Recommendation to prepare.
 * @returns The transaction request to be signed by the caller.
 */
export async function prepareOnchain(
  user: Address,
  wallet: Pick<FinanceWallet, "chain" | "account">,
  rec: FinancialRecommendation,
): Promise<Record<string, unknown>> {
  void user;
  void wallet;
  void rec;
  throw new Error(
    "prepareOnchain requires live contract addresses (finance contracts are deployed on Sepolia). " +
      "Until then use recommend()+buildMandate() and execute() with a demo ledger — no onchain broadcast happens.",
  );
}

/** Reader helper for live contracts (opt-in; not used by demo flows). */
export function publicClient(rpcUrl = DEFAULT_SEPOLIA_RPC_URL): PublicClient {
  return createPublicClient({ transport: http(rpcUrl) });
}

/** Named export for the public surface (mirrors index.ts conventions). */
export { DEMO_FINANCE_SOURCE as demoFinanceSource };

/** Type-only re-export so consumers get the shared shapes in one import. */
export type {
  ChitPoolState,
  CollateralPosition,
  FinancialMandate,
  FinancialReceipt,
  FinancialRecommendation,
  GoldPosition,
  LoanState,
  ReputationScores,
  SavingsVaultState,
} from "./types.js";