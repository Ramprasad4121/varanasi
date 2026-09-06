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
# Full live run: ENS + live Gateway (official Uniswap V3) + paid x402 signal + RiskGuard static check
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640

# V2 leg (Uniswap V2 pair intel)
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool <pair-id> --pair

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
2. **Uniswap-native leverage**: one query shape (`UNISWAP_POOL_QUERY`
    over `pool { totalValueLockedUSD volumeUSD feeTier token0 token1 … }`) serves
    Uniswap V3/V4, with `UNISWAP_V2_PAIR_QUERY` (`pair { … }`) for V2 — swap
    subgraph ID, keep the normalizer (`toPoolIntel`).
3. Raw Graph JSON is never the output: `intel` feeds `analyzeRisk` →
    `{ riskScoreBps, decision, rationale }`, then a RiskGuard static call.
4. Reuse contract for any Claude/Cursor agent: see `SKILL.md`.
5. Never trust TVL ordering blindly (spam pools fake TVL): demos pin
    `CURATED_POOLS`; `topPools()` is discovery-only with a sanity filter
    (drops TVL > $50B / junk symbols).

## Files

| file | role |
|---|---|
| `src/graph.ts` | `GraphClient` — live Gateway, official Uniswap IDs (`KNOWN_SUBGRAPHS`), curated pools (`CURATED_POOLS`), `query()` escape hatch |
| `src/mcp.ts` | MCP stdio wrapper (`search_subgraphs/get_schema/run_query`) + Gateway fallback |
| `src/ens.ts` | viem ENSv2 resolver (`AegisRegistry` + Universal Resolver V2, registry-only fallback) |
| `src/reason.ts` | pure heuristic `analyzeRisk` + `llmRationale` plug point |
| `src/pay.ts` | x402 payer (`@x402/fetch` + Hedera ECDSA signer, HashScan receipts) |
| `src/cli.ts` / `src/index.ts` | `analyze` orchestration / public exports |

## LLM plug

`reason.ts:llmRationale(input, base)` is the seam: pass Graph intel + alpha to
your model and return enriched rationale text. Scoring math stays in
`analyzeRisk` so decisions remain deterministic and testable.
