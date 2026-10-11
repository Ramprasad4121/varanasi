"use client";
import { useState } from "react";
import { keccak256, toHex } from "viem";
import { fill } from "@/lib/i18n";
import { day, grams, rupees } from "@/lib/format";
import { maxLoanPaise } from "@/lib/terms";
import { Back, nowOf, type P } from "./shared";

/** Loan against gold: pledge grams, the (mock) bank lends up to 75% of today's demo
 *  value, take the money, repay to get the gold back. Default: the bank keeps it. */
export function Loans({ t, lang, state, go, busy, run, act, addReceipt, demo }: P) {
  const terms = state.loans.terms;
  const price = BigInt(state.gold.pricePaisePerGram);
  const freeG = state.gold.milli / 1000;
  const [g, setG] = useState(String(Math.min(5, Math.floor(freeG * 1000) / 1000) || ""));
  const milli = Math.round((Number(g) || 0) * 1000);
  const maxPaise = maxLoanPaise(milli, price);
  const [amt, setAmt] = useState("");
  const amount = amt === "" ? Number(maxPaise / 100n) : Number(amt.replace(/[^\d.]/g, "")) || 0;
  const lenderName = terms.lender;

  const ask = () =>
    run(async () => {
      if (milli <= 0 || milli > state.gold.milli) throw new Error(milli <= 0 ? "BAD_AMOUNT" : "ERC20InsufficientBalance");
      const paise = BigInt(Math.round(amount * 100));
      if (paise < BigInt(terms.minPaise)) throw new Error("BAD_AMOUNT");
      if (paise > maxPaise) throw new Error("LOAN_TOO_LARGE");
      const pos = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
      const g3 = (milli / 1000).toFixed(3);
      // three signed steps in one tap: allow the vault to take the grams, lock them, ask the bank
      await act("loan.allowGold", { grams: g3 });
      await act("loan.pledge", { pos, grams: g3 });
      const ref = await act("loan.ask", { pos, rupees: String(amount) });
      setAmt("");
      addReceipt({ kind: "pledge", title: t.r_pledge, amount: rupees(paise, false), to: lenderName, note: grams(milli), ref, at: nowOf(state) });
    });

  const active = state.loans.list.filter((l) => ["ASKED", "APPROVED", "ACTIVE"].includes(l.status));
  const done = state.loans.list.filter((l) => !["ASKED", "APPROVED", "ACTIVE"].includes(l.status));
  const pill: Record<string, string> = { ASKED: "wait", APPROVED: "ok", ACTIVE: "wait", REPAID: "ok", DEFAULTED: "no", CANCELLED: "no" };

  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.loanTitle}</h1>
      <p>{t.loanIntro}</p>
      <div className="card">
        <div className="row">
          <span>{t.loanLender}</span>
          <span className="v">{lenderName}</span>
        </div>
        <div className="row">
          <span>{t.loanUpTo}</span>
          <span className="v">
            {terms.ltvBps / 100}% {t.loanOfValue}
          </span>
        </div>
        <div className="row">
          <span>{t.loanRate}</span>
          <span className="v">{fill(t.loanRateText, { y: terms.yearlyRatePct })}</span>
        </div>
        <div className="row">
          <span>{t.loanTerm}</span>
          <span className="v">{fill(t.loanDays, { d: Math.round(terms.termSeconds / 86400) })}</span>
        </div>
        <p className="muted">{t.loanWarn}</p>
      </div>

      {state.loans.unusedPledges.map((u) => (
        <div className="card warn" key={u.positionId}>
          <p>{fill(t.loanUnused, { g: grams(u.milli) })}</p>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const ref = await act("loan.reclaim", { pos: u.positionId });
                addReceipt({ kind: "reclaim", title: t.r_reclaim, amount: grams(u.milli), ref, at: nowOf(state) });
              })
            }
          >
            {t.loanReclaim}
          </button>
        </div>
      ))}

      {active.length > 0 && <h2>{t.myLoans}</h2>}
      {active.map((l) => {
        const owed = BigInt(l.owedNowPaise);
        return (
          <div className="card" key={l.id}>
            <div className="row">
              <span className="mid" style={{ fontSize: 20 }}>
                {t.loanPrincipal} {rupees(l.principalPaise, false)}
              </span>
              <span className={"pill " + pill[l.status]}>{(t as any)["ln_" + l.status]}</span>
            </div>
            <div className="row">
              <span>{t.loanGold}</span>
              <span className="v">{grams(l.goldMilli)}</span>
            </div>
            {l.status === "ACTIVE" && (
              <>
                <div className="row">
                  <span>{t.loanOwed}</span>
                  <span className="v">{rupees(owed)}</span>
                </div>
                <div className="row">
                  <span>{t.loanDue}</span>
                  <span className="v">{day(l.dueAt, lang)}</span>
                </div>
                <div className="muted">
                  {t.bankMoney}: {rupees(state.rupeePaise, false)}
                </div>
                <button
                  className="btn green"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await act("loan.allowRupee", {});
                      // interest moves by the second: allow 1% (and Re 1) above the quote; the exact balance is charged
                      const max = (owed * 101n) / 100n + 100n;
                      const ref = await act("loan.repay", { id: String(l.id), max: max.toString() });
                      addReceipt({ kind: "repay", title: t.r_repay, amount: rupees(owed), to: lenderName, note: grams(l.goldMilli), ref, at: nowOf(state) });
                    })
                  }
                >
                  {busy ? t.working : fill(t.loanRepay, { r: rupees(owed) })}
                </button>
              </>
            )}
            {l.status === "APPROVED" && (
              <button
                className="btn green"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const ref = await act("loan.draw", { id: String(l.id) });
                    addReceipt({ kind: "draw", title: t.r_draw, amount: rupees(l.principalPaise, false), to: t.bankMoney, ref, at: nowOf(state) });
                  })
                }
              >
                {busy ? t.working : fill(t.loanDraw, { r: rupees(l.principalPaise, false) })}
              </button>
            )}
            {l.status === "ASKED" && (
              <>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const ref = await act("loan.cancel", { id: String(l.id) });
                      addReceipt({ kind: "loanCancel", title: t.r_loanCancel, amount: grams(l.goldMilli), ref, at: nowOf(state) });
                    })
                  }
                >
                  {t.loanCancel}
                </button>
                <div className="demo-box">
                  <button
                    className="btn demo"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const j = await demo("bankApproveLoan", { id: String(l.id) });
                        addReceipt({
                          kind: "approve",
                          title: t.r_approve,
                          amount: rupees(l.principalPaise, false),
                          to: lenderName,
                          ref: j.ref,
                          at: nowOf(state),
                        });
                      })
                    }
                  >
                    {t.loanBankApprove}
                  </button>
                </div>
              </>
            )}
            {l.status === "ACTIVE" && (
              <div className="demo-box">
                <p className="muted">{t.loanTermEndsHint}</p>
                <button
                  className="btn demo"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const j = await demo("loanTermEnds", { id: String(l.id) });
                      addReceipt({ kind: "default", title: t.r_default, amount: grams(l.goldMilli), to: lenderName, ref: j.ref, at: nowOf(state) });
                    })
                  }
                >
                  {t.loanTermEnds}
                </button>
              </div>
            )}
          </div>
        );
      })}

      <h2>{t.loanNew}</h2>
      {state.gold.milli <= 0 ? (
        <p className="muted">{t.loanNoGold}</p>
      ) : (
        <div className="card gold">
          <div className="field">
            <label htmlFor="lg">{t.loanPledge}</label>
            <input id="lg" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} />
            <p className="muted">
              {t.myGoldList}: {grams(state.gold.milli)} · ≈ {rupees((BigInt(milli) * price) / 1000n, false)}
            </p>
          </div>
          <p>
            {t.loanCanBorrow}: <b>{rupees(maxPaise, false)}</b>
          </p>
          <div className="field">
            <label htmlFor="la">{t.loanAmount}</label>
            <input id="la" inputMode="numeric" value={amt === "" ? String(Number(maxPaise / 100n)) : amt} onChange={(e) => setAmt(e.target.value)} />
          </div>
          <button className="btn" disabled={busy || milli <= 0} onClick={ask}>
            {busy ? t.working : fill(t.loanAsk, { g: grams(milli), r: rupees(BigInt(Math.round(amount * 100)), false) })}
          </button>
        </div>
      )}

      {done.length > 0 && <h2>{t.myLoans}</h2>}
      {[...done].reverse().map((l) => (
        <div className={"card " + (l.status === "DEFAULTED" ? "warn" : l.status === "REPAID" ? "ok" : "")} key={l.id}>
          <div className="row">
            <span className="mid" style={{ fontSize: 20 }}>
              {t.loanPrincipal} {rupees(l.principalPaise, false)}
            </span>
            <span className={"pill " + pill[l.status]}>{(t as any)["ln_" + l.status]}</span>
          </div>
          {l.status === "DEFAULTED" && <p>{fill(t.loanDefaulted, { g: grams(l.goldMilli) })}</p>}
          {l.status === "REPAID" && <p>{fill(t.loanRepaid, { g: grams(l.goldMilli) })}</p>}
        </div>
      ))}
    </div>
  );
}
