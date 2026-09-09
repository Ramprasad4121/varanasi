"use client";

// Author: Ramprasad — homepage: colosseum.com paper theme — arena hero, engraving plates, stats, agents.
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
  seedVerdicts,
  type AgentRecord,
  type IntelRecord,
  type PublicClientLike,
  type Receipt,
  type Verdict,
} from "../components/aegis";
import { loadScoped, saveScoped, useVaultUserId } from "../lib/vault";

const FEATURES = [
  {
    n: "I",
    title: "Identity",
    body: "Expiring ENSv2 subnames, revocable onchain. One click kills the agent everywhere.",
    link: "#agents",
    linkLabel: "Meet the agents",
    image: "/images/figure-builder.jpg",
  },
  {
    n: "II",
    title: "Intel",
    body: "Pool reasoning grounded in live subgraph data and verified price feeds.",
    link: "#intel",
    linkLabel: "See pool intel",
    image: "/images/scales.jpg",
  },
  {
    n: "III",
    title: "Payments",
    body: "x402-settled micropayments through Hedera — pay, retry, receipt.",
    link: "#signals",
    linkLabel: "Run the loop",
    image: "/images/mandate-scroll.jpg",
  },
] as const;

const GALLERY = [
  { src: "/images/gallery-workshop.jpg", alt: "The workshop" },
  { src: "/images/gallery-courtyard.jpg", alt: "The courtyard" },
  { src: "/images/gallery-dinner.jpg", alt: "The hall" },
  { src: "/images/gate.jpg", alt: "The gate" },
] as const;

function DiamondSep() {
  return (
    <div className="diamond-sep" aria-hidden="true" style={{ margin: "56px auto" }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
        <path d="M5 0.7 L9.3 5 L5 9.3 L0.7 5 Z" />
      </svg>
    </div>
  );
}

export default function Page() {
  const userId = useVaultUserId();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [intel, setIntel] = useState<IntelRecord | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
    setAgents(loadScoped<AgentRecord[]>(userId, LS_AGENTS, []));
    setIntel(loadScoped<IntelRecord | null>(userId, LS_INTEL, null));
    setReceipts(loadScoped<Receipt[]>(userId, LS_RECEIPTS, []));
    const v = loadScoped<Verdict[] | null>(userId, LS_VERDICTS, null);
    setVerdicts(v ?? seedVerdicts());
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_AGENTS, agents);
  }, [agents, hydrated, userId]);
  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_INTEL, intel);
  }, [intel, hydrated, userId]);
  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_RECEIPTS, receipts);
  }, [receipts, hydrated, userId]);
  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_VERDICTS, verdicts);
  }, [verdicts, hydrated, userId]);

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

      <section id="how-it-works">
        <div className="section-intro">
          <p className="hero-kicker">The contest</p>
          <h2>
            <span className="drop-cap" aria-hidden="true">
              T
            </span>
            hree steps. Then the money moves.
          </h2>
          <p>Varanasi puts the check where settlement happens — not in a prompt, not in a session key.</p>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <img src={f.image} alt="" />
              <div className="feature-body">
                <p className="feature-kicker">{f.n}</p>
                <h2>{f.title}</h2>
                <p>{f.body}</p>
                <a href={f.link}>{f.linkLabel} →</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <DiamondSep />

      <section>
        <div className="section-intro">
          <p className="hero-kicker">Plates from the arena</p>
          <h2>
            <span className="drop-cap" aria-hidden="true">
              D
            </span>
            rawn like the contests of old
          </h2>
          <p>Identity, mandate, and settlement — illustrated as the architectural plates of a Roman arena.</p>
        </div>
        <div className="gallery">
          {GALLERY.map((plate) => (
            <figure key={plate.src}>
              <img src={plate.src} alt={plate.alt} />
            </figure>
          ))}
        </div>
      </section>

      <DiamondSep />

      <section id="agents" className="wrap">
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

      <div className="market" id="proof">
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

      <p className="envline wrap" style={{ marginTop: 32 }}>
        Sepolia + Hedera testnet
      </p>
    </>
  );
}
