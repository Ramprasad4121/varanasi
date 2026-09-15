/* eslint-disable @typescript-eslint/no-explicit-any */
// Author: Ramprasad — guided Hire wizard: pick archetype → terms → Authorize & fund (sign + mint + approve + fund in one click, Sepolia TaskEscrow, Privy/window.ethereum signer) → track; live deps Sepolia RPC/escrow/vUSD; degrades with saved values + connect hints, never crashes.
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeAbiParameters,
  encodeFunctionData,
  hashTypedData,
  http,
  isAddress,
  keccak256,
  parseUnits,
  formatUnits,
  type Address,
  type Hash,
} from "viem";
import { sepolia } from "viem/chains";
import {
  usePrivy as usePrivyHook,
  useWallets as useWalletsHook,
} from "@privy-io/react-auth";
import { BrandButton } from "@/components/BrandButton";
import { AlertCircle, Check, Coins, ExternalLink, Wallet } from "lucide-react";
import {
  REGISTRY,
  REGISTRY_ABI,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_RPC,
  TASK_ESCROW,
  VUSD,
  isDeployed,
  sepoliaAddress,
  sepoliaTx,
  type AgentRecord,
} from "./aegis";
import { rememberHire } from "../lib/vault";
import { AGENTS as ROSTER, agentById, type CatalogAgent } from "../lib/agents";
import { JobRunner } from "./JobRunner";
const DEMO_TASK_ID =
  "0x03c850258e7ec98a7034e95103d1afe27a4b334a09a238041cba86cadba554dc";
const DEMO_FUND_TX =
  "0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572";
const DEMO_RELEASE_TX =
  "0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702";

// Structural client: accepts the page's viem public client (reads + receipts).
export type HireClient = {
  readContract: (args: never) => Promise<unknown>;
  waitForTransactionReceipt?: (args: {
    hash: Hash;
  }) => Promise<unknown>;
};

const ARCHETYPES = ROSTER.map((a) => ({
  key: a.id,
  label: a.name,
  does: a.does,
  cost: `Suggested cap ${a.cap} vUSD`,
  defaultCap: a.cap,
  defaultWindow: a.window,
  defaultExpiry: a.expiry,
  demoWallet: a.demoWallet,
}));

type ArchKey = string;

// --- Minimal ABIs (mirror agent/src/escrow.ts TaskEscrow subset) ---
const ESCROW_ABI = [
  {
    inputs: [
      {
        name: "m",
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "merchant", type: "address" },
          { name: "token", type: "address" },
          { name: "cap", type: "uint256" },
          { name: "windowStart", type: "uint64" },
          { name: "windowEnd", type: "uint64" },
          { name: "expiry", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "chainId", type: "uint256" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    name: "fund",
    outputs: [{ name: "taskId", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "bytes32" }],
    name: "taskState",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "bytes32" }],
    name: "tasks",
    outputs: [
      { name: "payer", type: "address" },
      { name: "agent", type: "address" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "cap", type: "uint256" },
      { name: "fundedAmount", type: "uint256" },
      { name: "windowStart", type: "uint64" },
      { name: "windowEnd", type: "uint64" },
      { name: "expiry", type: "uint64" },
      { name: "scoreBps", type: "uint256" },
      { name: "validator", type: "address" },
      { name: "pinnedThresholdBps", type: "uint256" },
      { name: "pinnedValidator", type: "address" },
      { name: "state", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "bytes32" }],
    name: "release",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "taskId", type: "bytes32" }],
    name: "refund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const MANDATE_TYPES: Record<string, { name: string; type: string }[]> = {
  Mandate: [
    { name: "agent", type: "address" },
    { name: "merchant", type: "address" },
    { name: "token", type: "address" },
    { name: "cap", type: "uint256" },
    { name: "windowStart", type: "uint64" },
    { name: "windowEnd", type: "uint64" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
    { name: "chainId", type: "uint256" },
  ],
};

const TASK_STATES = [
  "None",
  "Funded",
  "Validated",
  "Released",
  "Refunded",
  "Cancelled",
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

type PrivySoft = {
  authenticated?: boolean;
  login?: () => void;
  user?: { id?: string };
};

export function HireWizard({
  publicClient,
  externalAgent,
  initialAgent,
}: {
  publicClient?: HireClient;
  externalAgent?: AgentRecord | null;
  initialAgent?: string | null;
}) {
  const defaultClient = useMemo(
    () =>
      createPublicClient({
        chain: sepolia,
        transport: http(SEPOLIA_RPC),
      }),
    []
  );
  const client = publicClient || (defaultClient as any as HireClient);
  // Layout mounts PrivyProvider when an App ID is set. Without one we skip
  // the hooks entirely and use the MetaMask-only path.
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <HireWizardInner
        publicClient={client}
        externalAgent={externalAgent}
        initialAgent={initialAgent}
        privy={{}}
        wallets={[]}
      />
    );
  }
  return (
    <HireWizardWithPrivy
      publicClient={client}
      externalAgent={externalAgent}
      initialAgent={initialAgent}
    />
  );
}

export default HireWizard;

function HireWizardWithPrivy({
  publicClient,
  externalAgent,
  initialAgent,
}: {
  publicClient: HireClient;
  externalAgent?: AgentRecord | null;
  initialAgent?: string | null;
}) {
  const privy = usePrivyHook() as any as PrivySoft;
  const { wallets } = useWalletsHook() as any as { wallets?: any[] };
  return (
    <HireWizardInner
      publicClient={publicClient}
      externalAgent={externalAgent}
      initialAgent={initialAgent}
      privy={privy}
      wallets={wallets ?? []}
    />
  );
}

function randomNonce(): bigint {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return BigInt(`0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
}

function HireWizardInner({
  publicClient,
  externalAgent,
  initialAgent,
  privy,
  wallets,
}: {
  publicClient: HireClient;
  externalAgent?: AgentRecord | null;
  initialAgent?: string | null;
  privy: PrivySoft;
  wallets: any[];
}) {

  const [step, setStep] = useState(1);
  const [arch, setArch] = useState<ArchKey>("scout");
  const [capVusd, setCapVusd] = useState("10");
  const [windowHours, setWindowHours] = useState("24");
  const [expiryDays, setExpiryDays] = useState("7");
  const [merchant, setMerchant] = useState("");
  const [agentAddr, setAgentAddr] = useState<string>(ARCHETYPES[0].demoWallet);
  const [sublabel, setSublabel] = useState("hire-scout");
  const [agentTouched, setAgentTouched] = useState(false);

  // Frozen when entering step 3 so the signed JSON is exact, not drifting.
  const [anchorSec, setAnchorSec] = useState<number | null>(null);
  const [nonce, setNonce] = useState<bigint>(BigInt(0));

  const [account, setAccount] = useState("");
  const [sig, setSig] = useState<Hash | null>(null);
  const [taskId, setTaskId] = useState("");
  const [mintTx, setMintTx] = useState("");
  const [mintOk, setMintOk] = useState(false);
  const [skipMint, setSkipMint] = useState(false);
  const [approveTx, setApproveTx] = useState("");
  const [approveOk, setApproveOk] = useState(false);
  const [fundTx, setFundTx] = useState("");
  const [fundOk, setFundOk] = useState(false);

  const [trackId, setTrackId] = useState("");
  const [trackLabel, setTrackLabel] = useState<string | null>(null);
  const [trackDetail, setTrackDetail] = useState("");
  const [settleTx, setSettleTx] = useState("");

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [status, setStatus] = useState("");
  const [hasMetaMask, setHasMetaMask] = useState(false);
  const [vusdBalance, setVusdBalance] = useState<string | null>(null);
  const [needsVusdMint, setNeedsVusdMint] = useState(false);

  // A Hire button on a market card pre-fills agent wallet + sublabel.
  useEffect(() => {
    if (!externalAgent) return;
    if (isAddress(externalAgent.wallet)) {
      setAgentAddr(externalAgent.wallet);
      setAgentTouched(true);
    }
    setSublabel(`hire-${externalAgent.sublabel.slice(0, 24)}`);
  }, [externalAgent]);

  useEffect(() => {
    if (!initialAgent) return;
    const lower = initialAgent.toLowerCase();
    const found = agentById(lower);
    if (found) {
      pickArch(found.id);
    } else {
      setSublabel(lower.slice(0, 32));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgent]);

  function pickArch(key: ArchKey) {
    setArch(key);
    const a = ARCHETYPES.find((x) => x.key === key);
    if (!a) return;
    setCapVusd(a.defaultCap);
    setWindowHours(a.defaultWindow);
    setExpiryDays(a.defaultExpiry);
    setSublabel(`hire-${key}`);
    if (!agentTouched) setAgentAddr(a.demoWallet);
  }

  // --- Live validation (plain words) ---
  const errors = useMemo(() => {
    const e: string[] = [];
    let cap: bigint | null = null;
    try {
      cap = parseUnits(capVusd.trim() || "0", 6);
      if (cap <= BigInt(0)) e.push("Cap must be more than 0 vUSD.");
    } catch {
      e.push("Cap must be a number like 10 or 2.5 (vUSD).");
    }
    const wh = Number(windowHours);
    if (!Number.isFinite(wh) || wh < 1 || wh > 720)
      e.push("Window must be 1–720 hours (how long validators may score).");
    const ed = Number(expiryDays);
    if (!Number.isFinite(ed) || ed < 1 || ed > 366)
      e.push("Expiry must be 1–366 days (refunds open after this).");
    if (Number.isFinite(wh) && Number.isFinite(ed) && wh * 3600 > ed * 86400)
      e.push("Window must fit inside expiry (shorten the window or extend expiry).");
    if (!isAddress(agentAddr) || agentAddr.toLowerCase() === ZERO)
      e.push("Agent address must be a valid non-zero 0x address.");
    if (!isAddress(merchant)) e.push("Payout address must be a valid 0x address.");
    else if (merchant.toLowerCase() === agentAddr.toLowerCase())
      e.push("Payout address must differ from the agent address.");
    return e;
  }, [capVusd, windowHours, expiryDays, agentAddr, merchant]);

  // --- Mandate preview (exact once anchorSec + nonce freeze on step 3) ---
  const mandate = useMemo(() => {
    const now = anchorSec ?? Math.floor(Date.now() / 1000);
    const wh = Math.max(1, Math.floor(Number(windowHours) || 24));
    const ed = Math.max(1, Math.floor(Number(expiryDays) || 7));
    let cap = BigInt(0);
    try {
      cap = parseUnits(capVusd.trim() || "0", 6);
    } catch {
      cap = BigInt(0);
    }
    return {
      agent: agentAddr as Address,
      merchant: (isAddress(merchant) ? merchant : ZERO) as Address,
      token: VUSD as Address,
      cap,
      windowStart: BigInt(now),
      windowEnd: BigInt(now + wh * 3600),
      expiry: BigInt(now + ed * 86400),
      nonce,
      chainId: BigInt(SEPOLIA_CHAIN_ID),
    };
  }, [anchorSec, windowHours, expiryDays, capVusd, agentAddr, merchant, nonce]);

  const mandateJson = useMemo(
    () =>
      JSON.stringify(
        {
          ...mandate,
          cap: mandate.cap.toString(),
          windowStart: mandate.windowStart.toString(),
          windowEnd: mandate.windowEnd.toString(),
          expiry: mandate.expiry.toString(),
          nonce: mandate.nonce.toString(),
          chainId: mandate.chainId.toString(),
        },
        null,
        2
      ),
    [mandate]
  );

  function goStep3() {
    if (errors.length > 0) {
      setStatus("Fix the highlighted terms first — then continue to signing.");
      return;
    }
    setAnchorSec(Math.floor(Date.now() / 1000));
    setNonce(randomNonce());
    setStatus("");
    setStep(3);
  }

  async function getProvider(): Promise<any> {
    const w = (wallets?.[0] ?? null) as any as {
      getEthereumProvider?: () => Promise<unknown>;
      switchChain?: (id: number) => Promise<void>;
    } | null;
    if (w?.getEthereumProvider && w?.switchChain) {
      try {
        await w.switchChain(SEPOLIA_CHAIN_ID);
        return await w.getEthereumProvider();
      } catch {
        /* fall through to window.ethereum */
      }
    }
    const eth = (window as any as { ethereum?: any }).ethereum;
    if (eth) {
      return eth;
    }
    throw new Error("No wallet found — connect a wallet or log in with Privy first.");
  }

  async function ensureSepoliaNetwork(provider: any) {
    if (!provider || typeof provider.request !== "function") return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Sepolia Test Network",
              nativeCurrency: { name: "SepoliaETH", symbol: "SEP", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org"],
            },
          ],
        });
      } else {
        throw err;
      }
    }
  }

  async function getActiveAccount(wc: any, provider: any) {
    if (provider && typeof provider.request === "function") {
      try {
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) return accounts[0];
      } catch (e) {
        // ignore
      }
    }
    const addresses = await wc.getAddresses();
    return addresses[0];
  }

  async function refreshVusdBalance(acct: string) {
    try {
      const bal = await publicClient.readContract({
        address: VUSD as Address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [acct as Address],
      } as never) as bigint;
      setVusdBalance(formatUnits(bal, 6));
      let cap = BigInt(0);
      try { cap = parseUnits(capVusd.trim() || "0", 6); } catch {}
      setNeedsVusdMint(bal < cap);
    } catch (err) {
      console.error("Failed to read vUSD balance", err);
    }
  }

  async function claimVusdTokens() {
    setStatus("");
    setBusy(true);
    try {
      const provider = await getProvider();
      await ensureSepoliaNetwork(provider);
      const wc = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
      });
      const acct = await getActiveAccount(wc, provider);
      if (!acct) throw new Error("No account — unlock your wallet first.");
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "mint",
        args: [acct as Address, parseUnits("100", 6)],
      });
      const hash = await wc.sendTransaction({
        account: acct as Address,
        to: VUSD as Address,
        data,
        chain: sepolia,
      });
      setStatus(`Minting 100 vUSD... tx: ${hash.slice(0, 18)}`);
      await waitReceipt(hash);
      setStatus("100 vUSD claimed successfully!");
      await refreshVusdBalance(acct);
    } catch (err) {
      setStatus(`Mint failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function waitReceipt(hash: Hash) {
    try {
      await publicClient.waitForTransactionReceipt?.({ hash });
      return true;
    } catch {
      return false;
    }
  }

  async function signMandate(): Promise<Hash | null> {
    setStatus("");
    setBusy(true);
    try {
      const provider = await getProvider();
      await ensureSepoliaNetwork(provider);
      const wc = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
      });
      const acct = await getActiveAccount(wc, provider);
      if (!acct) throw new Error("No account — unlock your wallet first.");
      await refreshVusdBalance(acct);
      const signature = await wc.signTypedData({
        account: acct,
        domain: {
          name: "VaranasiTaskEscrow",
          version: "1",
          chainId: SEPOLIA_CHAIN_ID,
          verifyingContract: TASK_ESCROW as Address,
        },
        types: MANDATE_TYPES,
        primaryType: "Mandate",
        message: { ...mandate },
      });
      const digest = hashTypedData({
        domain: {
          name: "VaranasiTaskEscrow",
          version: "1",
          chainId: SEPOLIA_CHAIN_ID,
          verifyingContract: TASK_ESCROW as Address,
        },
        types: MANDATE_TYPES,
        primaryType: "Mandate",
        message: { ...mandate },
      });
      const id = keccak256(
        encodeAbiParameters([{ type: "bytes32" }], [digest])
      );
      setAccount(acct);
      setSig(signature);
      setTaskId(id);
      setTrackId(id);
      setStatus(`Signed — task ${id.slice(0, 18)}… ready to fund.`);
      return signature;
    } catch (err) {
      setStatus(
        `Sign failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function mintIdentity(): Promise<boolean> {
    setStatus("");
    if (!/^[a-z0-9-]{1,32}$/.test(sublabel.trim().toLowerCase())) {
      setStatus("Sublabel must be 1–32 chars: a–z, 0–9, hyphen.");
      return false;
    }
    if (!isDeployed) {
      setStatus(
        "Registry not deployed yet — minting is disabled. Tick “skip mint” to continue the demo."
      );
      return false;
    }
    setBusy(true);
    try {
      const provider = await getProvider();
      await ensureSepoliaNetwork(provider);
      const wc = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
      });
      const acct = await getActiveAccount(wc, provider);
      if (!acct) throw new Error("No account — unlock your wallet first.");
      const data = encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: "mintAgent",
        args: [
          sublabel.trim().toLowerCase(),
          mandate.agent,
          // Contract takes expiry DAYS, not the mandate timestamp.
          BigInt(Math.max(1, Math.floor(Number(expiryDays) || 7))),
        ],
      });
      const hash = await wc.sendTransaction({
        account: acct,
        to: REGISTRY as Address,
        data,
        chain: sepolia,
      });
      setMintTx(hash);
      const mined = await waitReceipt(hash);
      setMintOk(true);
      setStatus(
        mined
          ? `Identity minted onchain ✓ — ${sublabel.trim().toLowerCase()}.aegis.eth`
          : `Mint submitted (${hash.slice(0, 18)}…) — receipt unreadable, continuing anyway.`
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/LabelTaken|already\s+minted|already\s+registered/i.test(msg)) {
        // Identity already exists onchain (this sublabel or agent wallet was
        // minted before) — treat as minted and continue the funding flow.
        setSkipMint(true);
        setMintOk(true);
        setStatus(`${sublabel.trim().toLowerCase()}.aegis.eth already minted — continuing.`);
        return true;
      }
      setStatus(`Mint failed: ${msg}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function approveToken(): Promise<boolean> {
    setStatus("");
    setBusy(true);
    try {
      const provider = await getProvider();
      await ensureSepoliaNetwork(provider);
      const wc = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
      });
      const acct = await getActiveAccount(wc, provider);
      if (!acct) throw new Error("No account — unlock your wallet first.");
      const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [TASK_ESCROW as Address, mandate.cap],
      });
      const hash = await wc.sendTransaction({
        account: acct,
        to: VUSD as Address,
        data,
        chain: sepolia,
      });
      setApproveTx(hash);
      const mined = await waitReceipt(hash);
      setApproveOk(true);
      setStatus(
        mined
          ? "vUSD allowance confirmed ✓ — escrow may now pull the cap."
          : `Approve submitted (${hash.slice(0, 18)}…) — receipt unreadable, continuing anyway.`
      );
      return true;
    } catch (err) {
      setStatus(
        `Approve failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function fundEscrow(sigOverride?: Hash | null): Promise<boolean> {
    setStatus("");
    const s = sigOverride ?? sig;
    if (!s) {
      setStatus("Sign the mandate first.");
      return false;
    }
    setBusy(true);
    try {
      const provider = await getProvider();
      await ensureSepoliaNetwork(provider);
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
      });
      const acct = await getActiveAccount(walletClient, provider);
      if (!acct) throw new Error("No account — unlock your wallet first.");
      const data = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: "fund",
        args: [mandate, s],
      });
      const hash = await walletClient.sendTransaction({
        account: acct,
        to: TASK_ESCROW as Address,
        data,
        chain: sepolia,
      });
      setFundTx(hash);
      const mined = await waitReceipt(hash);
      setFundOk(true);
      rememberHire(privy.user?.id, {
        id: taskId || hash,
        agent: sublabel || arch,
        cap: capVusd,
        status: "funded",
        fundTx: hash,
        at: new Date().toISOString(),
      });
      setStatus(
        mined
          ? `Escrow funded ✓ — track task ${taskId.slice(0, 18)}… in step 4.`
          : `Fund submitted (${hash.slice(0, 18)}…) — receipt unreadable, track the task id anyway.`
      );
      return true;
    } catch (err) {
      setStatus(
        `Fund failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  // One guided action: sign → mint (unless skipped) → approve → fund, in
  // order. Stops at the first failure; the status line says what happened.
  // The fresh signature threads through as a local (React state lags a
  // render behind, so fund never reads a stale closure).
  async function authorizeAndFund() {
    const hasExtensionWallet = !!(window as any as { ethereum?: any })
      .ethereum;
    if (
      wallets?.length === 0 &&
      !hasExtensionWallet &&
      typeof privy.login === "function"
    ) {
      setStatus("Sign in with Privy to authorize & fund — opening login…");
      void privy.login();
      return;
    }
    setBusy(true);
    try {
      let signature = sig;
      if (!signature) {
        setPhase("1 of 4 · signing the mandate…");
        signature = await signMandate();
      }
      if (!signature) return;
      if (!skipMint && !mintOk) {
        setPhase("2 of 4 · minting the agent identity…");
        if (!(await mintIdentity())) return;
      }
      if (!approveOk) {
        setPhase("3 of 4 · approving vUSD…");
        if (!(await approveToken())) return;
      }
      if (!fundOk) {
        setPhase("4 of 4 · funding escrow…");
        if (!(await fundEscrow(signature))) return;
      }
      setPhase("");
      setStatus("Authorized & funded ✓ — continue to tracking to watch the task.");
    } finally {
      setPhase("");
      setBusy(false);
    }
  }

  async function refreshTrack(idOverride?: string) {
    const id = (idOverride ?? trackId).trim();
    setStatus("");
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      setStatus("Task id must be a 0x bytes32 hash (fund in step 3, or load the example task).");
      return;
    }
    try {
      const s = (await publicClient.readContract({
        address: TASK_ESCROW as Address,
        abi: ESCROW_ABI,
        functionName: "taskState",
        args: [id],
      } as never)) as number;
      const label = TASK_STATES[s] ?? "None";
      setTrackLabel(label);
      try {
        const t = (await publicClient.readContract({
          address: TASK_ESCROW as Address,
          abi: ESCROW_ABI,
          functionName: "tasks",
          args: [id],
        } as never)) as any as readonly [
          string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, string, bigint, string, number
        ];
        const tAny = t as any as Record<string, unknown> | readonly unknown[];
        const cap = (tAny as readonly unknown[])?.[4] ?? (tAny as Record<string, unknown>)?.cap;
        const funded = (tAny as readonly unknown[])?.[5] ?? (tAny as Record<string, unknown>)?.fundedAmount;
        const score = (tAny as readonly unknown[])?.[9] ?? (tAny as Record<string, unknown>)?.scoreBps;
        const expiry = (tAny as readonly unknown[])?.[8] ?? (tAny as Record<string, unknown>)?.expiry;
        if (cap !== undefined && funded !== undefined) {
          setTrackDetail(
            `cap ${String(cap)} · funded ${String(funded)} · score ${String(score ?? 0)} bps · expiry ${expiry ? new Date(Number(expiry) * 1000).toLocaleString() : "none"}`
          );
        } else {
          setTrackDetail("");
        }
      } catch {
        setTrackDetail("");
      }
      setStatus(`Live read: task is ${label}.`);
    } catch (err) {
      setTrackLabel(null);
      setStatus(
        `Live read failed — showing the last known state. (${err instanceof Error ? err.message : String(err)})`
      );
    }
  }

  async function settle(kind: "release" | "refund") {
    setStatus("");
    const id = trackId.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
      setStatus("Enter a task id first.");
      return;
    }
    setBusy(true);
    try {
      const provider = await getProvider();
      await ensureSepoliaNetwork(provider);
      const wc = createWalletClient({
        chain: sepolia,
        transport: custom(provider as never),
      });
      const acct = await getActiveAccount(wc, provider);
      if (!acct) throw new Error("No account — unlock your wallet first.");
      const data = encodeFunctionData({
        abi: ESCROW_ABI,
        functionName: kind,
        args: [id as Hash],
      });
      const hash = await wc.sendTransaction({
        account: acct as Address,
        to: TASK_ESCROW as Address,
        data,
        chain: sepolia,
      });
      setSettleTx(hash);
      await waitReceipt(hash);
      setStatus(`${kind === "release" ? "Released" : "Refunded"} ✓ — refreshing state…`);
      await refreshTrack(id);
    } catch (err) {
      setStatus(
        `${kind} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Pick", "Terms", "Sign & fund", "Track"];
  const mintBlocked = !isDeployed;

  return (
    <section className="panel" id="hire-wizard" style={{ marginTop: 20 }}>
      <h2>Hire an agent — guided</h2>
      <p className="desc">
        Four small steps from browsing to escrowed work. Nothing
        moves funds until you sign and fund in step 3.
      </p>
      <ol className="stepper">
        {steps.map((s, i) => (
          <li
            key={s}
            className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
          >
            {i + 1} · {s}
          </li>
        ))}
      </ol>

      {/* STEP 1 — Pick */}
      {step === 1 && (
        <div>
          <p className="desc">
            Step 1: pick the kind of work — each card says what it does and
            what it costs.
          </p>
          <div className="cards">
            {ARCHETYPES.map((a) => (
              <div className="card" key={a.key}>
                <div>
                  <strong>{a.label}</strong>{" "}
                  {arch === a.key && <span className="badge ok">picked</span>}
                </div>
                <div className="muted">{a.does}</div>
                <div className="muted">{a.cost} · paid in vUSD on release.</div>
                <div className="row">
                  <button
                    type="button"
                    disabled={arch === a.key}
                    onClick={() => pickArch(a.key)}
                  >
                    {arch === a.key ? `✓ ${a.label}` : `Pick ${a.label}`}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {externalAgent && (
            <div className="status">
              Hiring from the market: <code>{externalAgent.sublabel}.aegis.eth</code>{" "}
              {isAddress(externalAgent.wallet)
                ? "(wallet pre-filled below)"
                : "(no onchain wallet yet — demo address pre-filled, replace it)"}
            </div>
          )}
          <div className="row">
            <button type="button" onClick={() => setStep(2)}>
              Continue to terms →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Terms */}
      {step === 2 && (
        <div className="card">
          <strong>
            Terms for {ARCHETYPES.find((a) => a.key === arch)?.label}
          </strong>
          <div className="muted">
            Step 2: plain-words limits that go into the signed mandate — the
            escrow enforces them onchain, not the agent.
          </div>
          <label>Max payment — cap (vUSD, 6 decimals)</label>
          <input
            value={capVusd}
            onChange={(e) => setCapVusd(e.target.value)}
            inputMode="decimal"
            placeholder="10"
          />
          <label>Work window (hours — validators may score in this time)</label>
          <input
            value={windowHours}
            onChange={(e) => setWindowHours(e.target.value)}
            inputMode="numeric"
            placeholder="24"
          />
          <label>Expiry (days — refunds open after this)</label>
          <input
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            inputMode="numeric"
            placeholder="7"
          />
          <label>Merchant / payout address (who gets paid on release)</label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="0x…"
          />
          <label>Agent wallet (hired from the market, or edit)</label>
          <input
            value={agentAddr}
            onChange={(e) => {
              setAgentAddr(e.target.value);
              setAgentTouched(true);
            }}
            placeholder="0x…"
          />
          {errors.length > 0 ? (
            <ul className="flow">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : (
            <div className="status">Terms look good ✓ — continue to signing.</div>
          )}
          <div className="row">
            <button type="button" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              type="button"
              disabled={errors.length > 0}
              onClick={goStep3}
            >
              Lock terms & continue to signing →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Sign & fund / deposit */}
      {step === 3 && (
        <div className="card">
          <strong>Sign & deposit</strong>
          <div className="muted">
            Step 3: one click signs your mandate, mints the agent identity,
            approves the cap, and deposits funds into escrow — in order, stopping at the
            first problem.
          </div>
          <details>
            <summary className="muted" style={{ cursor: "pointer" }}>
              Advanced · view the exact mandate your wallet signs
            </summary>
            <div className="hero-code" style={{ maxWidth: "100%" }}>
              <pre>
                <code>{mandateJson}</code>
              </pre>
            </div>
          </details>
          {!privy.authenticated && !account && (
            <div className="status" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              No embedded wallet here —
              {typeof privy.login === "function" ? (
                <button type="button" onClick={() => privy.login?.()}>
                  Log in with Privy
                </button>
              ) : (
                <button type="button" onClick={async () => {
                  try {
                    const eth = (window as any).ethereum;
                    if (!eth) throw new Error("No wallet extension found.");
                    const accounts = await eth.request({ method: "eth_requestAccounts" });
                    setAccount(accounts[0]);
                    await refreshVusdBalance(accounts[0]);
                  } catch (e: any) {
                    setStatus("Connect failed: " + e.message);
                  }
                }}>
                  Connect Wallet
                </button>
              )}
            </div>
          )}
          {account && (
            <div className="status">
              Signing as <code>{account}</code>
              {vusdBalance !== null && (
                <span> · Balance: {vusdBalance} vUSD</span>
              )}
              {needsVusdMint && (
                <button type="button" style={{ marginLeft: 8 }} disabled={busy} onClick={claimVusdTokens}>
                  Claim 100 vUSD
                </button>
              )}
            </div>
          )}
          <label style={{ marginTop: 12 }}>
            Agent sublabel (→ *.aegis.eth — only if this agent is new)
          </label>
          <input
            value={sublabel}
            onChange={(e) => setSublabel(e.target.value)}
            placeholder="hire-scout"
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={skipMint}
              onChange={(e) => setSkipMint(e.target.checked)}
              style={{ minHeight: 24, minWidth: 24 }}
            />
            Agent identity already minted — skip
          </label>
          {mintBlocked && (
            <div className="status">
              Registry not deployed yet — tick “skip mint” to continue.
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="cta-primary"
              disabled={busy || fundOk}
              onClick={authorizeAndFund}
            >
              {fundOk
                ? "✓ Authorized & funded"
                : busy
                  ? phase || "Working…"
                  : "Authorize & fund"}
            </button>
          </div>
          {(mintTx || approveTx || fundTx) && (
            <div className="muted" style={{ marginTop: 8 }}>
              {mintTx && (
                <span>
                  Identity{" "}
                  <a href={sepoliaTx(mintTx)} target="_blank" rel="noreferrer">
                    record ↗
                  </a>{" "}
                </span>
              )}
              {approveTx && (
                <span>
                  · Approval{" "}
                  <a href={sepoliaTx(approveTx)} target="_blank" rel="noreferrer">
                    record ↗
                  </a>{" "}
                </span>
              )}
              {fundTx && (
                <span>
                  · Fund{" "}
                  <a href={sepoliaTx(fundTx)} target="_blank" rel="noreferrer">
                    record ↗
                  </a>
                </span>
              )}
            </div>
          )}

          <div className="verify-line">
            Escrow{" "}
            <a href={sepoliaAddress(TASK_ESCROW)} target="_blank" rel="noreferrer">
              {TASK_ESCROW.slice(0, 10)}… ↗
            </a>{" "}
            · vUSD{" "}
            <a href={sepoliaAddress(VUSD)} target="_blank" rel="noreferrer">
              {VUSD.slice(0, 10)}… ↗
            </a>
          </div>

          <div className="row">
            <button type="button" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button
              type="button"
              disabled={!fundOk}
              onClick={() => {
                setStep(4);
                if (taskId) void refreshTrack(taskId);
              }}
            >
              Continue to tracking →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 — Track */}
      {step === 4 && (
        <div className="card">
          <strong>Track the task</strong>
          <div className="muted">
            Step 4: watch the escrow state live — release pays the merchant,
            refund returns you after expiry.
          </div>
          <label>Task id (bytes32)</label>
          <input
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            placeholder="0x… (funded in step 3, or load the example below)"
          />
          <div className="row">
            <button type="button" onClick={() => void refreshTrack()}>
              Refresh state
            </button>
            <button
              type="button"
              onClick={() => {
                setTrackId(DEMO_TASK_ID);
                setTrackLabel("Released");
                setTrackDetail(
                  `Funded → Released · fund ${DEMO_FUND_TX.slice(0, 18)}… · release ${DEMO_RELEASE_TX.slice(0, 18)}…`
                );
                setStatus("Example task loaded (a real task id reads live).");
              }}
            >
              Load example task
            </button>
          </div>
          {trackLabel && (
            <div className="status">
              State:{" "}
              <span
                className={`badge ${trackLabel === "Released" ? "ok" : trackLabel === "Refunded" || trackLabel === "Cancelled" ? "bad" : "warn"}`}
              >
                {trackLabel}
              </span>{" "}
              {trackDetail && <span className="muted">{trackDetail}</span>}
            </div>
          )}
          {!trackLabel && (
            <div className="status">
              No live read yet — fund in step 3, or load the example task.{" "}
              <a href={sepoliaTx(DEMO_RELEASE_TX)} target="_blank" rel="noreferrer">
                Example release tx ↗
              </a>
            </div>
          )}
          <div className="row">
            {trackLabel === "Validated" && (
              <button type="button" disabled={busy} onClick={() => void settle("release")}>
                Release to merchant
              </button>
            )}
            {(trackLabel === "Funded" || trackLabel === "Validated") && (
              <button type="button" disabled={busy} onClick={() => void settle("refund")}>
                Refund (past expiry)
              </button>
            )}
            {settleTx && (
              <a href={sepoliaTx(settleTx)} target="_blank" rel="noreferrer">
                record ↗
              </a>
            )}
          </div>
          <div className="row">
            <button type="button" onClick={() => setStep(3)}>
              ← Back
            </button>
          </div>
        </div>
      )}

      <div className="status">{status}</div>
      <p className="envline">
        Escrow <code>{TASK_ESCROW}</code> · vUSD{" "}
        <code>{VUSD}</code> (6dp)
      </p>
      <JobRunner agent={(agentById(arch) ?? ROSTER[0]) as CatalogAgent} />
    </section>
  );
}
