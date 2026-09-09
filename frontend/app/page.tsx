"use client";

// Author: Ramprasad — homepage: colosseum.com structure — hero, stats, features, agents.
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import "./marketplace.css";
import AgentMarket from "../components/AgentMarket";
import Hero from "../components/Hero";
import PoolIntel from "../components/PoolIntel";
import SignalPanel from "../components/SignalPanel";
import VerdictTimeline from "../components/VerdictTimeline";
import {
  LS_AGENTS,
  LS_INTEL,
  LS_RECEIPTS,
  LS_VERDICTS,
  SEPOLIA_RPC,
  load,
  save,
  seedVerdicts,
  type AgentRecord,
  type IntelRecord,
  type PublicClientLike,
  type Receipt,
  type Verdict,
} from "../components/aegis";

const FEATURES = [
  {
    title: "Identity",
    body: "Expiring ENSv2 subnames, revocable onchain. One click kills the agent everywhere.",
    link: "#agents",
    linkLabel: "Meet the agents",
  },
  {
    title: "Intel",
    body: "Pool reasoning grounded in live subgraph data and verified price feeds.",
    link: "#intel",
    linkLabel: "See pool intel",
  },
  {
    title: "Payments",
    body: "x402-settled micropayments through Hedera — pay, retry, receipt.",
    link: "#signals",
    linkLabel: "Run the loop",
  },
] as const;

function DiamondSep() {
  return (
    <div className="diamond-sep" aria-hidden="true" style={{ margin: "56px auto" }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M5 0 L10 5 L5 10 L0 5 Z" />
      </svg>
    </div>
  );
}

export default function Page() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [intel, setIntel] = useState<IntelRecord | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAgents(load<AgentRecord[]>(LS_AGENTS, []));
    setIntel(load<IntelRecord | null>(LS_INTEL, null));
    setReceipts(load<Receipt[]>(LS_RECEIPTS, []));
    const v = load<Verdict[] | null>(LS_VERDICTS, null);
    setVerdicts(v ?? seedVerdicts());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(LS_AGENTS, agents);
  }, [agents, hydrated]);
  useEffect(() => {
    if (hydrated) save(LS_INTEL, intel);
  }, [intel, hydrated]);
  useEffect(() => {
    if (hydrated) save(LS_RECEIPTS, receipts);
  }, [receipts, hydrated]);
  useEffect(() => {
    if (hydrated) save(LS_VERDICTS, verdicts);
  }, [verdicts, hydrated]);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: SEPOLIA_RPC ? http(SEPOLIA_RPC) : http(),
      }),
    []
  );

  const authorizedCount =
    1 +
    agents.filter(
      (a) => !a.revoked && !a.pending && a.expiry * 1000 > Date.now()
    ).length;

  const upsertAgent = (a: AgentRecord) =>
    setAgents((prev) => [a, ...prev.filter((x) => x.sublabel !== a.sublabel)]);

  return (
    <>
      <Hero agentCount={agents.length + 1} authorizedCount={authorizedCount} />

      <DiamondSep />

      {/* How it works */}
      <section id="how-it-works">
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
              <a href={f.link}>{f.linkLabel} →</a>
            </div>
          ))}
        </div>
      </section>

      <DiamondSep />

      {/* Agents */}
      <section id="agents">
        <AgentMarket
          agents={agents}
          publicClient={publicClient as unknown as PublicClientLike}
          onMinted={upsertAgent}
          onUpdate={(a) =>
            setAgents((prev) =>
              prev.map((x) => (x.sublabel === a.sublabel ? a : x))
            )
          }
        />
      </section>

      <DiamondSep />

      {/* Intel, signals, verdicts */}
      <div className="market">
        <PoolIntel intel={intel} onIntel={setIntel} />
        <SignalPanel receipts={receipts} onReceipts={setReceipts} />
        <div className="span">
          <VerdictTimeline
            verdicts={verdicts}
            intel={intel}
            onVerdicts={setVerdicts}
          />
        </div>
      </div>

      <p className="envline" style={{ marginTop: 32 }}>
        Sepolia + Hedera testnet
      </p>
    </>
  );
}
