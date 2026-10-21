/**
 * @author Ramprasad
 * Varanasi client: one object that ties mandates, the gate, the ledger and
 * revoke to a backend. Default backend is the in-memory sandbox.
 *
 *   const v = Varanasi.sandbox();
 *   const signed = await v.createMandate({ agent, token, perTxCap: 5_000_000n,
 *     totalCap: 20_000_000n, validUntil: v.now() + 86_400n }, localSigner(ownerKey));
 *   const d = await v.gate.check({ paymentId: "p1", agent, payee, token, amount: 1_000_000n });
 *   if (d.allowed) await v.gate.spend({ ... });   // atomic check + debit
 *   await v.revoke(agent);                          // instant
 *
 * Sandbox, test money only.
 */
import { BackendError, MemoryBackend, type PermissionBackend } from "./backend.js";
import { spendMandateDomain } from "./eip712.js";
import { Gate } from "./gate.js";
import type { LedgerReader } from "./ledger.js";
import { type MandateSigner, signMandate, verifySignedMandate } from "./mandate.js";
import { Mutex } from "./mutex.js";
import type {
  AgentId,
  Hex,
  LedgerEntry,
  MandateDomain,
  MandateFilter,
  MandateParams,
  MandateRecord,
  SignedMandate,
} from "./types.js";
import { nowSeconds, parseAddress, VaranasiInputError } from "./values.js";

export interface VaranasiOptions {
  /** State backend. Defaults to a new MemoryBackend (sandbox). */
  backend?: PermissionBackend;
  /** EIP-712 domain mandates are signed under. Defaults to the sandbox domain (chain 31337). */
  domain?: MandateDomain;
  /** Unix seconds clock. Inject in tests. */
  clock?: () => bigint;
}

export interface RevokeResult {
  agent: AgentId;
  /** False when the agent was already revoked (revoke is idempotent). */
  changed: boolean;
  entry?: LedgerEntry;
}

export class Varanasi {
  readonly backend: PermissionBackend;
  readonly domain: MandateDomain;
  readonly gate: Gate;
  readonly #clock: () => bigint;
  readonly #lock = new Mutex();
  /** Agents revoked in this process. Set synchronously so revoke wins any in-flight spend. */
  readonly #fence = new Set<AgentId>();

  constructor(opts: VaranasiOptions = {}) {
    this.backend = opts.backend ?? new MemoryBackend();
    this.domain = opts.domain ?? spendMandateDomain();
    this.#clock = opts.clock ?? nowSeconds;
    this.gate = new Gate({
      backend: this.backend,
      clock: this.#clock,
      lock: this.#lock,
      isFenced: (a) => this.#fence.has(a.toLowerCase() as AgentId),
    });
  }

  /** A fresh in-memory sandbox. Test money only. */
  static sandbox(opts: Omit<VaranasiOptions, "backend"> = {}): Varanasi {
    return new Varanasi({ ...opts, backend: new MemoryBackend() });
  }

  /** Current time per this client's clock (unix seconds). */
  now(): bigint {
    return this.#clock();
  }

  get ledger(): LedgerReader {
    return this.backend.ledger;
  }

  /** Owner signs a spend mandate for an agent and it is registered. */
  async createMandate(params: MandateParams, owner: MandateSigner): Promise<SignedMandate> {
    const signed = await signMandate(params, owner, { domain: this.domain, now: this.#clock() });
    await this.registerMandate(signed);
    return signed;
  }

  /**
   * Register a mandate the owner signed elsewhere (for example on their own
   * device). Verifies signature, id and fields; rejects expired mandates,
   * reused nonces, duplicates and revoked agents.
   */
  async registerMandate(signed: SignedMandate): Promise<MandateRecord> {
    return this.#lock.run(async () => {
      const now = this.#clock();
      verifySignedMandate(signed, this.domain, now);
      const agent = signed.mandate.agent;
      if (this.#fence.has(agent) || (await this.backend.isAgentRevoked(agent))) {
        throw new BackendError("AgentRevoked", `agent ${agent} is revoked; use a new agent key`);
      }
      await this.backend.registerMandate(signed, now);
      const m = signed.mandate;
      await this.backend.appendLedger({
        kind: "mandate_created",
        at: now,
        agent,
        mandateId: signed.id.toLowerCase() as Hex,
        token: m.token,
        amount: m.totalCap,
        reason: `owner ${m.principal} signed: per payment up to ${m.perTxCap}, total up to ${m.totalCap}, until ${m.validUntil}`,
      });
      return (await this.backend.getMandate(signed.id)) as MandateRecord;
    });
  }

  /**
   * Revoke an agent. Effective immediately: the fence is set before this
   * function first awaits, so any spend that has not committed yet is denied.
   * Every mandate for the agent is marked revoked. Idempotent.
   */
  async revoke(agentId: AgentId): Promise<RevokeResult> {
    const agent = parseAddress(agentId, "agent");
    const alreadyFenced = this.#fence.has(agent);
    this.#fence.add(agent);
    return this.#lock.run(async () => {
      const wasRevoked = alreadyFenced && (await this.backend.isAgentRevoked(agent));
      await this.backend.revokeAgent(agent);
      if (wasRevoked) return { agent, changed: false };
      const entry = await this.backend.appendLedger({
        kind: "agent_revoked",
        at: this.#clock(),
        agent,
        reason: "owner revoked the agent; all its mandates are void",
      });
      return { agent, changed: true, entry };
    });
  }

  /** Revoke one mandate (the agent keeps any others). */
  async revokeMandate(id: Hex): Promise<LedgerEntry> {
    if (typeof id !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(id)) {
      throw new VaranasiInputError("BadMandateId", "mandate id must be 32 bytes of hex");
    }
    return this.#lock.run(async () => {
      const rec = await this.backend.getMandate(id);
      if (!rec) throw new BackendError("UnknownMandate", `no mandate ${id}`);
      await this.backend.revokeMandate(id);
      return this.backend.appendLedger({
        kind: "mandate_revoked",
        at: this.#clock(),
        agent: rec.signed.mandate.agent,
        mandateId: rec.signed.id,
        reason: "owner revoked this mandate",
      });
    });
  }

  /** List mandates (registration order). */
  async listMandates(filter: MandateFilter = {}): Promise<MandateRecord[]> {
    return this.backend.listMandates(filter, this.#clock());
  }
}
