import { describe, it, expect, vi } from "vitest";
import {
  normalizeSignal,
  pickScoutTarget,
  runScout,
  turnoverOf,
  type ScoutGraph,
} from "./scout.js";
import type { PoolIntel } from "../graph.js";
import type { PayResult } from "../pay.js";

function intel(over: Partial<PoolIntel> = {}): PoolIntel {
  return {
    subgraphId: "v3",
    poolId: "0xpool",
    name: "USDC/WETH 0.05%",
    symbols: ["USDC", "WETH"],
    tvlUsd: 1_200_000,
    volume24hUsd: 240_000, // 20% turnover — healthy
    fees24hUsd: 120,
    rawExcerpt: {},
    ...over,
  };
}

function paid(over: Partial<PayResult> = {}): PayResult {
  return {
    payload: { signal: "LONG", confidence: 0.8 },
    txHash: "0.0.123-1697836800-123456789",
    hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.123-1697836800-123456789",
    paid: true,
    ...over,
  };
}

describe("turnoverOf (pure)", () => {
  it("computes volume/tvl", () => {
    expect(turnoverOf(intel())).toBeCloseTo(0.2);
  });
  it("returns 0 on zero or non-finite tvl", () => {
    expect(turnoverOf(intel({ tvlUsd: 0 }))).toBe(0);
    expect(turnoverOf(intel({ tvlUsd: NaN }))).toBe(0);
  });
});

describe("pickScoutTarget (pure, fail-closed)", () => {
  it("picks the highest-turnover pool above the bar", () => {
    const best = pickScoutTarget([intel({ poolId: "0xlow", volume24hUsd: 12_000 }), intel({ poolId: "0xhigh" })], 0.01);
    expect(best.poolId).toBe("0xhigh");
  });
  it("throws on an empty discovery set", () => {
    expect(() => pickScoutTarget([])).toThrow("no pools");
  });
  it("throws when nothing clears the turnover bar", () => {
    expect(() => pickScoutTarget([intel({ volume24hUsd: 100 })], 0.01)).toThrow("no healthy-turnover");
  });
});

describe("normalizeSignal (pure, fail-closed)", () => {
  it("normalizes LONG + confidence", () => {
    expect(normalizeSignal(paid())).toEqual({ signal: "long", confidence: 0.8 });
  });
  it("throws on unpaid receipts (never trust unpaid alpha)", () => {
    expect(() => normalizeSignal(paid({ paid: false }))).toThrow("unpaid");
  });
  it("falls back to neutral on unknown direction and clamps confidence", () => {
    expect(normalizeSignal(paid({ payload: { signal: "MOON", confidence: 99 } }))).toEqual({
      signal: "neutral",
      confidence: 1,
    });
  });
});

describe("runScout (injected clients, no network)", () => {
  it("pins poolId via poolIntel and returns receipt", async () => {
    const graph: ScoutGraph = {
      topPools: async () => { throw new Error("should not be called"); },
      poolIntel: async (id) => intel({ poolId: id }),
    };
    const pay = vi.fn(async () => paid());
    const res = await runScout({ poolId: "0xabc" }, { graph, pay });
    expect(res.pool).toBe("0xabc");
    expect(res.signal).toBe("long");
    expect(res.confidence).toBe(0.8);
    expect(res.receipt.paid).toBe(true);
    expect(pay).toHaveBeenCalledOnce();
  });

  it("discovers via topPools and picks the healthiest pool", async () => {
    const graph: ScoutGraph = {
      topPools: async () => [intel({ poolId: "0xstale", volume24hUsd: 12_000 }), intel({ poolId: "0xfresh" })],
      poolIntel: async (id) => intel({ poolId: id }),
    };
    const res = await runScout({}, { graph, pay: async (_o, body) => ({ ...paid(), payload: { signal: "SHORT", confidence: 0.5 } }) });
    expect(res.pool).toBe("0xfresh");
    expect(res.signal).toBe("short");
  });

  it("refuses to pay when the pinned pool is stale (fail-closed, pay never called)", async () => {
    const graph: ScoutGraph = {
      topPools: async () => [],
      poolIntel: async (id) => intel({ poolId: id, volume24hUsd: 10 }),
    };
    const pay = vi.fn(async () => paid());
    await expect(runScout({ poolId: "0xstale" }, { graph, pay })).rejects.toThrow("below");
    expect(pay).not.toHaveBeenCalled();
  });
});
