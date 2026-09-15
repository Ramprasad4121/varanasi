import { getJob } from "@/lib/roster";
import { json, preflight } from "@/lib/api-cors";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const job = getJob(params.id);
  if (!job) return json({ ok: false, error: "job not found" }, 404);
  return json({ ok: true, job });
}
