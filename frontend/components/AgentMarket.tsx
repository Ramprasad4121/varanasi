"use client";

// Author: Ramprasad — AgentMarket listings: featured sentinel-1 + onboard/mint via AegisRegistry.mintAgent, revoke; live deps Sepolia RPC/registry via viem + window.ethereum; degrades to local pending records + status hints when undeployed/offline/no wallet.
import { useState, type FormEvent } from "react";
import {
  createWalletClient,
  custom,
  isAddress,
  keccak256,
  stringToBytes,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import {
  DEMO_MINT_TX,
  REGISTRY,
  REGISTRY_ABI,
  isDeployed,
  sepoliaTx,
  type AgentRecord,
  type PublicClientLike,
} from "./aegis";
import HireWizard, { type HireClient } from "./HireWizard";

// The bench: the three demo worker archetypes (mirror agent/src/workers/*
// and `hire --agent <name>`) waiting to be picked. A seat reads "on the job"
// once the user has hired an agent whose name starts with that archetype —
// derived from the agent list, no new state, nothing faked.
const BENCH = [
  { key: "scout", label: "Scout", role: "Finds the pools worth your money." },
  { key: "analyst", label: "Analyst", role: "Scores risk before a cent moves." },
  { key: "freelancer", label: "Freelancer", role: "Does the work, settles escrow." },
];

function Bench({
  agents,
  onHire,
}: {
  agents: AgentRecord[];
  onHire: (a: AgentRecord) => void;
}) {
  const onJob = (key: string) =>
    agents.some(
      (a) => !a.revoked && a.sublabel.toLowerCase().startsWith(key)
    );
  const waiting = BENCH.filter((b) => !onJob(b.key)).length;
  return (
    <div className="bench">
      <div className="bench-head">
        <span className="bench-title">On the bench</span>
        <span className="muted">
          {waiting} waiting · {BENCH.length - waiting} on the job
        </span>
      </div>
      <div className="bench-seats">
        {BENCH.map((b) => {
          const busy = onJob(b.key);
          return (
            <div className="bench-seat" key={b.key}>
              <span className={`bench-dot${busy ? " busy" : ""}`} aria-hidden />
              <div>
                <strong>{b.label}</strong>
                <div className="muted">{b.role}</div>
                {busy ? (
                  <div className="bench-state ok">On the job ✓</div>
                ) : (
                  <button
                    type="button"
                    className="bench-hire"
                    onClick={() =>
                      onHire({
                        sublabel: `${b.key}-1`,
                        wallet: "",
                        expiry: Math.floor(Date.now() / 1000) + 90 * 86400,
                      })
                    }
                  >
                    Hire {b.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Per-card: one clean Etherscan link.
function VerifyLine({ txHash }: { txHash?: string }) {
  if (!txHash) return null;
  return (
    <div className="verify-line">
      <a href={sepoliaTx(txHash)} target="_blank" rel="noreferrer" className="verify-primary">
        Verified on Etherscan ↗
      </a>
    </div>
  );
}
export default function AgentMarket({
  agents,
  publicClient,
  onMinted,
  onUpdate,
}: {
  agents: AgentRecord[];
  publicClient: PublicClientLike;
  onMinted: (a: AgentRecord) => void;
  onUpdate: (a: AgentRecord) => void;
}) {
  const [status, setStatus] = useState("");
  const [liveCheck, setLiveCheck] = useState("");
  const [hireTarget, setHireTarget] = useState<AgentRecord | null>(null);

  function hire(a: AgentRecord) {
    setHireTarget(a);
    requestAnimationFrame(() =>
      document
        .getElementById("hire-wizard")
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  // Live onchain check of the featured agent (never crashes when offline).
  // Reads go through tokenByLabelHash → expiry/revoked: the contract has
  // no agentOf(string), and mint takes expiry days (see aegis.ts).
  async function checkSentinel() {
    if (!isDeployed) {
      setLiveCheck("Registry not deployed yet — showing local records.");
      return;
    }
    try {
      const tokenId = (await publicClient.readContract({
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "tokenByLabelHash",
        args: [keccak256(stringToBytes("sentinel-1"))],
      })) as bigint;
      if (tokenId === BigInt(0)) {
        setLiveCheck("Live: sentinel-1 is not minted onchain yet.");
        return;
      }
      const [expiry, revoked] = (await Promise.all([
        publicClient.readContract({
          address: REGISTRY as Address,
          abi: REGISTRY_ABI,
          functionName: "expiry",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: REGISTRY as Address,
          abi: REGISTRY_ABI,
          functionName: "revoked",
          args: [tokenId],
        }),
      ])) as [bigint, boolean];
      const ok = !revoked && Number(expiry) * 1000 > Date.now();
      setLiveCheck(
        `Live: sentinel-1 token #${tokenId.toString()} → ${
          ok ? "AUTHORIZED" : "not authorized"
        } (expiry ${new Date(Number(expiry) * 1000).toLocaleDateString()}).`
      );
    } catch (err) {
      setLiveCheck(
        `Live check failed — showing saved values. (${
          err instanceof Error ? err.message : String(err)
        })`
      );
    }
  }

  async function revoke(a: AgentRecord) {
    if (!isDeployed) {
      onUpdate({ ...a, revoked: true });
      setStatus("Registry not deployed yet — marked revoked locally.");
      return;
    }
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!eth) {
      setStatus("No window.ethereum found — connect MetaMask (Sepolia) first.");
      return;
    }
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(eth as never),
      });
      const [account] = await walletClient.getAddresses();
      if (!account) throw new Error("No account — unlock your wallet first.");
      const hash = await walletClient.writeContract({
        account,
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "revokeAgentByLabel",
        args: [a.sublabel],
        chain: sepolia,
      });
      onUpdate({ ...a, revoked: true, txHash: hash });
      setStatus(`Revoked ${a.sublabel}.aegis.eth → ${hash}`);
    } catch (err) {
      setStatus(
        `Revoke failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return (
    <section className="panel" id="agents">
      <h2>Agents for hire</h2>
      <p className="desc">
        Each agent is an ENSv2 subname with an expiring, revocable onchain
        authorization.
      </p>

      <Bench agents={agents} onHire={hire} />

      {/* Featured agent */}
      <div className="card featured" id="featured-agent">
        <div>
          <strong>sentinel-1.aegis.eth</strong>{" "}
          <span className="badge ok">authorized</span>
        </div>
        <div className="muted">
          Minted Sep 6, 2026 · 90-day expiry · RiskGuard verified
        </div>
        <VerifyLine txHash={DEMO_MINT_TX} />
        <div className="row">
          <button onClick={checkSentinel}>Verify onchain</button>
          <button
            onClick={() =>
              hire({
                sublabel: "sentinel-1",
                wallet: "",
                expiry: Math.floor(Date.now() / 1000) + 90 * 86400,
              })
            }
          >
            Hire
          </button>
        </div>
        {liveCheck && <div className="status">{liveCheck}</div>}
      </div>

      <OnboardForm onMinted={onMinted} />

      {agents.length === 0 && (
        <div className="status muted" style={{ marginTop: 12 }}>
          No additional agents listed yet.
        </div>
      )}
      <div className="cards">
        {agents.map((a) => {
          const expired = a.expiry * 1000 <= Date.now();
          return (
            <div className="card" key={a.sublabel}>
              <div>
                <strong>{a.sublabel}.aegis.eth</strong>{" "}
                {a.revoked ? (
                  <span className="badge bad">revoked</span>
                ) : expired ? (
                  <span className="badge bad">expired</span>
                ) : a.pending || !isDeployed ? (
                  <span className="badge warn">pending</span>
                ) : (
                  <span className="badge ok">authorized</span>
                )}
              </div>
              <div className="muted">
                Expires {new Date(a.expiry * 1000).toLocaleDateString()}
              </div>
              <VerifyLine txHash={a.txHash} />
              <div className="row">
                {!a.revoked && (
                  <>
                    <button onClick={() => hire(a)}>Hire</button>
                    <button onClick={() => revoke(a)}>Revoke</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <HireWizard
        publicClient={publicClient as unknown as HireClient}
        externalAgent={hireTarget}
      />
      <div className="status">{status}</div>
    </section>
  );
}

function OnboardForm({ onMinted }: { onMinted: (a: AgentRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [sublabel, setSublabel] = useState("");
  const [wallet, setWallet] = useState("");
  const [days, setDays] = useState("90");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function mint(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    const label = sublabel.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/.test(label)) {
      setStatus("Sublabel must be 1–32 chars: a–z, 0–9, hyphen.");
      return;
    }
    if (!isAddress(wallet)) {
      setStatus("Agent wallet is not a valid 0x address.");
      return;
    }
    const expiryDays = Math.max(1, Number(days) || 90);
    const expiry =
      Math.floor(Date.now() / 1000) + expiryDays * 86400;

    if (!isDeployed) {
      onMinted({ sublabel: label, wallet, expiry, pending: true });
      setStatus(
        `Registry not deployed yet — listed "${label}.aegis.eth" locally as pending.`
      );
      return;
    }
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!eth) {
      setStatus("No window.ethereum found — connect MetaMask (Sepolia) first.");
      return;
    }
    setBusy(true);
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(eth as never),
      });
      const [account] = await walletClient.getAddresses();
      if (!account) throw new Error("No account — unlock your wallet first.");
      const hash = await walletClient.writeContract({
        account,
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "mintAgent",
        // Contract takes expiry DAYS (not a timestamp) — see aegis.ts.
        args: [label, wallet as Address, BigInt(expiryDays)],
        chain: sepolia,
      });
      onMinted({ sublabel: label, wallet, expiry, txHash: hash });
      setStatus(`Listed ${label}.aegis.eth → ${hash}`);
      setSublabel("");
    } catch (err) {
      setStatus(
        `Mint failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          color: "var(--muted)",
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          marginTop: 0,
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        {open ? "Hide" : "List a new agent"}
      </button>
      {open && (
        <form onSubmit={mint} className="card" style={{ marginTop: 8 }}>
          <label>Agent name</label>
          <input
            value={sublabel}
            onChange={(e) => setSublabel(e.target.value)}
            placeholder="sentinel-2"
          />
          <label>Agent wallet</label>
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x…"
          />
          <label>Expiry (days)</label>
          <input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputMode="numeric"
          />
          <button type="submit" disabled={busy}>
            {busy ? "Minting…" : isDeployed ? "Mint agent" : "List locally"}
          </button>
          <div className="status">{status}</div>
        </form>
      )}
    </div>
  );
}
