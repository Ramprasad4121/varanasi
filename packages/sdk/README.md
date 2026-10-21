# @varanasi/sdk

The agent permission layer. Owners sign what their agent may spend, the gate checks every payment before money moves, every check and spend lands in an append-only ledger, and any agent can be revoked instantly.

**Sandbox and test money only.**

## Quick start

```ts
import { localSigner, Varanasi } from "@varanasi/sdk";

const v = Varanasi.sandbox(); // in-memory backend, chain 31337 domain
const owner = localSigner(OWNER_TEST_KEY); // sandbox only; real owners sign on their own device

// 1. Owner signs a spend mandate (EIP-712)
const mandate = await v.createMandate(
  {
    agent: AGENT,
    token: TEST_TOKEN,
    perTxCap: 5_000_000n, // 5 tUSDC (6 decimals)
    totalCap: 20_000_000n, // 20 tUSDC
    validUntil: v.now() + 86_400n, // expiry, unix seconds
    payees: [SHOP], // empty = any payee
    categories: ["compute"], // empty = any category
  },
  owner,
);

// 2. Before money moves
const payment = { paymentId: "order-1", agent: AGENT, payee: SHOP, token: TEST_TOKEN, amount: 4_000_000n, category: "compute" };
await v.gate.check(payment); // preview, no debit: { allowed: true, code: "OK", remaining: 16000000n }
await v.gate.spend(payment); // atomic re-check + debit; call this right before paying

// 3. Instant revoke
await v.revoke(AGENT);
await v.gate.spend({ ...payment, paymentId: "order-2" }); // { allowed: false, code: "AGENT_REVOKED" }

// 4. Ledger
v.ledger.entries(); // every mandate, check, spend, denial, revoke
v.ledger.verify(); // -1 when the hash chain is intact
```

Runnable version: [`examples/quickstart.ts`](examples/quickstart.ts).

## Concepts

**Spend mandate.** Signed by the owner (principal) with EIP-712:

```
SpendMandate(address principal,address agent,address token,uint256 perTxCap,uint256 totalCap,
             uint64 validFrom,uint64 validUntil,address[] payees,string[] categories,uint256 nonce,uint256 chainId)
domain: { name: "Varanasi Agent Permissions", version: "1", chainId, verifyingContract }
```

The mandate id is its EIP-712 digest, so it is bound to one chain and one verifying contract. Field names follow the `MandateGateHook` mandate on the `hark/gate-jobs-erc8183` branch so a future on-chain gate can check the same intent.

**Gate.** `gate.check(payment)` answers allow or deny with a stable `code` and a plain reason. `gate.spend(payment)` re-evaluates and debits inside one lock, so there is no gap between check and use. Rules, in order: amount, agent, mandate revoked, token, time window, payee, category, per-payment cap, total cap. Agent revoked and duplicate `paymentId` are checked first.

Deny codes: `INVALID_PAYMENT`, `INVALID_AMOUNT`, `AGENT_REVOKED`, `NO_MANDATE`, `UNKNOWN_MANDATE`, `MANDATE_REVOKED`, `AGENT_MISMATCH`, `TOKEN_MISMATCH`, `NOT_YET_VALID`, `EXPIRED`, `PAYEE_NOT_ALLOWED`, `CATEGORY_NOT_ALLOWED`, `OVER_PER_TX_CAP`, `OVER_TOTAL_CAP`, `DUPLICATE_PAYMENT`.

**Ledger.** Append-only and hash-chained (`prevHash`, `hash` over a canonical encoding). `verifyChain(entries)` checks an exported copy.

**Revoke.** `revoke(agentId)` sets an in-process fence before it first awaits, so a spend that has not committed yet is denied, then marks every mandate for the agent revoked. A revoked agent cannot get new mandates (use a new agent key). `revokeMandate(id)` revokes one mandate.

**Amounts.** `bigint` token base units, bounded to uint256. Strings must be base-10 digits; numbers must be safe integers. `"1e18"`, `"-1"`, `"0x10"`, `1.5` are rejected.

## Backends

| Backend | State | Revocation |
| --- | --- | --- |
| `MemoryBackend` (default) | in memory | in memory |
| `OnchainBackend` (stub) | mandates, spend totals and ledger in memory (main has no spend-limit contract yet) | read live from `AegisRegistry.isAuthorized` on every check; `revoke` calls `AegisRegistry.revokeAgent(tokenId)` or returns the calldata for the owner to send |

`toTaskEscrowMandate()` and `taskEscrowDigest()` express one allowed payment as the existing `TaskEscrow` mandate under its locked domain (`VaranasiTaskEscrow`, `1`). ABIs: `AEGIS_REGISTRY_ABI`, `TASK_ESCROW_ABI`, `RISK_GUARD_ABI`.

Write your own backend by implementing `PermissionBackend`. The client serializes writes; `commitSpend` must still refuse anything over the caps (second line of defence).

## Limits of this slice

EOA signatures only (no ERC-1271 yet), state is per process, the ledger is not anchored anywhere. See `docs/REVIEW_LOG.md`.
