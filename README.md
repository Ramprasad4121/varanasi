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

- [x] Sepolia deployment + verified contracts ([DEMO.md §1](docs/DEMO.md#1-identity-ensv2--sepolia) — AegisRegistry `0x0aed80646680eb333e0d2129f6f0fa54503b5381`, RiskGuard `0xc35861c4dbe63a9c8cfefd32c671998151c217ca`, Sourcify-verified)
- [x] Live The Graph queries (no mocks) in demo ([DEMO.md §2](docs/DEMO.md#2-intel-the-graph-live-gateway) — official Uniswap V3 subgraph, pool `0x88e6a0c2...`)
- [x] Live Hedera x402 paid request (HashScan link) ([DEMO.md §3](docs/DEMO.md#3-alpha-hedera-x402-blocky-testnet-facilitator) — [tx 0.0.7162784-1788675749-710110370](https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370))
- [x] ENSv2 subname mint + revoke/expire demo (mint: [DEMO.md §1](docs/DEMO.md#1-identity-ensv2--sepolia) tx `0xaac0018d...`; revoke: TODO — run [`contracts/script/Revoke.s.sol`](contracts/script/Revoke.s.sol) or `aegis revoke --label`, paste tx in [DEMO.md §5](docs/DEMO.md#5-revoke-human-run--evidence-slot))
- [ ] 2-4 min demo video + public repo + README (script: [VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md); video link: TODO)
