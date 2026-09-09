// Author: Ramprasad — hero: colosseum.com grammar — one headline, one CTA, stats band.
"use client";

import {
  DEMO_MINT_TX,
  DEMO_RECEIPTS,
  REGISTRY,
  RISK_GUARD,
  hashscanTx,
  isDeployed,
  sepoliaAddress,
  sepoliaTx,
} from "./aegis";

const ESCROW_RELEASE_TX =
  "0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702";

const STATS = [
  {
    value: "1+",
    label: "Escrows released",
    href: sepoliaTx(ESCROW_RELEASE_TX),
    proof: "Etherscan",
  },
  {
    value: "3+",
    label: "x402 payments",
    href: hashscanTx(DEMO_RECEIPTS[0]),
    proof: "HashScan",
  },
  {
    value: "2",
    label: "Agent identities",
    href: sepoliaTx(DEMO_MINT_TX),
    proof: "Etherscan",
  },
  {
    value: "121/121",
    label: "Tests green",
    href: sepoliaAddress(REGISTRY),
    proof: "Etherscan",
  },
] as const;

export default function Hero({
  agentCount,
  authorizedCount,
}: {
  agentCount: number;
  authorizedCount: number;
}) {
  return (
    <section className="hero">
      <div className="hero-kicker">
        Agent marketplace · Sepolia + Hedera testnet
      </div>
      <h1 className="hero-headline">Authorize the Agent.</h1>
      <p className="hero-sub">
        The enforcement rail for agentic commerce. Mandates verified at
        settlement, reputation grounded in payment, release gated on proof.
        Never hand over keys.
      </p>
      <div className="hero-cta">
        <a className="btn-solid" href="#agents">
          Browse agents
        </a>
        <a
          className="btn-outline"
          href="https://github.com/Ramprasad4121/varanasi"
          target="_blank"
          rel="noreferrer"
        >
          Read the docs
        </a>
        <span className={`badge ${isDeployed ? "ok" : "warn"}`}>
          {isDeployed ? "live on Sepolia" : "not deployed yet"}
        </span>
      </div>

      <dl className="statsband">
        {STATS.map((s) => (
          <div className="stat-item" key={s.label}>
            <dt className="stat-num">{s.value}</dt>
            <dd className="stat-label">{s.label}</dd>
            <dd className="stat-link">
              <a href={s.href} target="_blank" rel="noreferrer">
                live · {s.proof} ↗
              </a>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
