/**
 * @author Ramprasad
 * Quickstart: owner signs a mandate, agent pays inside it, owner revokes.
 * Sandbox, test money only.
 *
 *   cd packages && npm run build -w @varanasi/sdk && node --experimental-strip-types sdk/examples/quickstart.ts
 */
import { type Address, type Hex, localSigner, toJson, Varanasi } from "@varanasi/sdk";

// anvil dev key, TEST ONLY
const OWNER_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // gitleaks:allow public anvil dev key, test only
const AGENT: Address = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const TOKEN: Address = "0x0000000000000000000000000000000000005d01"; // test token, 6 decimals
const SHOP: Address = "0x00000000000000000000000000000000000c0de1";

const v = Varanasi.sandbox();
const owner = localSigner(OWNER_KEY);

// 1. Owner signs: 5 per payment, 20 total, 1 hour, only SHOP, only "compute".
const mandate = await v.createMandate(
  {
    agent: AGENT,
    token: TOKEN,
    perTxCap: 5_000_000n,
    totalCap: 20_000_000n,
    validUntil: v.now() + 3600n,
    payees: [SHOP],
    categories: ["compute"],
  },
  owner,
);
console.log("mandate", mandate.id);

// 2. Agent asks first, then spends (spend re-checks and debits atomically).
const payment = {
  paymentId: "order-1",
  agent: AGENT,
  payee: SHOP,
  token: TOKEN,
  amount: 4_000_000n,
  category: "compute",
};
console.log("check", toJson(await v.gate.check(payment)));
console.log("spend", toJson(await v.gate.spend(payment)));
console.log("over cap", toJson(await v.gate.spend({ ...payment, paymentId: "order-2", amount: 6_000_000n })));

// 3. Owner revokes; the next payment is blocked.
await v.revoke(AGENT);
console.log("after revoke", toJson(await v.gate.spend({ ...payment, paymentId: "order-3", amount: 1n })));

// 4. Every step is in the hash-chained ledger.
console.log("ledger intact:", v.ledger.verify() === -1, "entries:", v.ledger.size());
