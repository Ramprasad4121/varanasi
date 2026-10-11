"use client";
import { useMemo, useState } from "react";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import type { Chit } from "@/lib/types";
import { fill, type Dict } from "@/lib/i18n";
import { day, rupees } from "@/lib/format";
import { Back, LS, nowOf, type P } from "./shared";

export function Chits({ t, lang, state, go, busy, run, act, addReceipt }: P) {
  const invites = state.chits.filter((c) => !c.me.joined && !c.started);
  const mine = state.chits.filter((c) => c.me.joined);
  return (
    <div>
      <h1>{t.chitsTitle}</h1>
      {mine.length === 0 && invites.length === 0 && <p className="muted">{t.noChits}</p>}
      {mine.map((c) => (
        <button key={c.address} className="card tap" onClick={() => go(`chit/${c.address}`)}>
          <div className="mid">{lang === "te" ? c.nameTe : c.name}</div>
          <div>
            {rupees(c.contributionPaise, false)} {t.perMonth} · {c.memberCount} {t.members}
          </div>
          <div className="muted">
            {c.started ? `${t.month} ${c.round} ${t.of} ${c.memberCount} · ` : ""}
            {(t as any)["phase_" + c.phase]}
          </div>
        </button>
      ))}
      {invites.length > 0 && <h2>{t.invites}</h2>}
      {invites.map((c) => (
        <div key={c.address} className="card gold">
          <div className="mid">{lang === "te" ? c.nameTe : c.name}</div>
          <div className="row">
            <span>{t.payEachMonth}</span>
            <span className="v">{rupees(c.contributionPaise, false)}</span>
          </div>
          <div className="row">
            <span>{t.potSize}</span>
            <span className="v">{rupees(c.fullPotPaise, false)}</span>
          </div>
          <div className="row">
            <span>{t.members}</span>
            <span className="v">
              {c.enrolledCount} / {c.memberCount}
            </span>
          </div>
          <div className="row">
            <span>{t.foreman}</span>
            <span className="v">{c.foreman}</span>
          </div>
          <div className="row">
            <span>{t.foremanFee}</span>
            <span className="v">{t.feeCap}</span>
          </div>
          <p className="muted">{t.joinHint}</p>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (!c.me.allowanceOk) await act("chit.allow", { fund: c.address });
                const ref = await act("chit.join", { fund: c.address });
                addReceipt({ kind: "join", title: t.r_join, to: lang === "te" ? c.nameTe : c.name, ref, at: nowOf(state) });
              })
            }
          >
            {busy ? t.working : t.joinGroup}
          </button>
        </div>
      ))}
      <MissedPayment t={t} />
    </div>
  );
}

function MissedPayment({ t, c }: { t: Dict; c?: Chit }) {
  return (
    <div className="card">
      <div className="mid">{t.missTitle}</div>
      <ol className="steps">
        <li>{t.missText1}</li>
        <li>
          {t.missText2}
          {c ? ` (${t.lateFeeIs}: ${rupees(c.lateFeePaise, false)})` : ""}
        </li>
        <li>{t.missText3}</li>
        <li>{t.missText4}</li>
      </ol>
    </div>
  );
}

function bidStoreKey(ledger: string, fund: string, round: number, addr: string) {
  return `vr.bid.${ledger}.${fund}.${round}.${addr}`.toLowerCase();
}

export function ChitScreen({ t, lang, state, go, busy, run, act, addReceipt, session, demo, address }: P & { address: string }) {
  const c = state.chits.find((x) => x.address.toLowerCase() === address.toLowerCase());
  const [bid, setBid] = useState("");
  const stored = useMemo(
    () => (c ? LS.get<{ bid: string; salt: `0x${string}` } | null>(bidStoreKey(state.ledgerId, c.address, c.round, session.address), null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c?.address, c?.round, c?.me.hasSealedBid, session.address, state.ledgerId]
  );
  if (!c) return <p className="muted">{t.noChits}</p>;
  const cname = lang === "te" ? c.nameTe : c.name;
  const nm = (m: { name: string; nameTe: string }) => (lang === "te" ? m.nameTe || m.name : m.name);
  const live = c.started && !c.finalized;
  const canPay = live && !c.me.paidThisRound && !c.me.excluded && (c.phase === "pay" || c.phase === "late");
  const canBid = live && !c.me.won && !c.me.excluded && !c.me.hasSealedBid && (c.phase === "pay" || c.phase === "late");
  const canOpen = c.me.hasSealedBid && !c.me.bidOpened && c.phase === "openBids" && !!stored;
  const payAmount = BigInt(c.contributionPaise) + (c.phase === "late" ? BigInt(c.lateFeePaise) : 0n);

  const pay = () =>
    run(async () => {
      if (!c.me.allowanceOk) await act("chit.allow", { fund: c.address });
      const ref = await act("chit.pay", { fund: c.address });
      addReceipt({ kind: "pay", title: `${t.r_pay}: ${t.month} ${c.round}`, amount: rupees(payAmount, false), to: cname, ref, at: nowOf(state) });
    });

  const seal = () =>
    run(async () => {
      const rupeesVal = Number(bid.replace(/[^\d.]/g, ""));
      if (!rupeesVal) throw new Error("BAD_AMOUNT");
      const paise = BigInt(Math.round(rupeesVal * 100));
      if (paise < BigInt(c.minBidPaise) || paise > BigInt(c.potPaise)) throw new Error("BidOutOfRange");
      const salt = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
      const h = keccak256(
        encodeAbiParameters(
          [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
          [c.address as `0x${string}`, BigInt(c.round), session.address as `0x${string}`, paise, salt]
        )
      );
      // the bid and its secret stay on this phone; only the hash is recorded
      LS.set(bidStoreKey(state.ledgerId, c.address, c.round, session.address), { bid: paise.toString(), salt });
      const ref = await act("chit.bid", { fund: c.address, hash: h });
      setBid("");
      addReceipt({ kind: "bid", title: `${t.r_bid}: ${t.month} ${c.round}`, amount: rupees(paise, false), to: cname, ref, at: nowOf(state) });
    });

  const openMine = async () => {
    if (!stored) return;
    const ref = await act("chit.reveal", { fund: c.address, bid: stored.bid, salt: stored.salt });
    addReceipt({ kind: "reveal", title: `${t.r_reveal}: ${t.month} ${c.round}`, amount: rupees(stored.bid, false), to: cname, ref, at: nowOf(state) });
  };

  return (
    <div>
      <Back t={t} to="chits" go={go} />
      <h1>{cname}</h1>
      <div className="card">
        <div className="row">
          <span>{t.payEachMonth}</span>
          <span className="v">{rupees(c.contributionPaise, false)}</span>
        </div>
        <div className="row">
          <span>{t.potSize}</span>
          <span className="v">{rupees(c.fullPotPaise, false)}</span>
        </div>
        {c.started && (
          <div className="row">
            <span>{t.month}</span>
            <span className="v">
              {c.round} {t.of} {c.memberCount}
            </span>
          </div>
        )}
        <div className="row">
          <span>{t.status}</span>
          <span className="v">{(t as any)["phase_" + c.phase]}</span>
        </div>
        <div className="row">
          <span>{t.foremanFee}</span>
          <span className="v">≤ {c.commissionBps / 100}%</span>
        </div>
      </div>

      {c.me.excluded && <div className="card warn">{t.excludedNote}</div>}
      {!c.me.excluded && c.me.won && c.me.defaults > 0 && <div className="card warn">{fill(t.missedAsWinner, { n: c.me.defaults })}</div>}

      {/* pay this month */}
      {live && (
        <>
          <h2>{t.payThisMonth}</h2>
          {c.me.paidThisRound ? (
            <div className="card ok mid">✓ {t.youPaid}</div>
          ) : canPay ? (
            <div className={"card " + (c.phase === "late" ? "warn" : "")}>
              <div className="big">{rupees(payAmount, false)}</div>
              <div className="muted">{c.phase === "late" ? t.lateNow : `${t.dueBy} ${day(c.payDeadline, lang)}`}</div>
              <div className="muted">
                {t.bankMoney}: {rupees(state.rupeePaise, false)}
              </div>
              <button className="btn green" disabled={busy} onClick={pay}>
                {busy ? t.working : `${t.payNow} ${rupees(payAmount, false)}`}
              </button>
            </div>
          ) : (
            <p className="muted">{(t as any)["phase_" + c.phase]}</p>
          )}
        </>
      )}

      {/* sealed bid */}
      {live && (
        <>
          <h2>{t.placeBid}</h2>
          <div className="card">
            {c.me.won ? (
              <p>{t.alreadyWon}</p>
            ) : c.me.hasSealedBid ? (
              <>
                <p className="mid">🔒 {t.bidSealed}</p>
                {stored && (
                  <p>
                    {t.bidAmount}: <b>{rupees(stored.bid, false)}</b>
                  </p>
                )}
                {canOpen && (
                  <button className="btn" disabled={busy} onClick={() => run(openMine)}>
                    {t.openBid}
                  </button>
                )}
              </>
            ) : canBid ? (
              <>
                <p className="muted">{t.bidHint}</p>
                {!c.me.paidThisRound && <p className="muted">{t.payFirst}</p>}
                <div className="field">
                  <label htmlFor="bid">{t.bidAmount} (₹)</label>
                  <input id="bid" inputMode="numeric" placeholder={String(Number(c.minBidPaise) / 100)} value={bid} onChange={(e) => setBid(e.target.value)} />
                  <p className="muted">
                    {t.between} {rupees(c.minBidPaise, false)} {t.and} {rupees(c.potPaise, false)}
                  </p>
                </div>
                <button className="btn" disabled={busy || !c.me.paidThisRound} onClick={seal}>
                  {busy ? t.working : `🔒 ${t.sealBid}`}
                </button>
              </>
            ) : (
              <p className="muted">{(t as any)["phase_" + c.phase]}</p>
            )}
          </div>
        </>
      )}

      {/* dividend */}
      {c.started && (
        <>
          <h2>{t.myDividend}</h2>
          <div className="card">
            <div className="row">
              <span>{t.dividendTotal}</span>
              <span className="v">{rupees(c.me.dividendsTotalPaise, false)}</span>
            </div>
            {BigInt(c.me.prizeHeldPaise) > 0n && (
              <div className="row">
                <span>{t.prizeHeld}</span>
                <span className="v">{rupees(c.me.prizeHeldPaise, false)}</span>
              </div>
            )}
            <div className="row">
              <span>{t.canTake}</span>
              <span className="v">{rupees(c.me.canTakePaise, false)}</span>
            </div>
            {BigInt(c.me.canTakePaise) > 0n && (
              <button
                className="btn green"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const ref = await act("chit.withdraw", { fund: c.address });
                    addReceipt({ kind: "withdraw", title: t.r_withdraw, amount: rupees(c.me.canTakePaise, false), to: cname, ref, at: nowOf(state) });
                  })
                }
              >
                {busy ? t.working : t.takeMoney}
              </button>
            )}
          </div>
        </>
      )}

      {/* who won and why */}
      {c.started && (
        <>
          <h2>{t.whoWon}</h2>
          {c.results.length === 0 && <p className="muted">{(t as any)["phase_" + c.phase]}</p>}
          {[...c.results].reverse().map((r) => {
            const left = BigInt(r.potPaise) - BigInt(r.payoutPaise);
            const shared = left - BigInt(r.commissionPaise);
            return (
              <div className="card" key={r.round}>
                <div className="label">
                  {t.month} {r.round}
                </div>
                <div className="mid">
                  🏆 {r.winnerIsMe ? t.you : lang === "te" ? r.winnerNameTe || r.winnerName : r.winnerName} {t.took} {rupees(r.payoutPaise, false)}
                </div>
                {r.bids.length > 0 && <p>{t.lowestBid}</p>}
                <div className="row">
                  <span>{t.potSize}</span>
                  <span className="v">{rupees(r.potPaise, false)}</span>
                </div>
                <div className="row">
                  <span>{t.discount}</span>
                  <span className="v">{rupees(left, false)}</span>
                </div>
                <div className="row">
                  <span>{t.foremanFee}</span>
                  <span className="v">{rupees(r.commissionPaise, false)}</span>
                </div>
                <div className="row">
                  <span>{t.sharedAs}</span>
                  <span className="v">
                    {rupees(shared, false)} ({rupees(r.dividendEachPaise, false)} {t.each})
                  </span>
                </div>
                {r.bids.length > 0 && (
                  <>
                    <div className="label" style={{ marginTop: 8 }}>
                      {t.allBids}
                    </div>
                    {r.bids.map((b, i) => (
                      <div className="row" key={i}>
                        <span>
                          {i === 0 ? "🏆 " : ""}
                          {nm(b)}
                        </span>
                        <span className="v">{rupees(b.bidPaise, false)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* members */}
      <h2>
        {c.memberCount} {t.members}
      </h2>
      <div className="card">
        {c.members.map((m) => (
          <div className="row" key={m.address}>
            <span>
              {m.isMe ? `${nm(m)} (${t.you})` : nm(m)}
              {m.won ? ` 🏆 ${t.month} ${m.wonRound}` : ""}
            </span>
            <span className={"pill " + (m.excluded ? "no" : m.paidThisRound || (!c.started && m.joined) ? "ok" : "wait")}>
              {c.started ? (m.excluded ? "✕" : m.paidThisRound ? t.paid : t.notPaid) : m.joined ? "✓" : "…"}
            </span>
          </div>
        ))}
      </div>

      <MissedPayment t={t} c={c} />

      <div className="demo-box">
        <div className="label">{t.demoNext}</div>
        <p className="muted">{t.demoNextHint}</p>
        <button
          className="btn demo"
          disabled={busy || !live}
          onClick={() =>
            run(async () => {
              if (canOpen) await openMine();
              await demo("nextStep", { fund: c.address, addr: session.address });
            })
          }
        >
          {busy ? t.working : t.demoNext}
        </button>
        <button
          className="btn demo"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const j = await demo("addMoney", { addr: session.address });
              addReceipt({ kind: "addMoney", title: t.r_addMoney, amount: "₹10,000", ref: j.ref, at: nowOf(state) });
            })
          }
        >
          {t.addMoney}
        </button>
      </div>
    </div>
  );
}
