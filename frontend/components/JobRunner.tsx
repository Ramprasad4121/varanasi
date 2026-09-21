"use client";

import { useEffect, useState } from "react";
import { BrandButton } from "@/components/BrandButton";
import { Badge } from "@/components/Badge";
import { type CatalogAgent } from "@/lib/agents";
import { type JobRecord } from "@/lib/roster";
import { rememberHire, useVaultUserId } from "@/lib/vault";

export function JobRunner({
  agent,
  taskId,
  onAttested,
}: {
  agent: CatalogAgent;
  taskId?: string;
  onAttested?: () => void;
}) {
  const userId = useVaultUserId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(agent.input.map((f) => [f.name, f.placeholder])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attest, setAttest] = useState("");
  const [job, setJob] = useState<JobRecord | null>(null);
  const funded = Boolean(taskId && /^0x[0-9a-fA-F]{64}$/.test(taskId));

  useEffect(() => {
    setValues(Object.fromEntries(agent.input.map((f) => [f.name, f.placeholder])));
    setJob(null);
    setError("");
    setAttest("");
    // Reset fields when the hired agent changes; `agent.input` is catalog-stable per id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  async function run() {
    const missing = agent.input.filter((f) => f.required && !String(values[f.name] ?? "").trim());
    if (missing.length) {
      setError(`Fill required fields: ${missing.map((f) => f.label).join(", ")}`);
      setJob(null);
      return;
    }
    setBusy(true);
    setError("");
    setAttest("");
    try {
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: agent.id,
          input: values,
          ...(funded && taskId ? { taskId } : {}),
        }),
      });
      if (res.status === 402) {
        setJob(null);
        setError(
          "Payment required ($0.01 x402). This page will not run the agent unpaid. Pay on the live rail, then retry.",
        );
        return;
      }
      const text = await res.text();
      let body: {
        ok?: boolean;
        job?: JobRecord;
        error?: string;
        attest?: {
          ok?: boolean;
          already?: boolean;
          error?: string;
          tx?: string | null;
          scoreBps?: number;
        };
      } = {};
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        throw new Error(res.ok ? "Job API returned non-JSON" : `HTTP ${res.status}`);
      }
      if (!res.ok || !body.job) throw new Error(body.error || `HTTP ${res.status}`);
      setJob(body.job);
      rememberHire(userId, {
        id: body.job.id,
        agent: agent.ens,
        cap: agent.cap,
        status: body.job.barPassed ? "proof-passed" : "proof-failed",
        at: new Date().toISOString(),
      });
      if (!funded || !taskId) return;
      const attBody = body.attest;
      if (attBody) {
        if (attBody.ok && attBody.already) {
          setAttest(`Onchain score ${attBody.scoreBps} bps already posted. Release below.`);
          onAttested?.();
        } else if (attBody.ok) {
          setAttest(
            `Onchain score ${attBody.scoreBps} bps posted${attBody.tx ? ` · ${String(attBody.tx).slice(0, 18)}…` : ""}. Release below.`,
          );
          onAttested?.();
        } else {
          setAttest(
            /validator|fail-closed|not configured/i.test(String(attBody.error ?? ""))
              ? "Onchain attest is fail-closed (validator key not set or not allowlisted). Track the task below — release waits for an allowlisted validator."
              : attBody.error || "Attest failed",
          );
        }
        return;
      }
      try {
        const att = await fetch("/api/v1/attest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, agent: agent.id, input: values }),
        });
        const attText = await att.text();
        let parsed: {
          ok?: boolean;
          already?: boolean;
          error?: string;
          tx?: string | null;
          scoreBps?: number;
        } = {};
        try {
          parsed = JSON.parse(attText) as typeof parsed;
        } catch {
          parsed = {};
        }
        if (att.status === 503) {
          setAttest(
            "Onchain attest is fail-closed (validator key not set or not allowlisted). Track the task below — release waits for an allowlisted validator.",
          );
        } else if (!att.ok || !parsed.ok) {
          setAttest(parsed.error || `Attest HTTP ${att.status}`);
        } else if (parsed.already) {
          setAttest(`Onchain score ${parsed.scoreBps} bps already posted. Release below.`);
          onAttested?.();
        } else {
          setAttest(
            `Onchain score ${parsed.scoreBps} bps posted${parsed.tx ? ` · ${String(parsed.tx).slice(0, 18)}…` : ""}. Release below.`,
          );
          onAttested?.();
        }
      } catch (attErr) {
        setAttest(attErr instanceof Error ? attErr.message : String(attErr));
      }
    } catch (err) {
      setJob(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="start-work" className="mt-8 scroll-mt-24 rounded-xl border border-border bg-bg-elevated p-6">
      <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Use the agent</p>
      <h3 className="mt-2 font-display text-2xl font-medium text-ink">Start work</h3>
      <p className="mt-2 font-sans text-[15px] leading-relaxed text-fg-body">
        Hiring already locked the mandate. This runs {agent.name} against the bar: {agent.bar}.
        After proof, the rail posts the validator score on Sepolia so you can release.
      </p>
      <div className="mt-5 grid gap-4">
        {agent.input.map((field) => (
          <label key={field.name} className="block">
            <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">
              {field.label}
              {field.required ? " *" : ""}
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
        <BrandButton onClick={run} disabled={busy}>
          {busy ? "Running…" : `Run ${agent.name}`}
        </BrandButton>
      </div>
      {error ? <p className="mt-3 font-sans text-[14px] text-fg-body">{error}</p> : null}
      {attest ? <p className="mt-3 font-sans text-[14px] text-fg-body">{attest}</p> : null}
      {job ? (
        <div className="mt-5 rounded-lg border border-border bg-bg p-4">
          <div className="flex items-center gap-2">
            <Badge tone={job.barPassed ? "ok" : "bad"}>{job.status}</Badge>
            <span className="font-label text-[12px] text-fg-muted">{job.settled}</span>
          </div>
          <p className="mt-3 break-all font-label text-[12px] text-fg-muted">
            {job.evidence.hash}
            {job.evidence.alg ? ` · ${job.evidence.alg}` : ""}
          </p>
          <pre className="mt-3 max-h-64 overflow-auto font-label text-[12px] leading-relaxed text-ink">
            {JSON.stringify(job.output, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
