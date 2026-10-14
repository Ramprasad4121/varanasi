/**
 * Property / fuzz tests for gate math: caps, expiry, replay, overflow and the
 * revoke race. fast-check shrinks any failure to a minimal counterexample.
 * FC_RUNS raises the number of runs (CI uses the default).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Hex, MAX_UINT256, MemoryBackend, type Payment, signMandate, Varanasi } from "../src/index.js";
import { AGENT, owner, PAYEE, sandbox, T0, TOKEN } from "./helpers.js";

const RUNS = Number(process.env.FC_RUNS ?? 60);
const uint256 = fc.bigInt({ min: 1n, max: MAX_UINT256 });

let seq = 0;
const pay = (amount: bigint): Payment => ({
  paymentId: `fc-${++seq}`,
  agent: AGENT,
  payee: PAYEE,
  token: TOKEN,
  amount,
});

/** perTxCap <= totalCap, both anywhere in uint256 (including near the top). */
const caps = fc
  .tuple(uint256, uint256)
  .map(([a, b]) => (a <= b ? { perTxCap: a, totalCap: b } : { perTxCap: b, totalCap: a }));

describe("gate properties", () => {
  it("sequential: check agrees with spend, allowed <= perTxCap, sum never exceeds totalCap", async () => {
    await fc.assert(
      fc.asyncProperty(
        caps,
        fc.array(fc.oneof(uint256, fc.bigInt({ min: 1n, max: 1000n })), { maxLength: 25 }),
        async (c, amounts) => {
          const { v } = sandbox();
          await v.createMandate({ agent: AGENT, token: TOKEN, ...c, validUntil: T0 + 60n }, owner);
          let sum = 0n;
          for (const a of amounts) {
            const p = pay(a);
            const checked = await v.gate.check(p);
            const d = await v.gate.spend(p);
            expect(checked.allowed).toBe(d.allowed);
            expect(checked.code).toBe(d.code);
            expect(d.allowed).toBe(a <= c.perTxCap && sum + a <= c.totalCap);
            if (d.allowed) {
              sum += a;
              expect(d.remaining).toBe(c.totalCap - sum);
            } else {
              expect(["OVER_PER_TX_CAP", "OVER_TOTAL_CAP"]).toContain(d.code);
            }
          }
          expect(sum <= c.totalCap).toBe(true);
          expect((await v.listMandates())[0]?.spent).toBe(sum);
          expect(v.ledger.verify()).toBe(-1);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("concurrent spends (Promise.all) never overspend", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 1n, max: 50n }),
        fc.bigInt({ min: 50n, max: 400n }),
        fc.array(fc.bigInt({ min: 1n, max: 60n }), { minLength: 1, maxLength: 40 }),
        async (perTxCap, totalCap, amounts) => {
          const { v } = sandbox();
          await v.createMandate({ agent: AGENT, token: TOKEN, perTxCap, totalCap, validUntil: T0 + 60n }, owner);
          const results = await Promise.all(amounts.map((a) => v.gate.spend(pay(a))));
          const allowedSum = amounts.reduce((s, a, i) => (results[i]?.allowed ? s + a : s), 0n);
          const spent = (await v.listMandates())[0]?.spent ?? -1n;
          expect(spent).toBe(allowedSum);
          expect(spent <= totalCap).toBe(true);
          expect(v.ledger.entries({ kind: "spend" }).length).toBe(results.filter((r) => r.allowed).length);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("expiry: a payment is allowed iff validFrom <= now < validUntil", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 0n, max: 1000n }),
        fc.bigInt({ min: 1n, max: 1000n }),
        fc.bigInt({ min: -50n, max: 2100n }),
        async (fromOffset, length, nowOffset) => {
          const { v, clock } = sandbox();
          const validFrom = T0 + fromOffset;
          const validUntil = validFrom + length;
          await v.createMandate(
            { agent: AGENT, token: TOKEN, perTxCap: 10n, totalCap: 10n, validFrom, validUntil },
            owner,
          );
          clock.now = T0 + nowOffset;
          const d = await v.gate.check(pay(1n));
          const inside = clock.now >= validFrom && clock.now < validUntil;
          expect(d.allowed).toBe(inside);
          if (!inside) expect(d.code).toBe(clock.now < validFrom ? "NOT_YET_VALID" : "EXPIRED");
        },
      ),
      { numRuns: RUNS * 2 },
    );
  });

  it("replay: a paymentId spends at most once, and a (principal, nonce) registers at most once", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 30 }),
        fc.bigInt({ min: 0n, max: MAX_UINT256 }),
        async (ids, nonce) => {
          const { v } = sandbox();
          const o = { now: T0, domain: v.domain };
          const lim = { agent: AGENT, token: TOKEN, perTxCap: 1n, validUntil: T0 + 60n, nonce };
          const s = await signMandate({ ...lim, totalCap: 1000n }, owner, o);
          await v.registerMandate(s);
          await expect(v.registerMandate(s)).rejects.toThrow();
          const twin = await signMandate({ ...lim, totalCap: 999n }, owner, o);
          await expect(v.registerMandate(twin)).rejects.toThrow(/NonceUsed/);
          const results = await Promise.all(
            ids.map((i) => v.gate.spend({ paymentId: `p${i}`, agent: AGENT, payee: PAYEE, token: TOKEN, amount: 1n })),
          );
          const distinct = new Set(ids).size;
          expect(results.filter((r) => r.allowed).length).toBe(distinct);
          expect((await v.listMandates())[0]?.spent).toBe(BigInt(distinct));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("revoke race: no debit starts after revoke() is called, wherever it lands", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.bigInt({ min: 1n, max: 10n }), fc.boolean()), { minLength: 1, maxLength: 30 }),
        fc.nat(30),
        async (plan, revokeAt) => {
          // Backend that counts debits starting after revoke() was called.
          let revokeCalled = false;
          let lateCommits = 0;
          class Watched extends MemoryBackend {
            override async commitSpend(id: Hex, paymentId: string, amount: bigint): Promise<bigint> {
              if (revokeCalled) lateCommits++;
              return super.commitSpend(id, paymentId, amount);
            }
          }
          const v = new Varanasi({ backend: new Watched(), clock: () => T0 });
          await v.createMandate(
            { agent: AGENT, token: TOKEN, perTxCap: 10n, totalCap: 1000n, validUntil: T0 + 60n },
            owner,
          );
          const before: Promise<unknown>[] = [];
          const after: Promise<{ allowed: boolean }>[] = [];
          let revoked: Promise<unknown> | undefined;
          for (let i = 0; i < plan.length; i++) {
            const [amount, yieldFirst] = plan[i] as [bigint, boolean];
            if (i === revokeAt) {
              revokeCalled = true;
              revoked = v.revoke(AGENT);
            }
            if (yieldFirst) await Promise.resolve();
            const p = v.gate.spend(pay(amount));
            (revoked ? after : before).push(p);
          }
          if (!revoked) {
            revokeCalled = true;
            revoked = v.revoke(AGENT);
          }
          await Promise.all([...before, revoked]);
          const late = await Promise.all(after);
          // wall clock: nothing is debited once revoke() has been called, even
          // spends queued before it (the synchronous fence)
          expect(lateCommits).toBe(0);
          expect(late.every((d) => !d.allowed)).toBe(true);
          const entries = v.ledger.entries();
          const revokeSeq = entries.find((e) => e.kind === "agent_revoked")?.seq ?? -1;
          expect(revokeSeq).toBeGreaterThanOrEqual(0);
          expect(entries.filter((e) => e.kind === "spend" && e.seq > revokeSeq)).toHaveLength(0);
          const sum = entries.filter((e) => e.kind === "spend").reduce((s, e) => s + (e.amount ?? 0n), 0n);
          expect((await v.listMandates())[0]?.spent).toBe(sum);
          expect((await v.gate.spend(pay(1n))).code).toBe("AGENT_REVOKED");
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("fuzzed payment input never throws and never allows garbage", async () => {
    const { v } = sandbox();
    await v.createMandate(
      { agent: AGENT, token: TOKEN, perTxCap: 100n, totalCap: 10_000n, validUntil: T0 + 60n },
      owner,
    );
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.string(), fc.double(), fc.integer(), fc.constant(null), fc.object()),
        async (amount) => {
          const d = await v.gate.check({
            paymentId: `z-${++seq}`,
            agent: AGENT,
            payee: PAYEE,
            token: TOKEN,
            amount: amount as string,
          });
          if (d.allowed) {
            expect(typeof amount === "string" ? /^[0-9]+$/.test(amount) : Number.isSafeInteger(amount)).toBe(true);
            const n = BigInt(amount as string | number);
            expect(n > 0n && n <= 100n).toBe(true);
          }
        },
      ),
      { numRuns: RUNS * 4 },
    );
  });
});
