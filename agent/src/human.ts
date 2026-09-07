/**
 * @author Ramprasad — World Selfie Check tiers + proof verification (tierFor, verifySelfieProof; env: WORLD_RP_ID, WORLD_ACTION, WORLD_SELFIE_SANDBOX).
 * human.ts — World Selfie Check integration for varanasi.
 *
 * Why this exists: varanasi is a human-authorized agent economy. The abuse
 * vector is one human minting unlimited agents / granting huge allowances.
 * World Selfie Check (Beta) is the low-friction abuse-prevention signal —
 * a device-camera liveness + facial-similarity credential, no Orb needed:
 *
 *   verified-unique-human → higher agent limits + allowances (`verified` tier)
 *   unverified            → capped sandbox tier (`guest`)
 *
 * Docs:
 *   - Credential:  https://docs.world.org/world-id/credentials/11
 *   - IDKit creds: https://docs.world.org/world-id/idkit/credentials
 *   - Sandbox:     https://docs.world.org/world-id/sandbox/testing-selfie-check
 *
 * Design notes:
 *   - `tierFor` is pure/testable: no network, no env reads.
 *   - `verifySelfieProof` is a thin IDKit-style wrapper. The proof object
 *     returned by IDKit (`selfieCheckLegacy()` preset, World ID 3.0 Face
 *     proof, `responses[].identifier === "selfie"`) is forwarded AS-IS to
 *     the World verifier — never mutate, re-encode, or trim it client-side.
 *     Backend verify endpoint: `POST https://developer.world.org/api/v4/verify/{rp_id}`
 *   - Sandbox mode (`WORLD_SELFIE_SANDBOX=1`, or `sandbox: true`) validates
 *     proof *shape* locally without network. Test-only: sandbox proofs are
 *     integration-test artifacts, never production uniqueness.
 */

/** Human tier: verified-unique-human or capped guest. */
export type HumanTier = "verified" | "guest";

/** Agent limits + allowances granted to one human tier. */
export interface TierPolicy {
  /** Tier identifier (verified or guest). */
  tier: HumanTier;
  /** Max agents one human may mint/authorize. */
  maxAgents: number;
  /** Max per-action human allowance, in basis points (500 = 5%). */
  maxAllowanceBps: number;
}

/** Capped sandbox tier: unverified humans get exactly one low-allowance agent. */
export const GUEST_TIER: TierPolicy = {
  tier: "guest",
  maxAgents: 1,
  maxAllowanceBps: 500, // 5%
};

/** Verified-unique-human tier: Selfie Check passed, nullifier recorded. */
export const VERIFIED_TIER: TierPolicy = {
  tier: "verified",
  maxAgents: 10,
  maxAllowanceBps: 5000, // 50%
};

/**
 * Pure tier mapping. `verified` must only be true after `verifySelfieProof`
 * succeeded AND the nullifier was stored (UNIQUE constraint — see WORLD.md).
 * A verified flag without a nullifier, or an empty nullifier, falls back
 * to guest: fail closed.
 * @param humanNullifierHash Stored World nullifier hash (null/empty → guest).
 * @param verified True only after verifySelfieProof succeeded with a stored nullifier.
 * @returns TierPolicy (verified tier or capped guest tier copy).
 */
export function tierFor(
  humanNullifierHash: string | null | undefined,
  verified: boolean,
): TierPolicy {
  const hasNullifier =
    typeof humanNullifierHash === "string" && humanNullifierHash.length > 0;
  if (verified && hasNullifier) return { ...VERIFIED_TIER };
  return { ...GUEST_TIER };
}

/** IDKit result shape for the `selfieCheckLegacy()` preset (fields optional — validated). */
export interface SelfieProof {
  /** RP+action-scoped unique-human identifier. Also accepted as `nullifier`. */
  nullifier_hash?: string;
  nullifier?: string;
  merkle_root?: string;
  proof?: string;
  verification_level?: string;
  /** IDKit v4 identifier for this preset is `"selfie"` (`face` = legacy alias). */
  credential_type?: string;
  action?: string;
  signal?: string;
  [key: string]: unknown;
}

/** Config for verifySelfieProof (rp id, action/signal binding, sandbox, verifier override). */
export interface VerifyConfig {
  /** Developer Portal `rp_id` (backend verify URL is scoped to it). */
  rpId: string;
  /** Action id the proof is bound to (replay scope). */
  action?: string;
  /** Optional signal bound into the proof (e.g. human wallet address). */
  signal?: string;
  /**
   * Sandbox mode: validate proof shape locally, no network.
   * Defaults from `WORLD_SELFIE_SANDBOX=1|true`. TEST ONLY.
   */
  sandbox?: boolean;
  /** Override for tests / self-hosted verifiers. */
  verifierBaseUrl?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/** Outcome of verifySelfieProof (verdict, nullifier, credential, sandbox flag). */
export interface VerifyResult {
  ok: boolean;
  /** True only when the World verifier (or sandbox shape-check) accepted the proof. */
  verified: boolean;
  nullifierHash: string | null;
  credentialType: string | null;
  /** True when this result came from sandbox shape-validation, not the World verifier. */
  sandbox: boolean;
  detail?: string;
}

/** Default World backend verify endpoint base (rp id is appended per call). */
export const WORLD_VERIFY_BASE = "https://developer.world.org/api/v4/verify";

/**
 * True when `WORLD_SELFIE_SANDBOX` is `1` or `true` (case-insensitive).
 * @param env Env map to read (default: process.env).
 * @returns True when sandbox shape-validation mode is enabled.
 */
export function isSandboxEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.WORLD_SELFIE_SANDBOX ?? "").toLowerCase().trim();
  return v === "1" || v === "true";
}

/**
 * Build a `VerifyConfig` from env: `WORLD_RP_ID`, `WORLD_ACTION`, `WORLD_SELFIE_SANDBOX`.
 * @param env Env map to read (default: process.env).
 * @returns Pick of rpId, action, and sandbox flag.
 */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Pick<VerifyConfig, "rpId" | "action" | "sandbox"> {
  return {
    rpId: env.WORLD_RP_ID ?? "",
    action: env.WORLD_ACTION,
    sandbox: isSandboxEnabled(env),
  };
}

function nullifierOf(proof: SelfieProof): string | null {
  const n = proof.nullifier_hash ?? proof.nullifier;
  return typeof n === "string" && n.length > 0 ? n : null;
}

function credentialOf(proof: SelfieProof): string | null {
  const c = proof.credential_type;
  return typeof c === "string" && c.length > 0 ? c : null;
}

/**
 * Verify a Selfie Check proof.
 *
 * Production path: POSTs the proof AS-IS to
 * `{verifierBaseUrl}/{rpId}` (default: World `api/v4/verify`), returns the
 * nullifier on success. Callers MUST persist the nullifier with a UNIQUE
 * constraint before treating the human as `verified` (replay protection).
 *
 * Sandbox path (`sandbox: true`): no network. Accepts proofs whose shape
 * matches a Selfie Check result — non-empty nullifier + credential
 * `selfie` (or legacy `face`) — and marks the result `sandbox: true`.
 * @param proof IDKit Selfie Check result (forwarded AS-IS in production).
 * @param config VerifyConfig (rpId, action/signal binding, sandbox, verifier override).
 * @returns VerifyResult with ok/verified, nullifierHash, credentialType, and sandbox flag.
 */
export async function verifySelfieProof(
  proof: SelfieProof,
  config: VerifyConfig,
): Promise<VerifyResult> {
  const sandbox = config.sandbox ?? isSandboxEnabled();
  const nullifierHash = nullifierOf(proof);
  const credentialType = credentialOf(proof);

  if (!proof || typeof proof !== "object") {
    return { ok: false, verified: false, nullifierHash: null, credentialType: null, sandbox, detail: "empty proof" };
  }

  if (sandbox) {
    const credentialOk = credentialType === "selfie" || credentialType === "face" || credentialType === null;
    if (nullifierHash && credentialOk) {
      return { ok: true, verified: true, nullifierHash, credentialType, sandbox: true, detail: "sandbox shape-check (no network)" };
    }
    return {
      ok: false,
      verified: false,
      nullifierHash,
      credentialType,
      sandbox: true,
      detail: "sandbox proof needs a non-empty nullifier_hash and credential_type 'selfie'",
    };
  }

  if (!config.rpId) {
    return { ok: false, verified: false, nullifierHash, credentialType, sandbox, detail: "missing rpId (set WORLD_RP_ID)" };
  }
  if (config.action && proof.action && proof.action !== config.action) {
    return { ok: false, verified: false, nullifierHash, credentialType, sandbox, detail: `action mismatch: proof is for '${proof.action}', expected '${config.action}'` };
  }
  if (config.signal !== undefined && proof.signal !== undefined && proof.signal !== config.signal) {
    return { ok: false, verified: false, nullifierHash, credentialType, sandbox, detail: "signal mismatch" };
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const base = (config.verifierBaseUrl ?? WORLD_VERIFY_BASE).replace(/\/+$/, "");
  let res: Response;
  try {
    // Forward the IDKit result AS-IS — do not mutate/re-encode/trim it.
    res = await fetchImpl(`${base}/${config.rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proof),
    });
  } catch (err) {
    return { ok: false, verified: false, nullifierHash, credentialType, sandbox, detail: `verifier unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) {
    return { ok: false, verified: false, nullifierHash, credentialType, sandbox, detail: `verifier HTTP ${res.status}` };
  }
  let body: { nullifier_hash?: unknown; credential_type?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, verified: false, nullifierHash, credentialType, sandbox, detail: "verifier returned non-JSON" };
  }
  const verifiedNullifier =
    typeof body.nullifier_hash === "string" && body.nullifier_hash.length > 0 ? body.nullifier_hash : null;
  const verifiedCredential =
    typeof body.credential_type === "string" ? body.credential_type : credentialType;
  if (!verifiedNullifier) {
    return { ok: true, verified: false, nullifierHash: null, credentialType: verifiedCredential, sandbox, detail: "verifier rejected proof (no nullifier returned)" };
  }
  return { ok: true, verified: true, nullifierHash: verifiedNullifier, credentialType: verifiedCredential, sandbox };
}
