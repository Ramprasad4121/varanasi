import { describe, it, expect } from "vitest";
import type { Address, Hash } from "viem";
import {
  cancelTask,
  fundMandate,
  isNonceUsed,
  readTask,
  readThresholdBps,
  refundTask,
  releaseTask,
  submitValidation,
  taskState,
  type EscrowWallet,
} from "./escrow.js";
import type { Mandate } from "./mandate.js";

const ESCROW = "0xba038d50d70cf63ced17f3f23f77df4783f188da" as Address;
const SIGNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const TOKEN = "0x3333333333333333333333333333333333333333" as Address;
const TASK_ID = ("0x" + "ab".repeat(32)) as Hash;
const SIG = ("0x" + "11".repeat(65)) as Hash;

function mandate(): Mandate {
  return {
    agent: "0x1111111111111111111111111111111111111111" as Address,
    merchant: "0x2222222222222222222222222222222222222222" as Address,
    token: TOKEN,
    cap: 1_000_000n,
    windowStart: 1_700_000_000n,
    windowEnd: 1_700_086_400n,
    expiry: 1_700_172_800n,
    nonce: 7n,
    chainId: 11155111n,
  };
}

interface Call {
  address: Address;
  functionName: string;
  args: unknown[];
}

/** Fake PublicClient: scripted reads, receipt wait counter. No network. */
function fakePublic(reads: Record<string, unknown>) {
  const calls: Call[] = [];
  let receiptsWaited = 0;
  const client = {
    calls,
    receiptsWaited: () => receiptsWaited,
    readContract: async (r: Call) => {
      calls.push(r);
      const v = reads[r.functionName];
      if (typeof v === "function") return (v as (c: Call) => unknown)(r);
      if (v === undefined) throw new Error(`unexpected read ${r.functionName}`);
      return v;
    },
    waitForTransactionReceipt: async () => {
      receiptsWaited += 1;
      return { status: "success" };
    },
  };
  return client;
}

/** Fake WalletClient: records writes, returns canned hashes. No broadcast. */
function fakeWallet(hashes: Hash[] = [("0x" + "cc".repeat(32)) as Hash]) {
  const calls: Call[] = [];
  let i = 0;
  const wallet = {
    calls,
    chain: undefined,
    writeContract: async (r: Call) => {
      calls.push(r);
      return hashes[Math.min(i++, hashes.length - 1)];
    },
  };
  return wallet;
}

describe("escrow reads (mocked viem)", () => {
  it("taskState maps the onchain enum to labels", async () => {
    const c = fakePublic({ taskState: 1 });
    await expect(taskState(TASK_ID, { escrow: ESCROW }, c as never)).resolves.toEqual({
      state: 1,
      label: "Funded",
    });
    expect(c.calls[0]).toMatchObject({ address: ESCROW, functionName: "taskState", args: [TASK_ID] });
  });

  it("readTask maps the 12-field tuple to a named object", async () => {
    const tuple = [
      SIGNER,
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      TOKEN,
      1_000_000n,
      999_000n,
      1_700_000_000n,
      1_700_086_400n,
      1_700_172_800n,
      8_000n,
      "0x4444444444444444444444444444444444444444",
      2,
    ];
    const c = fakePublic({ tasks: tuple });
    const t = await readTask(TASK_ID, { escrow: ESCROW }, c as never);
    expect(t).toMatchObject({
      payer: SIGNER,
      cap: 1_000_000n,
      fundedAmount: 999_000n,
      scoreBps: 8_000n,
      state: 2,
      label: "Validated",
    });
  });

  it("isNonceUsed + readThresholdBps hit the right views", async () => {
    const c = fakePublic({ usedNonce: true, thresholdBps: 5000n });
    await expect(isNonceUsed(SIGNER, 7n, { escrow: ESCROW }, c as never)).resolves.toBe(true);
    await expect(readThresholdBps({ escrow: ESCROW }, c as never)).resolves.toBe(5000n);
  });
});

describe("fundMandate (approve-first, mocked viem)", () => {
  it("skips approve when allowance already covers cap, then calls fund", async () => {
    const c = fakePublic({ allowance: 1_000_000n });
    const w = fakeWallet();
    const res = await fundMandate(mandate(), SIG, SIGNER, w as unknown as EscrowWallet, { escrow: ESCROW }, c as never);
    expect(res.approveTxHash).toBeNull();
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0]).toMatchObject({ address: ESCROW, functionName: "fund" });
    expect((w.calls[0].args as unknown[])[1]).toBe(SIG);
  });

  it("approves first and waits for receipt when allowance is short", async () => {
    const c = fakePublic({ allowance: 0n });
    const approveHash = ("0x" + "aa".repeat(32)) as Hash;
    const fundHash = ("0x" + "bb".repeat(32)) as Hash;
    const w = fakeWallet([approveHash, fundHash]);
    const res = await fundMandate(mandate(), SIG, SIGNER, w as unknown as EscrowWallet, { escrow: ESCROW }, c as never);
    expect(res).toEqual({ approveTxHash: approveHash, txHash: fundHash });
    expect(w.calls).toHaveLength(2);
    expect(w.calls[0]).toMatchObject({ address: TOKEN, functionName: "approve", args: [ESCROW, 1_000_000n] });
    expect(w.calls[1]).toMatchObject({ address: ESCROW, functionName: "fund" });
    expect(c.receiptsWaited()).toBe(1);
  });
});

describe("settlement writers (mocked viem)", () => {
  it("release/refund/cancel/submitValidation call the right functions with taskId", async () => {
    const w = fakeWallet();
    const wallet = w as unknown as EscrowWallet;
    await releaseTask(TASK_ID, wallet, { escrow: ESCROW });
    await refundTask(TASK_ID, wallet, { escrow: ESCROW });
    await cancelTask(TASK_ID, wallet, { escrow: ESCROW });
    await submitValidation(TASK_ID, 8000n, wallet, { escrow: ESCROW });
    expect(w.calls.map((c) => [c.functionName, c.args])).toEqual([
      ["release", [TASK_ID]],
      ["refund", [TASK_ID]],
      ["cancel", [TASK_ID]],
      ["submitValidation", [TASK_ID, 8000n]],
    ]);
    for (const c of w.calls) expect(c.address).toBe(ESCROW);
  });
});
