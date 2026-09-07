# Architecture — varanasi

Author: Ramprasad

## Why this wins

Judges in 2026 reward one thing: load-bearing sponsor tech in a coherent story.
varanasi tells it in one sentence: **agents can't transact without identity (ENSv2), data (The Graph), and money (Hedera x402).**

Each sponsor is load-bearing, not cosmetic:
- Remove ENSv2 → agents have no revocable identity / permissions.
- Remove The Graph → agent has no live market data to reason over.
- Remove Hedera x402 → agent can't buy premium signals; no machine-speed settlement.

## Flows

### 1. Onboard (Human → Agent identity)
Human connects wallet → `AegisRegistry.mintAgent(sublabel, agentWallet, expiry)` → creates/registers `sublabel.aegis.eth` in ENSv2 Permissioned Registry, sets Permissioned Resolver records (avatar, description, agent wallet), grants per-record roles via Enhanced Access Control. Owner can `revokeAgent()` or let expire. Resolved via Universal Resolver V2 wildcard.

### 2. Intel (Agent → The Graph)
Agent receives task e.g. "should I enter USDC/ETH vault?":
- Discover subgraphs: Subgraph MCP `search_subgraphs` (Uniswap V3 standardized, ERC-4626 vaults)
- Fetch schema → run GraphQL vs live Gateway (Subgraph Studio key)
- Normalize: TVL, volume24h, fees, APY across protocols (standards leverage: one query pattern, many protocols)
- LLM reasons: produces risk score + rationale, not raw dump.

### 3. Alpha (Agent → Hedera x402)
For premium signal, agent calls `POST /v1/signal` on service:
- Service returns HTTP 402 with Blocky402 payment requirements (hedera:testnet, HBAR or HTS)
- Agent signs TransferTransaction with ECDSA key, retries with PAYMENT-SIGNATURE
- Service verifies via Blocky402 `/verify`, returns alpha payload, facilitator settles async
- Receipt (txId, HashScan link) stored + shown in UI. HCS audit trail (stretch).

### 4. Act (Agent → Chain)
RiskGuard checks: ENS identity valid + not revoked/expired, risk score < threshold, human allowance remaining. If pass, executes guarded Sepolia call (e.g. mock swap intent log) else skips with reason. All decisions + receipts in frontend.

## Contracts (Sepolia)
- `AegisRegistry.sol`: ENSv2 wrapper — mint/revoke/renew agent subnames, stores expiry, emits events for indexer.
- `RiskGuard.sol`: `authorize(action, riskScore)` — reverts if identity invalid or score too high.

## Services
- `service/`: Express + x402/express resource server, Blocky402 facilitator, `/v1/signal` + `/v1/score` + `/v1/receipts`. Receipts are file-backed (`service/data/receipts.json`, last 100).
- `agent/`: MCP client, ENS viem resolver, reasoning engine (pluggable LLM), x402/fetch payer, CLI + API. Revoke CLI: `aegis revoke --label <sublabel>` (human owner key).
- `frontend/`: Next.js — onboard form, agent list (ENS names), intel cards (Graph data), pay receipts.
- Demo video script: `docs/VIDEO_SCRIPT.md`.

## Prize mapping
- The Graph AI From Scratch: live Subgraph MCP queries + reasoning + SKILL.md/README runnable.
- ENS Best Use: hierarchical subnames, wildcard, permissioned resolver, access control, expiring/revocable — central to auth.
- Hedera x402: live Blocky402-gated service on testnet, real paid request, README payment flow, ≤5min video.
