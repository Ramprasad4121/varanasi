// Public demo ledger test: runs the same story and numbers as the chain smoke test
// (scripts/smoke.mjs) against app/lib/sim/engine.ts, the ledger the public demo keeps
// in the visitor's browser. Every step runs on a copy and is kept only when it
// succeeds, exactly like app/lib/api.ts does. TEST money only.
// Usage (Node 22.18+): node --import ./scripts/ts-hook.mjs scripts/sim-test.mjs
import { keccak256, toHex } from "viem";
import { Sim } from "../lib/sim/engine.ts";

let failures = 0;
let passes = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (cond) passes++;
  else failures++;
};
const rs = (p) => "Rs " + (Number(p) / 100).toLocaleString("en-IN");
const g = (m) => (m / 1000).toFixed(3) + " g";

let world = Sim.seed();
function step(fn) {
  const copy = JSON.parse(JSON.stringify(world));
  const out = fn(new Sim(copy));
  world = copy; // only reached when fn did not throw
  return out;
}
const refused = (fn) => {
  const before = JSON.stringify(world);
  try {
    step(fn);
    return null;
  } catch (e) {
    return { name: e.message, unchanged: JSON.stringify(world) === before };
  }
};

// ---- sign in
const s = step((x) => x.signin("98765 43210", "123456"));
const me = s.address;
const state = () => new Sim(world).state(me);
const act = (action, args) => step((x) => x.act(me, action, args));
const demo = (op, body) => step((x) => x.demo(op, body));
ok(s.name === "Ravi Kumar", `phone sign-in (demo code) -> ${s.name}`);
ok(refused((x) => x.signin("98765 43210", "000000"))?.name === "BAD_CODE", "wrong code refused (BAD_CODE)");
ok(refused((x) => x.signin("12345", "123456"))?.name === "BAD_PHONE", "short phone refused (BAD_PHONE)");
ok(step((x) => x.signin("98765 43210")).sent === true, "asking for a code without one says sent");

// ---- home
let st = state();
ok(st.mode === "public", "ledger says it is the public demo");
ok(st.gold.milli === 12450, `home: my gold ${g(st.gold.milli)}`);
ok(st.gold.valuePaise === "14940000", `home: worth ${rs(st.gold.valuePaise)} at the demo price`);
const A = st.chits.find((c) => c.name.startsWith("Ameerpet"));
const B = st.chits.find((c) => c.name.startsWith("Teachers"));
ok(A && A.round === 2 && !A.me.paidThisRound, `chit "${A?.name}" month ${A?.round}, not paid yet`);
ok(st.dues.length === 1 && st.dues[0].amountPaise === "200000", `next payment ${rs(st.dues[0]?.amountPaise)}`);
ok(A.results[0].winnerName === "Lakshmi" && A.results[0].payoutPaise === "850000", `month 1: Lakshmi took ${rs(A.results[0].payoutPaise)}`);
ok(A.results[0].commissionPaise === "50000" && A.results[0].dividendEachPaise === "25000", "month 1: foreman Rs 500 (5% cap), Rs 250 each");
ok(A.results[0].bids.length === 2, `month 1: ${A.results[0].bids.length} sealed bids shown`);
ok(B && !B.me.joined && !B.started && B.enrolledCount === 3 && B.memberCount === 4, `invitation: "${B?.name}" 3/4 joined`);
ok(st.reserve.fullyBacked && st.reserve.banks.length === 1, "proof: one bank, fully backed");

// ---- chits
act("chit.allow", { fund: A.address });
act("chit.pay", { fund: A.address });
st = state();
ok(st.chits.find((c) => c.address === A.address).me.paidThisRound && st.dues.length === 0, "pay this month: paid, nothing due");
const r = refused((x) => x.act(me, "chit.pay", { fund: A.address }));
ok(r?.name === "AlreadyPaid" && r.unchanged, "paying twice refused, ledger unchanged (AlreadyPaid)");

const bid = BigInt(st.chits.find((c) => c.address === A.address).minBidPaise);
const salt = keccak256(toHex("sim-salt"));
act("chit.bid", { fund: A.address, hash: Sim.bidHash(A.address, 2, me, bid, salt) });
ok(state().chits.find((c) => c.address === A.address).me.hasSealedBid, `sealed bid placed (${rs(bid)})`);
demo("nextStep", { fund: A.address, addr: me });
ok(state().chits.find((c) => c.address === A.address).phase === "openBids", "demo step: others paid and bid, bids now opening");
const badReveal = refused((x) => x.act(me, "chit.reveal", { fund: A.address, bid: String(bid + 100n), salt }));
ok(badReveal && badReveal.unchanged, `opening with the wrong amount refused (${badReveal?.name})`);
act("chit.reveal", { fund: A.address, bid: bid.toString(), salt });
demo("nextStep", { fund: A.address, addr: me });
demo("nextStep", { fund: A.address, addr: me });
st = state();
const A2 = st.chits.find((c) => c.address === A.address);
const r2 = A2.results.find((x) => x.round === 2);
ok(r2 && r2.winnerIsMe && r2.payoutPaise === bid.toString(), `month 2: Ravi won with ${rs(r2?.payoutPaise)}`);
ok(A2.round === 3 && A2.me.won, "month 3 open, Ravi marked as winner");
ok(BigInt(A2.me.prizeHeldPaise) === 600000n, `prize kept safe for 3 months: ${rs(A2.me.prizeHeldPaise)}`);
ok(BigInt(A2.me.canTakePaise) > 0n, `ready to take: ${rs(A2.me.canTakePaise)}`);
const before = BigInt(st.rupeePaise);
act("chit.withdraw", { fund: A.address });
st = state();
ok(BigInt(st.rupeePaise) - before === BigInt(A2.me.canTakePaise), `took ${rs(A2.me.canTakePaise)} to bank`);

act("chit.allow", { fund: B.address });
act("chit.join", { fund: B.address });
st = state();
ok(st.chits.find((c) => c.address === B.address).started, "joined invitation group: all 4 joined, month 1 started");
ok(refused((x) => x.act(me, "chit.join", { fund: B.address })) !== null, "joining twice refused");

// ---- gold
act("gold.send", { toPhone: "9000000001", grams: "1.5" });
st = state();
ok(st.gold.milli === 10950, `sent 1.500 g, left ${g(st.gold.milli)}`);
const tooMuch = refused((x) => x.act(me, "gold.send", { toPhone: "9000000001", grams: "500" }));
ok(tooMuch?.name === "ERC20InsufficientBalance" && tooMuch.unchanged, "sending more than I hold refused, nothing moved");
ok(refused((x) => x.act(me, "gold.send", { toPhone: "123", grams: "1" }))?.name === "BAD_PHONE", "bad phone refused (BAD_PHONE)");
ok(refused((x) => x.act(me, "gold.send", { toPhone: "9000000001", grams: "-1" }))?.name === "BAD_AMOUNT", "negative grams refused (BAD_AMOUNT)");
act("gold.redeem", { grams: "2", branch: st.reserve.branch });
st = state();
const red = st.gold.redemptions.at(-1);
ok(red.status === "PENDING" && st.gold.milli === 8950, `take out 2 g: request #${red.id} ${red.status}`);
ok(st.reserve.banks[0].awaitingMilli === 2000 && st.reserve.fullyBacked, "proof: 2.000 g waiting at bank, still fully backed");
demo("bankRelease", { id: String(red.id) });
ok(state().gold.redemptions.at(-1).status === "FULFILLED", "bank handed over gold: FULFILLED");
const dep = demo("bankDeposit", { addr: me, grams: "10", purity: "916" });
st = state();
ok(st.gold.milli === 8950 + 9160, `bank counter: 10 g of 22 carat -> +${g(dep.milli)} pure`);
const b = st.reserve.banks[0];
ok(b.fullyBacked && b.heldMilli === b.owedMilli + b.awaitingMilli, `proof: bank holds ${g(b.heldMilli)}, app shows ${g(b.owedMilli)}, fully backed`);
ok(
  st.reserve.certificates.some((c) => c.mine && c.milli === 9160),
  "new certificate listed as mine"
);

// ---- gold loan
const goldBefore = st.gold.milli;
const pos1 = keccak256(toHex("sim-pos-1"));
act("loan.allowGold", { grams: "5" });
act("loan.pledge", { pos: pos1, grams: "5" });
act("loan.ask", { pos: pos1, rupees: "40000" });
st = state();
const L1 = st.loans.list.at(-1);
ok(L1.status === "ASKED" && st.gold.pledgedMilli === 5000 && st.gold.milli === goldBefore - 5000, "loan: pledged 5.000 g, asked Rs 40,000");
demo("bankApproveLoan", { id: String(L1.id) });
ok(state().loans.list.find((l) => l.id === L1.id).status === "APPROVED", "loan: bank approved");
const cash = BigInt(state().rupeePaise);
act("loan.draw", { id: String(L1.id) });
st = state();
const L1d = st.loans.list.find((l) => l.id === L1.id);
ok(L1d.status === "ACTIVE" && BigInt(st.rupeePaise) - cash === 4000000n, `loan: took Rs 40,000, owe ${rs(L1d.owedNowPaise)}`);
const owed = BigInt(L1d.owedNowPaise);
const lowCap = refused((x) => x.act(me, "loan.repay", { id: String(L1.id), max: "1" }));
ok(lowCap && lowCap.unchanged, `repay with a ceiling below the balance refused (${lowCap?.name})`);
act("loan.allowRupee", {});
act("loan.repay", { id: String(L1.id), max: ((owed * 101n) / 100n + 100n).toString() });
st = state();
ok(st.loans.list.find((l) => l.id === L1.id).status === "REPAID" && st.gold.milli === goldBefore && st.gold.pledgedMilli === 0, "loan: repaid, 5.000 g back");

const pos2 = keccak256(toHex("sim-pos-2"));
act("loan.pledge", { pos: pos2, grams: "1" });
act("loan.ask", { pos: pos2, rupees: "10000" });
const L2 = state().loans.list.at(-1);
const cap = refused((x) => x.demo("bankApproveLoan", { id: String(L2.id) }));
ok(cap?.name === "LOAN_TOO_LARGE" && cap.unchanged, "loan above 75% of demo value refused (LOAN_TOO_LARGE)");
act("loan.cancel", { id: String(L2.id) });
st = state();
ok(st.loans.list.find((l) => l.id === L2.id).status === "CANCELLED" && st.gold.milli === goldBefore, "loan: cancelled, 1.000 g back");

const pos3 = keccak256(toHex("sim-pos-3"));
act("loan.pledge", { pos: pos3, grams: "2" });
ok(state().loans.unusedPledges.length === 1, "loan: grams locked without a request show as unused pledge");
act("loan.reclaim", { pos: pos3 });
ok(state().loans.unusedPledges.length === 0 && state().gold.milli === goldBefore, "loan: unused pledge taken back");

// default: the demo keeps the whole pledge (documented gap: no surplus return)
const pos4 = keccak256(toHex("sim-pos-4"));
act("loan.pledge", { pos: pos4, grams: "4" });
act("loan.ask", { pos: pos4, rupees: "20000" });
const L4 = state().loans.list.at(-1);
demo("bankApproveLoan", { id: String(L4.id) });
act("loan.draw", { id: String(L4.id) });
demo("loanTermEnds", { id: String(L4.id) });
st = state();
ok(
  st.loans.list.find((l) => l.id === L4.id).status === "DEFAULTED" && st.gold.milli === goldBefore - 4000,
  "loan: 90 days pass unpaid, bank keeps the 4.000 g pledge (demo rule)"
);

// ---- totals never drift (test money only)
const totalGold = Object.values(world.gold).reduce((a, v) => a + v, 0);
ok(totalGold <= world.bank.attested, `all gold in the ledger (${g(totalGold)}) is within what the bank attested (${g(world.bank.attested)})`);
ok(
  Object.values(world.rupee).every((v) => v >= 0),
  "no negative rupee balance anywhere"
);

console.log(failures ? `\n${failures} check(s) failed, ${passes} passed` : `\nall ${passes} checks passed`);
process.exit(failures ? 1 : 0);
