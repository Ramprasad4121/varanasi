/**
 * @author Ramprasad — LLM reasoning with heuristic fallback (reasonWithLLM, parseLlmVerdict; env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL).
 * brain.ts — LLM reasoning with heuristic fallback.
 *
 * `reasonWithLLM()` calls an OpenAI-compatible chat API (LM Studio local
 * default, no key needed) with a tight DeFi-risk system prompt. The model
 * must return STRICT JSON `{ riskScoreBps, decision, rationale, factors[] }`.
 *
 * ANY failure — missing key for a remote endpoint, timeout, network error,
 * bad JSON, schema violation — falls back to the pure-heuristic
 * `analyzeRisk()` from reason.ts and marks the verdict `{ llm: false }`.
 * The fallback path never touches the network.
 *
 * Env (never log the key):
 *   LLM_BASE_URL  default http://localhost:1234/v1 (LM Studio, key optional)
 *   LLM_API_KEY   optional for local; required for remote base URLs
 *   LLM_MODEL     default "local-model"
 *
 * Opt-in only: CLI passes `--llm` to enable; default path is unchanged.
 */
import { analyzeRisk, type ReasonInput, type ReasonOutput } from "./reason.js";

/** Default OpenAI-compatible base URL (local LM Studio, no key needed). */
export const DEFAULT_LLM_BASE_URL = "http://localhost:1234/v1";
/** Default model name used when LLM_MODEL is unset. */
export const DEFAULT_LLM_MODEL = "local-model";
/** Abort timeout in ms for a single LLM chat-completion request. */
export const LLM_TIMEOUT_MS = 15_000;

/** Tight system prompt — pins the analyst role + strict JSON contract. */
export const LLM_SYSTEM_PROMPT = [
  "You are a DeFi risk analyst scoring a Uniswap pool for an automated agent.",
  "Higher score = riskier. Score is in basis points, integer 0..10000.",
  "Decide ACT (safe to proceed) or SKIP (too risky) vs the given threshold.",
  "Consider: thin liquidity (low TVL), low 24h turnover (volume/TVL),",
  "bearish paid alpha signal, revoked agent identity (always SKIP).",
  "Output STRICT JSON only, no markdown, no prose outside the JSON:",
  '{"riskScoreBps": <int 0..10000>, "decision": "ACT"|"SKIP",',
  ' "rationale": "<one or two sentences>",',
  ' "factors": [{"name": "<slug>", "bps": <int>, "note": "<short>"}]}',
].join(" ");

/** Pool intel facts scored by the LLM/heuristic paths. */
export interface BrainIntel {
  /** Total value locked in USD. */
  tvlUsd: number;
  /** 24h trading volume in USD. */
  volume24hUsd: number;
  /** 24h LP fees in USD (optional). */
  fees24hUsd?: number;
}

/** Paid x402 alpha signal facts. */
export interface BrainAlpha {
  /** Alpha score in [-1, 1] (negative = bearish). */
  score?: number;
  /** Signal direction. */
  direction?: "long" | "short" | "neutral";
}

/** Agent identity facts feeding the risk score. */
export interface BrainIdentity {
  /** True when the agent wallet is authorized. */
  authorized?: boolean;
  /** True when identity checks passed upstream. */
  identityOk?: boolean;
  /** True when the agent was revoked/expired. */
  revoked?: boolean;
}

/** Overrides for the LLM call (base URL, key, model, timeout, injectable fetch). */
export interface LlmReasonOptions {
  /** OpenAI-compatible base URL (default: env LLM_BASE_URL or local LM Studio). */
  baseUrl?: string;
  /** API key (required only for remote base URLs; never logged). */
  apiKey?: string;
  /** Model name (default: env LLM_MODEL or local-model). */
  model?: string;
  /** Abort timeout in ms. */
  timeoutMs?: number;
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/** Heuristic verdict plus the LLM-origin flag. */
export type BrainVerdict = ReasonOutput & {
  /** true when the verdict came from the LLM, false on heuristic fallback. */
  llm: boolean;
  /** Model that produced the verdict (LLM path only). */
  model?: string;
};

interface ResolvedLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/**
 * Resolve the effective LLM config from explicit opts over env over defaults.
 * @param opts Explicit overrides (baseUrl, apiKey, model, timeoutMs).
 * @returns Resolved { baseUrl, apiKey, model, timeoutMs } (baseUrl trailing-slash trimmed).
 */
export function resolveLlmConfig(opts: LlmReasonOptions = {}): ResolvedLlmConfig {
  const baseUrl = (opts.baseUrl ?? process.env.LLM_BASE_URL ?? DEFAULT_LLM_BASE_URL).replace(/\/+$/, "");
  const apiKey = opts.apiKey ?? process.env.LLM_API_KEY ?? "";
  const model = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
  return { baseUrl, apiKey, model, timeoutMs };
}

/**
 * Escape HTML special chars so LLM-controlled rationale text can never
 * break out into markup in any HTML consumer (frontend verdict cards,
 * reports, innerHTML renders). Applied at verdict construction in
 * parseLlmVerdict — escape at the boundary, not at every render site.
 * @param s Raw string (possibly LLM-controlled).
 * @returns HTML-escaped string (&<>"' escaped).
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Local LM Studio-style URLs never need a key; remote ones do.
 * @param baseUrl LLM base URL to classify.
 * @returns True for localhost/127.0.0.1 http(s) URLs.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `http://${baseUrl}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Trust boundary: only https:// remotes or http(s) localhost are allowed.
 * ALL other plain-http — including intranet hosts (10/8, 192.168/16,
 * 172.16/12, link-local, ::1, .local, DNS-rebinding-style suffixes like
 * `localhost.evil.com`) — is rejected (warn + heuristic fallback in
 * `reasonWithLLM`) so an LLM key / prompt never goes over cleartext.
 * Hostname matching is exact (URL-parsed, trailing-dot tolerant); there is
 * intentionally no suffix/prefix matching.
 * @param baseUrl LLM base URL to vet.
 * @returns True when the URL is https:// or localhost-http(s).
 */
export function isAllowedLlmBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (/^https:\/\//i.test(trimmed)) return true;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    if (u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Shared input mapping so LLM and heuristic paths score the same facts.
 * @param intel Pool intel facts (tvl, volume, fees).
 * @param alpha Paid alpha signal (score, direction).
 * @param identity Identity facts (authorized/identityOk/revoked).
 * @returns ReasonInput for analyzeRisk.
 */
export function toReasonInput(intel: BrainIntel, alpha: BrainAlpha = {}, identity: BrainIdentity = {}): ReasonInput {
  const identityOk =
    identity.identityOk ?? (identity.authorized !== undefined ? identity.authorized : identity.revoked !== undefined ? !identity.revoked : undefined);
  return {
    tvlUsd: intel.tvlUsd,
    volume24hUsd: intel.volume24hUsd,
    fees24hUsd: intel.fees24hUsd,
    alphaScore: alpha.score ?? 0,
    alphaDirection: alpha.direction ?? "neutral",
    identityOk,
  };
}

/**
 * User message: the facts to score, as compact JSON.
 * @param intel Pool intel facts.
 * @param alpha Paid alpha signal.
 * @param identity Identity facts.
 * @param thresholdBps Risk threshold in bps.
 * @returns Compact JSON string sent as the LLM user message.
 */
export function buildLlmUserPrompt(
  intel: BrainIntel,
  alpha: BrainAlpha,
  identity: BrainIdentity,
  thresholdBps: number,
): string {
  return JSON.stringify({ intel, alpha, identity, thresholdBps });
}

function fallback(intel: BrainIntel, alpha: BrainAlpha, identity: BrainIdentity, thresholdBps: number): BrainVerdict {
  return { ...analyzeRisk(toReasonInput(intel, alpha, identity), thresholdBps), llm: false };
}

/**
 * Strict schema validation: score int 0..10000, decision ACT|SKIP.
 * @param raw Raw model output string (must be strict JSON).
 * @returns Validated ReasonOutput, or null when parsing/schema checks fail.
 */
export function parseLlmVerdict(raw: string): ReasonOutput | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.riskScoreBps !== "number" || !Number.isInteger(o.riskScoreBps) || o.riskScoreBps < 0 || o.riskScoreBps > 10_000)
    return null;
  if (o.decision !== "ACT" && o.decision !== "SKIP") return null;
  if (typeof o.rationale !== "string" || o.rationale.length === 0) return null;
  if (!Array.isArray(o.factors)) return null;
  for (const f of o.factors) {
    if (typeof f !== "object" || f === null) return null;
    const fo = f as Record<string, unknown>;
    // P2: each factor bps must be finite AND in 0..10000 — out-of-range or
    // non-finite values reject the whole verdict → heuristic fallback.
    if (
      typeof fo.name !== "string" ||
      typeof fo.bps !== "number" ||
      !Number.isFinite(fo.bps) ||
      fo.bps < 0 ||
      fo.bps > 10_000 ||
      typeof fo.note !== "string"
    )
      return null;
  }
  // Escape at construction: rationale/factor text is LLM-controlled and may
  // reach HTML consumers — escaped once here, safe everywhere downstream.
  return {
    riskScoreBps: o.riskScoreBps,
    decision: o.decision,
    rationale: escapeHtml(o.rationale),
    factors: (o.factors as { name: string; bps: number; note: string }[]).map((f) => ({
      name: escapeHtml(f.name),
      bps: Math.round(f.bps),
      note: escapeHtml(f.note),
    })),
  };
}

function extractContent(json: unknown): string | null {
  const c = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    // Some gateways return content parts [{ type: "text", text }] — join text parts.
    const text = c
      .filter((p): p is { text: string } => typeof p === "object" && p !== null && typeof (p as { text?: unknown }).text === "string")
      .map((p) => p.text)
      .join("");
    return text || null;
  }
  return null;
}

/**
 * Reason with the LLM, falling back to `analyzeRisk` on ANY failure.
 * Never throws for LLM-side reasons — the worst case is `{ llm: false }`.
 * @param intel Pool intel facts.
 * @param alpha Paid alpha signal.
 * @param identity Identity facts.
 * @param thresholdBps Risk threshold in bps.
 * @param opts LLM overrides (baseUrl, apiKey, model, timeoutMs, fetchImpl).
 * @returns BrainVerdict with llm true on the LLM path, false on heuristic fallback.
 */
export async function reasonWithLLM(
  intel: BrainIntel,
  alpha: BrainAlpha = {},
  identity: BrainIdentity = {},
  thresholdBps: number,
  opts: LlmReasonOptions = {},
): Promise<BrainVerdict> {
  const { baseUrl, apiKey, model, timeoutMs } = resolveLlmConfig(opts);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

  // P2: reject cleartext remote endpoints — warn and use heuristic fallback.
  if (!isAllowedLlmBaseUrl(baseUrl)) {
    console.warn(`[brain] rejecting insecure LLM_BASE_URL "${baseUrl}" — using heuristic fallback`);
    return fallback(intel, alpha, identity, thresholdBps);
  }

  // No key for a remote endpoint → skip the network entirely, use heuristic.
  if (!apiKey && !isLocalBaseUrl(baseUrl)) return fallback(intel, alpha, identity, thresholdBps);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: LLM_SYSTEM_PROMPT },
          { role: "user", content: buildLlmUserPrompt(intel, alpha, identity, thresholdBps) },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return fallback(intel, alpha, identity, thresholdBps);
    const content = extractContent(await res.json().catch(() => null));
    if (!content) return fallback(intel, alpha, identity, thresholdBps);
    const parsed = parseLlmVerdict(content);
    if (!parsed) return fallback(intel, alpha, identity, thresholdBps);
    return { ...parsed, llm: true, model };
  } catch {
    return fallback(intel, alpha, identity, thresholdBps);
  } finally {
    clearTimeout(timer);
  }
}
