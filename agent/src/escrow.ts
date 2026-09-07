/**
 * escrow.ts — agent-side viem client for VaranasiTaskEscrow (Sepolia).
 *
 * Lane: mandate (signed OFFCHAIN via mandate.ts) → fund → submitValidation
 * (allowlisted validator) → release (anyone, iff score >= threshold AND live
 * RiskGuard.authorize passes AND now <= expiry) → else refund past expiry,
 * or payer-only cancel pre-validation.
 *
 * Conventions (mirror erc8004.ts):
 *  - Writers take a CALLER-SUPPLIED WalletClient; this module never touches
 *    private keys and never broadcasts on import.
 *  - Reads take an optional PublicClient (default: Sepolia public RPC).
 *  - Only env shape read is SEPOLIA_RPC_URL (already in .env.example).
 *
 * NOTE on naming: the agent wrapper is `fundMandate()`; the onchain function
 * it calls is `fund((Mandate,uint8...) m, bytes sig)` in TaskEscrow.sol.
 * `submitValidation` is an allowlisted-validator WRITER; the read helpers
 * here are `taskState` / `readTask` / `isNonceUsed`.
 */
import {
  createPublicClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";
import { TASK_ESCROW_ADDRESS, type Mandate } from "./mandate.js";

/** Default Sepolia RPC (override via opts.rpcUrl or SEPOLIA_RPC_URL). */
export const DEFAULT_SEPOLIA_RPC_URL = "https://rpc.sepolia.org";

/** Wallet client with a known account — caller supplies it, we never sign for them. */
export type EscrowWallet = WalletClient<Transport, Chain, Account>;

export interface EscrowOptions {
  rpcUrl?: string;
  /** Override for tests / redeploys (default: live Sepolia escrow). */
  escrow?: Address;
}

/** Minimal ERC20 leg used by the escrow lane (approve/allowance/balanceOf). */
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** TaskEscrow subset used by the agent lane (see contracts/src/TaskEscrow.sol). */
export const TASK_ESCROW_ABI = [
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
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
    outputs: [{ name: "taskId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submitValidation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "taskId", type: "bytes32" },
      { name: "scoreBps", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "taskState",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "tasks",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
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
      { name: "state", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "usedNonce",
    stateMutability: "view",
    inputs: [
      { name: "signer", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "thresholdBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Onchain State enum labels (TaskEscrow.State). */
export const TASK_STATES = ["None", "Funded", "Validated", "Released", "Refunded", "Cancelled"] as const;
export type TaskStateLabel = (typeof TASK_STATES)[number];

/** Read-only escrow client (no keys). */
export function makeEscrowClient(rpcUrl?: string): PublicClient {
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl ?? process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC_URL),
  });
}

function escrowAddress(opts: EscrowOptions = {}): Address {
  return opts.escrow ?? (TASK_ESCROW_ADDRESS as Address);
}

/** Lightweight state read — what the service indexer / UI polls. */
export async function taskState(
  taskId: Hash,
  opts: EscrowOptions = {},
  client?: PublicClient,
): Promise<{ state: number; label: TaskStateLabel }> {
  const c = client ?? makeEscrowClient(opts.rpcUrl);
  const state = (await c.readContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "taskState",
    args: [taskId],
  })) as number;
  return { state, label: (TASK_STATES[state] ?? "None") as TaskStateLabel };
}

export interface EscrowTask {
  payer: Address;
  agent: Address;
  merchant: Address;
  token: Address;
  cap: bigint;
  fundedAmount: bigint;
  windowStart: bigint;
  windowEnd: bigint;
  expiry: bigint;
  scoreBps: bigint;
  validator: Address;
  state: number;
  label: TaskStateLabel;
}

/** Full task record read (12-field tuple → named object). */
export async function readTask(
  taskId: Hash,
  opts: EscrowOptions = {},
  client?: PublicClient,
): Promise<EscrowTask> {
  const c = client ?? makeEscrowClient(opts.rpcUrl);
  const t = (await c.readContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "tasks",
    args: [taskId],
  })) as unknown as [
    Address, Address, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, Address, number,
  ];
  const state = Number(t[11]);
  return {
    payer: t[0],
    agent: t[1],
    merchant: t[2],
    token: t[3],
    cap: t[4],
    fundedAmount: t[5],
    windowStart: t[6],
    windowEnd: t[7],
    expiry: t[8],
    scoreBps: t[9],
    validator: t[10],
    state,
    label: (TASK_STATES[state] ?? "None") as TaskStateLabel,
  };
}

/** Replay-nullifier read: true once the signer's nonce has funded. */
export async function isNonceUsed(
  signer: Address,
  nonce: bigint,
  opts: EscrowOptions = {},
  client?: PublicClient,
): Promise<boolean> {
  const c = client ?? makeEscrowClient(opts.rpcUrl);
  return (await c.readContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "usedNonce",
    args: [signer, nonce],
  })) as boolean;
}

/** Live global release bar (score >= threshold to release). */
export async function readThresholdBps(opts: EscrowOptions = {}, client?: PublicClient): Promise<bigint> {
  const c = client ?? makeEscrowClient(opts.rpcUrl);
  return (await c.readContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "thresholdBps",
    args: [],
  })) as bigint;
}

export interface FundResult {
  /** ERC20 approve tx (null when allowance already covered cap). */
  approveTxHash: Hash | null;
  /** fund(mandate, sig) tx hash. */
  txHash: Hash;
}

/**
 * Fund an escrow from a signed mandate (WRITER — broadcasts).
 * ERC20 approve FIRST: pulls from the SIGNER, so allowance(token, escrow)
 * must cover cap. Sends the approve tx and waits for receipt when needed,
 * then calls fund. The submitter may be anyone; funds come from the signer.
 */
export async function fundMandate(
  mandate: Mandate,
  signature: Hash,
  signer: Address,
  wallet: EscrowWallet,
  opts: EscrowOptions = {},
  client?: PublicClient,
): Promise<FundResult> {
  const c = client ?? makeEscrowClient(opts.rpcUrl);
  const escrow = escrowAddress(opts);
  const allowance = (await c.readContract({
    address: mandate.token,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [signer, escrow],
  })) as bigint;
  let approveTxHash: Hash | null = null;
  if (allowance < mandate.cap) {
    approveTxHash = await wallet.writeContract({
      address: mandate.token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [escrow, mandate.cap],
      chain: wallet.chain ?? sepolia,
    });
    await c.waitForTransactionReceipt({ hash: approveTxHash });
  }
  const txHash = await wallet.writeContract({
    address: escrow,
    abi: TASK_ESCROW_ABI,
    functionName: "fund",
    args: [mandate, signature],
    chain: wallet.chain ?? sepolia,
  });
  return { approveTxHash, txHash };
}

/**
 * Submit (or revise) a validation score (WRITER — broadcasts).
 * Allowlisted validators only; last-write-wins pre-settlement.
 * This is a writer, not a read: polling uses taskState/readTask.
 */
export async function submitValidation(
  taskId: Hash,
  scoreBps: bigint,
  wallet: EscrowWallet,
  opts: EscrowOptions = {},
): Promise<Hash> {
  return wallet.writeContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "submitValidation",
    args: [taskId, scoreBps],
    chain: wallet.chain ?? sepolia,
  });
}

/**
 * Release escrowed funds to the merchant (WRITER — broadcasts, permissionless).
 * Succeeds onchain iff: latest score >= threshold AND live
 * RiskGuard.authorize(agent, score, cap) passes AND now <= expiry.
 */
export async function releaseTask(taskId: Hash, wallet: EscrowWallet, opts: EscrowOptions = {}): Promise<Hash> {
  return wallet.writeContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "release",
    args: [taskId],
    chain: wallet.chain ?? sepolia,
  });
}

/**
 * Refund escrowed funds to the payer (WRITER — broadcasts, permissionless).
 * Strictly after expiry (block.timestamp > expiry).
 */
export async function refundTask(taskId: Hash, wallet: EscrowWallet, opts: EscrowOptions = {}): Promise<Hash> {
  return wallet.writeContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "refund",
    args: [taskId],
    chain: wallet.chain ?? sepolia,
  });
}

/**
 * Cancel pre-validation and return funds to the payer (WRITER — broadcasts).
 * Payer-only, FUNDED state only (any validation kills cancel).
 */
export async function cancelTask(taskId: Hash, wallet: EscrowWallet, opts: EscrowOptions = {}): Promise<Hash> {
  return wallet.writeContract({
    address: escrowAddress(opts),
    abi: TASK_ESCROW_ABI,
    functionName: "cancel",
    args: [taskId],
    chain: wallet.chain ?? sepolia,
  });
}
