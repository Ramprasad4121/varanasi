/**
 * @author Ramprasad — Subgraph MCP wrapper with Gateway fallback (SubgraphAgent, McpClient; env: GRAPH_API_KEY).
 * mcp.ts — minimal MCP client wrapper for Subgraph MCP + Gateway fallback.
 *
 * Tool surface (mirrors the Subgraph MCP server exposed via The Graph):
 *   - search_subgraphs  { query: string }            → [{ id, name, schema }]
 *   - get_schema        { subgraphId: string }       → GraphQL schema SDL
 *   - run_query         { subgraphId, gql, variables } → live Gateway result
 *
 * Two transports:
 *  1. MCP stdio (preferred when a Subgraph MCP server runs locally, e.g.
 *     `npx @thegraph/subgraph-mcp` or the Claude Desktop MCP config below).
 *     Speaks JSON-RPC 2.0 `tools/call` over the child process stdio.
 *  2. Direct Gateway fallback via GraphClient (no MCP server needed).
 *
 * Any Claude/Cursor agent can reuse this: see agent/SKILL.md.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { GraphClient } from "./graph.js";

/** Config launching the Subgraph MCP server over stdio (command + args + env). */
export interface McpConfig {
  /** Command launching the Subgraph MCP server (stdio). */
  command?: string;
  /** Args for the MCP server command. */
  args?: string[];
  /** Env vars for the MCP server process (e.g. GRAPH_API_KEY). */
  env?: Record<string, string>;
}

/** MCP server package (unpinned `npx -y <pkg>` would float to latest — never do that). */
export const SUBGRAPH_MCP_PACKAGE = "@thegraph/subgraph-mcp" as const;
/**
 * Pinned MCP server version (reproducible spawn; bump deliberately with a
 * Gateway-fallback regression check). NOTE: this package name does not
 * currently resolve on the public npm registry — the Gateway fallback in
 * SubgraphAgent keeps `analyze` working regardless.
 */
export const SUBGRAPH_MCP_VERSION = "0.1.0" as const;

/**
 * Explicit env allowlist forwarded to the MCP child (minimal-env spawn:
 * PATH plus only what the server needs — never the full parent env, which
 * would leak Hedera/owner keys, LLM keys, and RPC URLs to the child).
 */
export const MCP_ENV_ALLOWLIST = ["PATH", "HOME", "GRAPH_API_KEY", "NO_COLOR"] as const;

/**
 * Build the minimal child env: PATH (+ os essentials) plus the explicit
 * allowlist — everything else from the parent is dropped.
 * @param extra Per-launch overrides (e.g. GRAPH_API_KEY).
 * @returns Minimal env record for spawn().
 */
export function buildMinimalMcpEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of MCP_ENV_ALLOWLIST) {
    const v = extra[k] ?? process.env[k];
    if (v !== undefined && v !== "") env[k] = v;
  }
  // npx without a PATH is a guaranteed ENOENT — fail loudly, not silently.
  if (!env.PATH) throw new Error("Refusing MCP spawn: PATH is unset (minimal-env guard).");
  return env;
}

/** Default MCP server launch (pinned npx package + minimal env with GRAPH_API_KEY). */
export const DEFAULT_SUBGRAPH_MCP: McpConfig = {
  command: "npx",
  args: ["-y", `${SUBGRAPH_MCP_PACKAGE}@${SUBGRAPH_MCP_VERSION}`],
  env: { GRAPH_API_KEY: process.env.GRAPH_API_KEY ?? "" },
};

/** Tool surface mirrored from the Subgraph MCP server (search_subgraphs/get_schema/run_query). */
export const MCP_TOOLS = [
  {
    name: "search_subgraphs",
    description: "Discover live subgraphs by keyword (e.g. 'uniswap v3', 'uniswap v2').",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "get_schema",
    description: "Fetch the GraphQL schema for a subgraph id (standardized vs bespoke check).",
    inputSchema: { type: "object", properties: { subgraphId: { type: "string" } }, required: ["subgraphId"] },
  },
  {
    name: "run_query",
    description: "Execute GraphQL against a live subgraph via The Graph Gateway.",
    inputSchema: {
      type: "object",
      properties: {
        subgraphId: { type: "string" },
        gql: { type: "string" },
        variables: { type: "object" },
      },
      required: ["subgraphId", "gql"],
    },
  },
] as const;

/** Names of the MCP tools in MCP_TOOLS. */
export type McpToolName = (typeof MCP_TOOLS)[number]["name"];

/** Thin JSON-RPC stdio client for an MCP server child process. */
export class McpClient {
  private proc: ChildProcess | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; buf: string }>();
  private stdoutBuf = "";

  constructor(private config: McpConfig = DEFAULT_SUBGRAPH_MCP) {}

  /** Spawn the MCP server. Throws if the binary is unavailable — caller falls back. */
  async connect(): Promise<void> {
    if (this.proc) return;
    const cmd = this.config.command ?? DEFAULT_SUBGRAPH_MCP.command!;
    const args = this.config.args ?? DEFAULT_SUBGRAPH_MCP.args!;
    // Minimal-env spawn: PATH + allowlist only — parent secrets never leak
    // to the child. Per-launch config.env overrides act as `extra`.
    this.proc = spawn(cmd, args, {
      env: buildMinimalMcpEnv(this.config.env ?? {}),
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.proc.stdout?.on("data", (d: Buffer) => this.onData(d.toString()));
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "aegis-agent", version: "0.1.0" },
    });
    this.notify("notifications/initialized");
  }

  /**
   * List the mirrored MCP tool surface.
   * @returns The MCP_TOOLS descriptor array.
   */
  toolsList(): typeof MCP_TOOLS {
    return MCP_TOOLS;
  }

  /**
   * Call an MCP tool and parse a text payload as JSON when possible.
   * @param name Tool name (search_subgraphs, get_schema, run_query).
   * @param args Tool arguments.
   * @returns Parsed JSON payload, or raw text when it is not JSON.
   */
  async callTool<T = unknown>(name: McpToolName, args: Record<string, unknown>): Promise<T> {
    const res = (await this.request("tools/call", { name, arguments: args })) as {
      content?: { type: string; text: string }[];
    };
    const text = (res.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /**
   * Kill the MCP server child process (safe to call when disconnected).
   * @returns void.
   */
  disconnect(): void {
    this.proc?.kill();
    this.proc = null;
  }

  private notify(method: string): void {
    this.proc?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  private request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin) return reject(new Error("MCP server not connected"));
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject, buf: "" });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timed out: ${method}`));
        }
      }, 20_000);
    });
  }

  private onData(chunk: string): void {
    this.stdoutBuf += chunk;
    let idx: number;
    while ((idx = this.stdoutBuf.indexOf("\n")) >= 0) {
      const line = this.stdoutBuf.slice(0, idx).trim();
      this.stdoutBuf = this.stdoutBuf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
        if (msg.id != null && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
      } catch {
        /* ignore non-JSONRPC stdout noise */
      }
    }
  }
}

/**
 * SubgraphAgent — MCP-first, Gateway fallback.
 * `useMcp: true` tries the local MCP server; any failure degrades to
 * direct Gateway so a missing MCP binary never breaks `analyze`.
 */
export class SubgraphAgent {
  private mcp: McpClient | null = null;

  /**
   * Build an agent over a GraphClient with an MCP fallback config.
   * @param graph GraphClient used for the direct-Gateway fallback.
   * @param mcpConfig MCP server launch config.
   */
  constructor(
    private graph = new GraphClient(),
    private mcpConfig: McpConfig = DEFAULT_SUBGRAPH_MCP,
  ) {}

  /**
   * Discover subgraphs by keyword (MCP search, else curated Uniswap ids).
   * @param query Keyword query, e.g. "uniswap v3".
   * @param useMcp False forces the curated-id fallback.
   * @returns MCP search result or the curated Uniswap id list.
   */
  async searchSubgraphs(query: string, useMcp = true): Promise<unknown> {
    const mcp = await this.tryMcp(useMcp);
    if (mcp) return mcp.callTool("search_subgraphs", { query });
    // Fallback: curated official Uniswap IDs act as the discovery result.
    const { KNOWN_SUBGRAPHS } = await import("./graph.js");
    return [
      { id: KNOWN_SUBGRAPHS.uniswapV3, name: "uniswap-v3 (official, Uniswap-native schema)" },
      { id: KNOWN_SUBGRAPHS.uniswapV2, name: "uniswap-v2 (official, Uniswap-native schema)" },
      { id: KNOWN_SUBGRAPHS.uniswapV4, name: "uniswap-v4 (official)" },
    ];
  }

  /**
   * Run GraphQL against a subgraph (MCP run_query, else direct Gateway).
   * @param subgraphId Target subgraph id.
   * @param gql GraphQL query string.
   * @param variables Query variables.
   * @param useMcp False forces direct Gateway.
   * @returns Live query result.
   */
  async runQuery(subgraphId: string, gql: string, variables: Record<string, unknown> = {}, useMcp = true): Promise<unknown> {
    const mcp = await this.tryMcp(useMcp);
    if (mcp) {
      try {
        return await mcp.callTool("run_query", { subgraphId, gql, variables });
      } catch {
        /* fall through to Gateway */
      }
    }
    return this.graph.query(subgraphId, gql, variables);
  }

  /**
   * Drop the cached MCP client (safe to call when disconnected).
   * @returns void.
   */
  disconnect(): void {
    this.mcp?.disconnect();
    this.mcp = null;
  }

  private async tryMcp(useMcp: boolean): Promise<McpClient | null> {
    if (!useMcp) return null;
    if (this.mcp) return this.mcp;
    const client = new McpClient(this.mcpConfig);
    try {
      await client.connect();
      this.mcp = client;
      return client;
    } catch {
      return null;
    }
  }
}
