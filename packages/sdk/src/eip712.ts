/**
 * @author Ramprasad
 * EIP-712 typed data for spend mandates, plus offline signing and strict
 * signature recovery.
 *
 * Signing follows the same approach as agent/src/mandate.ts: viem for EIP-712
 * hashing, the @noble/curves bytes API for secp256k1 (see the note there on
 * viem's bundled noble rejecting hex keys).
 *
 * The domain binds chainId and verifyingContract, so a mandate signed for the
 * sandbox (chain 31337, zero verifyingContract by default) can never be
 * replayed against another chain or deployment.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hashTypedData, hexToBytes, keccak256, toHex } from "viem";
import type { Address, Hex, MandateDomain, SpendMandate } from "./types.js";
import { VaranasiInputError, ZERO_ADDRESS } from "./values.js";

/** Domain name for spend mandates. New in this slice; no spend-limit contract exists on main yet. */
export const SPEND_MANDATE_DOMAIN_NAME = "Varanasi Agent Permissions" as const;
export const SPEND_MANDATE_DOMAIN_VERSION = "1" as const;
/** Default sandbox chain id (anvil). */
export const SANDBOX_CHAIN_ID = 31337n;

/** Canonical EIP-712 type string. */
export const SPEND_MANDATE_TYPE_STRING =
  "SpendMandate(address principal,address agent,address token,uint256 perTxCap,uint256 totalCap,uint64 validFrom,uint64 validUntil,address[] payees,string[] categories,uint256 nonce,uint256 chainId)" as const;

/** keccak256 of the type string, for an onchain verifier to match. */
export const SPEND_MANDATE_TYPEHASH: Hex = keccak256(toHex(SPEND_MANDATE_TYPE_STRING));

/** viem typed data definition. Order must match SPEND_MANDATE_TYPE_STRING. */
export const SPEND_MANDATE_TYPES = {
  SpendMandate: [
    { name: "principal", type: "address" },
    { name: "agent", type: "address" },
    { name: "token", type: "address" },
    { name: "perTxCap", type: "uint256" },
    { name: "totalCap", type: "uint256" },
    { name: "validFrom", type: "uint64" },
    { name: "validUntil", type: "uint64" },
    { name: "payees", type: "address[]" },
    { name: "categories", type: "string[]" },
    { name: "nonce", type: "uint256" },
    { name: "chainId", type: "uint256" },
  ],
} as const;

/** Build a domain. Defaults: sandbox chain 31337, zero verifyingContract. */
export function spendMandateDomain(
  opts: Partial<Pick<MandateDomain, "chainId" | "verifyingContract">> = {},
): MandateDomain {
  return {
    name: SPEND_MANDATE_DOMAIN_NAME,
    version: SPEND_MANDATE_DOMAIN_VERSION,
    chainId: opts.chainId ?? SANDBOX_CHAIN_ID,
    verifyingContract: (opts.verifyingContract ?? ZERO_ADDRESS) as Address,
  };
}

/** Typed data object accepted by viem accounts (`account.signTypedData`). */
export function spendMandateTypedData(m: SpendMandate, domain: MandateDomain) {
  return {
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    types: SPEND_MANDATE_TYPES,
    primaryType: "SpendMandate" as const,
    message: {
      principal: m.principal,
      agent: m.agent,
      token: m.token,
      perTxCap: m.perTxCap,
      totalCap: m.totalCap,
      validFrom: m.validFrom,
      validUntil: m.validUntil,
      payees: [...m.payees],
      categories: [...m.categories],
      nonce: m.nonce,
      chainId: m.chainId,
    },
  };
}

/** EIP-712 digest (EIP-191 prefix + domain separator + struct hash). This is the mandate id. */
export function spendMandateDigest(m: SpendMandate, domain: MandateDomain): Hex {
  return hashTypedData(spendMandateTypedData(m, domain));
}

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = SECP256K1_N / 2n;

/** Ethereum address (lowercase) from a 65 byte uncompressed public key. */
export function addressFromPublicKey(pub: Uint8Array): Address {
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new VaranasiInputError("BadPubKey", "expected 65 byte uncompressed key");
  }
  return `0x${keccak256(bytesToHex(pub.slice(1))).slice(-40)}` as Address;
}

function keyBytes(privateKey: Hex): Uint8Array {
  if (typeof privateKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new VaranasiInputError("BadKey", "expected a 32 byte hex private key");
  }
  return hexToBytes(privateKey);
}

/** Lowercase address for a private key. */
export function addressFromPrivateKey(privateKey: Hex): Address {
  return addressFromPublicKey(secp256k1.getPublicKey(keyBytes(privateKey), false));
}

/** Sign a 32 byte digest; returns r||s||v with v in {27,28} and low s. */
export function signDigest(digest: Hex, privateKey: Hex): Hex {
  const raw = secp256k1.sign(hexToBytes(digest), keyBytes(privateKey), { prehash: false, format: "recovered" });
  if (raw.length !== 65) throw new Error("BadSig: unexpected signature length from signer");
  const rec = raw[0];
  if (rec !== 0 && rec !== 1) throw new Error(`BadSig: invalid recovery bit ${String(rec)}`);
  return bytesToHex(new Uint8Array([...raw.slice(1), rec + 27])) as Hex;
}

/**
 * Recover the signer of a digest. Strict: 65 bytes, v in {27,28}, r and s in
 * range, and s in the lower half of the curve order (EIP-2), so a signature
 * cannot be mutated into a second valid encoding.
 */
export function recoverDigestSigner(digest: Hex, signature: Hex): Address {
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new VaranasiInputError("BadSig", "signature must be 65 bytes of hex");
  }
  const bytes = hexToBytes(signature);
  const r = BigInt(bytesToHex(bytes.slice(0, 32)));
  const s = BigInt(bytesToHex(bytes.slice(32, 64)));
  const v = bytes[64];
  if (v !== 27 && v !== 28) throw new VaranasiInputError("BadSig", `v must be 27 or 28, got ${String(v)}`);
  if (r === 0n || r >= SECP256K1_N || s === 0n || s >= SECP256K1_N) {
    throw new VaranasiInputError("BadSig", "r or s out of range");
  }
  if (s > HALF_N) throw new VaranasiInputError("BadSig", "high s value (malleable signature)");
  const sig = new secp256k1.Signature(r, s).addRecoveryBit(v - 27);
  return addressFromPublicKey(sig.recoverPublicKey(hexToBytes(digest)).toBytes(false));
}
