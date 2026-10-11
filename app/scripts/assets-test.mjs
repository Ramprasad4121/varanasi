// Asset test ledger checks (app/lib/assets.ts): silver savings, pledge receipts,
// loans against items and the bank asset desk. Same rules and numbers as the
// contracts in contracts/src/assets. TEST money only.
// Usage (Node 22.18+): node --import ./scripts/ts-hook.mjs scripts/assets-test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY,
  bid,
  borrow,
  deskHeldPaise,
  lendableValue,
  maxBorrow,
  minimumBid,
  pledgeItem,
  redeemListing,
  releaseItem,
  repay,
  saveSilver,
  seedAssets,
  settleListing,
  silverBacked,
  silverValuePaise,
  stepAssets,
  warp,
} from "../lib/assets.ts";

const T0 = 1_790_000_000;
const code = (fn) => {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e.message;
  }
};

test("silver: 100 g of 99.9% is saved, backed, valued", () => {
  const w = seedAssets(T0);
  const c = saveSilver(w, 100, 999);
  assert.equal(c.milli, 100_000);
  assert.equal(w.silverMilli, 100_000);
  assert.ok(silverBacked(w));
  assert.equal(silverValuePaise(w), 100 * 110_00);
  assert.equal(
    code(() => saveSilver(w, 10, 925)),
    "SILVER_PURITY"
  );
  assert.equal(
    code(() => saveSilver(w, 0, 999)),
    "BAD_AMOUNT"
  );
});

test("pledge: haircut and LTV per item kind match the contracts", () => {
  const w = seedAssets(T0);
  const car = pledgeItem(w, "car");
  assert.equal(lendableValue(w, car), 4_20_000_00); // Rs 6 lakh less 30%
  assert.equal(maxBorrow(w, car), 2_52_000_00); // 60% of that
  const bike = pledgeItem(w, "bike");
  assert.equal(maxBorrow(w, bike), Math.floor((80_000_00 * 0.6 * 5000) / 10_000));
  assert.match(car.assetIdHash, /^0x[0-9a-f]{16}\.\.\.$/);
  assert.equal(
    code(() => pledgeItem(w, "boat")),
    "BAD_ITEM"
  );
});

test("pledge: borrow, repay, limits, stale value", () => {
  const w = seedAssets(T0);
  const p = pledgeItem(w, "car");
  assert.equal(
    code(() => borrow(w, p.id, maxBorrow(w, p) + 1)),
    "ITEM_LOAN_TOO_LARGE"
  );
  assert.equal(
    code(() => borrow(w, p.id, 0)),
    "BAD_AMOUNT"
  );
  assert.equal(
    code(() => borrow(w, p.id, 1, 400)),
    "ITEM_LOAN_TOO_LONG"
  );
  const l = borrow(w, p.id, 1_00_000_00);
  assert.equal(w.rupeePaise, 1_00_000_00);
  assert.equal(
    code(() => borrow(w, p.id, 1)),
    "ITEM_BUSY"
  );
  assert.equal(
    code(() => releaseItem(w, p.id)),
    "ITEM_BUSY"
  );
  repay(w, l.id);
  assert.equal(w.rupeePaise, 0);
  assert.equal(
    code(() => repay(w, l.id)),
    "LoanNotActive"
  );
  warp(w, 366);
  assert.equal(lendableValue(w, p), 0);
  assert.equal(releaseItem(w, p.id).status, "RELEASED");
  assert.equal(
    code(() => borrow(w, 999, 1)),
    "NO_SUCH_ITEM"
  );
});

test("desk: English auction settles only after window, escrow always covered", () => {
  const w = seedAssets(T0);
  const l = w.listings[0];
  assert.equal(
    code(() => bid(w, l.id, "Unknown buyer", l.reservePaise)),
    "DeskNotApprovedBuyer"
  );
  assert.equal(
    code(() => bid(w, l.id, "Mock Bank 1", l.reservePaise)),
    "DeskNotApprovedBuyer"
  );
  assert.equal(
    code(() => bid(w, l.id, "Mock Bank 2", l.reservePaise - 1)),
    "DeskBidTooLow"
  );
  bid(w, l.id, "Mock Bank 2", l.reservePaise);
  bid(w, l.id, "Approved Dealer A", minimumBid(l));
  assert.equal(w.credits["Mock Bank 2"], l.reservePaise);
  assert.equal(deskHeldPaise(w), l.reservePaise + minimumBid({ ...l, bids: [l.bids[0]] }));
  assert.equal(
    code(() => settleListing(w, l.id, 1)),
    "DeskWindowOpen"
  );
  warp(w, 31);
  assert.equal(
    code(() => settleListing(w, l.id, 1)),
    "DeskAuctionRunning"
  );
  assert.equal(
    code(() => redeemListing(w, l.id)),
    "DeskWindowClosed"
  );
  warp(w, 5);
  assert.equal(
    code(() => bid(w, l.id, "Approved Dealer B", minimumBid(l))),
    "DeskBiddingClosed"
  );
  const s = settleListing(w, l.id, 3_20_000_00);
  assert.equal(s.status, "SOLD");
  assert.equal(s.winner, "Approved Dealer A");
  assert.equal(w.escrowPaise, 0);
  assert.equal(w.credits["Mock Bank 1"], l.duesPaise); // bank gets its dues
  assert.equal(w.credits["Borrower"], s.pricePaise - l.duesPaise); // surplus to the borrower
  assert.equal(
    code(() => settleListing(w, l.id, 1)),
    "DeskNotListed"
  );
});

test("desk: borrower redeems in the window, bidders refunded; no bids means unsold", () => {
  const w = seedAssets(T0);
  const l = w.listings[0];
  bid(w, l.id, "Mock Bank 2", l.reservePaise);
  redeemListing(w, l.id);
  assert.equal(l.status, "REDEEMED");
  assert.equal(w.credits["Mock Bank 2"], l.reservePaise);
  assert.equal(w.credits["Mock Bank 1"], l.duesPaise);
  assert.equal(w.escrowPaise, 0);

  const w2 = seedAssets(T0);
  warp(w2, 36);
  assert.equal(settleListing(w2, w2.listings[0].id, 1).status, "UNSOLD");
  assert.equal(w2.now, T0 + 36 * DAY);
});

test("stepAssets: a refused step leaves the world unchanged", () => {
  const w = seedAssets(T0);
  const before = JSON.stringify(w);
  assert.throws(() => stepAssets(w, (c) => saveSilver(c, 1, 900)));
  assert.equal(JSON.stringify(w), before);
  const { world } = stepAssets(w, (c) => saveSilver(c, 1, 999));
  assert.equal(world.silverMilli, 1000);
  assert.equal(w.silverMilli, 0);
});
