# @aegis/agent

TS agent layer for AEGIS (ETHOnline 2026). Owns `agent/` only — never touches
`contracts/`, `service/`, `frontend/`.

Pipeline: **ENS resolve → Graph intel → pay x402 → reason → RiskGuard check → JSON.**

## Setup (judges)

```bash
cd agent
cp .env.example .env   # fill GRAPH_API_KEY (Subgraph Studio), SEPOLIA_RPC_URL,
                       # AEGIS_REGISTRY, HEDERA_* keys, SIGNAL_URL
npm install
npx tsc --noEmit       # must be green
npm test               # reason.ts unit tests (vitest)
```

## Run it

```bash
# Full live run: ENS + live Gateway + paid x402 signal + RiskGuard static check
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool 0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8

# Vaults leg (same query pattern, ERC-4626 subgraph)
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool <vault-id> --vault

# No-money mode (Graph + reasoning only, skips Hedera payment)
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool <pool-id> --skip-pay

# Fixture mode for tests without a key (never for demos)
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool x --offline --skip-pay
```

Output is single JSON: `{ agent, intel, alpha, verdict, guard, thresholdBps }`
with `mode.graph: "live" | "offline"` and x402 receipts
(`alpha.receipt: { paid, txHash, hashscanUrl }`).

## What counts as load-bearing Graph use

1. Default path hits the **live Gateway** (`GRAPH_API_KEY` required, no mocks).
2. **Standardized-schema leverage**: one query pattern (`STANDARD_POOL_QUERY`
   over `liquidityPool { totalValueLockedUSD cumulativeVolumeUSD … }`) serves
   both Uniswap V3 and ERC-4626 vaults — swap subgraph ID, keep the query.
3. Raw Graph JSON is never the output: `intel` feeds `analyzeRisk` →
   `{ riskScoreBps, decision, rationale }`, then a RiskGuard static call.
4. Reuse contract for any Claude/Cursor agent: see `SKILL.md`.

## Files

| file | role |
|---|---|
| `src/graph.ts` | `GraphClient` — live Gateway, standardized IDs, `query()` escape hatch |
| `src/mcp.ts` | MCP stdio wrapper (`search_subgraphs/get_schema/run_query`) + Gateway fallback |
| `src/ens.ts` | viem ENSv2 resolver (`AegisRegistry` + Universal Resolver V2, registry-only fallback) |
| `src/reason.ts` | pure heuristic `analyzeRisk` + `llmRationale` plug point |
| `src/pay.ts` | x402 payer (`@x402/fetch` + Hedera ECDSA signer, HashScan receipts) |
| `src/cli.ts` / `src/index.ts` | `analyze` orchestration / public exports |

## LLM plug

`reason.ts:llmRationale(input, base)` is the seam: pass Graph intel + alpha to
your model and return enriched rationale text. Scoring math stays in
`analyzeRisk` so decisions remain deterministic and testable.
