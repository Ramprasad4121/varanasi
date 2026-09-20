/**
 * @author Ramprasad — closed-set input resolution (exact-first, TypeSafe on miss; never throws).
 * select.ts — free-text input → one of a fixed set of values.
 *
 * Exact case-insensitive match wins in code (zero cost, deterministic).
 * Only on a miss does Jev see the input: one `Choice` over the option names
 * (criteria = caller-supplied plain-word descriptions) plus a `none` hatch.
 * No confident winner → null (caller throws its usual usage error).
 *
 * Follows the function-calling cookbook: closed sets stay closed — whatever
 * reaches the function is a value the function accepts. Env (shared with
 * brain.ts): TYPESAFE_API_KEY (gate runs only when set),
 * TYPESAFE_MODEL (default jev-1.12), TYPESAFE_VERIFY_THRESHOLD (default 0.7).
 */
import type { ChoiceQuestion, Questions } from "@typesafe-ai/sdk";
import { resolveVerifyConfig } from "./brain.js";

/** "None of these" hatch id (rejects the whole shortlist). */
export const SELECT_NONE = "none";

/** Options for resolveClosedSet (mirrors the brain.ts verifier gate). */
export interface ClosedSetOptions {
  /** True forces the model path on, false forces off, undefined = auto (on only when TYPESAFE_API_KEY present). */
  verify?: boolean;
  /** TypeSafe API key override (default: env TYPESAFE_API_KEY). */
  typesafeApiKey?: string;
  /** Model override (default: env TYPESAFE_MODEL or jev-1.12). */
  typesafeModel?: string;
  /** Minimum Choice confidence to trust the pick (default: env TYPESAFE_VERIFY_THRESHOLD or 0.7). */
  verifyThreshold?: number;
  /** Injectable fetch (tests only; default: global fetch). */
  typesafeFetchImpl?: typeof fetch;
}

/** Resolution outcome: the accepted value and how it was reached. */
export interface ClosedSetResolution {
  /** Accepted value (always one of `options`). */
  value: string;
  /** "exact" for a code match, "model" for a Jev pick. */
  via: "exact" | "model";
  /** Choice confidence (1 for exact matches). */
  confidence: number;
}

/**
 * Resolve free-text input to one of a fixed set of values.
 * Never throws — null means "no confident resolution" (caller errors as before).
 * @param input Raw user input (CLI flag, chat text, query param).
 * @param options Fixed values the caller accepts.
 * @param labels Plain-word description per option (model matches on meaning).
 * @param opts Gate overrides (key, model, threshold, injectable fetch).
 * @returns Resolution, or null when neither exact nor model resolves.
 */
export async function resolveClosedSet(
  input: unknown,
  options: readonly string[],
  labels: Record<string, string> = {},
  opts: ClosedSetOptions = {},
): Promise<ClosedSetResolution | null> {
  if (options.length === 0) return null;
  const norm = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (norm.length > 0) {
    const hit = options.find((o) => o.toLowerCase() === norm);
    if (hit) return { value: hit, via: "exact", confidence: 1 };
  }
  if (norm.length === 0) return null;
  const { enabled, apiKey, model, threshold } = resolveVerifyConfig({
    verify: opts.verify,
    typesafeApiKey: opts.typesafeApiKey,
    typesafeModel: opts.typesafeModel,
    verifyThreshold: opts.verifyThreshold,
  });
  if (!enabled || apiKey.length === 0) return null;
  try {
    const { TypeSafeClient, choice } = await import("@typesafe-ai/sdk");
    const fetchImpl = opts.typesafeFetchImpl ?? globalThis.fetch.bind(globalThis);
    const client = new TypeSafeClient({ apiKey, timeout: 10_000, fetch: fetchImpl as never });
    const criteria: Record<string, string | null> = {};
    for (const o of options) criteria[o] = labels[o] ?? null;
    criteria[SELECT_NONE] = "The input asks for none of these.";
    const questions: Questions = {
      pick: choice("Which of these fixed options does the input ask for?", criteria) as ChoiceQuestion,
    };
    const { answers } = await client.systemOne({ state: { input: typeof input === "string" ? input : JSON.stringify(input) ?? String(input) }, questions, model });
    const ans = (answers as Record<string, { choice?: unknown; confidence?: unknown }>).pick;
    const winner = typeof ans?.choice === "string" ? ans.choice : null;
    const confidence = typeof ans?.confidence === "number" && Number.isFinite(ans.confidence) ? ans.confidence : 0;
    if (!winner || winner === SELECT_NONE || confidence < threshold) return null;
    const hit = options.find((o) => o === winner);
    return hit ? { value: hit, via: "model", confidence } : null;
  } catch {
    return null;
  }
}
