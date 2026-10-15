# Prototype first. Plan v1

> We are spiritual beings who came to Earth to experience being human.

Owner: Ram. Set on Oct 14, 2026 in Slack #all-hark-bridge. Restored on Oct 15, 2026 after the workspace copy was lost; the source is the original Slack post plus the Oct 14 standup. Status below is checked against PR #128 (branch `hark/agent-permission-sdk`).

## Goal: M1, Wed Oct 21, 2026

A working end to end prototype on test money, run with one command:

1. The owner signs a spend mandate.
2. The agent asks to pay through the SDK or the MCP server.
3. The gate allows or blocks the payment before money moves.
4. The ledger records it.
5. The owner revokes the agent.
6. The next payment is blocked.

Test money only. No real funds move.

## Week 1 tasks

| # | Task | Owner | Due | Status (against PR #128) |
| --- | --- | --- | --- | --- |
| T1 | PR/FAQ | Hark | Oct 14 | Done. `docs/prototype/PRFAQ.md`, restored into PR #128 on Oct 15. The Notion copy is still not written because the Notion session expired. |
| T2 | Spec: mandate, gate, ledger, revoke | Hark | Oct 15 | Open, due today. There is no `docs/prototype/SPEC.md` in PR #128. The behaviour is documented in `packages/sdk/README.md` (mandate type, gate rule order, deny codes, ledger, revoke), which is the starting point for the spec. |
| T3 | SDK + sandbox + tests | Hark | Oct 17 | Built, in review in PR #128. `@varanasi/sdk`, `packages/sandbox/demo.mjs`, 42 tests in 5 files (unit, property and fuzz with fast-check, on-chain stub, MCP integration, live ledger page). CI green on 80a7d0f. |
| T4 | MCP server + integration test | Hark | Oct 17 | Built, in review in PR #128. `@varanasi/mcp-server` (stdio) with `create_mandate`, `check_payment`, `record_payment`, `revoke_agent`, `get_ledger`, `list_mandates`, `sandbox_info`, plus a stdio integration test over every tool. |
| T5 | Live ledger web view | Hark (teammate review) | Oct 19 | Built in PR #128 (`npm run sandbox:live`, page on 127.0.0.1:8787). Needs teammate review. |
| T6 | Security + UX review | ChatGPT agent / teammates | Oct 20 | Not started as an outside review. The author's self review is in `docs/REVIEW_LOG.md` on the branch (findings R1 to R13). |
| T7 | Demo script + 2 min recording | Hark | Oct 21 | Not started. The terminal demo (`npm run sandbox`) exists and can be the base of the script; no written script or recording yet. |
| T8 | Vision film | Hark | script Oct 14, cut Oct 15 | Outside PR #128. Per the Oct 14 standup, script v2 is posted for review and shots were rendering. Not verified in this restore. |

## What the one command does today

`cd packages && npm ci && npm run sandbox` (Node 22 or newer, no keys, no network) runs five acts and exits non-zero if any step misbehaves. CI runs it on every PR.

1. Owner signs an EIP-712 mandate: 5 tUSDC per payment, 20 tUSDC total, 24 hours, one shop, one category.
2. SDK: 4 tUSDC allowed; 7.50 blocked (over per-payment cap); unknown shop blocked; replayed payment blocked.
3. MCP: the same through the MCP server, as Claude Desktop or Cursor would call it.
4. Owner revokes the agent; the next payment is blocked in the SDK and over MCP.
5. The append-only, hash-chained ledger shows every step and verifies.

## Open decisions for Ram (PR #128)

1. Align the SDK mandate format with `MandateGateHook` (on `hark/gate-jobs-erc8183`) so one owner signature works off chain and on chain. Recommendation: yes. (REVIEW_LOG R8)
2. MCP server signing off by default outside the demo, so the server never signs for the owner. Recommendation: yes. (REVIEW_LOG R2)

## Known limits of this slice

From `docs/REVIEW_LOG.md`: revoke has no caller authentication yet (R3), state lives in one process (R4), no void or refund call (R6), the ledger is not signed or anchored (R7), EOA owners only (R10).

## Rules

- Builds ship as PRs to feature branches with all checks green. Never main.
- Paused until the prototype works: Heartfulness and other external asks.
- Standup in #all-hark-bridge every day at 9:30 AM IST. Reply in the plan thread to take a task.
