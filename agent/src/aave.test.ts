import { describe, it, expect } from "vitest";
import {
  AAVE_MCP_PROTOCOL_VERSION,
  AAVE_MCP_URL_DEFAULT,
  AAVE_OFFLINE_FIXTURE,
  AaveMcpClient,
  extractRows,
  parseSseData,
  toMarketSnapshot,
  toWalletSummary,
  type AaveFetch,
} from "./aave.js";

const ADDR = "0x1234567890123456789012345678901234567890";

/** Capture outbound requests; script responses per method. */
function mockFetch(script: Record<string, unknown>, seen: { url: string; headers: Record<string, string>; body: string }[]): AaveFetch {
  return async (url, init) => {
    seen.push({ url, headers: init.headers, body: String(init.body) });
    const req = JSON.parse(String(init.body)) as { method: string; params: { name?: string } };
    const key = req.method === "tools/call" ? `call:${String(req.params?.name ?? "")}` : req.method;
    const payload = script[key] ?? { result: {} };
    const headers = new Map<string, string>([["content-type", "application/json"]]);
    // initialize returns a session id (lowercase + canonical both asserted by client).
    if (req.method === "initialize") headers.set("mcp-session-id", "sess-1");
    return {
      ok: true,
      status: 200,
      headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null },
      text: async () => JSON.stringify(payload),
    };
  };
}

describe("aave offline fixture (no network)", () => {
  it("defaults to the public server URL", () => {
    expect(new AaveMcpClient({ offline: true }).serverUrl).toBe(AAVE_MCP_URL_DEFAULT);
  });

  it("marketSnapshots filters symbols offline", async () => {
    const c = new AaveMcpClient({ offline: true });
    expect(c.mode).toBe("offline");
    const all = await c.marketSnapshots();
    expect(all.length).toBe(AAVE_OFFLINE_FIXTURE.markets.length);
    const usdc = await c.marketSnapshots(["usdc"]);
    expect(usdc.map((m) => m.symbol)).toEqual(["USDC"]);
  });

  it("walletSummary / reserveApy / preview work offline", async () => {
    const c = new AaveMcpClient({ offline: true });
    const s = await c.walletSummary(ADDR);
    expect(s.address).toBe(ADDR);
    expect(s.healthFactor).toBe(2.5);
    expect(await c.reserveApy("USDC")).toHaveLength(1);
    const p = await c.previewBorrow("USDC", "100", ADDR);
    expect(p.ok).toBe(true);
    expect(p.action).toBe("borrow");
  });

  it("fail-closed: bad address, bad action, symbol-less row", async () => {
    const c = new AaveMcpClient({ offline: true });
    await expect(c.walletSummary("not-an-address")).rejects.toThrow("Bad address");
    await expect(c.preview("yeet", "USDC", "1", ADDR)).rejects.toThrow("Unknown preview action");
    expect(() => toMarketSnapshot({ chain: "Ethereum" })).toThrow("BadAaveIntel");
  });
});

describe("aave streamable-HTTP protocol (mocked fetch, no network)", () => {
  it("initialize uses protocolVersion 2025-11-25, captures Mcp-Session-Id, sends notifications/initialized", async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const c = new AaveMcpClient({
      fetch: mockFetch({ initialize: { result: {} }, "notifications/initialized": {}, "call:get_markets": { result: { content: [{ type: "text", text: "[]" }] } } }, seen),
    });
    await c.marketSnapshots();
    const bodies = seen.map((s) => JSON.parse(s.body) as { method: string; params: Record<string, unknown> });
    expect(bodies[0].method).toBe("initialize");
    expect((bodies[0].params as { protocolVersion: string }).protocolVersion).toBe(AAVE_MCP_PROTOCOL_VERSION);
    expect(bodies[1].method).toBe("notifications/initialized");
    // Session header attached on calls after initialize.
    const callHeaders = seen[2].headers;
    expect(callHeaders["mcp-session-id"]).toBe("sess-1");
    // tools/call shape.
    expect(bodies[2].method).toBe("tools/call");
    expect((bodies[2].params as { name: string }).name).toBe("get_markets");
  });

  it("refuses live calls when initialize returns no session id", async () => {
    const fetch: AaveFetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ result: {} }),
    });
    await expect(new AaveMcpClient({ fetch }).listChains()).rejects.toThrow("Mcp-Session-Id");
  });

  it("unwraps text payloads as JSON; fail-closed on isError and HTTP errors", async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const c = new AaveMcpClient({
      fetch: mockFetch(
        {
          initialize: { result: {} },
          "notifications/initialized": {},
          "call:get_user_summary": {
            result: { content: [{ type: "text", text: JSON.stringify({ healthFactor: "1.8" }) }] },
          },
        },
        seen,
      ),
    });
    const s = await c.walletSummary(ADDR);
    expect(s.healthFactor).toBe(1.8);

    const errFetch: AaveFetch = async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => "boom",
    });
    await expect(new AaveMcpClient({ fetch: errFetch }).listChains()).rejects.toThrow("HTTP 500");
  });

  it("surfaces isError tool results instead of trusting them", async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const c = new AaveMcpClient({
      fetch: mockFetch(
        {
          initialize: { result: {} },
          "notifications/initialized": {},
          "call:get_chains": { result: { isError: true, content: [{ type: "text", text: "nope" }] } },
        },
        seen,
      ),
    });
    await expect(c.listChains()).rejects.toThrow('tool "get_chains" failed');
  });
});

describe("aave normalizers", () => {
  it("toMarketSnapshot requires a symbol; toWalletSummary maps aliases", () => {
    const m = toMarketSnapshot({ symbol: "USDC", chain: "Ethereum", supplyApy: "4.2" });
    expect(m.symbol).toBe("USDC");
    expect(m.supplyApy).toBe(4.2);
    const w = toWalletSummary(ADDR, { health_factor: "3", totalCollateralUSD: "5", totalDebtUSD: "1" });
    expect(w.healthFactor).toBe(3);
    expect(w.totalCollateralUsd).toBe("5");
  });

  it("extractRows handles envelope shapes; parseSseData takes the last data line", () => {
    expect(extractRows([{ a: 1 }])).toHaveLength(1);
    expect(extractRows({ markets: [{ a: 1 }] })).toHaveLength(1);
    expect(extractRows({ data: [1, 2] })).toHaveLength(2);
    expect(extractRows(null)).toEqual([]);
    expect(parseSseData('event: message\ndata: {"a":1}\n\ndata: {"b":2}\n')).toBe('{"b":2}');
    expect(parseSseData("no data here")).toBeNull();
  });

  it("handles the live server shapes (verified 2026-09-09)", () => {
    // get_markets: { data: { v4: { markets: [{ symbol, chainId, supplyApyPct, … }] } } }
    const live = { data: { v4: { markets: [{ symbol: "USDC", chainId: 1, supplyApyPct: "4.2", borrowApyPct: "6.1", suppliable: "1000" }] } } };
    const rows = extractRows(live) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const m = toMarketSnapshot(rows[0]);
    expect(m.symbol).toBe("USDC");
    expect(m.chain).toBe("1");
    expect(m.supplyApy).toBeCloseTo(0.042);
    expect(m.borrowApy).toBeCloseTo(0.061);
    expect(m.liquidity).toBe("1000");
    // get_chains: { data: { v4: [{ Chain … }] } }
    expect(extractRows({ data: { v4: [{ name: "Ethereum", chainId: 1 }] } })).toHaveLength(1);
  });
});
