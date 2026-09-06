# varanasi (formerly AEGIS) — Human-Authorized Agent Economy

Autonomous agents with ENSv2 identity, live The Graph intel, and Hedera x402 micropayments.

> **Rebrand note:** the project is now **varanasi**. Deployed Sepolia contracts
> (`AegisRegistry`, `RiskGuard`) and env vars (`AEGIS_REGISTRY`, …) keep their
> names — they are immutable onchain / wired into configs, so this repo rebrand
> does not require a redeploy.

**Prize stack (From Scratch, 3 picks):**
1. The Graph — Best AI Tooling / AI Use Case ($5k pool) — agent reasons over live Subgraphs via MCP
2. ENS — Best Use of ENSv2 ($4.5k pool) — agents as `*.aegis.eth` subnames with Permissioned Resolver + Enhanced Access Control (expiring, revocable)
3. Hedera — AI & Agentic Payments ($6k pool) — live x402-gated signal service on Hedera testnet via Blocky402, agent pays per-call

Stretch layers (if time): Privy wallets, Uniswap API quote, Bazantic recipe, World Selfie Check risk signal, Chainlink CRE.

## Architecture

```
Human (Privy wallet / EOA)
  │ mints + authorizes
  ▼
AegisRegistry (Sepolia) → ENSv2 Permissioned Registry: agent.aegis.eth
  │ wildcard resolution, expiring/revocable, per-record roles
  ▼
varanasi Agent (TS)
  │ 1. resolves ENSv2 name → wallet + permissions
  │ 2. queries live The Graph Subgraphs (Uniswap standardized, ERC-4626) via MCP
  │ 3. reasons (LLM) → risk score → trade/skip decision
  │ 4. pays Hedera x402 for premium alpha signal (HBAR/HTS, Blocky402)
  │ 5. executes guarded action (Sepolia) or returns intel
  ▼
Frontend dashboard: agents, ENS names, Graph insights, x402 receipts (HashScan)
```

## Repo layout

- `contracts/` — Foundry: AegisRegistry, RiskGuard, ENSv2 integration, tests
- `agent/` — TS agent: ENS resolve, Graph MCP client, reasoning, x402 payer
- `service/` — TS x402-gated alpha-signal API (Hedera testnet, Blocky402 facilitator)
- `frontend/` — Next.js dashboard
- `docs/` — ARCHITECTURE.md, DEMO.md, FEEDBACK.md, prize mapping

## Quickstart (dev)

See `docs/ARCHITECTURE.md`. Requires Sepolia RPC, Hedera testnet ECDSA accounts, Subgraph Studio API key.

## Submission checklist

- [ ] Sepolia deployment + verified contracts
- [ ] Live The Graph queries (no mocks) in demo
- [ ] Live Hedera x402 paid request (HashScan link)
- [ ] ENSv2 subname mint + revoke/expire demo
- [ ] 2-4 min demo video + public repo + README
