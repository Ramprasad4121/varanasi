// Author: Ramprasad — /mandate route: how a mandate works + field table.
// Static page (no client JS).
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "I",
    title: "Hire",
    body: "Pick an agent and set a spending cap, a work window, and an expiry. You sign one mandate. The agent never holds your keys.",
  },
  {
    n: "II",
    title: "Work",
    body: "The agent does the job inside those bounds. Replay is impossible. One click revokes the identity everywhere.",
  },
  {
    n: "III",
    title: "Settle",
    body: "Release pays the merchant when the work clears the bar. Miss it — you are refunded, with the evidence onchain.",
  },
  {
    n: "IV",
    title: "Kill switch",
    body: "Revoke the identity and every downstream gate closes. The agent cannot spend after that.",
  },
];

const FIELDS: { field: string; meaning: string }[] = [
  { field: "agent", meaning: "The worker. Identity is re-checked live at release." },
  { field: "merchant", meaning: "Who gets paid if the work clears the bar." },
  { field: "token", meaning: "ERC-20 only. vUSD on Sepolia." },
  { field: "cap", meaning: "Maximum the agent can spend. Locked in escrow." },
  { field: "window", meaning: "How long validators may score the work." },
  { field: "expiry", meaning: "After this, anyone may refund you." },
  { field: "nonce", meaning: "Stops replay. Burned when you fund." },
  { field: "chainId", meaning: "Pinned to this chain. Cross-chain replay dies." },
];

export default function MandatePage() {
  return (
    <section className="panel">
      <h2>How a mandate works</h2>
      <p className="desc">
        One signed object authorizes one escrowed task. You sign. Anyone can
        submit. Settlement never trusts a prompt.
      </p>

      {STEPS.map((s) => (
        <div className="card" key={s.n}>
          <div>
            <strong>
              {s.n} · {s.title}
            </strong>
          </div>
          <div className="muted">{s.body}</div>
        </div>
      ))}

      <h3>The fields</h3>
      {FIELDS.map((f) => (
        <div key={f.field}>
          <code>{f.field}</code> — <span className="muted">{f.meaning}</span>
        </div>
      ))}

      <div className="row" style={{ marginTop: 12 }}>
        <a href="/#hire-wizard">Hire with a mandate →</a>
        <a
          href="https://github.com/Ramprasad4121/varanasi/blob/main/docs/MANDATE.md"
          target="_blank"
          rel="noreferrer"
        >
          Read the spec ↗
        </a>
      </div>
      <p className="envline">
        <a href="/">← Back to the varanasi dashboard</a>
      </p>
    </section>
  );
}
