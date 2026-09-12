# Glossary — varanasi terms, one line each

Author: Ramprasad

Every term used across the repo and docs, defined once. When writing docs,
use these definitions. When unsure of a term, look here first.

## Core product

| Term | Definition |
|---|---|
| **varanasi** | The enforcement rail for agentic commerce — humans sign mandates, agents work inside them, validators release payment on proof. |
| **mandate** | A single EIP-712 signed object authorizing one escrowed task: `(agent, merchant, token, cap, windowStart, windowEnd, expiry, nonce, chainId)`. Type string is LOCKED in `docs/MANDATE.md`. |
| **cap** | Max escrowed amount, base units, pulled from the signer via `safeTransferFrom`. |
| **escrow** | Funds locked in `TaskEscrow` for the duration of a mandate; released to merchant on pass, refunded on fail/expiry. |
| **validator** | The allowlisted party who scores the work; release needs score ≥ threshold. |
| **merchant** | The payee on release — single-merchant per mandate (no allowlist). |
| **agent** | A wallet + ENSS name that executes tasks inside mandate bounds. Holds mandates, never keys. |

## Identity

| Term | Definition |
|---|---|
| **ENSv2** | Next-gen ENS deployment (Sepolia beta) — hierarchical subnames + permissioned registry/resolver, wildcard resolution via Universal Resolver V2. |
| **AegisRegistry** | The contract that mints/revokes/renews agent subnames (`sublabel.aegis.eth`), stores expiry, mirrors to ENSSv2 on a best-effort basis. |
| **sublabel.aegis.eth** | An agent's onchain identity, e.g. `sentinel-1.aegis.eth`. |
| **ERC-8004** | Reputation/identity standard (`ReputationSet`, `Revoke`, unidirectional, no assets). Read via `agent/src/erc8004.ts`; Sepolia has no code at canonical addresses so the agent reads only. |
| **Privy** | Site-wide sign-in (email/Google/GitHub/wallet) with an embedded self-custodial Sepolia wallet created on first login. |

## Money / payments

| Term | Definition |
|---|---|
| **x402** | HTTP-402 payment flow: resource server returns 402 with asset requirements; payer signs a transfer; facilitator verifies + settles asynchronously. |
| **x402 facilitator** | Verifies payment and settles it (testnet default `https://x402.org/facilitator`, mainnet `https://api.blocky402.com`). |
| **Hedera testnet** | Payment network for x402 — HBAR and HTS tokens (USDC `0.0.429274` on testnet). |
| **vUSD** | The repo's simulated stable token (MockERC20, Sepolia `0x6169A84c...e8b30`) used for escrow/finance demos. Demo-only. |
| **HCS** | Hedera Consensus Service — best-effort audit trail mirroring every paid receipt to a topic (`service/src/hcs.ts`). |
| **HashScan** | Hedera block explorer (`https://hashscan.io/testnet/tx/...`). |

## Risk

| Term | Definition |
|---|---|
| **RiskGuard** | The contract that `authorize(action, riskScore)` gates every act — reverts if the ENS identity is invalid (revoked/expired) or the score ≥ threshold. |
| **risk score** | Agent's view of how risky an action is, produced by reasoning over Graph intel + optional paid signals. |
| **Akshaya** | Settlement-derived reputation: soulbound ERC-721 outcome coins minted only from terminal escrow states; score decays with a 90-day half-life. Spec: `docs/AKSHAYA.md`.
| **GhatStream** | Continuous escrow: value flows per second under a mandate; payer can freeze the tap anytime; unearned remainder always refunds. Spec: `docs/GHATSTREAM.md`.
| **World Selfie Check** | World ID credential (selfie liveness + facial similarity, no Orb) used as the human-hiring abuse signal — maps to agent-count + allowance tiers. |

## Community finance (demo-first)

| Term | Definition |
|---|---|
| **SavingsVault** | Community savings pool contract — members pool savings, withdraw on schedule. |
| **ChitPool** | Chit-fund style community pool — periodic contributions, rotating payout. |
| **LoanAgreement** | Term-loan contract between lender and borrower with a repayment schedule. |
| **CollateralVault** | Holds collateral backing community loans. |
| **FinancialReputation** | Tracked credit/reputation of members across the finance contracts. |
| **GoldRegistry / GoldAttestor / GoldToken** | Gold-backed collateral: registry stores gold tokens, attestor verifies gold, token is the metal-collateralized asset. |
| **community-finance demo** | All `/v1/finance*` + `/finance` data is SIMULATED (address-seeded, deterministic). Agent `execute()` throws until contracts are deployed — no demo state broadcasts. |

## Services / surfaces

| Term | Definition |
|---|---|
| **signal service** | `service/` — Express resource server; paid `POST /v1/signal` ($0.01) + `POST /v1/score` ($0.001); free `/v1/finance*`, `/v1/receipts`, `/health`. |
| **agent engine** | `agent/` — TS decision pipeline: ENS resolve → Graph intel → pay x402 → reason → RiskGuard check → JSON. |
| **the marketplace** | `frontend/` — Next.js app: hire wizard, `/account` vault, `/privy` treasury, `/finance` vault. |
| **financial demo API** | `GET /v1/finance`, `/v1/finance/summary`, `/v1/finance/recommend` — address-seeded deterministic portfolio + agent recommendations. |
| **finance-types** | `frontend/finance-types/` — shared TS types for the finance surfaces (mirrored into `service/` + `agent/`). |

## Table of contents back-link

Ruled by `docs/INDEX.md`. Facts live in `docs/REFERENCE.md`. Full protocol
semantics in `docs/MANDATE.md` + `docs/ARCHITECTURE.md`.