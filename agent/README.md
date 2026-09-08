# @varanasi/agent

Author: Ramprasad

TS agent layer for varanasi (ETHOnline 2026). Owns `agent/` only — never touches
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

## Agent discovery (ERC-8004 + Agent0 subgraphs)

Agents discover work via live Agent0 ERC-8004 subgraphs (`src/discover.ts` —
`searchAgents` across Base default (+ Sepolia opt-in), `getAgentProfile` by
`chainId:agentId`, normalized to `{ id, chain, name, description, mcpEndpoint,
x402Support, trust, feedbackCount }`). Same Gateway key as `graph.ts`
(`GRAPH_API_KEY`); `--offline` fixture mode is tests-only.

```bash
# Live discovery (Base default)
npx tsx src/cli.ts discover --chain base --first 10

# Filter + other chains
npx tsx src/cli.ts discover --chain base --capability x402 --first 5
npx tsx src/cli.ts discover --chain eth --capability mcp --first 5
npx tsx src/cli.ts discover --chain sepolia --first 5   # opt-in testnet

# Single profile (chainId:agentId under the hood)
npx tsx src/cli.ts discover --chain base --profile <agentId>

# Fixture mode (no network, never for demos)
npx tsx src/cli.ts discover --offline
```

```ts
import { searchAgents, getAgentProfile } from "./src/discover.js";
const agents = await searchAgents({ chain: "base", capability: "x402", first: 10 });
const profile = await getAgentProfile("base", agents[0].id); // feedbackCount included
```

Output is single JSON: `{ ok, mode: "live" | "offline", chains, count, agents }`
(or `{ ok, mode, agent }` with `--profile`).

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
| `src/discover.ts` | ERC-8004 agent discovery — `searchAgents` (Base default, Sepolia opt-in), `getAgentProfile` (chainId:agentId), Agent0 IDs (`AGENT0_SUBGRAPHS`) |
| `src/mcp.ts` | MCP stdio wrapper (`search_subgraphs/get_schema/run_query`) + Gateway fallback |
| `src/ens.ts` | viem ENSv2 resolver (`AegisRegistry` + Universal Resolver V2, registry-only fallback) |
| `src/reason.ts` | pure heuristic `analyzeRisk` + `llmRationale` plug point (opt-in LLM via brain) |
| `src/brain.ts` | opt-in LLM reasoning `reasonWithLLM` (OpenAI-compatible chat API, heuristic fallback, `{ llm }` flag) |
| `src/pay.ts` | x402 payer (`@x402/fetch` + Hedera ECDSA signer, HashScan receipts) |
| `src/mandate.ts` | EIP-712 mandate sign/verify (domain bound to live escrow + Sepolia, nonce mgmt, offline) |
| `src/escrow.ts` | TaskEscrow viem client (`fundMandate` with ERC20 approve-first, `taskState` read, release/refund/cancel/submitValidation writers) |
| `src/cli.ts` / `src/index.ts` | `analyze` orchestration / public exports (+ `mandate` signer) |

## LLM reasoning (opt-in, heuristic fallback)

`src/brain.ts:reasonWithLLM(intel, alpha, identity, thresholdBps, opts)`
calls an OpenAI-compatible chat API with a tight DeFi-risk system prompt
(`LLM_SYSTEM_PROMPT` — model must return STRICT JSON
`{ riskScoreBps 0..10000, decision ACT|SKIP, rationale, factors[] }`,
15s timeout, strict schema validation). ANY failure (no key for a remote
endpoint, timeout, network error, bad JSON, schema violation) falls back to
`analyzeRisk` and marks the verdict `{ llm: false }` (LLM path: `{ llm: true }`).

Env (never print `LLM_API_KEY`):

```bash
LLM_BASE_URL=http://localhost:1234/v1  # default: local LM Studio, no key needed
LLM_API_KEY=                           # optional locally; required for remote base URLs
LLM_MODEL=local-model                  # default
```

```bash
# Heuristic (default — behavior unchanged, no LLM call)
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool <pool-id> --offline --skip-pay

# LLM reasoning (local LM Studio first: open LM Studio, start server on :1234)
npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool <pool-id> --offline --skip-pay --llm

# LLM reasoning (remote OpenAI-compatible endpoint)
LLM_BASE_URL=https://api.example.com/v1 LLM_API_KEY=<key> LLM_MODEL=<model> \
  npx tsx src/cli.ts analyze --agent agent-1.aegis.eth --pool <pool-id> --skip-pay --llm
```

`analyze` JSON reports `"mode": { ..., "reason": "heuristic" | "llm-with-heuristic-fallback" }`
and the verdict carries `llm: true|false` so judges can verify which path ran.
Without `--llm`, no LLM code runs. Without a key for a remote endpoint, no
network call is attempted — heuristic is used directly.

## Mandate / escrow lane (Sepolia)

Live: `TaskEscrow 0xba038d50d70cf63ced17f3f23f77df4783f188da`
(Sepolia `11155111`), threshold `5000` bps,
`RiskGuard 0xc35861c4dbe63a9c8cfefd32c671998151c217ca`.
Spec: `docs/MANDATE.md`. The `mandate` command is OFFLINE — it creates +
EIP-712 signs a mandate and prints the digest + explorer-ready fields. It
never broadcasts, stores keys, or logs secrets. Keys NEVER travel via CLI
flags (no `--private-key` flag exists on any subcommand): the payer key
comes from `MANDATE_PRIVATE_KEY` env (fallback `OWNER_PRIVATE_KEY` /
`AEGIS_OWNER_KEY`) or a stdin pipe (`--key-stdin`). Expiry is sanity-checked
at signing (`windowStart<=windowEnd<=expiry`, future-bounded ≤366d).

```bash
# 0. Preflight first (guided PASS/FAIL per dependency + exact fix per failure)
npx tsx src/cli.ts doctor

# 1. Create + sign a mandate (prints mandate JSON, digest, taskId, signature)
export MANDATE_PRIVATE_KEY=0xPAYER_KEY   # or pipe it (see --key-stdin below)
npx tsx src/cli.ts mandate \
  --agent 0xAGENT --merchant 0xMERCHANT --token 0xTOKEN --cap 1000000 \
  --window-start <unix> --window-end <unix> --expiry <unix>

# Pipe form (key never in env or history):
printf '%s' "$MANDATE_PRIVATE_KEY" | npx tsx src/cli.ts mandate \
  --agent 0xAGENT --merchant 0xMERCHANT --token 0xTOKEN --cap 1000000 \
  --window-start <unix> --window-end <unix> --expiry <unix> --key-stdin

# 2. Fund (orchestrator, own wallet client — approve-first inside fundMandate):
#    signer approves(token, escrow, cap); anyone submits fund(mandate, sig).
#    See agent/src/escrow.ts: fundMandate() → releaseTask() / refundTask() / cancelTask().
#    Poll: taskState(taskId) → Funded → Validated → Released.
```

Release rule (onchain, no bypass): latest validator score `>= threshold`
AND live `RiskGuard.authorize(agent, score, cap)` AND `now <= expiry`.
Refund is permissionless strictly after expiry; cancel is payer-only
pre-validation. Replay = `NonceUsed` per-signer nullifier; revocation lands
at release via the live guard re-check.

## LLM plug (legacy seam)

`reason.ts:llmRationale(input, base, { llm })` stays heuristic by default;
pass `{ llm: true }` to route through `reasonWithLLM` with the same fallback
guarantee. Scoring math stays in `analyzeRisk` so decisions remain
deterministic and testable.
