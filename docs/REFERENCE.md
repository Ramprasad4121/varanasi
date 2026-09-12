# Reference — varanasi registry of facts

Author: Ramprasad

The single registry of exact facts: addresses, ports, env variables, commands,
tests, CI. **When any of these change in code, update this file in the same
change.** Verified 2026-09.

## 1. Repo layout

| Path | Surface | Stack |
|---|---|---|
| `contracts/` | Sepolia protocol | Foundry (Solidity, OpenZeppelin 5.0.2) |
| `agent/` | Decision engine + CLI | TypeScript, vitest |
| `service/` | x402-paid alpha + finance APIs | Express + TypeScript, node:test |
| `frontend/` | Marketplace web app | Next.js 14 App Router + TS + plain CSS |
| `frontend/finance-types/` | Shared finance types (source of truth) | TS, `package.json` |
| `cre/` | Confidential risk workflow (research) | — |
| `bazantic/` | Gateway + recipe (research) | — |
| `e2e/`, `TEST_INFRA.md`, `TEST_READY.md`, `run_e2e.sh` | E2E harness | Playwright-style |
| `docs/` | Documentation (this set) | Markdown |

Monorepo: **no root `package.json`** — every package self-owns deps.

## 2. Ports

| Port | Service | Notes |
|---|---|---|
| `3000` | Next.js dev server | `./run.sh` boots this |
| `3001` | Next.js prod preview | after `next build && next start` |
| `4021` | Service (Express signal + finance) | `./run.sh` boots this; `/health` at `GET :4021/health` |

## 3. Deployed contracts (Sepolia, mainnet-real addresses)

Source of truth: `frontend/lib/site.ts` and `agent/src/erc8004.ts`.

| Contract | Address | Role |
|---|---|---|
| `TaskEscrow` | `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24` | Mandate settlement. LOCKED typehash — see `docs/MANDATE.md`. |
| `AegisRegistry` | `0x3913f1E6A0Be93180363aBd01Df7968d494033A8` | Mint/revoke/renew agent subnames. |
| `RiskGuard` | `0x668c01aE564D51baFF0029D361c20c534d738400` | `authorize(action, riskScore)` gate. |
| `AegisHook` | `0x05043B527D67d7E4e3a2ed411fFBD15b8255c080` | Uniswap v4 hook wiring. |
| `MockERC20` (vUSD) | `0x6169A84cD7430042fb697c2cC131F663212E8b30` | Demo stable token (simulated). |

Canonical ERC-8004 registries (read-only; no code at these on Sepolia — see
`agent/src/erc8004.ts`): IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`,
ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.

Finance contracts (`SavingsVault`, `ChitPool`, `LoanAgreement`, `CollateralVault`,
`FinancialReputation`, `GoldRegistry`) are **not deployed** — demo state is
address-seeded and simulated; agent `execute()` throws until they go live.

ENSv2 Sepolia wiring table lives in `contracts/README.md` (registry/resolver/
UR-proxy addresses as deployed by `Deploy.s.sol` defaults).

## 4. Env variables — exact shapes

See `.env.example` in each package for the full annotated copy.

### service/.env
`HEDERA_SERVICE_ACCOUNT_ID` (0.0.XXXXXX, the receiver), `HEDERA_SERVICE_PRIVATE_KEY`
(local tooling only — the service NEVER signs at runtime; facilitator settles),
`HEDERA_NETWORK` (testnet default), `X402_FACILITATOR_URL` (default
`https://x402.org/facilitator`),
`PORT` (4021), `CORS_ORIGIN` (comma-separated allowlist; unset = `*` in dev,
same-origin in prod), `NODE_ENV`, `HCS_ENABLED` (1), `HCS_TOPIC_ID` (empty →
auto-create on first paid request; persist the printed id).

### agent/.env
`GRAPH_API_KEY` (Subgraph Studio key — live Gateway), optional
`GRAPH_UNISWAP_V3_ID`, `SEPOLIA_RPC_URL` (default `https://rpc.sepolia.org`),
`AEGIS_REGISTRY`, `RISK_GUARD`, optional `ENSV2_UNIVERSAL_RESOLVER` (default
`0x4a1817D13E9cF196F471725176355C1234b63C70`),
`HEDERA_NETWORK=testnet`, `HEDERA_AGENT_ACCOUNT_ID`,
`HEDERA_AGENT_PRIVATE_KEY` (ED25519), `SIGNAL_URL`
(`http://localhost:4021/v1/signal`).

### frontend/.env.local
`NEXT_PUBLIC_SEPOLIA_RPC`, `NEXT_PUBLIC_AEGIS_REGISTRY`,
`NEXT_PUBLIC_SIGNAL_URL`, `NEXT_PUBLIC_GRAPH_API_KEY` (optional),
`NEXT_PUBLIC_PRIVY_APP_ID` (from dashboard.privy.io — required for Sign in).
Only `NEXT_PUBLIC_`/`VITE_`-prefixed vars reach browsers.

### Secrets files
Live secrets in gitignored `.env` / `.env.local` (chmod 600). Encrypted twins
`.env.enc` committed; key at `~/.config/varanasi/.enc-key` (600). Full
procedure: `docs/KEYS.md`.

## 5. Service routes

| Route | Paid? | Returns |
|---|---|---|
| `POST /v1/signal` | **$0.01** USDC/HBAR | `{signal, confidence, features, txHint}` + `receipt` |
| `POST /v1/score` | **$0.001** USDC/HBAR | `{riskScore, riskBand, factors}` + `receipt` |
| `GET /v1/finance?address=0x…` | free | demo portfolio (Savings, Chit, Loan, Collateral, Gold, Score) |
| `GET /v1/finance/summary` | free | same, forced summary |
| `GET /v1/finance/recommend?address=0x…` | free | demo agent recommendations |
| `GET /v1/receipts` | free | receipt log (file-backed, last 100) |
| `GET /health` | free | status |
| `GET /402-info` | free | payment preview |

## 6. Test matrix (verified passing, CI-blue)

| Suite | Command (inside dir) | Result |
|---|---|---|
| Contracts (Foundry) | `forge test` | **166** tests / 10 suites — offline (mock ENS), fork tests skip w/o `SEPOLIA_RPC_URL` |
| Agent (vitest) | `npm test` (`vitest run`) | **162** tests / 17 files — mocked fetch, no live wallet |
| Service (node:test) | `npm test` (`tsx --test`) | **5** tests |

Of the 333: community finance = 54 forge (SavingsVault 9, ChitPool 7,
LoanAgreement 10, CollateralVault 10, FinancialReputation 9, Gold 9)
+ 9 agent finance + 5 service finance = 68 finance-aware tests.

Frontend gates: `npm run typecheck` (`tsc --noEmit`; target ES2017 → **BigInt
literals banned**, use `BigInt(...)`) and `npm run build` (`next build`, must
pass with zero env).

## 7. CI (`.github/workflows/ci.yml`)

On push to `main` + every PR. `main` is PR-protected; 5 required checks:

| Check | Job | Runs |
|---|---|---|
| contracts (forge build + test) | force test | build + 166 tests |
| agent (typecheck + tests) | tsc + vitest | 162 tests |
| service (typecheck + build) | tsc + build | — |
| frontend (typecheck + build) | tsc + next build | no-env build |
| secrets scan (gitleaks) | gitleaks-action v3 | full-history secret scan |

Node 24 everywhere. Contracts submodules must be checked out (`submodules:
recursive`). CI has zero secrets by design — suites must pass without them.

## 8. Frontend user-facing pages

`/` (marketplace + stats), `/hire`, `/agents`, `/account`, `/privy`,
`/finance`, `/mandate`, `/about`, `/activity`, `/proof`, `/human`.
Homepage stats are user-facing only — no test/CI counts (see `AGENTS.md`).

## 9. Go-fast commands

```bash
./run.sh            # service :4021 + web :3000 + health-wait
./run.sh agent      # one live loop  (fires a real $0.01 x402 — only when asked)
./run.sh stop       # kill both

# quick typecheck across the tree
(cd contracts && forge build >/dev/null) \
 && (cd agent && npm run typecheck) \
 && (cd service && npm run typecheck) \
 && (cd frontend && npm run typecheck)
```