# 05 · Testing & Quality Strategy — varanasi

Author: Ramprasad · 2026-09-11

Sources: `TEST_INFRA.md`, `TEST_READY.md`, `e2e/runner.py`. This document is
the durable strategy; those remain the execution record.

## 1. Philosophy

- **Opaque-box where it matters**: E2E cases are derived from user-facing
  requirements, not implementation details, so refactors don't invalidate them.
- **White-box where it's dangerous**: boundary/adversarial tests target the
  known edges (uint64/uint256 bounds, empty inputs, replay paths).
- **Zero-tolerance UX floor**: any console error on any route fails the suite.
- **CI without secrets**: the entire matrix must pass on a clean checkout with
  zero `.env` — proving anyone can clone and build.
- **Proof over process**: the strongest test artifacts are onchain tx hashes
  and mirror-node receipts (`docs/DEMO.md`), which survive the repo.

## 2. The test pyramid

| Tier | Scope | Tooling | Count | Runs |
|---|---|---|---|---|
| Unit (contracts) | Invariants, revert paths, math, access control | Foundry `forge test` (solc 0.8.26, via-IR) | suite in `contracts/test/` | CI, every push |
| Unit (agent) | Signing, resolution, parsing, tiers, reasoning, workers | Vitest, mocked fetch | **153** | CI + local (153/153 verified 2026-09-11) |
| Type/build | Compile gates across TS packages | `tsc --noEmit`, `next build` | 4 packages | CI |
| E2E Tier 1 | Feature isolation (ABI shape, ports, CORS, env contracts) | Python unittest, static | 48 | `./run_e2e.sh --tier 1` (48/48 local 2026-09-11) |
| E2E Tier 2 | Boundary & corner (extreme values, empty inputs) | Python unittest | 30 | (30/30 local 2026-09-11) |
| E2E Tier 3 | Cross-feature combinations (pairwise cross-stack) | Python unittest | 28 | (28/28 local 2026-09-11) |
| E2E Tier 4 | Real-world journeys on all 9 routes | Playwright headless Chromium (`--single-process --no-sandbox --disable-gpu`), zero-console-error policy | 28 | Needs booted stack; last full pass recorded in `TEST_READY.md` |
| E2E Tier 5 | Adversarial hardening (challenge-derived edge cases) | Mixed | case-by-case | Pre-release gate |

## 3. Quality gates (merge & release)

Merge to `main`: CI matrix green (contracts + agent + service + frontend +
gitleaks).
Release candidate: Tiers 1–5 pass on staging; `forge test` on a fresh fork
with `SEPOLIA_RPC_URL` (fork tests) where available; demo evidence refreshed
(`docs/DEMO.md` links must resolve).
Mainnet: the security gates in `03-security-architecture.md` §5 in addition.

## 4. What each layer uniquely catches

- **Foundry**: reentrancy ordering, EIP-712 recovery mismatches, CEI
  violations, `ExpiryTooLong`/`LabelInvalid` regressions from v2 hardening.
- **Vitest (agent)**: mandate field locking (domain name/version/type string),
  ABI 14-field parity, port fallbacks (4021), tier policy (`tierFor` fails
  closed), spam-TVL curation, x402 retry shape, worker orchestration.
- **E2E tiers**: drift between docs ↔ agent ↔ service ↔ frontend (the class
  of bug that broke port 3001→4021 and the 12→14 field ABI historically).
- **Playwright tier 4**: real browser console errors, real route rendering,
  real user journey (sign-in → hire → fund → watch states).
- **Adversarial tier 5**: white-box edge cases proposed by a hostile reviewer
  (the "Challenger" role in `TEST_INFRA.md`).

## 5. Non-functional testing

- Performance: load gate before production (`04-infrastructure.md` §6).
- Accessibility & UX: zero-console-error + route smoke as floor; design QA
  per release (Colosseum system).
- Security: gitleaks (full history), dependency review via Dependabot,
  audits + bounty for contracts (program in `company/12-security-trust.md`).

## 6. Test debt (honest list)

1. Tier 4 requires a booted multi-process stack — needs a CI-side compose
   job for hands-free full passes.
2. Fork tests self-skip without `SEPOLIA_RPC_URL` — a dedicated
   secrets-bearing nightly job would exercise them.
3. Invariant/fuzz suites for escrow state machine (e.g., "funds conserved:
  fundedAmount = released + refunded") are designed but not yet written —
  on the pre-mainnet checklist.
4. Service has no dedicated runtime test suite beyond typecheck/build + E2E
  tiers hitting its contracts.
