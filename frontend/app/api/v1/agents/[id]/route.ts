import { agentById } from "@/lib/agents";
import { json, preflight } from "@/lib/api-cors";

export function OPTIONS() {
  return preflight();
}

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const agent = agentById(params.id);
  if (!agent) return json({ ok: false, error: `unknown agent ${params.id}` }, 404);
  return json({ ok: true, agent });
}
