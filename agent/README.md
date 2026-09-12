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
npm test               # vitest — 165 tests / 18 files, fully offline (mocked viem/fetch)
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

## Aave lending intel (official Aave MCP server)

Lending intel comes from the official Aave MCP server (`src/aave.ts` —
`AaveMcpClient` over streamable HTTP `https://mcp.aave.com`, protocol version
`2025-11-25`, `Mcp-Session-Id` lifecycle, injectable fetch, 20s timeouts).
Public server: no keys needed, nothing secret is ever logged. `AAVE_OFFLINE=1`
(or `--offline`) returns local fixtures — tests only, never demos.

Tools used: `get_chains`, `get_markets` (symbol/APY/caps/liquidity),
`get_user_summary` (aggregate + health factor), `get_apy_history`,
`preview_action` (SIMULATE supply/borrow/withdraw/repay — no execution),
plus `prepare_action` (UNSIGNED tx) via `callTool`. Enforcement fit:
preview/prepare are unsigned — our story is "prepare unsigned, policy-check,
sign inside mandate" (this module never signs, never broadcasts, never holds
keys).

```bash
# Market snapshots (optional symbol filter)
npx tsx src/cli.ts lending markets --symbols ETH,USDC

# Wallet summary (aggregate + health factor)
npx tsx src/cli.ts lending wallet --address 0x…

# Unsigned borrow/supply simulation (never executes)
npx tsx src/cli.ts lending preview --action supply --reserve USDC --amount 100 --wallet 0x…

# Fixture mode (no network, never for demos)
npx tsx src/cli.ts lending markets --offline
```

Output is single JSON (`{ ok, mode: "live" | "offline", … }`); failures print
error JSON to stderr with a non-zero exit. Env: `AAVE_MCP_URL` (default
`https://mcp.aave.com`), `AAVE_OFFLINE=1` for fixture mode.

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
| `src/aave.ts` | Aave MCP streamable-HTTP client (`AaveMcpClient` — markets/wallet/APY/preview, unsigned-only) |
| `src/ens.ts` | viem ENSv2 resolver (`AegisRegistry` + Universal Resolver V2, registry-only fallback) |
| `src/reason.ts` | pure heuristic `analyzeRisk` + `llmRationale` plug point (opt-in LLM via brain) |
| `src/brain.ts` | opt-in LLM reasoning `reasonWithLLM` (OpenAI-compatible chat API, heuristic fallback, `{ llm }` flag) |
| `src/pay.ts` | x402 payer (`@x402/fetch` + Hedera ECDSA signer, HashScan receipts) |
| `src/mandate.ts` | EIP-712 mandate sign/verify (domain bound to live escrow + Sepolia, nonce mgmt, offline) |
| `src/escrow.ts` | TaskEscrow viem client (`fundMandate` with ERC20 approve-first, `taskState` read, release/refund/cancel/submitValidation writers) |
| `src/akshaya.ts` | Akshaya reputation reader + `attest` writer (soulbound proof-of-outcome score; `readReputation`, `isAttested`) |
| `src/cli.ts` / `src/index.ts` | `analyze` orchestration / public exports (+ `mandate` signer, `hire` workers) |
| `src/workers/scout.ts` | SignalScout — `topPools` discovery (sane-filtered) + `payForSignal` on healthy turnover → `{ pool, intel, signal, confidence, receipt }` |
| `src/workers/analyst.ts` | PoolAnalyst — pool intel + alpha → `analyzeRisk` verdict + human brief (LLM opt-in passthrough) |
| `src/workers/freelancer.ts` | EscrowFreelancer — signed mandate + taskId → `taskState` monitor → `releaseTask` on Validated / `refundTask` past expiry (caller-supplied wallet, never holds keys) |
| `src/finance/finance.ts` | Community-finance engine — `recommend(portfolio)`, `buildMandate(decisions)`, `execute(mandate)` (**throws** until finance contracts are deployed — no demo state broadcasts) + `types.ts`, `finance.test.ts` (9 tests) |

## Community finance engine

Decision layer for the demo community vault (`contracts/src/finance/`,
`service /v1/finance*`, `frontend /finance`). Inputs are address-seeded
portfolio summaries; outputs are steward recommendations + signed mandate
shapes. Shared types come from `frontend/finance-types/` (mirror of the
single source of truth). See `docs/REFERENCE.md` §6 for the finance test
breakdown.

## Demo workers (hire agents → find work → earn into escrow)

Clients hire a worker end-to-end via `hire` (machine-readable JSON, exit 0
on success, error JSON + non-zero on failure). Keys NEVER travel via flags:
the freelancer caller key comes from `FREELANCER_PRIVATE_KEY` env (fallback
`OWNER_PRIVATE_KEY` / `AEGIS_OWNER_KEY`) or a stdin pipe (`--key-stdin`).

```bash
# SignalScout: discover via topPools (or pin --pool), buy x402 signal on healthy turnover
npx tsx src/cli.ts hire --agent scout --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --json

# PoolAnalyst: score pool intel (heuristic default, --llm opts into brain.ts)
npx tsx src/cli.ts hire --agent analyst --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --json

# EscrowFreelancer: settle a task (release on Validated, refund past expiry)
export FREELANCER_PRIVATE_KEY=0xCALLER_KEY   # or pipe it (see --key-stdin)
npx tsx src/cli.ts hire --agent freelancer --task 0xTASKID --json
```

```ts
import { runScout } from "./src/workers/scout.js";
import { runAnalyst } from "./src/workers/analyst.js";
import { runFreelancer } from "./src/workers/freelancer.js";

const scout = await runScout({ poolId: "0x88e6…" }); // { pool, intel, signal, confidence, receipt }
const opinion = await runAnalyst({ intel: scout.intel }, {}); // { verdict, brief }
const settled = await runFreelancer(taskId, callerWallet); // { taskId, state, label, action, txHash }
```

Each worker has a pure core plus a live wrapper with injectable clients, so
tests run offline with no network and no keys (`src/workers/*.test.ts`).

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

Live v2 rail (Sepolia `11155111`, evidence: `docs/DEMO.md` § 7):

| Contract | Address |
|---|---|
| TaskEscrow | `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24` |
| RiskGuard | `0x668c01aE564D51baFF0029D361c20c534d738400` |
| AegisRegistry | `0x3913f1E6A0Be93180363aBd01Df7968d494033A8` |
| vUSD (mock 6dp) | `0x6169A84cD7430042fb697c2cC131F663212E8b30` |

Threshold `5000` bps. Defaults baked into `src/mandate.ts`; verify on the
explorer before funding anything. Spec: `docs/MANDATE.md`. The `mandate` command is OFFLINE — it creates +
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

## Reputation lane (Akshaya)

```bash
npx tsx src/cli.ts reputation sentinel-1   # or a raw 0x… agent address
npx tsx src/cli.ts attest 0xTASKID…        # permissionless, idempotent
```

`reputation` reads `statsOf`/`balanceOf` on Akshaya and prints the decayed
score (bps of one perfect outcome), coins/dust/receipts, and a verdict —
`trusted / thin-history / unknown / burned`. Accepts `<sublabel>` (resolved
via AegisRegistry) or a raw address; key-free, 2 RPC reads.

`attest` converts a TERMINAL escrow task into its soulbound receipt
(released → +10000 coin, refunded/cancelled → −4000 dust). Anyone may call
it; a known task is skipped via `tokenByTask` pre-check (zero gas). Attester
key follows the same law as every writer here: env or `--key-stdin`, never a
flag. Needs `AKSHAYA_ADDRESS` (deploy: `../contracts/script/DeployInventions.s.sol`).
Spec: `docs/AKSHAYA.md`.

## LLM plug (legacy seam)

`reason.ts:llmRationale(input, base, { llm })` stays heuristic by default;
pass `{ llm: true }` to route through `reasonWithLLM` with the same fallback
guarantee. Scoring math stays in `analyzeRisk` so decisions remain
deterministic and testable.
