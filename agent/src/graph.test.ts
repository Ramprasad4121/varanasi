import { describe, it, expect } from "vitest";
import { OFFLINE_FIXTURE, toPoolIntel, type UniswapPoolRaw } from "./graph.js";

function raw(over: Partial<UniswapPoolRaw>): UniswapPoolRaw {
  return { id: "0xpool", feeTier: "3000", totalValueLockedUSD: "1200000", volumeUSD: "8000000", ...over };
}

describe("toPoolIntel finite guards (M14 fail-closed)", () => {
  it("normalizes the offline fixture", () => {
    const intel = toPoolIntel("v3", OFFLINE_FIXTURE.pool);
    expect(intel.tvlUsd).toBe(1_200_000);
    expect(intel.symbols).toEqual(["USDC", "WETH"]);
  });

  it("throws on non-finite TVL (never NaN→200bps ACT)", () => {
    expect(() => toPoolIntel("v3", raw({ totalValueLockedUSD: "not-a-number" }))).toThrow("BadIntel");
    expect(() => toPoolIntel("v3", raw({ totalValueLockedUSD: "Infinity" }))).toThrow("BadIntel");
  });

  it("throws on non-finite volume", () => {
    expect(() => toPoolIntel("v3", raw({ volumeUSD: "NaN" }))).toThrow("BadIntel");
  });

  it("throws on non-finite legacy fees", () => {
    expect(() => toPoolIntel("v3", raw({ cumulativeSupplySideRevenueUSD: "Infinity" }))).toThrow("BadIntel");
  });

  it("throws on missing pool", () => {
    expect(() => toPoolIntel("v3", null)).toThrow("Pool not found");
  });
});
