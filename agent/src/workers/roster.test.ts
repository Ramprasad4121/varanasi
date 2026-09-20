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
      reporter: { topic: "USDC/WETH liquidity" },
      reconciler: { mandateId: `0x${"11".repeat(32)}` },
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

  it("oracle fails closed on unknown pairs and pins known ones", async () => {
    const eth = await runRoster("oracle", { symbol: "ETH/USDC" }, { offline: true });
    expect(eth.ok).toBe(true);
    if (eth.ok) {
      expect(eth.barPassed).toBe(true);
      expect(eth.output.price).toBe(3420.12);
      expect(eth.output.asOf).toEqual(expect.any(Number));
    }
    const doge = await runRoster("oracle", { symbol: "DOGE/USD" }, { offline: true });
    expect(doge.ok).toBe(true);
    if (doge.ok) {
      expect(doge.barPassed).toBe(false);
      expect(doge.output.error).toBe("unknown pair");
      expect(doge.output.price).toBeUndefined();
      expect(doge.settled).toBe("refunded");
    }
  });

  it("router and trader fail closed on junk pairs", async () => {
    const eth = await runRoster("router", { pair: "1 ETH → USDC" }, { offline: true });
    expect(eth.ok).toBe(true);
    if (eth.ok) {
      expect(eth.barPassed).toBe(true);
      expect(eth.output.path).toEqual(["WETH", "USDC"]);
    }
    const sol = await runRoster("router", { pair: "1000 SOL to PEPE" }, { offline: true });
    expect(sol.ok).toBe(true);
    if (sol.ok) {
      expect(sol.barPassed).toBe(false);
      expect(sol.output.error).toBe("unknown pair");
      expect(sol.settled).toBe("refunded");
    }
    const buy = await runRoster("trader", { order: "buy 0.5 ETH with USDC" }, { offline: true });
    expect(buy.ok).toBe(true);
    if (buy.ok) expect(buy.barPassed).toBe(true);
    const doge = await runRoster("trader", { order: "buy 100 DOGE with USDC" }, { offline: true });
    expect(doge.ok).toBe(true);
    if (doge.ok) {
      expect(doge.barPassed).toBe(false);
      expect(doge.output.error).toBe("unknown order");
    }
  });

  it("analyst fails closed on unknown pools", async () => {
    const ok = await runRoster("analyst", { pool: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640" }, { offline: true });
    expect(ok.ok).toBe(true);
    const junk = await runRoster("analyst", { pool: "not-a-pool" }, { offline: true });
    expect(junk.ok).toBe(true);
    if (junk.ok) {
      expect(junk.barPassed).toBe(false);
      expect(junk.output.error).toBe("unknown pool");
    }
  });

  it("indexer and reconciler fail closed on junk", async () => {
    const idx = await runRoster("indexer", { query: "uniswap v3 top pools" }, { offline: true });
    expect(idx.ok).toBe(true);
    if (idx.ok) expect(idx.barPassed).toBe(true);
    const cheese = await runRoster("indexer", { query: "why is the moon cheese" }, { offline: true });
    expect(cheese.ok).toBe(true);
    if (cheese.ok) {
      expect(cheese.barPassed).toBe(false);
      expect(cheese.output.error).toBe("unknown query");
      expect(cheese.settled).toBe("refunded");
    }
    const rec = await runRoster("reconciler", { mandateId: `0x${"11".repeat(32)}` }, { offline: true });
    expect(rec.ok).toBe(true);
    if (rec.ok) expect(rec.barPassed).toBe(true);
    const fake = await runRoster("reconciler", { mandateId: "not-a-real-mandate-at-all" }, { offline: true });
    expect(fake.ok).toBe(true);
    if (fake.ok) {
      expect(fake.barPassed).toBe(false);
      expect(fake.output.error).toBe("mandateId must be bytes32");
      expect(fake.output.inCap).toBe(false);
    }
  });
});
