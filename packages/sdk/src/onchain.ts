/**
 * @author Ramprasad
 * On-chain backend STUB, wired to the existing contracts' ABIs.
 *
 * What is real here:
 *  - Agent revocation is read from and written to AegisRegistry
 *    (isAuthorized / tokenByAgent / revokeAgent). An agent that is not live in
 *    the registry is treated as revoked, the same rule MandateGateHook uses.
 *  - toTaskEscrowMandate() turns one allowed payment into the existing
 *    TaskEscrow Mandate, under TaskEscrow's own EIP-712 domain
 *    ("VaranasiTaskEscrow", "1"), so it can be signed and funded with fund().
 *
 * What is still off chain (stub): spend mandates, spend totals, used nonces
 * and the ledger live in memory, because main has no spend-limit contract
 * yet. Test networks and test money only.
 */
import { encodeFunctionData, hashTypedData, keccak256, parseAbi, toHex } from "viem";
import { BackendError, MemoryBackend } from "./backend.js";
import type { Address, AgentId, Hex } from "./types.js";

/** Subset of contracts/src/AegisRegistry.sol. */
export const AEGIS_REGISTRY_ABI = parseAbi([
  "constructor(address _ensRegistry, address _ensResolver, address _universalResolver, string _parentName)",
  "function isAuthorized(address agentWallet) view returns (bool)",
  "function tokenByAgent(address) view returns (uint256)",
  "function tokenOwner(uint256) view returns (address)",
  "function revoked(uint256) view returns (bool)",
  "function revokeAgent(uint256 tokenId)",
  "function mintAgent(string sublabel, address agentWallet, uint256 expiryDays) returns (uint256 tokenId)",
  "event AgentRevoked(uint256 indexed tokenId, string sublabel, address indexed humanOwner)",
]);

/** Subset of contracts/src/TaskEscrow.sol. */
export const TASK_ESCROW_ABI = parseAbi([
  "struct Mandate { address agent; address merchant; address token; uint256 cap; uint64 windowStart; uint64 windowEnd; uint64 expiry; uint256 nonce; uint256 chainId; }",
  "function mandateDigest(Mandate m) view returns (bytes32)",
  "function mandateTaskId(Mandate m) view returns (bytes32)",
  "function fund(Mandate m, bytes sig) returns (bytes32 taskId)",
  "function taskState(bytes32 taskId) view returns (uint8)",
]);

/** Subset of contracts/src/RiskGuard.sol. */
export const RISK_GUARD_ABI = parseAbi([
  "function authorize(address agent, uint256 riskScoreBps, uint256 maxAllowedBps) returns (bool)",
]);

/** TaskEscrow's locked EIP-712 domain and type (same as agent/src/mandate.ts). */
export const TASK_ESCROW_DOMAIN_NAME = "VaranasiTaskEscrow" as const;
export const TASK_ESCROW_DOMAIN_VERSION = "1" as const;
export const TASK_ESCROW_MANDATE_TYPE_STRING =
  "Mandate(address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)" as const;
export const TASK_ESCROW_MANDATE_TYPEHASH: Hex = keccak256(toHex(TASK_ESCROW_MANDATE_TYPE_STRING));
export const TASK_ESCROW_MANDATE_TYPES = {
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
} as const;

/** TaskEscrow.Mandate in TypeScript. */
export interface TaskEscrowMandate {
  agent: Address;
  merchant: Address;
  token: Address;
  cap: bigint;
  windowStart: bigint;
  windowEnd: bigint;
  expiry: bigint;
  nonce: bigint;
  chainId: bigint;
}

/**
 * Express one gate-approved payment as a TaskEscrow mandate. The cap is the
 * payment amount, never the whole spend mandate. The owner still signs it.
 */
export function toTaskEscrowMandate(args: {
  agent: Address;
  payee: Address;
  token: Address;
  amount: bigint;
  windowStart: bigint;
  windowEnd: bigint;
  expiry: bigint;
  nonce: bigint;
  chainId: bigint;
}): TaskEscrowMandate {
  if (args.amount <= 0n) throw new BackendError("BadAmount", "amount must be positive");
  if (!(args.windowStart <= args.windowEnd && args.windowEnd <= args.expiry)) {
    throw new BackendError("BadWindow", "need windowStart <= windowEnd <= expiry");
  }
  return {
    agent: args.agent,
    merchant: args.payee,
    token: args.token,
    cap: args.amount,
    windowStart: args.windowStart,
    windowEnd: args.windowEnd,
    expiry: args.expiry,
    nonce: args.nonce,
    chainId: args.chainId,
  };
}

/** EIP-712 digest TaskEscrow.mandateDigest would return for this mandate and deployment. */
export function taskEscrowDigest(m: TaskEscrowMandate, verifyingContract: Address): Hex {
  return hashTypedData({
    domain: {
      name: TASK_ESCROW_DOMAIN_NAME,
      version: TASK_ESCROW_DOMAIN_VERSION,
      chainId: m.chainId,
      verifyingContract,
    },
    types: TASK_ESCROW_MANDATE_TYPES,
    primaryType: "Mandate",
    message: { ...m },
  });
}

/** Calldata for AegisRegistry.revokeAgent(tokenId). */
export function encodeRevokeAgent(tokenId: bigint): Hex {
  return encodeFunctionData({ abi: AEGIS_REGISTRY_ABI, functionName: "revokeAgent", args: [tokenId] });
}

/** Minimal read surface (a viem PublicClient satisfies it). */
export interface ChainReader {
  readContract(args: {
    address: Address;
    abi: typeof AEGIS_REGISTRY_ABI;
    functionName: "isAuthorized" | "tokenByAgent";
    args: readonly [Address];
  }): Promise<unknown>;
  waitForTransactionReceipt?(args: { hash: Hex }): Promise<{ status: string }>;
}

/** Minimal write surface (a viem WalletClient satisfies it). */
export interface ChainWriter {
  writeContract(args: {
    address: Address;
    abi: typeof AEGIS_REGISTRY_ABI;
    functionName: "revokeAgent";
    args: readonly [bigint];
    account: Address;
    chain: null;
  }): Promise<Hex>;
}

export interface OnchainBackendOptions {
  /** AegisRegistry address on the target test network. */
  registry: Address;
  reader: ChainReader;
  /** Optional: without a writer, revokeAgent records calldata for the owner to send. */
  writer?: ChainWriter;
  /** Account that owns the agent identities (the human owner). */
  ownerAccount?: Address;
}

/** Result of the last on-chain revoke attempt, for callers and the demo. */
export interface OnchainRevoke {
  agent: AgentId;
  tokenId: bigint;
  txHash?: Hex;
  /** Set when there was no writer: send this to the registry from the owner wallet. */
  calldata?: Hex;
}

export class OnchainBackend extends MemoryBackend {
  override readonly kind: string = "onchain";
  readonly #o: OnchainBackendOptions;
  lastRevoke: OnchainRevoke | undefined;

  constructor(opts: OnchainBackendOptions) {
    super();
    this.#o = opts;
  }

  /** Revoked locally, or not live in AegisRegistry (never minted, revoked or expired). */
  override async isAgentRevoked(agent: AgentId): Promise<boolean> {
    if (await super.isAgentRevoked(agent)) return true;
    const live = await this.#o.reader.readContract({
      address: this.#o.registry,
      abi: AEGIS_REGISTRY_ABI,
      functionName: "isAuthorized",
      args: [agent],
    });
    return live !== true;
  }

  /** Revoke locally first (instant, fail safe), then on AegisRegistry. */
  override async revokeAgent(agent: AgentId): Promise<void> {
    await super.revokeAgent(agent);
    const tokenId = (await this.#o.reader.readContract({
      address: this.#o.registry,
      abi: AEGIS_REGISTRY_ABI,
      functionName: "tokenByAgent",
      args: [agent],
    })) as bigint;
    if (tokenId === 0n) {
      this.lastRevoke = { agent, tokenId };
      return; // not live on chain (already revoked or never minted)
    }
    if (!this.#o.writer || !this.#o.ownerAccount) {
      this.lastRevoke = { agent, tokenId, calldata: encodeRevokeAgent(tokenId) };
      return;
    }
    const txHash = await this.#o.writer.writeContract({
      address: this.#o.registry,
      abi: AEGIS_REGISTRY_ABI,
      functionName: "revokeAgent",
      args: [tokenId],
      account: this.#o.ownerAccount,
      chain: null,
    });
    if (this.#o.reader.waitForTransactionReceipt) {
      const r = await this.#o.reader.waitForTransactionReceipt({ hash: txHash });
      if (r.status !== "success") throw new BackendError("RevokeTxFailed", `revokeAgent tx ${txHash} reverted`);
    }
    this.lastRevoke = { agent, tokenId, txHash };
  }
}
