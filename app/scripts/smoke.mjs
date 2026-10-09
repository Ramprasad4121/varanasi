// End to end smoke test through the app's own API, as the demo user Ravi.
// Every action is signed with Ravi's device key and sent by the relayer, exactly
// like the screens do. Usage: APP=http://127.0.0.1:3100 node scripts/smoke.mjs
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const APP = process.env.APP || "http://127.0.0.1:3100";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const rs = (p) => "Rs " + (Number(p) / 100).toLocaleString("en-IN");
const g = (m) => (m / 1000).toFixed(3) + " g";

async function post(path, body) {
  const r = await fetch(APP + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`${path} ${j.error}`);
  return j;
}

const s = await post("/api/signin", { phone: "98765 43210", code: "123456" });
const account = privateKeyToAccount(s.key);
const state = async () => (await fetch(`${APP}/api/state?addr=${s.address}`)).json();
async function act(action, args) {
  const prep = await post("/api/prepare", { from: s.address, action, args });
  const m = prep.message;
  const signature = await account.signTypedData({
    domain: prep.domain,
    types: prep.types,
    primaryType: "ForwardRequest",
    message: { ...m, value: BigInt(m.value), gas: BigInt(m.gas), nonce: BigInt(m.nonce) },
  });
  return (await post("/api/relay", { message: m, signature })).ref;
}

// ---- sign in and home
let st = await state();
ok(s.name === "Ravi Kumar", `phone sign-in (mock code) -> ${s.name}`);
ok(st.gold.milli === 12450, `home: my gold ${g(st.gold.milli)} worth ${rs(st.gold.valuePaise)}`);
const A = st.chits.find((c) => c.name.startsWith("Ameerpet"));
const B = st.chits.find((c) => c.name.startsWith("Teachers"));
ok(A && A.round === 2 && !A.me.paidThisRound, `home: chit "${A?.name}" month ${A?.round}, not paid yet`);
ok(st.dues.length === 1 && st.dues[0].amountPaise === "200000", `home: next payment ${rs(st.dues[0]?.amountPaise)}`);
ok(A.results[0].winnerName === "Lakshmi" && A.results[0].payoutPaise === "850000", `who won month 1: Lakshmi took ${rs(A.results[0].payoutPaise)} (lowest of ${A.results[0].bids.length} sealed bids)`);
ok(A.results[0].commissionPaise === "50000" && A.results[0].dividendEachPaise === "25000", `why: foreman ${rs(A.results[0].commissionPaise)} (5% cap), dividend ${rs(A.results[0].dividendEachPaise)} each`);
ok(B && !B.me.joined && !B.started, `invitation: "${B?.name}" ${B?.enrolledCount}/${B?.memberCount} joined`);

// ---- chits
await act("chit.allow", { fund: A.address });
await act("chit.pay", { fund: A.address });
st = await state();
ok(st.chits.find((c) => c.address === A.address).me.paidThisRound && st.dues.length === 0, "pay this month: paid, nothing due");

const bid = BigInt(st.chits.find((c) => c.address === A.address).minBidPaise);
const salt = keccak256(toHex("smoke-salt"));
const hash = keccak256(
  encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
    [A.address, 2n, s.address, bid, salt]
  )
);
await act("chit.bid", { fund: A.address, hash });
ok((await state()).chits.find((c) => c.address === A.address).me.hasSealedBid, `sealed bid placed (${rs(bid)}), amount hidden until opening`);
await post("/api/demo", { op: "nextStep", fund: A.address, addr: s.address });
st = await state();
ok(st.chits.find((c) => c.address === A.address).phase === "openBids", "demo step: others paid and bid, bids now opening");
await act("chit.reveal", { fund: A.address, bid: bid.toString(), salt });
await post("/api/demo", { op: "nextStep", fund: A.address, addr: s.address });
await post("/api/demo", { op: "nextStep", fund: A.address, addr: s.address });
st = await state();
const A2 = st.chits.find((c) => c.address === A.address);
const r2 = A2.results.find((r) => r.round === 2);
ok(r2 && r2.winnerIsMe, `month 2 settled: winner ${r2?.winnerName}, took ${rs(r2?.payoutPaise)}, bids ${r2?.bids.map((b) => b.name + " " + rs(b.bidPaise)).join(", ")}`);
ok(A2.round === 3 && A2.me.won, "month 3 open, Ravi marked as winner");
ok(BigInt(A2.me.prizeHeldPaise) === 600000n, `prize kept safe for remaining 3 months: ${rs(A2.me.prizeHeldPaise)}`);
ok(BigInt(A2.me.canTakePaise) > 0n, `my dividend + free prize ready: ${rs(A2.me.canTakePaise)} (dividends so far ${rs(A2.me.dividendsTotalPaise)})`);
const before = BigInt(st.rupeePaise);
await act("chit.withdraw", { fund: A.address });
st = await state();
ok(BigInt(st.rupeePaise) - before === BigInt(A2.me.canTakePaise), `took ${rs(A2.me.canTakePaise)} to bank`);

if (!B.me.allowanceOk) await act("chit.allow", { fund: B.address });
await act("chit.join", { fund: B.address });
st = await state();
ok(st.chits.find((c) => c.address === B.address).started, "joined invitation group: all 4 joined, month 1 started");

// ---- gold
await act("gold.send", { toPhone: "9000000001", grams: "1.5" });
st = await state();
ok(st.gold.milli === 10950, `sent 1.500 g to 90000 00001, left ${g(st.gold.milli)}`);
await act("gold.redeem", { grams: "2", branch: st.reserve.branch });
st = await state();
const red = st.gold.redemptions.at(-1);
ok(red.status === "PENDING" && st.gold.milli === 8950, `redeem 2 g: request #${red.id} ${red.status}`);
ok(st.reserve.banks[0].awaitingMilli === 2000 && st.reserve.fullyBacked, "proof: 2.000 g waiting at bank, still fully backed");
await post("/api/demo", { op: "bankRelease", id: String(red.id) });
st = await state();
ok(st.gold.redemptions.at(-1).status === "FULFILLED", "bank handed over gold: FULFILLED");
const dep = await post("/api/demo", { op: "bankDeposit", addr: s.address, grams: "10", purity: "916" });
st = await state();
ok(st.gold.milli === 8950 + 9160, `bank deposit 10 g of 22 carat -> +${g(dep.milli)} pure, certificate ${dep.certNo}`);
const b = st.reserve.banks[0];
ok(b.fullyBacked && b.heldMilli === b.owedMilli + b.awaitingMilli, `proof page: bank holds ${g(b.heldMilli)}, app issued ${g(b.owedMilli)}, fully backed`);

// ---- error in plain words
try {
  await act("chit.pay", { fund: B.address });
  await act("chit.pay", { fund: B.address });
  ok(false, "paying twice should be refused");
} catch (e) {
  ok(String(e.message).includes("AlreadyPaid"), "paying twice refused before signing (AlreadyPaid)");
}

// ---- zero gas
const bal = await fetch(st.rpc || "http://127.0.0.1:" + (process.env.CHAIN_PORT || "18645"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [s.address, "latest"] }),
})
  .then((r) => r.json())
  .catch(() => ({ result: "unknown" }));
ok(bal.result === "0x0", `Ravi never held or paid network fees (balance ${bal.result})`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
