// What one person sees in the app. Both back ends produce exactly this shape:
// the LOCAL chain (lib/state.ts reads the deployed contracts) and the PUBLIC demo
// ledger (lib/sim/engine.ts, runs in the browser, no chain). Amounts are strings
// of paise (rupees) or numbers of milligrams (gold) so they survive JSON.

export type Mode = "local" | "public";

export type Redemption = {
  id: number;
  milli: number;
  requestedAt: number;
  status: "NONE" | "PENDING" | "FULFILLED" | "CANCELLED";
  bankId: string;
};

export type BankView = {
  bankId: string;
  name: string;
  heldMilli: number;
  owedMilli: number;
  awaitingMilli: number;
  disputedMilli: number;
  fullyBacked: boolean;
  paused: boolean;
  valuePaise: string;
  capMilli: number; // 0 = no limit
};

export type Certificate = { certificateNo: string; milli: number; purity: number; mine: boolean; at: number; ref: string };

export type ChitResult = {
  round: number;
  winner: string;
  winnerName: string;
  winnerNameTe: string;
  winnerIsMe: boolean;
  potPaise: string;
  payoutPaise: string;
  commissionPaise: string;
  dividendEachPaise: string;
  bids: { name: string; nameTe: string; bidPaise: string }[];
};

export type ChitMember = {
  address: string;
  name: string;
  nameTe: string;
  isMe: boolean;
  joined: boolean;
  paidThisRound: boolean;
  won: boolean;
  excluded: boolean;
  wonRound: number;
};

export type Chit = {
  address: string;
  name: string;
  nameTe: string;
  foreman: string;
  contributionPaise: string;
  memberCount: number;
  enrolledCount: number;
  started: boolean;
  finalized: boolean;
  round: number;
  phase: "notStarted" | "cancelled" | "finished" | "pay" | "late" | "openBids" | "results";
  payDeadline: number;
  graceEnd: number;
  revealEnd: number;
  commissionBps: number;
  maxDiscountBps: number;
  lateFeeBps: number;
  lateFeePaise: string;
  potPaise: string;
  fullPotPaise: string;
  minBidPaise: string;
  me: {
    joined: boolean;
    won: boolean;
    excluded: boolean;
    wonRound: number;
    paidCount: number;
    defaults: number;
    paidThisRound: boolean;
    hasSealedBid: boolean;
    bidOpened: boolean;
    escrowPaise: string;
    prizeHeldPaise: string;
    canTakePaise: string;
    dividendsTotalPaise: string;
    allowanceOk: boolean;
  };
  members: ChitMember[];
  results: ChitResult[];
};

export type LoanStatus = "ASKED" | "APPROVED" | "ACTIVE" | "REPAID" | "DEFAULTED" | "CANCELLED";

export type Loan = {
  id: number;
  status: LoanStatus;
  goldMilli: number;
  principalPaise: string;
  interestBps: number;
  termSeconds: number;
  createdAt: number;
  fundedAt: number;
  dueAt: number; // 0 until the bank pays
  owedNowPaise: string; // what clears the loan right now (0 when closed)
};

export type LoanTerms = {
  lender: string;
  ltvBps: number; // most the bank lends, as a share of today's demo gold value
  rateBps: number; // interest for the whole term
  yearlyRatePct: number; // the same, per year, for display
  termSeconds: number;
  minPaise: string;
};

export type AppState = {
  mode: Mode;
  ledgerId: string; // changes when the demo is set up again, so old receipts are not mixed in
  now: number;
  person: { name: string; nameTe: string; phone: string } | null;
  gold: {
    milli: number; // free grams (not pledged)
    pledgedMilli: number; // locked for loans
    valuePaise: string;
    pricePaisePerGram: string;
    priceAt: number;
    redemptions: Redemption[];
  };
  reserve: {
    supplyMilli: number;
    attestedMilli: number;
    pendingMilli: number;
    disputedMilli: number;
    fullyBacked: boolean;
    banks: BankView[];
    certificates: Certificate[];
    branch: string;
  };
  rupeePaise: string;
  chits: Chit[];
  dues: { chit: string; chitTe: string; address: string; amountPaise: string; dueAt: number; late: boolean }[];
  loans: { terms: LoanTerms; list: Loan[]; unusedPledges: { positionId: string; milli: number }[] };
};

export type SignIn = { key: string; address: string; phone: string; name: string; nameTe: string };
