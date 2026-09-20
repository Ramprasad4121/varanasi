import { describe, it, expect } from "vitest";
import { resolveClosedSet } from "./select.js";

const OPTS = ["supply", "borrow", "withdraw", "repay"] as const;
const LABELS = { supply: "add funds", borrow: "take a loan" };

function pickFetch(choice: string, confidence: number): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ answers: { pick: { choice, confidence } } }), { status: 200 })) as unknown as typeof fetch;
}

describe("resolveClosedSet", () => {
  it("exact match wins in code without touching the network", async () => {
    const noNetwork = (async () => {
      throw new Error("must not be called");
    }) as unknown as typeof fetch;
    const out = await resolveClosedSet("  BORROW ", OPTS, LABELS, {
      verify: true,
      typesafeApiKey: "test-key",
      typesafeFetchImpl: noNetwork,
    });
    expect(out).toEqual({ value: "borrow", via: "exact", confidence: 1 });
  });

  it("returns null on empty input and with no key (caller errors as before)", async () => {
    expect(await resolveClosedSet("", OPTS, LABELS)).toBeNull();
    expect(await resolveClosedSet("lend", OPTS, LABELS)).toBeNull();
  });

  it("resolves an alias through the model pick", async () => {
    const out = await resolveClosedSet("lend me some usdc", OPTS, LABELS, {
      verify: true,
      typesafeApiKey: "test-key",
      typesafeFetchImpl: pickFetch("borrow", 0.9),
    });
    expect(out).toEqual({ value: "borrow", via: "model", confidence: 0.9 });
  });

  it("falls back on the none hatch, low confidence, and verifier errors", async () => {
    const base = { verify: true as const, typesafeApiKey: "test-key" };
    expect(await resolveClosedSet("dance", OPTS, LABELS, { ...base, typesafeFetchImpl: pickFetch("none", 0.99) })).toBeNull();
    expect(await resolveClosedSet("lend", OPTS, LABELS, { ...base, typesafeFetchImpl: pickFetch("supply", 0.4) })).toBeNull();
    const broken = (async () => {
      throw new Error("verifier down");
    }) as unknown as typeof fetch;
    expect(await resolveClosedSet("lend", OPTS, LABELS, { ...base, typesafeFetchImpl: broken })).toBeNull();
  });
});
