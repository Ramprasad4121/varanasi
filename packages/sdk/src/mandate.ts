/**
 * @author Ramprasad
 * Build, sign and verify spend mandates.
 *
 * The owner (principal) signs. The agent never needs the owner's key: in a
 * real deployment the owner signs on their own device and hands the agent
 * only the SignedMandate.
 */
import {
  addressFromPrivateKey,
  recoverDigestSigner,
  signDigest,
  spendMandateDigest,
  spendMandateDomain,
  spendMandateTypedData,
} from "./eip712.js";
import type { Address, Hex, MandateDomain, MandateParams, SignedMandate, SpendMandate } from "./types.js";
import {
  MAX_UINT64,
  nowSeconds,
  parseAddress,
  parseCategories,
  parsePayees,
  parseUint,
  randomNonce,
  VaranasiInputError,
} from "./values.js";

/** Longest a mandate may live: 366 days. Keeps a forgotten mandate from living forever. */
export const MAX_MANDATE_LIFETIME_SEC = 366n * 24n * 60n * 60n;

/**
 * Anything that can sign for the principal. Either a raw digest signer
 * (localSigner) or a viem style account with signTypedData.
 */
export interface MandateSigner {
  address: Address;
  signDigest?: (digest: Hex) => Hex | Promise<Hex>;
  signTypedData?: (typedData: ReturnType<typeof spendMandateTypedData>) => Promise<Hex>;
}

/**
 * In-process signer from a private key. For the sandbox and tests only:
 * never put a real owner key in an agent process.
 */
export function localSigner(privateKey: Hex): MandateSigner {
  const address = addressFromPrivateKey(privateKey);
  return { address, signDigest: (digest) => signDigest(digest, privateKey) };
}

/**
 * Static checks on a mandate (no clock unless `now` is given):
 * non-zero addresses, 0 < perTxCap <= totalCap, uint bounds,
 * validFrom < validUntil, chainId matches the domain, canonical lists. With
 * `now`, also validUntil > now and lifetime <= MAX_MANDATE_LIFETIME_SEC.
 */
export function validateMandate(m: SpendMandate, domain: MandateDomain, now?: bigint): void {
  const principal = parseAddress(m.principal, "principal");
  const agent = parseAddress(m.agent, "agent");
  const token = parseAddress(m.token, "token");
  parseUint(m.perTxCap, "perTxCap");
  parseUint(m.totalCap, "totalCap");
  parseUint(m.validFrom, "validFrom", MAX_UINT64);
  parseUint(m.validUntil, "validUntil", MAX_UINT64);
  parseUint(m.nonce, "nonce");
  parseUint(m.chainId, "chainId");
  if (principal !== m.principal || agent !== m.agent || token !== m.token) {
    throw new VaranasiInputError("NotCanonical", "addresses must be lowercase");
  }
  if (m.principal === m.agent) throw new VaranasiInputError("SelfMandate", "principal and agent must differ");
  if (m.perTxCap === 0n) throw new VaranasiInputError("ZeroCap", "perTxCap must be greater than zero");
  if (m.totalCap === 0n) throw new VaranasiInputError("ZeroCap", "totalCap must be greater than zero");
  if (m.perTxCap > m.totalCap) throw new VaranasiInputError("BadCaps", "perTxCap must not exceed totalCap");
  if (m.validFrom >= m.validUntil) throw new VaranasiInputError("BadWindow", "validFrom must be before validUntil");
  if (m.chainId !== domain.chainId) {
    throw new VaranasiInputError("ChainIdMismatch", `mandate chainId ${m.chainId} != domain chainId ${domain.chainId}`);
  }
  const payees = parsePayees(m.payees);
  const cats = parseCategories(m.categories);
  if (payees.join() !== [...m.payees].join() || cats.join() !== [...m.categories].join()) {
    throw new VaranasiInputError("NotCanonical", "payees and categories must be lowercase, sorted and unique");
  }
  if (now !== undefined) {
    if (m.validUntil <= now) throw new VaranasiInputError("Expired", "validUntil is in the past");
    const start = m.validFrom > now ? m.validFrom : now;
    if (m.validUntil - start > MAX_MANDATE_LIFETIME_SEC) {
      throw new VaranasiInputError("TooLong", "mandate lifetime exceeds 366 days");
    }
  }
}

/** Turn loose params into a canonical, validated SpendMandate. */
export function buildMandate(
  params: MandateParams,
  principal: Address,
  opts: { domain?: MandateDomain; now?: bigint } = {},
): SpendMandate {
  const domain = opts.domain ?? spendMandateDomain();
  const now = opts.now ?? nowSeconds();
  const m: SpendMandate = {
    principal: parseAddress(principal, "principal"),
    agent: parseAddress(params.agent, "agent"),
    token: parseAddress(params.token, "token"),
    perTxCap: parseUint(params.perTxCap, "perTxCap"),
    totalCap: parseUint(params.totalCap, "totalCap"),
    validFrom: params.validFrom === undefined ? now : parseUint(params.validFrom, "validFrom", MAX_UINT64),
    validUntil: parseUint(params.validUntil, "validUntil", MAX_UINT64),
    payees: parsePayees(params.payees),
    categories: parseCategories(params.categories),
    nonce: params.nonce === undefined ? randomNonce() : parseUint(params.nonce, "nonce"),
    chainId: domain.chainId,
  };
  validateMandate(m, domain, now);
  return m;
}

/** Owner signs a mandate. Returns the mandate, signature and id (EIP-712 digest). */
export async function signMandate(
  params: MandateParams,
  signer: MandateSigner,
  opts: { domain?: MandateDomain; now?: bigint } = {},
): Promise<SignedMandate> {
  const domain = opts.domain ?? spendMandateDomain();
  const mandate = buildMandate(params, signer.address, { ...opts, domain });
  const id = spendMandateDigest(mandate, domain);
  let signature: Hex;
  if (signer.signDigest) signature = await signer.signDigest(id);
  else if (signer.signTypedData) signature = await signer.signTypedData(spendMandateTypedData(mandate, domain));
  else throw new VaranasiInputError("NoSigner", "signer must implement signDigest or signTypedData");
  const signed: SignedMandate = { mandate, signature, id };
  verifySignedMandate(signed, domain);
  return signed;
}

/**
 * Verify a signed mandate: canonical fields, id equals the domain-bound
 * digest, and the signature recovers to mandate.principal (EOA only in this
 * slice; ERC-1271 smart accounts are a follow up). Throws on failure.
 */
export function verifySignedMandate(signed: SignedMandate, domain: MandateDomain, now?: bigint): void {
  validateMandate(signed.mandate, domain, now);
  const digest = spendMandateDigest(signed.mandate, domain);
  if (typeof signed.id !== "string" || digest !== signed.id.toLowerCase()) {
    throw new VaranasiInputError("BadId", "mandate id does not match its EIP-712 digest for this domain");
  }
  const recovered = recoverDigestSigner(digest, signed.signature);
  if (recovered !== signed.mandate.principal) {
    throw new VaranasiInputError(
      "BadSig",
      `signature recovers to ${recovered}, not principal ${signed.mandate.principal}`,
    );
  }
}

/** Deep copy and freeze a signed mandate so stored state cannot be mutated through a shared reference. */
export function freezeSigned(s: SignedMandate): SignedMandate {
  const m = s.mandate;
  const mandate: SpendMandate = Object.freeze({
    ...m,
    payees: Object.freeze([...m.payees]),
    categories: Object.freeze([...m.categories]),
  });
  return Object.freeze({ id: s.id.toLowerCase() as Hex, signature: s.signature, mandate });
}

/** JSON safe form of a signed mandate (bigints as decimal strings). */
export function signedMandateToJson(s: SignedMandate) {
  const m = s.mandate;
  return {
    id: s.id,
    signature: s.signature,
    mandate: {
      principal: m.principal,
      agent: m.agent,
      token: m.token,
      perTxCap: m.perTxCap.toString(),
      totalCap: m.totalCap.toString(),
      validFrom: m.validFrom.toString(),
      validUntil: m.validUntil.toString(),
      payees: [...m.payees],
      categories: [...m.categories],
      nonce: m.nonce.toString(),
      chainId: m.chainId.toString(),
    },
  };
}

/** Parse the JSON form back. Does not verify; pass the result to verifySignedMandate. */
export function signedMandateFromJson(j: unknown): SignedMandate {
  if (typeof j !== "object" || j === null) throw new VaranasiInputError("BadJson", "signed mandate must be an object");
  const o = j as { id?: unknown; signature?: unknown; mandate?: Record<string, unknown> };
  const m = o.mandate;
  if (!m || typeof m !== "object") throw new VaranasiInputError("BadJson", "missing mandate");
  if (typeof o.id !== "string" || typeof o.signature !== "string") {
    throw new VaranasiInputError("BadJson", "missing id or signature");
  }
  if (!Array.isArray(m.payees ?? []) || !Array.isArray(m.categories ?? [])) {
    throw new VaranasiInputError("BadJson", "payees and categories must be arrays");
  }
  return {
    id: o.id.toLowerCase() as Hex,
    signature: o.signature as Hex,
    mandate: {
      principal: parseAddress(m.principal, "principal"),
      agent: parseAddress(m.agent, "agent"),
      token: parseAddress(m.token, "token"),
      perTxCap: parseUint(m.perTxCap, "perTxCap"),
      totalCap: parseUint(m.totalCap, "totalCap"),
      validFrom: parseUint(m.validFrom, "validFrom", MAX_UINT64),
      validUntil: parseUint(m.validUntil, "validUntil", MAX_UINT64),
      payees: (m.payees ?? []) as Address[],
      categories: (m.categories ?? []) as string[],
      nonce: parseUint(m.nonce, "nonce"),
      chainId: parseUint(m.chainId, "chainId"),
    },
  };
}
