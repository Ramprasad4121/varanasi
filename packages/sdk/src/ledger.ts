/**
 * @author Ramprasad
 * Append-only, hash-chained ledger of every mandate, check, spend, denial and
 * revoke. There is no update or delete. Each entry commits to the previous
 * entry's hash, so any edit to history breaks verify().
 */
import { keccak256, toHex } from "viem";
import type { Hex, LedgerEntry, LedgerKind } from "./types.js";
import { toJson } from "./values.js";

export const ZERO_HASH = `0x${"0".repeat(64)}` as Hex;

/** Fields a caller supplies; seq, prevHash and hash are filled in by the ledger. */
export type LedgerInput = Omit<LedgerEntry, "seq" | "prevHash" | "hash">;

/** Filter for reading entries. */
export interface LedgerFilter {
  agent?: Hex;
  mandateId?: Hex;
  kind?: LedgerKind;
  sinceSeq?: number;
}

const FIELD_ORDER = [
  "seq",
  "kind",
  "at",
  "agent",
  "mandateId",
  "paymentId",
  "payee",
  "token",
  "amount",
  "category",
  "code",
  "reason",
  "memo",
  "prevHash",
] as const;

/** Canonical encoding hashed into `hash`: fixed key order, bigints as strings, undefined dropped. */
export function canonicalEntry(e: Omit<LedgerEntry, "hash">): string {
  const ordered: Record<string, unknown> = {};
  for (const k of FIELD_ORDER) {
    const v = (e as unknown as Record<string, unknown>)[k];
    if (v !== undefined) ordered[k] = v;
  }
  return toJson(ordered);
}

/** keccak256 of the canonical encoding. */
export function hashEntry(e: Omit<LedgerEntry, "hash">): Hex {
  return keccak256(toHex(canonicalEntry(e)));
}

/** Read access every backend's ledger offers. */
export interface LedgerReader {
  /** Copies of entries, optionally filtered. */
  entries(filter?: LedgerFilter): LedgerEntry[];
  /** Number of entries. */
  size(): number;
  /** Hash of the last entry (ZERO_HASH when empty). */
  head(): Hex;
  /** Recompute the whole chain. Returns the first bad seq, or -1 when intact. */
  verify(): number;
}

/** In-memory append-only ledger. */
export class MemoryLedger implements LedgerReader {
  readonly #entries: LedgerEntry[] = [];

  append(input: LedgerInput): LedgerEntry {
    const seq = this.#entries.length;
    const prevHash = seq === 0 ? ZERO_HASH : (this.#entries[seq - 1] as LedgerEntry).hash;
    const base = { ...stripUndefined(input), seq, prevHash } as Omit<LedgerEntry, "hash">;
    const entry = Object.freeze({ ...base, hash: hashEntry(base) }) as LedgerEntry;
    this.#entries.push(entry);
    return entry;
  }

  entries(filter: LedgerFilter = {}): LedgerEntry[] {
    const agent = filter.agent?.toLowerCase();
    const mandateId = filter.mandateId?.toLowerCase();
    return this.#entries
      .filter(
        (e) =>
          (agent === undefined || e.agent === agent) &&
          (mandateId === undefined || e.mandateId === mandateId) &&
          (filter.kind === undefined || e.kind === filter.kind) &&
          (filter.sinceSeq === undefined || e.seq >= filter.sinceSeq),
      )
      .map((e) => ({ ...e }));
  }

  size(): number {
    return this.#entries.length;
  }

  head(): Hex {
    return this.#entries.length === 0 ? ZERO_HASH : (this.#entries[this.#entries.length - 1] as LedgerEntry).hash;
  }

  verify(): number {
    return verifyChain(this.#entries);
  }
}

/** Verify any list of entries (for example one exported as JSON). -1 means intact. */
export function verifyChain(entries: readonly LedgerEntry[]): number {
  let prev = ZERO_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as LedgerEntry;
    const { hash, ...rest } = e;
    if (e.seq !== i || e.prevHash !== prev || hashEntry(rest) !== hash) return i;
    prev = hash;
  }
  return -1;
}

function stripUndefined<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}
