/**
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

export interface McpConfig {
  /** Command launching the Subgraph MCP server (stdio). */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export const DEFAULT_SUBGRAPH_MCP: McpConfig = {
  command: "npx",
  args: ["-y", "@thegraph/subgraph-mcp"],
  env: { GRAPH_API_KEY: process.env.GRAPH_API_KEY ?? "" },
};

export const MCP_TOOLS = [
  {
    name: "search_subgraphs",
    description: "Discover live subgraphs by keyword (e.g. 'uniswap v3', 'erc4626 vaults').",
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
    this.proc = spawn(cmd, args, {
      env: { ...process.env, ...(this.config.env ?? {}) },
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

  toolsList(): typeof MCP_TOOLS {
    return MCP_TOOLS;
  }

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

  constructor(
    private graph = new GraphClient(),
    private mcpConfig: McpConfig = DEFAULT_SUBGRAPH_MCP,
  ) {}

  async searchSubgraphs(query: string, useMcp = true): Promise<unknown> {
    const mcp = await this.tryMcp(useMcp);
    if (mcp) return mcp.callTool("search_subgraphs", { query });
    // Fallback: curated standardized IDs act as the discovery result.
    const { KNOWN_SUBGRAPHS } = await import("./graph.js");
    return [{ id: KNOWN_SUBGRAPHS.uniswapV3, name: "uniswap-v3 (standardized DEX)" }, { id: KNOWN_SUBGRAPHS.erc4626, name: "erc4626-vaults (standardized)" }];
  }

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
