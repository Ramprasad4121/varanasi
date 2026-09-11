import { describe, it, expect } from "vitest";
import type { Address, Hash } from "viem";
import { attestTask, isAttested, readReputation } from "./akshaya.js";
import type { AkshayaWallet } from "./akshaya.js";

const AKSHAYA = "0xA5c1a4A42F4B1c68A6e5F1eC0B3c1cC1d8f77aa1" as Address;
const AGENT = "0x1111111111111111111111111111111111111111" as Address;
const TASK_ID = ("0x" + "cd".repeat(32)) as Hash;

interface Call {
  address: Address;
  functionName: string;
  args: unknown[];
}

function fakePublic(reads: Record<string, unknown>) {
  const calls: Call[] = [];
  const client = {
    calls,
    readContract: async (r: Call) => {
      calls.push(r);
      const v = reads[r.functionName];
      if (v === undefined) throw new Error(`unexpected read ${r.functionName}`);
      return v;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

describe("akshaya reads (mocked viem)", () => {
  it("readReputation decodes statsOf + balanceOf in one flow", async () => {
    const client = fakePublic({
      statsOf: [1n, 2n, -1500n, 42],
      balanceOf: 3n,
    });
    const rep = await readReputation(AGENT, { akshaya: AKSHAYA, client });
    expect(rep).toEqual({
      agent: AGENT,
      score: -1500n,
      coins: 1n,
      dust: 2n,
      receipts: 3n,
      period: 42,
    });
    expect(client.calls[0].functionName).toBe("statsOf");
    expect(client.calls[0].args).toEqual([AGENT]);
    expect(client.calls.every((c: Call) => c.address === AKSHAYA)).toBe(true);
  });

  it("isAttested: tokenId>0 true, 0 false", async () => {
    const yes = fakePublic({ tokenByTask: 7n });
    await expect(isAttested(TASK_ID, { akshaya: AKSHAYA, client: yes })).resolves.toBe(true);
    const no = fakePublic({ tokenByTask: 0n });
    await expect(isAttested(TASK_ID, { akshaya: AKSHAYA, client: no })).resolves.toBe(false);
  });
});

describe("akshaya writers (mocked viem)", () => {
  it("attestTask writes exactly once with the task id", async () => {
    const writes: Call[] = [];
    const wallet = {
      account: { address: AGENT },
      chain: { id: 11155111 },
      writeContract: async (w: Call) => {
        writes.push(w);
        return ("0x" + "ee".repeat(32)) as Hash;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as AkshayaWallet;
    const { hash } = await attestTask(wallet, TASK_ID, { akshaya: AKSHAYA });
    expect(hash).toBe(("0x" + "ee".repeat(32)) as Hash);
    expect(writes).toHaveLength(1);
    expect(writes[0].functionName).toBe("attest");
    expect(writes[0].args).toEqual([TASK_ID]);
    expect(writes[0].address).toBe(AKSHAYA);
  });
});
