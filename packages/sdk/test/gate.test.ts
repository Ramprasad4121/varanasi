import { describe, expect, it } from "vitest";
import { evaluate, type Payment, parsePayment, signMandate, verifyChain } from "../src/index.js";
import { AGENT, AGENT2, owner, owner2, PAYEE, PAYEE2, pid, sandbox, T0, TOKEN, TOKEN2 } from "./helpers.js";

const limits = { agent: AGENT, token: TOKEN, perTxCap: 5_000_000n, totalCap: 12_000_000n, validUntil: T0 + 3600n };

function pay(amount: bigint | string | number, extra: Partial<Payment> = {}): Payment {
  return { paymentId: pid(), agent: AGENT, payee: PAYEE, token: TOKEN, amount, ...extra };
}

describe("gate", () => {
  it("allows a payment within limits and debits only on spend", async () => {
    const { v } = sandbox();
    const m = await v.createMandate(limits, owner);
    const p = pay(4_000_000n);
    const c = await v.gate.check(p);
    expect(c).toMatchObject({ allowed: true, code: "OK", mandateId: m.id, remaining: 8_000_000n });
    expect((await v.listMandates())[0]?.spent).toBe(0n);
    const s = await v.gate.spend(p);
    expect(s).toMatchObject({ allowed: true, remaining: 8_000_000n });
    expect((await v.listMandates())[0]?.spent).toBe(4_000_000n);
  });

  it("denies over the per-payment cap and over the total cap", async () => {
    const { v } = sandbox();
    await v.createMandate(limits, owner);
    expect((await v.gate.spend(pay(5_000_001n))).code).toBe("OVER_PER_TX_CAP");
    expect((await v.gate.spend(pay(5_000_000n))).allowed).toBe(true);
    expect((await v.gate.spend(pay(5_000_000n))).allowed).toBe(true);
    expect((await v.gate.spend(pay(2_000_001n))).code).toBe("OVER_TOTAL_CAP");
    expect((await v.gate.spend(pay(2_000_000n))).remaining).toBe(0n);
  });

  it("enforces the time window", async () => {
    const { v, clock } = sandbox();
    await v.createMandate({ ...limits, validFrom: T0 + 100n }, owner);
    expect((await v.gate.check(pay(1n))).code).toBe("NOT_YET_VALID");
    clock.now = T0 + 100n;
    expect((await v.gate.check(pay(1n))).allowed).toBe(true);
    clock.now = T0 + 3599n;
    expect((await v.gate.check(pay(1n))).allowed).toBe(true);
    clock.now = T0 + 3600n;
    expect((await v.gate.check(pay(1n))).code).toBe("EXPIRED");
  });

  it("enforces payees, categories and token", async () => {
    const { v } = sandbox();
    await v.createMandate({ ...limits, payees: [PAYEE], categories: ["compute"] }, owner);
    expect((await v.gate.check(pay(1n, { payee: PAYEE2, category: "compute" }))).code).toBe("PAYEE_NOT_ALLOWED");
    expect((await v.gate.check(pay(1n))).code).toBe("CATEGORY_NOT_ALLOWED");
    expect((await v.gate.check(pay(1n, { category: "travel" }))).code).toBe("CATEGORY_NOT_ALLOWED");
    expect((await v.gate.check(pay(1n, { category: " Compute " }))).allowed).toBe(true);
    expect((await v.gate.check(pay(1n, { category: "compute", token: TOKEN2 }))).code).toBe("TOKEN_MISMATCH");
  });

  it("denies a replayed paymentId", async () => {
    const { v } = sandbox();
    await v.createMandate(limits, owner);
    const p = pay(1n);
    expect((await v.gate.spend(p)).allowed).toBe(true);
    expect((await v.gate.spend(p)).code).toBe("DUPLICATE_PAYMENT");
    expect((await v.gate.check(p)).code).toBe("DUPLICATE_PAYMENT");
  });

  it("scopes paymentIds per agent so one agent cannot burn another's ids", async () => {
    const { v } = sandbox();
    await v.createMandate(limits, owner);
    await v.createMandate({ ...limits, agent: AGENT2 }, owner);
    expect((await v.gate.spend(pay(1n, { paymentId: "shared" }))).allowed).toBe(true);
    expect((await v.gate.spend(pay(1n, { paymentId: "shared", agent: AGENT2 }))).allowed).toBe(true);
    expect((await v.gate.spend(pay(1n, { paymentId: "shared" }))).code).toBe("DUPLICATE_PAYMENT");
  });

  it("denies agents without a mandate, unknown mandates and other agents' mandates", async () => {
    const { v } = sandbox();
    const m = await v.createMandate(limits, owner);
    expect((await v.gate.check(pay(1n, { agent: AGENT2 }))).code).toBe("NO_MANDATE");
    expect((await v.gate.check(pay(1n, { mandateId: `0x${"ab".repeat(32)}` }))).code).toBe("UNKNOWN_MANDATE");
    expect((await v.gate.check(pay(1n, { agent: AGENT2, mandateId: m.id }))).code).toBe("AGENT_MISMATCH");
  });

  it("rejects malformed payments without throwing", async () => {
    const { v } = sandbox();
    await v.createMandate(limits, owner);
    for (const amount of ["-1", "1.5", "0x10", "1e6", "", -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      expect((await v.gate.check(pay(amount as string))).code).toBe("INVALID_AMOUNT");
    }
    expect((await v.gate.check(pay(0n))).code).toBe("INVALID_AMOUNT");
    expect((await v.gate.check(pay((2n ** 256n).toString()))).code).toBe("INVALID_AMOUNT");
    expect((await v.gate.check(pay(1n, { payee: "0x123" }))).code).toBe("INVALID_PAYMENT");
    expect((await v.gate.check(pay(1n, { paymentId: "" }))).code).toBe("INVALID_PAYMENT");
  });

  it("evaluate() is pure and checks the running total", async () => {
    const { v } = sandbox();
    const s = await v.createMandate(limits, owner);
    const rec = { signed: s, spent: 10_000_000n, revoked: false, createdAt: T0 };
    expect(evaluate(rec, parsePayment(pay(2_000_000n)), T0)).toMatchObject({ allowed: true, remaining: 0n });
    expect(evaluate(rec, parsePayment(pay(2_000_001n)), T0).code).toBe("OVER_TOTAL_CAP");
    expect(evaluate({ ...rec, revoked: true }, parsePayment(pay(1n)), T0).code).toBe("MANDATE_REVOKED");
  });

  it("revoke is instant and voids every mandate for the agent", async () => {
    const { v } = sandbox();
    await v.createMandate(limits, owner);
    await v.createMandate({ ...limits, nonce: 7n }, owner);
    expect((await v.gate.check(pay(1n))).allowed).toBe(true);
    const r = await v.revoke(AGENT);
    expect(r.changed).toBe(true);
    expect((await v.gate.spend(pay(1n))).code).toBe("AGENT_REVOKED");
    expect((await v.listMandates({ activeOnly: true })).length).toBe(0);
    expect((await v.revoke(AGENT)).changed).toBe(false);
    await expect(v.createMandate({ ...limits, nonce: 8n }, owner)).rejects.toThrow(/AgentRevoked/);
  });

  it("revoking one mandate falls back to another active mandate", async () => {
    const { v } = sandbox();
    const a = await v.createMandate(limits, owner);
    const b = await v.createMandate({ ...limits, perTxCap: 1n, totalCap: 1n, nonce: 2n }, owner);
    await v.revokeMandate(a.id);
    expect(await v.gate.check(pay(1n))).toMatchObject({ allowed: true, mandateId: b.id });
    expect((await v.gate.check(pay(2n))).code).toBe("OVER_PER_TX_CAP");
    expect((await v.gate.check(pay(1n, { mandateId: a.id }))).code).toBe("MANDATE_REVOKED");
  });

  it("rejects mandate replay: same signed mandate twice, or a reused nonce", async () => {
    const { v } = sandbox();
    const o = { now: T0, domain: v.domain };
    const s = await signMandate({ ...limits, nonce: 1n }, owner, o);
    await v.registerMandate(s);
    await expect(v.registerMandate(s)).rejects.toThrow(/DuplicateMandate/);
    const sameNonce = await signMandate({ ...limits, totalCap: 13_000_000n, nonce: 1n }, owner, o);
    await expect(v.registerMandate(sameNonce)).rejects.toThrow(/NonceUsed/);
    const other = await signMandate({ ...limits, nonce: 1n }, owner2, o);
    await expect(v.registerMandate(other)).resolves.toBeDefined();
  });

  it("stored mandates cannot be mutated through the caller's reference", async () => {
    const { v } = sandbox();
    const s = await signMandate(limits, owner, { now: T0, domain: v.domain });
    await v.registerMandate(s);
    (s.mandate as { totalCap: bigint }).totalCap = 10n ** 30n;
    expect((await v.listMandates())[0]?.signed.mandate.totalCap).toBe(12_000_000n);
  });

  it("refuses to register an expired mandate", async () => {
    const { v, clock } = sandbox();
    const s = await signMandate(limits, owner, { now: T0, domain: v.domain });
    clock.now = T0 + 3600n;
    await expect(v.registerMandate(s)).rejects.toThrow(/Expired/);
  });

  it("writes every mandate, check, spend, denial and revoke to a verifiable ledger", async () => {
    const { v } = sandbox();
    await v.createMandate(limits, owner);
    await v.gate.check(pay(1n));
    await v.gate.spend(pay(1n));
    await v.gate.spend(pay(99_000_000n));
    await v.revoke(AGENT);
    expect(v.ledger.entries().map((e) => e.kind)).toEqual([
      "mandate_created",
      "check",
      "spend",
      "spend_denied",
      "agent_revoked",
    ]);
    expect(v.ledger.verify()).toBe(-1);
    const list = v.ledger.entries();
    expect(verifyChain(list)).toBe(-1);
    expect(verifyChain(list.map((e) => (e.seq === 2 ? { ...e, amount: 0n } : e)))).toBe(2);
    expect(verifyChain(list.slice(1))).toBe(0);
    expect(v.ledger.entries({ kind: "spend" })).toHaveLength(1);
  });
});
