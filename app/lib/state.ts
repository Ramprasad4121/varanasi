// Everything one person sees in the app, read from the local chain in one call.
import { type Address, type Hex } from "viem";
import { abi, deployment, publicClient, personFor, MG } from "./server";

type R = Record<string, unknown>;
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";

export async function stateFor(user: Address) {
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
  }));
  const [supplyMilli, attestedMilli, pendingMilli, disputedMilli, fullyBacked] = (await rd(
    d.issuer,
    "BankGoldIssuer",
    "proofOfReserve"
  )) as [bigint, bigint, bigint, bigint, boolean];

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
    const [payDeadline, graceEnd, revealEnd, commissionBps, maxDiscountBps, lateFeeBps, expectedPot] =
      await Promise.all([
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
      phase,
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

  const person = personFor(user);
  return {
    now,
    person: person ? { name: person.name, nameTe: person.nameTe, phone: person.phone } : null,
    gold: {
      milli: Number(mg),
      valuePaise: (valuePaise as bigint).toString(),
      pricePaisePerGram: (pricePaise as bigint).toString(),
      priceAt: Number(priceAt || priceAsOf),
      redemptions,
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
    gramUnits: MG.toString(),
  };
}

export type AppState = Awaited<ReturnType<typeof stateFor>>;
