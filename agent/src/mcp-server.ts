#!/usr/bin/env node
/**
 * @author Ramprasad — stdio MCP server for Claude Code, Codex, Cursor, Hermes, OpenClaw.
 * Speaks JSON-RPC 2.0 with Content-Length framing (MCP spec). Also accepts NDJSON
 * so `echo '{...}' | npx tsx src/mcp-server.ts` works in a shell.
 */
import { AGENT_IDS, AGENTS, agentById } from "./catalog.js";
import { runRoster } from "./workers/roster.js";

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };

const TOOLS = [
  {
    name: "list_agents",
    description: "List the 15 live Varanasi agents (id, ens, role, bar, inputs).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_agent",
    description: "Get one Varanasi agent by id or ENS (e.g. scout, scout.aegis.eth).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Agent id or ENS name" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "run_job",
    description:
      "Run a Varanasi agent and return a proof envelope. Pass taskId to bind the job to a funded hire. barPassed false means refund.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Agent id" },
        taskId: { type: "string", description: "Funded TaskEscrow task id (bytes32)" },
        input: { type: "object", additionalProperties: { type: "string" }, description: "Job inputs" },
        offline: { type: "boolean", description: "Fixture mode (default true)" },
      },
      required: ["agent"],
      additionalProperties: false,
    },
  },
];

function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function err(id: unknown, message: string, code = -32000) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function toolText(id: unknown, text: string, isError = false) {
  return ok(id, { content: [{ type: "text", text }], isError });
}

export async function handle(msg: Rpc): Promise<unknown> {
  const id = msg.id;
  const method = String(msg.method ?? "");
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "varanasi", version: "0.2.0" },
    });
  }
  if (method === "notifications/initialized" || method === "initialized") return null;
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "resources/list") return ok(id, { resources: [] });
  if (method === "prompts/list") return ok(id, { prompts: [] });
  if (method === "tools/call") {
    const name = String(msg.params?.name ?? "");
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    if (name === "list_agents") {
      return toolText(id, JSON.stringify({ count: AGENTS.length, ids: AGENT_IDS, agents: AGENTS }));
    }
    if (name === "get_agent") {
      const agent = agentById(String(args.id ?? ""));
      if (!agent) return err(id, `unknown agent ${String(args.id)}`);
      return toolText(id, JSON.stringify(agent));
    }
    if (name === "run_job") {
      try {
        const proof = await runRoster(
          String(args.agent ?? ""),
          (args.input as Record<string, string>) ?? {},
          {
            offline: args.offline !== false,
            mandateId: String(args.taskId ?? args.mandateId ?? "").trim() || undefined,
          },
        );
        return toolText(id, JSON.stringify(proof), proof.ok === false || (proof.ok && !proof.barPassed));
      } catch (e) {
        return toolText(id, JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), true);
      }
    }
    return err(id, `unknown tool ${name}`);
  }
  if (!method) return err(id, "method required", -32600);
  return err(id, `unknown method ${method}`, -32601);
}

export function encodeFrame(msg: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(msg), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function write(msg: unknown, framing: "len" | "nl") {
  if (framing === "nl") {
    process.stdout.write(`${JSON.stringify(msg)}\n`);
    return;
  }
  process.stdout.write(encodeFrame(msg));
}

async function pumpLen() {
  let buf = Buffer.alloc(0);
  let framing: "len" | "nl" | null = null;
  for await (const chunk of process.stdin) {
    buf = Buffer.concat([buf, chunk as Buffer]);
    while (buf.length) {
      if (framing === null) {
        const peek = buf.toString("utf8", 0, Math.min(buf.length, 32));
        framing = /content-length:/i.test(peek) ? "len" : "nl";
      }
      if (framing === "nl") {
        const nl = buf.indexOf("\n");
        if (nl === -1) break;
        const line = buf.slice(0, nl).toString("utf8").trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const res = await handle(JSON.parse(line) as Rpc);
          if (res) write(res, "nl");
        } catch {
          /* ignore malformed */
        }
        continue;
      }
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buf = buf.slice(headerEnd + 4);
        continue;
      }
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (buf.length < start + len) break;
      const body = buf.slice(start, start + len).toString("utf8");
      buf = buf.slice(start + len);
      try {
        const res = await handle(JSON.parse(body) as Rpc);
        if (res) write(res, "len");
      } catch {
        /* ignore malformed */
      }
    }
  }
}

const isMain = /mcp-server\.(ts|js)$/.test(process.argv[1] ?? "");
if (isMain) {
  pumpLen().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
