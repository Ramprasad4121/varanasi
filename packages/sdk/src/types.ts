/**
 * @author Ramprasad
 * Core types for the Varanasi agent permission layer.
 *
 * Everything here runs on SANDBOX / TEST MONEY. Amounts are token base units
 * held as bigint so there is never any floating point or precision loss.
 */

/** 0x-prefixed 20 byte address. */
export type Address = `0x${string}`;
/** 0x-prefixed hex string. */
export type Hex = `0x${string}`;

/**
 * Identifies an agent. In this slice an agent is identified by its wallet
 * address, the same key AegisRegistry uses (`tokenByAgent[agentWallet]`).
 */
export type AgentId = Address;

/**
 * A spend mandate: the limits an owner (principal) grants one agent.
 * Signed by the principal with EIP-712 (see eip712.ts). Field names line up
 * with the MandateGateHook mandate on the hark/gate-jobs-erc8183 branch
 * (principal, agent, token, perJobCap/perTxCap, totalCap, validFrom,
 * validUntil) so a future onchain gate can verify the same intent.
 */
export interface SpendMandate {
  /** The human (or smart account) granting authority. Must be the EIP-712 signer. */
  principal: Address;
  /** The agent wallet allowed to spend under this mandate. */
  agent: AgentId;
  /** ERC-20 token the mandate covers (test token in the sandbox). */
  token: Address;
  /** Max amount for one payment, in token base units. */
  perTxCap: bigint;
  /** Max sum of all payments under this mandate, in token base units. */
  totalCap: bigint;
  /** Unix seconds; payments before this are denied. */
  validFrom: bigint;
  /** Unix seconds; payments at or after this are denied (expiry). */
  validUntil: bigint;
  /** Allowed payees. Empty array means any payee. Stored lowercase and sorted. */
  payees: readonly Address[];
  /** Allowed categories (lowercase, trimmed, sorted). Empty array means any category. */
  categories: readonly string[];
  /** Per-principal replay nullifier. A principal can register a nonce once. */
  nonce: bigint;
  /** Chain id the mandate binds to (also in the EIP-712 domain). */
  chainId: bigint;
}

/** Input to createMandate. Optional fields get safe defaults. */
export interface MandateParams {
  agent: AgentId;
  token: Address;
  perTxCap: bigint | string | number;
  totalCap: bigint | string | number;
  /** Unix seconds. Defaults to now. */
  validFrom?: bigint | string | number;
  /** Unix seconds (expiry). Required: a mandate never lasts forever. */
  validUntil: bigint | string | number;
  payees?: readonly Address[];
  categories?: readonly string[];
  /** Defaults to a CSPRNG uint256. */
  nonce?: bigint | string | number;
}

/** EIP-712 domain the mandate is signed under. */
export interface MandateDomain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: Address;
}

/** A mandate plus the principal's signature and its domain-bound id. */
export interface SignedMandate {
  mandate: SpendMandate;
  /** 65 byte r||s||v signature over the EIP-712 digest. */
  signature: Hex;
  /** EIP-712 digest. Also the mandate id. */
  id: Hex;
}

/** A payment an agent wants to make. */
export interface Payment {
  /**
   * Caller chosen unique id. The gate records each paymentId once, so the
   * same payment can never be spent twice (idempotency and replay guard).
   */
  paymentId: string;
  agent: AgentId;
  payee: Address;
  token: Address;
  /** Token base units. */
  amount: bigint | string | number;
  category?: string;
  /** Pin a mandate. When omitted the gate picks the first active mandate that allows it. */
  mandateId?: Hex;
  /** Free text memo for the ledger. Never put secrets here. */
  memo?: string;
}

/** Why a payment was denied. Stable codes; safe to switch on. */
export type DenyCode =
  | "INVALID_PAYMENT"
  | "INVALID_AMOUNT"
  | "AGENT_REVOKED"
  | "NO_MANDATE"
  | "UNKNOWN_MANDATE"
  | "MANDATE_REVOKED"
  | "AGENT_MISMATCH"
  | "TOKEN_MISMATCH"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "PAYEE_NOT_ALLOWED"
  | "CATEGORY_NOT_ALLOWED"
  | "OVER_PER_TX_CAP"
  | "OVER_TOTAL_CAP"
  | "DUPLICATE_PAYMENT";

/** Result of gate.check / gate.spend. */
export interface Decision {
  allowed: boolean;
  code: "OK" | DenyCode;
  /** Plain English reason, safe to show an owner. */
  reason: string;
  /** Mandate the decision was made against, when one applied. */
  mandateId?: Hex;
  /** Amount left under the mandate's totalCap after this payment (if it is spent). */
  remaining?: bigint;
  /** Unix seconds the decision was made at. */
  at: bigint;
}

/** Kinds of ledger entries. */
export type LedgerKind = "mandate_created" | "check" | "spend" | "spend_denied" | "agent_revoked" | "mandate_revoked";

/** One immutable, hash-chained ledger entry. */
export interface LedgerEntry {
  /** 0-based position. */
  seq: number;
  kind: LedgerKind;
  /** Unix seconds. */
  at: bigint;
  agent?: AgentId;
  mandateId?: Hex;
  paymentId?: string;
  payee?: Address;
  token?: Address;
  amount?: bigint;
  category?: string;
  code?: "OK" | DenyCode;
  reason?: string;
  memo?: string;
  /** Hash of the previous entry (zero hash for the first). */
  prevHash: Hex;
  /** keccak256 over the canonical encoding of this entry (minus `hash`). */
  hash: Hex;
}

/** Filter for listing mandates. */
export interface MandateFilter {
  agent?: AgentId;
  principal?: Address;
  /** When true, only mandates that are not revoked, inside their window, and not used up. */
  activeOnly?: boolean;
}

/** A registered mandate with its live state. */
export interface MandateRecord {
  signed: SignedMandate;
  spent: bigint;
  revoked: boolean;
  /** Unix seconds the mandate was registered. */
  createdAt: bigint;
}
