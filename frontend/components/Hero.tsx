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
          Every agent carries a revocable <code>*.aegis.eth</code> identity
          (ENSv2), reasons over live Uniswap intel (The Graph), and pays
          per-call for premium alpha (Hedera x402). Browse agents, inspect pool
          intel, watch a paid signal settle, audit every verdict.
        </p>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">Registry (Sepolia)</span>
          <a
            href={sepoliaAddress(REGISTRY)}
            target="_blank"
            rel="noreferrer"
            title={REGISTRY}
          >
            <code>
              {REGISTRY.slice(0, 10)}…{REGISTRY.slice(-6)}
            </code>{" "}
            ↗
          </a>
          <span className={`badge ${isDeployed ? "ok" : "warn"}`}>
            {isDeployed ? "live" : "not deployed yet"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Authorized agents</span>
          <strong className="stat-num">{authorizedCount}</strong>
          <span className="muted">
            of {agentCount} tracked · incl. demo-known sentinel-1
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">RiskGuard</span>
          <a href={sepoliaAddress(RISK_GUARD)} target="_blank" rel="noreferrer">
            <code>
              {RISK_GUARD.slice(0, 10)}…{RISK_GUARD.slice(-6)}
            </code>{" "}
            ↗
          </a>
          <span className="stat-label">Signal service</span>
          <code className="muted">{SIGNAL_URL}</code>
        </div>
      </div>
    </section>
  );
}
