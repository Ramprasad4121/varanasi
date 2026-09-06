import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  reasonWithLLM,
  parseLlmVerdict,
  buildLlmUserPrompt,
  LLM_SYSTEM_PROMPT,
  DEFAULT_LLM_BASE_URL,
} from "./brain.js";
import { analyzeRisk } from "./reason.js";

const INTEL = { tvlUsd: 5_000_000, volume24hUsd: 1_000_000, fees24hUsd: 3_000 };
const ALPHA = { score: 0.8, direction: "long" as const };
const IDENTITY = { authorized: true };
const REMOTE = "https://api.example.com/v1";

const ENV_KEYS = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function noNetworkFetch(): typeof fetch {
  return (async () => {
    throw new Error("network must not be touched on the fallback path");
  }) as unknown as typeof fetch;
}

function jsonFetch(content: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as unknown as typeof fetch;
}

describe("reasonWithLLM fallback (no network)", () => {
  it("falls back with { llm: false } when no key for a remote endpoint (no fetch call)", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    const out = await reasonWithLLM(INTEL, ALPHA, IDENTITY, 5000, { baseUrl: REMOTE, fetchImpl });
    const expected = analyzeRisk(
      { tvlUsd: INTEL.tvlUsd, volume24hUsd: INTEL.volume24hUsd, fees24hUsd: INTEL.fees24hUsd, alphaScore: 0.8, alphaDirection: "long", identityOk: true },
      5000,
    );
    expect(called).toBe(false);
    expect(out.llm).toBe(false);
    expect(out.riskScoreBps).toBe(expected.riskScoreBps);
    expect(out.decision).toBe(expected.decision);
  });

  it("falls back on bad JSON", async () => {
    const out = await reasonWithLLM(INTEL, ALPHA, IDENTITY, 5000, {
      baseUrl: REMOTE,
      apiKey: "test-key",
      fetchImpl: jsonFetch("this is not json{{{"),
    });
    expect(out.llm).toBe(false);
    expect(out.decision).toBe("ACT");
  });

  it("falls back on schema violation (score out of range)", async () => {
    const bad = JSON.stringify({ riskScoreBps: 99999, decision: "ACT", rationale: "x", factors: [] });
    const out = await reasonWithLLM(INTEL, ALPHA, IDENTITY, 5000, {
      baseUrl: REMOTE,
      apiKey: "test-key",
      fetchImpl: jsonFetch(bad),
    });
    expect(out.llm).toBe(false);
  });

  it("falls back on timeout without throwing", async () => {
    const hanging = (( _url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      })) as unknown as typeof fetch;
    const out = await reasonWithLLM(INTEL, ALPHA, IDENTITY, 5000, {
      baseUrl: REMOTE,
      apiKey: "test-key",
      timeoutMs: 50,
      fetchImpl: hanging,
    });
    expect(out.llm).toBe(false);
    expect(out.rationale).toContain("ACT");
  });

  it("falls back to SKIP on revoked identity even with LLM configured", async () => {
    const out = await reasonWithLLM(INTEL, ALPHA, { authorized: false }, 5000, {
      baseUrl: REMOTE,
      fetchImpl: noNetworkFetch(),
    });
    expect(out.llm).toBe(false);
    expect(out.decision).toBe("SKIP");
    expect(out.riskScoreBps).toBe(10_000);
  });
});

describe("reasonWithLLM success path (stubbed fetch)", () => {
  it("returns { llm: true } on valid STRICT JSON", async () => {
    const good = JSON.stringify({
      riskScoreBps: 1200,
      decision: "ACT",
      rationale: "Deep pool, healthy flow, bullish alpha.",
      factors: [{ name: "liquidity", bps: 200, note: "deep" }],
    });
    const out = await reasonWithLLM(INTEL, ALPHA, IDENTITY, 5000, {
      baseUrl: REMOTE,
      apiKey: "test-key",
      fetchImpl: jsonFetch(good),
    });
    expect(out.llm).toBe(true);
    expect(out.riskScoreBps).toBe(1200);
    expect(out.decision).toBe("ACT");
    expect(out.model).toBe("local-model");
  });
});

describe("prompt", () => {
  it("system prompt pins analyst role + strict JSON contract (snapshot)", () => {
    expect(LLM_SYSTEM_PROMPT).toMatchSnapshot();
    expect(LLM_SYSTEM_PROMPT).toContain("STRICT JSON");
    expect(LLM_SYSTEM_PROMPT).toContain("riskScoreBps");
  });

  it("user prompt carries intel/alpha/identity/threshold (snapshot)", () => {
    expect(buildLlmUserPrompt(INTEL, ALPHA, IDENTITY, 5000)).toMatchSnapshot();
  });

  it("defaults to local LM Studio base URL", () => {
    expect(DEFAULT_LLM_BASE_URL).toBe("http://localhost:1234/v1");
  });
});

describe("parseLlmVerdict", () => {
  it("rejects non-objects and bad decisions", () => {
    expect(parseLlmVerdict("[]")).toBeNull();
    expect(
      parseLlmVerdict(JSON.stringify({ riskScoreBps: 100, decision: "MAYBE", rationale: "x", factors: [] })),
    ).toBeNull();
  });
});
