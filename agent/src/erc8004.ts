/**
 * @author Ramprasad — ERC-8004 onchain agent-identity helpers (registerAgent, giveFeedback, getSummary; env: SEPOLIA_RPC_URL).
 * erc8004.ts — viem-based ERC-8004 onchain agent-identity helpers (Sepolia).
 *
 * ERC-8004 ("Trustless Agents", https://eips.ethereum.org/EIPS/eip-8004) gives
 * every varanasi agent a portable onchain identity: an ERC-721 token in the
 * IdentityRegistry whose tokenURI points at a registration JSON file
 * (name, description, services[], x402Support, active), plus a shared
 * ReputationRegistry where clients post/query feedback (giveFeedback /
 * getSummary). This complements the ENSv2 `*.aegis.eth` names in ens.ts:
 * ENS is the human-readable, revocable, permissioned handle; ERC-8004 is the
 * cross-agent trust/reputation layer (see agent/ERC8004.md).
 *
 * Canonical registry addresses (CREATE2, same on every chain where deployed):
 *   IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *   ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
 *
 * DEPLOYMENT WARNING (checked 2026-09-06): `cast code` on three live Sepolia
 * RPCs returns 0x at BOTH canonical addresses (Sepolia Etherscan shows an
 * EOA), while mainnet HAS bytecode. So on Sepolia today there is nothing to
 * call — always run `isDeployed()` / `cast code` first. Writers take a caller
 * supplied WalletClient; this module never touches private keys.
 */
import {
  createPublicClient,
  http,
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";

/** Canonical ERC-8004 IdentityRegistry (CREATE2 — same address cross-chain). */
export const ERC8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

/** Canonical ERC-8004 ReputationRegistry (CREATE2 — same address cross-chain). */
export const ERC8004_REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

/** Registration JSON `type` discriminator (EIP-8004, registration v1). */
export const ERC8004_REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;

/** varanasi agent covered by the default registration builder. */
export const SENTINEL1_SUBLABEL = "sentinel-1" as const;
export const SENTINEL1_ENS_NAME = "sentinel-1.aegis.eth" as const;
export const SENTINEL1_MCP_ENDPOINT = "https://aegis.local/mcp" as const;

/** Canonical IdentityRegistry subset used by varanasi (EIP-8004 `register(string)` overload). */
const IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** Emitted on registration; the only way to learn the minted agentId off a tx hash. */
const REGISTERED_EVENT_ABI = [
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

/** Canonical ReputationRegistry subset used by varanasi (EIP-8004 fixed-point feedback). */
const REPUTATION_ABI = [
  {
    type: "function",
    name: "giveFeedback",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "clientAddresses", type: "address[]" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
    ],
    outputs: [
      { name: "count", type: "uint64" },
      { name: "summaryValue", type: "int128" },
      { name: "summaryValueDecimals", type: "uint8" },
    ],
  },
] as const;

/** Registry / RPC overrides for ERC-8004 reads and writes. */
export interface Erc8004Options {
  /** Sepolia RPC URL override (default: env SEPOLIA_RPC_URL or public RPC). */
  rpcUrl?: string;
  /** IdentityRegistry address override (default: canonical CREATE2 address). */
  identityRegistry?: Address;
  /** ReputationRegistry address override (default: canonical CREATE2 address). */
  reputationRegistry?: Address;
}

/** Wallet client with a known account — caller supplies it, we never sign for them. */
export type Erc8004Wallet = WalletClient<Transport, Chain, Account>;

/**
 * Build a Sepolia viem public client for ERC-8004 reads.
 * @param rpcUrl Optional RPC URL (default: env SEPOLIA_RPC_URL or public Sepolia RPC).
 * @returns Sepolia PublicClient.
 */
export function make8004Client(rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl ?? process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org") });
}

/**
 * Preflight: does `address` actually host contract code on Sepolia?
 * MUST be true before any write — the canonical ERC-8004 addresses are
 * currently undeployed on Sepolia (0x as of 2026-09-06).
 * @param address Contract address to probe.
 * @param client Optional injected public client.
 * @returns True when bytecode is present.
 */
export async function isDeployed(address: Address, client?: PublicClient): Promise<boolean> {
  const c = client ?? make8004Client();
  const code = await c.getBytecode({ address });
  return !!code && code !== "0x";
}

/**
 * Register an agent (writer). Returns the tx hash — the minted agentId is NOT
 * in the return value, pull it via getAgentIdFromTx() below.
 * @param agentURI Registration-file URI (IPFS/HTTPS).
 * @param wallet Caller-supplied wallet client (broadcasts).
 * @param opts Registry overrides.
 * @returns Registration tx hash.
 */
export async function registerAgent(agentURI: string, wallet: Erc8004Wallet, opts: Erc8004Options = {}): Promise<Hash> {
  return wallet.writeContract({
    address: opts.identityRegistry ?? (ERC8004_IDENTITY_REGISTRY as Address),
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [agentURI],
    chain: wallet.chain ?? sepolia,
  });
}

/**
 * Decode the `Registered` event off a registration receipt → the minted agentId.
 * @param hash Registration tx hash.
 * @param opts RPC/registry overrides.
 * @param client Optional injected public client.
 * @returns Minted agentId.
 */
export async function getAgentIdFromTx(hash: Hash, opts: Erc8004Options = {}, client?: PublicClient): Promise<bigint> {
  const c = client ?? make8004Client(opts.rpcUrl);
  const receipt = await c.waitForTransactionReceipt({ hash });
  const [decoded] = parseEventLogs({ abi: REGISTERED_EVENT_ABI, logs: receipt.logs, eventName: "Registered" });
  if (!decoded) throw new Error(`No Registered event in receipt ${hash} — registration did not happen.`);
  return decoded.args.agentId;
}

/**
 * ERC-721 owner of an agentId.
 * @param agentId Agent token id.
 * @param opts RPC/registry overrides.
 * @param client Optional injected public client.
 * @returns Owner address.
 */
export async function getAgentOwner(agentId: bigint, opts: Erc8004Options = {}, client?: PublicClient): Promise<Address> {
  const c = client ?? make8004Client(opts.rpcUrl);
  return c.readContract({
    address: opts.identityRegistry ?? (ERC8004_IDENTITY_REGISTRY as Address),
    abi: IDENTITY_ABI,
    functionName: "ownerOf",
    args: [agentId],
  }) as Promise<Address>;
}

/**
 * Registration-file URI of an agentId (ERC-721 tokenURI).
 * @param agentId Agent token id.
 * @param opts RPC/registry overrides.
 * @param client Optional injected public client.
 * @returns tokenURI string.
 */
export async function getAgentURI(agentId: bigint, opts: Erc8004Options = {}, client?: PublicClient): Promise<string> {
  const c = client ?? make8004Client(opts.rpcUrl);
  return c.readContract({
    address: opts.identityRegistry ?? (ERC8004_IDENTITY_REGISTRY as Address),
    abi: IDENTITY_ABI,
    functionName: "tokenURI",
    args: [agentId],
  }) as Promise<string>;
}

/** Full 8004 identity for an agentId (owner + registration URI). */
export interface Agent8004Identity {
  /** ERC-721 agent token id. */
  agentId: bigint;
  /** Current owner address of the agentId. */
  owner: Address;
  /** Registration-file URI (tokenURI) for the agent. */
  tokenURI: string;
}

/**
 * Full 8004 identity for an agentId: owner + registration URI.
 * @param agentId Agent token id.
 * @param opts RPC/registry overrides.
 * @param client Optional injected public client.
 * @returns Agent8004Identity with owner and tokenURI.
 */
export async function resolveAgent8004(agentId: bigint, opts: Erc8004Options = {}, client?: PublicClient): Promise<Agent8004Identity> {
  const c = client ?? make8004Client(opts.rpcUrl);
  const [owner, tokenURI] = await Promise.all([getAgentOwner(agentId, opts, c), getAgentURI(agentId, opts, c)]);
  return { agentId, owner, tokenURI };
}

/** Fixed-point feedback payload for giveFeedback (value built via feedbackValueFromPercent). */
export interface FeedbackInput {
  /** Target agentId to rate. */
  agentId: bigint;
  /** Signed fixed-point score (int128). Use feedbackValueFromPercent() to build. */
  value: bigint;
  /** Decimals for value, 0-18. */
  valueDecimals: number;
  /** Optional primary tag filter (e.g. "aegis"). */
  tag1?: string;
  /** Optional secondary tag filter (e.g. "signal"). */
  tag2?: string;
  /** Optional service endpoint the feedback refers to. */
  endpoint?: string;
  /** Optional off-chain feedback file URI. */
  feedbackURI?: string;
  /** keccak256 of the off-chain feedback file; zero-hash when none. */
  feedbackHash?: Hash;
}

/** Zero hash used when a feedback post has no off-chain file. */
export const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Build a fixed-point feedback value from a 0-100 percent score (2 decimals).
 * @param pct Score in percent (0-100).
 * @returns Fixed-point { value, valueDecimals: 2 }.
 */
export function feedbackValueFromPercent(pct: number): { value: bigint; valueDecimals: number } {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error(`pct out of range 0-100: ${pct}`);
  return { value: BigInt(Math.round(pct * 100)), valueDecimals: 2 };
}

/**
 * Post client feedback for an agent (writer; agent owner/operator cannot self-rate).
 * @param input Feedback payload (agentId, fixed-point value, tags, endpoint, hash).
 * @param wallet Caller-supplied wallet client (broadcasts).
 * @param opts Registry overrides.
 * @returns Feedback tx hash.
 */
export async function giveFeedback(input: FeedbackInput, wallet: Erc8004Wallet, opts: Erc8004Options = {}): Promise<Hash> {
  return wallet.writeContract({
    address: opts.reputationRegistry ?? (ERC8004_REPUTATION_REGISTRY as Address),
    abi: REPUTATION_ABI,
    functionName: "giveFeedback",
    args: [
      input.agentId,
      input.value,
      input.valueDecimals,
      input.tag1 ?? "",
      input.tag2 ?? "",
      input.endpoint ?? "",
      input.feedbackURI ?? "",
      input.feedbackHash ?? (ZERO_HASH as Hash),
    ],
    chain: wallet.chain ?? sepolia,
  });
}

/** Aggregate reputation read from getSummary (count + fixed-point value). */
export interface ReputationSummary {
  /** Number of feedback entries matching the scope. */
  count: bigint;
  /** Aggregate fixed-point value (int128). */
  summaryValue: bigint;
  /** Decimals for summaryValue (0-18). */
  summaryValueDecimals: number;
}

/**
 * Aggregate reputation for an agent. clientAddresses MUST be non-empty
 * (spec rule — unscoped reads are Sybil-prone); tag1/tag2 are optional filters.
 * @param agentId Agent token id.
 * @param clientAddresses Non-empty scope of client addresses (Sybil rule).
 * @param tag1 Optional tag filter.
 * @param tag2 Optional tag filter.
 * @param opts RPC/registry overrides.
 * @param client Optional injected public client.
 * @returns ReputationSummary with count and fixed-point value.
 */
export async function getSummary(
  agentId: bigint,
  clientAddresses: Address[],
  tag1 = "",
  tag2 = "",
  opts: Erc8004Options = {},
  client?: PublicClient,
): Promise<ReputationSummary> {
  if (clientAddresses.length === 0) throw new Error("getSummary requires a non-empty clientAddresses scope (Sybil rule).");
  const c = client ?? make8004Client(opts.rpcUrl);
  const [count, summaryValue, summaryValueDecimals] = await c.readContract({
    address: opts.reputationRegistry ?? (ERC8004_REPUTATION_REGISTRY as Address),
    abi: REPUTATION_ABI,
    functionName: "getSummary",
    args: [agentId, clientAddresses, tag1, tag2],
  });
  return { count, summaryValue, summaryValueDecimals };
}

// --- Registration JSON (EIP-8004 registration v1) ---

/** One advertised service entry in an EIP-8004 registration file. */
export interface RegistrationService {
  /** Service name (e.g. "MCP"). */
  name: string;
  /** Service endpoint URL. */
  endpoint: string;
  /** Optional service version. */
  version?: string;
}

/** EIP-8004 registration-v1 file shape (hosted at the tokenURI). */
export interface AgentRegistration {
  /** Registration type discriminator (EIP-8004 registration v1 URL). */
  type: string;
  /** Agent display name. */
  name: string;
  /** Agent description. */
  description: string;
  /** Optional image URL. */
  image?: string;
  /** Advertised services (MCP/A2A endpoints). */
  services: RegistrationService[];
  /** Whether the agent advertises x402 payment support. */
  x402Support: boolean;
  /** Whether the agent is currently active. */
  active: boolean;
}

/** Field overrides for buildSentinel1Registration (defaults describe sentinel-1). */
export interface Sentinel1Overrides {
  /** Override for the registration name. */
  name?: string;
  /** Override for the registration description. */
  description?: string;
  /** Override for the registration image URL. */
  image?: string;
  /** Override for the advertised services. */
  services?: RegistrationService[];
  /** Override for x402Support flag. */
  x402Support?: boolean;
  /** Override for active flag. */
  active?: boolean;
}

/**
 * Registration file for sentinel-1 (sentinel-1.aegis.eth): advertises the MCP
 * endpoint, flags x402 payment support, marks the agent active.
 * Host the JSON (IPFS/HTTPS) and pass the URI to registerAgent().
 * @param overrides Field overrides for the default sentinel-1 registration.
 * @returns AgentRegistration object ready to pin/host.
 */
export function buildSentinel1Registration(overrides: Sentinel1Overrides = {}): AgentRegistration {
  return {
    type: ERC8004_REGISTRATION_TYPE,
    name: overrides.name ?? "varanasi sentinel-1",
    description:
      overrides.description ??
      "varanasi sentinel agent: ENSv2-gated market intel (The Graph) with x402-paid alpha signals. Sepolia + Hedera testnet.",
    ...(overrides.image !== undefined ? { image: overrides.image } : {}),
    services: overrides.services ?? [{ name: "MCP", endpoint: SENTINEL1_MCP_ENDPOINT }],
    x402Support: overrides.x402Support ?? true,
    active: overrides.active ?? true,
  };
}

/**
 * Pretty-printed sentinel-1 registration JSON, ready to pin/host.
 * @param overrides Field overrides for the default sentinel-1 registration.
 * @returns JSON string of the registration file.
 */
export function sentinel1RegistrationJson(overrides: Sentinel1Overrides = {}): string {
  return JSON.stringify(buildSentinel1Registration(overrides), null, 2);
}
