import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Address,
  AEGIS_REGISTRY_ABI,
  type ChainReader,
  encodeRevokeAgent,
  type Hex,
  OnchainBackend,
  TASK_ESCROW_ABI,
  TASK_ESCROW_MANDATE_TYPE_STRING,
  taskEscrowDigest,
  toTaskEscrowMandate,
  Varanasi,
} from "../src/index.js";
import { AGENT, AGENT2, owner, PAYEE, T0, TOKEN } from "./helpers.js";

const REGISTRY = "0x00000000000000000000000000000000000e0001" as Address;
const contract = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../contracts/src/${name}`, import.meta.url)), "utf8");

/** Fake AegisRegistry: AGENT is minted with tokenId 1, AGENT2 never minted. */
function fakeRegistry() {
  const live = new Map<string, bigint>([[AGENT.toLowerCase(), 1n]]);
  const reader: ChainReader = {
    async readContract({ functionName, args }) {
      const who = String(args[0]).toLowerCase();
      if (functionName === "isAuthorized") return live.has(who);
      return live.get(who) ?? 0n;
    },
    async waitForTransactionReceipt() {
      return { status: "success" };
    },
  };
  return { live, reader };
}

const payment = (paymentId: string) => ({ paymentId, agent: AGENT, payee: PAYEE, token: TOKEN, amount: 5n });

describe("onchain backend stub", () => {
  it("treats agents that are not live in AegisRegistry as revoked", async () => {
    const reg = fakeRegistry();
    const v = new Varanasi({
      backend: new OnchainBackend({ registry: REGISTRY, reader: reg.reader }),
      clock: () => T0,
    });
    await v.createMandate({ agent: AGENT, token: TOKEN, perTxCap: 5n, totalCap: 10n, validUntil: T0 + 60n }, owner);
    expect((await v.gate.check(payment("a"))).allowed).toBe(true);
    await expect(
      v.createMandate({ agent: AGENT2, token: TOKEN, perTxCap: 5n, totalCap: 10n, validUntil: T0 + 60n }, owner),
    ).rejects.toThrow(/AgentRevoked/);
    // identity revoked on chain by someone else: the next check denies
    reg.live.delete(AGENT.toLowerCase());
    expect((await v.gate.check(payment("b"))).code).toBe("AGENT_REVOKED");
  });

  it("revoke without a writer records revokeAgent calldata for the owner", async () => {
    const backend = new OnchainBackend({ registry: REGISTRY, reader: fakeRegistry().reader });
    const v = new Varanasi({ backend, clock: () => T0 });
    await v.revoke(AGENT);
    expect(backend.lastRevoke).toEqual({ agent: AGENT.toLowerCase(), tokenId: 1n, calldata: encodeRevokeAgent(1n) });
  });

  it("revoke with a writer sends revokeAgent(tokenId) from the owner account", async () => {
    const sent: unknown[] = [];
    const backend = new OnchainBackend({
      registry: REGISTRY,
      reader: fakeRegistry().reader,
      ownerAccount: owner.address,
      writer: {
        async writeContract(args) {
          sent.push(args);
          return `0x${"11".repeat(32)}` as Hex;
        },
      },
    });
    const v = new Varanasi({ backend, clock: () => T0 });
    await v.revoke(AGENT);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ functionName: "revokeAgent", args: [1n], account: owner.address });
    expect(backend.lastRevoke?.txHash).toBe(`0x${"11".repeat(32)}`);
  });

  it("ABI fragments exist in the Solidity sources", () => {
    const check = (abi: readonly { type: string; name?: string }[], src: string) => {
      for (const item of abi) {
        if (item.type === "function") {
          const found = src.includes(`function ${item.name}(`) || src.includes(`public ${item.name};`);
          expect(found, String(item.name)).toBe(true);
        } else if (item.type === "event") {
          expect(src.includes(`event ${item.name}(`), String(item.name)).toBe(true);
        }
      }
    };
    check(AEGIS_REGISTRY_ABI, contract("AegisRegistry.sol"));
    check(TASK_ESCROW_ABI, contract("TaskEscrow.sol"));
  });

  it("reuses TaskEscrow's locked Mandate type and domain", () => {
    const src = contract("TaskEscrow.sol");
    expect(src).toContain(TASK_ESCROW_MANDATE_TYPE_STRING);
    expect(src).toContain('EIP712("VaranasiTaskEscrow", "1")');
    const m = toTaskEscrowMandate({
      agent: AGENT,
      payee: PAYEE,
      token: TOKEN,
      amount: 5n,
      windowStart: T0,
      windowEnd: T0 + 10n,
      expiry: T0 + 20n,
      nonce: 1n,
      chainId: 11155111n,
    });
    expect(m.cap).toBe(5n);
    const d1 = taskEscrowDigest(m, REGISTRY);
    expect(d1).toMatch(/^0x[0-9a-f]{64}$/);
    expect(d1).not.toBe(taskEscrowDigest({ ...m, chainId: 1n }, REGISTRY));
    expect(() =>
      toTaskEscrowMandate({ ...m, payee: PAYEE, amount: 0n, windowStart: T0, windowEnd: T0, expiry: T0 }),
    ).toThrow(/BadAmount/);
  });
});
