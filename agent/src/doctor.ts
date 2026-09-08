/**
 * @author Ramprasad — guided preflight for the varanasi agent (`runDoctor`, `formatDoctor`; env read-only, secrets never printed).
 * doctor.ts — noob-proof preflight: every external dependency checked BEFORE
 * a live `analyze` run, with an exact fix command on each failure.
 *
 * Checks (each PASS/FAIL with a fix):
 *  1. env presence — GRAPH_API_KEY, SEPOLIA_RPC_URL, AEGIS_REGISTRY,
 *     HEDERA_AGENT_ACCOUNT_ID, HEDERA_AGENT_PRIVATE_KEY (LENGTHS only, never values)
 *  2. SIGNAL_URL shape — https or localhost-http (see pay.ts isAllowedSignalUrl)
 *  3. Sepolia RPC reachability — eth_chainId must be 11155111
 *  4. Registry + escrow code exists — eth_getCode non-empty
 *  5. Graph key validity — 1 cheap `{__typename}` query against the Gateway
 *  6. Service /health reachable — GET <signal-origin>/health
 *  7. HCS topic configured — HCS_TOPIC_ID (skipped when HCS_ENABLED=0)
 *
 * All network goes through an injectable fetchImpl so tests cover failure
 * paths without touching the network. Never throws for check-side reasons —
 * every failure is a FAIL row, not an exception.
 */
import { GATEWAY_BASE, KNOWN_SUBGRAPHS } from "./graph.js";
import { isAllowedSignalUrl } from "./pay.js";
import { TASK_ESCROW_ADDRESS } from "./mandate.js";

/** Sepolia chain id (decimal + 0x). */
export const SEPOLIA_CHAIN_ID_DEC = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/** One preflight result row. */
export interface DoctorCheck {
  /** Stable check id, e.g. "env:GRAPH_API_KEY". */
  name: string;
  /** True when the check passed. */
  ok: boolean;
  /** Human-readable outcome (lengths only for secrets — never values). */
  detail: string;
  /** Exact command / step that fixes a FAIL (empty when passing). */
  fix: string;
}

/** Options for runDoctor (env overrides + injectable fetch + timeout). */
export interface DoctorOptions {
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Sepolia RPC URL override (default: env SEPOLIA_RPC_URL). */
  rpcUrl?: string;
  /** Signal service URL override (default: env SIGNAL_URL). */
  signalUrl?: string;
  /** Registry override (default: env AEGIS_REGISTRY). */
  registry?: string;
  /** Escrow override (default: env TASK_ESCROW or live TASK_ESCROW_ADDRESS). */
  escrow?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_SIGNAL_URL = "http://localhost:3001/v1/signal";

function fail(name: string, detail: string, fix: string): DoctorCheck {
  return { name, ok: false, detail, fix };
}

function pass(name: string, detail: string): DoctorCheck {
  return { name, ok: true, detail, fix: "" };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCall(
  fetchImpl: typeof fetch,
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<unknown> {
  const res = await fetchWithTimeout(
    fetchImpl,
    rpcUrl,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    },
    timeoutMs,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(String(json.error.message ?? "RPC error").slice(0, 120));
  return json.result;
}

/**
 * Run the full preflight suite (env + RPC + registry/escrow code + Graph
 * key + service /health + HCS topic). Reads env, never prints secret values.
 * @param opts Doctor overrides (fetchImpl, timeoutMs, rpcUrl, signalUrl, registry, escrow).
 * @returns Ordered DoctorCheck rows (PASS/FAIL with fix commands).
 */
export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // ── 1. env presence (lengths only, never values) ──
  const graphKey = process.env.GRAPH_API_KEY ?? "";
  checks.push(
    graphKey
      ? pass("env:GRAPH_API_KEY", `set (${graphKey.length} chars)`)
      : fail("env:GRAPH_API_KEY", "missing", "export GRAPH_API_KEY=<Subgraph Studio key>  # https://thegraph.com/studio"),
  );

  const rpcUrl = opts.rpcUrl ?? process.env.SEPOLIA_RPC_URL ?? "";
  checks.push(
    rpcUrl
      ? pass("env:SEPOLIA_RPC_URL", `set (${rpcUrl.length} chars)`)
      : fail("env:SEPOLIA_RPC_URL", "missing", "export SEPOLIA_RPC_URL=https://rpc.sepolia.org"),
  );

  const registry = opts.registry ?? process.env.AEGIS_REGISTRY ?? "";
  const registryOkShape = /^0x[0-9a-fA-F]{40}$/.test(registry);
  checks.push(
    !registry
      ? fail("env:AEGIS_REGISTRY", "missing", "export AEGIS_REGISTRY=0x<registry>  # redeploy or reuse the Sepolia deployment")
      : !registryOkShape
        ? fail("env:AEGIS_REGISTRY", "not a 0x address", "export AEGIS_REGISTRY=0x<40-hex-char address>")
        : pass("env:AEGIS_REGISTRY", `set (${registry.length} chars, valid address shape)`),
  );

  const hederaAccount = process.env.HEDERA_AGENT_ACCOUNT_ID ?? "";
  const hederaKey = process.env.HEDERA_AGENT_PRIVATE_KEY ?? "";
  checks.push(
    hederaAccount
      ? pass("env:HEDERA_AGENT_ACCOUNT_ID", `set (${hederaAccount.length} chars)`)
      : fail("env:HEDERA_AGENT_ACCOUNT_ID", "missing", "export HEDERA_AGENT_ACCOUNT_ID=0.0.<num>  # Hedera testnet account"),
  );
  checks.push(
    hederaKey
      ? pass("env:HEDERA_AGENT_PRIVATE_KEY", `set (${hederaKey.length} chars, value hidden)`)
      : fail(
          "env:HEDERA_AGENT_PRIVATE_KEY",
          "missing",
          "export HEDERA_AGENT_PRIVATE_KEY=<ECDSA key>  # never pass keys via CLI flags",
        ),
  );

  // ── 2. SIGNAL_URL shape ──
  const signalUrl = opts.signalUrl ?? process.env.SIGNAL_URL ?? DEFAULT_SIGNAL_URL;
  checks.push(
    isAllowedSignalUrl(signalUrl)
      ? pass("signal-url", `allowed (${signalUrl.length} chars, https or localhost-http)`)
      : fail(
          "signal-url",
          "refused: must be https:// or http://localhost",
          "export SIGNAL_URL=https://<host>/v1/signal  # or http://localhost:3001/v1/signal for local dev",
        ),
  );

  // ── 3. Sepolia RPC reachability (chainId) ──
  if (!rpcUrl) {
    checks.push(fail("rpc:chainId", "skipped (no RPC URL)", "export SEPOLIA_RPC_URL=https://rpc.sepolia.org"));
  } else {
    try {
      const chainId = await rpcCall(fetchImpl, rpcUrl, "eth_chainId", [], timeoutMs);
      checks.push(
        String(chainId).toLowerCase() === SEPOLIA_CHAIN_ID_HEX
          ? pass("rpc:chainId", `Sepolia reachable (chainId ${SEPOLIA_CHAIN_ID_DEC})`)
          : fail(
              "rpc:chainId",
              `wrong chain ${String(chainId).slice(0, 24)} (want ${SEPOLIA_CHAIN_ID_HEX})`,
              "export SEPOLIA_RPC_URL=https://rpc.sepolia.org  # must point at Sepolia",
            ),
      );
    } catch (e: unknown) {
      checks.push(
        fail(
          "rpc:chainId",
          `unreachable: ${String((e as Error)?.message ?? e).slice(0, 100)}`,
          "export SEPOLIA_RPC_URL=https://rpc.sepolia.org  # then re-run doctor",
        ),
      );
    }
  }

  // ── 4. Registry + escrow code exists ──
  const escrow = opts.escrow ?? process.env.TASK_ESCROW ?? TASK_ESCROW_ADDRESS;
  for (const [label, addr] of [["rpc:registry-code", registry], ["rpc:escrow-code", escrow]] as const) {
    if (!rpcUrl || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      checks.push(fail(label, "skipped (no RPC URL or bad address)", "fix the env check above, then re-run doctor"));
    } else {
      try {
        const code = await rpcCall(fetchImpl, rpcUrl, "eth_getCode", [addr, "latest"], timeoutMs);
        checks.push(
          typeof code === "string" && code !== "0x" && code.length > 2
            ? pass(label, `contract deployed (${String(code).length} hex chars)`)
            : fail(label, `no code at ${addr.slice(0, 10)}…`, "export AEGIS_REGISTRY=0x<deployed registry>  # address has no contract"),
        );
      } catch (e: unknown) {
        checks.push(
          fail(label, `RPC error: ${String((e as Error)?.message ?? e).slice(0, 100)}`, "export SEPOLIA_RPC_URL=https://rpc.sepolia.org"),
        );
      }
    }
  }

  // ── 5. Graph key validity (1 cheap query) ──
  if (!graphKey) {
    checks.push(fail("graph:key", "skipped (no GRAPH_API_KEY)", "export GRAPH_API_KEY=<Subgraph Studio key>"));
  } else {
    try {
      const res = await fetchWithTimeout(
        fetchImpl,
        `${GATEWAY_BASE}/${graphKey}/subgraphs/id/${KNOWN_SUBGRAPHS.uniswapV3}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "{__typename}" }),
        },
        timeoutMs,
      );
      if (res.status === 401 || res.status === 403) {
        checks.push(fail("graph:key", `rejected (HTTP ${res.status})`, "export GRAPH_API_KEY=<valid Subgraph Studio key>"));
      } else if (!res.ok) {
        checks.push(
          fail("graph:key", `gateway HTTP ${res.status}`, "check network access, then re-run doctor"),
        );
      } else {
        checks.push(pass("graph:key", "valid (cheap __typename query succeeded)"));
      }
    } catch (e: unknown) {
      checks.push(
        fail("graph:key", `unreachable: ${String((e as Error)?.message ?? e).slice(0, 100)}`, "check network access, then re-run doctor"),
      );
    }
  }

  // ── 6. Service /health reachable ──
  try {
    const origin = new URL(signalUrl).origin;
    const res = await fetchWithTimeout(fetchImpl, `${origin}/health`, { method: "GET" }, timeoutMs);
    if (!res.ok) {
      checks.push(
        fail("signal:health", `/health HTTP ${res.status}`, "cd service && npm run dev  # start the x402 signal service"),
      );
    } else {
      checks.push(pass("signal:health", "/health reachable"));
    }
  } catch (e: unknown) {
    checks.push(
      fail(
        "signal:health",
        `unreachable: ${String((e as Error)?.message ?? e).slice(0, 100)}`,
        "cd service && npm run dev  # start the x402 signal service on :3001",
      ),
    );
  }

  // ── 7. HCS topic configured ──
  const hcsEnabled = (process.env.HCS_ENABLED ?? "1").trim().toLowerCase();
  const hcsDisabled = ["0", "false", "no", "off"].includes(hcsEnabled);
  const topic = (process.env.HCS_TOPIC_ID ?? "").trim();
  if (hcsDisabled) {
    checks.push(pass("hcs:topic", "skipped (HCS_ENABLED=0)"));
  } else {
    checks.push(
      topic
        ? pass("hcs:topic", `set (${topic.length} chars)`)
        : fail("hcs:topic", "missing", "export HCS_TOPIC_ID=0.0.<num>  # or HCS_ENABLED=0 to disable audit logging"),
    );
  }

  return checks;
}

/**
 * Render doctor rows as guided PASS/FAIL lines (FAIL rows carry the fix).
 * @param checks Rows from runDoctor.
 * @returns Multiline string (one PASS/FAIL line per check + summary).
 */
export function formatDoctor(checks: DoctorCheck[]): string {
  const lines = checks.map((c) =>
    c.ok ? `PASS ${c.name} — ${c.detail}` : `FAIL ${c.name} — ${c.detail}\n  fix: ${c.fix}`,
  );
  const failed = checks.filter((c) => !c.ok).length;
  lines.push(failed === 0 ? `doctor: all ${checks.length} checks passed` : `doctor: ${failed}/${checks.length} checks failed — apply the fix: lines above`);
  return lines.join("\n");
}
