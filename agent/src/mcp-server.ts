#!/usr/bin/env node
import { AGENT_IDS, AGENTS, agentById } from "./catalog.js";
import { runRoster } from "./workers/roster.js";

type Rpc = { jsonrpc: "2.0"; id: unknown; method: string; params?: Record<string, unknown> };

const TOOLS = [
  { name: "list_agents", description: "List the 15 live Varanasi agents.", inputSchema: { type: "object", properties: {} } },
  { name: "get_agent", description: "Get one Varanasi agent by id.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "run_job", description: "Run a Varanasi agent job and return a proof envelope.", inputSchema: { type: "object", properties: { agent: { type: "string" }, input: { type: "object" }, offline: { type: "boolean" } }, required: ["agent"] } },
];

function ok(id: unknown, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function err(id: unknown, message: string) { return { jsonrpc: "2.0", id, error: { code: -32000, message } }; }

async function handle(msg: Rpc): Promise<unknown> {
  if (msg.method === "initialize") {
    return ok(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "varanasi", version: "0.2.0" } });
  }
  if (msg.method === "notifications/initialized") return null;
  if (msg.method === "tools/list") return ok(msg.id, { tools: TOOLS });
  if (msg.method === "tools/call") {
    const name = String(msg.params?.name ?? "");
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    if (name === "list_agents") return ok(msg.id, { content: [{ type: "text", text: JSON.stringify({ count: AGENTS.length, agents: AGENTS }) }] });
    if (name === "get_agent") {
      const agent = agentById(String(args.id ?? ""));
      if (!agent) return err(msg.id, `unknown agent ${String(args.id)}`);
      return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(agent) }] });
    }
    if (name === "run_job") {
      const proof = await runRoster(String(args.agent ?? ""), (args.input as Record<string, string>) ?? {}, { offline: args.offline !== false });
      return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(proof) }] });
    }
    return err(msg.id, `unknown tool ${name}`);
  }
  return err(msg.id, `unknown method ${msg.method}`);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const res = await handle(JSON.parse(line) as Rpc);
      if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
    } catch { /* ignore malformed */ }
  }
});
