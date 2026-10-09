// Builds the request a member signs on their phone. Only these actions exist.
import { isAddress, keccak256, maxUint256, toHex, type Address, type Hex } from "viem";
import { addressForPhone, deployment, json, MG } from "@/lib/server";
import { domain, FORWARD_TYPES, prepare, reasonOf, type Call } from "@/lib/relay";

export const dynamic = "force-dynamic";

function callFor(action: string, a: Record<string, string>): Call {
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
    default:
      throw new Error("UNKNOWN_ACTION");
  }
}

export async function POST(req: Request) {
  const { from, action, args } = (await req.json()) as { from: string; action: string; args: Record<string, string> };
  if (!isAddress(from)) return json({ error: "BAD_ADDRESS" }, 400);
  try {
    const call = callFor(action, args || {});
    const message = await prepare(from as Address, call);
    return json({ domain: domain(), types: FORWARD_TYPES, message });
  } catch (e) {
    const m = (e as Error)?.message || "";
    const own = ["NO_SUCH_CHIT", "BAD_AMOUNT", "BAD_PHONE", "UNKNOWN_ACTION"].find((k) => m === k);
    return json({ error: own || reasonOf(e) }, 400);
  }
}
