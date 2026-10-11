// Builds the request a member signs on their phone. Only these actions exist.
import { isAddress, keccak256, maxUint256, toHex, type Address, type Hex } from "viem";
import { addressForPhone, deployment, json, localOnly, MG, refused } from "@/lib/server";
import { LOAN } from "@/lib/terms";
import { domain, FORWARD_TYPES, prepare, reasonOf, type Call } from "@/lib/relay";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const isB32 = (x: string) => /^0x[0-9a-fA-F]{64}$/.test(x || "");

function callFor(action: string, a: Record<string, string>, from: Address): Call {
  const d = deployment();
  const fund = (x: string) => {
    const f = d.funds.find((f) => f.address.toLowerCase() === (x || "").toLowerCase());
    if (!f) throw new Error("NO_SUCH_CHIT");
    return f.address;
  };
  const milli = (g: string) => {
    const v = Math.round(Number(g) * 1000);
    if (!Number.isFinite(v) || v <= 0) throw new Error("BAD_AMOUNT");
    return BigInt(v);
  };
  switch (action) {
    case "gold.send": {
      const to = addressForPhone(a.toPhone || "");
      if ((a.toPhone || "").replace(/\D/g, "").length < 10) throw new Error("BAD_PHONE");
      return { to: d.goldToken, abiName: "GoldToken", functionName: "transfer", args: [to, milli(a.grams) * MG] };
    }
    case "gold.redeem":
      return {
        to: d.issuer,
        abiName: "BankGoldIssuer",
        functionName: "requestRedemption",
        args: [d.bankId, milli(a.grams), keccak256(toHex(a.branch || d.bankBranch))],
      };
    case "gold.reclaim":
      return { to: d.issuer, abiName: "BankGoldIssuer", functionName: "reclaimRedemption", args: [BigInt(a.id)] };
    case "chit.allow":
      return { to: d.rupee, abiName: "MockRupee", functionName: "approve", args: [fund(a.fund), maxUint256] };
    case "chit.join":
      return { to: fund(a.fund), abiName: "ChitFund", functionName: "enroll", args: [] };
    case "chit.pay":
      return { to: fund(a.fund), abiName: "ChitFund", functionName: "contribute", args: [] };
    case "chit.bid":
      return { to: fund(a.fund), abiName: "ChitFund", functionName: "commitBid", args: [a.hash as Hex] };
    case "chit.reveal":
      return { to: fund(a.fund), abiName: "ChitFund", functionName: "revealBid", args: [BigInt(a.bid), a.salt as Hex] };
    case "chit.withdraw":
      return { to: fund(a.fund), abiName: "ChitFund", functionName: "withdraw", args: [] };
    // ---- gold loan: pledge grams in the vault, ask the bank, take the money, repay
    case "loan.allowGold":
      return { to: d.goldToken, abiName: "GoldToken", functionName: "approve", args: [d.vault, milli(a.grams) * MG] };
    case "loan.pledge":
      if (!isB32(a.pos)) throw new Error("BAD_AMOUNT");
      return {
        to: d.vault,
        abiName: "GaslessCollateralVault",
        functionName: "lock",
        args: [a.pos as Hex, d.goldToken, d.loans, milli(a.grams) * MG],
      };
    case "loan.ask": {
      if (!isB32(a.pos)) throw new Error("BAD_AMOUNT");
      const paise = Math.round(Number(a.rupees) * 100);
      if (!Number.isFinite(paise) || paise <= 0) throw new Error("BAD_AMOUNT");
      return {
        to: d.loans,
        abiName: "GaslessLoanAgreement",
        functionName: "createLoan",
        args: [d.lender, from, d.rupee, BigInt(paise), BigInt(LOAN.rateBps), BigInt(LOAN.termSeconds), d.goldToken, a.pos as Hex],
      };
    }
    case "loan.cancel":
      return { to: d.loans, abiName: "GaslessLoanAgreement", functionName: "cancelLoan", args: [BigInt(a.id)] };
    case "loan.draw":
      return { to: d.loans, abiName: "GaslessLoanAgreement", functionName: "drawLoan", args: [BigInt(a.id)] };
    case "loan.allowRupee":
      return { to: d.rupee, abiName: "MockRupee", functionName: "approve", args: [d.loans, maxUint256] };
    case "loan.repay":
      return { to: d.loans, abiName: "GaslessLoanAgreement", functionName: "repayAll", args: [BigInt(a.id), BigInt(a.max)] };
    case "loan.reclaim":
      if (!isB32(a.pos)) throw new Error("BAD_AMOUNT");
      return { to: d.loans, abiName: "GaslessLoanAgreement", functionName: "reclaimUnusedPosition", args: [a.pos as Hex] };
    default:
      throw new Error("UNKNOWN_ACTION");
  }
}

export async function POST(req: Request) {
  const off = localOnly(req);
  if (off) return off;
  const { from, action, args } = (await req.json()) as { from: string; action: string; args: Record<string, string> };
  if (!isAddress(from)) return json({ error: "BAD_ADDRESS" }, 400);
  try {
    const call = callFor(action, args || {}, from as Address);
    const message = await prepare(from as Address, call);
    return json({ domain: domain(), types: FORWARD_TYPES, message });
  } catch (e) {
    const m = (e as Error)?.message || "";
    const own = ["NO_SUCH_CHIT", "BAD_AMOUNT", "BAD_PHONE", "UNKNOWN_ACTION"].find((k) => m === k);
    return refused(own || reasonOf(e));
  }
}
