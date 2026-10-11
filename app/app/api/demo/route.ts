// DEMO ONLY controls, shown in the app under "Demo controls". They stand in for
// people and places that are not in the room during a pitch: the bank counter,
// the other chit members, a bank top up, and time passing.
import fs from "node:fs";
import path from "node:path";
import { encodeAbiParameters, isAddress, keccak256, maxUint256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { abi, deployment, json, keyForPhone, localOnly, MG, publicClient, refused, RUNTIME_DIR, saveDeployment } from "@/lib/server";
import { maxLoanPaise } from "@/lib/terms";
import { reasonOf, relayAs, sendFrom } from "@/lib/relay";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Bots = Record<string, { bid: string; salt: Hex; round: number }>;
const botsFile = () => path.join(RUNTIME_DIR, "bots.json");
const loadBots = (): Bots => (fs.existsSync(botsFile()) ? JSON.parse(fs.readFileSync(botsFile(), "utf8")) : {});
const saveBots = (b: Bots) => fs.writeFileSync(botsFile(), JSON.stringify(b, null, 2));

async function warpTo(ts: number) {
  const pub = publicClient();
  const now = Number((await pub.getBlock()).timestamp);
  if (ts <= now) return;
  await pub.request({ method: "evm_setNextBlockTimestamp" as any, params: [toHex(ts)] as any });
  await pub.request({ method: "evm_mine" as any, params: [] as any });
}

const rdF = (a: Address, fn: string, args: unknown[] = []) =>
  publicClient().readContract({ address: a, abi: abi("ChitFund"), functionName: fn, args }) as Promise<any>;

async function bankDeposit(user: Address, grams: number, purity: number) {
  const d = deployment();
  const milli = BigInt(Math.round(grams * purity)); // grams of 22k jewellery x fineness = fine milligrams
  if (milli <= 0n) throw new Error("BAD_AMOUNT");
  const n = Object.keys(d.certificates).length + 101;
  const certNo = `MB-AMP-GD-2026-${String(n).padStart(6, "0")}`;
  const certificateId = keccak256(toHex(certNo));
  const pub = publicClient();
  const now = Number((await pub.getBlock()).timestamp);
  const att = {
    bankId: d.bankId,
    user,
    certificateId,
    fineGramsMilli: milli,
    purityPermille: BigInt(purity),
    nonce: BigInt(Date.now()),
    expiry: BigInt(now + 86400),
  };
  const digest = (await pub.readContract({
    address: d.issuer,
    abi: abi("BankGoldIssuer"),
    functionName: "hashAttestation",
    args: [att],
  })) as Hex;
  const sig = await privateKeyToAccount(d.keys.bankSigner).sign({ hash: digest });
  const ref = await sendFrom(d.keys.relayer, { to: d.issuer, abiName: "BankGoldIssuer", functionName: "mint", args: [att, sig] });
  d.certificates[certificateId] = certNo;
  saveDeployment(d);
  return { ref, certNo, milli: Number(milli) };
}

/** Moves a chit to its next step: other members pay and bid, time passes, bids
 *  open, the round settles. The demo user's own actions are never taken for them. */
async function nextStep(fund: Address, user: Address) {
  const d = deployment();
  const pub = publicClient();
  const now = Number((await pub.getBlock()).timestamp);
  const [started, finalized, round, graceEnd, revealEnd, members, contribution, maxDiscountBps] =
    await Promise.all([
      rdF(fund, "started"),
      rdF(fund, "finalized"),
      rdF(fund, "round"),
      rdF(fund, "graceEnd"),
      rdF(fund, "revealEnd"),
      rdF(fund, "members"),
      rdF(fund, "contribution"),
      rdF(fund, "maxDiscountBps"),
    ]);
  if (!started) return { step: "waitingForMembers" };
  if (finalized) return { step: "finished" };
  const r = Number(round);
  const others = d.people.filter(
    (p) => (members as Address[]).some((m) => m.toLowerCase() === p.address.toLowerCase()) && p.address.toLowerCase() !== user.toLowerCase()
  );
  const bots = loadBots();

  if (now < Number(graceEnd)) {
    // others pay; two who have not won place sealed bids
    let bidders = 0;
    for (const p of others) {
      const key = keyForPhone(p.phone);
      const s = (await rdF(fund, "stateOf", [p.address])) as any[];
      if (s[1]) continue; // excluded
      const paid = (await rdF(fund, "paid", [BigInt(r), p.address])) as boolean;
      if (!paid) {
        const allowance = (await publicClient().readContract({
          address: d.rupee,
          abi: abi("MockRupee"),
          functionName: "allowance",
          args: [p.address, fund],
        })) as bigint;
        if (allowance < (contribution as bigint) * 2n) {
          await relayAs(key, { to: d.rupee, abiName: "MockRupee", functionName: "approve", args: [fund, maxUint256] });
        }
        await relayAs(key, { to: fund, abiName: "ChitFund", functionName: "contribute", args: [] });
      }
      const committed = (await rdF(fund, "commitment", [BigInt(r), p.address])) as Hex;
      if (!s[0] && bidders < 2 && /^0x0+$/.test(committed)) {
        const pot = (await rdF(fund, "expectedPot")) as bigint;
        const minBid = (pot * (10000n - BigInt(maxDiscountBps)) + 9999n) / 10000n;
        // bids land between the minimum and 95% of the pot, in Rs 100 steps
        const span = Number((pot * 95n) / 100n - minBid) / 10000;
        const bid = minBid + BigInt(Math.floor(Math.random() * Math.max(1, span))) * 10000n + 10000n;
        const salt = keccak256(toHex(`bot-${p.phone}-${r}-${Date.now()}`));
        const h = keccak256(
          encodeAbiParameters(
            [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
            [fund, BigInt(r), p.address, bid, salt]
          )
        );
        await relayAs(key, { to: fund, abiName: "ChitFund", functionName: "commitBid", args: [h] });
        bots[`${fund}:${r}:${p.address}`] = { bid: bid.toString(), salt, round: r };
        bidders++;
      } else if (/^0x0+$/.test(committed) === false) {
        bidders++;
      }
    }
    saveBots(bots);
    await warpTo(Number(graceEnd));
    return { step: "bidsSealed" };
  }

  if (now < Number(revealEnd)) {
    for (const p of others) {
      const b = bots[`${fund}:${r}:${p.address}`];
      if (!b) continue;
      const opened = (await rdF(fund, "revealed", [BigInt(r), p.address])) as boolean;
      if (opened) continue;
      try {
        await relayAs(keyForPhone(p.phone), {
          to: fund,
          abiName: "ChitFund",
          functionName: "revealBid",
          args: [BigInt(b.bid), b.salt],
        });
      } catch {
        /* a member who cannot win this round simply does not open */
      }
    }
    await warpTo(Number(revealEnd));
    return { step: "bidsOpened" };
  }

  await sendFrom(d.keys.relayer, { to: fund, abiName: "ChitFund", functionName: "settle", args: [] });
  return { step: "settled", round: r };
}

export async function POST(req: Request) {
  const off = localOnly();
  if (off) return off;
  const body = (await req.json()) as Record<string, string>;
  const user = body.addr as Address;
  try {
    const d = deployment();
    switch (body.op) {
      case "bankDeposit": {
        if (!isAddress(user)) return json({ error: "BAD_ADDRESS" }, 400);
        return json(await bankDeposit(user, Number(body.grams || 10), Number(body.purity || 916)));
      }
      case "bankRelease": {
        const ref = await sendFrom(d.keys.bankOps, {
          to: d.issuer,
          abiName: "BankGoldIssuer",
          functionName: "fulfilRedemption",
          args: [BigInt(body.id), keccak256(toHex(`RELEASED-AT-${d.bankBranch}-${body.id}`))],
        });
        return json({ ref });
      }
      case "addMoney": {
        if (!isAddress(user)) return json({ error: "BAD_ADDRESS" }, 400);
        const ref = await sendFrom(d.keys.gov, { to: d.rupee, abiName: "MockRupee", functionName: "mint", args: [user, 10_000_00n] });
        return json({ ref });
      }
      case "bankApproveLoan": {
        // Mock bank underwriting: lend at most 75% of today's demo value of the pledged gold.
        const id = BigInt(body.id);
        const l = (await publicClient().readContract({ address: d.loans, abi: abi("GaslessLoanAgreement"), functionName: "loans", args: [id] })) as any[];
        if (Number(l[13]) !== 0) return refused("LoanFundedAlready");
        const [, , milli] = (await publicClient().readContract({
          address: d.vault,
          abi: abi("GaslessCollateralVault"),
          functionName: "positionOf",
          args: [l[4]],
        })) as [Address, Address, bigint];
        const [pricePaise] = (await publicClient().readContract({ address: d.priceFeed, abi: abi("MockGoldPriceFeed"), functionName: "pricePaisePerGram" })) as bigint[];
        if ((l[6] as bigint) > maxLoanPaise(Number(milli / MG), pricePaise)) return refused("LOAN_TOO_LARGE");
        const ref = await sendFrom(d.keys.lender, { to: d.loans, abiName: "GaslessLoanAgreement", functionName: "fundLoan", args: [id] });
        return json({ ref });
      }
      case "loanTermEnds": {
        // Demo: the 90 days pass without repayment; the bank declares default and keeps the pledged gold.
        const id = BigInt(body.id);
        const l = (await publicClient().readContract({ address: d.loans, abi: abi("GaslessLoanAgreement"), functionName: "loans", args: [id] })) as any[];
        if (Number(l[13]) !== 2) return refused("LoanNotActive");
        await warpTo(Number(l[10]) + Number(l[8]) + 1);
        const ref = await sendFrom(d.keys.lender, { to: d.loans, abiName: "GaslessLoanAgreement", functionName: "declareDefault", args: [id] });
        return json({ ref });
      }
      case "nextStep": {
        if (!isAddress(user)) return json({ error: "BAD_ADDRESS" }, 400);
        return json(await nextStep(body.fund as Address, user));
      }
      default:
        return json({ error: "UNKNOWN_ACTION" }, 400);
    }
  } catch (e) {
    return refused((e as Error)?.message === "BAD_AMOUNT" ? "BAD_AMOUNT" : reasonOf(e));
  }
}
