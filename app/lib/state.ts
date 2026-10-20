// Everything one person sees in the app, read from the LOCAL chain in one call.
// Same AppState shape as the public demo ledger (lib/sim/engine.ts).
import { type Address, type Hex } from "viem";
import { abi, deployment, publicClient, personFor, MG } from "./server";
import type { AppState, Loan, LoanStatus } from "./types";
import { LOAN } from "./terms";

type R = Record<string, unknown>;
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

export async function stateFor(user: Address): Promise<AppState> {
  const d = deployment();
  const pub = publicClient();
  const rd = (address: Address, abiName: string, functionName: string, args: unknown[] = []) =>
    pub.readContract({ address, abi: abi(abiName), functionName, args }) as Promise<any>;

  const block = await pub.getBlock();
  const now = Number(block.timestamp);

  // ---- gold ----
  const [mg, valuePaise, priceAsOf] = (await rd(d.issuer, "BankGoldIssuer", "myGold", [user])) as bigint[];
  const [pricePaise, priceAt] = (await rd(d.priceFeed, "MockGoldPriceFeed", "pricePaisePerGram")) as bigint[];
  const [ids, reds] = (await rd(d.issuer, "BankGoldIssuer", "redemptionsOf", [user])) as [bigint[], R[]];
  const STATUS = ["NONE", "PENDING", "FULFILLED", "CANCELLED"];
  const redemptions = ids.map((id, i) => ({
    id: Number(id),
    milli: Number(reds[i].amountMilli as bigint),
    requestedAt: Number(reds[i].requestedAt as bigint),
    status: STATUS[Number(reds[i].status)],
    bankId: reds[i].bankId as Hex,
  }));
  const banks = ((await rd(d.issuer, "BankGoldIssuer", "allBankReserves")) as R[]).map((b) => ({
    bankId: b.bankId as Hex,
    name: b.name as string,
    heldMilli: Number(b.goldHeldMilli as bigint),
    owedMilli: Number(b.goldOwedToHoldersMilli as bigint),
    awaitingMilli: Number(b.awaitingReleaseMilli as bigint),
    disputedMilli: Number(b.underDisputeMilli as bigint),
    fullyBacked: b.fullyBacked as boolean,
    paused: b.newDepositsPaused as boolean,
    valuePaise: (b.goldHeldValuePaise as bigint).toString(),
    capMilli: 0,
  }));
  for (const b of banks) {
    b.capMilli = Number((await rd(d.issuer, "BankGoldIssuer", "bankMintCapMilli", [b.bankId])) as bigint);
  }
  const [supplyMilli, attestedMilli, pendingMilli, disputedMilli, fullyBacked] = (await rd(d.issuer, "BankGoldIssuer", "proofOfReserve")) as [
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
  ];

  // bank certificates (one per deposit), from the bank's signed mint events
  const mintEvent = (abi("BankGoldIssuer") as any[]).find((x) => x.type === "event" && x.name === "GoldMinted");
  const logs = await pub.getLogs({ address: d.issuer, event: mintEvent, fromBlock: 0n });
  const certificates = await Promise.all(
    logs.map(async (l: any) => {
      const blk = await pub.getBlock({ blockNumber: l.blockNumber });
      return {
        certificateNo: d.certificates[l.args.certificateId] || String(l.args.certificateId).slice(0, 14),
        milli: Number(l.args.fineMilli),
        purity: Number(l.args.purityPermille),
        mine: String(l.args.user).toLowerCase() === user.toLowerCase(),
        at: Number(blk.timestamp),
        ref: l.transactionHash as Hex,
      };
    })
  );

  const rupeePaise = (await rd(d.rupee, "MockRupee", "balanceOf", [user])) as bigint;

  // ---- chits ----
  const chits = [];
  for (const f of d.funds) {
    const a = f.address;
    const isMember = (await rd(a, "ChitFund", "isMember", [user])) as boolean;
    if (!isMember) continue;
    const [members, contribution, started, cancelled, finalized, round, enrolledCount] = await Promise.all([
      rd(a, "ChitFund", "members"),
      rd(a, "ChitFund", "contribution"),
      rd(a, "ChitFund", "started"),
      rd(a, "ChitFund", "cancelled"),
      rd(a, "ChitFund", "finalized"),
      rd(a, "ChitFund", "round"),
      rd(a, "ChitFund", "enrolledCount"),
    ]);
    const r = Number(round);
    const [payDeadline, graceEnd, revealEnd, commissionBps, maxDiscountBps, lateFeeBps, expectedPot] = await Promise.all([
      rd(a, "ChitFund", "payDeadline"),
      rd(a, "ChitFund", "graceEnd"),
      rd(a, "ChitFund", "revealEnd"),
      rd(a, "ChitFund", "commissionBps"),
      rd(a, "ChitFund", "maxDiscountBps"),
      rd(a, "ChitFund", "lateFeeBps"),
      rd(a, "ChitFund", "expectedPot"),
    ]);
    const me = (await rd(a, "ChitFund", "stateOf", [user])) as any[];
    const [enrolled, escrow, credit, escrowFree, liability, allowance] = await Promise.all([
      rd(a, "ChitFund", "enrolled", [user]),
      rd(a, "ChitFund", "escrow", [user]),
      rd(a, "ChitFund", "credit", [user]),
      rd(a, "ChitFund", "escrowFree", [user]),
      rd(a, "ChitFund", "liability", [user]),
      rd(d.rupee, "MockRupee", "allowance", [user, a]),
    ]);
    const paidNow = r > 0 ? ((await rd(a, "ChitFund", "paid", [BigInt(r), user])) as boolean) : false;
    const commitment = r > 0 ? ((await rd(a, "ChitFund", "commitment", [BigInt(r), user])) as Hex) : ZERO;
    const revealedNow = r > 0 ? ((await rd(a, "ChitFund", "revealed", [BigInt(r), user])) as boolean) : false;

    const memberRows = [];
    for (const m of members as Address[]) {
      const s = (await rd(a, "ChitFund", "stateOf", [m])) as any[];
      const p = personFor(m);
      memberRows.push({
        address: m,
        name: p?.name || m.slice(0, 8),
        nameTe: p?.nameTe || p?.name || m.slice(0, 8),
        isMe: m.toLowerCase() === user.toLowerCase(),
        joined: (await rd(a, "ChitFund", "enrolled", [m])) as boolean,
        paidThisRound: r > 0 ? ((await rd(a, "ChitFund", "paid", [BigInt(r), m])) as boolean) : false,
        won: s[0] as boolean,
        excluded: s[1] as boolean,
        wonRound: Number(s[2]),
      });
    }

    const lastSettled = finalized ? (members as Address[]).length : Math.max(0, r - 1);
    const results = [];
    let myDividendsPaise = 0n;
    for (let k = 1; k <= lastSettled; k++) {
      const res = (await rd(a, "ChitFund", "result", [BigInt(k)])) as R;
      const bids = [];
      for (const m of members as Address[]) {
        const b = (await rd(a, "ChitFund", "revealedBid", [BigInt(k), m])) as bigint;
        if (b > 0n) {
          const p = personFor(m);
          bids.push({ name: p?.name || m.slice(0, 8), nameTe: p?.nameTe || p?.name || "", bidPaise: b.toString() });
        }
      }
      const winner = res.winner as Address;
      const iPaid = (await rd(a, "ChitFund", "paid", [BigInt(k), user])) as boolean;
      if (winner.toLowerCase() !== user.toLowerCase() && iPaid) myDividendsPaise += res.dividendEach as bigint;
      const wp = personFor(winner);
      results.push({
        round: k,
        winner,
        winnerName: wp?.name || winner.slice(0, 8),
        winnerNameTe: wp?.nameTe || wp?.name || "",
        winnerIsMe: winner.toLowerCase() === user.toLowerCase(),
        potPaise: (res.pot as bigint).toString(),
        payoutPaise: (res.payout as bigint).toString(),
        commissionPaise: (res.commission as bigint).toString(),
        dividendEachPaise: (res.dividendEach as bigint).toString(),
        bids: bids.sort((x, y) => Number(BigInt(x.bidPaise) - BigInt(y.bidPaise))),
      });
    }

    let phase = "notStarted";
    if (cancelled) phase = "cancelled";
    else if (finalized) phase = "finished";
    else if (started) {
      if (now < Number(payDeadline)) phase = "pay";
      else if (now < Number(graceEnd)) phase = "late";
      else if (now < Number(revealEnd)) phase = "openBids";
      else phase = "results";
    }
    const pot = expectedPot as bigint;
    const ph = phase as AppState["chits"][number]["phase"];
    const minBid = (pot * (10000n - BigInt(maxDiscountBps)) + 9999n) / 10000n;

    chits.push({
      address: a,
      name: f.name,
      nameTe: f.nameTe,
      foreman: f.foreman,
      contributionPaise: (contribution as bigint).toString(),
      memberCount: (members as Address[]).length,
      enrolledCount: Number(enrolledCount),
      started,
      finalized,
      round: r,
      phase: ph,
      payDeadline: Number(payDeadline),
      graceEnd: Number(graceEnd),
      revealEnd: Number(revealEnd),
      commissionBps: Number(commissionBps),
      maxDiscountBps: Number(maxDiscountBps),
      lateFeeBps: Number(lateFeeBps),
      lateFeePaise: (((contribution as bigint) * BigInt(lateFeeBps)) / 10000n).toString(),
      potPaise: (pot > 0n ? pot : (contribution as bigint) * BigInt((members as Address[]).length)).toString(),
      fullPotPaise: ((contribution as bigint) * BigInt((members as Address[]).length)).toString(),
      minBidPaise: minBid.toString(),
      me: {
        joined: enrolled,
        won: me[0] as boolean,
        excluded: me[1] as boolean,
        wonRound: Number(me[2]),
        paidCount: Number(me[3]),
        defaults: Number(me[4]),
        paidThisRound: paidNow,
        hasSealedBid: commitment !== ZERO,
        bidOpened: revealedNow,
        escrowPaise: (escrow as bigint).toString(),
        prizeHeldPaise: (liability as bigint).toString(),
        canTakePaise: ((credit as bigint) + (escrowFree as bigint)).toString(),
        dividendsTotalPaise: myDividendsPaise.toString(),
        allowanceOk: (allowance as bigint) >= (contribution as bigint) * 2n,
      },
      members: memberRows,
      results,
    });
  }

  // next payment due across chits
  const dues = chits
    .filter((c) => c.started && !c.finalized && !c.me.paidThisRound && !c.me.excluded && (c.phase === "pay" || c.phase === "late"))
    .map((c) => ({
      chit: c.name,
      chitTe: c.nameTe,
      address: c.address,
      amountPaise: (BigInt(c.contributionPaise) + (c.phase === "late" ? BigInt(c.lateFeePaise) : 0n)).toString(),
      dueAt: c.phase === "late" ? c.graceEnd : c.payDeadline,
      late: c.phase === "late",
    }))
    .sort((x, y) => x.dueAt - y.dueAt);

  // ---- gold loans (CollateralVault + LoanAgreement)
  const lockEvent = (abi("GaslessCollateralVault") as any[]).find((x) => x.type === "event" && x.name === "CollateralLocked");
  const lockLogs = await pub.getLogs({ address: d.vault, event: lockEvent, fromBlock: 0n });
  const lockedMilli: Record<string, number> = {};
  for (const l of lockLogs as any[]) lockedMilli[String(l.args.positionId).toLowerCase()] = Number((l.args.amount as bigint) / MG);
  const loanCount = Number((await rd(d.loans, "GaslessLoanAgreement", "loanCount")) as bigint);
  const LOAN_STATUS: LoanStatus[] = ["ASKED", "APPROVED", "ACTIVE", "REPAID", "DEFAULTED", "CANCELLED"];
  const loans: Loan[] = [];
  for (let i = 1; i <= loanCount; i++) {
    const l = (await rd(d.loans, "GaslessLoanAgreement", "loans", [BigInt(i)])) as any[];
    if (String(l[1]).toLowerCase() !== user.toLowerCase()) continue;
    const state = Number(l[13]);
    const fundedAt = Number(l[10]);
    const owed = state === 2 ? ((await rd(d.loans, "GaslessLoanAgreement", "outstanding", [BigInt(i)])) as bigint) : state === 1 ? (l[6] as bigint) : 0n;
    loans.push({
      id: i,
      status: LOAN_STATUS[state],
      goldMilli: lockedMilli[String(l[4]).toLowerCase()] || 0,
      principalPaise: (l[6] as bigint).toString(),
      interestBps: Number(l[7]),
      termSeconds: Number(l[8]),
      createdAt: Number(l[9]),
      fundedAt,
      dueAt: fundedAt ? fundedAt + Number(l[8]) : 0,
      owedNowPaise: owed.toString(),
    });
  }
  // gold locked to the loan contract by this person with no loan request (phone stopped halfway)
  const unusedPledges: { positionId: string; milli: number }[] = [];
  for (const l of lockLogs as any[]) {
    const pos = String(l.args.positionId);
    if (String(l.args.owner).toLowerCase() !== d.loans.toLowerCase()) continue;
    const locker = (await rd(d.vault, "GaslessCollateralVault", "lockedBy", [pos])) as Address;
    if (locker.toLowerCase() !== user.toLowerCase()) continue;
    const inUse = (await rd(d.loans, "GaslessLoanAgreement", "positionInUse", [pos])) as boolean;
    if (!inUse) unusedPledges.push({ positionId: pos, milli: lockedMilli[pos.toLowerCase()] || 0 });
  }
  const pledgedMilli = loans.filter((l) => ["ASKED", "APPROVED", "ACTIVE"].includes(l.status)).reduce((a, l) => a + l.goldMilli, 0);

  const person = personFor(user);
  return {
    mode: "local",
    ledgerId: `local-${d.issuer.slice(2, 10)}-${d.seededAt || 0}`,
    now,
    person: person ? { name: person.name, nameTe: person.nameTe, phone: person.phone } : null,
    gold: {
      milli: Number(mg),
      pledgedMilli,
      valuePaise: (valuePaise as bigint).toString(),
      pricePaisePerGram: (pricePaise as bigint).toString(),
      priceAt: Number(priceAt || priceAsOf),
      redemptions: redemptions as AppState["gold"]["redemptions"],
    },
    reserve: {
      supplyMilli: Number(supplyMilli),
      attestedMilli: Number(attestedMilli),
      pendingMilli: Number(pendingMilli),
      disputedMilli: Number(disputedMilli),
      fullyBacked,
      banks,
      certificates,
      branch: d.bankBranch,
    },
    rupeePaise: rupeePaise.toString(),
    chits,
    dues,
    loans: {
      terms: {
        lender: d.bankName,
        ltvBps: LOAN.ltvBps,
        rateBps: LOAN.rateBps,
        yearlyRatePct: LOAN.yearlyRatePct,
        termSeconds: LOAN.termSeconds,
        minPaise: LOAN.minPaise.toString(),
      },
      list: loans,
      unusedPledges,
    },
  };
}

export type { AppState };
