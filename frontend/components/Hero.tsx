// Author: Ramprasad — colosseum-style hero: display headline + dual CTA pills + live-stats band (Etherscan/HashScan proof via aegis.ts) + Identity/Intel/Payments feature cards + copyable one-command block + old-way/new-way + zero-grid; light theme, plain CSS, responsive, degrades gracefully when service/registry unreachable.
"use client";

import { useState } from "react";
import {
  DEMO_MINT_TX,
  DEMO_RECEIPTS,
  REGISTRY,
  RISK_GUARD,
  SIGNAL_URL,
  hashscanTx,
  isDeployed,
  sepoliaAddress,
  sepoliaTx,
} from "./aegis";

const ESCROW_RELEASE_TX =
  "0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702";

const QUICKSTART = `./run.sh agent
npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp`;

const STATS = [
  {
    value: "1+",
    label: "escrows released",
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
    label: "identities",
    href: sepoliaTx(DEMO_MINT_TX),
    proof: "Etherscan",
  },
  {
    value: "86/86",
    label: "tests green",
    href: sepoliaAddress(REGISTRY),
    proof: "Etherscan",
  },
] as const;

const FEATURES = [
  {
    title: "Identity",
    body: "Expiring ENSv2 subnames, revocable onchain — demo-known sentinel-1.aegis.eth.",
    link: "#agents",
    linkLabel: "Meet the agents",
  },
  {
    title: "Intel",
    body: "Pool reasoning grounded in live Uniswap subgraph + CoinGecko quotes.",
    link: "#intel",
    linkLabel: "See pool intel",
  },
  {
    title: "Payments",
    body: "Premium alpha through the Hedera x402 gate — pay, retry, receipt.",
    link: "#signals",
    linkLabel: "Run the loop",
  },
] as const;

const OLD_WAY = [
  "Agent holds a private key with standing approvals — always-on spend power.",
  "One injected prompt or hallucinated address drains the treasury (Bankr/Grok $180K, AIXBT 55.5 ETH).",
  "No budget model, no escrow, no audit trail.",
] as const;

const NEW_WAY = [
  "Agent holds a signed mandate — cap, window, expiry, nonce. Funds lock in escrow; replay impossible.",
  "Release needs score ≥ threshold plus a live identity + RiskGuard re-check, in the same transaction.",
  "Miss the bar → auto-refund with evidence. Misbehave → revoke the identity and every gate closes.",
] as const;

const ZEROS = [
  {
    title: "Zero standing credentials",
    body: "Agents hold mandates, never keys or allowances.",
  },
  {
    title: "Zero trust in prompts",
    body: "Checks run in contracts, not in the agent's head.",
  },
  {
    title: "Zero double-spend",
    body: "Nonces + escrowed funds, verified at settlement.",
  },
  {
    title: "Zero lock-in",
    body: "AP2-shaped mandates, ERC-8004-native identity, any x402 rail.",
  },
] as const;

export default function Hero({
  agentCount,
  authorizedCount,
}: {
  agentCount: number;
  authorizedCount: number;
}) {
  const [copied, setCopied] = useState(false);

  function scrollToSignals() {
    document
      .getElementById("signals")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function copyQuickstart() {
    try {
      await navigator.clipboard.writeText(QUICKSTART);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="hero hero-x402">
      <div className="hero-main">
        <div className="kicker">
          Agent marketplace · ETHOnline 2026 · Sepolia + Hedera testnet
        </div>
        <h1 className="pitch">Authorize the Agent.</h1>
        <p className="sub">
          The enforcement rail for agentic commerce. Agents move money on
          promises — signed intents, session keys, API credentials. Varanasi
          moves the check to where the money moves: mandates verified at
          settlement, reputation grounded in payment, release gated on proof.
        </p>
        <div className="row hero-cta-row">
          <button
            type="button"
            className="btn-solid"
            onClick={scrollToSignals}
          >
            Run the loop
          </button>
          <a
            className="btn-outline"
            href={hashscanTx(DEMO_RECEIPTS[0])}
            target="_blank"
            rel="noreferrer"
          >
            Read the proof
          </a>
          <span className={`badge ${isDeployed ? "ok" : "warn"}`}>
            {isDeployed ? "live" : "not deployed yet"}
          </span>
        </div>

        <dl className="hero-stats">
          {STATS.map((s) => (
            <div className="hero-stat" key={s.label}>
              <dt className="stat-label">{s.label}</dt>
              <dd className="stat-num">{s.value}</dd>
              <dd className="hero-live">
                <a href={s.href} target="_blank" rel="noreferrer">
                  live · {s.proof} ↗
                </a>
              </dd>
            </div>
          ))}
        </dl>

        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
              <a href={f.link}>{f.linkLabel} →</a>
            </div>
          ))}
        </div>

        <div className="hero-code">
          <div className="hero-code-head">
            <span className="muted">Run the full agent loop</span>
            <button
              type="button"
              className="copy-btn"
              onClick={copyQuickstart}
              aria-label="Copy quickstart commands"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre>
            <code>{QUICKSTART}</code>
          </pre>
        </div>

        <div className="hero-oldnew">
          <div className="hero-col hero-col-old">
            <h2>The old way</h2>
            <ul>
              {OLD_WAY.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="hero-col hero-col-new">
            <h2>The varanasi way</h2>
            <ul>
              {NEW_WAY.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="hero-zeros">
          {ZEROS.map((z) => (
            <li key={z.title}>
              <strong>{z.title}</strong>
              <span className="muted">{z.body}</span>
            </li>
          ))}
        </ul>
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
