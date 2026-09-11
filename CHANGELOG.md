# Changelog

All notable changes to **varanasi** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project abides by
[SemVer](https://semver.org/), with the contracts' wire format (EIP-712
domains, typehashes, ABIs) as the public API.

## [Unreleased] — 2026-09-11

### Added
- **Akshaya** (`contracts/src/Akshaya.sol`) — proof-of-outcome reputation:
  soulbound ERC-721 receipts minted *only* from terminal `TaskEscrow` states,
  signed half-life-decayed score (90d), zero admin, permissionless idempotent
  attest. Spec: `docs/AKSHAYA.md`. Tests: `contracts/test/Akshaya.t.sol`.
- **GhatStream** (`contracts/src/GhatStream.sol`) — continuous escrow:
  EIP-712 `StreamMandate`, per-second accrual, payer stop-cock, expiry sweep,
  live-identity gate at open; conservation invariant `claimed + swept == cap`.
  Spec: `docs/GHATSTREAM.md`. Tests: `contracts/test/GhatStream.t.sol`.
- Zero-dependency contract libraries in `contracts/src/lib/`: `EIP712`,
  `ECDSA` (strict: 65B, low-s, v∈{27,28}), `SafeERC20` (return-data-checked),
  `IERC20`, `ReentrancyGuard`.
- Agent reputation lane: `agent/src/akshaya.ts` (reads + attest writer) and
  `aegis reputation <0x…|sublabel>` / `aegis attest <taskId>` CLI commands,
  3 new vitest units (agent suite now 156).
- `contracts/script/DeployInventions.s.sol` — deploys Akshaya + GhatStream
  against the live rail via env wiring.
- CI: service adversarial harness now runs in `ci.yml`; gitleaks job.
- Community files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  issue + PR templates, Dependabot (actions + npm + submodules).
- Frontend: all-SVG `Engraving` plate system (the site ships **zero raster
  bytes** now); the proof table surfaces Akshaya/GhatStream addresses as soon
  as `NEXT_PUBLIC_AKSHAYA` / `NEXT_PUBLIC_GHAT_STREAM` are set.

### Changed
- **Contracts are dependency-free**: OpenZeppelin imports removed across the
  tree (`TaskEscrow`, `AegisRegistry`, `RiskGuard`, `MockERC20`); identical
  wire surface (domain `VaranasiTaskEscrow`/`1`, typehashes, ABI, revert
  selectors), behavior proven on a real EVM (48-check solc-js + ethereumjs
  harness incl. viem↔Solidity digest parity).
- `PROMPT.md` → `AGENTS.md` and rewritten as the repo's agent contract.
- `docs/ARCHITECTURE.md` rewritten: rail diagram, data-flow rules, failure
  model, and a Verification table (forge + EVM harness + unit suites).
- Frontend dep diet: dropped `lucide-react` (inline SVG icons),
  `@farcaster/mini-app-solana`, `@solana/kit`, `@solana-program/*` (unused).
- Sepolia address table unified on the v2 set across README, `agent/`,
  `contracts/README.md`; v1 sets documented as superseded history in
  `docs/DEMO.md`.
- Hero proofs updated to verified counts (204 local checks).

### Removed
- `AegisHook` + DemoPool experiment with their docs (`UNISWAP.md`,
  `DEMOPOOL.md`) and test suites (`AegisHook.t.sol`, `DemoPool.t.sol`),
  `v4-core`/`v4-periphery` submodules — enforcement lives at settlement;
  `docs/SECURITY_REVIEW.md` annotated (hook findings closed by removal,
  history preserved).
- Dead weight for a lean tree: `cre/`, `bazantic/`, `e2e/`, `run_e2e.sh`,
  `PROJECT.md`, `WORLD.md`, `TEST_INFRA.md`, `TEST_READY.md`,
  `docs/{SUBMISSION,VIDEO_SCRIPT,KEYS}.md`, all committed `.env.enc` files,
  ~15 MB of raster images in `frontend/public` (replaced by vector art).
- GhatStream dead wiring: unused `owner` slot + `NotOwner`/`ZeroAddress`
  errors — contract now has literally no mutable admin (re-verified on EVM).

### Fixed
- `Akshaya.attest` tuple destructuring off-by-one (agent/merchant swap in
  ledger keying) — caught by the real-EVM harness, documented as a cautionary
  tale for 14-field `tasks()` decoding.
- Escrow + stream views no longer depend on caller-writable state for money
  routing; harness regression coverage added for post-revert journal staleness
  and block-tick accrual drift.

## [0.2.0] — 2026-09-08

- v2 hardened set (Sepolia): `AegisRegistry`/`RiskGuard`/`TaskEscrow` redeploy
  with audit fixes — label rules, revoke-clears-mappings + unRevoke,
  1825-day expiry cap, per-task pinned threshold/validator, allowlist re-check
  at release, cancel/refund split, 2-step ownership. Sourcify-verified.
- Hire wizard + vault + treasury in frontend (Privy embedded wallets,
  self-custodial, keys never leave the browser).
- `docs/DEMO.md` evidence trail with live tx links.

## [0.1.0] — 2026-09-06

- Hackathon-era rail: ENSv2 identity, The Graph intel, Hedera x402 signal
  service, heuristic + optional-LLM reasoning, Uniswap v4 hook experiment.
