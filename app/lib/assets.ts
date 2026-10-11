// Test ledger for the new asset screens: silver savings, pledge receipts for unique
// items (car, two wheeler, land papers, jewellery set) and the bank asset desk.
// It follows the same rules as the contracts in contracts/src/assets (BankMetalIssuer,
// PledgeReceipt, PledgeLoan, BankAssetDesk) with the same numbers, and runs in the
// browser in both app modes. TEST money only; nothing here touches a chain yet.
// Amounts: milligrams for metal, paise for rupees, unix seconds for time.

export const DAY = 86_400;

export type ItemKind = "car" | "bike" | "land" | "jewellery";

/** Haircut and loan to value per item kind, in basis points (same as the contracts). */
export const CLASS_RULES: Record<ItemKind, { cls: number; haircutBps: number; ltvBps: number }> = {
  car: { cls: 0, haircutBps: 3000, ltvBps: 6000 },
  bike: { cls: 1, haircutBps: 4000, ltvBps: 5000 },
  land: { cls: 2, haircutBps: 2500, ltvBps: 6000 },
  jewellery: { cls: 3, haircutBps: 1500, ltvBps: 7500 },
};

/** Demo appraisal per item kind, in paise. A real bank appraises each item. */
export const DEMO_APPRAISAL: Record<ItemKind, number> = {
  car: 6_00_000_00,
  bike: 80_000_00,
  land: 12_00_000_00,
  jewellery: 2_50_000_00,
};

export type SilverCert = { no: string; milli: number; purity: number; at: number };

export type Pledge = {
  id: number;
  kind: ItemKind;
  bank: string;
  assetIdHash: string; // hash of the RC / survey number / hallmark id, never the number itself
  appraisedPaise: number;
  appraisedAt: number;
  reappraiseBy: number;
  frozen: boolean;
  status: "HELD" | "IN_LOAN" | "RELEASED";
};

export type ItemLoan = {
  id: number;
  pledgeId: number;
  principalPaise: number;
  openedAt: number;
  dueAt: number;
  status: "ACTIVE" | "REPAID";
};

export type Bid = { bidder: string; paise: number; at: number };

export type Listing = {
  id: number;
  kind: ItemKind;
  title: string;
  bank: string;
  legal: "DEMAND_NOTICE" | "POSSESSION_TAKEN" | "AUCTION_NOTICE";
  reservePaise: number;
  duesPaise: number;
  redemptionEnd: number;
  biddingEnd: number;
  status: "LISTED" | "REDEEMED" | "SOLD" | "UNSOLD";
  bids: Bid[]; // English auction, highest last
  winner?: string;
  pricePaise?: number;
  newAppraisalPaise?: number;
  surplusPaise?: number; // paid back to the borrower after the bank's dues
};

export type AssetWorld = {
  v: 1;
  now: number;
  seq: number;
  silverMilli: number;
  silverPricePaisePerGram: number; // display only, demo
  silverHeldMilli: number; // bank attested silver reserve
  silverCerts: SilverCert[];
  rupeePaise: number; // test money from item loans
  pledges: Pledge[];
  loans: ItemLoan[];
  listings: Listing[];
  approvedBuyers: string[];
  credits: Record<string, number>; // desk money waiting to be withdrawn
  escrowPaise: number;
};

export class AssetError extends Error {}
const fail = (code: string): never => {
  throw new AssetError(code);
};

const BANK = "Mock Bank 1";
export const BORROWER = "Borrower";
export const BUYERS = ["Mock Bank 2", "Approved Dealer A", "Approved Dealer B"];

/** A small, readable fake hash so the screens can show "only a hash is stored". */
export function shortHash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const a = h.toString(16).padStart(8, "0");
  const b = Math.imul(h, 2654435761 >>> 0) >>> 0;
  return "0x" + a + b.toString(16).padStart(8, "0") + "...";
}

export function seedAssets(now: number): AssetWorld {
  const w: AssetWorld = {
    v: 1,
    now,
    seq: 0,
    silverMilli: 0,
    silverPricePaisePerGram: 110_00,
    silverHeldMilli: 0,
    silverCerts: [],
    rupeePaise: 0,
    pledges: [],
    loans: [],
    listings: [],
    approvedBuyers: [...BUYERS],
    credits: {},
    escrowPaise: 0,
  };
  // the bank already holds a car from a defaulted loan; it is on the desk
  listItem(w, "car", "Hatchback car, 2021 (repossessed)", 3_00_000_00, 2_10_000_00);
  return w;
}

// ------------------------------------------------------------------ silver
export const SILVER_MIN_PURITY = 999;

export function saveSilver(w: AssetWorld, grams: number, purity: number): SilverCert {
  const milli = Math.round(grams * 1000);
  if (!(milli > 0)) fail("BAD_AMOUNT");
  if (purity < SILVER_MIN_PURITY || purity > 1000) fail("SILVER_PURITY");
  const cert: SilverCert = { no: `AG-${1000 + ++w.seq}`, milli, purity, at: w.now };
  w.silverCerts.push(cert);
  w.silverMilli += milli;
  w.silverHeldMilli += milli;
  return cert;
}

export function silverValuePaise(w: AssetWorld): number {
  return Math.round((w.silverMilli * w.silverPricePaisePerGram) / 1000);
}

/** Proof of reserve for silver: what the bank holds against what the app issued. */
export function silverBacked(w: AssetWorld): boolean {
  return w.silverMilli <= w.silverHeldMilli;
}

// ------------------------------------------------------------------ pledges
export function pledgeItem(w: AssetWorld, kind: ItemKind): Pledge {
  if (!CLASS_RULES[kind]) fail("BAD_ITEM");
  const id = ++w.seq;
  const p: Pledge = {
    id,
    kind,
    bank: BANK,
    assetIdHash: shortHash(`${kind}-${id}-${w.now}`),
    appraisedPaise: DEMO_APPRAISAL[kind],
    appraisedAt: w.now,
    reappraiseBy: w.now + 365 * DAY,
    frozen: false,
    status: "HELD",
  };
  w.pledges.push(p);
  return p;
}

/** Appraisal minus the haircut; 0 when frozen or past the re-appraisal date. */
export function lendableValue(w: AssetWorld, p: Pledge): number {
  if (p.frozen || w.now > p.reappraiseBy) return 0;
  return Math.floor((p.appraisedPaise * (10_000 - CLASS_RULES[p.kind].haircutBps)) / 10_000);
}

export function maxBorrow(w: AssetWorld, p: Pledge): number {
  return Math.floor((lendableValue(w, p) * CLASS_RULES[p.kind].ltvBps) / 10_000);
}

export function borrow(w: AssetWorld, pledgeId: number, paise: number, days = 90): ItemLoan {
  const p = w.pledges.find((x) => x.id === pledgeId) || fail("NO_SUCH_ITEM");
  if (p.status !== "HELD") fail("ITEM_BUSY");
  if (!(paise > 0)) fail("BAD_AMOUNT");
  if (paise > maxBorrow(w, p)) fail("ITEM_LOAN_TOO_LARGE");
  const dueAt = w.now + days * DAY;
  if (dueAt > p.reappraiseBy) fail("ITEM_LOAN_TOO_LONG");
  p.status = "IN_LOAN";
  const l: ItemLoan = { id: ++w.seq, pledgeId, principalPaise: paise, openedAt: w.now, dueAt, status: "ACTIVE" };
  w.loans.push(l);
  w.rupeePaise += paise;
  return l;
}

export function repay(w: AssetWorld, loanId: number): ItemLoan {
  const l = w.loans.find((x) => x.id === loanId) || fail("NO_SUCH_LOAN");
  if (l.status !== "ACTIVE") fail("LoanNotActive");
  if (w.rupeePaise < l.principalPaise) fail("ERC20InsufficientBalance");
  w.rupeePaise -= l.principalPaise;
  l.status = "REPAID";
  const p = w.pledges.find((x) => x.id === l.pledgeId);
  if (p) p.status = "HELD";
  return l;
}

/** Bank hands the item back and cancels the receipt (only when no loan is open). */
export function releaseItem(w: AssetWorld, pledgeId: number): Pledge {
  const p = w.pledges.find((x) => x.id === pledgeId) || fail("NO_SUCH_ITEM");
  if (p.status !== "HELD") fail("ITEM_BUSY");
  p.status = "RELEASED";
  return p;
}

// ------------------------------------------------------------------ bank asset desk
export function listItem(w: AssetWorld, kind: ItemKind, title: string, reservePaise: number, duesPaise: number): Listing {
  if (!(reservePaise > 0)) fail("BAD_AMOUNT");
  const l: Listing = {
    id: ++w.seq,
    kind,
    title,
    bank: BANK,
    legal: "AUCTION_NOTICE",
    reservePaise,
    duesPaise,
    redemptionEnd: w.now + 30 * DAY,
    biddingEnd: w.now + 35 * DAY,
    status: "LISTED",
    bids: [],
  };
  w.listings.push(l);
  return l;
}

function listed(w: AssetWorld, id: number): Listing {
  const l = w.listings.find((x) => x.id === id) || fail("NO_SUCH_LISTING");
  if (l.status !== "LISTED") fail("DeskNotListed");
  return l;
}

const credit = (w: AssetWorld, who: string, paise: number) => {
  w.credits[who] = (w.credits[who] || 0) + paise;
};

export function minimumBid(l: Listing): number {
  const high = l.bids.length ? l.bids[l.bids.length - 1].paise : 0;
  if (!high) return l.reservePaise;
  return high + Math.max(100, Math.floor(high / 100));
}

export function bid(w: AssetWorld, id: number, bidder: string, paise: number): Bid {
  if (!w.approvedBuyers.includes(bidder)) fail("DeskNotApprovedBuyer");
  const l = listed(w, id);
  if (bidder === l.bank) fail("DeskSellerCannotBid");
  if (w.now > l.biddingEnd) fail("DeskBiddingClosed");
  if (paise < minimumBid(l)) fail("DeskBidTooLow");
  const prev = l.bids[l.bids.length - 1];
  if (prev) {
    w.escrowPaise -= prev.paise;
    credit(w, prev.bidder, prev.paise);
  }
  const b: Bid = { bidder, paise, at: w.now };
  l.bids.push(b);
  w.escrowPaise += paise;
  return b;
}

/** Borrower pays the dues before the window closes: item back, every bid refunded. */
export function redeemListing(w: AssetWorld, id: number): Listing {
  const l = listed(w, id);
  if (w.now > l.redemptionEnd) fail("DeskWindowClosed");
  const high = l.bids[l.bids.length - 1];
  if (high) {
    w.escrowPaise -= high.paise;
    credit(w, high.bidder, high.paise);
  }
  credit(w, l.bank, l.duesPaise);
  l.status = "REDEEMED";
  return l;
}

/** After the window and the auction: highest bid at or above reserve wins. */
export function settleListing(w: AssetWorld, id: number, newAppraisalPaise: number): Listing {
  const l = listed(w, id);
  if (w.now <= l.redemptionEnd) fail("DeskWindowOpen");
  if (w.now <= l.biddingEnd) fail("DeskAuctionRunning");
  const high = l.bids[l.bids.length - 1];
  if (high && high.paise >= l.reservePaise) {
    w.escrowPaise -= high.paise;
    // the bank takes its dues; any surplus goes back to the borrower (RBI 2025 rule)
    const toBank = Math.min(high.paise, l.duesPaise);
    credit(w, l.bank, toBank);
    if (high.paise > toBank) credit(w, BORROWER, high.paise - toBank);
    l.surplusPaise = high.paise - toBank;
    l.status = "SOLD";
    l.winner = high.bidder;
    l.pricePaise = high.paise;
    l.newAppraisalPaise = newAppraisalPaise;
  } else {
    l.status = "UNSOLD";
  }
  return l;
}

export function warp(w: AssetWorld, days: number) {
  w.now += Math.round(days * DAY);
}

/** Escrow check the desk contract enforces: money held equals live bids plus credits. */
export function deskHeldPaise(w: AssetWorld): number {
  return w.escrowPaise + Object.values(w.credits).reduce((a, b) => a + b, 0);
}

/** Runs one step on a copy and keeps it only if it succeeds (like a reverted transaction). */
export function stepAssets<T>(w: AssetWorld, fn: (copy: AssetWorld) => T): { world: AssetWorld; out: T } {
  const copy = JSON.parse(JSON.stringify(w)) as AssetWorld;
  const out = fn(copy);
  return { world: copy, out };
}
