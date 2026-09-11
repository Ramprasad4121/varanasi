/**
 * @author Ramprasad — viem reader/writer for Akshaya (proof-of-outcome reputation).
 * akshaya.ts — client for contracts/src/Akshaya.sol on the live rail.
 *
 * Lane: an agent's onchain reputation is EVIDENCE, not opinion: Akshaya only
 * ever mints from a TERMINAL TaskEscrow state (released → +coin, refunded →
 * −dust), and scores half-life decay every 90d. This module reads that score
 * and offers the permissionless `attest` writer. Like escrow.ts, writers take
 * a CALLER-SUPPLIED WalletClient; this module never touches private keys and
 * never broadcasts on import.
 *
 * env: SEPOLIA_RPC_URL only. Address default: AKSHAYA_ADDRESS (deployed by
 * contracts/script/DeployInventions.s.sol); override per-call for tests.
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
import { DEFAULT_SEPOLIA_RPC_URL } from "./escrow.js";

/** Deployed Akshaya on Sepolia (informational default; owner may redeploy). */
export const AKSHAYA_ADDRESS =
  process.env.AKSHAYA_ADDRESS ?? ("0x0000000000000000000000000000000000000000" as const);

/** Wallet client with a known account — caller supplies it, we never sign for them. */
export type AkshayaWallet = WalletClient<Transport, Chain, Account>;

export interface AkshayaOptions {
  rpcUrl?: string;
  akshaya?: Address;
}

export const AKSHAYA_ABI = [
  {
    type: "function",
    name: "scoreOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "int256" }],
  },
  {
    type: "function",
    name: "statsOf",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "coins", type: "uint128" },
      { name: "dust", type: "uint128" },
      { name: "score", type: "int256" },
      { name: "period", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenByTask",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "attest",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

let cached: { url: string; client: PublicClient } | undefined;

/** Default read client (memoized per RPC URL). */
export function akshayaClient(rpcUrl?: string): PublicClient {
  const url = rpcUrl ?? process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC_URL;
  if (!cached || cached.url !== url) {
    cached = { url, client: createPublicClient({ chain: sepolia, transport: http(url) }) };
  }
  return cached.client;
}

/** Decayed reputation summary for one agent wallet. */
export interface AgentReputation {
  agent: Address;
  /** Signed, decayed score in bps of one perfect outcome (10000 = fresh release). */
  score: bigint;
  coins: bigint;
  dust: bigint;
  /** Soulbound receipts held (== coins + dust, asserted by the contract). */
  receipts: bigint;
  /** Decay period bucket the score was last settled in (unix / 90d). */
  period: number;
}

/** Read + decode an agent's reputation (1 RPC round-trip: statsOf + balanceOf batched). */
export async function readReputation(
  agent: Address,
  opts: AkshayaOptions & { client?: PublicClient } = {},
): Promise<AgentReputation> {
  const client = opts.client ?? akshayaClient(opts.rpcUrl);
  const akshaya = (opts.akshaya ?? AKSHAYA_ADDRESS) as Address;
  const [coins, dust, score, period] = await client.readContract({
    address: akshaya,
    abi: AKSHAYA_ABI,
    functionName: "statsOf",
    args: [agent],
  });
  const receipts = await client.readContract({
    address: akshaya,
    abi: AKSHAYA_ABI,
    functionName: "balanceOf",
    args: [agent],
  });
  return { agent, score, coins, dust, receipts, period };
}

/** Has this task already been converted into a receipt? (cheap pre-check for UX) */
export async function isAttested(
  taskId: Hash,
  opts: AkshayaOptions & { client?: PublicClient } = {},
): Promise<boolean> {
  const client = opts.client ?? akshayaClient(opts.rpcUrl);
  const tokenId = await client.readContract({
    address: (opts.akshaya ?? AKSHAYA_ADDRESS) as Address,
    abi: AKSHAYA_ABI,
    functionName: "tokenByTask",
    args: [taskId],
  });
  return tokenId > 0n;
}

/**
 * Permissionless writer: anyone can attest a TERMINAL task (agent, payer,
 * merchant, indexer). Idempotent onchain; a reverted `attest` for an
 * already-minted task is expected, not an error — callers should pre-check
 * with `isAttested` when gas matters.
 */
export async function attestTask(
  wallet: AkshayaWallet,
  taskId: Hash,
  opts: AkshayaOptions = {},
): Promise<{ hash: Hash }> {
  const hash = await wallet.writeContract({
    account: wallet.account,
    chain: wallet.chain,
    address: (opts.akshaya ?? AKSHAYA_ADDRESS) as Address,
    abi: AKSHAYA_ABI,
    functionName: "attest",
    args: [taskId],
  });
  return { hash };
}
