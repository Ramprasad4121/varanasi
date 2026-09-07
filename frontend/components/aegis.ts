// Author: Ramprasad — shared marketplace constants/types/storage (registry, pools, receipts, localStorage helpers); live deps Sepolia + signal + subgraph envs; demo-known values pinned from docs/DEMO.md, live reads degrade gracefully.
// Shared marketplace constants, types + storage helpers.
// Demo-known values are pinned from docs/DEMO.md (recorded 2026-09-06) and
// ALWAYS labelled as such in the UI. Live reads degrade gracefully.

export const REGISTRY =
  process.env.NEXT_PUBLIC_AEGIS_REGISTRY ??
  "0x0aed80646680eb333e0d2129f6f0fa54503b5381";
export const RISK_GUARD = "0xc35861c4dbe63a9c8cfefd32c671998151c217ca";
export const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "";
export const SIGNAL_URL =
  process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:4021";
export const GRAPH_API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY ?? "";

const ZERO = "0x0000000000000000000000000000000000000000";
export const isDeployed = Boolean(REGISTRY) && REGISTRY.toLowerCase() !== ZERO;

// --- Minimal AegisRegistry surface (contracts/AegisRegistry.sol) ---
export const REGISTRY_ABI = [
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

// --- Curated pools (agent/SKILL.md CURATED_POOLS; demo-known stats DEMO.md) ---
export type CuratedPool = {
  key: string;
  label: string;
  fee: string;
  address: string;
  demoTvlUsd: string;
  demoVolume: string;
};

export const CURATED_POOLS: CuratedPool[] = [
  {
    key: "usdc-weth-005",
    label: "USDC / WETH",
    fee: "0.05%",
    address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    demoTvlUsd: "~$416.7M",
    demoVolume: "~$604B lifetime",
  },
  {
    key: "usdc-weth-030",
    label: "USDC / WETH",
    fee: "0.3%",
    address: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
    demoTvlUsd: "see subgraph",
    demoVolume: "see subgraph",
  },
  {
    key: "wbtc-weth-030",
    label: "WBTC / WETH",
    fee: "0.3%",
    address: "0xcbcdf9626bc03e24f779434178a73a0b4bad62ed",
    demoTvlUsd: "see subgraph",
    demoVolume: "see subgraph",
  },
];

export const UNISWAP_V3_SUBGRAPH = "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV";

// --- Demo-known receipts + verdict (docs/DEMO.md) ---
export const DEMO_RECEIPTS = [
  "0.0.7162784-1788675749-710110370",
  "0.0.7162784-1788676249-125024441",
];
export const DEMO_MINT_TX =
  "0xaac0018d2906e5773f5c28e14a49e54b02a8c4156f06c6a9473e74ccebc7c327";

// --- Links ---
export const etherscanAddress = (a: string) =>
  `https://etherscan.io/address/${a}`;
export const sepoliaAddress = (a: string) =>
  `https://sepolia.etherscan.io/address/${a}`;
export const sepoliaTx = (h: string) => `https://sepolia.etherscan.io/tx/${h}`;
export const hashscanTx = (txId: string) =>
  `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`;
export const graphSubgraphUrl = (id: string) =>
  `https://thegraph.com/explorer/subgraphs/${id}`;

// --- Shared record types (localStorage-backed) ---
export type AgentRecord = {
  sublabel: string;
  wallet: string;
  expiry: number; // unix seconds
  txHash?: string;
  revoked?: boolean;
  pending?: boolean;
};

export type IntelRecord = {
  riskScore: number;
  rationale: string;
  raw: unknown;
};

export type Receipt = {
  txId: string;
  endpoint: string;
  amount: string;
  at: string; // ISO timestamp
};

export type Verdict = {
  id: string;
  at: string; // ISO timestamp
  agent: string;
  pool: string;
  score: string; // display string, e.g. "200 bps" or "38 / 100"
  decision: "ACT" | "SKIP";
  rationale: string;
  source: "demo-known" | "local";
};

export const LS_AGENTS = "aegis.agents";
export const LS_INTEL = "aegis.intel";
export const LS_RECEIPTS = "aegis.receipts";
export const LS_VERDICTS = "aegis.verdicts";

export function load<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private-mode: ignore */
  }
}

export function seedVerdicts(): Verdict[] {
  return [
    {
      id: "demo-2026-09-06",
      at: "2026-09-06T00:00:00.000Z",
      agent: "sentinel-1.aegis.eth",
      pool: "USDC/WETH 0.05% · 0x88e6…5640",
      score: "200 bps (threshold 5000)",
      decision: "ACT",
      rationale:
        "Demo-known verdict: liquidity/activity/alpha factors green, RiskGuard authorize(wallet, 200, 5000) → wouldPass true.",
      source: "demo-known",
    },
  ];
}

// viem public-client structural type (avoids exporting concrete generics)
export type PublicClientLike = {
  readContract: (args: {
    address: `0x${string}`;
    abi: typeof REGISTRY_ABI;
    functionName: "agentOf";
    args: [string];
  }) => Promise<readonly [`0x${string}`, bigint, boolean]>;
};
