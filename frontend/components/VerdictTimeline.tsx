"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import { seedVerdicts, type IntelRecord, type Verdict } from "./aegis";
import { useVaultUserId, loadScoped, saveScoped } from "@/lib/vault";

export function VerdictTimeline({
  verdicts: propVerdicts,
  intel: propIntel,
  onVerdicts: propOnVerdicts,
}: {
  verdicts?: Verdict[];
  intel?: IntelRecord | null;
  onVerdicts?: (v: Verdict[]) => void;
} = {}) {
  const userId = useVaultUserId();
  const [internalVerdicts, setInternalVerdicts] = useState<Verdict[]>(() => seedVerdicts());
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACT" | "SKIP">("ALL");

  const isControlled = propVerdicts !== undefined;
  const verdicts = isControlled ? propVerdicts : internalVerdicts;

  function handleSetVerdicts(next: Verdict[]) {
    if (propOnVerdicts) {
      propOnVerdicts(next);
    } else {
      setInternalVerdicts(next);
    }
  }

  function logFromIntel() {
    if (!propIntel) {
      setStatus("No intel yet — generate sample intel in Pool intel first.");
      return;
    }
    const decision = propIntel.riskScore < 50 ? "ACT" : "SKIP";
    const v: Verdict = {
      id: `local-${Date.now()}`,
      at: new Date().toISOString(),
      agent: "browser-session",
      pool: "curated pool (see Pool intel)",
      score: `${propIntel.riskScore} / 100`,
      decision,
      rationale: propIntel.rationale,
      source: "local",
    };
    handleSetVerdicts([v, ...verdicts]);
    setStatus(`Logged ${decision} verdict from current intel.`);
  }

  const shown = verdicts.filter((v) => filter === "ALL" || v.decision === filter);

  return (
    <div className="border border-border bg-bg-elevated p-6 w-full">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-medium tracking-[-0.03em] text-ink">Verdict timeline</h2>
        <Badge tone="neutral">ledger</Badge>
      </div>
      <p className="mt-2 font-display text-[16px] italic leading-relaxed text-fg-body">
        Every agent decision, newest first. Enforced by RiskGuard before funds can release.
      </p>

      {/* Filter pills */}
      <div className="mt-5 flex items-center gap-2">
        {(["ALL", "ACT", "SKIP"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`px-3 py-1 font-label text-xs uppercase tracking-[0.14em] border transition-colors ${
              filter === f
                ? "border-ink bg-ink text-bg font-medium"
                : "border-border bg-bg text-fg-body hover:border-ink"
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {propIntel && (
          <BrandButton onClick={logFromIntel} className="h-10 px-4">
            Log verdict from intel
          </BrandButton>
        )}
        {verdicts.length > 0 && (
          <BrandButton
            variant="quiet"
            onClick={() => {
              handleSetVerdicts([]);
              setStatus("Verdicts cleared.");
            }}
            className="h-10 px-4"
          >
            Clear all
          </BrandButton>
        )}
      </div>

      <ul className="mt-6 divide-y divide-border border border-border overflow-hidden">
        {shown.map((v) => {
          const isAct = v.decision === "ACT";
          return (
            <li key={v.id} className="p-4 bg-bg flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={isAct ? "ok" : "bad"}>{v.decision}</Badge>
                  <span className="font-label text-xs text-ink">{v.agent}</span>
                  <span className="font-label text-xs text-fg-muted">· {v.score}</span>
                </div>
                <p className="mt-2 font-display text-sm leading-relaxed text-fg-body">{v.rationale}</p>
              </div>
              <time className="font-label text-[11px] text-fg-muted whitespace-nowrap">
                {new Date(v.at).toLocaleDateString()}
              </time>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li className="p-6 text-center bg-bg font-display text-sm italic text-fg-muted">
            No verdicts found for filter {filter}.
          </li>
        )}
      </ul>

      {status && <p className="mt-4 font-label text-xs text-fg-muted">{status}</p>}
    </div>
  );
}

export default VerdictTimeline;
