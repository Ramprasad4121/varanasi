// Author: Ramprasad — typed backend client for the varanasi signal service.
// Single place that knows how NEXT_PUBLIC_SIGNAL_URL maps to service routes,
// with timeouts, typed errors, and graceful degradation (never throws to UI).

export const BACKEND_TIMEOUT_MS = 12_000;

export type BackendError = {
  kind: "unreachable" | "http" | "timeout" | "bad-shape";
  message: string;
  status?: number;
};

export type BackendResult<T> = { ok: true; data: T } | { ok: false; error: BackendError };

function rawBase(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SIGNAL_URL ?? "").trim();
  // Same-origin proxy in production (see next.config.js rewrites):
  // set NEXT_PUBLIC_SIGNAL_URL=/api/backend to avoid CORS entirely.
  if (fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    // Dev fallback: same host is the Next app; the service lives on :4021.
    // In production without env, try the same-origin proxy first.
    return "";
  }
  return "http://localhost:4021";
}

/** Service root, e.g. http://localhost:4021 (strips any /v1/... suffix). */
export function backendRoot(): string {
  const base = rawBase();
  if (base === "") return "";
  return base.replace(/\/v1\/(signal|receipts|finance.*)?$/, "").replace(/\/v1$/, "");
}

function join(root: string, path: string): string {
  // Browser calls go same-origin (/api/backend/...) so ad-blockers, tracker
  // blockers, and CORS edge cases can never break them: Vercel rewrites
  // (next.config.js) forward to the Render host server-side. Direct URLs are
  // kept for non-browser contexts (SSR, scripts).
  if (typeof window !== "undefined" && /^https?:\/\//.test(root)) {
    return `/api/backend${path}`;
  }
  if (root === "") return `/api/backend${path}`;
  return `${root}${path}`;
}

export const backendUrls = {
  health: () => join(backendRoot(), "/health"),
  ready: () => join(backendRoot(), "/ready"),
  version: () => join(backendRoot(), "/version"),
  signal: () => join(backendRoot(), "/v1/signal"),
  receipts: () => join(backendRoot(), "/v1/receipts"),
  finance: (address: string) =>
    join(backendRoot(), `/v1/finance?address=${encodeURIComponent(address)}`),
  financeRecommend: (address: string) =>
    join(backendRoot(), `/v1/finance/recommend?address=${encodeURIComponent(address)}`),
};

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs: number = BACKEND_TIMEOUT_MS): Promise<BackendResult<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      return {
        ok: false,
        error: { kind: "http", status: res.status, message: `HTTP ${res.status} from ${url}` },
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: { kind: "timeout", message: `Timed out after ${timeoutMs}ms: ${url}` } };
    }
    return {
      ok: false,
      error: { kind: "unreachable", message: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(timer);
  }
}

export type HealthReply = {
  status: string;
  service: string;
  network: string;
  facilitator: string;
  receiver: string;
  paidRoutes: string[];
  receiptsServed: number;
};

export type VersionReply = {
  service: string;
  version: string;
  gitSha: string;
  nodeEnv: string;
  network: string;
  uptimeSeconds: number;
};

export function getHealth(timeoutMs?: number): Promise<BackendResult<HealthReply>> {
  return fetchJson<HealthReply>(backendUrls.health(), undefined, timeoutMs);
}

export function getVersion(): Promise<BackendResult<VersionReply>> {
  return fetchJson<VersionReply>(backendUrls.version());
}

export function getReceipts(): Promise<BackendResult<{ count: number; receipts: unknown[] }>> {
  return fetchJson(backendUrls.receipts());
}

export function isConfigured(): boolean {
  return (process.env.NEXT_PUBLIC_SIGNAL_URL ?? "").trim().length > 0;
}
