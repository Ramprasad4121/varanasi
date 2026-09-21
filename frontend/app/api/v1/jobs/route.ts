/**
 * POST /api/v1/jobs — run a roster worker. Optional taskId attests the hire.
 * Author: Ramprasad
 */
import { createJob, listJobs } from "@/lib/roster";
import { json, preflight } from "@/lib/api-cors";
import { POST as attestPost } from "../attest/route";

export const dynamic = "force-dynamic";

const TASK_RE = /^0x[0-9a-fA-F]{64}$/;

export function OPTIONS() {
  return preflight();
}

export function GET() {
  return json({ ok: true, jobs: listJobs() });
}

export async function POST(req: Request) {
  let body: { agent?: unknown; agentId?: unknown; input?: unknown; taskId?: unknown } = {};
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
  let job;
  try {
    job = createJob(agent, input);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
  const taskId = String(body.taskId ?? "").trim();
  if (!taskId) return json({ ok: true, job }, 201);
  if (!TASK_RE.test(taskId)) {
    return json({ ok: true, job, attest: { ok: false, error: "taskId must be bytes32" } }, 201);
  }
  try {
    const attReq = new Request(new URL("/api/v1/attest", req.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taskId, agent, input }),
    });
    const attRes = await attestPost(attReq);
    const attest = (await attRes.json()) as unknown;
    return json({ ok: true, job, attest }, 201);
  } catch (err) {
    return json(
      {
        ok: true,
        job,
        attest: { ok: false, error: err instanceof Error ? err.message : String(err) },
      },
      201,
    );
  }
}
