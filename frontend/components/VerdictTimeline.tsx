"use client";

// Author: Ramprasad — VerdictTimeline list: local ACT/SKIP verdicts logged from Pool intel (ACT if riskScore < 50), newest-first with filter; no live deps (RiskGuard is the onchain gate, not called here); degrades to empty-state hints when no intel/verdicts.
import { useState } from "react";
import type { IntelRecord, Verdict } from "./aegis";

// ---------------------------------------------------------------------------
// Verdict timeline: mock-able local list of past agent decisions
// ---------------------------------------------------------------------------
export default function VerdictTimeline({
  verdicts,
  intel,
  onVerdicts,
}: {
  verdicts: Verdict[];
  intel: IntelRecord | null;
  onVerdicts: (v: Verdict[]) => void;
}) {
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACT" | "SKIP">("ALL");

  function logFromIntel() {
    if (!intel) {
      setStatus("No intel yet — load + display intel in Pool intel first.");
      return;
    }
    // Intel panel uses 0–100 scale; ACT below 50 (matches its sample logic).
    const decision = intel.riskScore < 50 ? "ACT" : "SKIP";
    const v: Verdict = {
      id: `local-${Date.now()}`,
      at: new Date().toISOString(),
      agent: "browser-session",
      pool: "curated pool (see Pool intel)",
      score: `${intel.riskScore} / 100`,
      decision,
      rationale: intel.rationale,
      source: "local",
    };
    onVerdicts([v, ...verdicts]);
    setStatus(`Logged ${decision} verdict from current intel.`);
  }

  const shown = verdicts.filter(
    (v) => filter === "ALL" || v.decision === filter
  );
  const groups = new Map<string, Verdict[]>();
  for (const v of shown) {
    const day = new Date(v.at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const list = groups.get(day);
    if (list) list.push(v);
    else groups.set(day, [v]);
  }

  return (
    <section className="panel">
      <h2>Verdict timeline</h2>
      <p className="desc">
        Every agent decision, newest first — demo-known pinned, yours appended
        locally. Nothing here executes onchain; RiskGuard is the onchain gate.
      </p>
      <div className="row">
        <button onClick={logFromIntel}>Log verdict from current intel</button>
        <button
          onClick={() => {
            onVerdicts([]);
            setStatus("Cleared local verdicts.");
          }}
        >
          Clear
        </button>
      </div>
      <div className="pool-tabs" role="tablist" aria-label="Filter verdicts">
        {(["ALL", "ACT", "SKIP"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? "tab active" : "tab"}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <div className="status">
          {verdicts.length === 0
            ? "No verdicts yet."
            : `No ${filter} verdicts yet.`}
        </div>
      )}
      {[...groups].map(([day, vs]) => (
        <div key={day}>
          <h3 className="date-header">{day}</h3>
          <ol className="timeline">
            {vs.map((v) => (
          <li key={v.id} className="card">
            <div>
              <span
                className={`badge ${v.decision === "ACT" ? "ok" : "bad"}`}
              >
                {v.decision}
              </span>{" "}
              <strong>{v.agent}</strong>{" "}
              {v.source === "demo-known" ? (
                <span className="badge warn">demo-known</span>
              ) : (
                <span className="badge">local</span>
              )}
            </div>
            <div className="muted">
              {new Date(v.at).toLocaleString()} · {v.pool} · score {v.score}
            </div>
            <div>{v.rationale}</div>
          </li>
            ))}
          </ol>
        </div>
      ))}
      <div className="status">{status}</div>
    </section>
  );
}
