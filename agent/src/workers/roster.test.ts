import { describe, expect, it } from "vitest";
import { AGENT_IDS, agentById } from "../catalog.js";
import { runRoster } from "./roster.js";

describe("live roster", () => {
  it("loads 15 agents", () => {
    expect(AGENT_IDS).toHaveLength(15);
    expect(agentById("scout.aegis.eth")?.id).toBe("scout");
  });

  it("runs every agent offline", async () => {
    const samples: Record<string, Record<string, string>> = {
      scout: { pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
      analyst: { pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
      freelancer: { taskId: `0x${"11".repeat(32)}` },
      sentry: { label: "scout" },
      oracle: { symbol: "ETH/USDC" },
      watcher: { address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
      indexer: { query: "uniswap v3" },
      auditor: { wallet: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
      router: { pair: "1 ETH → USDC" },
      keeper: { target: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
      reporter: { topic: "liquidity" },
      reconciler: { mandateId: "mandate-1" },
      notary: { artifact: "pool shortlist" },
      trader: { order: "buy 0.5 ETH with USDC" },
      dispatcher: { pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" },
    };
    for (const id of AGENT_IDS) {
      const proof = await runRoster(id, samples[id] ?? {}, { offline: true, mandateId: "test" });
      expect(proof.ok, `${id} failed`).toBe(true);
      if (proof.ok) {
        expect(proof.agent).toBe(id);
        expect(proof.evidence.hash.startsWith("0x")).toBe(true);
      }
    }
  });

  it("fails closed on missing required input", async () => {
    const proof = await runRoster("watcher", {}, { offline: true });
    expect(proof.ok).toBe(false);
    if (!proof.ok) expect(proof.error).toMatch(/required/);
  });
});
