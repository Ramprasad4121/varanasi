import { createJob, listJobs } from "@/lib/roster";
import { json, preflight } from "@/lib/api-cors";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export function GET() {
  return json({ ok: true, jobs: listJobs() });
}

export async function POST(req: Request) {
  let body: { agent?: unknown; agentId?: unknown; input?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "JSON body required" }, 400);
  }
  const agent = String(body.agent ?? body.agentId ?? "").trim();
  if (!agent) return json({ ok: false, error: "agent is required" }, 400);
  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? Object.fromEntries(
          Object.entries(body.input as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
        )
      : {};
  try {
    const job = createJob(agent, input);
    return json({ ok: true, job }, 201);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
}
