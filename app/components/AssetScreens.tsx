"use client";
// Silver savings, pledged items and the bank asset desk. They run on the asset test
// ledger (lib/assets.ts), which follows the contracts in contracts/src/assets.
// TEST money only. One primary action per screen.
import { useCallback, useState } from "react";
import { day, grams, rupees } from "@/lib/format";
import {
  BUYERS,
  CLASS_RULES,
  bid,
  borrow,
  deskHeldPaise,
  lendableValue,
  maxBorrow,
  minimumBid,
  pledgeItem,
  redeemListing,
  repay,
  saveSilver,
  seedAssets,
  settleListing,
  silverBacked,
  silverValuePaise,
  stepAssets,
  warp,
  type AssetWorld,
  type ItemKind,
  type Listing,
} from "@/lib/assets";
import { Back, LS, type P } from "./shared";
import { Icon } from "./Icon";

const KINDS: ItemKind[] = ["car", "bike", "land", "jewellery"];

/** The asset ledger for this person, kept in this browser. */
function useAssets(p: P) {
  const key = `vr.assets.${p.state.ledgerId}.${p.session.address}`;
  const load = useCallback(() => {
    const w = LS.get<AssetWorld | null>(key, null);
    return w && w.v === 1 ? w : seedAssets(p.state.now);
  }, [key, p.state.now]);
  const [world, setWorld] = useState<AssetWorld>(load);
  /** Runs one step on a copy; a refused step changes nothing. */
  const doStep = <T,>(fn: (w: AssetWorld) => T): T => {
    const { world: next, out } = stepAssets(load(), fn);
    LS.set(key, next);
    setWorld(next);
    return out;
  };
  return { world, doStep };
}

// ---------------------------------------------------------------- silver
export function Silver(p: P) {
  const { t, lang, go, busy, run, addReceipt } = p;
  const { world, doStep } = useAssets(p);
  const backed = silverBacked(world);
  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.silverTitle}</h1>
      <section className="card balance silver" aria-label={t.mySilver}>
        <div className="label">{t.mySilver}</div>
        <div className="big" data-testid="silver-grams">
          {grams(world.silverMilli)}
        </div>
        <div className="mid">
          {rupees(silverValuePaise(world), false)} <span className="muted">{t.worth}</span>
        </div>
        <div className="muted small">
          {t.priceNote}: {rupees(world.silverPricePaisePerGram, false)} (demo)
        </div>
        <div className={"trust " + (backed ? "ok" : "no")}>
          <span aria-hidden>{backed ? "✓" : "!"}</span>
          <span>
            {t.silverHeld} {grams(world.silverHeldMilli)} · {t.silverIssued} {grams(world.silverMilli)} · <b>{backed ? t.fullyBacked : t.notBacked}</b>
          </span>
        </div>
      </section>
      <p>{t.silverHow}</p>
      <p className="muted">{t.silverNote}</p>
      <div className="demo-box">
        <div className="label">{t.bankCounter}</div>
        <p className="muted">{t.silverCounterHint}</p>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const c = doStep((w) => saveSilver(w, 100, 999));
              addReceipt({ kind: "silver", title: t.r_silver, amount: `${grams(c.milli)} ${t.pureSilver}`, to: c.no, ref: c.no, at: world.now });
            })
          }
        >
          {busy ? t.working : t.doSilverDeposit}
        </button>
      </div>
      <h2>{t.silverCerts}</h2>
      {world.silverCerts.length === 0 && <p className="muted">{t.noSilver}</p>}
      {[...world.silverCerts].reverse().map((c) => (
        <div className="cert" key={c.no}>
          <div className="mono">{c.no}</div>
          <div className="row">
            <span>{t.pureSilver}</span>
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

// ---------------------------------------------------------------- pledge an item
export function Pledge(p: P) {
  const { t, lang, go, busy, run, addReceipt } = p;
  const { world, doStep } = useAssets(p);
  const [kind, setKind] = useState<ItemKind>("bike");
  const [amount, setAmount] = useState("");
  const [fresh, setFresh] = useState(false);
  const current = fresh ? undefined : [...world.pledges].reverse().find((x) => x.status !== "RELEASED");
  const loan = current ? world.loans.find((l) => l.pledgeId === current.id && l.status === "ACTIVE") : undefined;
  const repaid = current ? world.loans.some((l) => l.pledgeId === current.id && l.status === "REPAID") : false;

  if (!current) {
    return (
      <div>
        <Back t={t} to="gold" go={go} />
        <h1>{t.pledgeTitle}</h1>
        <p>{t.pledgeIntro}</p>
        <fieldset className="field choices">
          <legend>{t.pickItem}</legend>
          {KINDS.map((k) => (
            <label key={k} className={"choice" + (kind === k ? " on" : "")}>
              <input type="radio" name="item" value={k} checked={kind === k} onChange={() => setKind(k)} />
              {t[`item_${k}` as const]}
            </label>
          ))}
        </fieldset>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = doStep((w) => pledgeItem(w, kind));
              setFresh(false);
              addReceipt({
                kind: "pledge",
                title: t.r_itemPledge,
                amount: `${t[`item_${r.kind}` as const]} · ${rupees(r.appraisedPaise, false)}`,
                to: r.bank,
                ref: `PR-${r.id}`,
                at: world.now,
              });
            })
          }
        >
          {busy ? t.working : t.doPledge}
        </button>
      </div>
    );
  }

  const max = maxBorrow(world, current);
  const want = amount === "" ? max : Math.round((Number(amount) || 0) * 100);
  return (
    <div>
      <Back t={t} to="gold" go={go} />
      <h1>{t.pledgeTitle}</h1>
      <section className="card receipt-card" aria-label={t.pledgeReceipt} data-testid="pledge-receipt">
        <div className="label">
          {t.pledgeReceipt} · PR-{current.id}
        </div>
        <div className="mid">{t[`item_${current.kind}` as const]}</div>
        <div className="row">
          <span>{t.appraised}</span>
          <span className="v">{rupees(current.appraisedPaise, false)}</span>
        </div>
        <div className="row">
          <span>{t.lendable}</span>
          <span className="v">{rupees(lendableValue(world, current), false)}</span>
        </div>
        <div className="row">
          <span>{t.validTill}</span>
          <span className="v">{day(current.reappraiseBy, lang)}</span>
        </div>
        <div className="row">
          <span>{t.keptAt}</span>
          <span className="v">{current.bank}</span>
        </div>
        <p className="muted small">{t.lienNote}</p>
        <p className="muted small mono">{current.assetIdHash}</p>
        <p className="muted small">{t.cannotSell}</p>
      </section>

      {loan ? (
        <div className="card">
          <div className="label">{t.itemLoanActive}</div>
          <div className="row">
            <span>{t.owedBack}</span>
            <span className="v">{rupees(loan.principalPaise, false)}</span>
          </div>
          <div className="row">
            <span>{t.loanDue}</span>
            <span className="v">{day(loan.dueAt, lang)}</span>
          </div>
          <button
            className="btn green"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const l = doStep((w) => repay(w, loan.id));
                addReceipt({
                  kind: "itemRepay",
                  title: t.r_itemRepay,
                  amount: rupees(l.principalPaise, false),
                  to: current.bank,
                  ref: `IL-${l.id}`,
                  at: world.now,
                });
              })
            }
          >
            {busy ? t.working : t.payBackItem}
          </button>
        </div>
      ) : (
        <>
          {repaid && (
            <div className="card ok mid" role="status">
              ✓ {t.itemFree}
            </div>
          )}
          <p>
            {t.canBorrow} <b>{rupees(max, false)}</b>
          </p>
          <div className="field">
            <label htmlFor="ia">{t.borrowAmount}</label>
            <input id="ia" inputMode="decimal" placeholder={String(max / 100)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="muted small">
              {Math.round(CLASS_RULES[current.kind].ltvBps / 100)}% {t.lendable.toLowerCase()} · 90 d
            </p>
          </div>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const l = doStep((w) => borrow(w, current.id, want));
                addReceipt({
                  kind: "itemLoan",
                  title: t.r_itemLoan,
                  amount: rupees(l.principalPaise, false),
                  to: current.bank,
                  ref: `IL-${l.id}`,
                  at: world.now,
                });
              })
            }
          >
            {busy ? t.working : t.borrowAgainst}
          </button>
          <button className="back" onClick={() => setFresh(true)}>
            + {t.newPledge}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bank asset desk (bank side, English)
const LEGAL: Record<Listing["legal"], string> = {
  DEMAND_NOTICE: "Demand notice served",
  POSSESSION_TAKEN: "Possession taken",
  AUCTION_NOTICE: "Auction notice served and published",
};

export function BankDesk(p: P) {
  const { lang, go, busy, run, t } = p;
  const { world, doStep } = useAssets(p);
  const l = world.listings[world.listings.length - 1];
  const high = l?.bids[l.bids.length - 1];
  const windowOpen = l ? world.now <= l.redemptionEnd : false;
  const biddingOpen = l ? world.now <= l.biddingEnd : false;
  const canSettle = l && l.status === "LISTED" && !windowOpen && !biddingOpen;
  // one primary action: bid while bidding is open, settle once both clocks have run out
  const primary = canSettle ? "settle" : l?.status === "LISTED" && biddingOpen ? "bid" : "none";
  const nextBuyer = BUYERS[(l?.bids.length || 0) % BUYERS.length];
  const status: Record<Listing["status"], string> = {
    LISTED: "On auction",
    REDEEMED: "Borrower paid dues, item returned",
    SOLD: "Sold",
    UNSOLD: "Not sold, back with the bank",
  };
  return (
    <div>
      <Back t={t} to="home" go={go} />
      <h1>Bank asset desk</h1>
      <p className="muted">
        For banks: items held after a loan default (gold loan jewellery, repossessed vehicles, property under SARFAESI). Only approved banks and dealers can
        bid. Test money only.
      </p>
      {l && (
        <section className="card" aria-label="Listing" data-testid="desk-listing">
          <div className="label">Listing {l.id}</div>
          <div className="mid with-ic">
            <Icon name="bank" /> {l.title}
          </div>
          <div className="row">
            <span>Status</span>
            <span className="v" data-testid="desk-status">
              {status[l.status]}
            </span>
          </div>
          <div className="row">
            <span>Legal step</span>
            <span className="v">{LEGAL[l.legal]}</span>
          </div>
          <div className="row">
            <span>Reserve price</span>
            <span className="v">{rupees(l.reservePaise, false)}</span>
          </div>
          <div className="row">
            <span>Borrower can pay {rupees(l.duesPaise, false)} till</span>
            <span className="v">{day(l.redemptionEnd, lang)}</span>
          </div>
          <div className="row">
            <span>Bidding ends</span>
            <span className="v">{day(l.biddingEnd, lang)}</span>
          </div>
          <div className="row">
            <span>Highest bid</span>
            <span className="v" data-testid="desk-high">
              {high ? `${rupees(high.paise, false)} (${high.bidder})` : "None yet"}
            </span>
          </div>
          {l.status === "SOLD" && (
            <div className="row">
              <span>Surplus back to borrower</span>
              <span className="v" data-testid="desk-surplus">
                {rupees(l.surplusPaise || 0, false)}
              </span>
            </div>
          )}
          {l.status === "SOLD" && (
            <div className="row">
              <span>Bank re-checked value</span>
              <span className="v">{rupees(l.newAppraisalPaise || 0, false)}</span>
            </div>
          )}
          <div className="row">
            <span>Money held in escrow</span>
            <span className="v">{rupees(deskHeldPaise(world), false)}</span>
          </div>
          <div className="row">
            <span>Today (demo clock)</span>
            <span className="v">{day(world.now, lang)}</span>
          </div>
        </section>
      )}
      {l && l.status === "LISTED" && (
        <>
          {primary === "bid" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  doStep((w) => bid(w, l.id, nextBuyer, minimumBid(l)));
                })
              }
            >
              {busy ? t.working : `${nextBuyer} bids ${rupees(minimumBid(l), false)}`}
            </button>
          )}
          {primary === "settle" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  doStep((w) => settleListing(w, l.id, high ? high.paise : l.reservePaise));
                })
              }
            >
              {busy ? t.working : "Settle auction"}
            </button>
          )}
          <div className="demo-box">
            <div className="label">Demo controls</div>
            {windowOpen && (
              <button className="btn demo" disabled={busy} onClick={() => run(async () => void doStep((w) => redeemListing(w, l.id)))}>
                Borrower pays dues and takes it back
              </button>
            )}
            <button className="btn demo" disabled={busy} onClick={() => run(async () => void doStep((w) => warp(w, 36)))}>
              Move the clock 36 days (demo)
            </button>
            <button className="btn demo" disabled={busy} onClick={() => run(async () => void doStep((w) => bid(w, l.id, "Unknown buyer", minimumBid(l))))}>
              Unapproved buyer tries to bid
            </button>
          </div>
        </>
      )}
      {l && l.status !== "LISTED" && (
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              doStep((w) => {
                const fresh = seedAssets(w.now);
                const next = fresh.listings[0];
                next.id = ++w.seq;
                w.listings.push(next);
              });
            })
          }
        >
          List another repossessed item (demo)
        </button>
      )}
    </div>
  );
}
