# Varanasi agent permission layer (sandbox)

Varanasi is building the financial operating system for the AI-agent era.

This folder is the first working slice: owners set what their agent can spend, every payment is checked before money moves, and any agent can be revoked instantly.

**Sandbox only. Test money only. No real funds move.**

## Run the demo (one command)

```bash
cd packages && npm ci && npm run sandbox
```

Needs Node 22 or newer. No keys, no accounts, no network.

It tells the whole story in the terminal:

1. The owner signs a spend mandate for their agent (EIP-712): 5 tUSDC per payment, 20 tUSDC total, 24 hours, one shop, one category.
2. The agent pays through the SDK. 4 tUSDC is allowed. 7.50 is blocked (over the per-payment cap). An unknown shop is blocked. A replayed payment is blocked.
3. An AI agent does the same through the MCP server, the way Claude Desktop or Cursor would.
4. The owner revokes the agent. The next payment is blocked, in the SDK and over MCP.
5. The append-only, hash-chained ledger shows every step.

The script exits non-zero if any step behaves differently, and CI runs it on every PR.

More ways to run it:

| Command | What it adds |
| --- | --- |
| `npm run sandbox:live` | Opens a live ledger page at http://127.0.0.1:8787/ and pauses between steps so you can watch |
| `npm run sandbox:anvil` | Starts a local anvil chain, deploys `contracts/src/AegisRegistry.sol`, and the revoke lands on chain too (needs Foundry) |

## What is here

| Path | What |
| --- | --- |
| [`sdk/`](sdk/README.md) | `@varanasi/sdk`: `createMandate`, `gate.check`, `gate.spend`, ledger, `revoke`, pluggable backends (in-memory sandbox, on-chain stub over AegisRegistry and TaskEscrow ABIs) |
| [`mcp-server/`](mcp-server/README.md) | `@varanasi/mcp-server`: stdio MCP server with `create_mandate`, `check_payment`, `record_payment`, `revoke_agent`, `get_ledger`, `list_mandates`, `sandbox_info` |
| `sandbox/` | The demo script and the optional anvil helper |

## Develop

```bash
npm ci
npm run lint        # biome
npm run typecheck   # tsc, both packages
npm test            # build, then unit + property (fast-check) + MCP stdio integration tests
FC_RUNS=500 npx vitest run sdk/test/gate.property.test.ts   # heavier fuzzing
```

Security notes and open questions for this slice: [`../docs/REVIEW_LOG.md`](../docs/REVIEW_LOG.md).
