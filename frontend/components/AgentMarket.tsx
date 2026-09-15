"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  keccak256,
  stringToBytes,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { Badge } from "@/components/Badge";
import { BrandButton } from "@/components/BrandButton";
import {
  DEMO_MINT_TX,
  LS_AGENTS,
  REGISTRY,
  REGISTRY_ABI,
  SEPOLIA_RPC,
  isDeployed,
  type AgentRecord,
  type PublicClientLike,
} from "./aegis";
import { AEGIS_REGISTRY, ETHERSCAN_ADDR, ETHERSCAN_TX, shortAddr } from "@/lib/site";
import { loadScoped, saveScoped, useVaultUserId, useVaultWallets } from "@/lib/vault";

export type AgentMarketProps = {
  agents?: AgentRecord[];
  publicClient?: PublicClientLike;
  onMinted?: (a: AgentRecord) => void;
  onUpdate?: (a: AgentRecord) => void;
};

export function AgentMarket({
  agents: propAgents,
  publicClient: propClient,
  onMinted: propOnMinted,
  onUpdate: propOnUpdate,
}: AgentMarketProps = {}) {
  const userId = useVaultUserId();
  const wallets = useVaultWallets();
  const [internalAgents, setInternalAgents] = useState<AgentRecord[]>([]);

  async function getProvider(): Promise<unknown> {
    const w = (wallets?.[0] ?? null) as unknown as {
      getEthereumProvider?: () => Promise<unknown>;
    } | null;
    if (w?.getEthereumProvider) {
      try {
        return await w.getEthereumProvider();
      } catch {
        /* fall through to window.ethereum */
      }
    }
    return (window as unknown as { ethereum?: unknown }).ethereum;
  }
  const [status, setStatus] = useState("");
  const [liveCheck, setLiveCheck] = useState("");
  const [open, setOpen] = useState(false);
  const [sublabel, setSublabel] = useState("");
  const [wallet, setWallet] = useState("");
  const [days, setDays] = useState("90");

  const isControlled = propAgents !== undefined;
  const agents = isControlled ? propAgents : internalAgents;

  useEffect(() => {
    if (!isControlled) {
      setInternalAgents(loadScoped<AgentRecord[]>(userId, LS_AGENTS, []));
    }
  }, [isControlled, userId]);

  const defaultPublicClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: http(SEPOLIA_RPC),
      }),
    []
  );

  const publicClient = propClient || (defaultPublicClient as unknown as PublicClientLike);

  function handleMinted(agent: AgentRecord) {
    if (propOnMinted) {
      propOnMinted(agent);
    } else {
      setInternalAgents((prev) => {
        const next = [agent, ...prev.filter((x) => x.sublabel !== agent.sublabel)];
        saveScoped(userId, LS_AGENTS, next);
        return next;
      });
    }
  }

  function handleUpdate(agent: AgentRecord) {
    if (propOnUpdate) {
      propOnUpdate(agent);
    } else {
      setInternalAgents((prev) => {
        const next = prev.map((x) => (x.sublabel === agent.sublabel ? agent : x));
        saveScoped(userId, LS_AGENTS, next);
        return next;
      });
    }
  }

  // Live onchain check of the featured agent via Viem
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

  // Live onchain revoke via Viem
  async function revoke(a: AgentRecord) {
    if (!isDeployed) {
      handleUpdate({ ...a, revoked: true });
      setStatus("Registry not deployed yet — marked revoked locally.");
      return;
    }
    const provider = await getProvider();
    if (!provider) {
      handleUpdate({ ...a, revoked: true });
      setStatus("No wallet found — connect a wallet or sign in with Privy to revoke onchain.");
      return;
    }
    try {
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
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
      handleUpdate({ ...a, revoked: true, txHash: hash });
      setStatus(`Revoked ${a.sublabel}.aegis.eth → ${hash}`);
    } catch (err) {
      setStatus(
        `Revoke failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Mint / List agent
  async function mint(e: FormEvent) {
    e.preventDefault();
    const label = sublabel.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,32}$/.test(label)) {
      setStatus("Name must be 1–32 characters: a–z, 0–9, hyphen.");
      return;
    }
    if (!isAddress(wallet.trim())) {
      setStatus("Wallet must be a valid 0x address.");
      return;
    }
    const expirySec = Math.floor(Date.now() / 1000) + Math.max(1, Number(days) || 90) * 86400;

    const provider = await getProvider();
    if (provider && isDeployed) {
      try {
        const walletClient = createWalletClient({
          chain: sepolia,
          transport: custom(provider as never),
        });
        const [account] = await walletClient.getAddresses();
        if (account) {
          const hash = await walletClient.writeContract({
            account,
            address: REGISTRY as Address,
            abi: REGISTRY_ABI,
            functionName: "mintAgent",
            args: [label, wallet.trim() as Address, BigInt(Math.max(1, Number(days) || 90))],
            chain: sepolia,
          });
          const rec: AgentRecord = {
            sublabel: label,
            wallet: wallet.trim(),
            expiry: expirySec,
            txHash: hash,
            pending: false,
          };
          handleMinted(rec);
          setStatus(`Minted ${label}.aegis.eth onchain → ${hash}`);
          setSublabel("");
          setWallet("");
          setOpen(false);
          return;
        }
      } catch {
        // Fall back to saving locally as pending
      }
    }

    const rec: AgentRecord = {
      sublabel: label,
      wallet: wallet.trim(),
      expiry: expirySec,
      pending: true,
    };
    handleMinted(rec);
    setStatus(`${label}.aegis.eth saved to vault as pending.`);
    setSublabel("");
    setWallet("");
    setOpen(false);
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <a
          className="font-label text-[11px] uppercase tracking-[0.12em] text-fg-muted underline underline-offset-4 hover:text-accent transition-colors"
          href={`${ETHERSCAN_ADDR}/${AEGIS_REGISTRY}`}
          target="_blank"
          rel="noreferrer"
        >
          Registry {shortAddr(AEGIS_REGISTRY)}
        </a>
      </div>

      {/* Roster cards live on /agents above. This section is identity tools. */}

      {/* Featured sentinel-1 card */}
      <div className="mt-6 rounded-xl border border-border bg-bg-elevated p-6 shadow-lift sm:p-8">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-medium text-ink">sentinel-1.aegis.eth</p>
                <p className="mt-1 font-sans text-[14px] text-fg-muted">
                  Minted Sep 6, 2026 · 90-day expiry · RiskGuard verified
                </p>
              </div>
              <Badge tone="ok">authorized</Badge>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                className="inline-flex h-11 items-center border border-ink/80 px-4 font-label text-[11px] uppercase tracking-[0.14em] hover:bg-ink hover:text-bg transition-colors"
                href={`${ETHERSCAN_TX}/${DEMO_MINT_TX}`}
                target="_blank"
                rel="noreferrer"
              >
                Verified on Etherscan ↗
              </a>
              <BrandButton variant="ghost" onClick={checkSentinel} className="h-11 px-4">
                Verify onchain
              </BrandButton>
              <BrandButton href="/hire?agent=sentry" className="h-11 px-5">
                Hire Sentry
              </BrandButton>
            </div>
            {liveCheck && (
              <p className="mt-3 font-label text-xs tracking-wide text-fg-body border-l-2 border-accent pl-3">
                {liveCheck}
              </p>
            )}
          </div>
      </div>

      {/* Onboard form toggle */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="m-0 font-label text-[11px] uppercase tracking-[0.14em] text-fg-muted underline underline-offset-4 hover:text-accent transition-colors"
        >
          {open ? "− Hide listing form" : "+ List a new agent"}
        </button>
        {open && (
          <form onSubmit={mint} className="mt-4 grid gap-4 border border-border bg-bg-elevated p-6 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">Subname (.aegis.eth)</span>
              <input
                value={sublabel}
                onChange={(e) => setSublabel(e.target.value)}
                placeholder="sentinel-2"
                className="mt-2 h-11 w-full border border-border bg-bg px-3 text-fg outline-none focus:border-accent"
                required
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">Worker Wallet</span>
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x…"
                className="mt-2 h-11 w-full border border-border bg-bg px-3 font-label text-sm text-fg outline-none focus:border-accent"
                required
              />
            </label>
            <label className="block sm:col-span-1">
              <span className="font-label text-[10px] uppercase tracking-[0.14em] text-fg-muted">Expiry (days)</span>
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                type="number"
                min="1"
                max="365"
                className="mt-2 h-11 w-full border border-border bg-bg px-3 text-fg outline-none focus:border-accent"
              />
            </label>
            <div className="sm:col-span-3 pt-2">
              <BrandButton type="submit">List agent</BrandButton>
            </div>
          </form>
        )}
      </div>

      {/* User's custom listed agents */}
      {agents.length > 0 && (
        <div className="mt-8">
          <p className="font-label text-[11px] uppercase tracking-[0.16em] text-fg-muted">Your listed agents</p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => {
              const expired = a.expiry * 1000 <= Date.now();
              const tone = a.revoked || expired ? "bad" : a.pending ? "warn" : "ok";
              const label = a.revoked ? "revoked" : expired ? "expired" : a.pending ? "pending" : "authorized";
              return (
                <li key={a.sublabel} className="border border-border bg-bg-elevated p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-lg font-medium text-ink">{a.sublabel}.aegis.eth</p>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <p className="mt-2 font-display text-sm text-fg-muted">
                    Expires {new Date(a.expiry * 1000).toLocaleDateString()}
                  </p>
                  {a.wallet && (
                    <p className="mt-1 font-label text-xs text-fg-muted">
                      {shortAddr(a.wallet)}
                    </p>
                  )}
                  {!a.revoked && (
                    <div className="mt-5 flex gap-2">
                      <BrandButton href={`/hire?agent=${a.sublabel}`} className="h-10 px-4">
                        Hire
                      </BrandButton>
                      <BrandButton variant="ghost" className="h-10 px-4" onClick={() => revoke(a)}>
                        Revoke
                      </BrandButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {status && <p className="mt-4 font-label text-xs text-fg-muted">{status}</p>}
    </div>
  );
}

export default AgentMarket;
