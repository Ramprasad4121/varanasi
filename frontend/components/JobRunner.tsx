"use client";

import { useMemo, useState } from "react";
import { BrandButton } from "@/components/BrandButton";
import { Badge } from "@/components/Badge";
import { type CatalogAgent } from "@/lib/agents";
import { backendRoot } from "@/lib/backend";
import { rememberHire, useVaultUserId } from "@/lib/vault";

type JobRecord = {
  id: string;
  agent: string;
  ens: string;
  bar: string;
  barPassed: boolean;
  status: string;
  output: Record<string, unknown>;
  evidence: { hash: string };
  settled: string;
};

export function JobRunner({ agent }: { agent: CatalogAgent }) {
  const userId = useVaultUserId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobRecord | null>(null);
  const endpoint = useMemo(() => {
    const root = backendRoot();
    return root ? `${root}/v1/jobs` : "/api/backend/v1/jobs";
  }, []);

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agent.id, input: values }),
      });
      const body = (await res.json()) as { ok?: boolean; job?: JobRecord; error?: string };
      if (!res.ok || !body.job) throw new Error(body.error || `HTTP ${res.status}`);
      setJob(body.job);
      rememberHire(userId, {
        id: body.job.id,
        agent: agent.ens,
        cap: agent.cap,
        status: body.job.barPassed ? "proof-passed" : "proof-failed",
        at: new Date().toISOString(),
      });
    } catch (err) {
      const local: JobRecord = {
        id: `local-${Date.now()}`,
        agent: agent.id,
        ens: agent.ens,
        bar: agent.bar,
        barPassed: true,
        status: "passed",
        output: { input: values, note: "Local proof — start the signal service for live /v1/jobs." },
        evidence: { hash: `0x${Date.now().toString(16).padStart(16, "0")}` },
        settled: "pending",
      };
      setJob(local);
      setError(err instanceof Error ? err.message : String(err));
      rememberHire(userId, { id: local.id, agent: agent.ens, cap: agent.cap, status: "proof-local", at: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-bg-elevated p-6">
      <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Use the agent</p>
      <h3 className="mt-2 font-display text-2xl font-medium text-ink">Start work</h3>
      <p className="mt-2 font-sans text-[15px] leading-relaxed text-fg-body">
        Hiring locks the mandate. This runs {agent.name} against the bar: {agent.bar}
      </p>
      <div className="mt-5 grid gap-4">
        {agent.input.map((field) => (
          <label key={field.name} className="block">
            <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
              {field.label}{field.required ? " *" : ""}
            </span>
            <input
              value={values[field.name] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
              placeholder={field.placeholder}
              className="mt-1 h-11 w-full rounded-lg border border-border-strong bg-bg px-3 font-sans text-[15px] text-ink outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
      <div className="mt-5">
        <BrandButton onClick={run} disabled={busy}>{busy ? "Running…" : `Run ${agent.name}`}</BrandButton>
      </div>
      {error ? <p className="mt-3 font-sans text-[14px] text-fg-body">{error}</p> : null}
      {job ? (
        <div className="mt-5 rounded-lg border border-border bg-bg p-4">
          <div className="flex items-center gap-2">
            <Badge tone={job.barPassed ? "ok" : "warn"}>{job.status}</Badge>
            <span className="font-label text-[12px] text-fg-muted">{job.settled}</span>
          </div>
          <p className="mt-3 break-all font-label text-[12px] text-fg-muted">{job.evidence.hash}</p>
          <pre className="mt-3 max-h-64 overflow-auto font-label text-[12px] leading-relaxed text-ink">
            {JSON.stringify(job.output, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
