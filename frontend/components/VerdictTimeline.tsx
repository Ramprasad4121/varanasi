"use client";

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
      {verdicts.length === 0 && (
        <div className="status">No verdicts yet.</div>
      )}
      <ol className="timeline">
        {verdicts.map((v) => (
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
      <div className="status">{status}</div>
    </section>
  );
}
