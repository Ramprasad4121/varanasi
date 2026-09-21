"use client";
// Author: Ramprasad — copy-paste cards so Codex / Claude / Grok / OpenClaw / Hermes can run a hire.
import { useState } from "react";
import { type CatalogAgent } from "@/lib/agents";
import { howToCall } from "@/lib/call";

export function CallHire({
  agent,
  taskId,
}: {
  agent: CatalogAgent;
  taskId?: string;
}) {
  const spec = howToCall(agent, taskId);
  const curl = `curl -s -X POST ${spec.http.url} \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(spec.http.body)}'`;
  return (
    <div id="call-hire" className="mt-6 rounded-xl border border-border bg-bg-elevated p-6">
      <p className="font-label text-[11px] uppercase tracking-[0.18em] text-fg-muted">Use this hire</p>
      <h3 className="mt-2 font-display text-2xl font-medium text-ink">
        Call {agent.name} from another agent
      </h3>
      <p className="mt-2 font-sans text-[15px] leading-relaxed text-fg-body">
        {taskId
          ? "This task id is the funded mandate. Codex, Claude Code, Grok, OpenClaw, and Hermes post a job against it. They never hold your keys."
          : "Catalog call — no escrow yet. After you fund, the task id binds the job to this hire."}
      </p>
      <CopyBlock label="Prompt (any agent)" value={spec.prompt} />
      <CopyBlock label="HTTP" value={curl} />
      <CopyBlock label="MCP run_job" value={JSON.stringify(spec.mcp, null, 2)} />
      <CopyBlock label="CLI" value={spec.cli} />
      <p className="mt-4 font-sans text-[13px] leading-relaxed text-fg-muted">
        Skill:{" "}
        <a className="underline" href={spec.skill} target="_blank" rel="noreferrer">
          skills/varanasi/SKILL.md
        </a>
        . Tools: list_agents, get_agent, run_job.
      </p>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted">{label}</span>
        <button
          type="button"
          className="font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-bg p-3 font-label text-[12px] leading-relaxed text-ink">
        {value}
      </pre>
    </div>
  );
}
