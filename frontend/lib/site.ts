export const APP_NAME = "Varanasi";
export const APP_TAGLINE = "Hire an AI agent. Pay only when the work is proven.";
export const GITHUB_URL = "https://github.com/Ramprasad4121/varanasi";
export const HASHSCAN_BASE = "https://hashscan.io/testnet/transaction";
export const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";
export const ETHERSCAN_ADDR = "https://sepolia.etherscan.io/address";

export const TASK_ESCROW = "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24";
export const AEGIS_REGISTRY = "0x3913f1E6A0Be93180363aBd01Df7968d494033A8";
export const RISK_GUARD = "0x668c01aE564D51baFF0029D361c20c534d738400";
export const AEGIS_HOOK = "0x05043B527D67d7E4e3a2ed411fFBD15b8255c080";
export const VUSD = "0x6169A84cD7430042fb697c2cC131F663212E8b30";

export const NAV = [
  { to: "/agents" as const, label: "Agents" },
  { to: "/finance" as const, label: "Finance" },
  { to: "/mandate" as const, label: "How it works" },
  { to: "/activity" as const, label: "Activity" },
  { to: "/proof" as const, label: "Proof" },
  { to: "/about" as const, label: "About" },
];

export const STATS: Array<{
  value: string;
  suffix?: string;
  label: string;
  href: string;
  proof: string;
  image: string;
}> = [
  {
    value: "1+",
    label: "Escrows released",
    href: `${ETHERSCAN_TX}/0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702`,
    proof: "Etherscan",
    image: "/images/trophy.jpg",
  },
  {
    value: "3+",
    label: "x402 payments",
    href: `${HASHSCAN_BASE}/0.0.7162784-1788675749-710110370`,
    proof: "HashScan",
    image: "/images/eagle.jpg",
  },
  {
    value: "2",
    label: "Agent identities",
    href: `${ETHERSCAN_TX}/0xaac0018d2906e5773f5c28e14a49e54b02a8c4156f06c6a9473e74ccebc7c327`,
    proof: "Etherscan",
    image: "/images/figure-builder.jpg",
  },
  {
    value: "243",
    suffix: "/243",
    label: "Tests green",
    href: GITHUB_URL,
    proof: "GitHub",
    image: "/images/scales.jpg",
  },
];

export const HOW = [
  {
    n: "I",
    title: "Hire",
    body: "Pick an agent and set a spending cap, a work window, and an expiry. You sign one mandate. The agent never holds your keys.",
    image: "/images/mandate-scroll.jpg",
  },
  {
    n: "II",
    title: "Work",
    body: "The agent does the job inside those bounds. Replay is impossible. One click revokes the identity everywhere.",
    image: "/images/figure-builder.jpg",
  },
  {
    n: "III",
    title: "Settle",
    body: "Release pays the merchant when the work clears the bar. Miss it — you are refunded, with the evidence onchain.",
    image: "/images/scales.jpg",
  },
];

export const ZEROES = [
  {
    title: "No standing credentials",
    body: "Agents hold a signed mandate — never keys, never allowances.",
  },
  {
    title: "No trust in prompts",
    body: "Checks run in contracts, not in the agent's head.",
  },
  {
    title: "No double-spend",
    body: "Nonces and escrowed funds, verified at settlement.",
  },
  {
    title: "No lock-in",
    body: "AP2-shaped mandates, ERC-8004 identity, any x402 rail.",
  },
];

export const GALLERY = [
  { src: "/images/gallery-workshop.jpg", alt: "The workshop — agents drafted like architectural plates" },
  { src: "/images/gallery-courtyard.jpg", alt: "The courtyard — a quiet colonnade between mandates" },
  { src: "/images/gallery-dinner.jpg", alt: "The hall — settlement, witnessed" },
  { src: "/images/gate.jpg", alt: "The gate — identity in, spend out" },
];

export const AGENTS = [
  {
    id: "scout",
    ens: "scout.aegis.eth",
    name: "Scout",
    role: "Finds pools",
    summary: "Scans live Uniswap markets, scores liquidity, and returns a shortlist inside your window.",
    does: "Finds the best pool for the job.",
    cap: "10",
    window: "24",
    expiry: "7",
    image: "/images/eagle.jpg",
  },
  {
    id: "analyst",
    ens: "analyst.aegis.eth",
    name: "Analyst",
    role: "Scores risk",
    summary: "Reasons over TVL, volume, and alpha. Emits an ACT or SKIP verdict the escrow can enforce.",
    does: "Scores a pool ACT or SKIP, with a rationale.",
    cap: "25",
    window: "12",
    expiry: "7",
    image: "/images/scales.jpg",
  },
  {
    id: "freelancer",
    ens: "freelancer.aegis.eth",
    name: "Freelancer",
    role: "Settles escrow",
    summary: "Carries the mandate to fund, validate, and release. Miss the bar and you are refunded with evidence.",
    does: "Releases on a pass, refunds after expiry.",
    cap: "50",
    window: "48",
    expiry: "14",
    image: "/images/trophy.jpg",
  },
] as const;

export const CONTRACTS = [
  { name: "TaskEscrow", address: TASK_ESCROW, note: "Mandate → fund → validate → release" },
  { name: "AegisRegistry", address: AEGIS_REGISTRY, note: "Revocable agent identity" },
  { name: "RiskGuard", address: RISK_GUARD, note: "Live authorize at settlement" },
  { name: "AegisHook", address: AEGIS_HOOK, note: "Uniswap v4 beforeSwap gate" },
];

export const PROOF = [
  {
    title: "Mandate funded",
    hash: "0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572",
    kind: "sepolia" as const,
  },
  {
    title: "Validation submitted",
    hash: "0xfde951571e35eaa1d0206b139322d539697846c00c3e8d508b01b76b13b2c061",
    kind: "sepolia" as const,
  },
  {
    title: "Escrow released",
    hash: "0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702",
    kind: "sepolia" as const,
  },
  {
    title: "x402 payment",
    hash: "0.0.7162784-1788675749-710110370",
    kind: "hedera" as const,
  },
  {
    title: "Identity minted",
    hash: "0xa31520a82a8ea27c67f3b889d56eeab92944ae19e66645bee2958d3604134b41",
    kind: "sepolia" as const,
  },
  {
    title: "Kill-switch revoke",
    hash: "0xa7085e187947d8c35e4f83763a6668bb27a523db865f02b5cb24e172352c2043",
    kind: "sepolia" as const,
  },
];

export const POOLS = [
  {
    key: "usdc-weth-005",
    label: "USDC / WETH",
    fee: "0.05%",
    address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    tvl: "~$416.7M",
    volume: "~$604B lifetime",
  },
  {
    key: "usdc-weth-030",
    label: "USDC / WETH",
    fee: "0.3%",
    address: "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8",
    tvl: "see subgraph",
    volume: "see subgraph",
  },
  {
    key: "wbtc-weth-030",
    label: "WBTC / WETH",
    fee: "0.3%",
    address: "0xcbcdf9626bc03e24f779434178a73a0b4bad62ed",
    tvl: "see subgraph",
    volume: "see subgraph",
  },
];

export const DEMO_RECEIPTS = [
  {
    txId: "0.0.7162784-1788675749-710110370",
    endpoint: "/v1/signal",
    amount: "$0.01 USDC",
    at: "2026-09-06T12:00:00.000Z",
  },
  {
    txId: "0.0.7162784-1788676249-125024441",
    endpoint: "/v1/signal",
    amount: "$0.01 USDC",
    at: "2026-09-06T12:08:00.000Z",
  },
];

export const DEMO_TASK = {
  id: "0x03c850258e7ec98a7034e95103d1afe27a4b334a09a238041cba86cadba554dc",
  fundTx: "0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572",
  releaseTx: "0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702",
};

export const MANDATE_FIELDS = [
  { field: "agent", meaning: "The worker. Identity is re-checked live at release." },
  { field: "merchant", meaning: "Who gets paid if the work clears the bar." },
  { field: "token", meaning: "ERC-20 only. USDC-first." },
  { field: "cap", meaning: "Maximum the agent can spend. Locked in escrow." },
  { field: "window", meaning: "How long validators may score the work." },
  { field: "expiry", meaning: "After this, anyone may refund you." },
  { field: "nonce", meaning: "Stops replay. Burned when you fund." },
  { field: "chainId", meaning: "Pinned to this chain. Cross-chain replay dies." },
];

export function proofHref(item: (typeof PROOF)[number]) {
  return item.kind === "hedera" ? `${HASHSCAN_BASE}/${item.hash}` : `${ETHERSCAN_TX}/${item.hash}`;
}

export function shortHash(hash: string) {
  if (hash.startsWith("0x") && hash.length > 12) return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  return hash;
}

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
