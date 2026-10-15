# Prototype spec: mandate, gate, ledger, revoke

> We are spiritual beings who came to Earth to experience being human.

Task T2 of the prototype plan (M1, Oct 21, 2026). This describes what the code in PR #128 does today. Where the code does not yet do something, it says so under "Not in this slice". Test money only. No real funds move.

Source of truth is the code in `packages/sdk/src` and `packages/mcp-server/src`. If this file and the code disagree, the code is right and this file has a bug.

## 1. Actors and the one rule

- Owner (principal): the human or smart account that grants authority. Signs mandates. Can revoke.
- Agent: a wallet address that wants to pay. Identified by its address (the same key `AegisRegistry` uses).
- Gate: the check that runs before money moves.
- Ledger: the record of everything the gate saw and did.

The one rule: no payment is made unless `gate.spend` returned `allowed: true` for it first. The gate can only say yes inside a limit the owner signed.

## 2. Mandate

A mandate is what an owner lets one agent spend. It is signed with EIP-712.

```
SpendMandate(address principal,address agent,address token,uint256 perTxCap,uint256 totalCap,
             uint64 validFrom,uint64 validUntil,address[] payees,string[] categories,
             uint256 nonce,uint256 chainId)
domain: { name: "Varanasi Agent Permissions", version: "1", chainId, verifyingContract }
```

| Field | Meaning |
| --- | --- |
| principal | The signer. The recovered signer must equal this address. |
| agent | The only agent that may spend under it. |
| token | The only token it covers. |
| perTxCap | Largest single payment, in token base units. |
| totalCap | Largest sum of all payments under this mandate. |
| validFrom / validUntil | Unix seconds. Valid when `validFrom <= now < validUntil`. |
| payees | Allowed recipients. Empty means any. Max 64. |
| categories | Allowed spend categories. Empty means any. Max 32, each 1 to 64 chars of `a-z 0-9 . _ : -`. |
| nonce | Replay guard. A principal can register a given nonce once. Random 256 bit by default. |
| chainId | Must match the domain chain id. |

The mandate id is its EIP-712 digest, so a signature is bound to one chain and one verifying contract.

Rules enforced when a mandate is created or registered (`validateMandate`, `verifySignedMandate`):

1. Addresses lowercase; payees and categories lowercase, sorted, unique.
2. `principal != agent`.
3. `perTxCap > 0`, `totalCap > 0`, `perTxCap <= totalCap`.
4. `validFrom < validUntil`; `validUntil` must be in the future; lifetime at most 366 days. A mandate never lasts forever.
5. Amounts are `bigint` base units, bounded to uint256. Strings must be base 10 digits. Floats, `1e18`, `-1`, `0x10` are rejected.
6. The id must equal the digest, and the signature must recover to `principal`.
7. A revoked agent cannot register new mandates (use a new agent key). A reused `(principal, nonce)` is refused.

## 3. Gate

Two calls, both serialized by one lock:

- `gate.check(payment)`: read only answer. Logged as `check`. Nothing is debited.
- `gate.spend(payment)`: re-evaluates and debits inside the same lock, so there is no gap between check and use. Call this right before paying. Logged as `spend` or `spend_denied`.

A payment is `{ paymentId, agent, payee, token, amount, category?, mandateId?, memo? }`. `paymentId` is 1 to 128 chars and is recorded once per agent. `memo` is at most 280 chars and goes in the ledger, so it must never hold secrets.

If `mandateId` is set the gate evaluates only that mandate. If not, it tries the agent's active mandates in registration order and returns the first allow, or the first denial reason when none allow.

### Rule order

Checked in this order, so the reason is deterministic:

1. Input is valid, else `INVALID_PAYMENT` or `INVALID_AMOUNT`.
2. `paymentId` not seen before for this agent, else `DUPLICATE_PAYMENT`.
3. Agent not revoked (in process fence, then backend), else `AGENT_REVOKED`.
4. A mandate exists: `NO_MANDATE`, or `UNKNOWN_MANDATE` for a pinned id that is not found.
5. Per mandate: `INVALID_AMOUNT` (zero), `AGENT_MISMATCH`, `MANDATE_REVOKED`, `TOKEN_MISMATCH`, `NOT_YET_VALID`, `EXPIRED`, `PAYEE_NOT_ALLOWED`, `CATEGORY_NOT_ALLOWED` (a mandate with categories refuses a payment that has none), `OVER_PER_TX_CAP`, `OVER_TOTAL_CAP` (`spent + amount > totalCap`).

Allowed returns `{ allowed: true, code: "OK", mandateId, remaining }`. Every denial returns a stable `code` and a plain English `reason` that is safe to show the owner.

### Atomicity and the second line of defence

- `spend` takes the lock, decides, then looks at the revoke fence once more right before the write. A revoke that landed while the backend was being awaited wins.
- `commitSpend` on the backend re-checks revoked, duplicate and total cap and throws if it must refuse. The gate turns that into a denial and nothing is spent. A custom backend must keep this check.

## 4. Ledger

Append only. There is no update and no delete.

Entry kinds: `mandate_created`, `check`, `spend`, `spend_denied`, `agent_revoked`, `mandate_revoked`.

Each entry has `seq`, `kind`, `at`, and when they apply `agent`, `mandateId`, `paymentId`, `payee`, `token`, `amount`, `category`, `code`, `reason`, `memo`, plus `prevHash` and `hash`.

`hash = keccak256(canonical encoding of the entry without hash)`. The canonical encoding uses a fixed key order, bigints as strings, and drops undefined fields. The first entry's `prevHash` is 32 zero bytes. Editing, removing or reordering any entry breaks every hash after it.

`ledger.verify()` returns `-1` when the chain is intact, otherwise the first bad `seq`. `verifyChain(entries)` does the same for an exported copy, so a third party can check a JSON export without trusting the process that made it.

A denied spend is recorded too. The ledger shows what the agent tried, not only what it did.

## 5. Revoke

- `revoke(agent)`: sets an in process fence before its first await, so a spend that has not committed yet is denied. It then marks every mandate for the agent revoked and records one `agent_revoked` entry. Idempotent: a second call reports that the agent was already revoked.
- `revokeMandate(id)`: stops one mandate. The agent's other mandates keep working.
- After revoke, the next `check` or `spend` returns `AGENT_REVOKED` (or `MANDATE_REVOKED` for a single mandate). The agent cannot get a new mandate; the owner must use a new agent key.

With the on chain stub backend, revoke state is read live from `AegisRegistry.isAuthorized` on every check, and `revoke` either calls `AegisRegistry.revokeAgent(tokenId)` or returns the calldata for the owner to send.

## 6. MCP surface

`@varanasi/mcp-server` (stdio) exposes seven tools, so Claude Desktop or Cursor can drive the same gate:

| Tool | What it does |
| --- | --- |
| `sandbox_info` | Owner address, chain id, domain, backend, whether server side signing is on. |
| `create_mandate` | Registers a mandate the owner signed elsewhere (`signedMandate`), or signs one with the sandbox owner key when sandbox signing is on. |
| `check_payment` | Same as `gate.check`. |
| `record_payment` | Same as `gate.spend`. Call it before money moves. |
| `revoke_agent` | Same as `revoke`. |
| `get_ledger` | Read the ledger, with a filter. |
| `list_mandates` | Mandates with spent, remaining, revoked and active status. |

Sandbox signing is on by default and is turned off with `VARANASI_SANDBOX_SIGNING=0`. With it off the server only accepts mandates the owner signed on their own device, so the server never signs for the owner. Recommended default outside the demo: off (open decision 2 in PLAN.md).

## 7. Backends

| Backend | State | Revocation |
| --- | --- | --- |
| `MemoryBackend` (default) | in memory | in memory |
| `OnchainBackend` (stub) | mandates, spend totals and ledger in memory | read live from `AegisRegistry` |

Both implement `PermissionBackend`. The client serializes all writes through one lock.

## 8. Acceptance checks for M1

The prototype is done when all of these hold. Each one is already exercised by `npm run sandbox` or the test suite.

1. Owner signs a mandate; a tampered mandate, a wrong signer, a wrong chain and a reused nonce are all refused.
2. A payment inside the limits is allowed and the remaining total drops by exactly the amount.
3. Over the per-payment cap, over the total cap, wrong payee, wrong category, wrong token, expired and not yet valid are each denied with the matching code, and nothing is debited.
4. A repeated `paymentId` is denied and debits once at most.
5. The same decisions come back over MCP as over the SDK.
6. After `revoke`, the next payment is denied, over the SDK and over MCP.
7. The ledger holds every one of the above and `verify()` returns `-1`; changing any entry makes it return that entry's `seq`.
8. Many concurrent spends against one mandate never exceed `totalCap` (property and fuzz tests).

## 9. Not in this slice

Taken from `docs/REVIEW_LOG.md`:

- Revoke has no caller authentication yet (R3). Anyone who can reach the process can call it. Needed before any shared use: revoke must be signed by the principal.
- State lives in one process (R4). No shared database and no cross process fence.
- No void or refund call (R6). A spend that fails after the gate said yes cannot be given back to the mandate.
- The ledger is hash chained but not signed and not anchored anywhere (R7).
- EOA owners only (R10). No ERC-1271 smart account signatures yet.
- Real money. Test tokens only. Real rails come later through licensed partners.

### Alignment with MandateGateHook

`MandateGateHook` (branch `hark/gate-jobs-erc8183`) signs a different struct: `Mandate(principal, agent, provider, token, perJobCap, totalCap, validFrom, validUntil, salt)`. The SDK mandate has `payees`, `categories`, `nonce` and `chainId` in place of `provider` and `salt`, and uses `perTxCap` where the hook uses `perJobCap`. The shared fields are `principal`, `agent`, `token`, the two caps and the window. So today one owner signature does not work in both places. Closing this is open decision 1 in PLAN.md and needs Ram's yes.

## 10. How to run it

```
cd packages && npm ci && npm run sandbox       # five acts, exits non-zero on any misbehaviour
cd packages && npx vitest run                   # unit, property, fuzz, MCP integration
cd packages && npm run sandbox:live             # live ledger page on 127.0.0.1:8787
```

Node 22 or newer. No keys, no network.
