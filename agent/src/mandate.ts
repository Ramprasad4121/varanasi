/**
 * @author Ramprasad — offline EIP-712 mandate signing for TaskEscrow (signMandate, verifyMandate; no env, no RPC).
 * mandate.ts — agent-side EIP-712 mandate signing for VaranasiTaskEscrow.
 *
 * One signed object authorizes one escrowed task. The human owner (payer)
 * signs; the agent (or anyone) submits via `fund(mandate, sig)` onchain.
 *
 * Locked per docs/MANDATE.md + contracts/src/TaskEscrow.sol:
 *  - Domain: { name: "VaranasiTaskEscrow", version: "1", chainId, verifyingContract }
 *  - Type:   "Mandate(address agent,address merchant,address token,uint256 cap,"
 *            "uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,"
 *            "uint256 chainId)"
 *  - taskId = keccak256(abi.encode(mandateDigest))
 *
 * This module is OFFLINE (pure viem crypto, no RPC, no env reads, no keys
 * stored). Live address constants below are informational defaults —
 * callers may override via function args / CLI flags.
 */
import { randomBytes } from "node:crypto";
// NOTE: signing uses the bytes API of @noble/curves (declared dep) instead of
// viem's privateKeyToAccount: viem@2.56.3 bundles @noble/curves@1.9.1, whose
// secp256k1 rejects hex-string keys ("invalid private key ... got string"),
// breaking ALL local signing (incl. the pre-existing `revoke` path).
// viem is retained for EIP-712 hashing, ABI encoding, and hex conversion.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  bytesToHex,
  encodeAbiParameters,
  hashTypedData,
  hexToBigInt,
  hexToBytes,
  keccak256,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";

/** Live VaranasiTaskEscrow on Sepolia (informational default). */
export const TASK_ESCROW_ADDRESS =
  "0xba038d50d70cf63ced17f3f23f77df4783f188da" as const;

/** Live RiskGuard on Sepolia (informational default). */
export const RISK_GUARD_ADDRESS =
  "0xc35861c4dbe63a9c8cfefd32c671998151c217ca" as const;

/** Live release bar in bps (informational default, owner-settable onchain). */
export const LIVE_THRESHOLD_BPS = 5000;

/** Sepolia chain id. */
export const SEPOLIA_CHAIN_ID = 11155111;

/** Locked EIP-712 domain name/version (matches TaskEscrow.sol EIP712 ctor). */
export const MANDATE_DOMAIN_NAME = "VaranasiTaskEscrow" as const;
export const MANDATE_DOMAIN_VERSION = "1" as const;

/** Locked Mandate type string (matches TaskEscrow.MANDATE_TYPEHASH). */
export const MANDATE_TYPE_STRING =
  "Mandate(address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)" as const;

/** keccak256 of the locked type string — must equal onchain MANDATE_TYPEHASH. */
export const MANDATE_TYPEHASH: Hash = keccak256(toHex(MANDATE_TYPE_STRING));

/**
 * Sepolia Etherscan link for an address (explorer-ready receipt field).
 * @param address Address to link.
 * @returns Etherscan address URL.
 */
export function sepoliaAddressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}

/**
 * Sepolia Etherscan link for a transaction hash (explorer-ready receipt field).
 * @param txHash Transaction hash to link.
 * @returns Etherscan transaction URL.
 */
export function sepoliaTxUrl(txHash: string): string {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

/** Mandate fields — mirrors TaskEscrow.Mandate (uints as bigint, no precision loss). */
export interface Mandate {
  /** Agent wallet authorized via ENS/AegisRegistry (re-checked live at release). */
  agent: Address;
  /** Merchant/payee who receives funds on release (single-merchant scope). */
  merchant: Address;
  /** ERC20 token for the escrow (USDC-first; no ETH path). */
  token: Address;
  /** Max escrowed amount in token base units. */
  cap: bigint;
  /** Validation window open (unix seconds, block.timestamp clock). */
  windowStart: bigint;
  /** Validation window close inclusive (unix seconds). */
  windowEnd: bigint;
  /** Refund gate: refund allowed iff block.timestamp > expiry (unix seconds). */
  expiry: bigint;
  /** Per-signer replay nullifier (arbitrary uint256, burned at fund). */
  nonce: bigint;
  /** EIP-712 + mandate chain id (must equal domain chainId). */
  chainId: bigint;
}

/** viem typed-data definition for the locked Mandate type. */
export const MANDATE_TYPES = {
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

/** EIP-712 domain overrides (escrow deployment + chain id). */
export interface MandateDomainOpts {
  /** TaskEscrow deployment address (domain verifyingContract). */
  verifyingContract?: Address;
  /** EIP-712 domain chain id (default: Sepolia). */
  chainId?: number;
}

/**
 * EIP-712 domain bound to one chain + one escrow deployment.
 * @param opts Domain overrides (verifyingContract, chainId).
 * @returns EIP-712 domain object.
 */
export function mandateDomain(opts: MandateDomainOpts = {}) {
  return {
    name: MANDATE_DOMAIN_NAME,
    version: MANDATE_DOMAIN_VERSION,
    chainId: opts.chainId ?? SEPOLIA_CHAIN_ID,
    verifyingContract: opts.verifyingContract ?? (TASK_ESCROW_ADDRESS as Address),
  } as const;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function isZeroAddress(a: string): boolean {
  return a.toLowerCase() === ZERO_ADDRESS;
}

/**
 * Static mandate checks mirroring TaskEscrow._checkMandate (minus the
 * block.timestamp / block.chainid liveness checks, which only the chain
 * can enforce at fund time). Throws on the first violation.
 * @param m Mandate to validate.
 * @param expectedChainId Chain id the mandate must bind to.
 * @returns void — throws on violation, otherwise returns normally.
 */
export function validateMandate(m: Mandate, expectedChainId: bigint = BigInt(SEPOLIA_CHAIN_ID)): void {
  if (isZeroAddress(m.agent)) throw new Error("ZeroAgent: mandate.agent is zero");
  if (isZeroAddress(m.merchant)) throw new Error("ZeroMerchant: mandate.merchant is zero");
  if (isZeroAddress(m.token)) throw new Error("ZeroToken: mandate.token is zero");
  if (m.cap <= 0n) throw new Error("ZeroCap: mandate.cap is zero");
  if (m.chainId !== expectedChainId) throw new Error(`ChainIdMismatch: mandate ${m.chainId} != ${expectedChainId}`);
  if (m.windowStart > m.windowEnd) throw new Error(`BadWindow: windowStart ${m.windowStart} > windowEnd ${m.windowEnd}`);
}

/**
 * EIP-712 struct hash (no domain) — mirrors TaskEscrow.mandateStructHash.
 * @param m Mandate to hash.
 * @returns Struct hash.
 */
export function mandateStructHash(m: Mandate): Hash {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        MANDATE_TYPEHASH,
        m.agent,
        m.merchant,
        m.token,
        m.cap,
        m.windowStart,
        m.windowEnd,
        m.expiry,
        m.nonce,
        m.chainId,
      ],
    ),
  );
}

/**
 * Full EIP-712 digest to sign — mirrors TaskEscrow.mandateDigest
 * (EIP-191 prefix + domain separator + struct hash).
 * @param m Mandate to digest.
 * @param opts Domain overrides (verifyingContract, chainId).
 * @returns EIP-712 signing digest.
 */
export function mandateDigest(m: Mandate, opts: MandateDomainOpts = {}): Hash {
  return hashTypedData({
    domain: mandateDomain(opts),
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: { ...m },
  });
}

/**
 * taskId derivation — mirrors TaskEscrow.mandateTaskId:
 * keccak256(abi.encode(digest)). Domain-bound, so ids differ across
 * chains and deployments.
 * @param m Mandate to derive the task id for.
 * @param opts Domain overrides (verifyingContract, chainId).
 * @returns Domain-bound taskId.
 */
export function mandateTaskId(m: Mandate, opts: MandateDomainOpts = {}): Hash {
  const digest = mandateDigest(m, opts);
  return keccak256(encodeAbiParameters([{ type: "bytes32" }], [digest]));
}

/** Signed mandate bundle: mandate plus signature, signer, digest, hashes, and taskId. */
export interface SignedMandate {
  /** Original mandate struct that was signed. */
  mandate: Mandate;
  /** 65-byte EIP-712 signature (r||s||v). */
  signature: Hash;
  /** Recovered payer signer address. */
  signer: Address;
  /** Full EIP-712 digest that was signed (EIP-191 + domain + struct hash). */
  digest: Hash;
  /** EIP-712 struct hash (no domain). */
  structHash: Hash;
  /** Domain-bound taskId = keccak256(abi.encode(digest)). */
  taskId: Hash;
}

/**
 * 65-byte uncompressed secp256k1 key → Ethereum address (viem-free, pure keccak).
 * @param pub 65-byte uncompressed public key (0x04 prefix).
 * @returns Derived Ethereum address.
 */
export function addressFromPublicKey(pub: Uint8Array): Address {
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("BadPubKey: expected 65-byte uncompressed key");
  const hash = keccak256(bytesToHex(pub.slice(1)));
  return `0x${hash.slice(-40)}` as Address;
}

function keyBytesFromPrivateKey(privateKey: Hex): Uint8Array {
  const keyBytes = hexToBytes(privateKey);
  if (keyBytes.length !== 32) throw new Error(`BadKey: expected 32 bytes, got ${keyBytes.length}`);
  return keyBytes;
}

/**
 * Payer address for a private key (offline, bytes API — see module note).
 * @param privateKey 32-byte secp256k1 private key.
 * @returns Derived payer address.
 */
export function addressFromPrivateKey(privateKey: Hex): Address {
  return addressFromPublicKey(secp256k1.getPublicKey(keyBytesFromPrivateKey(privateKey), false));
}

/**
 * Sign a mandate with a payer private key (offline, no RPC).
 * Validates static fields first, then EIP-712 signs with the
 * domain bound to the live escrow + Sepolia (overridable).
 * @param m Mandate to sign.
 * @param privateKey Payer signing key (in-memory only, never stored).
 * @param opts Domain overrides (verifyingContract, chainId).
 * @returns SignedMandate bundle (signature, signer, digest, taskId).
 */
export async function signMandate(
  m: Mandate,
  privateKey: Hex,
  opts: MandateDomainOpts = {},
): Promise<SignedMandate> {
  validateMandate(m, BigInt(opts.chainId ?? SEPOLIA_CHAIN_ID));
  const keyBytes = keyBytesFromPrivateKey(privateKey);
  const signer = addressFromPublicKey(secp256k1.getPublicKey(keyBytes, false));
  const digest = mandateDigest(m, opts);
  // `prehash: false` — digest is already the EIP-712 hash; `recovered`
  // format prefixes the recovery bit (rec || r || s).
  const raw = secp256k1.sign(hexToBytes(digest), keyBytes, { prehash: false, format: "recovered" });
  if (raw.length !== 65) throw new Error("BadSig: noble returned non-recovered signature");
  const rec = raw[0];
  if (rec !== 0 && rec !== 1) throw new Error(`BadSig: invalid recovery bit ${rec}`);
  const signature = bytesToHex(new Uint8Array([...raw.slice(1), rec + 27])) as Hash;
  return {
    mandate: m,
    signature,
    signer,
    digest,
    structHash: mandateStructHash(m),
    taskId: mandateTaskId(m, opts),
  };
}

/**
 * Verify a mandate signature offline: recovers the signer from the
 * domain-bound digest. Returns the recovered address; set
 * `expectedSigner` to enforce payer attribution (else BadSig onchain).
 * @param m Mandate that was signed.
 * @param signature 65-byte EIP-712 signature.
 * @param opts Domain overrides plus optional expectedSigner to enforce.
 * @returns Recovered signer address.
 */
export async function verifyMandate(
  m: Mandate,
  signature: Hash,
  opts: MandateDomainOpts & { expectedSigner?: Address } = {},
): Promise<Address> {
  const { expectedSigner, ...domainOpts } = opts;
  const sigBytes = hexToBytes(signature);
  if (sigBytes.length !== 65) throw new Error("BadSig: expected 65-byte signature");
  const v = sigBytes[64];
  const recovery = v === 27 ? 0 : v === 28 ? 1 : v === 0 || v === 1 ? v : -1;
  if (recovery < 0) throw new Error(`BadSig: invalid v ${v}`);
  const digest = mandateDigest(m, domainOpts);
  const sig = new secp256k1.Signature(
    hexToBigInt(bytesToHex(sigBytes.slice(0, 32))),
    hexToBigInt(bytesToHex(sigBytes.slice(32, 64))),
  ).addRecoveryBit(recovery);
  const recovered = addressFromPublicKey(sig.recoverPublicKey(hexToBytes(digest)).toBytes(false));
  if (expectedSigner && recovered.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new Error(`BadSig: recovered ${recovered} != expected ${expectedSigner}`);
  }
  return recovered;
}

// ── Nonce management ──
// Nonces are per-signer arbitrary nullifiers (NOT sequential): any fresh
// uint256 works; the chain burns usedNonce[signer][nonce] at fund.

/**
 * Fresh random uint256 nonce (collision-safe, no RPC needed).
 * @returns Random uint256 nonce.
 */
export function randomNonce(): bigint {
  return BigInt("0x" + randomBytes(32).toString("hex"));
}

/**
 * Nonce from unix-ms entropy (human-readable fallback; prefer randomNonce).
 * @param nowMs Unix time in ms (default: Date.now()).
 * @returns Time-scoped uint256 nonce.
 */
export function timeNonce(nowMs: number = Date.now()): bigint {
  const rand = BigInt("0x" + randomBytes(8).toString("hex")) % 2n ** 64n;
  return (BigInt(Math.max(0, Math.floor(nowMs))) << 64n) | rand;
}

/**
 * JSON-safe mandate (bigints → decimal strings) for CLI output / storage.
 * @param m Mandate to serialize.
 * @returns String-valued mandate record.
 */
export function mandateToJson(m: Mandate): Record<string, string> {
  return {
    agent: m.agent,
    merchant: m.merchant,
    token: m.token,
    cap: m.cap.toString(),
    windowStart: m.windowStart.toString(),
    windowEnd: m.windowEnd.toString(),
    expiry: m.expiry.toString(),
    nonce: m.nonce.toString(),
    chainId: m.chainId.toString(),
  };
}

/**
 * Parse a mandate back from JSON-safe form (validates static fields).
 * @param j String-valued mandate record from mandateToJson.
 * @returns Validated Mandate.
 */
export function mandateFromJson(j: Record<string, string>): Mandate {
  const m: Mandate = {
    agent: j.agent as Address,
    merchant: j.merchant as Address,
    token: j.token as Address,
    cap: BigInt(j.cap),
    windowStart: BigInt(j.windowStart),
    windowEnd: BigInt(j.windowEnd),
    expiry: BigInt(j.expiry),
    nonce: BigInt(j.nonce),
    chainId: BigInt(j.chainId),
  };
  validateMandate(m);
  return m;
}
