import { listAgents } from "@/lib/roster";
import { json, preflight } from "@/lib/api-cors";

export function OPTIONS() {
  return preflight();
}

export function GET() {
  const agents = listAgents();
  return json({ ok: true, count: agents.length, agents });
}
