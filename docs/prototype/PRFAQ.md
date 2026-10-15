We are spiritual beings who came to Earth to experience being human.

**Mission:** Build the financial and economic infrastructure that lets AI agents work on behalf of humanity, so people can gain more freedom over how they live.

**Varanasi is building the financial operating system for the AI-agent era.**

# PR/FAQ: Varanasi agent permission layer

Draft, written Amazon style (press release first, then FAQ). Restored on Oct 15, 2026. It describes only what PR #128 (branch `hark/agent-permission-sdk`) ships today. Sandbox and test money only.

---

## Press release (draft for the M1 prototype, Wed Oct 21, 2026)

### Varanasi lets people give their AI agents a spending limit they can take back in one step

*A developer prototype: owners sign what an agent may spend, every payment is checked before money moves, every action is recorded, and any agent can be revoked instantly. Test money only.*

**Hyderabad, India.** AI agents can already book, buy and pay for things. What is missing is a simple way for the person behind the agent to say "this much, for this, for this long, and no more", and to be sure it holds. Today the usual choice is to hand an agent a full key or card, or to approve every step by hand.

Varanasi's agent permission layer is a small SDK and an MCP server that sit between an agent and any payment. The owner signs a spend mandate: a per payment cap, a total cap, an expiry, and optional lists of allowed payees and categories. Before the agent pays, it asks the gate. The gate answers allow or block with a plain reason, and an allowed spend is debited from the mandate in the same step, so there is no gap between check and use. Every mandate, check, payment, block and revoke goes into an append-only, hash-chained ledger. When the owner revokes the agent, the next payment is blocked, through the SDK and over MCP.

A developer can see the whole flow with one command: `cd packages && npm ci && npm run sandbox`. It needs Node 22 or newer and no keys, accounts or network. The demo signs a mandate for 5 tUSDC per payment and 20 tUSDC in total, allows a 4 tUSDC payment, blocks a 7.50 payment, a payment to a shop not on the list and a replayed payment, repeats the story through the MCP server the way Claude Desktop or Cursor would, revokes the agent, shows the next payment blocked, and prints the ledger with its hash chain verified.

This release is a sandbox. It uses test tokens only and moves no real funds. Varanasi is not a bank and does not hold customer money. Real money rails are future work and would come through licensed partners.

**How to try it.** Clone the repository, run the one command above, or add the MCP server to Claude Desktop, Cursor or Claude Code using `packages/mcp-server/README.md`. `npm run sandbox:live` opens a live ledger page on your own machine.

---

## Customer FAQ

**Who is this for?**
Developers building AI agents that need to pay for things, and the people who own those agents and want limits they control.

**What can an owner control?**
Per payment cap, total cap, start and expiry time, allowed payees (empty means any), allowed categories (empty means any), the token, and which agent the mandate is for. The owner signs these terms with EIP-712.

**What does the agent do before it pays?**
It calls `gate.spend` in the SDK or `record_payment` over MCP right before paying. If the answer is not allowed, it does not pay. `gate.check` and `check_payment` are previews with no debit.

**What gets blocked?**
Anything outside the signed terms, with a stable code: for example `OVER_PER_TX_CAP`, `OVER_TOTAL_CAP`, `PAYEE_NOT_ALLOWED`, `CATEGORY_NOT_ALLOWED`, `EXPIRED`, `AGENT_REVOKED`, `DUPLICATE_PAYMENT`. The full list is in `packages/sdk/README.md`.

**How fast is revoke?**
Immediate inside the running process. `revoke()` sets a fence before it does anything else, so no payment debit starts after it is called, even one already queued. A revoked agent cannot get new mandates.

**What is recorded?**
Every mandate, check, payment, block and revoke, in an append-only ledger where each entry carries the hash of the one before it. Anyone holding an exported copy can verify it has not been edited.

**Does real money move?**
No. Sandbox and test money only. Real money would only come later, through licensed partners.

**Is Varanasi a bank?**
No. Varanasi builds software that checks and records what agents are allowed to spend.

**Which agents work with it?**
Any agent that can call a TypeScript SDK or an MCP server over stdio. Setup notes for Claude Desktop, Cursor and Claude Code are in the MCP README.

---

## Internal FAQ

**What exactly does PR #128 ship?**
- `@varanasi/sdk`: `createMandate`, `gate.check`, `gate.spend`, ledger, `revoke`, `revokeMandate`, pluggable backends. `MemoryBackend` is the default. `OnchainBackend` is a stub: revocation is read live from `AegisRegistry`, spend limits are still enforced off chain.
- `@varanasi/mcp-server`: stdio MCP server with seven tools (`create_mandate`, `check_payment`, `record_payment`, `revoke_agent`, `get_ledger`, `list_mandates`, `sandbox_info`) and an optional local ledger page.
- `packages/sandbox/demo.mjs`: the one command demo, which exits non-zero if any step behaves differently. CI runs it on every PR. An optional anvil mode deploys `AegisRegistry` locally and lands the revoke on chain.
- 42 tests across 5 files, including property and fuzz tests with fast-check.

**How is a signed mandate protected from replay or tampering?**
The EIP-712 domain binds chain id and verifying contract, and the mandate id is that digest. A mandate id and a `(principal, nonce)` pair each register once. Only low `s` signatures are accepted. Lists must be canonical so one intent has one encoding. Details and tests are in `docs/REVIEW_LOG.md`.

**What is not safe to deploy yet?**
From the self review in `docs/REVIEW_LOG.md`:
- R2: the MCP server signs mandates with a sandbox owner key when no signed mandate is passed. Fine for a test money demo, wrong for anything else. `VARANASI_SANDBOX_SIGNING=0` turns it off.
- R3: revoke has no caller authentication yet.
- R4: state lives in one process; a restart or a second process does not share it.
- R6: no void or refund call when a rail fails after the debit.
- R7: the ledger is hash-chained but not signed or anchored.
- R10: EOA owners only, no ERC-1271 smart accounts yet.

**What decisions are waiting on Ram?**
1. Align the SDK mandate format with `MandateGateHook` so one owner signature works off chain and on chain. Recommendation: yes.
2. Make MCP server signing off by default outside the demo. Recommendation: yes.

**What comes after M1?**
A spec (T2), an outside security and UX review (T6), a demo script and recording (T7), then the on-chain spend gate, owner-signed revoke, a shared store, and ledger anchoring. Real money rails only through licensed partners.

**What are we not claiming?**
No users, partners, volumes or revenue. This is a prototype on test money.
