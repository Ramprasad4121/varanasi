"use client";

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
  REGISTRY,
  SEPOLIA_RPC,
  SIGNAL_URL,
  isDeployed,
  load,
  save,
  seedVerdicts,
  type AgentRecord,
  type IntelRecord,
  type PublicClientLike,
  type Receipt,
  type Verdict,
} from "../components/aegis";

// ---------------------------------------------------------------------------
// AEGIS agent marketplace — composes Hero + Agents + Pool intel +
// Paid signals + Verdict timeline. Every panel degrades gracefully when
// contracts/RPC/service are unreachable (never crashes; shows addresses +
// connect hints). State persists in localStorage.
// ---------------------------------------------------------------------------
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

  // +1 = demo-known sentinel-1.aegis.eth (authorized 2026-09-06, DEMO.md).
  const authorizedCount =
    1 +
    agents.filter(
      (a) => !a.revoked && !a.pending && a.expiry * 1000 > Date.now()
    ).length;

  const upsertAgent = (a: AgentRecord) =>
    setAgents((prev) => [
      a,
      ...prev.filter((x) => x.sublabel !== a.sublabel),
    ]);

  return (
    <>
      {!isDeployed && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <span className="badge warn">not deployed yet</span>{" "}
          <span className="envline">
            Set <code>NEXT_PUBLIC_AEGIS_REGISTRY</code> (Sepolia) in{" "}
            <code>.env.local</code> after deploying <code>contracts/</code>.
            Onchain writes/reads are disabled until then; records are kept in
            localStorage as pending.
          </span>
        </div>
      )}
      <Hero agentCount={agents.length + 1} authorizedCount={authorizedCount} />
      <div className="market">
        <div className="span">
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
        </div>
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
      <p className="envline" style={{ marginTop: 16 }}>
        Registry: <code>{REGISTRY || "(unset)"}</code> · RPC:{" "}
        <code>{SEPOLIA_RPC ? "configured" : "(unset — viem default)"}</code> ·
        Signal: <code>{SIGNAL_URL || "(unset)"}</code>
      </p>
    </>
  );
}
