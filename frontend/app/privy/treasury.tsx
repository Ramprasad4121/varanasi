"use client";

// Author: Ramprasad — Privy treasury dashboard: login + embedded-wallet mint/fund/revoke vs allowance with ops log; live deps Privy SDK, Sepolia RPC/registry (ABI verified vs contracts/src/AegisRegistry.sol); degrades to local-mode ledger + pending when registry/RPC unreachable.
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import Link from "next/link";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  keccak256,
  parseEther,
  stringToBytes,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { loadScoped, saveScoped } from "../../lib/vault";

// ---------------------------------------------------------------------------
// Env + constants
// ---------------------------------------------------------------------------
const REGISTRY = (process.env.NEXT_PUBLIC_AEGIS_REGISTRY ?? "") as string;
const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "";
const ZERO = "0x0000000000000000000000000000000000000000";
const registryDeployed = Boolean(REGISTRY) && REGISTRY.toLowerCase() !== ZERO;
const SEPOLIA_ID = 11155111;
const FUND_ETH = "0.01"; // "Fund agent" — plain SepoliaETH transfer to agent wallet
const TASK_ETH = "0.005"; // "Approve TASK" — task-budget transfer, counts vs allowance
const DEFAULT_ALLOWANCE_ETH = "0.05";

// Verified against contracts/src/AegisRegistry.sol (do NOT copy the stale ABI
// in app/page.tsx: real mint takes expiry DAYS, revoke-by-label is
// revokeAgentByLabel, and there is no agentOf(string) — reads go through
// tokenByLabelHash / tokenByAgent / expiry / revoked / isAuthorized).
const REGISTRY_ABI = [
  {
    inputs: [
      { name: "sublabel", type: "string" },
      { name: "agentWallet", type: "address" },
      { name: "expiryDays", type: "uint256" },
    ],
    name: "mintAgent",
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "sublabel", type: "string" }],
    name: "revokeAgentByLabel",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "tokenByLabelHash",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "tokenByAgent",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "expiry",
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "revoked",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "agentWallet", type: "address" }],
    name: "isAuthorized",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
// Local org ledger (B2B flavor: owner sets allowance, operators spend vs it)
// ---------------------------------------------------------------------------
type Role = "owner" | "operator";
type AgentLedger = {
  sublabel: string;
  wallet: string;
  allowanceEth: string;
  fundedEth: string;
  revoked?: boolean;
  pending?: boolean; // true while registry undeployed / tx unconfirmed onchain
};
type Op = { at: string; kind: string; detail: string; txHash?: string };

const LS_LEDGER = "aegis.privy.ledger";
const LS_OPS = "aegis.privy.ops";
const LS_ROLE = "aegis.privy.role";

// ---------------------------------------------------------------------------
// Treasury dashboard
// ---------------------------------------------------------------------------
export default function Treasury() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const wallet = wallets[0] ?? null; // embedded wallet (auto-created on login)
  const userId = authenticated ? user?.id : undefined;

  const [ledger, setLedger] = useState<AgentLedger[]>([]);
  const [ops, setOps] = useState<Op[]>([]);
  const [role, setRole] = useState<Role>("owner");
  const [hydrated, setHydrated] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // Mint form
  const [sublabel, setSublabel] = useState("");
  const [agentWallet, setAgentWallet] = useState("");
  const [days, setDays] = useState("90");

  useEffect(() => {
    setHydrated(false);
    setLedger(loadScoped<AgentLedger[]>(userId, LS_LEDGER, []));
    setOps(loadScoped<Op[]>(userId, LS_OPS, []));
    setRole(loadScoped<Role>(userId, LS_ROLE, "owner"));
    setHydrated(true);
  }, [userId]);
  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_LEDGER, ledger);
  }, [ledger, hydrated, userId]);
  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_OPS, ops);
  }, [ops, hydrated, userId]);
  useEffect(() => {
    if (hydrated) saveScoped(userId, LS_ROLE, role);
  }, [role, hydrated, userId]);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: SEPOLIA_RPC ? http(SEPOLIA_RPC) : http(),
      }),
    []
  );

  const log = useCallback((kind: string, detail: string, txHash?: string) => {
    setOps((prev) => [{ at: new Date().toISOString(), kind, detail, txHash }, ...prev].slice(0, 50));
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!wallet) {
      setBalance(null);
      return;
    }
    try {
      const b = await publicClient.getBalance({ address: wallet.address as Address });
      setBalance(formatEther(b));
    } catch {
      setBalance(null);
    }
  }, [wallet, publicClient]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  // All writes go through the embedded wallet: pin Sepolia first (hides chain
  // UX), then one Privy signature prompt per action.
  async function sendViaPrivy(to: Address, valueEth?: string, data?: `0x${string}`) {
    if (!wallet) throw new Error("No Privy wallet — log in first.");
    await wallet.switchChain(SEPOLIA_ID);
    const { hash } = await sendTransaction({
      to,
      chainId: SEPOLIA_ID,
      ...(valueEth ? { value: parseEther(valueEth) } : {}),
      ...(data ? { data } : {}),
    });
    return hash;
  }

  // -- Mint agent: human authorizes (owner only, registry required) ----------
  async function mint(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    if (role !== "owner") {
      setStatus("Operators can't mint — switch to the owner role.");
      return;
    }
    const label = sublabel.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/.test(label)) {
      setStatus("Sublabel must be 1–32 chars: a–z, 0–9, hyphen.");
      return;
    }
    if (!isAddress(agentWallet)) {
      setStatus("Agent wallet is not a valid 0x address.");
      return;
    }
    const expiryDays = Math.max(1, Number(days) || 90);
    if (!registryDeployed) {
      setLedger((prev) => [
        {
          sublabel: label,
          wallet: agentWallet,
          allowanceEth: DEFAULT_ALLOWANCE_ETH,
          fundedEth: "0",
          pending: true,
        },
        ...prev.filter((x) => x.sublabel !== label),
      ]);
      log("mint (pending)", `${label}.aegis.eth — registry undeployed, saved locally`);
      setStatus(`Registry not deployed — saved "${label}.aegis.eth" as pending.`);
      return;
    }
    setBusy(true);
    try {
      const data = encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "mintAgent",
        args: [label, agentWallet as Address, BigInt(expiryDays)],
      });
      const hash = await sendViaPrivy(REGISTRY as Address, undefined, data);
      setLedger((prev) => [
        {
          sublabel: label,
          wallet: agentWallet,
          allowanceEth: DEFAULT_ALLOWANCE_ETH,
          fundedEth: "0",
        },
        ...prev.filter((x) => x.sublabel !== label),
      ]);
      log("mint", `${label}.aegis.eth → ${agentWallet} (${expiryDays}d)`, hash);
      setStatus(`Minted ${label}.aegis.eth → ${hash}`);
      setSublabel("");
      void refreshBalance();
    } catch (err) {
      setStatus(`Mint failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // -- Fund / approve-task: plain ETH transfer vs the allowance -------------
  async function spend(a: AgentLedger, amountEth: string, kind: "fund" | "task") {
    setStatus("");
    if (a.revoked) {
      setStatus(`${a.sublabel}.aegis.eth is revoked — funding blocked.`);
      return;
    }
    const funded = Number(a.fundedEth) || 0;
    const allowance = Number(a.allowanceEth) || 0;
    if (funded + Number(amountEth) > allowance) {
      setStatus(
        `Would exceed allowance (${funded} + ${amountEth} > ${allowance} ETH). Owner: raise it below.`
      );
      return;
    }
    if (registryDeployed && !a.pending) {
      try {
        const ok = (await publicClient.readContract({
          address: REGISTRY as Address,
          abi: REGISTRY_ABI,
          functionName: "isAuthorized",
          args: [a.wallet as Address],
        })) as boolean;
        if (!ok) {
          setStatus("Registry says this agent is not authorized — mint/refresh it first.");
          return;
        }
      } catch {
        /* read failed (e.g. no RPC) — proceed; the transfer itself is the demo */
      }
    }
    setBusy(true);
    try {
      const hash = await sendViaPrivy(a.wallet as Address, amountEth);
      const fundedEth = String(funded + Number(amountEth));
      setLedger((prev) => prev.map((x) => (x.sublabel === a.sublabel ? { ...x, fundedEth } : x)));
      log(kind, `${amountEth} ETH → ${a.sublabel}.aegis.eth`, hash);
      setStatus(`${kind === "fund" ? "Funded" : "Task approved"}: ${amountEth} ETH → ${hash}`);
      void refreshBalance();
    } catch (err) {
      setStatus(`Transfer failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // -- Revoke: kill the identity (owner only) ---------------------------------
  async function revoke(a: AgentLedger) {
    setStatus("");
    if (role !== "owner") {
      setStatus("Operators can't revoke — switch to the owner role.");
      return;
    }
    if (!registryDeployed || a.pending) {
      setLedger((prev) => prev.map((x) => (x.sublabel === a.sublabel ? { ...x, revoked: true } : x)));
      log("revoke (local)", `${a.sublabel}.aegis.eth marked revoked`);
      setStatus("Registry not deployed — marked revoked locally.");
      return;
    }
    setBusy(true);
    try {
      const data = encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "revokeAgentByLabel",
        args: [a.sublabel],
      });
      const hash = await sendViaPrivy(REGISTRY as Address, undefined, data);
      setLedger((prev) => prev.map((x) => (x.sublabel === a.sublabel ? { ...x, revoked: true } : x)));
      log("revoke", `${a.sublabel}.aegis.eth`, hash);
      setStatus(`Revoked ${a.sublabel}.aegis.eth → ${hash}`);
      void refreshBalance();
    } catch (err) {
      setStatus(`Revoke failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // -- Sync one row from the registry ------------------------------------------
  async function sync(a: AgentLedger) {
    setStatus("");
    if (!registryDeployed) {
      setStatus("Registry not deployed yet — showing local ledger only.");
      return;
    }
    try {
      const tokenId = (await publicClient.readContract({
        address: REGISTRY as Address,
        abi: REGISTRY_ABI,
        functionName: "tokenByLabelHash",
        args: [keccak256(stringToBytes(a.sublabel))],
      })) as bigint;
      if (tokenId === BigInt(0)) {
        setStatus(`${a.sublabel}.aegis.eth is not onchain yet.`);
        return;
      }
      const [rev, exp] = await Promise.all([
        publicClient.readContract({
          address: REGISTRY as Address,
          abi: REGISTRY_ABI,
          functionName: "revoked",
          args: [tokenId],
        }),
        publicClient.readContract({
          address: REGISTRY as Address,
          abi: REGISTRY_ABI,
          functionName: "expiry",
          args: [tokenId],
        }),
      ]);
      const expired = Number(exp) * 1000 < Date.now();
      setLedger((prev) =>
        prev.map((x) =>
          x.sublabel === a.sublabel
            ? { ...x, revoked: (rev as boolean) || expired, pending: false }
            : x
        )
      );
      setStatus(`Synced ${a.sublabel}.aegis.eth (token #${tokenId.toString()}).`);
    } catch (err) {
      setStatus(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function raiseAllowance(a: AgentLedger, v: string) {
    if (role !== "owner") {
      setStatus("Operators can't change allowances — switch to the owner role.");
      return;
    }
    if (!(Number(v) >= 0)) return;
    setLedger((prev) => prev.map((x) => (x.sublabel === a.sublabel ? { ...x, allowanceEth: v } : x)));
    log("allowance", `${a.sublabel}.aegis.eth allowance → ${v} ETH`);
  }

  if (!ready) return <div className="panel">Loading Privy…</div>;

  return (
    <section className="wrap" style={{ paddingTop: 48, paddingBottom: 72 }}>
      <div className="section-intro" style={{ padding: 0 }}>
        <p className="hero-kicker">Treasury</p>
        <h2>
          <span className="sr-only">Manage your agents and funds</span>
          <span aria-hidden="true">
            <span className="drop-cap">M</span>
            anage your agents and funds
          </span>
        </h2>
        <p>
          Mint identities, set allowances, fund agents, and revoke access —
          all from one embedded wallet.
        </p>
      </div>

      {!registryDeployed && (
        <div className="panel" style={{ marginTop: 24, marginBottom: 16 }}>
          <span className="badge warn">treasury in local mode</span>{" "}
          <span className="envline">
            <code>NEXT_PUBLIC_AEGIS_REGISTRY</code> unset — funding still works as plain
            transfers; mint/revoke sync after deploy.
          </span>
        </div>
      )}
      <div className="grid" style={{ marginTop: 24 }}>
        <section className="panel">
          <h2>1 · Sign in</h2>
          <p className="desc">
            Email or social login creates a self-custodial embedded wallet — no seed
            phrase, no extension. That wallet is the org treasury signer.
          </p>
          {!authenticated ? (
            <button className="btn-solid" onClick={() => void login()}>Log in with Privy</button>
          ) : (
            <>
              <div>
                treasury <code>{wallet?.address ?? "(creating wallet…)"}</code>
              </div>
              <div>
                Balance{" "}
                <code>{balance === null ? "(loading — fund the address first)" : `${balance} ETH`}</code>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={() => void refreshBalance()}>Refresh balance</button>
                <button onClick={() => void logout()}>Log out</button>
              </div>
              <label style={{ marginTop: 12 }}>
                Team role (B2B: owner approves, operator runs)
              </label>
              <div className="row">
                {(["owner", "operator"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={role === r}
                    onClick={() => setRole(r)}
                  >
                    {r === role ? `✓ ${r}` : `Switch to ${r}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>2 · Authorize agent</h2>
          <p className="desc">
            Owner mints <code>sublabel.aegis.eth</code> and sets a spend allowance. One click, one
            Privy signature — ENS identity + budget in a single financial flow.
          </p>
          <form onSubmit={(e) => void mint(e)}>
            <label>Sublabel (→ *.aegis.eth)</label>
            <input
              value={sublabel}
              onChange={(e) => setSublabel(e.target.value)}
              placeholder="sentinel-1"
            />
            <label>Agent wallet (0x…)</label>
            <input
              value={agentWallet}
              onChange={(e) => setAgentWallet(e.target.value)}
              placeholder="0x…"
            />
            <label>Authorization (days)</label>
            <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
            <button type="submit" disabled={busy || !authenticated}>
              {busy ? "Signing…" : "Mint agent + set 0.05 ETH allowance"}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>3 · Treasury ops</h2>
          <p className="desc">
            Fund agents, approve per-task spend, revoke access. Every action is one embedded-wallet
            signature — onchain complexity hidden behind treasury buttons.
          </p>
          {ledger.length === 0 && <div className="status">No agents yet — authorize one above.</div>}
          {ledger.map((a) => {
            const funded = Number(a.fundedEth) || 0;
            const allowance = Number(a.allowanceEth) || 0;
            const pct = allowance > 0 ? Math.min(100, Math.round((funded / allowance) * 100)) : 0;
            return (
              <div className="card" key={a.sublabel}>
                <div>
                  <strong>{a.sublabel}.aegis.eth</strong>{" "}
                  {a.revoked ? (
                    <span className="badge bad">revoked</span>
                  ) : a.pending || !registryDeployed ? (
                    <span className="badge warn">pending/local</span>
                  ) : (
                    <span className="badge ok">authorized</span>
                  )}
                </div>
                <div>
                  wallet <code>{a.wallet}</code>
                </div>
                <div>
                  spent {funded} / {allowance} ETH ({pct}%)
                </div>
                <div
                  style={{ background: "#eee", borderRadius: 4, height: 8, margin: "6px 0" }}
                >
                  <div style={{ width: `${pct}%`, background: "#4caf50", height: 8, borderRadius: 4 }} />
                </div>
                <div className="row">
                  <button disabled={busy || !authenticated} onClick={() => void spend(a, FUND_ETH, "fund")}>
                    Fund {FUND_ETH} ETH
                  </button>
                  <button disabled={busy || !authenticated} onClick={() => void spend(a, TASK_ETH, "task")}>
                    Approve task {TASK_ETH}
                  </button>
                  {!a.revoked && (
                    <button disabled={busy || !authenticated} onClick={() => void revoke(a)}>
                      Revoke
                    </button>
                  )}
                  <button disabled={!authenticated} onClick={() => void sync(a)}>
                    Sync
                  </button>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <input
                    aria-label="allowance"
                    value={a.allowanceEth}
                    inputMode="decimal"
                    onChange={(e) => raiseAllowance(a, e.target.value)}
                    style={{ maxWidth: 120 }}
                  />
                  <span className="envline">allowance (ETH, owner only)</span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <h2>4 · Receipts</h2>
          <p className="desc">Treasury ops log — every fund / approval / revoke with its tx hash.</p>
          {ops.length === 0 && <div className="status">No ops yet.</div>}
          {ops.map((o) => (
            <div className="card" key={`${o.at}-${o.kind}-${o.detail}`}>
              <div>
                <strong>{o.kind}</strong> · {new Date(o.at).toLocaleString()}
              </div>
              <div>{o.detail}</div>
              {o.txHash && (
                <div>
                  tx{" "}
                  <a
                    href={`https://sepolia.etherscan.io/tx/${o.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>{o.txHash}</code> ↗
                  </a>
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
      <div className="status" style={{ marginTop: 8 }}>
        {status || "Sign in, authorize an agent, then fund it — all from the embedded wallet."}
      </div>
      <p className="envline" style={{ marginTop: 8 }}>
        <Link href="/">← Back to the varanasi dashboard</Link>
      </p>
    </section>
  );
}
