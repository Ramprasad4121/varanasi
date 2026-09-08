import { describe, it, expect } from "vitest";
import {
  DISCOVER_OFFLINE_FIXTURE,
  getAgentProfile,
  searchAgents,
  toDiscoveredAgent,
} from "./discover.js";

describe("toDiscoveredAgent", () => {
  it("normalizes the offline fixture row", () => {
    const a = toDiscoveredAgent("base", DISCOVER_OFFLINE_FIXTURE[0], 2);
    expect(a.id).toBe("7");
    expect(a.chain).toBe("base");
    expect(a.chainId).toBe(8453);
    expect(a.name).toBe("OFFLINE Weather Oracle");
    expect(a.mcpEndpoint).toBe("https://offline.example/mcp");
    expect(a.x402Support).toBe(true);
    expect(a.trust).toEqual(["reputation"]);
    expect(a.feedbackCount).toBe(2);
  });

  it("throws on missing agent", () => {
    expect(() => toDiscoveredAgent("base", null)).toThrow("Agent not found");
    expect(() => toDiscoveredAgent("base", { name: "no-id" })).toThrow("Agent not found");
  });
});

describe("searchAgents offline fixture (no network)", () => {
  it("returns fixture rows without a key", async () => {
    const agents = await searchAgents({ offline: true, apiKey: "" });
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0]).toMatchObject({ chain: "base", chainId: 8453 });
  });

  it("capability=mcp keeps rows with an endpoint", async () => {
    const agents = await searchAgents({ offline: true, capability: "mcp" });
    expect(agents.length).toBe(2);
    expect(agents.every((a) => a.mcpEndpoint !== "")).toBe(true);
  });

  it("capability=x402 keeps only x402 rows", async () => {
    const agents = await searchAgents({ offline: true, capability: "x402" });
    expect(agents.length).toBe(1);
    expect(agents[0].x402Support).toBe(true);
  });
});

describe("getAgentProfile offline fixture (no network)", () => {
  it("resolves a fixture agent by id", async () => {
    const a = await getAgentProfile("base", "7", { offline: true });
    expect(a.id).toBe("7");
    expect(a.x402Support).toBe(true);
  });

  it("throws on unknown id", async () => {
    await expect(getAgentProfile("base", "nope", { offline: true })).rejects.toThrow("Agent not found");
  });
});
