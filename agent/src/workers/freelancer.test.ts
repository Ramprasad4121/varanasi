import { describe, it, expect, vi } from "vitest";
import type { Address, Hash } from "viem";
import { decideFreelancerAction, runFreelancer } from "./freelancer.js";
import type { EscrowTask, EscrowWallet } from "../escrow.js";

const TASK_ID = ("0x" + "ab".repeat(32)) as Hash;
const TX = ("0x" + "cc".repeat(32)) as Hash;
const NOW = 1_700_100_000;

function task(over: Partial<EscrowTask> = {}): EscrowTask {
  return {
    payer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
    agent: "0x1111111111111111111111111111111111111111" as Address,
    merchant: "0x2222222222222222222222222222222222222222" as Address,
    token: "0x3333333333333333333333333333333333333333" as Address,
    cap: 1_000_000n,
    fundedAmount: 999_000n,
    windowStart: 1_700_000_000n,
    windowEnd: 1_700_086_400n,
    expiry: 1_700_172_800n,
    scoreBps: 0n,
    validator: "0x0000000000000000000000000000000000000000" as Address,
    state: 1,
    label: "Funded",
    ...over,
  };
}

const wallet = {} as EscrowWallet;

describe("decideFreelancerAction (pure)", () => {
  it("releases on Validated", () => {
    expect(decideFreelancerAction(task({ state: 2, label: "Validated" }), NOW)).toBe("released");
  });
  it("refunds Funded strictly past expiry", () => {
    expect(decideFreelancerAction(task({ state: 1, expiry: BigInt(NOW - 1) }), NOW)).toBe("refunded");
  });
  it("pends Funded inside the refund gate (never early-refund)", () => {
    expect(decideFreelancerAction(task({ state: 1 }), NOW)).toBe("pending");
    expect(decideFreelancerAction(task({ state: 1, expiry: BigInt(NOW) }), NOW)).toBe("pending");
  });
  it("noops on terminal states, pends on unknown", () => {
    expect(decideFreelancerAction(task({ state: 3, label: "Released" }), NOW)).toBe("noop");
    expect(decideFreelancerAction(task({ state: 4, label: "Refunded" }), NOW)).toBe("noop");
    expect(decideFreelancerAction(task({ state: 5, label: "Cancelled" }), NOW)).toBe("noop");
    expect(decideFreelancerAction(task({ state: 0, label: "None" }), NOW)).toBe("pending");
  });
});

describe("runFreelancer (injected escrow, no network, no keys)", () => {
  it("releases on Validated and returns the receipt", async () => {
    const release = vi.fn(async () => TX);
    const refund = vi.fn(async () => TX);
    const res = await runFreelancer(
      TASK_ID,
      wallet,
      { nowSec: NOW },
      { getTask: async () => task({ state: 2, label: "Validated" }), release, refund },
    );
    expect(res).toMatchObject({ taskId: TASK_ID, action: "released", txHash: TX, label: "Validated" });
    expect(release).toHaveBeenCalledWith(TASK_ID, wallet);
    expect(refund).not.toHaveBeenCalled();
  });

  it("refunds past expiry without validation", async () => {
    const release = vi.fn(async () => TX);
    const refund = vi.fn(async () => TX);
    const res = await runFreelancer(
      TASK_ID,
      wallet,
      { nowSec: NOW },
      { getTask: async () => task({ state: 1, label: "Funded", expiry: BigInt(NOW - 1) }), release, refund },
    );
    expect(res).toMatchObject({ action: "refunded", txHash: TX });
    expect(refund).toHaveBeenCalledWith(TASK_ID, wallet);
    expect(release).not.toHaveBeenCalled();
  });

  it("broadcasts nothing while Funded inside the gate (fail-closed pending)", async () => {
    const release = vi.fn(async () => TX);
    const refund = vi.fn(async () => TX);
    const res = await runFreelancer(
      TASK_ID,
      wallet,
      { nowSec: NOW },
      { getTask: async () => task({ state: 1, label: "Funded" }), release, refund },
    );
    expect(res).toMatchObject({ action: "pending", txHash: null });
    expect(release).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it("rejects a mandate bound to a different taskId", async () => {
    const getTask = vi.fn(async () => task({ state: 2, label: "Validated" }));
    await expect(
      runFreelancer(
        TASK_ID,
        wallet,
        {
          nowSec: NOW,
          mandate: {
            agent: "0x1111111111111111111111111111111111111111" as Address,
            merchant: "0x2222222222222222222222222222222222222222" as Address,
            token: "0x3333333333333333333333333333333333333333" as Address,
            cap: 1_000_000n,
            windowStart: 1_700_000_000n,
            windowEnd: 1_700_086_400n,
            expiry: 1_700_172_800n,
            nonce: 7n,
            chainId: 11155111n,
          },
        },
        { getTask },
      ),
    ).rejects.toThrow("does not bind");
    expect(getTask).not.toHaveBeenCalled();
  });
});
