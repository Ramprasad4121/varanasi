// Deploy the people app contracts to a LOCAL anvil chain and seed a demo story.
// Usage: RPC=http://127.0.0.1:8545 OUT=../contracts/out RUNTIME=./runtime node scripts/seed.mjs
// Keys are anvil's well-known dev keys. The bank is a MOCK signer. Nothing here
// touches a public network.
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  encodeAbiParameters,
  encodeFunctionData,
  maxUint256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const OUT = process.env.OUT || path.resolve("../contracts/out");
const RUNTIME = process.env.RUNTIME || path.resolve("runtime");
fs.mkdirSync(RUNTIME, { recursive: true });

const K = {
  gov: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  bankSigner: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  relayer: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  bankOps: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  foreman: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  lender: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", // mock bank loan desk
};
const pub = createPublicClient({ chain: foundry, transport: http(RPC), pollingInterval: 50 });
const w = (k) => createWalletClient({ account: privateKeyToAccount(k), chain: foundry, transport: http(RPC), pollingInterval: 50 });
const art = (file, name) => JSON.parse(fs.readFileSync(path.join(OUT, file, name + ".json"), "utf8"));

const A = {
  VaranasiForwarder: art("VaranasiForwarder.sol", "VaranasiForwarder"),
  GoldToken: art("GoldToken.sol", "GoldToken"),
  GoldRegistry: art("GoldRegistry.sol", "GoldRegistry"),
  BankGoldIssuer: art("BankGoldIssuer.sol", "BankGoldIssuer"),
  MockGoldPriceFeed: art("MockGoldPriceFeed.sol", "MockGoldPriceFeed"),
  MockRupee: art("MockRupee.sol", "MockRupee"),
  ChitFund: art("ChitFund.sol", "ChitFund"),
  GaslessCollateralVault: art("GaslessCollateralVault.sol", "GaslessCollateralVault"),
  GaslessLoanAgreement: art("GaslessLoanAgreement.sol", "GaslessLoanAgreement"),
};
fs.writeFileSync(
  path.join(RUNTIME, "abis.json"),
  JSON.stringify(Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.abi])))
);

async function wait(hash) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("tx failed " + hash);
  return r;
}
async function deploy(key, name, args = []) {
  const hash = await w(key).deployContract({ abi: A[name].abi, bytecode: A[name].bytecode.object, args });
  return (await wait(hash)).contractAddress;
}
async function send(key, address, name, functionName, args = []) {
  const hash = await w(key).writeContract({ address, abi: A[name].abi, functionName, args });
  await wait(hash);
  return hash;
}
const read = (address, name, functionName, args = []) =>
  pub.readContract({ address, abi: A[name].abi, functionName, args });

async function now() {
  return Number((await pub.getBlock()).timestamp);
}
async function warpTo(ts) {
  await pub.request({ method: "evm_setNextBlockTimestamp", params: [toHex(ts)] });
  await pub.request({ method: "evm_mine", params: [] });
}

// ---- mock phone directory (same derivation as app/lib/server.ts) ----
const keyForPhone = (p) => keccak256(toHex("varanasi-local-demo:" + p));
const PEOPLE = [
  { name: "Ravi Kumar", nameTe: "రవి కుమార్", phone: "9876543210" },
  { name: "Lakshmi", nameTe: "లక్ష్మి", phone: "9000000001" },
  { name: "Srinivas", nameTe: "శ్రీనివాస్", phone: "9000000002" },
  { name: "Anitha", nameTe: "అనిత", phone: "9000000003" },
  { name: "Venkatesh", nameTe: "వెంకటేష్", phone: "9000000004" },
].map((p) => ({ ...p, key: keyForPhone(p.phone), address: privateKeyToAccount(keyForPhone(p.phone)).address }));
const P = Object.fromEntries(PEOPLE.map((p) => [p.name.split(" ")[0].toLowerCase(), p]));

// ---- gasless relay: member signs, relayer pays ----
let FWD;
async function relay(person, to, name, functionName, args = []) {
  const data = encodeFunctionData({ abi: A[name].abi, functionName, args });
  const nonce = await read(FWD, "VaranasiForwarder", "nonces", [person.address]);
  const deadline = (await now()) + 3600;
  const msg = { from: person.address, to, value: 0n, gas: 600000n, nonce, deadline, data };
  const signature = await privateKeyToAccount(person.key).signTypedData({
    domain: { name: "Varanasi Relayer", version: "1", chainId: 31337, verifyingContract: FWD },
    types: {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "ForwardRequest",
    message: msg,
  });
  // simulate as the member first so a failure shows the real reason
  await pub.call({ account: person.address, to, data });
  return send(K.relayer, FWD, "VaranasiForwarder", "execute", [
    { from: person.address, to, value: 0n, gas: 600000n, deadline, data, signature },
  ]);
}

const RS = (rupees) => BigInt(Math.round(rupees * 100)); // paise

async function main() {
  const gov = privateKeyToAccount(K.gov).address;
  FWD = await deploy(K.gov, "VaranasiForwarder");
  const token = await deploy(K.gov, "GoldToken", [FWD]);
  const registry = await deploy(K.gov, "GoldRegistry");
  const issuer = await deploy(K.gov, "BankGoldIssuer", [gov, token, registry, FWD]);
  const feed = await deploy(K.gov, "MockGoldPriceFeed", [gov, 1_200_000n]); // Rs 12,000.00 a gram, MOCK
  await send(K.gov, issuer, "BankGoldIssuer", "setPriceFeed", [feed]);
  await send(K.gov, token, "GoldToken", "bindIssuer", [issuer]);
  await send(K.gov, registry, "GoldRegistry", "bindIssuer", [issuer]);
  const bankId = keccak256(toHex("MOCK-BANK-HYD-01"));
  const bankName = "Mock Bank, Ameerpet branch (demo)";
  await send(K.gov, issuer, "BankGoldIssuer", "addBank", [
    bankId,
    bankName,
    privateKeyToAccount(K.bankSigner).address,
    privateKeyToAccount(K.bankOps).address,
  ]);
  // per-bank cap: the mock bank may hold at most 1,000 g of gold for the app
  await send(K.gov, issuer, "BankGoldIssuer", "setBankMintCap", [bankId, 1_000_000n]);
  const rupee = await deploy(K.gov, "MockRupee", [gov, FWD]);
  // gold loans: pledge vGOLD in the vault, the mock bank loan desk lends demo rupees
  const vault = await deploy(K.gov, "GaslessCollateralVault", [gov, FWD]);
  const loans = await deploy(K.gov, "GaslessLoanAgreement", [vault, FWD]);
  await send(K.gov, vault, "GaslessCollateralVault", "admitAsset", [token]);
  await send(K.gov, vault, "GaslessCollateralVault", "authorizeResolver", [loans]);
  const lender = privateKeyToAccount(K.lender).address;
  await send(K.gov, rupee, "MockRupee", "mint", [lender, RS(10_000_000)]);
  await send(K.lender, rupee, "MockRupee", "approve", [loans, maxUint256]);
  console.log("deployed: forwarder", FWD, "issuer", issuer, "rupee", rupee, "loans", loans);

  // ---- gold deposits: bank assays and signs, relayer mints ----
  const certificates = {};
  let nonce = 1n;
  async function bankDeposit(person, certNo, fineMilli, purity) {
    const certificateId = keccak256(toHex(certNo));
    certificates[certificateId] = certNo;
    const expiry = BigInt((await now()) + 86400);
    const att = { bankId, user: person.address, certificateId, fineGramsMilli: fineMilli, purityPermille: purity, nonce: nonce++, expiry };
    const digest = await read(issuer, "BankGoldIssuer", "hashAttestation", [att]);
    const sig = await privateKeyToAccount(K.bankSigner).sign({ hash: digest });
    await send(K.relayer, issuer, "BankGoldIssuer", "mint", [att, sig]);
  }
  await bankDeposit(P.ravi, "MB-AMP-GD-2026-000101", 12_450n, 995n);
  await bankDeposit(P.lakshmi, "MB-AMP-GD-2026-000102", 20_000n, 999n);
  await bankDeposit(P.anitha, "MB-AMP-GD-2026-000103", 7_960n, 995n);
  for (const p of PEOPLE) await send(K.gov, rupee, "MockRupee", "mint", [p.address, RS(50_000)]);
  console.log("gold minted: Ravi 12.450 g, Lakshmi 20.000 g, Anitha 7.960 g");

  // ---- chit A: 5 members, Rs 2,000 a month, sealed bid auction ----
  const params = (c) => ({
    token: rupee,
    contribution: c,
    mode: 2,
    payWindow: 3n * 86400n,
    gracePeriod: 2n * 86400n,
    revealWindow: 1n * 86400n,
    commissionBps: 500,
    maxDiscountBps: 3000,
    lateFeeBps: 200,
    forfeitBps: 1000,
    revealBond: 0n,
    randomness: "0x0000000000000000000000000000000000000000",
    vrfTimeout: 0n,
  });
  const membersA = [P.ravi, P.lakshmi, P.srinivas, P.anitha, P.venkatesh];
  const fundA = await deploy(K.foreman, "ChitFund", [params(RS(2000)), membersA.map((p) => p.address), FWD]);
  for (const p of membersA) {
    await relay(p, rupee, "MockRupee", "approve", [fundA, maxUint256]);
    await relay(p, fundA, "ChitFund", "enroll");
  }
  for (const p of membersA) await relay(p, fundA, "ChitFund", "contribute");
  const bids = [
    [P.lakshmi, RS(8500), keccak256(toHex("seed-salt-lakshmi-1"))],
    [P.srinivas, RS(9000), keccak256(toHex("seed-salt-srinivas-1"))],
  ];
  for (const [p, bid, salt] of bids) {
    const h = keccak256(encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [fundA, 1n, p.address, bid, salt]
    ));
    await relay(p, fundA, "ChitFund", "commitBid", [h]);
  }
  await warpTo(Number(await read(fundA, "ChitFund", "graceEnd")));
  for (const [p, bid, salt] of bids) await relay(p, fundA, "ChitFund", "revealBid", [bid, salt]);
  await warpTo(Number(await read(fundA, "ChitFund", "revealEnd")));
  await send(K.relayer, fundA, "ChitFund", "settle");
  // round 2: everyone except Ravi has paid
  for (const p of [P.lakshmi, P.srinivas, P.anitha, P.venkatesh]) await relay(p, fundA, "ChitFund", "contribute");
  console.log("chit A: round 1 won by Lakshmi (bid Rs 8,500); round 2 open, Ravi has not paid yet");

  // ---- chit B: 4 members, Rs 1,000 a month; Ravi is invited and has not joined ----
  const membersB = [P.ravi, P.anitha, P.venkatesh, P.lakshmi];
  const fundB = await deploy(K.foreman, "ChitFund", [params(RS(1000)), membersB.map((p) => p.address), FWD]);
  for (const p of membersB.slice(1)) {
    await relay(p, rupee, "MockRupee", "approve", [fundB, maxUint256]);
    await relay(p, fundB, "ChitFund", "enroll");
  }
  console.log("chit B: 3 of 4 joined, waiting for Ravi");

  for (const p of PEOPLE) {
    const bal = await pub.getBalance({ address: p.address });
    if (bal !== 0n) throw new Error(p.name + " holds gas money; should be 0");
  }
  console.log("every member holds 0 gas money: all their actions went through the relayer");

  const d = {
    rpc: RPC,
    chainId: 31337,
    forwarder: FWD,
    goldToken: token,
    issuer,
    registry,
    priceFeed: feed,
    rupee,
    vault,
    loans,
    lender,
    seededAt: Date.now(),
    bankId,
    bankName,
    bankBranch: "AMEERPET-01",
    certificates,
    funds: [
      { address: fundA, name: "Ameerpet monthly chit", nameTe: "అమీర్‌పేట్ నెలవారీ చిట్", foreman: "Sri Sai Chits (demo)" },
      { address: fundB, name: "Teachers savings chit", nameTe: "ఉపాధ్యాయుల పొదుపు చిట్", foreman: "Sri Sai Chits (demo)" },
    ],
    people: PEOPLE.map(({ key, ...rest }) => rest),
    demoPhone: P.ravi.phone,
    keys: K,
  };
  fs.writeFileSync(path.join(RUNTIME, "deployment.json"), JSON.stringify(d, null, 2));
  fs.writeFileSync(path.join(RUNTIME, "bots.json"), JSON.stringify({}));
  console.log("wrote", path.join(RUNTIME, "deployment.json"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
