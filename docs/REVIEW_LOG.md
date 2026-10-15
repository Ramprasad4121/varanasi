# Review log: agent permission SDK, MCP server, sandbox

Branch: `hark/agent-permission-sdk`. Scope: everything under `packages/` plus the new `packages` CI job.
Reviewer: self review by the author before opening the PR. Not an external audit. Sandbox and test money only.

Severity is for the code as shipped (sandbox). Where production would change the answer, it says so.

## What was checked

| Area | Result | Evidence |
| --- | --- | --- |
| Signature replay across chains and deployments | Safe. EIP-712 domain binds `chainId` and `verifyingContract`; the mandate also carries `chainId` and must match the domain; mandate id is the domain-bound digest. | `mandate.test.ts` "does not verify under another chain or verifying contract" |
| Signature replay in the same sandbox | Safe. A mandate id registers once (`DuplicateMandate`); a `(principal, nonce)` pair registers once (`NonceUsed`), even with different terms; nonces stay burned after revoke. | `gate.test.ts` replay test; property "replay: ... (principal, nonce) registers at most once" |
| Signature malleability | Safe. Only 65 byte signatures with `v` in {27, 28}, `r` and `s` in range, and low `s` (EIP-2). The id comes from the digest, not the signature, so a mutated signature could not create a second mandate anyway. | `mandate.test.ts` "rejects malleable (high s) and bad v" |
| Tampered mandate fields | Safe. Id must equal the recomputed digest, and the signature must recover to `principal`. Lists must be canonical (lowercase, sorted, unique) so one intent has one encoding. | `mandate.test.ts` tamper and non-canonical tests |
| Payment replay | Safe. A `paymentId` is debited at most once per agent; checked in the gate and again inside `commitSpend`. | property "a paymentId spends at most once" |
| Integer overflow and parsing | Safe. All amounts and caps are `bigint`, bounded to uint256 (times to uint64, matching the contracts). Strings must be base-10 digits (max 78); numbers must be safe integers. `"1e18"`, `"-1"`, `"0x10"`, `1.5`, `2^256` are rejected with `INVALID_AMOUNT`. Sums are exact bigint math. | property "sequential" with caps anywhere in [1, 2^256 - 1]; fuzz "fuzzed payment input never throws and never allows garbage" |
| Cap math | Safe. Allowed iff `amount <= perTxCap` and `spent + amount <= totalCap`; `remaining` is exact. `check` and `spend` agree. `MemoryBackend.commitSpend` re-checks both caps as a second line of defence. | property "sequential: check agrees with spend ..." (mutation tested: breaking the total cap in `evaluate` fails it) |
| Time of check vs time of use | Safe inside the SDK. `gate.spend` re-evaluates and commits inside one FIFO lock; concurrent spends cannot both read the same `spent`. | property "concurrent spends (Promise.all) never overspend" |
| Revoke bypass and revoke race | Safe inside one process. `revoke()` sets a fence synchronously before it first awaits; the gate checks the fence on decide and again right before the debit. After `revoke()` is called no debit starts, even for spends queued before it. A revoked agent cannot get new mandates. | property "revoke race: no debit starts after revoke() is called" (mutation tested: removing the fence fails it) |
| Stored state mutation | Safe. Registered mandates are deep-copied and frozen, so a caller holding the original object cannot change caps after registration. | `gate.test.ts` "stored mandates cannot be mutated" |
| Live ledger page | Binds 127.0.0.1 only, escapes every field, sends a CSP header, read only. | `ledger-view.ts`, integration test |

## Findings

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| R1 | Low (fixed) | `paymentId` was global, so agent A could pre-spend an id agent B planned to use and B's payment would be denied as `DUPLICATE_PAYMENT`. | Fixed: ids are scoped per agent. Test "scopes paymentIds per agent". |
| R2 | High if deployed, Info in sandbox | MCP `create_mandate` signs with the sandbox owner key when no `signedMandate` is passed. Anyone who can call the server (including the agent) can then grant itself a mandate. | By design for the demo, documented in the MCP README and tool text. `VARANASI_SANDBOX_SIGNING=0` turns it off. Needs Ram: default off outside the demo. |
| R3 | Medium if deployed, Info in sandbox | MCP `revoke_agent` and `Varanasi.revoke` have no caller authentication. Revoke only removes authority, so the worst case is a denial of service on an agent's payments. | Open. Production needs an owner-signed revoke message (or the AegisRegistry owner check, which the on-chain path already gets from the contract). |
| R4 | Medium if deployed | Nonce burns, spend totals, payment ids, the revoke fence and the ledger live in one process. Two processes (or a restart) do not share them, so a mandate could be registered and spent in each. | Open. Expected for an in-memory sandbox. Production needs a shared store or an on-chain spend gate (see R8). |
| R5 | Low | `check` is a preview. An integrator who calls `check` then pays without calling `spend` reopens the time-of-check gap. | Documented in SDK and MCP docs and tool descriptions: call `spend` / `record_payment` right before paying. |
| R6 | Low | `spend` debits before money moves. If the payment rail then fails, the cap stays consumed (fails toward spending less, never more). There is no void or refund call yet. | Open: add `voidSpend(paymentId)` with its own ledger entry. |
| R7 | Low | The ledger is hash-chained but not signed or anchored, so whoever controls the process could rebuild a whole new chain. Edits to an exported copy are detected. | Open: anchor the head hash on chain or sign entries. |
| R8 | Info | `OnchainBackend` is a stub: revocation is real (AegisRegistry), but spend limits are enforced off chain because main has no spend-limit contract. `MandateGateHook` on `hark/gate-jobs-erc8183` enforces per-job and total caps on chain with a very similar mandate. | Needs Ram: when that branch merges, align the SDK `SpendMandate` type with `MandateGateHook.Mandate` (or add `payees`/`categories` to the hook) so one signature works in both places. |
| R9 | Info | On-chain revoke applies locally first, then sends the tx. If the tx fails the agent stays revoked locally (fail safe) and the error surfaces. Agents not live in AegisRegistry are treated as revoked. | As intended. |
| R10 | Info | Only EOA owners (ECDSA). Smart account owners (ERC-1271) cannot sign mandates yet. | Open, follow up. |
| R11 | Info | Expiry uses the host clock. A wrong clock shifts the window; on chain it would be `block.timestamp`. | Documented. |
| R12 | Info | When a payment does not pin `mandateId`, the gate uses the first active mandate (registration order) that allows it. | Documented; pass `mandateId` to pin. |
| R13 | Info | `memo` is free text stored in the ledger (max 280 chars). | Docs say never put secrets there. |

## Test counts at review time

`npm test` in `packages/`: 42 tests across 5 files (SDK unit, SDK property and fuzz with fast-check, on-chain stub, MCP stdio integration over every tool, live ledger page). `npm run sandbox` runs the end to end story and fails on any unexpected step. Property tests were also run at `FC_RUNS=300` locally.
