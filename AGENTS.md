# AGENTS.md — varanasi orientation for AI agents

Author: Ramprasad

Cross-package handoff notes for coding agents (and humans in a hurry). If you
are about to edit code, read the doc(s) this file points to first. Facts here
are verified against the repo — if a number looks stale, fix it rather than
"patching around" it.

## 1. What varanasi is, in three sentences

varanasi is an **enforcement rail for agentic commerce**: a human signs an
EIP-712 **mandate** (cap, window, expiry, nonce), funds lock in a
`TaskEscrow`, an agent works inside those bounds, and a validator releases
payment only when the work clears the bar — or the human is refunded.

It is a **community product** (not a hackathon demo): people, AI agents, and
DAOs use it through the website (accounts via Privy; Vercel-deployed). Four
surfaces ship together: `contracts/` (Sepolia), `agent/` (TS decision engine),
`service/` (x402-paid alpha API), and `frontend/` (Next.js app). The fifth
surface, `frontend/finance-types/`, holds shared community-finance types that
`service/` and `agent/` mirror from.

The site is user-facing. The homepage never shows internal engineering
metrics (test counts, CI status). Those live in docs and this file.

## 2. Orientation — topic → file

| Topic | File |
|---|---|
| Product pitch, setup, FAQ | `README.md` |
| This file (how to work here) | `AGENTS.md` |
| Full workflow, mandates, settlement | `docs/MANDATE.md` |
| Architecture, flows, contracts, data ownership | `docs/ARCHITECTURE.md` |
| Registry of facts: addresses, ports, env, commands, tests | `docs/REFERENCE.md` |
| Term definitions (mandate, x402, vUSD…) | `docs/GLOSSARY.md` |
| Guided first run (human path) | `docs/TUTORIAL.md` |
| Goal-oriented recipes (deploy, add rail, wire Privy…) | `docs/HOWTO.md` |
| Onchain proof / evidence | `docs/DEMO.md` |
| Security review | `docs/SECURITY_REVIEW.md` |
| Secrets management (keys, `.env.enc`) | `docs/KEYS.md` |
| Agent prompt (paste into any coding agent) | `PROMPT.md` |
| Smart-contract work (Foundry) | `contracts/README.md` |
| Agent engine work (TypeScript) | `agent/README.md` |
| Signal service work (Express) | `service/README.md` |
| Web app work (Next.js) | `frontend/README.md` |
| E2E harness | `TEST_INFRA.md`, `TEST_READY.md`, `run_e2e.sh` |

## 3. Commands (exact, verified)

Per-package; run inside the package directory. Node 24 required.

### contracts/ (Foundry — Node not used)
```bash
cd contracts
forge build            # offline-safe, git submodules (forge-std, v4-core, v4-periphery)
forge test             # 166 tests / 10 suites, fully offline (mock ENS: zero network)
```
Sepolia RPC comes from `$SEPOLIA_RPC_URL` (`foundry.toml`); fork tests skip when unset.

### agent/ (TypeScript)
```bash
cd agent
npm install            # or npm ci
npm run typecheck      # tsc --noEmit
npm test               # vitest run — 162 tests / 17 files (mocked fetch, no live keys)
npm run build          # tsc -> dist
```

### service/ (Express + TypeScript)
```bash
cd service
npm install
npm run dev            # tsx watch src/server.ts on :4021
npm run typecheck      # tsc --noEmit
npm run build          # tsc -> dist
npm test               # tsx --test — 5 tests (finance + receipts), no keys needed
```

### frontend/ (Next.js 14 App Router)
```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
npm run typecheck      # tsc --noEmit  — NOTE: tsconfig target ES2017 → BigInt LITERALS are banned; use BigInt(...) constructor
npm run build          # next build (must pass with zero NEXT_PUBLIC_* env — CI proves it)
npm run start          # prod preview :3001 (after build)
```

### Boot everything (root)
```bash
./run.sh               # service :4021 + web :3000, then curl /health + / until up
./run.sh stop          # kills both
./run.sh agent         # full live agent loop once (ENS → Graph → x402 → verdict)
```

## 4. Conventions (never guess these)

- **Branch rules:** `main` is protected — PRs required, 5 status checks must
  pass (contracts/agent/service/frontend/gitleaks). Work on a feature branch
  and merge via PR. Never force-push to main.
- **Identity:** every authored file carries `Author: Ramprasad` on line 2
  (after a title line). Respect existing ones; add yours to new files.
- **PROMPT:** the agent prompt lives in `PROMPT.md` ONLY. README links to it;
  it is never inlined into README.
- **Secrets:** never commit `.env` (all gitignored, chmod 600). Encrypted
  twins `.env.enc` are committed; the key lives outside the repo at
  `~/.config/varanasi/.enc-key`. See `docs/KEYS.md`.
- **gitleaks** scans every PR. No secrets, no hard-coded keys, no fake
  `ghp_*`/`0x...private` strings that match the allow-list gap.
- **Finance demo rule:** `/v1/finance*` + `/finance` are **simulated** and
  labeled as such; `agent/src/finance/finance.ts::execute()` **throws** until
  the finance contracts are deployed, so demo state never broadcasts.
- **Deployed-env degrades:** no `NEXT_PUBLIC_*` keys in CI by design —
  pages show "setup notices". Do NOT require env to build/test.
- **Test parity:** keep tests green locally the same way CI proves it —
  offline-safe (mock SOLIDITY ENS, mocked fetch, no live wallet).

## 5. Never do

- **Never bind/point** docs at non-existent assets; verify addresses/ports
  against `docs/REFERENCE.md` before writing them anywhere.
- **Never run the live agent loop** (`run.sh agent`, `aegis analyze` without
  `--skip-pay`) unless the user asks — it spends a real $0.01 x402 payment.
- **Never write `.env`**; the platform injects `DATABASE_URL` + auth creds on
  deploy. Only `VITE_`-/`NEXT_PUBLIC_`-prefixed vars reach browsers.
- **Never delete/rename** `contracts/lib/` submodules, `frontend/public/`,
  `service/data/`, `run.sh`, or `AGENTS.md`.
- **Never restyle/remove** the "Created with Grok" pill or its script in the
  frontend shell.

## 6. When editing, which file owns what

| You are changing… | Respect the source of truth in |
|---|---|
| Mandate shape / settlement | `docs/MANDATE.md` (type string is LOCKED) |
| Contract behavior | `contracts/src/**` + forge tests (mirror in `docs/ARCHITECTURE.md`) |
| Shared finance types | `frontend/finance-types/` (mirrored into `service/` + `agent/` — keep in sync) |
| Site copy/stats | `frontend/lib/site.ts` + `frontend/app/page.tsx` — user-facing only |
| Routes | `service/src/server.ts` (list at `:4021/v1/...`) |
| Agent CLI | `agent/src/cli.ts` |

Read the target surface's README before its first edit. When a change alters
an address, a route, a command, or a test count, update `docs/REFERENCE.md`
in the same change.