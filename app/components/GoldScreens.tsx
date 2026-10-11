"use client";
import { useState } from "react";
import { day, grams, rupees, when } from "@/lib/format";
import { Back, nowOf, type P } from "./shared";
import { BalanceCard } from "./HomeScreens";
import { Icon } from "./Icon";

export function Gold({ t, lang, state, go }: P) {
  return (
    <div>
      <h1>{t.goldTitle}</h1>
      <BalanceCard t={t} state={state} go={go} />
      <button className="btn" onClick={() => go("gold/deposit")}>
        {t.saveGold}
      </button>
      <div className="tiles">
        <button className="tile" onClick={() => go("gold/send")}>
          <span className="ic">
            <Icon name="send" />
          </span>
          {t.sendGold}
        </button>
        <button className="tile" onClick={() => go("gold/redeem")}>
          <span className="ic">
            <Icon name="out" />
          </span>
          {t.takeGold}
        </button>
        <button className="tile" onClick={() => go("gold/loan")}>
          <span className="ic">
            <Icon name="loan" />
          </span>
          {t.loanTitle}
        </button>
        <button className="tile" onClick={() => go("gold/proof")}>
          <span className="ic">
            <Icon name="check" />
          </span>
          {t.proofTitle}
        </button>
      </div>
      <h2>{t.certificates}</h2>
      {state.reserve.certificates
        .filter((c) => c.mine)
        .map((c) => (
          <div className="cert" key={c.certificateNo}>
            <div className="mono">{c.certificateNo}</div>
            <div className="row">
              <span>{t.pureGold}</span>
              <span className="v">{grams(c.milli)}</span>
            </div>
            <div className="row">
              <span>{t.purity}</span>
              <span className="v">{(c.purity / 10).toFixed(1)}%</span>
            </div>
            <div className="row">
              <span>{t.depositedOn}</span>
              <span className="v">{day(c.at, lang)}</span>
            </div>
          </div>
        ))}
    </div>
  );
}

export function GoldDeposit({ t, state, go, busy, run, addReceipt, session, demo }: P) {
  const bank = state.reserve.banks[0];
  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.howDeposit}</h1>
      <div className="card">
        <div className="label">{bank?.name}</div>
        <ol className="steps">
          <li>{t.depositStep1}</li>
          <li>{t.depositStep2}</li>
          <li>{t.depositStep3}</li>
          <li>{t.depositStep4}</li>
          <li>{t.depositStep5}</li>
        </ol>
        <p className="muted">{t.depositNote}</p>
      </div>
      <div className="demo-box">
        <div className="label">{t.bankCounter}</div>
        <p className="muted">{t.bankCounterHint}</p>
        <button
          className="btn demo"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const j = await demo("bankDeposit", { addr: session.address, grams: "10", purity: "916" });
              addReceipt({
                kind: "deposit",
                title: t.r_deposit,
                amount: `${grams(j.milli)} ${t.pureGold}`,
                to: j.certNo,
                ref: j.ref,
                at: nowOf(state),
                note: bank?.name,
              });
            })
          }
        >
          {busy ? t.working : t.doDeposit}
        </button>
      </div>
    </div>
  );
}

export function GoldSend({ t, state, go, busy, run, act, addReceipt }: P) {
  const [to, setTo] = useState("");
  const [g, setG] = useState("1");
  const price = Number(state.gold.pricePaisePerGram);
  const gNum = Number(g) || 0;
  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.sendGold}</h1>
      <p className="muted">
        {t.myGoldList}: {grams(state.gold.milli)}
      </p>
      <div className="field">
        <label htmlFor="to">{t.sendTo}</label>
        <input id="to" inputMode="numeric" autoComplete="tel" placeholder="90000 00001" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="g">{t.grams}</label>
        <input id="g" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} />
        <p className="muted">≈ {rupees(Math.round(gNum * price), false)}</p>
      </div>
      <p className="muted">{t.sendHint}</p>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run(async () => {
            if (gNum <= 0) throw new Error("BAD_AMOUNT");
            if (Math.round(gNum * 1000) > state.gold.milli) throw new Error("ERC20InsufficientBalance");
            const ref = await act("gold.send", { toPhone: to, grams: g });
            addReceipt({
              kind: "send",
              title: t.r_send,
              amount: `${grams(Math.round(gNum * 1000))} (${rupees(Math.round(gNum * price), false)})`,
              to,
              ref,
              at: nowOf(state),
            });
          })
        }
      >
        {busy ? t.working : t.send}
      </button>
    </div>
  );
}

export function GoldRedeem({ t, lang, state, go, busy, run, act, addReceipt, demo }: P) {
  const [g, setG] = useState("1");
  const bank = state.reserve.banks[0];
  const pillCls: Record<string, string> = { PENDING: "wait", FULFILLED: "ok", CANCELLED: "no" };
  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.takeGold}</h1>
      <p className="muted">{t.takeHint}</p>
      <div className="card">
        <div className="row">
          <span>{t.myGoldList}</span>
          <span className="v">{grams(state.gold.milli)}</span>
        </div>
        <div className="row">
          <span>{t.branch}</span>
          <span className="v">{bank?.name}</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="rg">{t.grams}</label>
        <input id="rg" inputMode="decimal" value={g} onChange={(e) => setG(e.target.value)} />
      </div>
      <button
        className="btn"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const want = Math.round((Number(g) || 0) * 1000);
            if (want <= 0) throw new Error("BAD_AMOUNT");
            if (want > state.gold.milli) throw new Error("ERC20InsufficientBalance");
            const ref = await act("gold.redeem", { grams: g, branch: state.reserve.branch });
            addReceipt({ kind: "redeem", title: t.r_redeem, amount: grams(want), to: bank?.name, ref, at: nowOf(state) });
          })
        }
      >
        {busy ? t.working : t.request}
      </button>

      <h2>{t.status}</h2>
      {state.gold.redemptions.length === 0 && <p className="muted">{t.noRequests}</p>}
      {[...state.gold.redemptions].reverse().map((r) => (
        <div className="card" key={r.id}>
          <div className="row">
            <span>
              {t.requestNo} {r.id}
            </span>
            <span className={"pill " + pillCls[r.status]}>{(t as any)["st_" + r.status]}</span>
          </div>
          <div className="row">
            <span>{grams(r.milli)}</span>
            <span className="muted">{when(r.requestedAt, lang)}</span>
          </div>
          {r.status === "PENDING" && (
            <button
              className="btn demo"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const j = await demo("bankRelease", { id: String(r.id) });
                  addReceipt({ kind: "release", title: t.r_release, amount: grams(r.milli), to: bank?.name, ref: j.ref, at: nowOf(state) });
                })
              }
            >
              {t.bankRelease}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function GoldProof({ t, lang, state, go }: P) {
  const r = state.reserve;
  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.proofTitle}</h1>
      {r.banks.map((b) => {
        const pct = b.owedMilli + b.awaitingMilli > 0 ? Math.min(100, Math.round((b.heldMilli / (b.owedMilli + b.awaitingMilli)) * 100)) : 100;
        return (
          <div key={b.bankId} className={"card " + (b.fullyBacked ? "ok" : "warn")}>
            <div className="mid with-ic">
              <Icon name="bank" /> {b.name}
            </div>
            <div className="row">
              <span>{t.bankHolds}</span>
              <span className="v">{grams(b.heldMilli)}</span>
            </div>
            <div className="row">
              <span>{t.appIssued}</span>
              <span className="v">{grams(b.owedMilli)}</span>
            </div>
            {b.awaitingMilli > 0 && (
              <div className="row">
                <span>{t.awaiting}</span>
                <span className="v">{grams(b.awaitingMilli)}</span>
              </div>
            )}
            {b.capMilli > 0 && (
              <div className="row">
                <span>{t.bankLimit}</span>
                <span className="v">{grams(b.capMilli)}</span>
              </div>
            )}
            <div className="bar" aria-hidden>
              <div style={{ width: `${b.fullyBacked ? 100 : pct}%` }} />
            </div>
            <div className="mid">{b.fullyBacked ? `✓ ${t.fullyBacked}` : `⚠ ${t.notBacked}`}</div>
            <div className="muted">
              {t.valueAll}: {rupees(b.valuePaise, false)} (demo)
            </div>
          </div>
        );
      })}
      <p>{t.proofExplain}</p>
      <h2>{t.certificates}</h2>
      {r.certificates.map((c) => (
        <div className="cert" key={c.certificateNo}>
          <div className="row">
            <span className="mono">{c.certificateNo}</span>
            {c.mine && <span className="pill ok">{t.mine}</span>}
          </div>
          <div className="row">
            <span>
              {grams(c.milli)} · {t.purity} {(c.purity / 10).toFixed(1)}%
            </span>
            <span className="muted">{day(c.at, lang)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
