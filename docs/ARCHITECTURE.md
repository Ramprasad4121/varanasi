# Architecture — varanasi

Author: Ramprasad

How the four surfaces fit together, the flows, the contracts, the data-
ownership rules, and the community-finance protocol. Facts (addresses, ports,
tests) live in [`REFERENCE.md`](REFERENCE.md); protocol semantics in
[`MANDATE.md`](MANDATE.md). This document explains **why** and **how**.

## Why this wins

One sentence: **agents can't transact without identity (ENSv2), data (The
Graph), and money (Hedera x402).**

Each sponsor is load-bearing, not cosmetic:

- Remove ENSv2 → agents have no revocable identity / permissions.
- Remove The Graph → agent has no live market data to reason over.
- Remove Hedera x402 → agent can't buy premium signals; no machine-speed
  settlement.

This is a **community product**: people, agents, and DAOs sign up on the site
(accounts via Privy) and use the protocol. The public surface never advertises
internal engineering metrics; architecture and test facts live in docs, not on
the homepage.

## Surfaces

| Surface | Path | Responsibility |
|---|---|---|
| Contracts | `contracts/` | Sepolia protocol: identity, risk gate, escrow settlement, finance primitives |
| Agent | `agent/` | Decision engine: ENS resolve → Graph intel → pay x402 → reason → RiskGuard check |
| Service | `service/` | x402-paid alpha API + free community-finance demo APIs + HCS audit trail |
| Frontend | `frontend/` | Marketplace: hire, `/account` vault, `/privy` treasury, `/finance` vault |
| Shared types | `frontend/finance-types/` | Finance type surface (mirrored into `service/` + `agent/`) |

## Flows

### 1. Onboard (Human → Agent identity)
Human connects wallet → `AegisRegistry.mintAgent(sublabel, agentWallet,
expiry)` → creates/registers `sublabel.aegis.eth` in ENSv2 Permissioned
Registry, sets Permissioned Resolver records (avatar, description, agent
wallet), grants per-record roles via Enhanced Access Control. Owner can
`revokeAgent()` or let expire. Resolved via Universal Resolver V2 wildcard.
A human-hiring abuse signal comes from World Selfie Check: verified humans get
up to 10 agents / 50% allowance; guests 1 agent / 5% (see `WORLD.md`).

### 2. Intel (Agent → The Graph)
Agent receives a task, e.g. "should I enter USDC/ETH vault?":
- Discover subgraphs: Subgraph MCP `search_subgraphs` (Uniswap V3
  standardized, ERC-4626 vaults)
- Fetch schema → run GraphQL vs live Gateway (Subgraph Studio key)
- Normalize: TVL, volume24h, fees, APY across protocols (one query pattern,
  many protocols)
- LLM reasons → risk score + rationale, not a raw dump. (`agent/SKILL.md`
  documents the The-Graph surface.)

### 3. Alpha (Agent → Hedera x402)
For a premium signal, the agent calls `POST /v1/signal` on the service:
- Service returns HTTP 402 with Blocky402 payment requirements
  (hedera:testnet, HBAR or HTS)
- Agent signs a `TransferTransaction` with its ECDSA key, retries with
  `PAYMENT-SIGNATURE`
- Service verifies via Blocky402 `/verify`, returns the alpha payload,
  facilitator settles async
- Receipt (txId, HashScan link) stored + shown in the UI; mirrored to a
  Hedera Consensus Service topic (best-effort, `service/src/hcs.ts`).

### 4. Act (Agent → Chain)
`RiskGuard` checks: ENS identity valid + not revoked/expired, risk score <
threshold, human allowance remaining. Pass → executes a guarded Sepolia call
(e.g. a mock swap-intent log) inside the signed mandate; fail → skips with a
reason. All decisions + receipts appear in the frontend.

### 5. Finance (community vault — demo-first, contracts-as-source-of-truth)
The same rail extends into a programmable treasury the agent stewards:
- `contracts/src/finance/` — `SavingsVault` (pooled savings), `ChitPool`
  (periodic contributions, rotating payout), `LoanAgreement` (term loans),
  `FinancialReputation` (credit); `contracts/src/collateral/CollateralVault`
  secures loans; `contracts/src/gold/` (`GoldRegistry` /
  `GoldAttestor` / `GoldToken`) provides gold-backed collateral; a
  non-breaking `RiskGuard` `authorize()` hook gates writes.
- `service /v1/finance*` — deterministic, **address-seeded** portfolio +
  recommendations (free; simulated).
- `agent/src/finance` — `recommend()`, `buildMandate()`, `execute()`.
  `execute()` **throws until the finance contracts are deployed**, so demo
  state never broadcasts.
- `frontend /finance` — vault UI, every figure **labeled simulated**.
- Shared types in `frontend/finance-types/` are mirrored into `service/` and
  `agent/` so the three surfaces can never drift apart.

### 6. Clean sweep
A lightweight sweep lands separately from feature work (branch
`chore/*`), keeping the tree tidy and CI green between milestones.

## Contracts (Sepolia)

- `AegisRegistry.sol` — ENSv2 wrapper: mint/revoke/renew agent subnames,
  stores expiry, emits events for indexers. Best-effort ENS mirror is
  try/catch-guarded and skipped in mock mode (ENS addresses unset), so local
  state never bricks on a Sepolia revert.
- `RiskGuard.sol` — `authorize(action, riskScore)` reverts if identity
  invalid or score too high. The gate every act passes.
- `TaskEscrow.sol` — mandate settlement (EIP-712, type string LOCKED, see
  `MANDATE.md`); release needs validator score ≥ threshold **and** a live
  identity re-check, in the same transaction; miss → refund with evidence.
- `AegisHook.sol` — Uniswap v4 hook (non-breaking integration path).
- Finance primitives (`finance/`, `collateral/`, `gold/`) as in Flow 5.

## Services

- `service/` — Express + `@x402/express` resource server: paid `/v1/signal`
  + `/v1/score` (Blocky402 facilitator), free `/v1/finance*`,
  `/v1/receipts`, `/health`, `/402-info`. Receipts file-backed
  (`service/data/receipts.json`, last 100).
- `agent/` — MCP client, ENS viem resolver, reasoning engine (pluggable LLM),
  x402/fetch payer, CLI + API. Revoke CLI: `aegis revoke --label <sublabel>`
  (human owner key).

## Data ownership

| Data | Where it lives | Rule |
|---|---|---|
| Account identity, embedded wallet, sessions | Privy (self-custodial) | The product never stores private keys; vault stores public addresses + receipts only |
| Hires, listed agents, treasure | Frontend vault keyed to Privy user id | Guest `localStorage` migrates into the vault on first sign-in |
| Community-finance demo | Service `v1/finance*` (deterministic, address-seeded) | Simulated — `execute()` throws; labeled **simulated** in UI |
| Mandates + escrow state | Sepolia contracts | Durable truth; registry view + event index |
| Payment audit | Hedera (x402 facilitator + HCS topic) | Best-effort, linkable via HashScan |

The rule of thumb: **localStorage / demo = ephemeral and clearly simulated;
Sepolia + Hedera = durable truth.** When a screen shows demo data it must say
so.

## Prize mapping

- The Graph AI From Scratch: live Subgraph MCP queries + reasoning +
  SKILL.md/README runnable.
- ENS Best Use: hierarchical subnames, wildcard, permissioned resolver,
  access control, expiring/revocable — central to auth.
- Hedera x402: live Blocky402-gated service on testnet, real paid request,
  README payment flow, ≤5min video.

Narrative for the 5-minute demo: `docs/VIDEO_SCRIPT.md`.

## Ownership rules

- `contracts/` = protocol truth; every semantic lives in Solidity, mirrored
  only as types into TS surfaces.
- `agent/` owns only `agent/`; `service/` only `service/`; `frontend/` only
  `frontend/` (each package README states this).
- Shared finance types start in `frontend/finance-types/` and are copied into
  `service/` + `agent/` — never edited in two places at once.
- When addresses/routes/commands change: update `docs/REFERENCE.md` in the
  same change.

## Frontend (why it's built that way)

Next.js 14 App Router + TypeScript + plain CSS with a **Colosseum-inspired
paper theme** (`frontend/app/globals.css`): paper background, ink
`#1c1b18`, accent crimson `#c01010`, Newsreader serif display, `border-radius: 0`
throughout — a clean, minimal, uncluttered grammar (never pill-y, never
experimental). Every onchain/RPC/service failure degrades to demo-known values
+ "connect" hints rather than crashing. The homepage is user-facing: stats are
product proof (escrows, payments, identities), never internal metrics.