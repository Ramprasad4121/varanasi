"use client";
import { useState } from "react";
import type { Dict, Lang } from "@/lib/i18n";
import { day, grams, refNo, rupees, when } from "@/lib/format";
import { MODE } from "@/lib/api";
import { LS, type P, type Receipt } from "./shared";

export function Home({ t, lang, state, go, name }: P & { name: string }) {
  const due = state.dues[0];
  const joined = state.chits.filter((c) => c.me.joined);
  const loan = state.loans.list.find((l) => l.status === "ACTIVE" || l.status === "APPROVED" || l.status === "ASKED");
  return (
    <div>
      <h1>
        {t.hello}
        {name ? `, ${name}` : ""}
      </h1>
      <button className="card gold tap" onClick={() => go("gold")}>
        <div className="label">{t.myGold}</div>
        <div className="big">{grams(state.gold.milli)}</div>
        <div className="mid">
          {rupees(state.gold.valuePaise, false)} <span className="muted">{t.worth}</span>
        </div>
        {state.gold.pledgedMilli > 0 && (
          <div className="muted">
            + {grams(state.gold.pledgedMilli)} {t.goldPledged}
          </div>
        )}
        <div className="muted">
          {t.priceNote}: {rupees(state.gold.pricePaisePerGram, false)} (demo)
        </div>
      </button>

      <div className={"card " + (due ? (due.late ? "warn" : "") : "ok")}>
        <div className="label">{t.nextPayment}</div>
        {due ? (
          <>
            <div className="big">{rupees(due.amountPaise, false)}</div>
            <div>{lang === "te" ? due.chitTe : due.chit}</div>
            <div className="muted">{due.late ? t.lateNow : `${t.dueBy} ${day(due.dueAt, lang)}`}</div>
            <button className="btn" onClick={() => go(`chit/${due.address}`)}>
              {t.payNow}
            </button>
          </>
        ) : (
          <div className="mid">{t.nothingDue}</div>
        )}
      </div>

      {loan && (
        <button className="card tap" onClick={() => go("gold/loan")}>
          <div className="label">{t.homeLoan}</div>
          <div className="mid">{(t as any)["ln_" + loan.status]}</div>
          {loan.status === "ACTIVE" && (
            <>
              <div>
                {t.loanOwed}: <b>{rupees(loan.owedNowPaise)}</b>
              </div>
              <div className="muted">
                {t.loanDue} {day(loan.dueAt, lang)}
              </div>
            </>
          )}
        </button>
      )}

      <h2>{t.myChits}</h2>
      {joined.length === 0 && <p className="muted">{t.noChits}</p>}
      {joined.map((c) => (
        <button key={c.address} className="card tap" onClick={() => go(`chit/${c.address}`)}>
          <div className="mid">{lang === "te" ? c.nameTe : c.name}</div>
          <div>
            {rupees(c.contributionPaise, false)} {t.perMonth} · {c.memberCount} {t.members}
          </div>
          <div className="muted">
            {c.started ? `${t.month} ${c.round} ${t.of} ${c.memberCount} · ` : ""}
            {(t as any)["phase_" + c.phase]}
          </div>
          <div style={{ marginTop: 6 }}>
            {c.me.excluded ? (
              <span className="pill no">{t.notPaid}</span>
            ) : c.me.paidThisRound ? (
              <span className="pill ok">✓ {t.youPaid}</span>
            ) : c.started && !c.finalized ? (
              <span className="pill wait">{t.notPaid}</span>
            ) : null}
          </div>
        </button>
      ))}

      <div className="tiles" style={{ marginTop: 8 }}>
        <button className="tile" onClick={() => go("gold/proof")}>
          <span className="ic">🏦</span>
          {t.proofTitle}
        </button>
        <button className="tile" onClick={() => go("gold/loan")}>
          <span className="ic">🤝</span>
          {t.loanTitle}
        </button>
      </div>
    </div>
  );
}

export function Receipts({ t, lang, receiptsKey }: P & { receiptsKey: string }) {
  const [open, setOpen] = useState<Receipt | null>(null);
  const list = receiptsKey ? LS.get<Receipt[]>(receiptsKey, []) : [];
  return (
    <div>
      <h1>{t.receiptsTitle}</h1>
      {list.length === 0 && <p className="muted">{t.noReceipts}</p>}
      {list.map((r, i) => (
        <button key={i} className="card tap" onClick={() => setOpen(r)}>
          <div className="row">
            <span className="mid" style={{ fontSize: 20 }}>
              {r.title}
            </span>
            <span className="v">{r.amount}</span>
          </div>
          <div className="muted">{when(r.at, lang)}</div>
        </button>
      ))}
      {open && <ReceiptSheet t={t} lang={lang} r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function ReceiptSheet({ t, lang, r, onClose }: { t: Dict; lang: Lang; r: Receipt; onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t.receipt} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tick">✓</div>
        <div className="center label">{t.receipt}</div>
        <h1 className="center">{r.title}</h1>
        {r.amount && <div className="center big">{r.amount}</div>}
        <div className="card">
          {r.to && (
            <div className="row">
              <span>{t.to}</span>
              <span className="v">{r.to}</span>
            </div>
          )}
          {r.note && (
            <div className="row">
              <span>{t.branch}</span>
              <span className="v">{r.note}</span>
            </div>
          )}
          <div className="row">
            <span>{t.dateTime}</span>
            <span className="v">{when(r.at, lang)}</span>
          </div>
          <div className="row">
            <span>{MODE === "public" ? t.demoRef : t.refNo}</span>
            <span className="v mono">{refNo(r.ref)}</span>
          </div>
          <div className="row">
            <span>✓</span>
            <span className="v">{t.noCharge}</span>
          </div>
        </div>
        <button className="btn" onClick={onClose}>
          {t.done}
        </button>
      </div>
    </div>
  );
}
