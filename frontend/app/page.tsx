"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";

// ---------------------------------------------------------------------------
// Env wiring (graceful "not deployed yet" when unset / zero address)
// ---------------------------------------------------------------------------
const REGISTRY = (process.env.NEXT_PUBLIC_AEGIS_REGISTRY ?? "") as string;
const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "";
const SIGNAL_URL = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "";
const ZERO = "0x0000000000000000000000000000000000000000";
const isDeployed = Boolean(REGISTRY) && REGISTRY.toLowerCase() !== ZERO;

// Minimal AegisRegistry surface (see docs/ARCHITECTURE.md §1 + contracts/).
// Reads are defensive: if the contract isn't deployed yet, every read throws
// and we fall back to the localStorage record.
const REGISTRY_ABI = [
  {
    inputs: [
      { name: "sublabel", type: "string" },
      { name: "agentWallet", type: "address" },
      { name: "expiry", type: "uint64" },
    ],
    name: "mintAgent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "sublabel", type: "string" }],
    name: "revokeAgent",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "sublabel", type: "string" }],
    name: "agentOf",
    outputs: [
      { name: "wallet", type: "address" },
      { name: "expiry", type: "uint64" },
      { name: "revoked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// localStorage-backed types
// ---------------------------------------------------------------------------
type AgentRecord = {
  sublabel: string;
  wallet: string;
  expiry: number; // unix seconds
  txHash?: string;
  revoked?: boolean;
  pending?: boolean; // true when saved before registry deployment
};

type IntelRecord = {
  riskScore: number;
  rationale: string;
  raw: unknown;
};

type Receipt = {
  txId: string;
  endpoint: string;
  amount: string;
  at: string; // ISO timestamp
};

const LS_AGENTS = "aegis.agents";
const LS_INTEL = "aegis.intel";
const LS_RECEIPTS = "aegis.receipts";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private-mode: ignore */
  }
}

const SAMPLE_INTEL = JSON.stringify(
  {
    pool: "USDC/ETH 0.05% (Uniswap V3)",
    tvlUsd: 48_200_000,
    volume24hUsd: 9_600_000,
    apyEstimatePct: 12.4,
    riskScore: 38,
    rationale:
      "Deep TVL + steady volume; fee tier matches pair volatility. Score < 50 → enter with capped size.",
  },
  null,
  2
);

function hashscan(txId: string) {
  return `https://hashscan.io/testnet/tx/${encodeURIComponent(txId)}`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Page() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [intel, setIntel] = useState<IntelRecord | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAgents(load<AgentRecord[]>(LS_AGENTS, []));
    setIntel(load<IntelRecord | null>(LS_INTEL, null));
    setReceipts(load<Receipt[]>(LS_RECEIPTS, []));
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

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: SEPOLIA_RPC ? http(SEPOLIA_RPC) : http(),
      }),
    []
  );

  return (
    <>
      {!isDeployed && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <span className="badge warn">not deployed yet</span>{" "}
          <span className="envline">
            Set <code>NEXT_PUBLIC_AEGIS_REGISTRY</code> (Sepolia) in <code>.env.local</code> after
            deploying <code>contracts/</code>. Onchain writes/reads are disabled until then;
            records are kept in localStorage as pending.
          </span>
        </div>
      )}
      <div className="grid">
        <OnboardPanel
          disabled={!isDeployed}
          onMinted={(a) => setAgents((prev) => [a, ...prev.filter((x) => x.sublabel !== a.sublabel)])}
          onPending={(a) => setAgents((prev) => [a, ...prev.filter((x) => x.sublabel !== a.sublabel)])}
        />
        <AgentsPanel
          agents={agents}
          deployed={isDeployed}
          publicClient={publicClient as unknown as PublicClientLike}
          onUpdate={(a) =>
            setAgents((prev) => prev.map((x) => (x.sublabel === a.sublabel ? a : x)))
          }
        />
        <IntelPanel intel={intel} onIntel={setIntel} />
        <PaymentsPanel receipts={receipts} onReceipts={setReceipts} />
      </div>
      <p className="envline" style={{ marginTop: 16 }}>
        Registry: <code>{REGISTRY || "(unset)"}</code> · RPC:{" "}
        <code>{SEPOLIA_RPC ? "configured" : "(unset — viem default)"}</code> · Signal:{" "}
        <code>{SIGNAL_URL || "(unset)"}</code>
      </p>
    </>
  );
}

// viem client structural type (avoids exporting concrete generic)
type PublicClientLike = {
  readContract: (args: {
    address: Address;
    abi: typeof REGISTRY_ABI;
    functionName: "agentOf";
    args: [string];
  }) => Promise<readonly [Address, bigint, boolean]>;
};

// ---------------------------------------------------------------------------
// (1) Onboard — mint agent subname
// ---------------------------------------------------------------------------
function OnboardPanel({
  disabled,
  onMinted,
  onPending,
}: {
  disabled: boolean;
  onMinted: (a: AgentRecord) => void;
  onPending: (a: AgentRecord) => void;
}) {
  const [sublabel, setSublabel] = useState("");
  const [wallet, setWallet] = useState("");
  const [days, setDays] = useState("90");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function mint(e: React.FormEvent) {
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
    const expiry = Math.floor(Date.now() / 1000) + Math.max(1, Number(days) || 90) * 86400;

    if (disabled) {
      onPending({ sublabel: label, wallet, expiry, pending: true });
      setStatus(`Registry not deployed yet — saved "${label}.aegis.eth" locally as pending.`);
      return;
    }
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!eth) {
      setStatus("No window.ethereum found — connect MetaMask (Sepolia) first.");
      return;
    }
    setBusy(true);
    try {
      const walletClient = createWalletClient({ chain: sepolia, transport: custom(eth as never) });
      const [account] = await walletClient.getAddresses();
      if (!account) throw new Error("No account — unlock your wallet first.");
      const hash = await walletClient.writeContract({
        account,
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "mintAgent",
        args: [label, wallet as Address, BigInt(expiry)],
        chain: sepolia,
      });
      onMinted({ sublabel: label, wallet, expiry, txHash: hash });
      setStatus(`Minted ${label}.aegis.eth → ${hash}`);
      setSublabel("");
    } catch (err) {
      setStatus(`Mint failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>1 · Onboard</h2>
      <p className="desc">
        Mint <code>sublabel.aegis.eth</code> via <code>AegisRegistry.mintAgent</code> (Sepolia,
        window.ethereum).
      </p>
      <form onSubmit={mint}>
        <label>Sublabel (→ *.aegis.eth)</label>
        <input value={sublabel} onChange={(e) => setSublabel(e.target.value)} placeholder="sentinel-1" />
        <label>Agent wallet (0x…)</label>
        <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" />
        <label>Authorization expiry (days)</label>
        <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
        <button type="submit" disabled={busy}>
          {busy ? "Minting…" : disabled ? "Save pending (no registry)" : "Mint agent subname"}
        </button>
      </form>
      <div className="status">{status}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// (2) Agents — localStorage + registry reads
// ---------------------------------------------------------------------------
function AgentsPanel({
  agents,
  deployed,
  publicClient,
  onUpdate,
}: {
  agents: AgentRecord[];
  deployed: boolean;
  publicClient: PublicClientLike;
  onUpdate: (a: AgentRecord) => void;
}) {
  const [status, setStatus] = useState("");

  const refresh = useCallback(
    async (a: AgentRecord) => {
      if (!deployed) {
        setStatus("Registry not deployed yet — showing local records only.");
        return;
      }
      try {
        const [wallet, expiry, revoked] = await publicClient.readContract({
          address: REGISTRY as Address,
          abi: REGISTRY_ABI,
          functionName: "agentOf",
          args: [a.sublabel],
        });
        onUpdate({
          ...a,
          wallet,
          expiry: Number(expiry),
          revoked,
          pending: false,
        });
        setStatus(`Refreshed ${a.sublabel}.aegis.eth from registry.`);
      } catch (err) {
        setStatus(`Read failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [deployed, publicClient, onUpdate]
  );

  async function revoke(a: AgentRecord) {
    if (!deployed) {
      onUpdate({ ...a, revoked: true });
      setStatus("Registry not deployed yet — marked revoked locally.");
      return;
    }
    const eth = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!eth) {
      setStatus("No window.ethereum found.");
      return;
    }
    try {
      const walletClient = createWalletClient({ chain: sepolia, transport: custom(eth as never) });
      const [account] = await walletClient.getAddresses();
      const hash = await walletClient.writeContract({
        account,
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "revokeAgent",
        args: [a.sublabel],
        chain: sepolia,
      });
      onUpdate({ ...a, revoked: true, txHash: hash });
      setStatus(`Revoked ${a.sublabel}.aegis.eth → ${hash}`);
    } catch (err) {
      setStatus(`Revoke failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <section className="panel">
      <h2>2 · Agents</h2>
      <p className="desc">Local records + onchain reads (name, wallet, expiry, revoked).</p>
      {agents.length === 0 && <div className="status">No agents yet — onboard one in panel 1.</div>}
      {agents.map((a) => (
        <div className="card" key={a.sublabel}>
          <div>
            <strong>{a.sublabel}.aegis.eth</strong>{" "}
            {a.revoked ? (
              <span className="badge bad">revoked</span>
            ) : a.pending || !deployed ? (
              <span className="badge warn">pending/local</span>
            ) : (
              <span className="badge ok">active</span>
            )}
          </div>
          <div>
            wallet <code>{a.wallet}</code>
          </div>
          <div>expiry {new Date(a.expiry * 1000).toLocaleString()}</div>
          {a.txHash && (
            <div>
              tx <code>{a.txHash}</code>
            </div>
          )}
          <div className="row">
            <button onClick={() => refresh(a)}>Refresh from registry</button>
            {!a.revoked && <button onClick={() => revoke(a)}>Revoke</button>}
          </div>
        </div>
      ))}
      <div className="status">{status}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// (3) Intel — pasted Graph intel JSON + risk score + rationale
// ---------------------------------------------------------------------------
function IntelPanel({ intel, onIntel }: { intel: IntelRecord | null; onIntel: (i: IntelRecord | null) => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");

  function parse() {
    try {
      const raw = JSON.parse(text || "{}") as Record<string, unknown>;
      const riskScore = Number(raw.riskScore ?? raw.risk_score ?? NaN);
      const rationale = String(raw.rationale ?? raw.reason ?? "");
      if (!Number.isFinite(riskScore) || !rationale) {
        setStatus("Intel JSON needs at least { riskScore: number, rationale: string }.");
        return;
      }
      onIntel({ riskScore, rationale, raw });
      setStatus(`Recorded intel — risk score ${riskScore}.`);
    } catch (err) {
      setStatus(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <section className="panel">
      <h2>3 · Intel</h2>
      <p className="desc">
        Paste The Graph intel JSON from <code>agent/</code> (Subgraph MCP → reasoning). Shows risk
        score + rationale.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"riskScore": 38, "rationale": "…", …}'
      />
      <div className="row">
        <button onClick={parse}>Display intel</button>
        <button onClick={() => setText(SAMPLE_INTEL)}>Load sample</button>
        <button onClick={() => { onIntel(null); setStatus("Cleared."); }}>Clear</button>
      </div>
      {intel && (
        <div className="card">
          <div>
            risk score{" "}
            <span className={`badge ${intel.riskScore < 50 ? "ok" : intel.riskScore < 75 ? "warn" : "bad"}`}>
              {intel.riskScore}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>{intel.rationale}</div>
          <pre style={{ marginTop: 8 }}>{JSON.stringify(intel.raw, null, 2)}</pre>
        </div>
      )}
      <div className="status">{status}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// (4) Payments — x402 receipts with HashScan links
// ---------------------------------------------------------------------------
function PaymentsPanel({
  receipts,
  onReceipts,
}: {
  receipts: Receipt[];
  onReceipts: (r: Receipt[]) => void;
}) {
  const [txId, setTxId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const id = txId.trim().replace(/^0x/, "");
    if (!/^[\da-fA-F.\-@]{3,128}$/.test(id)) {
      setStatus("Paste a Hedera tx id like 0.0.12345@1700000000.123456789.");
      return;
    }
    onReceipts([
      {
        txId: id.startsWith("0.0.") ? id : txId.trim(),
        endpoint: SIGNAL_URL || "(signal URL unset)",
        amount: amount.trim() || "(unknown)",
        at: new Date().toISOString(),
      },
      ...receipts,
    ]);
    setStatus("Receipt recorded.");
    setTxId("");
  }

  async function ping() {
    if (!SIGNAL_URL) {
      setStatus("NEXT_PUBLIC_SIGNAL_URL unset — paste the x402 receipt manually after paying via agent/.");
      return;
    }
    try {
      const res = await fetch(SIGNAL_URL, { method: "POST" });
      if (res.status === 402) setStatus("Signal service returned 402 — pay per agent/ flow, then paste the receipt.");
      else setStatus(`Signal service responded HTTP ${res.status}.`);
    } catch (err) {
      setStatus(`Ping failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <section className="panel">
      <h2>4 · Payments</h2>
      <p className="desc">
        x402 receipts for the Hedera alpha-signal service. Each links to HashScan testnet.
      </p>
      <form onSubmit={add}>
        <label>Hedera tx id (receipt)</label>
        <input value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="0.0.12345@1700000000.123456789" />
        <label>Amount (e.g. 0.5 HBAR)</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.5 HBAR" />
        <div className="row">
          <button type="submit">Add receipt</button>
          <button type="button" onClick={ping}>Ping signal service</button>
        </div>
      </form>
      {receipts.length === 0 && <div className="status">No receipts yet.</div>}
      {receipts.map((r) => (
        <div className="card" key={`${r.txId}-${r.at}`}>
          <div>
            <code>{r.txId}</code>
          </div>
          <div>
            {r.amount} · {r.endpoint} · {new Date(r.at).toLocaleString()}
          </div>
          <div>
            <a href={hashscan(r.txId)} target="_blank" rel="noreferrer">
              View on HashScan ↗
            </a>
          </div>
        </div>
      ))}
      <div className="status">{status}</div>
    </section>
  );
}
