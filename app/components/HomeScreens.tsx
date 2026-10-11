"use client";
import { useState } from "react";
import type { Dict, Lang } from "@/lib/i18n";
import { day, grams, refNo, rupees, when } from "@/lib/format";
import { MODE } from "@/lib/api";
import { LS, type P, type Receipt } from "./shared";
import { Icon } from "./Icon";

export function Home({ t, lang, state, go, name }: P & { name: string }) {
  const due = state.dues[0];
  const joined = state.chits.filter((c) => c.me.joined);
  const invites = state.chits.filter((c) => !c.me.joined && !c.started);
  const loan = state.loans.list.find((l) => l.status === "ACTIVE" || l.status === "APPROVED" || l.status === "ASKED");
  // one primary action per screen: paying a due chit wins, otherwise saving gold
  const primary = due ? "pay" : "save";
  return (
    <div>
      <h1>
        {t.hello}
        {name ? `, ${name}` : ""}
      </h1>
      <BalanceCard t={t} state={state} go={go} />
      <div className="actions" role="group" aria-label={t.myGold}>
        <button className={"act " + (primary === "save" ? "primary" : "")} onClick={() => go("gold/deposit")}>
          <span className="ic">
            <Icon name="bank" />
          </span>
          {t.saveGold}
        </button>
        <button className="act" onClick={() => go("gold/send")}>
          <span className="ic">
            <Icon name="send" />
          </span>
          {t.sendShort}
        </button>
        <button className="act" onClick={() => go("gold/redeem")}>
          <span className="ic">
            <Icon name="out" />
          </span>
          {t.takeOutShort}
        </button>
      </div>

      <div className={"card " + (due ? (due.late ? "warn" : "") : "ok")}>
        <div className="label">{t.nextPayment}</div>
        {due ? (
          <>
            <div className="big">{rupees(due.amountPaise, false)}</div>
            <div>{lang === "te" ? due.chitTe : due.chit}</div>
            <div className={due.late ? "late" : "muted"}>{due.late ? t.lateNow : `${t.dueBy} ${day(due.dueAt, lang)}`}</div>
            <button className="btn green" onClick={() => go(`chit/${due.address}`)}>
              {t.payNow} {rupees(due.amountPaise, false)}
            </button>
          </>
        ) : (
          <div className="mid">✓ {t.nothingDue}</div>
        )}
      </div>

      {invites.length > 0 && (
        <button className="card tap invite" onClick={() => go("chits")}>
          <div className="label">{t.invitedBy}</div>
          <div className="mid">{lang === "te" ? invites[0].nameTe : invites[0].name}</div>
          <div className="muted">
            {rupees(invites[0].contributionPaise, false)} {t.perMonth} · {invites[0].enrolledCount}/{invites[0].memberCount} {t.members}
          </div>
          <span className="link">{t.seeInvite} →</span>
        </button>
      )}

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
      {joined.length === 0 && (
        <div className="empty">
          <p>{t.noChits}</p>
          {invites.length === 0 && <p className="muted">{t.joinHint}</p>}
        </div>
      )}
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

      <button className="tile wide" style={{ marginTop: 8 }} onClick={() => go("gold/loan")}>
        <span className="ic">
          <Icon name="loan" />
        </span>
        {t.loanTitle}
      </button>
    </div>
  );
}

/** The balance card: grams first, rupees second, and where the gold is kept with a
 *  one tap link to the proof that the bank holds it all. */
export function BalanceCard({ t, state, go }: Pick<P, "t" | "state" | "go">) {
  const bank = state.reserve.banks[0];
  const backed = state.reserve.fullyBacked;
  return (
    <section className="card balance" aria-label={t.myGold}>
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
      <div className="muted small">
        {t.priceNote}: {rupees(state.gold.pricePaisePerGram, false)} (demo)
      </div>
      <button className={"trust " + (backed ? "ok" : "no")} onClick={() => go("gold/proof")}>
        <span aria-hidden>{backed ? "✓" : "!"}</span>
        <span>
          {t.keptAt} {bank?.name} · <b>{backed ? t.fullyBacked : t.notBacked}</b>
        </span>
        <span className="link">{t.checkProof} →</span>
      </button>
    </section>
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
