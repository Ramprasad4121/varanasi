/**
 * @author Ramprasad
 * Pluggable state backend. The gate's rules live in gate.ts; a backend only
 * stores mandates, spend totals, used payment ids, used nonces, revocations
 * and the ledger. The Varanasi client serializes every write through one
 * lock, so a backend never sees two writes at once.
 *
 * MemoryBackend is the default sandbox backend (test money only).
 */
import { type LedgerInput, type LedgerReader, MemoryLedger } from "./ledger.js";
import { freezeSigned } from "./mandate.js";
import type { Address, AgentId, Hex, LedgerEntry, MandateFilter, MandateRecord, SignedMandate } from "./types.js";

/** Thrown when a backend refuses a write. `code` is stable. */
export class BackendError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "BackendError";
    this.code = code;
  }
}

export interface PermissionBackend {
  /** "memory", "onchain", or a custom name. */
  readonly kind: string;
  /** Store a verified mandate. Must reject a reused (principal, nonce) and a duplicate id. */
  registerMandate(signed: SignedMandate, now: bigint): Promise<void>;
  getMandate(id: Hex): Promise<MandateRecord | undefined>;
  /** Mandates in registration order. activeOnly needs `now`. */
  listMandates(filter?: MandateFilter, now?: bigint): Promise<MandateRecord[]>;
  isAgentRevoked(agent: AgentId): Promise<boolean>;
  revokeAgent(agent: AgentId): Promise<void>;
  revokeMandate(id: Hex): Promise<void>;
  /** Payment ids are scoped per agent, so one agent cannot burn another agent's ids. */
  hasPayment(agent: AgentId, paymentId: string): Promise<boolean>;
  /**
   * Record a spend. Must refuse (throw) if it would push spent above
   * totalCap, the amount is outside (0, perTxCap], the paymentId was already
   * used, or the mandate or agent is revoked: a second line of defence
   * behind the gate.
   * @returns the new spent total.
   */
  commitSpend(id: Hex, paymentId: string, amount: bigint): Promise<bigint>;
  appendLedger(input: LedgerInput): Promise<LedgerEntry>;
  readonly ledger: LedgerReader;
}

/** Is this record usable at `now`? (not revoked, inside its window, cap not used up) */
export function isActive(r: MandateRecord, now: bigint): boolean {
  const m = r.signed.mandate;
  return !r.revoked && now >= m.validFrom && now < m.validUntil && r.spent < m.totalCap;
}

function paymentKey(agent: AgentId, paymentId: string): string {
  return `${agent.toLowerCase()}:${paymentId}`;
}

/** In-memory sandbox backend. State lives for the life of the process. */
export class MemoryBackend implements PermissionBackend {
  readonly kind: string = "memory";
  readonly ledger = new MemoryLedger();
  readonly #mandates = new Map<Hex, MandateRecord>();
  readonly #order: Hex[] = [];
  readonly #usedNonces = new Map<Address, Set<bigint>>();
  readonly #payments = new Set<string>();
  readonly #revokedAgents = new Set<AgentId>();

  async registerMandate(signed: SignedMandate, now: bigint): Promise<void> {
    const frozen = freezeSigned(signed);
    const id = frozen.id;
    const { principal, nonce } = frozen.mandate;
    if (this.#mandates.has(id)) throw new BackendError("DuplicateMandate", `mandate ${id} is already registered`);
    const used = this.#usedNonces.get(principal) ?? new Set<bigint>();
    if (used.has(nonce)) throw new BackendError("NonceUsed", `principal ${principal} already used nonce ${nonce}`);
    used.add(nonce);
    this.#usedNonces.set(principal, used);
    this.#mandates.set(id, { signed: frozen, spent: 0n, revoked: false, createdAt: now });
    this.#order.push(id);
  }

  async getMandate(id: Hex): Promise<MandateRecord | undefined> {
    const r = this.#mandates.get(id.toLowerCase() as Hex);
    return r ? { ...r } : undefined;
  }

  async listMandates(filter: MandateFilter = {}, now?: bigint): Promise<MandateRecord[]> {
    const agent = filter.agent?.toLowerCase();
    const principal = filter.principal?.toLowerCase();
    const out: MandateRecord[] = [];
    for (const id of this.#order) {
      const r = this.#mandates.get(id) as MandateRecord;
      const m = r.signed.mandate;
      if (agent !== undefined && m.agent !== agent) continue;
      if (principal !== undefined && m.principal !== principal) continue;
      if (filter.activeOnly && (now === undefined || !isActive(r, now))) continue;
      out.push({ ...r });
    }
    return out;
  }

  async isAgentRevoked(agent: AgentId): Promise<boolean> {
    return this.#revokedAgents.has(agent.toLowerCase() as AgentId);
  }

  async revokeAgent(agent: AgentId): Promise<void> {
    const a = agent.toLowerCase() as AgentId;
    this.#revokedAgents.add(a);
    for (const r of this.#mandates.values()) if (r.signed.mandate.agent === a) r.revoked = true;
  }

  async revokeMandate(id: Hex): Promise<void> {
    const r = this.#mandates.get(id.toLowerCase() as Hex);
    if (!r) throw new BackendError("UnknownMandate", `no mandate ${id}`);
    r.revoked = true;
  }

  async hasPayment(agent: AgentId, paymentId: string): Promise<boolean> {
    return this.#payments.has(paymentKey(agent, paymentId));
  }

  async commitSpend(id: Hex, paymentId: string, amount: bigint): Promise<bigint> {
    const r = this.#mandates.get(id.toLowerCase() as Hex);
    if (!r) throw new BackendError("UnknownMandate", `no mandate ${id}`);
    const m = r.signed.mandate;
    if (r.revoked) throw new BackendError("MandateRevoked", `mandate ${id} is revoked`);
    if (this.#revokedAgents.has(m.agent)) throw new BackendError("AgentRevoked", "agent is revoked");
    const key = paymentKey(m.agent, paymentId);
    if (this.#payments.has(key)) throw new BackendError("DuplicatePayment", `payment ${paymentId} already recorded`);
    if (amount <= 0n || amount > m.perTxCap) throw new BackendError("BadAmount", "amount outside the per-payment cap");
    const next = r.spent + amount;
    if (next > m.totalCap) throw new BackendError("OverTotalCap", "spend would exceed totalCap");
    r.spent = next;
    this.#payments.add(key);
    return next;
  }

  async appendLedger(input: LedgerInput): Promise<LedgerEntry> {
    return this.ledger.append(input);
  }
}
