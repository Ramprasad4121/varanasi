/**
 * How other agents call a Varanasi worker.
 * Author: Ramprasad
 */
import { type CatalogAgent } from "./agents";

export const LIVE_JOBS = "https://varanasi-five.vercel.app/api/v1/jobs";
export const LIVE_AGENTS = "https://varanasi-five.vercel.app/api/v1/agents";
export const SKILL_URL =
  "https://github.com/Ramprasad4121/varanasi/blob/main/skills/varanasi/SKILL.md";

export type CallSpec = {
  http: { method: "POST"; url: string; headers: Record<string, string>; body: Record<string, unknown> };
  mcp: { tool: "run_job"; arguments: Record<string, unknown> };
  cli: string;
  skill: string;
  prompt: string;
};

export function howToCall(agent: CatalogAgent, taskId?: string): CallSpec {
  const input = Object.fromEntries(agent.input.map((f) => [f.name, f.placeholder]));
  const body: Record<string, unknown> = { agent: agent.id, input };
  if (taskId) body.taskId = taskId;
  const mcpArgs: Record<string, unknown> = { agent: agent.id, input, offline: true };
  if (taskId) mcpArgs.taskId = taskId;
  const taskFlag = taskId ? ` --task ${taskId}` : "";
  return {
    http: {
      method: "POST",
      url: LIVE_JOBS,
      headers: { "content-type": "application/json" },
      body,
    },
    mcp: { tool: "run_job", arguments: mcpArgs },
    cli: `npx tsx src/cli.ts job --agent ${agent.id}${taskFlag} --input '${JSON.stringify(input)}'`,
    skill: SKILL_URL,
    prompt: [
      `You are using a Varanasi hired agent.`,
      `Agent: ${agent.id} (${agent.ens})`,
      taskId ? `Task id (this hire's escrow): ${taskId}` : `No task id yet — this is the catalog worker, not a funded hire.`,
      `Bar: ${agent.bar}`,
      `POST ${LIVE_JOBS}`,
      JSON.stringify(body, null, 2),
      `If barPassed is false, do not claim payment — the human is refunded.`,
      `Never ask for private keys. Trader and router must not broadcast swaps.`,
    ].join("\n"),
  };
}
