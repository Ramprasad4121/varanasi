# Varanasi agent permission layer: 2 minute demo (M1)

Test money only. tUSDC is a sandbox token on a local chain id (31337). No real funds move, no keys, no network.

PR: https://github.com/Ramprasad4121/varanasi/pull/128 (branch `hark/agent-permission-sdk`). Spec: [SPEC.md](SPEC.md).

## The command

```
cd packages && npm ci && npm run sandbox
```

Node 22 or newer. It builds `@varanasi/sdk` and `@varanasi/mcp-server`, then runs `sandbox/demo.mjs`. It exits non-zero if any step misbehaves. Captured run on Oct 21, 2026 at commit a020d56: exit code 0.

## Script (about 2 minutes)

| Time | Step | What to point at |
| --- | --- | --- |
| 0:00 | Run the command | Banner says test money only. |
| 0:15 | Act 1: mandate signed | Owner signs EIP-712 mandate: 5.00 per payment, 20.00 total, 24 hours, one payee, category `compute`. Signature recovers to the owner and is bound to chain 31337. |
| 0:35 | Act 2: allowed payment | 4.00 to the GPU shop is ALLOWED, remaining drops to 16.00. |
| 0:45 | Act 2: over-cap block | 7.50 is BLOCKED with `OVER_PER_TX_CAP`. |
| 0:50 | Act 2: wrong-payee block | 1.00 to a shop not on the list is BLOCKED with `PAYEE_NOT_ALLOWED`. |
| 0:55 | Act 2: replay block | Same `paymentId` again is BLOCKED with `DUPLICATE_PAYMENT`. |
| 1:05 | Act 3: same gate over MCP | An AI agent (Claude Desktop, Cursor) uses the MCP tools. 3.00 allowed, 9.00 blocked with `OVER_PER_TX_CAP`. |
| 1:20 | Act 4: revoke | Owner revokes the agent over SDK and MCP. |
| 1:25 | Act 4: post-revoke block | Next payment over both SDK and MCP is BLOCKED with `AGENT_REVOKED`. |
| 1:35 | Act 5: ledger intact | Both ledgers list every step, including blocked ones, and say `hash chain intact`. Spent 4.00 of 20.00. |
| 1:50 | Close | Nothing moved outside the owner's limits. Test money only. |

Recording: a 67 second render of this exact output is kept outside the repo (`docs/prototype/demo.mp4` in the project workspace).

## Captured output

```
Varanasi sandbox: agents spend only inside limits their owner signed
SANDBOX: test money only. No real funds move.

Act 1. The owner signs a spend mandate for their agent (EIP-712, SDK)
   owner 0xf39fd6...2266 signed for agent 0x709979...79c8:
     up to 5.00 tUSDC per payment, 20.00 tUSDC in total, for 24 hours
     only to the GPU shop 0x000000...0de1, only for "compute"
     mandate id 0x386af307d510723e0dbd0a5a6ebad46e3f6af992f6a47334dc9557402002219e
     signature recovers to the owner, bound to chain 31337; replay on another chain fails

Act 2. The agent pays through the SDK; the gate checks before money moves
   pay 4.00 tUSDC to GPU shop                   ALLOWED  remaining 16.00 tUSDC
   pay 7.50 tUSDC to GPU shop                   BLOCKED (OVER_PER_TX_CAP)  amount 7500000 is over the per-payment cap 5000000
   pay 1.00 tUSDC to a shop not on the list     BLOCKED (PAYEE_NOT_ALLOWED)  payee is not on the mandate's allowed list
   replay the first payment (same paymentId)    BLOCKED (DUPLICATE_PAYMENT)  payment sdk-1 was already recorded

Act 3. An AI agent does the same through the MCP server (Claude Desktop, Cursor)
   connected over stdio; tools: sandbox_info, create_mandate, check_payment, record_payment, revoke_agent, get_ledger, list_mandates
   create_mandate  -> signed by owner 0xf39fd6...2266, id 0x7e3810...52b4
   check_payment  3.00 tUSDC                    ALLOWED  remaining 17.00 tUSDC
   record_payment 3.00 tUSDC                    ALLOWED  remaining 17.00 tUSDC
   record_payment 9.00 tUSDC                    BLOCKED (OVER_PER_TX_CAP)  amount 9000000 is over the per-payment cap 5000000

Act 4. The owner revokes the agent; it takes effect immediately
   SDK revoke(0x709979...79c8)   -> revoked
   MCP revoke_agent(0x709979...79c8) -> revoked
   SDK: pay 1.00 tUSDC after revoke             BLOCKED (AGENT_REVOKED)  the owner revoked this agent
   MCP: pay 1.00 tUSDC after revoke             BLOCKED (AGENT_REVOKED)  the owner revoked this agent

Act 5. The ledger recorded every step (append-only, hash-chained)
   SDK ledger  hash chain intact
    0 mandate   20.00 tUSDC  total cap 0x4e09a990a2...
    1 paid       4.00 tUSDC   0x103f16b27a...
    2 blocked    7.50 tUSDC  OVER_PER_TX_CAP 0x00dd6d8756...
    3 blocked    1.00 tUSDC  PAYEE_NOT_ALLOWED 0x1106382f4f...
    4 blocked    4.00 tUSDC  DUPLICATE_PAYMENT 0xd123cfe301...
    5 revoked                 0x85427a7bcd...
    6 blocked    1.00 tUSDC  AGENT_REVOKED 0xda83c6ac8a...
   MCP ledger  hash chain intact
    0 mandate   20.00 tUSDC  total cap 0xcc16fe6720...
    1 checked    3.00 tUSDC  OK 0x7ded981dd0...
    2 paid       3.00 tUSDC   0xbc161a7a51...
    3 blocked    9.00 tUSDC  OVER_PER_TX_CAP 0x2b4a82fd1c...
    4 revoked                 0x8c087bcf8e...
    5 blocked    1.00 tUSDC  AGENT_REVOKED 0xc93b588e94...

   Spent under the SDK mandate: 4.00 tUSDC of 20.00 tUSDC. Nothing moved outside the owner's limits.

Demo complete: every step behaved as described.
Sandbox only. Test money. No real funds moved.
```

Build lines from npm are trimmed. Nothing else is edited.

## M1 acceptance

Checked against SPEC.md section 8, using the sandbox run above plus `cd packages && npx vitest run` on the same commit (5 files, 42 tests, all passed).

- [x] 1. Mandate signed; tampered, wrong signer, wrong chain and reused nonce refused. Sandbox Act 1 shows the signature and chain binding. Refusals are covered by tests: "rejects any tampered field", "rejects a signature by someone other than the principal", "does not verify under another chain or verifying contract", "rejects mandate replay: same signed mandate twice, or a reused nonce". The sandbox itself does not print a refusal for each case.
- [x] 2. Payment inside limits allowed and remaining drops by exactly the amount. Act 2: 4.00 allowed, 20.00 to 16.00. Act 3: 3.00 allowed, 20.00 to 17.00.
- [x] 3. Each limit denied with the matching code and nothing debited. Sandbox shows `OVER_PER_TX_CAP` and `PAYEE_NOT_ALLOWED`, and spent stays 4.00. Over total cap, wrong category, wrong token, expired and not yet valid are covered by tests ("denies over the per-payment cap and over the total cap", "enforces payees, categories and token", "enforces the time window"), not shown in the sandbox.
- [x] 4. Repeated `paymentId` denied, debits once. Act 2 `DUPLICATE_PAYMENT`; property test "replay: a paymentId spends at most once".
- [x] 5. Same decisions over MCP as over SDK. Shown for allow, `OVER_PER_TX_CAP` and `AGENT_REVOKED`, plus the MCP integration test "runs the full flow through every tool". Caveat: there is no single test that replays every denial code over both paths and compares them.
- [x] 6. After revoke, next payment denied over SDK and MCP. Act 4, both `AGENT_REVOKED`.
- [x] 7. Ledger holds every step and `verify()` returns -1; editing an entry returns its seq. Act 5 shows both chains intact. Tamper detection is covered by the ledger test (editing seq 2 makes `verifyChain` return 2).
- [x] 8. Concurrent spends never exceed `totalCap`. Property tests "concurrent spends (Promise.all) never overspend" and "fuzzed payment input never throws and never allows garbage".

Result: all 8 checks pass on the real run and test suite. The gaps listed in SPEC.md section 9 (unauthenticated revoke, single process state, no refund, unsigned ledger, EOA only, no real money) are still open and are not part of M1.

## Open decisions for Ram

1. Align the SDK mandate format with `MandateGateHook` so one owner signature works in both places.
2. Turn off MCP sandbox signing by default (`VARANASI_SANDBOX_SIGNING=0`) outside the demo.
