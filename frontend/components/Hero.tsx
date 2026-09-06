"use client";

import {
  REGISTRY,
  RISK_GUARD,
  SIGNAL_URL,
  isDeployed,
  sepoliaAddress,
} from "./aegis";

export default function Hero({
  agentCount,
  authorizedCount,
}: {
  agentCount: number;
  authorizedCount: number;
}) {
  function scrollToFeatured() {
    document
      .getElementById("featured-agent")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <section className="hero">
      <div>
        <div className="kicker">
          Agent marketplace · ETHOnline 2026 · Sepolia + Hedera testnet
        </div>
        <h1 className="pitch">
          Hire agents that can&apos;t transact without identity, data, and
          money.
        </h1>
        <p className="sub">
          Revocable <code>*.aegis.eth</code> identity, live Uniswap intel, and
          pay-per-call alpha — all verifiable onchain.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="cta-primary"
            onClick={scrollToFeatured}
          >
            Verify sentinel-1 live
          </button>
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Authorized agents</span>
          <strong className="stat-num">{authorizedCount}</strong>
          <span className="muted">
            of {agentCount} tracked · incl. demo-known sentinel-1
          </span>
        </div>
        <div className="stat">
          <span className={`badge ${isDeployed ? "ok" : "warn"}`}>
            {isDeployed ? "live" : "not deployed yet"}
          </span>
        </div>
      </div>
      <p className="footline muted">
        Registry (Sepolia){" "}
        <a href={sepoliaAddress(REGISTRY)} target="_blank" rel="noreferrer">
          <code>
            {REGISTRY.slice(0, 10)}…{REGISTRY.slice(-6)}
          </code>{" "}
          ↗
        </a>{" "}
        · RiskGuard{" "}
        <a href={sepoliaAddress(RISK_GUARD)} target="_blank" rel="noreferrer">
          <code>
            {RISK_GUARD.slice(0, 10)}…{RISK_GUARD.slice(-6)}
          </code>{" "}
          ↗
        </a>{" "}
        · Signal service <code>{SIGNAL_URL}</code>
      </p>
    </section>
  );
}
