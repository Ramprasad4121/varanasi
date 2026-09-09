"use client";

// Author: Ramprasad — /human route: Verify with World ID → tier + limits mirror of agent/src/human.ts; live dep NEXT_PUBLIC_WORLD_* env. Sandbox issues a clearly-labelled test credential; production is honest about the backend verifier not being wired yet.
import { useState } from "react";

// ---------------------------------------------------------------------------
// /human — World Selfie Check route for varanasi.
// Verifies the human behind the wallet, then shows their abuse-prevention
// tier + limits. Mirrors the policy in `agent/src/human.ts` (duplicated
// deliberately: browser code can't import the agent package).
// Full flow + sandbox setup: see repo-root WORLD.md.
// ---------------------------------------------------------------------------

const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "";
const SANDBOX = (process.env.NEXT_PUBLIC_WORLD_SANDBOX ?? "").toLowerCase() === "1" ||
  (process.env.NEXT_PUBLIC_WORLD_SANDBOX ?? "").toLowerCase() === "true";

type Tier = "verified" | "guest";

const POLICY: Record<Tier, { maxAgents: number; maxAllowanceBps: number; label: string }> = {
  verified: { maxAgents: 10, maxAllowanceBps: 5000, label: "Verified human" },
  guest: { maxAgents: 1, maxAllowanceBps: 500, label: "Guest (unverified)" },
};

const LS_NULLIFIER = "aegis.humanNullifier";

function bpsToPct(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

export default function HumanPage() {
  const [tier, setTier] = useState<Tier | null>(null);
  const [nullifier, setNullifier] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  if (!APP_ID) return <SetupNotice />;

  function applyVerified(n: string, via: string) {
    setNullifier(n);
    setTier("verified");
    try {
      localStorage.setItem(LS_NULLIFIER, n);
    } catch {
      /* private-mode: ignore */
    }
    setStatus(`Verified via ${via}.`);
  }

  function continueAsGuest() {
    setNullifier(null);
    setTier("guest");
    setStatus("Continuing as guest — capped tier (1 agent, 5% allowance).");
  }

  // One honest entry point. Sandbox issues a clearly-labelled test
  // credential (no network); production opens the real World App flow once
  // the backend verifier is live — until then it says so instead of faking it.
  function verify() {
    if (!SANDBOX) {
      setBusy(true);
      setStatus(
        "World App verification isn't wired to a backend verifier yet — " +
          "continue as guest, or run the sandbox build to try the test credential."
      );
      setBusy(false);
      return;
    }
    setBusy(true);
    const n = `sandbox-${Math.random().toString(16).slice(2, 10)}`;
    applyVerified(n, "sandbox test credential (not a real verification)");
    setBusy(false);
  }

  const policy = tier ? POLICY[tier] : null;

  return (
    <section className="panel">
      <h2>Verify humanity</h2>
      <p className="desc">
        One verified human → up to {POLICY.verified.maxAgents} agents at{" "}
        {bpsToPct(POLICY.verified.maxAllowanceBps)} allowance. Guests stay capped at{" "}
        {POLICY.guest.maxAgents} agent / {bpsToPct(POLICY.guest.maxAllowanceBps)}.{" "}
        {SANDBOX && <span className="badge warn">sandbox — test credential only</span>}
      </p>

      {tier === null && (
        <div className="row">
          <button onClick={verify} disabled={busy}>
            {busy ? "Checking…" : "Verify with World ID"}
          </button>
          <button onClick={continueAsGuest}>Continue as guest</button>
        </div>
      )}

      {tier !== null && policy && (
        <div className="card">
          <div>
            <span className={`badge ${tier === "verified" ? "ok" : "warn"}`}>
              {POLICY[tier].label}
            </span>{" "}
            {SANDBOX && tier === "verified" && <span className="badge warn">test credential</span>}
          </div>
          <div style={{ marginTop: 8 }}>
            max agents <code>{policy.maxAgents}</code> · max allowance{" "}
            <code>{bpsToPct(policy.maxAllowanceBps)}</code>
          </div>
          {nullifier && (
            <div className="muted">
              human nullifier <code>{nullifier}</code>
            </div>
          )}
          {tier === "guest" && (
            <div className="status">
              Guest mode is clearly capped: mint at most {policy.maxAgents} agent with ≤{" "}
              {bpsToPct(policy.maxAllowanceBps)} allowance. Verify humanity to unlock higher limits.
            </div>
          )}
          <div className="row">
            <button
              onClick={() => {
                setTier(null);
                setNullifier(null);
                setStatus("");
              }}
            >
              Reset
            </button>
            <a href="/" style={{ alignSelf: "center" }}>
              ← Back to the varanasi dashboard
            </a>
            <a href="/#hire-wizard" style={{ alignSelf: "center" }}>
              Hire an agent →
            </a>
          </div>
        </div>
      )}

      <div className="status">{status}</div>
    </section>
  );
}

function SetupNotice() {
  return (
    <section className="panel">
      <h2>Verify humanity — setup required</h2>
      <p className="desc">
        This route needs a World Sandbox App ID. It renders setup instructions and never touches
        the World SDK until one is set, so the rest of the app is unaffected.
      </p>
      <ol>
        <li>
          Create a Sandbox App in the World Developer Portal (see <code>WORLD.md</code> §Sandbox
          setup) and request the Selfie Check (Beta) feature flag.
        </li>
        <li>
          Copy <code>frontend/.env.example</code> → <code>.env.local</code> and set{" "}
          <code>NEXT_PUBLIC_WORLD_APP_ID</code>, <code>NEXT_PUBLIC_WORLD_ACTION</code> (e.g.{" "}
          <code>aegis-human</code>), and <code>NEXT_PUBLIC_WORLD_SANDBOX=1</code>, then restart{" "}
          <code>npm run dev</code>.
        </li>
        <li>
          Until then, humans stay on the <strong>guest tier</strong>: {POLICY.guest.maxAgents}{" "}
          agent, {bpsToPct(POLICY.guest.maxAllowanceBps)} max allowance.
        </li>
      </ol>
      <p className="envline">
        <a href="/">← Back to the varanasi dashboard</a>
      </p>
    </section>
  );
}
