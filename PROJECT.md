# Project: Varanasi Product Integration

## Architecture
Varanasi is a high-assurance agentic commerce and enforcement rail connecting decentralized AI agents, smart contracts, and real-time risk/signal infrastructure:
1. **Smart Contracts (`contracts/`)**:
   - Solidity 0.8.26 via IR, Foundry.
   - Deployed on Sepolia (Chain ID 11155111):
     - `TaskEscrow`: `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24` (EIP-712 mandate-gated ERC20 escrow with inline RiskGuard validation check).
     - `AegisRegistry`: `0x3913f1E6A0Be93180363aBd01Df7968d494033A8` (ENSv2-backed agent identity registry `*.aegis.eth`).
     - `RiskGuard`: `0x668c01aE564D51baFF0029D361c20c534d738400` (Identity status & quality score authorization gate).
     - `AegisHook`: `0x05043B527D67d7E4e3a2ed411fFBD15b8255c080` (Uniswap v4 `beforeSwap` hook).
     - `MockERC20` (vUSD): `0x6169A84cD7430042fb697c2cC131F663212E8b30` (Demo settlement currency, 6 decimals).
2. **Backend Service (`service/`)**:
   - Express 5.2.1 TypeScript on port 4021.
   - x402 payment middleware on Hedera testnet for paid routes (`POST /v1/signal`, `POST /v1/score`).
   - Free routes: `GET /health`, `GET /402-info`, `GET /v1/receipts`.
   - Data store: `service/data/receipts.json` + Hedera Consensus Service audit topic (`HCS_TOPIC_ID`).
3. **Agent Automation (`agent/`)**:
   - TypeScript CLI (`aegis`) with Commander and Viem.
   - Workers: `scout.ts` (pool discovery & alpha purchase), `analyst.ts` (risk scoring), `freelancer.ts` (validation & escrow settlement).
   - Subcommands: `analyze`, `revoke`, `mandate`, `doctor`, `discover`, `hire`, `lending`.
4. **Frontend (`frontend/`)**:
   - Next.js 14 App Router, React 18.3.1, `@privy-io/react-auth`, Viem.
   - Colosseum design system adapted from secondary workspace `grok-workspace` (`Newsreader` serif, `#1c1b18` iron ink, `#f3f2ee` warm paper, `#c01010` Roman crimson, 0px radius, diamond glyphs, custom plates).
   - Real Web3 integrations: Privy embedded self-custodial Sepolia wallets, Viem contract calls, EIP-712 mandate signing, backend signal fetching.
   - Pages: `/` (Home), `/activity`, `/agents`, `/hire`, `/account`, `/human`, `/mandate`, `/proof`, `/privy` (Treasury).
5. **E2E Testing & Browser Harness**:
   - Playwright headless runner with Chromium headless shell using `--single-process --no-sandbox --disable-gpu`.
   - Zero console error enforcement and multi-tier validation.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | TaskEscrow 14-field ABI Synchronization | Update ABI in frontend and agent from 12 to 14 outputs to match contract `Task` struct and map `state` to index 13 | M1, M2 | Survey (Explorer 3) |
| F2 | Backend & Agent Port Alignment | Update fallback `SIGNAL_URL` from 3001 to 4021 in `agent/src/pay.ts`, `doctor.ts`, and `.env.example` | M1 | Survey (Explorer 1) |
| F3 | Agent Test Runner Sandboxing Config | Add `agent/vitest.config.ts` to suppress upward PostCSS searches and allow all 132 tests to pass | M1 | Survey (Explorer 3) |
| F4 | Backend Service CORS Alignment | Configure Express service in `service/src/server.ts` to cleanly accept requests from `http://localhost:3000` | M1 | Survey (Explorer 3) |
| F5 | Frontend Next.js Offline Font Config | Set `optimizeFonts: false` in `frontend/next.config.js` to avoid build hangs | M2 | Survey (Explorer 3) |
| F6 | Frontend Tailwind & Utility Infrastructure | Install and configure Tailwind v3.4, PostCSS, Autoprefixer, `clsx`, `tailwind-merge`, `lucide-react`, and Colosseum theme tokens in `frontend/` | M2 | Survey (Explorer 2) |
| F7 | Colosseum Design Primitives Migration | Port `Diamond`, `Badge`, `BrandButton`, `DisplayHeading`, `PageHero`, `SectionSep`, and `SiteShell` from `grok-workspace` | M3 | Survey (Explorer 2) |
| F8 | SiteShell Navigation & Root Layout | Wrap application in `<SiteShell>` with sticky navigation, diamond separators, Privy auth button, and 4-column footer | M3 | Survey (Explorer 2) |
| F9 | Colosseum Modular Homepage Integration | Reorganize `app/page.tsx` with Roman arena hero, live stats grid, HowItWorks, Gallery, AgentMarket, and PrinciplesGrid | M3 | Survey (Explorer 2) |
| F10 | Dedicated `/activity`, `/agents`, `/hire` Routes | Create dedicated routes housing `PoolIntel`/`SignalPanel`, agent catalog, and 4-step `HireWizard` | M3 | Survey (Explorer 2) |
| F11 | Web3 & API Engine Preservation | Preserve 100% of real Viem/Privy contract execution, EIP-712 mandate signing, and backend signal calls in UI | M2, M3 | Survey (Explorer 2) |
| F12 | Secondary Pages Polishing | Polish `/account`, `/human`, `/mandate`, `/proof`, `/about`, and `/privy` with Colosseum aesthetics | M3 | Survey (Explorer 2) |
| F13 | Opaque-Box E2E Test Suite Creation | Design and build comprehensive multi-tier E2E test suite (Tiers 1-4) derived from user requirements | E2E Testing Track | Survey (Explorer 3) |
| F14 | 100% E2E Test Suite Pass | Execute all E2E test cases across the integrated stack ensuring all user journeys pass | M4 (Phase 1) | ORIGINAL_REQUEST |
| F15 | Adversarial Coverage Hardening | White-box edge case testing, zero console errors, stress testing via Challenger | M4 (Phase 2) | ORIGINAL_REQUEST |
| F16 | Security & Secrets Management | Ensure 0 credential leaks in git, mode 600 on `.env` files, and external AES-256-CBC PBKDF2 encryption | M1, M4 | ORIGINAL_REQUEST (R4) |
| F17 | Git Repository Commit | Cleanly commit all verified integration changes to local git repository | M4 | ORIGINAL_REQUEST |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend & Agent Wiring, Config & Test Fixes | Fix `SIGNAL_URL` fallback (3001->4021), fix `TASK_ESCROW_ABI` in `agent/src/escrow.ts` (14 fields), add `agent/vitest.config.ts`, align CORS in `service/src/server.ts`, verify tests pass | none | DONE |
| M2 | Frontend Core Wiring, Bug Fixes & Infrastructure | Fix `ESCROW_ABI` in `frontend/components/HireWizard.tsx` (14 fields), configure `frontend/next.config.js`, install Tailwind v3.4 + PostCSS with Colosseum tokens, setup `lib/utils.ts` and `app/globals.css` | none | DONE |
| M3 | Frontend Colosseum Design & Grok-Workspace Integration | Port UI primitives (`SiteShell`, `DisplayHeading`, `BrandButton`, `Badge`, `PageHero`, `SectionSep`, `Diamond`), update `layout.tsx` and `page.tsx`, create `/activity`, `/agents`, `/hire`, polish secondary pages, verify Web3 preservation and clean build | M2 | DONE |
| M4 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Phase 1: Pass 100% of E2E test suite (Tiers 1-4). Phase 2: Adversarial coverage hardening (Tier 5), zero console errors, Gitleaks audit, and git commit | M1, M3, E2E Test Suite | DONE |

*Parallel Track:*
- **E2E Testing Track**: E2E Testing Orchestrator builds requirement-driven test infrastructure and Tiers 1-4 test suite, publishing `TEST_READY.md`.

---

## Interface Contracts
### Frontend (`varanasi/frontend`) ↔ Backend Service (`varanasi/service`)
- **Base URL**: `http://localhost:4021` (configured via `NEXT_PUBLIC_SIGNAL_URL`)
- **Endpoints**:
  - `GET /health` -> `{ status: "ok", service: "aegis-signal", port: 4021, network: "testnet", ... }`
  - `GET /v1/receipts` -> `{ count: number, receipts: Receipt[] }`
  - `POST /v1/signal` -> Headers: x402 payment headers or Hedera auth; Body: `{ query: string, symbol?: string }` -> `{ signal: string, confidence: number, features: object, txHint: string, receipt: Receipt }`
  - `POST /v1/score` -> Body: `{ pool: string, turnover24h?: number }` -> `{ riskScore: number, riskBand: string, factors: object, receipt: Receipt }`
- **CORS**: Allows `http://localhost:3000` with standard HTTP headers (`Content-Type`, `X-402-Payment`, etc.).

### Frontend (`varanasi/frontend`) ↔ Smart Contracts (`varanasi/contracts`)
- **Network**: Sepolia (Chain ID `11155111`)
- **RPC URL**: Configured via `NEXT_PUBLIC_SEPOLIA_RPC_URL` (fallback to public Sepolia RPC)
- **Addresses**:
  - `TaskEscrow`: `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24`
  - `AegisRegistry`: `0x3913f1E6A0Be93180363aBd01Df7968d494033A8`
  - `MockERC20` (vUSD): `0x6169A84cD7430042fb697c2cC131F663212E8b30`
- **Task Tuple (14 fields)**:
  - `tasks(bytes32 taskId)` returns:
    `[payer(address), agent(address), merchant(address), token(address), cap(uint256), fundedAmount(uint256), windowStart(uint64), windowEnd(uint64), expiry(uint64), scoreBps(uint256), validator(address), pinnedThresholdBps(uint256), pinnedValidator(address), state(uint8)]`
  - `State` enum: `0: None`, `1: Funded`, `2: Validated`, `3: Released`, `4: Refunded`, `5: Cancelled`
- **Mandate EIP-712**:
  - Domain: `{ name: "VaranasiTaskEscrow", version: "1", chainId: 11155111, verifyingContract: "0xb5D4..." }` (matches `TaskEscrow.sol` EIP712 constructor and `agent/src/mandate.ts`)
  - Type: `Mandate(address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)`

### Agent (`varanasi/agent`) ↔ Backend Service & Contracts
- **Signal Endpoint**: Default fallback `http://localhost:4021/v1/signal`
- **Contract Calls**: Uses same verified Sepolia addresses and 14-field `tasks` ABI mapping.

---

## Code Layout
- `contracts/`: Smart contracts, Foundry build & tests.
- `service/`: Express backend, x402 payment, HCS logging. Owned by M1.
- `agent/`: TypeScript CLI, agent workers, Vitest tests. Owned by M1.
- `frontend/`: Next.js 14 web application, components, styles, routes. Owned by M2 (infrastructure & core ABI) and M3 (UI/UX & Colosseum design).
- `e2e/`: End-to-end test suite and browser test runners. Owned by E2E Testing Track.
- `.agents/`: Agent orchestration metadata ONLY.
