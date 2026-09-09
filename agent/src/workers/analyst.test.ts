import { describe, it, expect } from "vitest";
import { analyzePool, buildAnalystBrief, runAnalyst } from "./analyst.js";
import type { PoolIntel } from "../graph.js";

function intel(over: Partial<PoolIntel> = {}): PoolIntel {
  return {
    subgraphId: "v3",
    poolId: "0xpool",
    name: "USDC/WETH 0.05%",
    symbols: ["USDC", "WETH"],
    tvlUsd: 1_200_000,
    volume24hUsd: 240_000,
    fees24hUsd: 120,
    rawExcerpt: {},
    ...over,
  };
}

describe("analyzePool (pure heuristic)", () => {
  it("ACTs on deep + healthy flow with bullish alpha", () => {
    const { verdict } = analyzePool(intel(), { score: 0.8, direction: "long" });
    expect(verdict.decision).toBe("ACT");
  });

  it("SKIPs thin liquidity", () => {
    const { verdict } = analyzePool(intel({ tvlUsd: 10_000, volume24hUsd: 50 }), {}, { thresholdBps: 4000 });
    expect(verdict.decision).toBe("SKIP");
  });

  it("SKIPs revoked identity (hard block)", () => {
    const { verdict } = analyzePool(intel(), {}, { identityOk: false });
    expect(verdict.decision).toBe("SKIP");
    expect(verdict.riskScoreBps).toBe(10_000);
  });

  it("brief names the pool, turnover, and decision", () => {
    const { verdict, brief } = analyzePool(intel(), { score: 0.8, direction: "long" });
    expect(brief).toContain("USDC/WETH");
    expect(brief).toContain(verdict.decision);
    expect(brief).toContain("turnover");
  });

  it("buildAnalystBrief works without a pool name", () => {
    const { verdict } = analyzePool(intel());
    const brief = buildAnalystBrief(
      { tvlUsd: 1_200_000, volume24hUsd: 240_000 },
      {},
      verdict,
      5000,
    );
    expect(brief).toContain("Pool:");
  });
});

describe("runAnalyst (injected graph, no network)", () => {
  it("scores supplied intel without fetching", async () => {
    const res = await runAnalyst({ intel: intel() }, { thresholdBps: 5000 });
    expect(res.verdict.decision).toBe("ACT");
    expect(res.brief).toContain("ACT");
  });

  it("fetches intel for poolId via the injected graph", async () => {
    const res = await runAnalyst(
      { poolId: "0xabc" },
      {},
      { graph: { poolIntel: async (id: string) => intel({ poolId: id }) } },
    );
    expect(res.verdict.decision).toBe("ACT");
    expect(res.brief).toContain("USDC/WETH");
  });

  it("throws when neither intel nor poolId is supplied (fail-closed)", async () => {
    await expect(runAnalyst({})).rejects.toThrow("no intel");
  });

  it("respects a custom threshold", async () => {
    const res = await runAnalyst({ intel: intel({ tvlUsd: 500_000, volume24hUsd: 5_000 }) }, { thresholdBps: 100 });
    expect(res.verdict.decision).toBe("SKIP");
  });
});
