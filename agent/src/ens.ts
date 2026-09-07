/**
 * @author Ramprasad — viem ENSv2 agent-subname resolver (resolveAgentSubname; env: SEPOLIA_RPC_URL, AEGIS_REGISTRY, ENSV2_UNIVERSAL_RESOLVER).
 * ens.ts — viem-based ENSv2 agent-subname resolver (Sepolia).
 *
 * resolveAgentSubname(name):
 *  1. Reads AegisRegistry (single source of truth): label hash → tokenId →
 *     { agentWallet, expiry, revoked, authorized }.
 *  2. If ENSV2_UNIVERSAL_RESOLVER is set, additionally resolves the name via
 *     Universal Resolver V2 wildcard (addr lookup) and reports whether the
 *     onchain ENS record agrees with the registry binding.
 *  3. If the ENS address is unset → registry-only fallback (documented, not an error).
 */
import { createPublicClient, http, keccak256, toHex, namehash, type Address, type PublicClient } from "viem";
import { sepolia } from "viem/chains";

/** Sepolia ENSv2 beta Universal Resolver V2 (docs.ens.domains → deployments → sepolia-ensv2-beta). */
export const DEFAULT_UNIVERSAL_RESOLVER = "0x4a1817D13E9cF196F471725176355C1234b63C70" as const;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "tokenByLabelHash",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "agentOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "expiry",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "revoked",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isAuthorized",
    stateMutability: "view",
    inputs: [{ name: "agentWallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Minimal Universal Resolver V2 `resolve(bytes,bytes)` ABI (single-shot addr lookup). */
const UR_V2_ABI = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "", type: "bytes" },
      { name: "", type: "address" },
    ],
  },
] as const;

/** addr(bytes32) selector payload for the inner V2 call. */
const ADDR_ABI = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** Resolved agent identity: registry binding plus optional ENS wildcard leg. */
export interface AgentIdentity {
  /** Full subname, e.g. "agent-1.aegis.eth". */
  name: string;
  sublabel: string;
  tokenId: bigint;
  agentWallet: Address;
  expiry: bigint;
  revoked: boolean;
  authorized: boolean;
  /** ENS wildcard resolution result (null when ENS addr unset → registry-only). */
  ensAddr: Address | null;
  ensMatchesRegistry: boolean | null;
  mode: "registry+ens" | "registry-only";
}

/** Overrides for RPC URL, registry, and Universal Resolver (env defaults apply). */
export interface EnsResolverOptions {
  /** Sepolia RPC URL override (default: env SEPOLIA_RPC_URL or public RPC). */
  rpcUrl?: string;
  /** AegisRegistry address override (default: env AEGIS_REGISTRY). */
  registry?: Address;
  /** Universal Resolver V2 address override (default: env ENSV2_UNIVERSAL_RESOLVER, null disables ENS leg). */
  universalResolver?: Address | null;
}

/**
 * Split a subname into its label and parent (lowercased, trimmed).
 * @param name Full subname, e.g. "agent-1.aegis.eth".
 * @returns Sublabel and parent domain.
 */
export function splitSubname(name: string): { sublabel: string; parent: string } {
  const normalized = name.toLowerCase().trim();
  const dot = normalized.indexOf(".");
  if (dot <= 0 || dot === normalized.length - 1) throw new Error(`Invalid agent subname: "${name}" (want <label>.<parent>, e.g. agent-1.aegis.eth)`);
  return { sublabel: normalized.slice(0, dot), parent: normalized.slice(dot + 1) };
}

/**
 * Build a Sepolia viem public client for registry/ENS reads.
 * @param rpcUrl Optional RPC URL (default: env SEPOLIA_RPC_URL or public Sepolia RPC).
 * @returns Sepolia PublicClient.
 */
export function makeClient(rpcUrl?: string): PublicClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl ?? process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org") });
}

/**
 * DNS wire-format encoding for ENS names (viem v2 has no public helper).
 * @param name Dotted ENS name to encode.
 * @returns 0x-prefixed DNS wire-format encoding.
 */
export function dnsEncodeName(name: string): `0x${string}` {
  const parts: number[] = [];
  for (const label of name.split(".")) {
    const bytes = new TextEncoder().encode(label);
    if (bytes.length === 0 || bytes.length > 63) throw new Error(`Invalid ENS label: "${label}"`);
    parts.push(bytes.length, ...bytes);
  }
  parts.push(0);
  return `0x${Buffer.from(parts).toString("hex")}` as `0x${string}`;
}

/**
 * Resolve an agent subname via AegisRegistry, plus the optional ENS wildcard leg.
 * @param name Agent subname, e.g. "agent-1.aegis.eth".
 * @param opts Resolver overrides (rpcUrl, registry, universalResolver).
 * @param client Optional injected viem public client.
 * @returns AgentIdentity with registry binding and ENS agreement flags.
 */
export async function resolveAgentSubname(name: string, opts: EnsResolverOptions = {}, client?: PublicClient): Promise<AgentIdentity> {
  const registry = (opts.registry ?? (process.env.AEGIS_REGISTRY as Address)) as Address;
  if (!registry) throw new Error("AEGIS_REGISTRY is not set — cannot resolve agent identity.");
  const { sublabel } = splitSubname(name);
  const c = client ?? makeClient(opts.rpcUrl);
  const labelHash = keccak256(toHex(sublabel));

  const tokenId = (await c.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "tokenByLabelHash", args: [labelHash] })) as bigint;
  if (tokenId === 0n) throw new Error(`Unknown agent subname: "${name}" (no token for label hash).`);
  const [agentWallet, expiry, revoked] = (await Promise.all([
    c.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "agentOf", args: [tokenId] }),
    c.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "expiry", args: [tokenId] }),
    c.readContract({ address: registry, abi: REGISTRY_ABI, functionName: "revoked", args: [tokenId] }),
  ])) as [Address, bigint, boolean];
  const authorized = (await c.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: "isAuthorized",
    args: [agentWallet],
  })) as boolean;

  // ENS V2 wildcard leg (optional).
  const urEnv = opts.universalResolver !== undefined ? opts.universalResolver : (process.env.ENSV2_UNIVERSAL_RESOLVER as Address | undefined);
  const ur = (urEnv || null) as Address | null;
  if (!ur) {
    return { name: name.toLowerCase(), sublabel, tokenId, agentWallet, expiry, revoked, authorized, ensAddr: null, ensMatchesRegistry: null, mode: "registry-only" };
  }
  let ensAddr: Address | null = null;
  try {
    const { encodeFunctionData, decodeFunctionResult } = await import("viem");
    const node = namehash(name.toLowerCase());
    const inner = encodeFunctionData({ abi: ADDR_ABI, functionName: "addr", args: [node] });
    const [ret] = (await c.readContract({
      address: ur,
      abi: UR_V2_ABI,
      functionName: "resolve",
      args: [dnsEncodeName(name.toLowerCase()), inner],
    })) as [`0x${string}`, Address];
    ensAddr = decodeFunctionResult({ abi: ADDR_ABI, functionName: "addr", data: ret }) as Address;
  } catch {
    ensAddr = null; // resolver miss / name unowned → report, don't throw
  }
  return {
    name: name.toLowerCase(),
    sublabel,
    tokenId,
    agentWallet,
    expiry,
    revoked,
    authorized,
    ensAddr,
    ensMatchesRegistry: ensAddr == null ? null : ensAddr.toLowerCase() === agentWallet.toLowerCase(),
    mode: "registry+ens",
  };
}
