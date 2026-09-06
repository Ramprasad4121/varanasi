import { describe, it, expect } from "vitest";
import { analyzeRisk } from "./reason.js";

describe("analyzeRisk", () => {
  it("ACTs on deep liquid pool with bullish alpha", () => {
    const out = analyzeRisk({ tvlUsd: 5_000_000, volume24hUsd: 1_000_000, alphaScore: 0.8, identityOk: true }, 5000);
    expect(out.decision).toBe("ACT");
    expect(out.riskScoreBps).toBeLessThanOrEqual(5000);
    expect(out.rationale).toContain("ACT");
  });

  it("SKIPs thin illiquid pool with bearish alpha", () => {
    const out = analyzeRisk({ tvlUsd: 20_000, volume24hUsd: 100, alphaScore: -0.9, identityOk: true }, 5000);
    expect(out.decision).toBe("SKIP");
    expect(out.riskScoreBps).toBeGreaterThan(5000);
  });

  it("hard-blocks revoked identity regardless of market", () => {
    const out = analyzeRisk({ tvlUsd: 50_000_000, volume24hUsd: 10_000_000, alphaScore: 1, identityOk: false }, 5000);
    expect(out.decision).toBe("SKIP");
    expect(out.riskScoreBps).toBe(10_000);
  });

  it("neutral alpha on mid pool stays within bounds", () => {
    const out = analyzeRisk({ tvlUsd: 800_000, volume24hUsd: 100_000 }, 5000);
    expect(out.decision).toBe("ACT");
    expect(out.factors.length).toBeGreaterThan(0);
  });
});
