import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatDoctor, runDoctor } from "./doctor.js";

const ENV_KEYS = [
  "GRAPH_API_KEY",
  "SEPOLIA_RPC_URL",
  "AEGIS_REGISTRY",
  "HEDERA_AGENT_ACCOUNT_ID",
  "HEDERA_AGENT_PRIVATE_KEY",
  "SIGNAL_URL",
  "HCS_TOPIC_ID",
  "HCS_ENABLED",
  "TASK_ESCROW",
] as const;

let saved: Record<string, string | undefined>;

const REGISTRY = "0x1111111111111111111111111111111111111111";
const ESCROW = "0x2222222222222222222222222222222222222222";

function setFullEnv(): void {
  process.env.GRAPH_API_KEY = "test-graph-key";
  process.env.SEPOLIA_RPC_URL = "https://rpc.sepolia.org";
  process.env.AEGIS_REGISTRY = REGISTRY;
  process.env.HEDERA_AGENT_ACCOUNT_ID = "0.0.12345";
  process.env.HEDERA_AGENT_PRIVATE_KEY = "302e020100300506032b657004220420deadbeef";
  process.env.SIGNAL_URL = "http://localhost:3001/v1/signal";
  process.env.HCS_TOPIC_ID = "0.0.999";
  process.env.TASK_ESCROW = ESCROW;
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  setFullEnv();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Stub fetch: route JSON-RPC methods + Graph gateway + /health. */
function stubFetch(o: {
  chainId?: string;
  code?: string;
  graphStatus?: number;
  healthStatus?: number;
  healthThrows?: boolean;
} = {}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (url: unknown, init?: { body?: string; method?: string }) => {
    const u = String(url);
    calls.push(u);
    const body = String(init?.body ?? "");
    if (u === "https://rpc.sepolia.org") {
      if (body.includes("eth_chainId")) return new Response(JSON.stringify({ result: o.chainId ?? "0xaa36a7" }), { status: 200 });
      if (body.includes("eth_getCode")) return new Response(JSON.stringify({ result: o.code ?? "0x60806040" }), { status: 200 });
    }
    if (u.includes("gateway.thegraph.com")) return new Response("{}", { status: o.graphStatus ?? 200 });
    if (u.endsWith("/health")) {
      if (o.healthThrows) throw new Error("connect ECONNREFUSED");
      return new Response(JSON.stringify({ ok: true }), { status: o.healthStatus ?? 200 });
    }
    throw new Error(`unexpected URL ${u}`);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("runDoctor", () => {
  it("passes everything on a healthy stack", async () => {
    const { fetchImpl } = stubFetch();
    const checks = await runDoctor({ fetchImpl });
    expect(checks.length).toBeGreaterThan(8);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.find((c) => c.name === "rpc:chainId")?.detail).toContain("11155111");
  });

  it("never prints secret values (lengths only)", async () => {
    const { fetchImpl } = stubFetch();
    const checks = await runDoctor({ fetchImpl });
    const blob = JSON.stringify(checks);
    expect(blob).not.toContain("deadbeef");
    expect(blob).not.toContain("test-graph-key");
    expect(blob).toContain("chars");
  });

  it("fails env checks with exact fix commands when env is missing", async () => {
    delete process.env.GRAPH_API_KEY;
    delete process.env.HEDERA_AGENT_PRIVATE_KEY;
    const { fetchImpl, calls } = stubFetch();
    const checks = await runDoctor({ fetchImpl });
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName["env:GRAPH_API_KEY"].ok).toBe(false);
    expect(byName["env:GRAPH_API_KEY"].fix).toContain("export GRAPH_API_KEY=");
    expect(byName["env:HEDERA_AGENT_PRIVATE_KEY"].ok).toBe(false);
    expect(byName["graph:key"].ok).toBe(false); // skipped without a key
    expect(calls.some((u) => u.includes("gateway.thegraph.com"))).toBe(false);
  });

  it("fails rpc:chainId on the wrong chain", async () => {
    const { fetchImpl } = stubFetch({ chainId: "0x1" });
    const checks = await runDoctor({ fetchImpl });
    const row = checks.find((c) => c.name === "rpc:chainId")!;
    expect(row.ok).toBe(false);
    expect(row.fix).toContain("SEPOLIA_RPC_URL");
  });

  it("fails code checks when an address has no contract", async () => {
    const { fetchImpl } = stubFetch({ code: "0x" });
    const checks = await runDoctor({ fetchImpl });
    expect(checks.find((c) => c.name === "rpc:registry-code")?.ok).toBe(false);
    expect(checks.find((c) => c.name === "rpc:escrow-code")?.ok).toBe(false);
  });

  it("fails graph:key on 401 with a key-rotation fix", async () => {
    const { fetchImpl } = stubFetch({ graphStatus: 401 });
    const checks = await runDoctor({ fetchImpl });
    const row = checks.find((c) => c.name === "graph:key")!;
    expect(row.ok).toBe(false);
    expect(row.fix).toContain("GRAPH_API_KEY");
  });

  it("fails signal:health when the service is down, with the dev fix", async () => {
    const { fetchImpl } = stubFetch({ healthThrows: true });
    const checks = await runDoctor({ fetchImpl });
    const row = checks.find((c) => c.name === "signal:health")!;
    expect(row.ok).toBe(false);
    expect(row.fix).toContain("npm run dev");
  });

  it("passes hcs:topic when HCS is explicitly disabled", async () => {
    delete process.env.HCS_TOPIC_ID;
    process.env.HCS_ENABLED = "0";
    const { fetchImpl } = stubFetch();
    const checks = await runDoctor({ fetchImpl });
    const row = checks.find((c) => c.name === "hcs:topic")!;
    expect(row.ok).toBe(true);
    expect(row.detail).toContain("HCS_ENABLED=0");
  });

  it("fails hcs:topic when enabled but unconfigured", async () => {
    delete process.env.HCS_TOPIC_ID;
    const { fetchImpl } = stubFetch();
    const checks = await runDoctor({ fetchImpl });
    const row = checks.find((c) => c.name === "hcs:topic")!;
    expect(row.ok).toBe(false);
    expect(row.fix).toContain("HCS_TOPIC_ID");
  });

  it("fails closed (no throw) when fetch itself is broken", async () => {
    const fetchImpl = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const checks = await runDoctor({ fetchImpl, timeoutMs: 50 });
    expect(checks.find((c) => c.name === "rpc:chainId")?.ok).toBe(false);
    expect(checks.find((c) => c.name === "signal:health")?.ok).toBe(false);
  });
});

describe("formatDoctor", () => {
  it("prints PASS lines and FAIL lines with fixes + summary", async () => {
    const { fetchImpl } = stubFetch({ graphStatus: 401 });
    const out = formatDoctor(await runDoctor({ fetchImpl }));
    expect(out).toContain("PASS rpc:chainId");
    expect(out).toContain("FAIL graph:key");
    expect(out).toContain("fix: export GRAPH_API_KEY=");
    expect(out).toContain("checks failed");
  });
});
