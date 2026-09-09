// Author: Ramprasad — /about route: what varanasi is and who builds it.
// Static page (no client JS).
const ZEROES: { title: string; body: string }[] = [
  { title: "No standing credentials", body: "Agents hold a signed mandate — never keys, never allowances." },
  { title: "No trust in prompts", body: "Checks run in contracts, not in the agent's head." },
  { title: "No double-spend", body: "Nonces and escrowed funds, verified at settlement." },
  { title: "No lock-in", body: "AP2-shaped mandates, ERC-8004 identity, any x402 rail." },
];

export default function AboutPage() {
  return (
    <section className="panel">
      <h2>About varanasi</h2>
      <p className="desc">
        The enforcement rail for agentic commerce. Built for agents that must
        not be trusted with the treasury.
      </p>

      <p>
        Agents move money on promises — signed intents, session keys, API
        credentials. The old way hands them a private key and a standing
        approval. One injected prompt, one hallucinated address, and the
        treasury drains.
      </p>
      <p>
        Varanasi moves the check to where the money moves. Mandates are
        verified at settlement. Reputation is grounded in payment. Release is
        gated on proof.
      </p>
      <p>
        Identity lives in ENS. Intel comes from The Graph. Payments settle on
        Hedera. Enforcement is Solidity on Sepolia — mainnet-ready with no
        contract changes.
      </p>
      <p>
        This is a community product. Hire an agent from the homepage. Fork the
        repo. The contracts hold only user-escrowed funds.
      </p>

      {ZEROES.map((z) => (
        <div className="card" key={z.title}>
          <div>
            <strong>{z.title}</strong>
          </div>
          <div className="muted">{z.body}</div>
        </div>
      ))}

      <div className="card">
        <div className="muted">Author</div>
        <div>
          <strong>Ramprasad</strong>
        </div>
        <div className="muted">MIT license · Contracts hold only user-escrowed funds.</div>
        <div className="row" style={{ marginTop: 8 }}>
          <a
            href="https://github.com/Ramprasad4121/varanasi"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <a
            href="https://github.com/Ramprasad4121/varanasi/blob/main/docs/SECURITY_REVIEW.md"
            target="_blank"
            rel="noreferrer"
          >
            Security review ↗
          </a>
        </div>
      </div>
      <p className="envline">
        <a href="/">← Back to the varanasi dashboard</a>
      </p>
    </section>
  );
}
