/**
 * @author Challenger (challenger_1)
 * @description Adversarial stress testing for TaskEscrow 14-field ABI decoding and HireWizard validation.
 */
import { describe, it, expect } from "vitest";
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionResult,
  isAddress,
  parseUnits,
  type Address,
  type Hash,
} from "viem";
import { TASK_ESCROW_ABI, TASK_STATES, readTask, taskState } from "./escrow.js";

const ESCROW = "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24" as Address;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const TASK_ID = ("0x" + "aa".repeat(32)) as Hash;

// Legacy 12-field ABI definition for adversarial comparison
const LEGACY_12_FIELD_ABI = [
  {
    type: "function",
    name: "tasks",
    stateMutability: "view",
    inputs: [{ name: "taskId", type: "bytes32" }],
    outputs: [
      { name: "payer", type: "address" },
      { name: "agent", type: "address" },
      { name: "merchant", type: "address" },
      { name: "token", type: "address" },
      { name: "cap", type: "uint256" },
      { name: "fundedAmount", type: "uint256" },
      { name: "windowStart", type: "uint64" },
      { name: "windowEnd", type: "uint64" },
      { name: "expiry", type: "uint64" },
      { name: "scoreBps", type: "uint256" },
      { name: "validator", type: "address" },
      { name: "state", type: "uint8" },
    ],
  },
] as const;

describe("Adversarial Challenge 1: TaskEscrow 14-field ABI Decoding", () => {
  const valid14Tuple = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address, // 0: payer
    "0x1111111111111111111111111111111111111111" as Address, // 1: agent
    "0x2222222222222222222222222222222222222222" as Address, // 2: merchant
    "0x6169A84cD7430042fb697c2cC131F663212E8b30" as Address, // 3: token
    10_000_000n, // 4: cap
    10_000_000n, // 5: fundedAmount
    1_700_000_000n, // 6: windowStart
    1_700_086_400n, // 7: windowEnd
    1_700_172_800n, // 8: expiry
    8_500n, // 9: scoreBps
    "0x4444444444444444444444444444444444444444" as Address, // 10: validator
    5_000n, // 11: pinnedThresholdBps
    "0x5555555555555555555555555555555555555555" as Address, // 12: pinnedValidator
    1, // 13: state (Funded)
  ] as const;

  it("decodes a full valid 14-field encoded return data correctly", () => {
    const encoded = encodeFunctionResult({
      abi: TASK_ESCROW_ABI,
      functionName: "tasks",
      result: valid14Tuple,
    });

    const decoded = decodeFunctionResult({
      abi: TASK_ESCROW_ABI,
      functionName: "tasks",
      data: encoded,
    }) as unknown as typeof valid14Tuple;

    expect(decoded).toHaveLength(14);
    expect(decoded[0]).toBe(valid14Tuple[0]);
    expect(decoded[11]).toBe(5_000n);
    expect(decoded[12]).toBe("0x5555555555555555555555555555555555555555");
    expect(decoded[13]).toBe(1);
  });

  it("throws AbiDecodingDataSizeTooSmallError when decoding legacy 12-field data against 14-field ABI", () => {
    const legacy12Tuple = [
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      "0x1111111111111111111111111111111111111111" as Address,
      "0x2222222222222222222222222222222222222222" as Address,
      "0x6169A84cD7430042fb697c2cC131F663212E8b30" as Address,
      10_000_000n,
      10_000_000n,
      1_700_000_000n,
      1_700_086_400n,
      1_700_172_800n,
      8_500n,
      "0x4444444444444444444444444444444444444444" as Address,
      1, // state in index 11
    ] as const;

    const legacyEncoded = encodeFunctionResult({
      abi: LEGACY_12_FIELD_ABI,
      functionName: "tasks",
      result: legacy12Tuple,
    });

    // 12 fields = 12 * 32 bytes = 384 bytes.
    // 14 fields requires 14 * 32 bytes = 448 bytes.
    // Viem MUST refuse to decode truncated calldata!
    expect(() =>
      decodeFunctionResult({
        abi: TASK_ESCROW_ABI,
        functionName: "tasks",
        data: legacyEncoded,
      })
    ).toThrow();
  });

  it("throws on truncated hex data (0x, 32 bytes, 100 bytes)", () => {
    // 0 bytes
    expect(() =>
      decodeFunctionResult({
        abi: TASK_ESCROW_ABI,
        functionName: "tasks",
        data: "0x",
      })
    ).toThrow();

    // 32 bytes (single word)
    expect(() =>
      decodeFunctionResult({
        abi: TASK_ESCROW_ABI,
        functionName: "tasks",
        data: ("0x" + "00".repeat(32)) as Hash,
      })
    ).toThrow();

    // 13 words (416 bytes, exactly 1 word short of 14 words)
    expect(() =>
      decodeFunctionResult({
        abi: TASK_ESCROW_ABI,
        functionName: "tasks",
        data: ("0x" + "00".repeat(416)) as Hash,
      })
    ).toThrow();
  });

  it("readTask handles all-zeros tuple gracefully (non-existent task)", async () => {
    const zeroTuple = [
      ZERO_ADDRESS, // 0: payer
      ZERO_ADDRESS, // 1: agent
      ZERO_ADDRESS, // 2: merchant
      ZERO_ADDRESS, // 3: token
      0n, // 4: cap
      0n, // 5: fundedAmount
      0n, // 6: windowStart
      0n, // 7: windowEnd
      0n, // 8: expiry
      0n, // 9: scoreBps
      ZERO_ADDRESS, // 10: validator
      0n, // 11: pinnedThresholdBps
      ZERO_ADDRESS, // 12: pinnedValidator
      0, // 13: state (0 = None)
    ];

    const fakeClient = {
      readContract: async () => zeroTuple,
    };

    const task = await readTask(TASK_ID, { escrow: ESCROW }, fakeClient as never);
    expect(task.payer).toBe(ZERO_ADDRESS);
    expect(task.state).toBe(0);
    expect(task.label).toBe("None");
    expect(task.cap).toBe(0n);
  });

  it("readTask handles maximum boundary values (uint256 max, uint64 max)", async () => {
    const maxUint256 = (1n << 256n) - 1n;
    const maxUint64 = (1n << 64n) - 1n;

    const maxTuple = [
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address,
      "0x1111111111111111111111111111111111111111" as Address,
      "0x2222222222222222222222222222222222222222" as Address,
      "0x6169A84cD7430042fb697c2cC131F663212E8b30" as Address,
      maxUint256,
      maxUint256,
      maxUint64,
      maxUint64,
      maxUint64,
      maxUint256,
      "0x4444444444444444444444444444444444444444" as Address,
      maxUint256,
      "0x5555555555555555555555555555555555555555" as Address,
      5, // Cancelled
    ];

    const fakeClient = {
      readContract: async () => maxTuple,
    };

    const task = await readTask(TASK_ID, { escrow: ESCROW }, fakeClient as never);
    expect(task.cap).toBe(maxUint256);
    expect(task.windowStart).toBe(maxUint64);
    expect(task.state).toBe(5);
    expect(task.label).toBe("Cancelled");
  });

  it("taskState and readTask gracefully fallback to 'None' for out-of-range state enums", async () => {
    const invalidStateTuple = [...valid14Tuple];
    (invalidStateTuple as unknown[])[13] = 99; // unknown enum value

    const fakeClient1 = {
      readContract: async () => invalidStateTuple,
    };
    const task = await readTask(TASK_ID, { escrow: ESCROW }, fakeClient1 as never);
    expect(task.state).toBe(99);
    expect(task.label).toBe("None");

    const fakeClient2 = {
      readContract: async () => 255,
    };
    const st = await taskState(TASK_ID, { escrow: ESCROW }, fakeClient2 as never);
    expect(st.state).toBe(255);
    expect(st.label).toBe("None");
  });

  it("readTask safely handles missing index 13 without unhandled exception", async () => {
    const truncatedTuple = valid14Tuple.slice(0, 13); // index 13 is missing
    const fakeClient = {
      readContract: async () => truncatedTuple,
    };
    const task = await readTask(TASK_ID, { escrow: ESCROW }, fakeClient as never);
    expect(Number.isNaN(task.state)).toBe(true);
    expect(task.label).toBe("None");
  });
});

describe("Adversarial Challenge 2: HireWizard Input Validation Robustness", () => {
  // Pure validation oracle mirroring HireWizard.tsx lines 342-365
  function validateTerms(
    capVusd: string,
    windowHours: string,
    expiryDays: string,
    agentAddr: string,
    merchant: string
  ): string[] {
    const e: string[] = [];
    let cap: bigint | null = null;
    try {
      cap = parseUnits(capVusd.trim() || "0", 6);
      if (cap <= BigInt(0)) e.push("Cap must be more than 0 vUSD.");
    } catch {
      e.push("Cap must be a number like 10 or 2.5 (vUSD).");
    }
    const wh = Number(windowHours);
    if (!Number.isFinite(wh) || wh < 1 || wh > 720)
      e.push("Window must be 1–720 hours (how long validators may score).");
    const ed = Number(expiryDays);
    if (!Number.isFinite(ed) || ed < 1 || ed > 366)
      e.push("Expiry must be 1–366 days (refunds open after this).");
    if (Number.isFinite(wh) && Number.isFinite(ed) && wh * 3600 > ed * 86400)
      e.push("Window must fit inside expiry (shorten the window or extend expiry).");
    if (!isAddress(agentAddr) || agentAddr.toLowerCase() === ZERO_ADDRESS)
      e.push("Agent address must be a valid non-zero 0x address.");
    if (!isAddress(merchant)) e.push("Payout address must be a valid 0x address.");
    else if (merchant.toLowerCase() === agentAddr.toLowerCase())
      e.push("Payout address must differ from the agent address.");
    return e;
  }

  const VALID_AGENT = "0x1111111111111111111111111111111111111111";
  const VALID_MERCHANT = "0x2222222222222222222222222222222222222222";

  it("passes for valid normal inputs", () => {
    const errs = validateTerms("10", "24", "7", VALID_AGENT, VALID_MERCHANT);
    expect(errs).toHaveLength(0);
  });

  describe("Cap validation stress", () => {
    it("rejects zero values: '0', '0.000000', empty string, whitespace", () => {
      const zeroCases = ["0", "0.000000", "", "   ", "0.0"];
      for (const z of zeroCases) {
        const errs = validateTerms(z, "24", "7", VALID_AGENT, VALID_MERCHANT);
        expect(errs).toContain("Cap must be more than 0 vUSD.");
      }
    });

    it("rejects negative numbers: '-1', '-0.0001', '-100'", () => {
      const negCases = ["-1", "-0.0001", "-100"];
      for (const n of negCases) {
        const errs = validateTerms(n, "24", "7", VALID_AGENT, VALID_MERCHANT);
        // Either cap <= 0 error or parse error, must be caught!
        expect(errs.some((e) => e.includes("Cap"))).toBe(true);
      }
    });

    it("rejects malformed non-numbers: 'abc', '1.2.3', '0x10', 'NaN', '1e6'", () => {
      const badCases = ["abc", "1.2.3", "0x10", "NaN", "Infinity", "1e6"];
      for (const b of badCases) {
        const errs = validateTerms(b, "24", "7", VALID_AGENT, VALID_MERCHANT);
        expect(errs).toContain("Cap must be a number like 10 or 2.5 (vUSD).");
      }
    });

    it("rejects precision exceeding 6 decimals (dust beyond vUSD precision resolves to 0n)", () => {
      // 7 decimal places: parseUnits("0.0000001", 6) evaluates to 0n
      const dust = "0.0000001";
      const errs = validateTerms(dust, "24", "7", VALID_AGENT, VALID_MERCHANT);
      expect(errs).toContain("Cap must be more than 0 vUSD.");
    });
  });

  describe("Window & Expiry boundary stress", () => {
    it("validates window boundary limits [1, 720]", () => {
      expect(validateTerms("10", "1", "7", VALID_AGENT, VALID_MERCHANT)).toHaveLength(0);
      expect(validateTerms("10", "720", "31", VALID_AGENT, VALID_MERCHANT)).toHaveLength(0);

      // Underflow
      expect(validateTerms("10", "0", "7", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Window must be 1–720 hours (how long validators may score)."
      );
      expect(validateTerms("10", "-5", "7", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Window must be 1–720 hours (how long validators may score)."
      );

      // Overflow
      expect(validateTerms("10", "721", "31", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Window must be 1–720 hours (how long validators may score)."
      );
      expect(validateTerms("10", "99999", "31", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Window must be 1–720 hours (how long validators may score)."
      );
    });

    it("validates expiry boundary limits [1, 366]", () => {
      expect(validateTerms("10", "24", "1", VALID_AGENT, VALID_MERCHANT)).toHaveLength(0);
      expect(validateTerms("10", "24", "366", VALID_AGENT, VALID_MERCHANT)).toHaveLength(0);

      // Underflow
      expect(validateTerms("10", "24", "0", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Expiry must be 1–366 days (refunds open after this)."
      );
      expect(validateTerms("10", "24", "-1", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Expiry must be 1–366 days (refunds open after this)."
      );

      // Overflow
      expect(validateTerms("10", "24", "367", VALID_AGENT, VALID_MERCHANT)).toContain(
        "Expiry must be 1–366 days (refunds open after this)."
      );
    });

    it("rejects when window exceeds expiry (windowHours * 3600 > expiryDays * 86400)", () => {
      // 48 hours = 2 days > 1 day expiry
      const errs = validateTerms("10", "48", "1", VALID_AGENT, VALID_MERCHANT);
      expect(errs).toContain("Window must fit inside expiry (shorten the window or extend expiry).");

      // Boundary match: 24 hours = 1 day (fits inside, 24*3600 <= 1*86400)
      const validBoundary = validateTerms("10", "24", "1", VALID_AGENT, VALID_MERCHANT);
      expect(validBoundary).toHaveLength(0);
    });
  });

  describe("Address validation stress", () => {
    it("rejects zero address for agent", () => {
      const errs = validateTerms("10", "24", "7", ZERO_ADDRESS, VALID_MERCHANT);
      expect(errs).toContain("Agent address must be a valid non-zero 0x address.");
    });

    it("rejects malformed agent addresses", () => {
      const badAddrs = ["0x123", "0xZZZZ", "not_an_address", "0x" + "11".repeat(19)];
      for (const b of badAddrs) {
        const errs = validateTerms("10", "24", "7", b, VALID_MERCHANT);
        expect(errs).toContain("Agent address must be a valid non-zero 0x address.");
      }
    });

    it("rejects invalid merchant address", () => {
      const errs = validateTerms("10", "24", "7", VALID_AGENT, "0xbad");
      expect(errs).toContain("Payout address must be a valid 0x address.");
    });

    it("rejects when merchant is identical to agent (case-insensitive check)", () => {
      const sameAddr = "0x1111111111111111111111111111111111111111";
      // Case difference in hex characters with valid 0x prefix
      const sameAddrMixed = "0x" + "11".repeat(20).toUpperCase();
      const errs = validateTerms("10", "24", "7", sameAddr, sameAddrMixed);
      expect(errs).toContain("Payout address must differ from the agent address.");

      // If uppercase 0X prefix is supplied, it is rejected as invalid address
      const sameAddrUpperPrefix = "0X" + "11".repeat(20);
      const errs2 = validateTerms("10", "24", "7", sameAddr, sameAddrUpperPrefix);
      expect(errs2).toContain("Payout address must be a valid 0x address.");
    });
  });

  describe("Sublabel and TaskId validation regex stress", () => {
    it("strictly enforces sublabel regex /^[a-z0-9-]{1,32}$/", () => {
      const SUBLABEL_RE = /^[a-z0-9-]{1,32}$/;
      // Valid
      expect(SUBLABEL_RE.test("hire-scout")).toBe(true);
      expect(SUBLABEL_RE.test("scout-42")).toBe(true);
      expect(SUBLABEL_RE.test("a")).toBe(true);
      expect(SUBLABEL_RE.test("a".repeat(32))).toBe(true);

      // Invalid
      expect(SUBLABEL_RE.test("")).toBe(false); // empty
      expect(SUBLABEL_RE.test("a".repeat(33))).toBe(false); // > 32 chars
      expect(SUBLABEL_RE.test("hire_scout")).toBe(false); // underscore not allowed
      expect(SUBLABEL_RE.test("hire scout")).toBe(false); // spaces
      expect(SUBLABEL_RE.test("hire.scout")).toBe(false); // dot
      expect(SUBLABEL_RE.test("hire@scout")).toBe(false); // special char
      expect(SUBLABEL_RE.test("HireScout")).toBe(false); // uppercase
    });

    it("strictly enforces taskId regex /^0x[0-9a-fA-F]{64}$/", () => {
      const TASK_ID_RE = /^0x[0-9a-fA-F]{64}$/;
      // Valid
      expect(TASK_ID_RE.test("0x" + "ab".repeat(32))).toBe(true);
      expect(TASK_ID_RE.test("0x" + "00".repeat(32))).toBe(true);
      expect(TASK_ID_RE.test("0x" + "FF".repeat(32))).toBe(true);

      // Invalid
      expect(TASK_ID_RE.test("")).toBe(false);
      expect(TASK_ID_RE.test("0x" + "ab".repeat(31))).toBe(false); // 62 hex chars
      expect(TASK_ID_RE.test("0x" + "ab".repeat(33))).toBe(false); // 66 hex chars
      expect(TASK_ID_RE.test("ab".repeat(32))).toBe(false); // missing 0x prefix
      expect(TASK_ID_RE.test("0x" + "zz".repeat(32))).toBe(false); // non-hex
      expect(TASK_ID_RE.test("0x" + "ab".repeat(31) + "  ")).toBe(false); // whitespace
    });
  });
});
