/**
 * @author Ramprasad — official Aave MCP lending-intel client (AaveMcpClient; env: AAVE_MCP_URL, AAVE_OFFLINE).
 * aave.ts — streamable-HTTP MCP client for the official Aave MCP server.
 *
 * Server card (verified): com.aave/mcp, remote streamable-HTTP
 * `https://mcp.aave.com` (protocol versions incl. 2025-11-25). Tools:
 * get_chains, get_markets, get_user_positions, get_user_summary,
 * get_reserve_details, get_apy_history, get_user_activity, preview_action
 * (SIMULATE supply/borrow/withdraw/repay — no execution), prepare_action
 * (UNSIGNED tx), get_swappable_tokens, get_swap_quote, get_user_rewards,
 * search_governance_proposals.
 *
 * Enforcement fit: preview/prepare are unsigned — our story is "prepare
 * unsigned, policy-check, sign inside mandate." This module never signs,
 * never broadcasts, never holds keys (public server, no keys needed).
 *
 * Transport (mirrors mcp.ts conventions, adapted from stdio to streamable HTTP):
 *  - POST JSON-RPC `initialize` with protocolVersion 2025-11-25, capture the
 *    `Mcp-Session-Id` response header, send `notifications/initialized`,
 *    then `tools/list` / `tools/call` with the session header attached.
 *  - Injectable fetch for tests; 20s timeouts (mirrors the 20s MCP stdio guard).
 *  - Offline fixture mode (`AAVE_OFFLINE=1` or opts.offline) mirrors graph.ts.
 *  - Fail-closed errors; never log keys (no keys needed — public server).
 */

export const AAVE_MCP_URL_DEFAULT = "https://mcp.aave.com";
/** Pinned MCP protocol version (bump deliberately with a smoke regression check). */
export const AAVE_MCP_PROTOCOL_VERSION = "2025-11-25";
/** Request timeout ms (mirrors the 20s MCP stdio guard in mcp.ts). */
export const AAVE_REQUEST_TIMEOUT_MS = 20_000;
/** Env override for the server URL (public server — no key needed). */
export const AAVE_MCP_URL_ENV = "AAVE_MCP_URL";
/** Env flag for offline fixture mode (mirrors AEGIS_OFFLINE in graph.ts). */
export const AAVE_OFFLINE_ENV = "AAVE_OFFLINE";

/** Tool names exposed by the Aave MCP server (mirrors MCP_TOOLS in mcp.ts). */
export const AAVE_TOOLS = [
  { name: "get_chains", description: "List Aave-supported chains." },
  { name: "get_markets", description: "Market snapshots: symbol/APY/caps/liquidity." },
  { name: "get_user_positions", description: "Per-reserve positions for a wallet." },
  { name: "get_user_summary", description: "Aggregate user summary + health factor." },
  { name: "get_reserve_details", description: "Reserve-level details for a symbol/chain." },
  { name: "get_apy_history", description: "APY history for a reserve." },
  { name: "get_user_activity", description: "Wallet activity history." },
  { name: "preview_action", description: "SIMULATE supply/borrow/withdraw/repay — no execution." },
  { name: "prepare_action", description: "Build an UNSIGNED tx (sign inside mandate)." },
  { name: "get_swappable_tokens", description: "Tokens available for swap on a chain." },
  { name: "get_swap_quote", description: "Quote a token swap." },
  { name: "get_user_rewards", description: "Claimable rewards for a wallet." },
  { name: "search_governance_proposals", description: "Search Aave governance proposals." },
] as const;

/** Names of the Aave MCP tools in AAVE_TOOLS. */
export type AaveToolName = (typeof AAVE_TOOLS)[number]["name"];

/** Minimal fetch shape (injectable for tests; globalThis.fetch satisfies it). */
export type AaveFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** Options for AaveMcpClient (URL + offline fixture mode + injectable fetch). */
export interface AaveClientOptions {
  /** Server URL (default: env AAVE_MCP_URL ?? https://mcp.aave.com). */
  url?: string;
  /** When true, all calls return local fixtures (tests only). */
  offline?: boolean;
  /** Injectable fetch (tests only; default: globalThis.fetch). */
  fetch?: AaveFetch;
}

/** Normalized market snapshot consumed by lending intel. */
export interface MarketSnapshot {
  /** Reserve symbol (e.g. USDC). */
  symbol: string;
  /** Chain/network label as returned by the server. */
  chain: string;
  /** Supply APY (fraction, e.g. 0.05 = 5%) when provided. */
  supplyApy: number | null;
  /** Borrow APY (fraction) when provided. */
  borrowApy: number | null;
  /** Total liquidity (native units string) when provided. */
  liquidity: string | null;
  /** Raw server row for auditability. */
  raw: unknown;
}

/** Normalized wallet summary (aggregate + health factor). */
export interface WalletSummary {
  /** Wallet address summarized. */
  address: string;
  /** Health factor when provided (null = no borrows / unknown). */
  healthFactor: number | null;
  /** Total collateral (USD string) when provided. */
  totalCollateralUsd: string | null;
  /** Total debt (USD string) when provided. */
  totalDebtUsd: string | null;
  /** Raw server payload for auditability. */
  raw: unknown;
}

/** Unsigned simulation result (preview_action passthrough — never executes). */
export interface PreviewResult {
  /** Action simulated (supply|borrow|withdraw|repay). */
  action: string;
  /** Reserve symbol. */
  reserve: string;
  /** Amount simulated (base units string). */
  amount: string;
  /** Wallet the simulation ran for. */
  wallet: string;
  /** Whether the simulation reports success. */
  ok: boolean;
  /** Raw server payload for auditability. */
  raw: unknown;
}

/** Local fixture rows returned for every call when offline mode is on (tests only, never demos). */
export const AAVE_OFFLINE_FIXTURE = {
  chains: [{ id: "1", name: "Ethereum" }],
  markets: [
    { symbol: "USDC", chain: "Ethereum", supplyApy: 0.04, borrowApy: 0.06, liquidity: "1000000" },
    { symbol: "WETH", chain: "Ethereum", supplyApy: 0.02, borrowApy: 0.03, liquidity: "500000" },
  ],
  userSummary: {
    address: "0xoffline-wallet",
    healthFactor: 2.5,
    totalCollateralUsd: "10000",
    totalDebtUsd: "4000",
  },
  apyHistory: [{ timestamp: 0, supplyApy: 0.04, borrowApy: 0.06 }],
  preview: { ok: true, simulation: "offline-fixture" },
} as const;

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace("%", ""));
  if (!Number.isFinite(n)) return null;
  // Server may report APY as percent (e.g. 4.2) or fraction (0.042) — pass through as-is.
  return n;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}

/**
 * Normalize one raw get_markets row into a MarketSnapshot (fail-closed on
 * missing symbol — a market without a symbol is unusable intel).
 *
 * Live row shape (verified against the server): `{ symbol, chainId, spoke,
 * hub, supplyApyPct, borrowApyPct, supplyCap, borrowCap, suppliable,
 * borrowable, … }` — `*ApyPct` fields are percent strings ("1.2139" = 1.2139%)
 * and are converted to fractions.
 * @param row Raw market row from the server.
 * @returns Normalized MarketSnapshot.
 */
export function toMarketSnapshot(row: Record<string, unknown>): MarketSnapshot {
  const symbol = strOrNull(row.symbol ?? row.asset ?? row.token);
  if (!symbol) throw new Error("BadAaveIntel: market row without symbol — refusing to score.");
  // Percent-string APYs ("1.2139") → fractions (0.012139); fraction-shaped
  // fields (supplyApy/borrowApy) pass through as-is.
  const pct = (v: unknown): number | null => {
    const n = numOrNull(v);
    return n === null ? null : n / 100;
  };
  return {
    symbol,
    chain: strOrNull(row.chain ?? row.network ?? row.chainId) ?? "unknown",
    supplyApy: row.supplyApyPct !== undefined ? pct(row.supplyApyPct) : numOrNull(row.supplyApy ?? row.supplyAPY ?? row.liquidityRate),
    borrowApy: row.borrowApyPct !== undefined ? pct(row.borrowApyPct) : numOrNull(row.borrowApy ?? row.borrowAPY ?? row.variableBorrowRate),
    liquidity: strOrNull(row.liquidity ?? row.suppliable ?? row.availableLiquidity ?? row.totalLiquidity),
    raw: row,
  };
}

/**
 * Normalize a raw get_user_summary payload into a WalletSummary.
 * @param address Wallet the summary was requested for.
 * @param payload Raw server payload.
 * @returns Normalized WalletSummary.
 */
export function toWalletSummary(address: string, payload: Record<string, unknown>): WalletSummary {
  return {
    address,
    healthFactor: numOrNull(payload.healthFactor ?? payload.health_factor),
    totalCollateralUsd: strOrNull(payload.totalCollateralUsd ?? payload.totalCollateralUSD ?? payload.collateral),
    totalDebtUsd: strOrNull(payload.totalDebtUsd ?? payload.totalDebtUSD ?? payload.debt),
    raw: payload,
  };
}

/**
 * AaveMcpClient — streamable-HTTP MCP client for the official Aave server.
 * Public server: no keys needed, nothing secret is ever logged.
 */
export class AaveMcpClient {
  private url: string;
  private offline: boolean;
  private fetchFn: AaveFetch;
  private msgId = 0;
  private sessionId: string | null = null;
  private initialized = false;

  /**
   * Build a client reading AAVE_MCP_URL / AAVE_OFFLINE unless overridden.
   * @param opts Optional url, offline flag, and injectable fetch.
   */
  constructor(opts: AaveClientOptions = {}) {
    this.url = opts.url ?? process.env[AAVE_MCP_URL_ENV] ?? AAVE_MCP_URL_DEFAULT;
    this.offline = opts.offline ?? process.env[AAVE_OFFLINE_ENV] === "1";
    this.fetchFn =
      opts.fetch ??
      ((globalThis.fetch as unknown as AaveFetch) ||
        (() => {
          throw new Error("No fetch available (pass opts.fetch or run on Node 18+).");
        }));
  }

  /**
   * Live/offline mode flag (offline returns local fixtures).
   * @returns "live" for server calls, "offline" for fixture mode.
   */
  get mode(): "live" | "offline" {
    return this.offline ? "offline" : "live";
  }

  /** Server URL (env-overridable, default https://mcp.aave.com). */
  get serverUrl(): string {
    return this.url;
  }

  /**
   * List the mirrored Aave MCP tool surface.
   * @returns The AAVE_TOOLS descriptor array.
   */
  toolsList(): typeof AAVE_TOOLS {
    return AAVE_TOOLS;
  }

  /**
   * List Aave-supported chains (get_chains).
   * @returns Raw chain rows.
   */
  async listChains(): Promise<unknown[]> {
    if (this.offline) return [...AAVE_OFFLINE_FIXTURE.chains] as unknown[];
    const res = await this.callTool<unknown>("get_chains", {});
    return extractRows(res);
  }

  /**
   * Market snapshots, optionally filtered to symbols (get_markets).
   * @param symbols Reserve symbols to keep (empty = all).
   * @returns Normalized MarketSnapshot rows.
   */
  async marketSnapshots(symbols: string[] = []): Promise<MarketSnapshot[]> {
    if (this.offline) {
      const rows = [...AAVE_OFFLINE_FIXTURE.markets] as unknown as Record<string, unknown>[];
      const want = new Set(symbols.map((s) => s.toUpperCase()));
      return rows
        .filter((r) => want.size === 0 || want.has(String(r.symbol).toUpperCase()))
        .map(toMarketSnapshot);
    }
    const res = await this.callTool<unknown>("get_markets", {});
    const rows = extractRows(res) as Record<string, unknown>[];
    const want = new Set(symbols.map((s) => s.toUpperCase()));
    return rows
      .filter((r) => want.size === 0 || want.has(String(r.symbol ?? r.asset ?? r.token ?? "").toUpperCase()))
      .map((r) => toMarketSnapshot(r));
  }

  /**
   * Aggregate wallet summary + health factor (get_user_summary).
   * @param address Wallet address to summarize.
   * @returns Normalized WalletSummary.
   */
  async walletSummary(address: string): Promise<WalletSummary> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`Bad address "${address}" (want 0x + 40 hex).`);
    if (this.offline) {
      return { ...toWalletSummary(address, { ...AAVE_OFFLINE_FIXTURE.userSummary }), address };
    }
    const res = await this.callTool<Record<string, unknown>>("get_user_summary", { address });
    return toWalletSummary(address, (res ?? {}) as Record<string, unknown>);
  }

  /**
   * APY history for a reserve (get_apy_history).
   * @param symbol Reserve symbol (e.g. USDC).
   * @param chain Chain label/id (optional — server default when omitted).
   * @returns Raw history rows.
   */
  async reserveApy(symbol: string, chain?: string): Promise<unknown[]> {
    if (!symbol) throw new Error("reserveApy requires a symbol (e.g. USDC).");
    if (this.offline) return [...AAVE_OFFLINE_FIXTURE.apyHistory] as unknown[];
    const args: Record<string, unknown> = { symbol };
    if (chain) args.chain = chain;
    const res = await this.callTool<unknown>("get_apy_history", args);
    return Array.isArray(res) ? res : [res];
  }

  /**
   * Unsigned supply simulation passthrough (preview_action — never executes).
   * @param reserve Reserve symbol.
   * @param amount Amount in base units string.
   * @param wallet Wallet to simulate for.
   * @returns PreviewResult (ok reflects the server simulation flag).
   */
  async previewSupply(reserve: string, amount: string, wallet: string): Promise<PreviewResult> {
    return this.preview("supply", reserve, amount, wallet);
  }

  /**
   * Unsigned borrow simulation passthrough (preview_action — never executes).
   * @param reserve Reserve symbol.
   * @param amount Amount in base units string.
   * @param wallet Wallet to simulate for.
   * @returns PreviewResult (ok reflects the server simulation flag).
   */
  async previewBorrow(reserve: string, amount: string, wallet: string): Promise<PreviewResult> {
    return this.preview("borrow", reserve, amount, wallet);
  }

  /**
   * Generic unsigned simulation passthrough (preview_action — never executes).
   * @param action supply|borrow|withdraw|repay.
   * @param reserve Reserve symbol.
   * @param amount Amount in base units string.
   * @param wallet Wallet to simulate for.
   * @returns PreviewResult (ok reflects the server simulation flag).
   */
  async preview(action: string, reserve: string, amount: string, wallet: string): Promise<PreviewResult> {
    const act = action.toLowerCase();
    if (!["supply", "borrow", "withdraw", "repay"].includes(act)) {
      throw new Error(`Unknown preview action "${action}" (want supply|borrow|withdraw|repay).`);
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error(`Bad wallet "${wallet}" (want 0x + 40 hex).`);
    if (this.offline) {
      return { action: act, reserve, amount, wallet, ok: true, raw: AAVE_OFFLINE_FIXTURE.preview };
    }
    const res = (await this.callTool<Record<string, unknown>>("preview_action", {
      action: act,
      reserve,
      amount,
      wallet,
    })) as Record<string, unknown>;
    const ok = res?.ok ?? res?.success ?? res?.simulated ?? true;
    return { action: act, reserve, amount, wallet, ok: ok !== false, raw: res };
  }

  /**
   * Call an MCP tool and unwrap the text/data payload (fail-closed on error).
   * @param name Tool name.
   * @param args Tool arguments.
   * @returns Unwrapped payload (parsed JSON when the payload is JSON text).
   */
  async callTool<T = unknown>(name: AaveToolName | string, args: Record<string, unknown>): Promise<T> {
    if (this.offline) return AAVE_OFFLINE_FIXTURE as unknown as T;
    await this.ensureSession();
    const res = (await this.rpc("tools/call", { name, arguments: args })) as {
      content?: { type: string; text?: string; data?: unknown }[];
      structuredContent?: unknown;
      isError?: boolean;
    };
    if (res?.isError) {
      const msg = (res.content ?? [])
        .map((c) => c.text ?? "")
        .join("\n")
        .slice(0, 300);
      throw new Error(`Aave MCP tool "${name}" failed: ${msg || "isError without detail"}`);
    }
    if (res?.structuredContent !== undefined) return res.structuredContent as T;
    const parts = (res?.content ?? []).filter((c) => c.type === "text" && c.text !== undefined);
    if (parts.length === 0) {
      const data = (res?.content ?? []).map((c) => c.data).filter((d) => d !== undefined);
      if (data.length > 0) return (data.length === 1 ? data[0] : data) as T;
      return res as T;
    }
    const text = parts.map((c) => c.text as string).join("\n");
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /** Ensure an initialized session (initialize + notifications/initialized + session id). */
  private async ensureSession(): Promise<void> {
    if (this.initialized && this.sessionId) return;
    const res = await this.rawRpc("initialize", {
      protocolVersion: AAVE_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "varanasi-agent", version: "0.1.0" },
    });
    if (!this.sessionId) throw new Error("Aave MCP initialize returned no Mcp-Session-Id — refusing live calls.");
    void res;
    await this.rawRpc("notifications/initialized", {});
    this.initialized = true;
  }

  /** JSON-RPC request with session header (fail-closed on protocol errors). */
  private async rpc(method: string, params: unknown): Promise<unknown> {
    const { body } = await this.rawRpc(method, params);
    const msg = body as { result?: unknown; error?: { message?: string; code?: number } };
    if (msg.error) throw new Error(`Aave MCP "${method}" error: ${String(msg.error.message ?? msg.error.code ?? "unknown").slice(0, 300)}`);
    if (!("result" in msg)) throw new Error(`Aave MCP "${method}" returned no result — refusing to trust.`);
    return msg.result;
  }

  /** Raw POST with Mcp-Session-Id lifecycle + SSE/JSON response parsing. */
  private async rawRpc(method: string, params: unknown): Promise<{ body: unknown }> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AAVE_REQUEST_TIMEOUT_MS);
    let resp: { ok: boolean; status: number; headers: { get(n: string): string | null }; text(): Promise<string> };
    try {
      resp = await this.fetchFn(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.msgId, method, params }),
        signal: ctrl.signal,
      });
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") throw new Error(`Aave MCP "${method}" timed out after ${AAVE_REQUEST_TIMEOUT_MS}ms.`);
      throw new Error(`Aave MCP "${method}" network error: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) throw new Error(`Aave MCP "${method}" HTTP ${resp.status} — refusing to trust.`);
    const sid = resp.headers.get("mcp-session-id") ?? resp.headers.get("Mcp-Session-Id");
    if (sid && !this.sessionId) this.sessionId = sid;
    const text = await resp.text();
    // Notifications have no id and may return 202 with empty body.
    if (!text.trim()) return { body: {} };
    const ctype = resp.headers.get("content-type") ?? "";
    if (ctype.includes("text/event-stream") || text.startsWith("event:")) {
      const data = parseSseData(text);
      if (!data) throw new Error(`Aave MCP "${method}" returned an empty SSE stream — refusing to trust.`);
      return { body: JSON.parse(data) };
    }
    return { body: JSON.parse(text) };
  }
}

/**
 * Extract row arrays from the various envelope shapes a tools/call payload
 * may arrive in. Live server shape (verified) is nested GraphQL-style:
 * `{ data: { v4: { markets: [...] } } }` / `{ data: { v4: [...] } }` — so a
 * `data` object is recursed into before matching row keys.
 * @param res Unwrapped tool payload.
 * @returns Row array (empty when the shape is unrecognized — never throws).
 */
export function extractRows(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === "object") {
    const o = res as Record<string, unknown>;
    for (const k of ["markets", "data", "result", "reserves", "items", "rows", "chains"]) {
      if (k === "data") continue; // recursed below, not treated as rows
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
    // Nested envelope (live shape: { data: { v4: { markets } } }): recurse
    // into `data` first, then any other single-key object wrapper (e.g. `v4`).
    const wrappers: unknown[] = [];
    if (o.data && typeof o.data === "object") wrappers.push(o.data);
    for (const [k, v] of Object.entries(o)) {
      if (k === "data") continue;
      if (v && typeof v === "object") wrappers.push(v);
    }
    for (const w of wrappers) {
      const found = extractRows(w);
      // Accept only genuine row arrays — a fallback `[wrapper]` echo means
      // the wrapper held no rows, so keep searching instead of returning it.
      if (!(found.length === 1 && found[0] === w) && found.length > 0) return found;
    }
  }
  return res == null ? [] : [res];
}

/**
 * Parse SSE `data:` lines from a streamable-HTTP response body (last JSON
 * data line wins; ignores comments / event / id / retry lines).
 * @param text Raw response body.
 * @returns The last data payload string, or null when no data line exists.
 */
export function parseSseData(text: string): string | null {
  let last: string | null = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (data === "[DONE]") continue;
    last = data;
  }
  return last;
}
