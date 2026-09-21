/**
 * GET /api/v1/agents/:id — catalog card + how other agents call it.
 * Author: Ramprasad
 */
import { agentById } from "@/lib/agents";
import { howToCall } from "@/lib/call";
import { json, preflight } from "@/lib/api-cors";

export function OPTIONS() {
  return preflight();
}

export function GET(req: Request, { params }: { params: { id: string } }) {
  const agent = agentById(params.id);
  if (!agent) return json({ ok: false, error: `unknown agent ${params.id}` }, 404);
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId") || undefined;
  return json({ ok: true, agent, call: howToCall(agent, taskId) });
}
