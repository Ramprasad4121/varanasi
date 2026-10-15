/**
 * @author Ramprasad
 * Input parsing for amounts, addresses, categories. Every external value goes
 * through here before it touches gate math, so the math only ever sees
 * validated uint256 bigints and lowercase addresses.
 */
import { randomBytes } from "node:crypto";
import type { Address } from "./types.js";

/** Largest value a uint256 can hold. Caps and amounts must fit, matching the contracts. */
export const MAX_UINT256 = 2n ** 256n - 1n;
/** Largest value a uint64 can hold (validFrom / validUntil are uint64 onchain). */
export const MAX_UINT64 = 2n ** 64n - 1n;
/** Limits that keep a signed mandate small enough to verify cheaply. */
export const MAX_PAYEES = 64;
export const MAX_CATEGORIES = 32;
export const MAX_CATEGORY_LENGTH = 64;
export const MAX_PAYMENT_ID_LENGTH = 128;
export const MAX_MEMO_LENGTH = 280;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** Thrown for any malformed input. `code` is stable. */
export class VaranasiInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "VaranasiInputError";
    this.code = code;
  }
}

/**
 * Parse an unsigned integer in [0, max]. Accepts bigint, a safe integer
 * number, or a base-10 digit string (no sign, no decimals, no hex, no
 * exponent). Anything else throws, so "1e18", "-1", "0x10", 1.5 never reach
 * the math.
 */
export function parseUint(value: unknown, field: string, max: bigint = MAX_UINT256): bigint {
  let v: bigint;
  if (typeof value === "bigint") {
    v = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new VaranasiInputError("BadNumber", `${field} must be a safe integer, got ${value}`);
    }
    v = BigInt(value);
  } else if (typeof value === "string") {
    if (!/^[0-9]{1,78}$/.test(value)) {
      throw new VaranasiInputError("BadNumber", `${field} must be a base-10 integer string`);
    }
    v = BigInt(value);
  } else {
    throw new VaranasiInputError("BadNumber", `${field} is missing or not a number`);
  }
  if (v < 0n) throw new VaranasiInputError("BadNumber", `${field} must not be negative`);
  if (v > max) {
    throw new VaranasiInputError("Overflow", `${field} exceeds ${max === MAX_UINT64 ? "uint64" : "uint256"}`);
  }
  return v;
}

/** Validate and lowercase an address. Rejects the zero address unless allowZero. */
export function parseAddress(value: unknown, field: string, allowZero = false): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new VaranasiInputError("BadAddress", `${field} must be a 0x-prefixed 20 byte hex address`);
  }
  const lower = value.toLowerCase() as Address;
  if (!allowZero && lower === ZERO_ADDRESS) {
    throw new VaranasiInputError("ZeroAddress", `${field} must not be the zero address`);
  }
  return lower;
}

/** Normalize a category: trimmed, lowercase, 1..64 chars of [a-z0-9._:-]. */
export function parseCategory(value: unknown, field = "category"): string {
  if (typeof value !== "string") throw new VaranasiInputError("BadCategory", `${field} must be a string`);
  const c = value.trim().toLowerCase();
  if (c.length === 0 || c.length > MAX_CATEGORY_LENGTH || !/^[a-z0-9._:-]+$/.test(c)) {
    throw new VaranasiInputError("BadCategory", `${field} must be 1..${MAX_CATEGORY_LENGTH} chars of a-z 0-9 . _ : -`);
  }
  return c;
}

/** Sorted, de-duplicated, validated payee list. */
export function parsePayees(values: readonly unknown[] | undefined): Address[] {
  const list = values ?? [];
  if (!Array.isArray(list)) throw new VaranasiInputError("BadPayees", "payees must be an array");
  if (list.length > MAX_PAYEES) throw new VaranasiInputError("BadPayees", `at most ${MAX_PAYEES} payees`);
  return [...new Set(list.map((p, i) => parseAddress(p, `payees[${i}]`)))].sort();
}

/** Sorted, de-duplicated, validated category list. */
export function parseCategories(values: readonly unknown[] | undefined): string[] {
  const list = values ?? [];
  if (!Array.isArray(list)) throw new VaranasiInputError("BadCategories", "categories must be an array");
  if (list.length > MAX_CATEGORIES) {
    throw new VaranasiInputError("BadCategories", `at most ${MAX_CATEGORIES} categories`);
  }
  return [...new Set(list.map((c, i) => parseCategory(c, `categories[${i}]`)))].sort();
}

/** Fresh unpredictable uint256 nonce. */
export function randomNonce(): bigint {
  return BigInt(`0x${randomBytes(32).toString("hex")}`);
}

/** Current unix time in whole seconds as bigint. */
export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/** JSON.stringify replacer that renders bigint as a decimal string. */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** JSON with bigints as strings. */
export function toJson(value: unknown, space?: number): string {
  return JSON.stringify(value, bigintReplacer, space);
}
