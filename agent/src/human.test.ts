import { describe, it, expect } from "vitest";
import {
  tierFor,
  verifySelfieProof,
  isSandboxEnabled,
  GUEST_TIER,
  VERIFIED_TIER,
} from "./human.js";

describe("tierFor", () => {
  it("grants the verified tier only with verified=true AND a nullifier", () => {
    expect(tierFor("0xabc123", true)).toEqual(VERIFIED_TIER);
    expect(tierFor("0xabc123", true).tier).toBe("verified");
  });

  it("falls back to guest when unverified, even with a nullifier", () => {
    expect(tierFor("0xabc123", false)).toEqual(GUEST_TIER);
  });

  it("fails closed: verified=true without a nullifier stays guest", () => {
    expect(tierFor(null, true)).toEqual(GUEST_TIER);
    expect(tierFor(undefined, true)).toEqual(GUEST_TIER);
    expect(tierFor("", true)).toEqual(GUEST_TIER);
  });

  it("verified tier strictly dominates guest on both limits", () => {
    const v = tierFor("n", true);
    const g = tierFor(null, false);
    expect(v.maxAgents).toBeGreaterThan(g.maxAgents);
    expect(v.maxAllowanceBps).toBeGreaterThan(g.maxAllowanceBps);
  });

  it("returns copies, not shared refs (callers can't mutate policy)", () => {
    const a = tierFor("n", true);
    a.maxAgents = 999;
    expect(tierFor("n", true).maxAgents).toBe(VERIFIED_TIER.maxAgents);
  });
});

describe("verifySelfieProof (sandbox mode)", () => {
  it("accepts a well-formed sandbox selfie proof without network", async () => {
    const res = await verifySelfieProof(
      { nullifier_hash: "sandbox-null-1", credential_type: "selfie", action: "aegis-human" },
      { rpId: "", sandbox: true },
    );
    expect(res.ok).toBe(true);
    expect(res.verified).toBe(true);
    expect(res.sandbox).toBe(true);
    expect(res.nullifierHash).toBe("sandbox-null-1");
  });

  it("rejects a nullifier-less proof in sandbox mode", async () => {
    const res = await verifySelfieProof(
      { credential_type: "selfie" },
      { rpId: "", sandbox: true },
    );
    expect(res.verified).toBe(false);
  });

  it("accepts the legacy 'face' credential alias in sandbox mode", async () => {
    const res = await verifySelfieProof(
      { nullifier_hash: "n", credential_type: "face" },
      { rpId: "", sandbox: true },
    );
    expect(res.verified).toBe(true);
  });

  it("refuses production verify without rpId (no silent misconfig)", async () => {
    const res = await verifySelfieProof(
      { nullifier_hash: "n", credential_type: "selfie" },
      { rpId: "", sandbox: false },
    );
    expect(res.ok).toBe(false);
    expect(res.detail).toContain("rpId");
  });

  it("forwards the proof as-is to the verifier and returns its nullifier", async () => {
    let seenUrl = "";
    let seenBody = "";
    const res = await verifySelfieProof(
      { nullifier_hash: "n", credential_type: "selfie", action: "aegis-human" },
      {
        rpId: "rp_test",
        action: "aegis-human",
        sandbox: false,
        verifierBaseUrl: "https://verifier.example/verify",
        fetchImpl: (async (url: unknown, init: unknown) => {
          seenUrl = String(url);
          seenBody = String((init as { body: string }).body);
          return { ok: true, json: async () => ({ nullifier_hash: "n", credential_type: "selfie" }) };
        }) as typeof fetch,
      },
    );
    expect(seenUrl).toBe("https://verifier.example/verify/rp_test");
    expect(JSON.parse(seenBody)).toMatchObject({ nullifier_hash: "n" });
    expect(res.verified).toBe(true);
    expect(res.nullifierHash).toBe("n");
  });
});

describe("isSandboxEnabled", () => {
  it("recognizes 1/true (case-insensitive), rejects everything else", () => {
    expect(isSandboxEnabled({ WORLD_SELFIE_SANDBOX: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSandboxEnabled({ WORLD_SELFIE_SANDBOX: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSandboxEnabled({ WORLD_SELFIE_SANDBOX: "TRUE" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isSandboxEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isSandboxEnabled({ WORLD_SELFIE_SANDBOX: "0" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
