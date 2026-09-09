"use client";

// Author: Ramprasad — AgentMarket listings: featured sentinel-1 + onboard/mint via AegisRegistry.mintAgent, refresh via agentOf, revoke; live deps Sepolia RPC/registry via viem + window.ethereum; degrades to local pending records + status hints when undeployed/offline/no wallet.
import { useCallback, useState, type FormEvent } from "react";
import {
  createWalletClient,
  custom,
  isAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import {
  DEMO_MINT_TX,
  REGISTRY,
  REGISTRY_ABI,
  isDeployed,
  sepoliaAddress,
  sepoliaTx,
  type AgentRecord,
  type PublicClientLike,
} from "./aegis";
import HireWizard, { type HireClient } from "./HireWizard";

// Sepolia chain id for Sourcify repo links.
const SEPOLIA_CHAIN_ID = 11155111;
const sourcifyContract = (a: string) =>
  `https://repo.sourcify.dev/contracts/full_match/${SEPOLIA_CHAIN_ID}/${a}`;

// Uniform per-card evidence row: Etherscan tx + address + Sourcify links.
function VerifyLine({ txHash }: { txHash?: string }) {
  return (
    <div className="verify-line">
      <a
        href={sepoliaAddress(REGISTRY)}
        target="_blank"
        rel="noreferrer"
        className="verify-primary"
      >
        Verify live onchain
      </a>{" "}
      ·{" "}
      {txHash ? (
        <a href={sepoliaTx(txHash)} target="_blank" rel="noreferrer">
          Etherscan tx ↗
        </a>
      ) : (
        <span className="muted">tx pending</span>
      )}{" "}
      ·{" "}
      <a href={sepoliaAddress(REGISTRY)} target="_blank" rel="noreferrer">
        Etherscan address ↗
      </a>{" "}
      ·{" "}
      <a href={sourcifyContract(REGISTRY)} target="_blank" rel="noreferrer">
        Sourcify contract ↗
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

  const refresh = useCallback(
    async (a: AgentRecord) => {
      if (!isDeployed) {
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
        setStatus(
          `Onchain read failed (RPC unreachable?): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    [publicClient, onUpdate]
  );

  // Live onchain check of the demo-known agent (never crashes when offline).
  async function checkSentinel() {
    if (!isDeployed) {
      setLiveCheck("Registry not deployed yet — demo-known values below.");
      return;
    }
    try {
      const [wallet, expiry, revoked] = await publicClient.readContract({
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "agentOf",
        args: ["sentinel-1"],
      });
      const ok = !revoked && Number(expiry) * 1000 > Date.now();
      setLiveCheck(
        `Live: sentinel-1 → ${wallet}, ${
          ok ? "AUTHORIZED" : "not authorized"
        } (expiry ${new Date(Number(expiry) * 1000).toLocaleDateString()}).`
      );
    } catch (err) {
      setLiveCheck(
        `Live check failed — showing demo-known values. (${
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
        functionName: "revokeAgent",
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
        Each listing is an ENSv2 subname with an expiring, revocable
        authorization. Refresh re-reads <code>agentOf</code> onchain via viem.
      </p>

      {/* Featured demo-known listing */}
      <div className="card featured" id="featured-agent">
        <div>
          <strong>sentinel-1.aegis.eth</strong>{" "}
          <span className="badge ok">authorized</span>{" "}
          <span className="badge warn">demo-known</span>
        </div>
        <div className="muted">
          Minted 2026-09-06 (90d expiry) ·{" "}
          <code>isAuthorized(deployer) → true</code> · RiskGuard{" "}
          <code>authorize(wallet, 200, 5000) → wouldPass</code>
        </div>
        <VerifyLine txHash={DEMO_MINT_TX} />
        <div className="row">
          <button onClick={checkSentinel}>Verify live onchain</button>
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
        <div className="status">
          No local listings yet — mint one above to add it to the marketplace.
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
                  <span className="badge warn">pending/local</span>
                ) : (
                  <span className="badge ok">authorized</span>
                )}
              </div>
              <div>
                wallet <code>{a.wallet}</code>
              </div>
              <div>
                expiry {new Date(a.expiry * 1000).toLocaleString()}
              </div>
              {a.txHash && (
                <div>
                  tx{" "}
                  <a
                    href={sepoliaTx(a.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>{a.txHash.slice(0, 18)}…</code> ↗
                  </a>
                </div>
              )}
              <VerifyLine txHash={a.txHash} />
              <div className="row">
                <button onClick={() => refresh(a)}>Refresh onchain</button>
                {!a.revoked && <button onClick={() => revoke(a)}>Revoke</button>}
                <button onClick={() => hire(a)}>Hire</button>
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
    const expiry =
      Math.floor(Date.now() / 1000) + Math.max(1, Number(days) || 90) * 86400;

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
        args: [label, wallet as Address, BigInt(expiry)],
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
    <form onSubmit={mint} className="card">
      <strong>List a new agent</strong>
      <div className="muted">
        Mints <code>sublabel.aegis.eth</code> via{" "}
        <code>AegisRegistry.mintAgent</code> (Sepolia, window.ethereum).
      </div>
      <label>Sublabel (→ *.aegis.eth)</label>
      <input
        value={sublabel}
        onChange={(e) => setSublabel(e.target.value)}
        placeholder="sentinel-2"
      />
      <label>Agent wallet (0x…)</label>
      <input
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        placeholder="0x…"
      />
      <label>Authorization expiry (days)</label>
      <input
        value={days}
        onChange={(e) => setDays(e.target.value)}
        inputMode="numeric"
      />
      <button type="submit" disabled={busy}>
        {busy ? "Minting…" : isDeployed ? "Mint + list agent" : "List locally (no registry)"}
      </button>
      <div className="status">{status}</div>
    </form>
  );
}
