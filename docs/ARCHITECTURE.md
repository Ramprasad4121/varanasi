# Architecture — varanasi

Author: Ramprasad · The rail in one page; specs in `MANDATE.md` · `AKSHAYA.md` · `GHATSTREAM.md`.

## Thesis

Agentic commerce fails at the money layer: keys, session tokens, standing
approvals — anything the agent can spend *beyond* what was agreed. Varanasi
makes over-spend structurally impossible by moving every check to the
transaction that moves value. Four primitives, one rail:

```
 Human                    Agent                  Chain (Sepolia)                     Settlement
┌──────────┐   sign    ┌──────────┐   call    ┌───────────────────────────────┐   ┌────────────┐
│ frontend │ ────────► │  aegis   │ ────────► │ TaskEscrow ──► RiskGuard      │ ◄─┤ validator  │
│ /hire    │  mandate  │  CLI     │  reads    │    ▲                ▲         │   │ score ≥ θ  │
└──────────┘           └────┬─────┘           │  Akshaya      AegisRegistry   │   └────────────┘
                          │ pay (x402)        │  (soulbound,   (ENSv2 names,  │
                          ▼                   │   decayed)      revocable)    │
                    ┌──────────┐              │  GhatStream ── same gate      │
                    │ service  │              └───────────────────────────────┘
                    │ :4021    │                 hedera testnet (USDC/HBAR)
                    └──────────┘
```

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

- **`TaskEscrow`** — the mandate rail. Payer signs an EIP-712 `Mandate`
  (agent, merchant, token, cap, window, expiry, nonce). `fund` pulls exactly
  `cap` and nullifies the nonce; `taskId = keccak(digest)` makes replay
  structurally impossible. `submitValidation` pins score; `release` requires
  `score ≥ threshold` **re-checked live** (guard + registry), CEI,
  reentrancy-guarded. `refund`/`cancel` close the loop after expiry.
- **`AegisRegistry`** — revocable identity. One live ENSv2 subname per wallet,
  expiring (`≤ 1825d`), revoke clears lookup mappings (label freed for
  re-mint). Mock mode (`ens == address(0)`) makes the entire test suite
  runnable offline.
- **`RiskGuard`** — stateless gate: `authorize(agent, riskBps, maxBps)` = live
  identity ∧ risk bound. Called *inline* by both settlement rails — never
  cached, so the kill switch has instant effect on new value movement.
- **`Akshaya`** — reputation as a fold over settled outcomes (see
  `AKSHAYA.md`). No admin, no oracle; escrow state is the only input.
- **`GhatStream`** — the same mandate discipline for *time* instead of
  deliverables (see `GHATSTREAM.md`): per-second accrual, payer stop-cock,
  remainder always returns.

`src/lib/` (all zero-dep, audited in-tree): `EIP712` (domain separator with
EIP-712 salt fallback), `ECDSA` (65-byte, v∈{27,28}, low-s enforced),
`SafeERC20` (return-data-checked calls, no `transfer`), `IERC20`,
`ReentrancyGuard`. The repo's *only* external dep is `forge-std` (tests).

## Data-flow rules

1. Anything with money attached is keyed by `keccak(signed digest)` and
   carries a per-signer `usedNonce` nullifier (both escrow and streams) —
   exactly one chain state per signature.
2. Every transition is externally callable by an *incentivized* party
   (agent wants release/claim; anyone can attest/close) — contracts never
   self-schedule.
3. Reads are free: `accruedOf/taskState/scoreOf/statsOf` are total functions;
   indexers reconstruct history from events only.
4. The frontend and service read the chain; the chain never reads them.

## Verification

| Layer | Harness | What it proves |
|---|---|---|
| Foundry | `contracts/test/{TaskEscrow,Aegis,Akshaya,GhatStream}.t.sol` | Locked matrix T1–T20: replay, tamper, windows, fee-on-transfer accounting, reentrancy probe, decay arithmetic, soulbound refusal, stream conservation, kill-switch gating |
| Real EVM (no forge needed) | solc-js `--ir` compile → `@ethereumjs/vm` deploy → drive with **viem**-signed txs; TS-side digest must equal `mandateDigest()` onchain | Bytecode behavior on an actual EVM incl. cross-implementation EIP-712 parity; 48 checks green incl. the two "gotcha" regressions (tuple-decode off-by-one, journal-cache staleness after revert) |
| Agent/service | vitest (156, mocked viem/fetch) + `node --test` adversarial HTTP harness | No network or keys in CI; signing/verification parity client-side |
| Frontend | `next build` (14 static routes incl. `/finance`) | Degrades gracefully with zero env keys |
| Secrets | gitleaks in CI | `.env*` never committed (pattern enforced, not assumed) |

## Failure model (who loses what, when everything goes wrong)

| Failure | Consequence |
|---|---|
| Agent misbehaves mid-window | Payer revokes identity → release path blocked at guard → funds refundable at expiry. Streams: `stop()` freezes meter at that second. |
| Validator silent | No release (score < bar or absent); refund after expiry. Streams don't need validators — the meter is the verdict. |
| Payer ghosts a stream | `expiry` + `close()` by anyone; agent's accrued claimable forever; remainder to payer's wallet. |
| Reputation attacker | `attest` costs nothing but pays nothing: coins require capital that actually left an escrow to a merchant. |
| Registry ENS layer down | Mock/off-chain `isAuthorized` path still governs settlement (registry is source of truth for its own mappings). |

## What is deliberately NOT here

No DEX pool hooks anymore (the v4 experiment retired — enforcement at
settlement subsumes it), no DB, no admin panels, no upgradeable proxies, no
oracles beyond the explicit validator allowlist. Every "nice to have" in this
repo either gates money or isn't in the repo.

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
- `Akshaya.sol` + `GhatStream.sol` — reputation fold + continuous escrow (specs in `docs/AKSHAYA.md` / `docs/GHATSTREAM.md`; details in Thesis above).
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
