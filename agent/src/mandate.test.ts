import { describe, it, expect } from "vitest";
import { encodeAbiParameters, getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  MANDATE_DOMAIN_NAME,
  MANDATE_DOMAIN_VERSION,
  MANDATE_TYPE_STRING,
  MANDATE_TYPEHASH,
  SEPOLIA_CHAIN_ID,
  TASK_ESCROW_ADDRESS,
  mandateDigest,
  mandateDomain,
  mandateFromJson,
  mandateStructHash,
  mandateTaskId,
  mandateToJson,
  randomNonce,
  signMandate,
  timeNonce,
  validateMandate,
  verifyMandate,
  type Mandate,
} from "./mandate.js";

/** Throwaway test key — generated at runtime, never persisted or funded. */
const TEST_KEY = generatePrivateKey();
const TEST_PAYER = privateKeyToAccount(TEST_KEY).address;

const AGENT = "0x1111111111111111111111111111111111111111" as Address;
const MERCHANT = "0x2222222222222222222222222222222222222222" as Address;
const TOKEN = "0x3333333333333333333333333333333333333333" as Address;

function goodMandate(): Mandate {
  return {
    agent: AGENT,
    merchant: MERCHANT,
    token: TOKEN,
    cap: 1_000_000n,
    windowStart: 1_700_000_000n,
    windowEnd: 1_700_086_400n,
    expiry: 1_700_172_800n,
    nonce: 7n,
    chainId: BigInt(SEPOLIA_CHAIN_ID),
  };
}

describe("mandate domain (locked)", () => {
  it("binds name/version/Sepolia/live escrow", () => {
    expect(MANDATE_DOMAIN_NAME).toBe("VaranasiTaskEscrow");
    expect(MANDATE_DOMAIN_VERSION).toBe("1");
    expect(SEPOLIA_CHAIN_ID).toBe(11155111);
    expect(TASK_ESCROW_ADDRESS).toBe("0xba038d50d70cf63ced17f3f23f77df4783f188da");
    const d = mandateDomain();
    expect(d).toMatchObject({
      name: "VaranasiTaskEscrow",
      version: "1",
      chainId: 11155111,
      verifyingContract: TASK_ESCROW_ADDRESS,
    });
  });

  it("type string matches docs/MANDATE.md and TYPEHASH is its keccak", () => {
    expect(MANDATE_TYPE_STRING).toBe(
      "Mandate(address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)",
    );
    expect(MANDATE_TYPEHASH).toBe(keccak256(toHex(MANDATE_TYPE_STRING)));
  });
});

describe("validateMandate", () => {
  it("accepts a well-formed mandate", () => {
    expect(() => validateMandate(goodMandate())).not.toThrow();
  });

  it("rejects zero addresses / zero cap / bad window / wrong chain", () => {
    const zero = "0x0000000000000000000000000000000000000000" as Address;
    expect(() => validateMandate({ ...goodMandate(), agent: zero })).toThrow("ZeroAgent");
    expect(() => validateMandate({ ...goodMandate(), merchant: zero })).toThrow("ZeroMerchant");
    expect(() => validateMandate({ ...goodMandate(), token: zero })).toThrow("ZeroToken");
    expect(() => validateMandate({ ...goodMandate(), cap: 0n })).toThrow("ZeroCap");
    expect(() => validateMandate({ ...goodMandate(), windowStart: 5n, windowEnd: 4n })).toThrow("BadWindow");
    expect(() => validateMandate({ ...goodMandate(), chainId: 1n })).toThrow("ChainIdMismatch");
  });

  it("rejects windowEnd > expiry (want windowStart<=windowEnd<=expiry)", () => {
    expect(() => validateMandate({ ...goodMandate(), windowEnd: 1_700_172_801n })).toThrow("BadExpiry");
  });

  it("enforces future-bounded expiry only when a clock is provided", () => {
    const now = 1_700_000_000;
    // Fixture expiry (1_700_172_800) is after now and within 366d → passes.
    expect(() => validateMandate(goodMandate(), BigInt(SEPOLIA_CHAIN_ID), { nowSec: now })).not.toThrow();
    // Already-expired mandate → Expired.
    expect(() =>
      validateMandate({ ...goodMandate(), windowStart: 1n, windowEnd: 2n, expiry: 3n }, BigInt(SEPOLIA_CHAIN_ID), { nowSec: now }),
    ).toThrow("Expired");
    // Unbounded lockup → ExpiryTooLong.
    expect(() =>
      validateMandate(
        { ...goodMandate(), windowEnd: 9_999_999_999n, expiry: 9_999_999_999n },
        BigInt(SEPOLIA_CHAIN_ID),
        { nowSec: now },
      ),
    ).toThrow("ExpiryTooLong");
    // No clock → historical vectors still validate (offline compat).
    expect(() => validateMandate({ ...goodMandate(), windowStart: 1n, windowEnd: 2n, expiry: 3n })).not.toThrow();
  });

  it("rejects uint64 overflow on window/expiry", () => {
    const huge = 2n ** 64n;
    expect(() => validateMandate({ ...goodMandate(), expiry: huge, windowEnd: huge })).toThrow("BadExpiry");
  });

  it("signMandate enforces the same sanity when nowSec is passed", async () => {
    const now = 1_700_000_000;
    await expect(signMandate(goodMandate(), TEST_KEY, { nowSec: now })).resolves.toBeTruthy();
    await expect(
      signMandate({ ...goodMandate(), windowEnd: 1_700_172_801n }, TEST_KEY, { nowSec: now }),
    ).rejects.toThrow("BadExpiry");
  });
});

describe("sign/verify roundtrip (offline)", () => {
  it("recovers the payer and verifies against expectedSigner", async () => {
    const signed = await signMandate(goodMandate(), TEST_KEY);
    expect(getAddress(signed.signer)).toBe(TEST_PAYER);
    expect(signed.digest).toBe(mandateDigest(goodMandate()));
    await expect(
      verifyMandate(signed.mandate, signed.signature, { expectedSigner: TEST_PAYER }).then(getAddress),
    ).resolves.toBe(TEST_PAYER);
  });

  it("tampered field changes the digest and fails expectedSigner", async () => {
    const signed = await signMandate(goodMandate(), TEST_KEY);
    const tampered = { ...goodMandate(), cap: 2_000_000n };
    expect(mandateDigest(tampered)).not.toBe(signed.digest);
    await expect(
      verifyMandate(tampered, signed.signature, { expectedSigner: TEST_PAYER }),
    ).rejects.toThrow("BadSig");
  });

  it("taskId is keccak256(abi.encode(digest)) — domain-bound", async () => {
    const signed = await signMandate(goodMandate(), TEST_KEY);
    expect(signed.taskId).toBe(
      keccak256(encodeAbiParameters([{ type: "bytes32" }], [signed.digest])),
    );
    expect(signed.taskId).toBe(mandateTaskId(goodMandate()));
    // Same fields on another chain → different taskId (cross-chain replay guard).
    expect(mandateTaskId({ ...goodMandate(), chainId: 1n }, { chainId: 1 })).not.toBe(signed.taskId);
  });

  it("structHash is stable and digest is deterministic", () => {
    expect(mandateStructHash(goodMandate())).toBe(mandateStructHash(goodMandate()));
    expect(mandateDigest(goodMandate())).toBe(mandateDigest(goodMandate()));
  });
});

describe("mandate JSON + nonces", () => {
  it("toJson/fromJson roundtrips bigints as decimal strings", () => {
    const j = mandateToJson(goodMandate());
    expect(j.cap).toBe("1000000");
    expect(mandateFromJson(j)).toEqual(goodMandate());
  });

  it("randomNonce is unique uint256; timeNonce embeds wall-clock ms", () => {
    const a = randomNonce();
    const b = randomNonce();
    expect(a).toBeGreaterThan(0n);
    expect(a).not.toBe(b);
    const now = 1_700_000_000_000;
    expect(timeNonce(now) >> 64n).toBe(BigInt(now));
  });
});
