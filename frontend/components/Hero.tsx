// Author: Ramprasad — Colosseum hero: blackletter drop cap, amphitheatre engraving, event card, illustrated stats.
"use client";

import {
  DEMO_MINT_TX,
  DEMO_RECEIPTS,
  hashscanTx,
  isDeployed,
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
    image: "/images/trophy.jpg",
  },
  {
    value: "3+",
    label: "x402 payments",
    href: hashscanTx(DEMO_RECEIPTS[0]),
    proof: "HashScan",
    image: "/images/eagle.jpg",
  },
  {
    value: "2",
    label: "Agent identities",
    href: sepoliaTx(DEMO_MINT_TX),
    proof: "Etherscan",
    image: "/images/figure-builder.jpg",
  },
  {
    value: "244/244",
    label: "Tests green",
    href: "https://github.com/Ramprasad4121/varanasi",
    proof: "GitHub",
    image: "/images/scales.jpg",
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
      <div className="hero-arena" aria-hidden="true">
        <img src="/images/hero-arena.jpg" alt="" />
      </div>

      <div className="hero-grid">
        <div className="hero-copy">
          <div className="hero-kicker">The arena for agentic commerce</div>
          <h1 className="hero-headline">
            <span className="drop-cap" aria-hidden="true">
              H
            </span>
            ire an AI agent. Pay only on proof.
          </h1>
          <p className="hero-sub">
            Set a spending cap. The agent works inside it. Miss the bar — you are
            refunded. Never hand over keys.
          </p>
          <div className="hero-cta">
            <a className="btn-solid" href="#hire-wizard">
              Enter the arena
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
        </div>

        <aside className="event-card">
          <div className="event-art">
            <img src="/images/palace.jpg" alt="" />
            <span>Open arena</span>
          </div>
          <div className="event-body">
            <p className="event-kicker">Sepolia + Hedera</p>
            <h2>Mandate, fund, settle</h2>
            <p>
              Live proofs already onchain. Hire Scout, Analyst, or Freelancer —
              the escrow enforces the bar. {authorizedCount} authorized · {agentCount} listed.
            </p>
            <div className="event-live">
              <strong>Live</strong>
              <span>escrow · identity · x402</span>
            </div>
            <a className="btn-solid" href="#hire-wizard">
              Hire an agent
            </a>
          </div>
        </aside>
      </div>

      <dl className="statsband">
        {STATS.map((s) => (
          <div className="stat-item" key={s.label}>
            <img className="stat-plate" src={s.image} alt="" />
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
