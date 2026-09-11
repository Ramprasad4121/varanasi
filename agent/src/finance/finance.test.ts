import { describe, it, expect } from "vitest";
import {
  DEMO_FINANCE_SOURCE,
  buildMandate,
  recommend,
  type FinanceSource,
} from "./finance.js";
import type {
  Address,
  ChitPoolState,
  CollateralPosition,
  GoldPosition,
  LoanState,
  ReputationScores,
  SavingsVaultState,
} from "./types.js";

const ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("finance recommend (demo source)", () => {
  it("is deterministic per address", () => {
    const a = recommend(ADDR);
    const b = recommend(ADDR);
    expect(a).toEqual(b);
  });

  it("always ends with a terminal action", () => {
    const recs = recommend(ADDR);
    expect(recs.length).toBeGreaterThanOrEqual(1);
    const last = recs[recs.length - 1];
    expect(["no_action", "redeem_gold", "repay_loan", "deposit_savings", "join_chit"]).toContain(
      last.action,
    );
    expect(recs.every((r) => r.estimatedCost >= 0n)).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(() => recommend("not-an-address" as Address)).toThrow(/Bad address/);
  });

  it("gates flagged users to no_action", () => {
    const flagged: FinanceSource = {
      ...DEMO_FINANCE_SOURCE,
      reputation: (): ReputationScores => ({
        creditScoreBps: 3000n,
        riskScoreBps: 8000n,
        isFlagged: true,
      }),
    };
    const recs = recommend(ADDR, flagged);
    expect(recs).toHaveLength(1);
    expect(recs[0].action).toBe("no_action");
    expect(recs[0].riskLevel).toBe("high");
  });

  it("prioritizes repay when a loan is active and savings are healthy", () => {
    const healthy: FinanceSource = {
      ...DEMO_FINANCE_SOURCE,
      savings: (): SavingsVaultState => ({
        open: true,
        balance: 5_000n * 10n ** 18n,
        deposited: 5_000n * 10n ** 18n,
        withdrawn: 0n,
      }),
    };
    const recs = recommend(ADDR, healthy);
    expect(recs[0].action).toBe("repay_loan");
  });

  it("suggests deposit when savings are below the comfort floor", () => {
    const poor: FinanceSource = {
      ...DEMO_FINANCE_SOURCE,
      savings: (): SavingsVaultState => ({
        open: true,
        balance: 100n * 10n ** 18n,
        deposited: 100n * 10n ** 18n,
        withdrawn: 0n,
      }),
    };
    const recs = recommend(ADDR, poor);
    expect(recs[0].action).toBe("deposit_savings");
  });

  it("suggests redeem when gold is verified but unminted", () => {
    const unminted: FinanceSource = {
      ...DEMO_FINANCE_SOURCE,
      gold: (): GoldPosition => ({
        assetId: ("0x" + "ab".repeat(32)) as `0x${string}`,
        grams: 10n,
        finenessBps: 9990n,
        custodianName: "Varanasi Keeper Vault",
        owner: ADDR,
        attestor: "0x0000000000000000000000000000000000000000",
        status: "verified",
        version: 0n,
      }),
    };
    const recs = recommend(ADDR, unminted);
    expect(recs.some((r) => r.action === "redeem_gold")).toBe(true);
  });

  it("buildMandate only covers payable actions", () => {
    const recs = recommend(ADDR);
    const payable = recs.find((r) => r.action !== "no_action" && r.action !== "redeem_gold");
    if (payable) {
      const m = buildMandate(ADDR, payable);
      expect(m).not.toBeNull();
      expect(m!.payer).toBe(ADDR);
      expect(m!.chainId).toBe(BigInt(11155111));
      expect(m!.expiry).toBeGreaterThan(0n);
    }
    const none = buildMandate(ADDR, { action: "no_action", rationale: "x", estimatedCost: 0n, riskLevel: "low" });
    expect(none).toBeNull();
  });
});

describe("finance types (compile-time contract)", () => {
  it("surfaces demo values for all onchain surfaces", () => {
    const savings: SavingsVaultState = DEMO_FINANCE_SOURCE.savings(ADDR);
    const chit: ChitPoolState = DEMO_FINANCE_SOURCE.chit(ADDR);
    const loans: LoanState[] = DEMO_FINANCE_SOURCE.loans(ADDR);
    const collat: CollateralPosition = DEMO_FINANCE_SOURCE.collateral(ADDR);
    const gold: GoldPosition = DEMO_FINANCE_SOURCE.gold(ADDR);
    expect(savings.open).toBe(true);
    expect(chit.members).toHaveLength(3);
    expect(loans).toHaveLength(1);
    expect(collat.amount).toBeGreaterThan(0n);
    expect(gold.grams).toBe(10n);
  });
});