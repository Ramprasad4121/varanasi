import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  type Address,
  type Hex,
  MAX_UINT256,
  recoverDigestSigner,
  SANDBOX_CHAIN_ID,
  type SignedMandate,
  SPEND_MANDATE_TYPE_STRING,
  SPEND_MANDATE_TYPEHASH,
  signedMandateFromJson,
  signedMandateToJson,
  signMandate,
  spendMandateDigest,
  spendMandateDomain,
  verifySignedMandate,
} from "../src/index.js";
import { AGENT, OWNER_KEY, owner, owner2, PAYEE, PAYEE2, T0, TOKEN } from "./helpers.js";

const domain = spendMandateDomain();
const base = { agent: AGENT, token: TOKEN, perTxCap: 5n, totalCap: 20n, validUntil: T0 + 3600n };
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function withSig(s: SignedMandate, signature: Hex): SignedMandate {
  return { ...s, signature };
}

describe("signMandate / verifySignedMandate", () => {
  it("signs a canonical mandate whose id is the EIP-712 digest", async () => {
    const mixedCase = `0x${PAYEE2.slice(2).toUpperCase()}` as Address;
    const s = await signMandate({ ...base, payees: [mixedCase, PAYEE] }, owner, { now: T0 });
    expect(s.mandate.principal).toBe(owner.address);
    expect(s.mandate.payees).toEqual([PAYEE, PAYEE2].sort());
    expect(s.mandate.validFrom).toBe(T0);
    expect(s.mandate.chainId).toBe(SANDBOX_CHAIN_ID);
    expect(s.id).toBe(spendMandateDigest(s.mandate, domain));
    expect(() => verifySignedMandate(s, domain, T0)).not.toThrow();
    expect(recoverDigestSigner(s.id, s.signature)).toBe(owner.address);
  });

  it("type hash matches the canonical type string", () => {
    expect(SPEND_MANDATE_TYPEHASH).toBe(keccak256(toHex(SPEND_MANDATE_TYPE_STRING)));
  });

  it("is compatible with a viem account signing typed data", async () => {
    const acct = privateKeyToAccount(OWNER_KEY);
    const s = await signMandate(
      base,
      { address: acct.address, signTypedData: (td) => acct.signTypedData(td) },
      { now: T0 },
    );
    expect(() => verifySignedMandate(s, domain, T0)).not.toThrow();
  });

  it("rejects any tampered field", async () => {
    const s = await signMandate(base, owner, { now: T0 });
    const tampered: SignedMandate = { ...s, mandate: { ...s.mandate, totalCap: 21n } };
    expect(() => verifySignedMandate(tampered, domain, T0)).toThrow(/BadId/);
    // id recomputed by an attacker still fails the signature check
    const retagged = { ...tampered, id: spendMandateDigest(tampered.mandate, domain) };
    expect(() => verifySignedMandate(retagged, domain, T0)).toThrow(/BadSig/);
  });

  it("rejects a signature by someone other than the principal", async () => {
    const s = await signMandate(base, owner, { now: T0 });
    const other = await signMandate(base, owner2, { now: T0 });
    expect(() => verifySignedMandate(withSig(s, other.signature), domain, T0)).toThrow(/BadSig/);
  });

  it("does not verify under another chain or verifying contract (cross-domain replay)", async () => {
    const s = await signMandate(base, owner, { now: T0 });
    const otherChain = spendMandateDomain({ chainId: 11155111n });
    expect(() => verifySignedMandate(s, otherChain, T0)).toThrow(/ChainIdMismatch/);
    const otherContract = spendMandateDomain({ verifyingContract: "0x00000000000000000000000000000000000000c1" });
    expect(() => verifySignedMandate(s, otherContract, T0)).toThrow(/BadId/);
  });

  it("rejects malleable (high s) and bad v signatures", async () => {
    const s = await signMandate(base, owner, { now: T0 });
    const sig = s.signature.slice(2);
    const r = sig.slice(0, 64);
    const sv = BigInt(`0x${sig.slice(64, 128)}`);
    const v = Number.parseInt(sig.slice(128), 16);
    const highS = (N - sv).toString(16).padStart(64, "0");
    const flippedV = (v === 27 ? 28 : 27).toString(16);
    expect(() => verifySignedMandate(withSig(s, `0x${r}${highS}${flippedV}`), domain, T0)).toThrow(/high s/);
    expect(() => verifySignedMandate(withSig(s, `0x${r}${sig.slice(64, 128)}05`), domain, T0)).toThrow(/v must be/);
    expect(() => verifySignedMandate(withSig(s, "0x1234"), domain, T0)).toThrow(/65 bytes/);
  });

  it("validates caps, window, lifetime and bounds", async () => {
    const o = { now: T0 };
    await expect(signMandate({ ...base, perTxCap: 0n }, owner, o)).rejects.toThrow(/ZeroCap/);
    await expect(signMandate({ ...base, perTxCap: 30n }, owner, o)).rejects.toThrow(/BadCaps/);
    await expect(signMandate({ ...base, totalCap: MAX_UINT256 + 1n, perTxCap: 1n }, owner, o)).rejects.toThrow(
      /Overflow/,
    );
    await expect(signMandate({ ...base, validUntil: T0 - 1n }, owner, o)).rejects.toThrow(/BadWindow|Expired/);
    await expect(signMandate({ ...base, validUntil: T0 + 367n * 86_400n }, owner, o)).rejects.toThrow(/TooLong/);
    await expect(signMandate({ ...base, validUntil: 2n ** 64n }, owner, o)).rejects.toThrow(/uint64/);
    await expect(signMandate({ ...base, perTxCap: "1e3" }, owner, o)).rejects.toThrow(/BadNumber/);
    await expect(signMandate({ ...base, perTxCap: -1 }, owner, o)).rejects.toThrow(/negative/);
    await expect(signMandate({ ...base, agent: owner.address }, owner, o)).rejects.toThrow(/SelfMandate/);
    await expect(signMandate({ ...base, categories: ["Bad Category!"] }, owner, o)).rejects.toThrow(/BadCategory/);
  });

  it("allows MAX_UINT256 caps exactly", async () => {
    const s = await signMandate({ ...base, perTxCap: MAX_UINT256, totalCap: MAX_UINT256 }, owner, { now: T0 });
    expect(s.mandate.totalCap).toBe(MAX_UINT256);
  });

  it("round trips through JSON and rejects non-canonical lists", async () => {
    const s = await signMandate({ ...base, categories: ["compute", "api"] }, owner, { now: T0 });
    const back = signedMandateFromJson(JSON.parse(JSON.stringify(signedMandateToJson(s))));
    expect(back).toEqual(s);
    expect(() => verifySignedMandate(back, domain, T0)).not.toThrow();
    const reordered = { ...back, mandate: { ...back.mandate, categories: ["compute", "api"] } };
    expect(() => verifySignedMandate(reordered, domain, T0)).toThrow(/NotCanonical/);
  });
});
