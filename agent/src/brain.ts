/**
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

export const DEFAULT_LLM_BASE_URL = "http://localhost:1234/v1";
export const DEFAULT_LLM_MODEL = "local-model";
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

export interface BrainIntel {
  tvlUsd: number;
  volume24hUsd: number;
  fees24hUsd?: number;
}

export interface BrainAlpha {
  score?: number;
  direction?: "long" | "short" | "neutral";
}

export interface BrainIdentity {
  authorized?: boolean;
  identityOk?: boolean;
  revoked?: boolean;
}

export interface LlmReasonOptions {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

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

export function resolveLlmConfig(opts: LlmReasonOptions = {}): ResolvedLlmConfig {
  const baseUrl = (opts.baseUrl ?? process.env.LLM_BASE_URL ?? DEFAULT_LLM_BASE_URL).replace(/\/+$/, "");
  const apiKey = opts.apiKey ?? process.env.LLM_API_KEY ?? "";
  const model = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
  return { baseUrl, apiKey, model, timeoutMs };
}

/** Local LM Studio-style URLs never need a key; remote ones do. */
export function isLocalBaseUrl(baseUrl: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl);
}

/**
 * P2 trust boundary: only https:// remotes or http(s) localhost are allowed.
 * Plain-http remote URLs are rejected (warn + heuristic fallback in
 * `reasonWithLLM`) so an LLM key / prompt never goes over cleartext.
 */
export function isAllowedLlmBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (isLocalBaseUrl(trimmed)) return true;
  return /^https:\/\//i.test(trimmed);
}

/** Shared input mapping so LLM and heuristic paths score the same facts. */
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

/** User message: the facts to score, as compact JSON. */
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

/** Strict schema validation: score int 0..10000, decision ACT|SKIP. */
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
  return {
    riskScoreBps: o.riskScoreBps,
    decision: o.decision,
    rationale: o.rationale,
    factors: (o.factors as { name: string; bps: number; note: string }[]).map((f) => ({
      name: f.name,
      bps: Math.round(f.bps),
      note: f.note,
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
