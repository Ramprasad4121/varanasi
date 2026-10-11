// PUBLIC DEMO ledger. No chain, no server state: one small JSON "world" kept in the
// visitor's own browser (localStorage). It follows the same rules as the local
// contracts (BankGoldIssuer, ChitFund in sealed bid auction mode, CollateralVault +
// LoanAgreement) closely enough to show every screen, and it answers with the same
// AppState shape and the same error names. It is a simulation for a public demo:
// TEST money only, nothing here is a real balance, record or transaction. The
// contracts and their tests (contracts/test) are the source of truth.
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppState, Chit, Loan, LoanStatus, SignIn } from "../types";
import { BANK_CAP_MILLI, DEMO_PRICE_PAISE_PER_GRAM, LOAN, maxLoanPaise } from "../terms";

type Addr = string;
type Person = { name: string; nameTe: string; phone: string; address: Addr };
type MemberState = { won: boolean; excluded: boolean; wonRound: number; paidCount: number; defaults: number };
type Result = { winner: Addr; pot: number; payout: number; commission: number; dividendEach: number; dust: number };
type Fund = {
  address: Addr;
  name: string;
  nameTe: string;
  foreman: string;
  members: Addr[];
  contribution: number;
  payWindow: number;
  gracePeriod: number;
  revealWindow: number;
  commissionBps: number;
  maxDiscountBps: number;
  lateFeeBps: number;
  forfeitBps: number;
  enrolled: Record<Addr, boolean>;
  allowance: Record<Addr, boolean>;
  started: boolean;
  finalized: boolean;
  round: number;
  roundStart: number;
  excludedCount: number;
  stateOf: Record<Addr, MemberState>;
  escrow: Record<Addr, number>;
  credit: Record<Addr, number>;
  received: Record<Addr, number>;
  foremanCredit: number;
  roundCollected: number;
  roundExtras: number;
  settlementReserve: number;
  paid: Record<string, boolean>; // `${round}:${addr}`
  commitment: Record<string, string>;
  revealed: Record<string, boolean>;
  revealedBid: Record<string, number>;
  bestBidder: Addr | "";
  bestBid: number;
  bestBidTies: number;
  bidEntropy: string;
  results: Record<number, Result>;
};
type SimLoan = {
  id: number;
  borrower: Addr;
  positionId: string;
  goldMilli: number;
  principal: number;
  interestBps: number;
  termSeconds: number;
  createdAt: number;
  fundedAt: number;
  repaidPrincipal: number;
  repaidInterest: number;
  state: number; // 0 asked, 1 funded, 2 active, 3 repaid, 4 defaulted, 5 cancelled
};
export type World = {
  v: 2;
  id: string;
  offset: number; // seconds added to the real clock by demo "time passes" buttons
  seq: number;
  bank: { id: string; name: string; branch: string; attested: number; liability: number; pending: number; cap: number };
  gold: Record<Addr, number>; // free mg per person; "vault" holds pledged gold
  rupee: Record<Addr, number>; // paise per person (TEST rupees); fund and loan desk balances too
  certificates: { certificateNo: string; milli: number; purity: number; user: Addr; at: number; ref: string }[];
  redemptions: { id: number; holder: Addr; milli: number; requestedAt: number; status: "PENDING" | "FULFILLED" | "CANCELLED" }[];
  people: Person[];
  funds: Fund[];
  positions: Record<string, { owner: Addr; milli: number; inUse: boolean }>;
  loans: SimLoan[];
  bots: Record<string, { bid: number; salt: string }>;
};

const BPS = 10_000;
const VAULT = "vault";
const LENDER = "mock-bank-loan-desk";

class SimError extends Error {}
const fail = (name: string): never => {
  throw new SimError(name);
};

export function keyForPhone(phone: string) {
  return keccak256(toHex("varanasi-local-demo:" + phone));
}
export function normalizePhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}
export function addressForPhone(phone: string): Addr {
  return privateKeyToAccount(keyForPhone(normalizePhone(phone))).address;
}
const lc = (a: string) => a.toLowerCase();
const same = (a: string, b: string) => lc(a) === lc(b);

const PEOPLE0 = [
  { name: "Ravi Kumar", nameTe: "రవి కుమార్", phone: "9876543210" },
  { name: "Lakshmi", nameTe: "లక్ష్మి", phone: "9000000001" },
  { name: "Srinivas", nameTe: "శ్రీనివాస్", phone: "9000000002" },
  { name: "Anitha", nameTe: "అనిత", phone: "9000000003" },
  { name: "Venkatesh", nameTe: "వెంకటేష్", phone: "9000000004" },
];

export class Sim {
  w: World;
  constructor(w: World) {
    this.w = w;
  }

  // ------------------------------------------------------------------ clock + ids
  now() {
    return Math.floor(Date.now() / 1000) + this.w.offset;
  }
  warpTo(ts: number) {
    const n = this.now();
    if (ts > n) this.w.offset += ts - n;
  }
  ref() {
    this.w.seq += 1;
    return keccak256(toHex(`demo-ref-${this.w.seq}-${Date.now()}-${Math.random()}`));
  }
  person(addr: string) {
    return this.w.people.find((p) => same(p.address, addr));
  }
  fund(addr: string) {
    const f = this.w.funds.find((x) => same(x.address, addr || ""));
    if (!f) fail("NO_SUCH_CHIT");
    return f!;
  }

  // ------------------------------------------------------------------ money helpers
  private moveRupee(from: Addr, to: Addr, amt: number) {
    if ((this.w.rupee[from] || 0) < amt) fail("ERC20InsufficientBalance");
    this.w.rupee[from] -= amt;
    this.w.rupee[to] = (this.w.rupee[to] || 0) + amt;
  }
  private moveGold(from: Addr, to: Addr, milli: number) {
    if (!(milli > 0)) fail("BAD_AMOUNT");
    if ((this.w.gold[from] || 0) < milli) fail("ERC20InsufficientBalance");
    this.w.gold[from] -= milli;
    this.w.gold[to] = (this.w.gold[to] || 0) + milli;
  }

  // ------------------------------------------------------------------ gold
  bankDeposit(user: Addr, grams: number, purity: number) {
    const milli = Math.round(grams * purity);
    if (!(milli > 0)) fail("BAD_AMOUNT");
    const b = this.w.bank;
    if (b.cap && b.attested + milli > b.cap) fail("GoldBankCapReached");
    const certNo = `MB-AMP-GD-2026-${String(this.w.certificates.length + 101).padStart(6, "0")}`;
    const ref = this.ref();
    b.attested += milli;
    b.liability += milli;
    this.w.gold[user] = (this.w.gold[user] || 0) + milli;
    this.w.certificates.push({ certificateNo: certNo, milli, purity, user, at: this.now(), ref });
    return { ref, certNo, milli };
  }
  requestRedemption(user: Addr, milli: number) {
    if (!(milli > 0)) fail("BAD_AMOUNT");
    if ((this.w.gold[user] || 0) < milli) fail("ERC20InsufficientBalance");
    this.w.gold[user] -= milli;
    this.w.bank.liability -= milli;
    this.w.bank.pending += milli;
    const id = this.w.redemptions.length + 1;
    this.w.redemptions.push({ id, holder: user, milli, requestedAt: this.now(), status: "PENDING" });
    return id;
  }
  fulfilRedemption(id: number) {
    const r = this.w.redemptions.find((x) => x.id === id);
    if (!r || r.status !== "PENDING") fail("GoldRedemptionNotPending");
    r!.status = "FULFILLED";
    this.w.bank.pending -= r!.milli;
    this.w.bank.attested -= r!.milli;
  }

  // ------------------------------------------------------------------ chit (mirrors ChitFund, auction mode)
  private k(r: number, a: Addr) {
    return `${r}:${lc(a)}`;
  }
  private st(f: Fund, a: Addr) {
    return (f.stateOf[lc(a)] ||= { won: false, excluded: false, wonRound: 0, paidCount: 0, defaults: 0 });
  }
  payDeadline(f: Fund) {
    return f.roundStart + f.payWindow;
  }
  graceEnd(f: Fund) {
    return f.roundStart + f.payWindow + f.gracePeriod;
  }
  revealEnd(f: Fund) {
    return f.roundStart + f.payWindow + f.gracePeriod + f.revealWindow;
  }
  liability(f: Fund, a: Addr) {
    const s = this.st(f, a);
    if (!s.won || f.finalized) return 0;
    return (f.members.length - s.paidCount) * f.contribution;
  }
  escrowFree(f: Fund, a: Addr) {
    const e = f.escrow[lc(a)] || 0;
    const l = this.liability(f, a);
    return e > l ? e - l : 0;
  }
  expectedPot(f: Fund) {
    let c = 0;
    for (const m of f.members) if (f.paid[this.k(f.round, m)] || this.st(f, m).won) c++;
    return c * f.contribution;
  }
  private requireLive(f: Fund) {
    if (!f.started) fail("NotStarted");
    if (f.finalized) fail("FundClosed");
  }
  private activeMember(f: Fund, a: Addr) {
    if (!f.members.some((m) => same(m, a))) fail("NotMember");
    const s = this.st(f, a);
    if (s.excluded) fail("Excluded");
    return s;
  }
  enroll(f: Fund, a: Addr) {
    if (f.started) fail("AlreadyStarted");
    if (!f.members.some((m) => same(m, a))) fail("NotMember");
    if (f.enrolled[lc(a)]) fail("AlreadyEnrolled");
    f.enrolled[lc(a)] = true;
    if (Object.keys(f.enrolled).length === f.members.length) {
      f.started = true;
      f.round = 1;
      f.roundStart = this.now();
    }
  }
  contribute(f: Fund, a: Addr) {
    this.requireLive(f);
    const s = this.activeMember(f, a);
    const r = f.round;
    if (f.paid[this.k(r, a)]) fail("AlreadyPaid");
    const t = this.now();
    if (t >= this.graceEnd(f)) fail("PaymentClosed");
    if (!f.allowance[lc(a)]) fail("ERC20InsufficientAllowance");
    const fee = t >= this.payDeadline(f) ? Math.floor((f.contribution * f.lateFeeBps) / BPS) : 0;
    this.moveRupee(a, f.address, f.contribution + fee);
    f.paid[this.k(r, a)] = true;
    s.paidCount += 1;
    f.roundCollected += f.contribution;
    f.roundExtras += fee;
  }
  commitBid(f: Fund, a: Addr, h: string) {
    this.requireLive(f);
    const s = this.activeMember(f, a);
    if (s.won) fail("NotEligible");
    const r = f.round;
    if (this.now() >= this.graceEnd(f)) fail("CommitClosed");
    if (!/^0x[0-9a-fA-F]{64}$/.test(h || "") || /^0x0+$/.test(h)) fail("BadReveal");
    if (f.commitment[this.k(r, a)]) fail("AlreadyCommitted");
    f.commitment[this.k(r, a)] = lc(h);
  }
  static bidHash(fund: Addr, round: number, member: Addr, bid: bigint, salt: string) {
    return keccak256(
      encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
        [fund as `0x${string}`, BigInt(round), member as `0x${string}`, bid, salt as `0x${string}`]
      )
    );
  }
  revealBid(f: Fund, a: Addr, bid: number, salt: string) {
    this.requireLive(f);
    const r = f.round;
    const t = this.now();
    if (t < this.graceEnd(f) || t >= this.revealEnd(f)) fail("NotRevealWindow");
    if (f.revealed[this.k(r, a)]) fail("AlreadyRevealed");
    const h = f.commitment[this.k(r, a)];
    if (!h || h !== lc(Sim.bidHash(f.address, r, a, BigInt(bid), salt))) fail("BadReveal");
    const s = this.st(f, a);
    if (!f.paid[this.k(r, a)] || s.won || s.excluded) fail("NotEligible");
    const pot = this.expectedPot(f);
    const minBid = Math.ceil((pot * (BPS - f.maxDiscountBps)) / BPS);
    if (bid > pot || bid < minBid) fail("BidOutOfRange");
    if ((f.escrow[lc(a)] || 0) + bid < (f.members.length - s.paidCount) * f.contribution) fail("NotEligible");
    f.revealed[this.k(r, a)] = true;
    f.revealedBid[this.k(r, a)] = bid;
    f.bidEntropy = keccak256(toHex(f.bidEntropy + salt));
    if (!f.bestBidder || bid < f.bestBid) {
      f.bestBidder = a;
      f.bestBid = bid;
      f.bestBidTies = 1;
    } else if (bid === f.bestBid) f.bestBidTies += 1;
  }
  private eligible(f: Fund, r: number, m: Addr) {
    const s = this.st(f, m);
    return !!f.paid[this.k(r, m)] && !s.won && !s.excluded;
  }
  settle(f: Fund) {
    this.requireLive(f);
    const r = f.round;
    if (this.now() < this.revealEnd(f)) fail("RoundOpen");
    // defaults: a winner in arrears pays from the kept pot (plus late fee); a non winner is excluded
    for (const m of f.members) {
      const s = this.st(f, m);
      if (f.paid[this.k(r, m)]) continue;
      if (s.won) {
        const e = f.escrow[lc(m)] || 0;
        const take = Math.min(e, f.contribution);
        f.escrow[lc(m)] = e - take;
        f.paid[this.k(r, m)] = true;
        s.paidCount += 1;
        s.defaults += 1;
        f.roundCollected += take;
        let penalty = Math.floor((f.contribution * f.lateFeeBps) / BPS);
        const free = this.escrowFree(f, m);
        if (penalty > free) penalty = free;
        f.escrow[lc(m)] -= penalty;
        f.roundExtras += penalty;
      } else if (!s.excluded) {
        s.excluded = true;
        s.defaults += 1;
        f.excludedCount += 1;
      }
    }
    // pick winner: lowest revealed bid, ties by lot, no bids = first eligible in order
    let first = "";
    let eligibleCount = 0;
    for (const m of f.members)
      if (this.eligible(f, r, m)) {
        if (!eligibleCount) first = m;
        eligibleCount++;
      }
    let winner = first;
    if (eligibleCount > 1 && f.bestBidder) {
      if (f.bestBidTies <= 1) winner = f.bestBidder;
      else {
        const tied = f.members.filter((m) => f.revealed[this.k(r, m)] && f.revealedBid[this.k(r, m)] === f.bestBid);
        winner = tied[Number(BigInt(keccak256(toHex(f.bidEntropy + f.address + r))) % BigInt(tied.length))];
      }
    }
    const res: Result = { winner: "", pot: f.roundCollected, payout: 0, commission: 0, dividendEach: 0, dust: 0 };
    if (eligibleCount === 0) {
      f.settlementReserve += f.roundCollected + f.roundExtras;
    } else {
      res.winner = winner;
      res.payout = res.pot;
      let pool = f.roundExtras;
      if (f.bestBidder && eligibleCount > 1) {
        const bid = Math.min(f.bestBid, res.pot);
        const discount = res.pot - bid;
        const cap = Math.floor((res.pot * f.commissionBps) / BPS);
        res.commission = Math.min(discount, cap);
        res.payout = bid;
        pool += discount - res.commission;
      }
      // dividends to other payers, dust to winner
      if (pool > 0) {
        const others = f.members.filter((m) => !same(m, winner) && f.paid[this.k(r, m)]);
        if (others.length === 0) {
          f.credit[lc(winner)] = (f.credit[lc(winner)] || 0) + pool;
          f.received[lc(winner)] = (f.received[lc(winner)] || 0) + pool;
          res.dust = pool;
        } else {
          res.dividendEach = Math.floor(pool / others.length);
          res.dust = pool - res.dividendEach * others.length;
          for (const m of others) {
            f.credit[lc(m)] = (f.credit[lc(m)] || 0) + res.dividendEach;
            f.received[lc(m)] = (f.received[lc(m)] || 0) + res.dividendEach;
          }
          if (res.dust) {
            f.credit[lc(winner)] = (f.credit[lc(winner)] || 0) + res.dust;
            f.received[lc(winner)] = (f.received[lc(winner)] || 0) + res.dust;
          }
        }
      }
      const w = this.st(f, winner);
      w.won = true;
      w.wonRound = r;
      f.escrow[lc(winner)] = (f.escrow[lc(winner)] || 0) + res.payout;
      f.received[lc(winner)] = (f.received[lc(winner)] || 0) + res.payout;
      f.foremanCredit += res.commission;
    }
    f.results[r] = res;
    f.roundCollected = 0;
    f.roundExtras = 0;
    f.bestBidder = "";
    f.bestBid = 0;
    f.bestBidTies = 0;
    f.bidEntropy = "";
    if (r === f.members.length) {
      f.finalized = true;
      this.distributeReserve(f);
    } else {
      f.round = r + 1;
      f.roundStart = this.now();
    }
  }
  private distributeReserve(f: Fund) {
    const total = f.settlementReserve;
    if (!total) return;
    f.settlementReserve = 0;
    const claimOf = (m: Addr) => Math.floor((this.st(f, m).paidCount * f.contribution * (BPS - f.forfeitBps)) / BPS);
    let claims = 0;
    for (const m of f.members) if (this.st(f, m).excluded) claims += claimOf(m);
    let paidOut = 0;
    for (const m of f.members) {
      if (!this.st(f, m).excluded) continue;
      const amt = claims <= total ? claimOf(m) : Math.floor((claimOf(m) * total) / claims);
      if (amt) {
        f.credit[lc(m)] = (f.credit[lc(m)] || 0) + amt;
        paidOut += amt;
      }
    }
    let rest = total - paidOut;
    if (!rest) return;
    // make whole anyone who paid in more than they received
    const deficit = (m: Addr) => Math.max(0, this.st(f, m).paidCount * f.contribution - (f.received[lc(m)] || 0));
    let deficits = 0;
    for (const m of f.members) if (!this.st(f, m).excluded) deficits += deficit(m);
    if (deficits) {
      let spent = 0;
      for (const m of f.members) {
        if (this.st(f, m).excluded) continue;
        const d = deficit(m);
        const amt = deficits <= rest ? d : Math.floor((d * rest) / deficits);
        if (amt) {
          f.credit[lc(m)] = (f.credit[lc(m)] || 0) + amt;
          f.received[lc(m)] = (f.received[lc(m)] || 0) + amt;
          spent += amt;
        }
      }
      rest -= spent;
    }
    if (!rest) return;
    const active = f.members.filter((m) => !this.st(f, m).excluded);
    if (!active.length) {
      f.credit[lc(f.members[0])] = (f.credit[lc(f.members[0])] || 0) + rest;
      return;
    }
    const share = Math.floor(rest / active.length);
    for (const m of active) f.credit[lc(m)] = (f.credit[lc(m)] || 0) + share;
    f.credit[lc(active[0])] += rest - share * active.length;
  }
  withdraw(f: Fund, a: Addr) {
    const c = f.credit[lc(a)] || 0;
    const free = this.escrowFree(f, a);
    const amt = c + free;
    if (!amt) fail("NothingToWithdraw");
    f.credit[lc(a)] = 0;
    f.escrow[lc(a)] = (f.escrow[lc(a)] || 0) - free;
    this.moveRupee(f.address, a, amt);
    return amt;
  }

  /** Demo: other members pay and bid, time passes, bids open, the month closes.
   *  Never acts for the signed in person. Same as app/api/demo nextStep. */
  nextStep(f: Fund, user: Addr) {
    if (!f.started) return { step: "waitingForMembers" };
    if (f.finalized) return { step: "finished" };
    const r = f.round;
    const others = this.w.people.filter((p) => f.members.some((m) => same(m, p.address)) && !same(p.address, user));
    const t = this.now();
    if (t < this.graceEnd(f)) {
      let bidders = 0;
      for (const p of others) {
        const s = this.st(f, p.address);
        if (s.excluded) continue;
        if (!f.paid[this.k(r, p.address)]) {
          f.allowance[lc(p.address)] = true;
          if ((this.w.rupee[p.address] || 0) < f.contribution * 2) this.w.rupee[p.address] = (this.w.rupee[p.address] || 0) + 5_000_000;
          this.contribute(f, p.address);
        }
        const committed = !!f.commitment[this.k(r, p.address)];
        if (!s.won && bidders < 2 && !committed) {
          const pot = this.expectedPot(f);
          const minBid = Math.ceil((pot * (BPS - f.maxDiscountBps)) / BPS);
          const span = Math.floor(((pot * 95) / 100 - minBid) / 10000);
          const bid = minBid + Math.floor(Math.random() * Math.max(1, span)) * 10000 + 10000;
          const salt = keccak256(toHex(`bot-${p.phone}-${r}-${Date.now()}-${Math.random()}`));
          this.commitBid(f, p.address, Sim.bidHash(f.address, r, p.address, BigInt(bid), salt));
          this.w.bots[`${lc(f.address)}:${r}:${lc(p.address)}`] = { bid, salt };
          bidders++;
        } else if (committed) bidders++;
      }
      this.warpTo(this.graceEnd(f));
      return { step: "bidsSealed" };
    }
    if (t < this.revealEnd(f)) {
      for (const p of others) {
        const b = this.w.bots[`${lc(f.address)}:${r}:${lc(p.address)}`];
        if (!b || f.revealed[this.k(r, p.address)]) continue;
        try {
          this.revealBid(f, p.address, b.bid, b.salt);
        } catch {
          /* a member who cannot win this round simply does not open */
        }
      }
      this.warpTo(this.revealEnd(f));
      return { step: "bidsOpened" };
    }
    this.settle(f);
    return { step: "settled", round: r };
  }

  // ------------------------------------------------------------------ loans (mirrors CollateralVault + LoanAgreement)
  private interest(l: SimLoan) {
    const elapsed = BigInt(this.now() - (l.fundedAt || l.createdAt));
    const p = BigInt(l.principal);
    const term = BigInt(l.termSeconds);
    if (elapsed >= term) return Number((p * BigInt(l.interestBps)) / 10000n);
    return Number((p * BigInt(l.interestBps) * elapsed) / (10000n * term));
  }
  outstanding(l: SimLoan) {
    const owed = l.principal + this.interest(l);
    const repaid = l.repaidPrincipal + l.repaidInterest;
    return owed > repaid ? owed - repaid : 0;
  }
  private loan(id: number) {
    const l = this.w.loans.find((x) => x.id === id);
    if (!l) fail("LoanNotActive");
    return l!;
  }
  pledge(user: Addr, positionId: string, milli: number) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(positionId || "")) fail("BAD_AMOUNT");
    if (this.w.positions[positionId]) fail("CollateralPositionLocked");
    this.moveGold(user, VAULT, milli);
    this.w.positions[positionId] = { owner: user, milli, inUse: false };
  }
  createLoan(user: Addr, positionId: string, principal: number) {
    const pos = this.w.positions[positionId];
    if (!pos || !pos.milli) fail("LoanZeroAddress");
    if (!same(pos!.owner, user)) fail("LoanNotCollateralOwner");
    if (pos!.inUse) fail("LoanPositionInUse");
    if (!(principal > 0)) fail("BAD_AMOUNT");
    pos!.inUse = true;
    const id = this.w.loans.length + 1;
    this.w.loans.push({
      id,
      borrower: user,
      positionId,
      goldMilli: pos!.milli,
      principal,
      interestBps: LOAN.rateBps,
      termSeconds: LOAN.termSeconds,
      createdAt: this.now(),
      fundedAt: 0,
      repaidPrincipal: 0,
      repaidInterest: 0,
      state: 0,
    });
    return id;
  }
  private releasePosition(positionId: string, to: Addr) {
    const pos = this.w.positions[positionId];
    if (!pos || !pos.milli) fail("CollateralEmpty");
    this.moveGold(VAULT, to, pos!.milli);
    delete this.w.positions[positionId];
  }
  bankApprove(id: number) {
    const l = this.loan(id);
    if (l.state !== 0) fail("LoanFundedAlready");
    if (BigInt(l.principal) > maxLoanPaise(l.goldMilli, DEMO_PRICE_PAISE_PER_GRAM)) fail("LOAN_TOO_LARGE");
    this.moveRupee(LENDER, "loans", l.principal);
    l.state = 1;
    l.fundedAt = this.now();
  }
  cancelLoan(user: Addr, id: number) {
    const l = this.loan(id);
    if (l.state !== 0) fail("LoanFundedAlready");
    if (!same(l.borrower, user)) fail("LoanNotBorrower");
    l.state = 5;
    this.releasePosition(l.positionId, l.borrower);
  }
  drawLoan(user: Addr, id: number) {
    const l = this.loan(id);
    if (l.state !== 1) fail("LoanNotActive");
    if (!same(l.borrower, user)) fail("LoanNotBorrower");
    l.state = 2;
    this.moveRupee("loans", user, l.principal);
  }
  repayAll(user: Addr, id: number, maxAmount: number) {
    const l = this.loan(id);
    if (l.state !== 2) fail("LoanNotActive");
    const amount = this.outstanding(l);
    if (!amount) fail("LoanZeroAmount");
    if (amount > maxAmount) fail("LoanOverpay");
    this.moveRupee(user, "loans", amount);
    const principalShare = l.principal - l.repaidPrincipal;
    l.repaidPrincipal += principalShare;
    l.repaidInterest += amount - principalShare;
    l.state = 3;
    this.releasePosition(l.positionId, l.borrower);
    return amount;
  }
  declareDefault(id: number) {
    const l = this.loan(id);
    if (l.state !== 2) fail("LoanNotActive");
    if (this.now() < l.fundedAt + l.termSeconds) fail("LoanBalanceNotDue");
    if (!this.outstanding(l)) fail("LoanZeroAmount");
    l.state = 4;
    this.releasePosition(l.positionId, LENDER);
  }
  reclaimUnused(user: Addr, positionId: string) {
    const pos = this.w.positions[positionId];
    if (!pos) fail("LoanZeroAmount");
    if (pos!.inUse) fail("LoanPositionInUse");
    if (!same(pos!.owner, user)) fail("LoanNotCollateralOwner");
    this.releasePosition(positionId, user);
  }

  // ------------------------------------------------------------------ the API, same shapes as the local routes
  signin(phone: string, code?: string): SignIn | { sent: true } {
    const p = normalizePhone(phone);
    if (p.length !== 10) fail("BAD_PHONE");
    if (code !== undefined && code !== "123456") fail("BAD_CODE");
    if (code === undefined) return { sent: true };
    const address = addressForPhone(p);
    const person = this.person(address);
    return { key: "", address, phone: p, name: person?.name || "", nameTe: person?.nameTe || "" };
  }

  /** Same actions as /api/prepare + /api/relay. Returns a demo reference. */
  act(from: Addr, action: string, a: Record<string, string>): string {
    const milli = (g: string) => {
      const v = Math.round(Number(g) * 1000);
      if (!Number.isFinite(v) || v <= 0) fail("BAD_AMOUNT");
      return v;
    };
    switch (action) {
      case "gold.send": {
        if ((a.toPhone || "").replace(/\D/g, "").length < 10) fail("BAD_PHONE");
        this.moveGold(from, addressForPhone(a.toPhone), milli(a.grams));
        break;
      }
      case "gold.redeem":
        this.requestRedemption(from, milli(a.grams));
        break;
      case "chit.allow":
        this.fund(a.fund).allowance[lc(from)] = true;
        break;
      case "chit.join":
        this.enroll(this.fund(a.fund), from);
        break;
      case "chit.pay":
        this.contribute(this.fund(a.fund), from);
        break;
      case "chit.bid":
        this.commitBid(this.fund(a.fund), from, a.hash);
        break;
      case "chit.reveal":
        this.revealBid(this.fund(a.fund), from, Number(a.bid), a.salt);
        break;
      case "chit.withdraw":
        this.withdraw(this.fund(a.fund), from);
        break;
      case "loan.allowGold":
      case "loan.allowRupee":
        break; // approvals are implicit in the demo ledger
      case "loan.pledge":
        this.pledge(from, a.pos, milli(a.grams));
        break;
      case "loan.ask": {
        const p = Math.round(Number(a.rupees) * 100);
        if (!Number.isFinite(p) || p <= 0) fail("BAD_AMOUNT");
        this.createLoan(from, a.pos, p);
        break;
      }
      case "loan.cancel":
        this.cancelLoan(from, Number(a.id));
        break;
      case "loan.draw":
        this.drawLoan(from, Number(a.id));
        break;
      case "loan.repay":
        this.repayAll(from, Number(a.id), Number(a.max));
        break;
      case "loan.reclaim":
        this.reclaimUnused(from, a.pos);
        break;
      default:
        fail("UNKNOWN_ACTION");
    }
    return this.ref();
  }

  /** Same operations as /api/demo. */
  demo(op: string, body: Record<string, string>): any {
    switch (op) {
      case "bankDeposit":
        return this.bankDeposit(body.addr, Number(body.grams || 10), Number(body.purity || 916));
      case "bankRelease":
        this.fulfilRedemption(Number(body.id));
        return { ref: this.ref() };
      case "addMoney":
        this.w.rupee[body.addr] = (this.w.rupee[body.addr] || 0) + 1_000_000;
        return { ref: this.ref() };
      case "nextStep":
        return this.nextStep(this.fund(body.fund), body.addr);
      case "bankApproveLoan":
        this.bankApprove(Number(body.id));
        return { ref: this.ref() };
      case "loanTermEnds": {
        const l = this.loan(Number(body.id));
        if (l.state !== 2) fail("LoanNotActive");
        this.warpTo(l.fundedAt + l.termSeconds + 1);
        this.declareDefault(l.id);
        return { ref: this.ref() };
      }
      default:
        fail("UNKNOWN_ACTION");
    }
  }

  state(user: Addr): AppState {
    const w = this.w;
    const now = this.now();
    const price = DEMO_PRICE_PAISE_PER_GRAM;
    const free = w.gold[user] || 0;
    const nm = (a: Addr) => {
      const p = this.person(a);
      return { name: p?.name || a.slice(0, 8), nameTe: p?.nameTe || p?.name || a.slice(0, 8) };
    };
    const myLoans = w.loans.filter((l) => same(l.borrower, user));
    const pledged = myLoans.filter((l) => l.state <= 2).reduce((s, l) => s + l.goldMilli, 0);
    const unused = Object.entries(w.positions)
      .filter(([, p]) => same(p.owner, user) && !p.inUse)
      .map(([positionId, p]) => ({ positionId, milli: p.milli }));
    const statusOf: LoanStatus[] = ["ASKED", "APPROVED", "ACTIVE", "REPAID", "DEFAULTED", "CANCELLED"];
    const loans: Loan[] = myLoans.map((l) => ({
      id: l.id,
      status: statusOf[l.state],
      goldMilli: l.goldMilli,
      principalPaise: String(l.principal),
      interestBps: l.interestBps,
      termSeconds: l.termSeconds,
      createdAt: l.createdAt,
      fundedAt: l.fundedAt,
      dueAt: l.fundedAt ? l.fundedAt + l.termSeconds : 0,
      owedNowPaise: String(l.state === 2 ? this.outstanding(l) : l.state === 1 ? l.principal : 0),
    }));
    const b = w.bank;
    const fullyBacked = b.liability + b.pending <= b.attested;

    const chits: Chit[] = [];
    for (const f of w.funds) {
      if (!f.members.some((m) => same(m, user))) continue;
      const r = f.round;
      const me = this.st(f, user);
      const lastSettled = f.finalized ? f.members.length : Math.max(0, r - 1);
      let myDiv = 0;
      const results = [];
      for (let k = 1; k <= lastSettled; k++) {
        const res = f.results[k];
        if (!res) continue;
        const bids = f.members
          .filter((m) => (f.revealedBid[this.k(k, m)] || 0) > 0)
          .map((m) => ({ ...nm(m), bidPaise: String(f.revealedBid[this.k(k, m)]) }))
          .sort((x, y) => Number(x.bidPaise) - Number(y.bidPaise));
        if (res.winner && !same(res.winner, user) && f.paid[this.k(k, user)]) myDiv += res.dividendEach;
        const wn = res.winner ? nm(res.winner) : { name: "-", nameTe: "-" };
        results.push({
          round: k,
          winner: res.winner,
          winnerName: wn.name,
          winnerNameTe: wn.nameTe,
          winnerIsMe: !!res.winner && same(res.winner, user),
          potPaise: String(res.pot),
          payoutPaise: String(res.payout),
          commissionPaise: String(res.commission),
          dividendEachPaise: String(res.dividendEach),
          bids,
        });
      }
      let phase: Chit["phase"] = "notStarted";
      if (f.finalized) phase = "finished";
      else if (f.started) {
        if (now < this.payDeadline(f)) phase = "pay";
        else if (now < this.graceEnd(f)) phase = "late";
        else if (now < this.revealEnd(f)) phase = "openBids";
        else phase = "results";
      }
      const pot = this.expectedPot(f);
      const fullPot = f.contribution * f.members.length;
      chits.push({
        address: f.address,
        name: f.name,
        nameTe: f.nameTe,
        foreman: f.foreman,
        contributionPaise: String(f.contribution),
        memberCount: f.members.length,
        enrolledCount: Object.keys(f.enrolled).length,
        started: f.started,
        finalized: f.finalized,
        round: r,
        phase,
        payDeadline: f.started ? this.payDeadline(f) : 0,
        graceEnd: f.started ? this.graceEnd(f) : 0,
        revealEnd: f.started ? this.revealEnd(f) : 0,
        commissionBps: f.commissionBps,
        maxDiscountBps: f.maxDiscountBps,
        lateFeeBps: f.lateFeeBps,
        lateFeePaise: String(Math.floor((f.contribution * f.lateFeeBps) / BPS)),
        potPaise: String(pot > 0 ? pot : fullPot),
        fullPotPaise: String(fullPot),
        minBidPaise: String(Math.ceil((pot * (BPS - f.maxDiscountBps)) / BPS)),
        me: {
          joined: !!f.enrolled[lc(user)],
          won: me.won,
          excluded: me.excluded,
          wonRound: me.wonRound,
          paidCount: me.paidCount,
          defaults: me.defaults,
          paidThisRound: r > 0 && !!f.paid[this.k(r, user)],
          hasSealedBid: r > 0 && !!f.commitment[this.k(r, user)],
          bidOpened: r > 0 && !!f.revealed[this.k(r, user)],
          escrowPaise: String(f.escrow[lc(user)] || 0),
          prizeHeldPaise: String(this.liability(f, user)),
          canTakePaise: String((f.credit[lc(user)] || 0) + this.escrowFree(f, user)),
          dividendsTotalPaise: String(myDiv),
          allowanceOk: !!f.allowance[lc(user)],
        },
        members: f.members.map((m) => {
          const s = this.st(f, m);
          return {
            address: m,
            ...nm(m),
            isMe: same(m, user),
            joined: !!f.enrolled[lc(m)],
            paidThisRound: r > 0 && !!f.paid[this.k(r, m)],
            won: s.won,
            excluded: s.excluded,
            wonRound: s.wonRound,
          };
        }),
        results,
      });
    }
    const dues = chits
      .filter((c) => c.started && !c.finalized && !c.me.paidThisRound && !c.me.excluded && (c.phase === "pay" || c.phase === "late"))
      .map((c) => ({
        chit: c.name,
        chitTe: c.nameTe,
        address: c.address,
        amountPaise: String(Number(c.contributionPaise) + (c.phase === "late" ? Number(c.lateFeePaise) : 0)),
        dueAt: c.phase === "late" ? c.graceEnd : c.payDeadline,
        late: c.phase === "late",
      }))
      .sort((x, y) => x.dueAt - y.dueAt);
    const person = this.person(user);
    return {
      mode: "public",
      ledgerId: w.id,
      now,
      person: person ? { name: person.name, nameTe: person.nameTe, phone: person.phone } : null,
      gold: {
        milli: free,
        pledgedMilli: pledged,
        valuePaise: String((BigInt(free) * price) / 1000n),
        pricePaisePerGram: String(price),
        priceAt: now,
        redemptions: w.redemptions
          .filter((r) => same(r.holder, user))
          .map((r) => ({ id: r.id, milli: r.milli, requestedAt: r.requestedAt, status: r.status, bankId: b.id })),
      },
      reserve: {
        supplyMilli: b.liability,
        attestedMilli: b.attested,
        pendingMilli: b.pending,
        disputedMilli: 0,
        fullyBacked,
        banks: [
          {
            bankId: b.id,
            name: b.name,
            heldMilli: b.attested,
            owedMilli: b.liability,
            awaitingMilli: b.pending,
            disputedMilli: 0,
            fullyBacked,
            paused: false,
            valuePaise: String((BigInt(b.attested) * price) / 1000n),
            capMilli: b.cap,
          },
        ],
        certificates: w.certificates.map((c) => ({ ...c, mine: same(c.user, user) })),
        branch: b.branch,
      },
      rupeePaise: String(w.rupee[user] || 0),
      chits,
      dues,
      loans: {
        terms: {
          lender: b.name,
          ltvBps: LOAN.ltvBps,
          rateBps: LOAN.rateBps,
          yearlyRatePct: LOAN.yearlyRatePct,
          termSeconds: LOAN.termSeconds,
          minPaise: String(LOAN.minPaise),
        },
        list: loans,
        unusedPledges: unused,
      },
    };
  }

  // ------------------------------------------------------------------ the same demo story as app/scripts/seed.mjs
  static seed(): World {
    const people: Person[] = PEOPLE0.map((p) => ({ ...p, address: addressForPhone(p.phone) }));
    const P = Object.fromEntries(people.map((p) => [p.name.split(" ")[0].toLowerCase(), p]));
    const w: World = {
      v: 2,
      id: "public-" + Math.random().toString(36).slice(2, 10),
      offset: 0,
      seq: 0,
      bank: { id: keccak256(toHex("MOCK-BANK-HYD-01")), name: "Mock Bank, Ameerpet branch (demo)", branch: "AMEERPET-01", attested: 0, liability: 0, pending: 0, cap: BANK_CAP_MILLI },
      gold: {},
      rupee: { [LENDER]: 1_000_000_000 },
      certificates: [],
      redemptions: [],
      people,
      funds: [],
      positions: {},
      loans: [],
      bots: {},
    };
    const s = new Sim(w);
    const cert = (p: Person, no: string, milli: number, purity: number) => {
      w.bank.attested += milli;
      w.bank.liability += milli;
      w.gold[p.address] = (w.gold[p.address] || 0) + milli;
      w.certificates.push({ certificateNo: no, milli, purity, user: p.address, at: s.now(), ref: s.ref() });
    };
    // the story starts 6 days and 1 hour ago, so month 2 opens about an hour before "now"
    w.offset = -(6 * 86400 + 3600);
    cert(P.ravi, "MB-AMP-GD-2026-000101", 12_450, 995);
    cert(P.lakshmi, "MB-AMP-GD-2026-000102", 20_000, 999);
    cert(P.anitha, "MB-AMP-GD-2026-000103", 7_960, 995);
    for (const p of people) w.rupee[p.address] = 5_000_000;
    const mkFund = (name: string, nameTe: string, members: Person[], contribution: number): Fund => ({
      address: "0x" + keccak256(toHex("demo-fund:" + name)).slice(-40),
      name,
      nameTe,
      foreman: "Sri Sai Chits (demo)",
      members: members.map((m) => m.address),
      contribution,
      payWindow: 3 * 86400,
      gracePeriod: 2 * 86400,
      revealWindow: 86400,
      commissionBps: 500,
      maxDiscountBps: 3000,
      lateFeeBps: 200,
      forfeitBps: 1000,
      enrolled: {},
      allowance: {},
      started: false,
      finalized: false,
      round: 0,
      roundStart: 0,
      excludedCount: 0,
      stateOf: {},
      escrow: {},
      credit: {},
      received: {},
      foremanCredit: 0,
      roundCollected: 0,
      roundExtras: 0,
      settlementReserve: 0,
      paid: {},
      commitment: {},
      revealed: {},
      revealedBid: {},
      bestBidder: "",
      bestBid: 0,
      bestBidTies: 0,
      bidEntropy: "",
      results: {},
    });
    // chit A: 5 members, Rs 2,000 a month; month 1 won by Lakshmi with Rs 8,500
    const A = mkFund("Ameerpet monthly chit", "అమీర్‌పేట్ నెలవారీ చిట్", [P.ravi, P.lakshmi, P.srinivas, P.anitha, P.venkatesh], 200_000);
    w.funds.push(A);
    for (const m of A.members) {
      A.allowance[lc(m)] = true;
      s.enroll(A, m);
    }
    for (const m of A.members) s.contribute(A, m);
    const bids: [Person, number, string][] = [
      [P.lakshmi, 850_000, keccak256(toHex("seed-salt-lakshmi-1"))],
      [P.srinivas, 900_000, keccak256(toHex("seed-salt-srinivas-1"))],
    ];
    for (const [p, bid, salt] of bids) s.commitBid(A, p.address, Sim.bidHash(A.address, 1, p.address, BigInt(bid), salt));
    s.warpTo(s.graceEnd(A));
    for (const [p, bid, salt] of bids) s.revealBid(A, p.address, bid, salt);
    s.warpTo(s.revealEnd(A));
    s.settle(A);
    for (const p of [P.lakshmi, P.srinivas, P.anitha, P.venkatesh]) s.contribute(A, p.address);
    // chit B: 4 members, Rs 1,000 a month; Ravi invited
    const B = mkFund("Teachers savings chit", "ఉపాధ్యాయుల పొదుపు చిట్", [P.ravi, P.anitha, P.venkatesh, P.lakshmi], 100_000);
    w.funds.push(B);
    for (const m of B.members.slice(1)) {
      B.allowance[lc(m)] = true;
      s.enroll(B, m);
    }
    return w;
  }
}

export { SimError };
