/**
 * @author Ramprasad
 * @module classify — server-side error classification (TypeSafe Choice, never throws).
 *
 * Browser clients must never hold TYPESAFE_API_KEY, so wallet/RPC error
 * text is classified here: the frontend POSTs the message to
 * /v1/classify-error and routes on the returned label. Regex stays the
 * offline fallback (see frontend/components/HireWizard.tsx).
 *
 * Env deps: TYPESAFE_API_KEY (gate runs only when set),
 * TYPESAFE_MODEL (default jev-1.12), TYPESAFE_CLASSIFY_THRESHOLD (default 0.7).
 * Never pass secrets in `message` — it is sent to the TypeSafe API.
 */

export const ERROR_CLASSES = [
  'label_taken',
  'insufficient_funds',
  'user_rejected',
  'network_error',
  'unknown',
] as const;

export type ErrorLabel = (typeof ERROR_CLASSES)[number];

/** Plain-word criteria per class (the model matches on meaning, not keywords). */
const CRITERIA: Record<ErrorLabel, string> = {
  label_taken: 'the name, label, or identity is already registered, taken, or minted',
  insufficient_funds: 'the wallet lacks funds, gas, or token balance to complete the transaction',
  user_rejected: 'the user declined, rejected, or cancelled the signature or transaction in their wallet',
  network_error: 'an RPC, connectivity, timeout, or chain-id problem prevented the call',
  unknown: 'none of the other classes fits this error',
};

/** Max message chars sent to the model (bounds tokens; errors are front-loaded). */
export const MAX_CLASSIFY_CHARS = 2000;
/** Default minimum Choice confidence to trust the label. */
export const DEFAULT_CLASSIFY_THRESHOLD = 0.7;
/** Timeout ms for one classifier request. */
export const CLASSIFY_TIMEOUT_MS = 10_000;

export interface ClassifyOptions {
  /** True forces on, false forces off, undefined = auto (on only when TYPESAFE_API_KEY present). */
  enabled?: boolean;
  /** TypeSafe API key override (default: env TYPESAFE_API_KEY). */
  apiKey?: string;
  /** Classifier model (default: env TYPESAFE_MODEL or jev-1.12). */
  model?: string;
  /** Minimum confidence to trust the label (default: env TYPESAFE_CLASSIFY_THRESHOLD or 0.7). */
  threshold?: number;
  /** Injectable fetch (tests only; default: global fetch). */
  fetchImpl?: typeof fetch;
}

export interface ErrorClassification {
  /** Winning class. */
  label: ErrorLabel;
  /** Choice confidence for the winner (0..1). */
  confidence: number;
}

function resolveConfig(opts: ClassifyOptions = {}): { enabled: boolean; apiKey: string; model: string; threshold: number } {
  const apiKey = opts.apiKey ?? process.env.TYPESAFE_API_KEY ?? '';
  const model = opts.model ?? process.env.TYPESAFE_MODEL ?? 'jev-1.12';
  const raw = opts.threshold ?? Number(process.env.TYPESAFE_CLASSIFY_THRESHOLD ?? DEFAULT_CLASSIFY_THRESHOLD);
  const threshold = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : DEFAULT_CLASSIFY_THRESHOLD;
  const enabled = opts.enabled ?? apiKey.length > 0;
  return { enabled, apiKey, model, threshold };
}

/**
 * Classify a wallet/RPC error message into one ErrorLabel.
 * Never throws — any skip/failure returns null (caller uses regex fallback).
 * @param message Raw error text (truncated to MAX_CLASSIFY_CHARS).
 * @param opts Classifier overrides (key, model, threshold, injectable fetch).
 * @returns Classification for a confident winner, else null.
 */
export async function classifyError(message: unknown, opts: ClassifyOptions = {}): Promise<ErrorClassification | null> {
  const { enabled, apiKey, model, threshold } = resolveConfig(opts);
  if (!enabled || apiKey.length === 0) return null;
  if (typeof message !== 'string' || message.trim().length === 0) return null;
  const text = message.slice(0, MAX_CLASSIFY_CHARS);
  try {
    const { TypeSafeClient, choice } = await import('@typesafe-ai/sdk');
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const client = new TypeSafeClient({ apiKey, timeout: CLASSIFY_TIMEOUT_MS, fetch: fetchImpl as never });
    const { answers } = await client.systemOne({
      state: { error: text },
      questions: { label: choice('What kind of wallet or transaction error is this?', { ...CRITERIA }) },
      model,
    });
    const ans = (answers as Record<string, { choice?: unknown; confidence?: unknown }>).label;
    const label = typeof ans?.choice === 'string' ? ans.choice : null;
    const confidence =
      typeof ans?.confidence === 'number' && Number.isFinite(ans.confidence) ? ans.confidence : 0;
    if (!label || !(ERROR_CLASSES as readonly string[]).includes(label) || confidence < threshold) return null;
    return { label: label as ErrorLabel, confidence };
  } catch {
    return null;
  }
}
