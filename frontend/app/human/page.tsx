"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// /human — World Selfie Check route for varanasi.
// Verifies the human behind the wallet, then shows their abuse-prevention
// tier + limits. Mirrors the policy in `agent/src/human.ts` (duplicated
// deliberately: browser code can't import the agent package).
// Full flow + sandbox setup: see repo-root WORLD.md.
// ---------------------------------------------------------------------------

const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID ?? "";
const ACTION = process.env.NEXT_PUBLIC_WORLD_ACTION ?? "aegis-human";
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
  const [proofText, setProofText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPaste, setShowPaste] = useState(false);

  if (!APP_ID) return <SetupNotice />;

  function applyVerified(n: string, via: string) {
    setNullifier(n);
    setTier("verified");
    try {
      localStorage.setItem(LS_NULLIFIER, n);
    } catch {
      /* private-mode: ignore */
    }
    setStatus(`Verified via ${via}. Nullifier recorded (sandbox: ${SANDBOX ? "yes — test only" : "no"}).`);
  }

  function continueAsGuest() {
    setNullifier(null);
    setTier("guest");
    setStatus("Continuing as guest — capped sandbox tier (1 agent, 5% allowance).");
  }

  // Sandbox/demo path: fabricates a sandbox-shaped selfie proof locally and
  // runs it through the same shape-check the agent uses (no network).
  // Only available when NEXT_PUBLIC_WORLD_SANDBOX=1.
  function simulateSandboxProof() {
    const demo = {
      nullifier_hash: `sandbox-${Math.random().toString(16).slice(2, 10)}`,
      credential_type: "selfie",
      action: ACTION,
    };
    if (demo.nullifier_hash) applyVerified(demo.nullifier_hash, "sandbox simulation");
  }

  // Production path step 1: the judge/user completes Selfie Check in World App
  // via the IDKit widget (see WORLD.md §Integration), then pastes the IDKit
  // result JSON here. The app forwards it to the backend verifier
  // (`agent/src/human.ts` verifySelfieProof) — never verified client-side.
  function submitPastedProof() {
    setBusy(true);
    try {
      const raw = JSON.parse(proofText || "{}") as Record<string, unknown>;
      const n = raw.nullifier_hash ?? raw.nullifier;
      const cred = raw.credential_type;
      if (typeof n !== "string" || n.length === 0) {
        setStatus("That JSON has no nullifier_hash — paste the full IDKit result object.");
        return;
      }
      if (SANDBOX) {
        if (cred !== "selfie" && cred !== "face" && cred !== undefined) {
          setStatus(`Sandbox: credential_type '${String(cred)}' is not a selfie proof.`);
          return;
        }
        applyVerified(n, "sandbox proof (shape-checked locally, test only)");
        return;
      }
      setStatus(
        "Proof received. Production verification must run server-side via " +
          "agent/src/human.ts verifySelfieProof → POST api/v4/verify/{rp_id}. " +
          "Wire this JSON to your backend, then record the returned nullifier."
      );
    } catch (err) {
      setStatus(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const policy = tier ? POLICY[tier] : null;

  return (
    <section className="panel">
      <h2>Verify humanity — World Selfie Check</h2>
      <p className="desc">
        One verified human → up to {POLICY.verified.maxAgents} agents at{" "}
        {bpsToPct(POLICY.verified.maxAllowanceBps)} allowance. Unverified guests stay capped at{" "}
        {POLICY.guest.maxAgents} agent / {bpsToPct(POLICY.guest.maxAllowanceBps)}.{" "}
        {SANDBOX && <span className="badge warn">sandbox mode — test proofs only</span>}
      </p>

      {tier === null && (
        <>
          <div className="row">
            <button onClick={() => setShowPaste((v) => !v)}>
              {showPaste ? "Hide proof input" : "Verify humanity"}
            </button>
            {SANDBOX && <button onClick={simulateSandboxProof}>Simulate sandbox proof</button>}
            <button onClick={continueAsGuest}>Continue as guest</button>
          </div>
          {showPaste && (
            <>
              <label>IDKit result JSON (from the World App Selfie Check flow)</label>
              <textarea
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                placeholder='{"nullifier_hash": "…", "credential_type": "selfie", …}'
              />
              <div className="row">
                <button onClick={submitPastedProof} disabled={busy}>
                  {busy ? "Checking…" : "Submit proof"}
                </button>
              </div>
              <p className="envline">
                Complete Selfie Check in World App first (QR / deep link from the IDKit widget —
                see WORLD.md §Integration), then paste the full result object here.
              </p>
            </>
          )}
        </>
      )}

      {tier !== null && policy && (
        <div className="card">
          <div>
            <span className={`badge ${tier === "verified" ? "ok" : "warn"}`}>
              {POLICY[tier].label}
            </span>{" "}
            {SANDBOX && tier === "verified" && <span className="badge warn">sandbox test credential</span>}
          </div>
          <div style={{ marginTop: 8 }}>
            max agents <code>{policy.maxAgents}</code> · max allowance{" "}
            <code>{bpsToPct(policy.maxAllowanceBps)}</code>
          </div>
          {nullifier && (
            <div>
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
          </div>
        </div>
      )}

      <div className="status">{status}</div>
      <p className="envline">
        Action: <code>{ACTION}</code> · sandbox: <code>{SANDBOX ? "on" : "off"}</code> · policy
        mirror of <code>agent/src/human.ts</code>
      </p>
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
