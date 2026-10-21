/**
 * @author Ramprasad
 * The payment gate: every payment is checked against the agent's signed
 * mandate before money moves.
 *
 * evaluate() is a pure function of (mandate state, payment, now). Gate wraps
 * it with the backend, the ledger and one lock:
 *  - check(payment): read-only answer, logged to the ledger as "check".
 *  - spend(payment): re-evaluates and commits under the lock, so the answer
 *    and the debit are one atomic step (no time-of-check vs time-of-use gap).
 *    Logged as "spend" or "spend_denied".
 */
import { BackendError, isActive, type PermissionBackend } from "./backend.js";
import type { Mutex } from "./mutex.js";
import type { Address, AgentId, Decision, DenyCode, Hex, MandateRecord, Payment } from "./types.js";
import {
  MAX_MEMO_LENGTH,
  MAX_PAYMENT_ID_LENGTH,
  parseAddress,
  parseCategory,
  parseUint,
  VaranasiInputError,
} from "./values.js";

/** A payment after input validation. */
export interface ParsedPayment {
  paymentId: string;
  agent: AgentId;
  payee: Address;
  token: Address;
  amount: bigint;
  category?: string;
  mandateId?: Hex;
  memo?: string;
}

/** Validate and normalize a payment. Throws VaranasiInputError. */
export function parsePayment(p: Payment): ParsedPayment {
  if (typeof p !== "object" || p === null) throw new VaranasiInputError("BadPayment", "payment must be an object");
  if (typeof p.paymentId !== "string" || p.paymentId.length === 0 || p.paymentId.length > MAX_PAYMENT_ID_LENGTH) {
    throw new VaranasiInputError("BadPaymentId", `paymentId must be 1..${MAX_PAYMENT_ID_LENGTH} chars`);
  }
  if (p.memo !== undefined && (typeof p.memo !== "string" || p.memo.length > MAX_MEMO_LENGTH)) {
    throw new VaranasiInputError("BadMemo", `memo must be a string of at most ${MAX_MEMO_LENGTH} chars`);
  }
  let mandateId: Hex | undefined;
  if (p.mandateId !== undefined) {
    if (typeof p.mandateId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(p.mandateId)) {
      throw new VaranasiInputError("BadMandateId", "mandateId must be 32 bytes of hex");
    }
    mandateId = p.mandateId.toLowerCase() as Hex;
  }
  const out: ParsedPayment = {
    paymentId: p.paymentId,
    agent: parseAddress(p.agent, "agent"),
    payee: parseAddress(p.payee, "payee"),
    token: parseAddress(p.token, "token"),
    amount: parseUint(p.amount, "amount"),
  };
  if (p.category !== undefined) out.category = parseCategory(p.category);
  if (mandateId !== undefined) out.mandateId = mandateId;
  if (p.memo !== undefined) out.memo = p.memo;
  return out;
}

const BACKEND_CODES: Record<string, DenyCode> = {
  MandateRevoked: "MANDATE_REVOKED",
  AgentRevoked: "AGENT_REVOKED",
  DuplicatePayment: "DUPLICATE_PAYMENT",
  OverTotalCap: "OVER_TOTAL_CAP",
  BadAmount: "OVER_PER_TX_CAP",
  UnknownMandate: "UNKNOWN_MANDATE",
};

function deny(code: DenyCode, reason: string, at: bigint, mandateId?: Hex): Decision {
  const d: Decision = { allowed: false, code, reason, at };
  if (mandateId !== undefined) d.mandateId = mandateId;
  return d;
}

/**
 * Pure rule check of one payment against one mandate record. No I/O.
 * Order is fixed so the reason is deterministic: amount, identity,
 * revocation, token, time window, payee, category, per-tx cap, total cap.
 */
export function evaluate(record: MandateRecord, p: ParsedPayment, now: bigint): Decision {
  const m = record.signed.mandate;
  const id = record.signed.id;
  if (p.amount === 0n) return deny("INVALID_AMOUNT", "amount must be greater than zero", now, id);
  if (m.agent !== p.agent) return deny("AGENT_MISMATCH", "this mandate belongs to a different agent", now, id);
  if (record.revoked) return deny("MANDATE_REVOKED", "the owner revoked this mandate", now, id);
  if (m.token !== p.token) return deny("TOKEN_MISMATCH", "this mandate does not cover that token", now, id);
  if (now < m.validFrom) return deny("NOT_YET_VALID", `mandate starts at ${m.validFrom}`, now, id);
  if (now >= m.validUntil) return deny("EXPIRED", `mandate expired at ${m.validUntil}`, now, id);
  if (m.payees.length > 0 && !m.payees.includes(p.payee)) {
    return deny("PAYEE_NOT_ALLOWED", "payee is not on the mandate's allowed list", now, id);
  }
  if (m.categories.length > 0 && (p.category === undefined || !m.categories.includes(p.category))) {
    return deny("CATEGORY_NOT_ALLOWED", "category is missing or not allowed by the mandate", now, id);
  }
  if (p.amount > m.perTxCap) {
    return deny("OVER_PER_TX_CAP", `amount ${p.amount} is over the per-payment cap ${m.perTxCap}`, now, id);
  }
  // bigint math: no overflow. Both values are <= MAX_UINT256 so the sum is exact.
  const after = record.spent + p.amount;
  if (after > m.totalCap) {
    return deny("OVER_TOTAL_CAP", `would bring the total to ${after}, over the cap ${m.totalCap}`, now, id);
  }
  return { allowed: true, code: "OK", reason: "within mandate", mandateId: id, remaining: m.totalCap - after, at: now };
}

/** What the client hands the gate. */
export interface GateDeps {
  backend: PermissionBackend;
  clock: () => bigint;
  lock: Mutex;
  /** Synchronous revocation fence, set the instant revoke() is called. */
  isFenced: (agent: AgentId) => boolean;
}

export class Gate {
  readonly #d: GateDeps;

  constructor(deps: GateDeps) {
    this.#d = deps;
  }

  /** Decide without spending. Logged as a "check" ledger entry. */
  async check(payment: Payment): Promise<Decision> {
    return this.#d.lock.run(async () => {
      const { decision, parsed } = await this.#decide(payment);
      await this.#log("check", decision, parsed);
      return decision;
    });
  }

  /**
   * Check and, if allowed, debit the mandate in one atomic step. This is the
   * call that must happen before any money moves.
   */
  async spend(payment: Payment): Promise<Decision> {
    return this.#d.lock.run(async () => {
      const { decision, parsed } = await this.#decide(payment);
      if (!decision.allowed || !parsed || !decision.mandateId) {
        await this.#log("spend_denied", decision, parsed);
        return decision;
      }
      // Last look at the fence right before the write: a revoke() called while
      // we were awaiting the backend wins.
      if (this.#d.isFenced(parsed.agent)) {
        const d = deny("AGENT_REVOKED", "the owner revoked this agent", decision.at, decision.mandateId);
        await this.#log("spend_denied", d, parsed);
        return d;
      }
      let spent: bigint;
      try {
        spent = await this.#d.backend.commitSpend(decision.mandateId, parsed.paymentId, parsed.amount);
      } catch (e) {
        // The backend is a second line of defence; if it refuses, nothing was spent.
        const code = e instanceof BackendError ? BACKEND_CODES[e.code] : undefined;
        const msg = e instanceof Error ? e.message : String(e);
        const d = deny(code ?? "INVALID_PAYMENT", msg, decision.at, decision.mandateId);
        await this.#log("spend_denied", d, parsed);
        return d;
      }
      const rec = await this.#d.backend.getMandate(decision.mandateId);
      const final: Decision = { ...decision, remaining: rec ? rec.signed.mandate.totalCap - spent : 0n };
      await this.#log("spend", final, parsed);
      return final;
    });
  }

  async #decide(payment: Payment): Promise<{ decision: Decision; parsed?: ParsedPayment }> {
    const now = this.#d.clock();
    let parsed: ParsedPayment;
    try {
      parsed = parsePayment(payment);
    } catch (e) {
      const isAmount = e instanceof VaranasiInputError && /Number|Overflow/.test(e.code);
      return {
        decision: deny(
          isAmount ? "INVALID_AMOUNT" : "INVALID_PAYMENT",
          e instanceof Error ? e.message : String(e),
          now,
        ),
      };
    }
    const b = this.#d.backend;
    if (await b.hasPayment(parsed.agent, parsed.paymentId)) {
      return { decision: deny("DUPLICATE_PAYMENT", `payment ${parsed.paymentId} was already recorded`, now), parsed };
    }
    if (this.#d.isFenced(parsed.agent) || (await b.isAgentRevoked(parsed.agent))) {
      return { decision: deny("AGENT_REVOKED", "the owner revoked this agent", now), parsed };
    }
    if (parsed.mandateId) {
      const rec = await b.getMandate(parsed.mandateId);
      if (!rec) return { decision: deny("UNKNOWN_MANDATE", `no mandate ${parsed.mandateId}`, now), parsed };
      return { decision: evaluate(rec, parsed, now), parsed };
    }
    const candidates = await b.listMandates({ agent: parsed.agent });
    if (candidates.length === 0) return { decision: deny("NO_MANDATE", "this agent has no mandate", now), parsed };
    // Try active mandates first (registration order); report the first denial reason.
    const ordered = [...candidates.filter((r) => isActive(r, now)), ...candidates.filter((r) => !isActive(r, now))];
    let firstDenial: Decision | undefined;
    for (const rec of ordered) {
      const d = evaluate(rec, parsed, now);
      if (d.allowed) return { decision: d, parsed };
      firstDenial ??= d;
    }
    return { decision: firstDenial as Decision, parsed };
  }

  async #log(kind: "check" | "spend" | "spend_denied", d: Decision, p?: ParsedPayment): Promise<void> {
    await this.#d.backend.appendLedger({
      kind,
      at: d.at,
      agent: p?.agent,
      mandateId: d.mandateId,
      paymentId: p?.paymentId,
      payee: p?.payee,
      token: p?.token,
      amount: p?.amount,
      category: p?.category,
      code: d.code,
      reason: d.reason,
      memo: p?.memo,
    });
  }
}
