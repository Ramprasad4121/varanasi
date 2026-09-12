# AGENTS.md — the agent-first contract for varanasi

> Paste this (or point your agent at it) to become productive in this repo in
> one read. It is also the law for AI-assisted PRs here: follow it or CI will
> not have you. Humans: read `README.md` first; the doc set lives in
> `docs/` (map: `docs/INDEX.md`, facts: `docs/REFERENCE.md`).

## Read in this order

1. `README.md` — what and why.
2. `docs/ARCHITECTURE.md` — the rail + community-finance protocol, on one page.
3. `docs/REFERENCE.md` — registry of verified facts (addresses, ports, env, commands).
4. The contract you'll touch: `contracts/src/*.sol` (zero external deps —
   everything lives in `contracts/src/lib/`).
5. `docs/MANDATE.md` · `docs/AKSHAYA.md` · `docs/GHATSTREAM.md` — specs for the
   three money primitives.

## The repo in one breath

`contracts/` (Foundry, 0.8.30 viaIR, zero-dep src incl. finance/collateral/gold)
→ `agent/` (TS CLI `aegis`, viem, finance decision engine) → `service/`
(Express, x402 on Hedera, finance demo APIs) → `frontend/` (Next 14, Privy,
all-SVG, `/finance` demo vault). Sepolia escrow rail + Hedera testnet payments.
Mainnet cutover must require zero contract changes.

## Commands

```bash
cd contracts && forge build && forge test        # offline, mock-mode registry; forge-std is the only submodules entry (CI fetches it)
cd ../agent  && npm run typecheck && npm test    # vitest — 165 tests, mocked viem/fetch
cd ../service && npm run typecheck && npm run build && npm test && node --test test/adversarial_service.test.mjs
cd ../frontend && npm run typecheck && npm run build
./run.sh                                          # boots service :4021 + web :3000
```

## Rules for Solidity (the house law)

- Say **onchain**, never "on-chain".
- Contracts are for ownership, transfers, commitments — not databases. History
  is read from events.
- **Zero external dependencies** in `src/`. New primitives go in `src/lib/`,
  audited like the rest (current set: EIP712, ECDSA, SafeERC20, IERC20,
  ReentrancyGuard, Ownable, Pausable, ERC20, EnumerableSet — minimal
  OZ-selector-compatible shapes). Only `forge-std` may be imported, in tests.
  Never re-add a runtime submodule to make an import "work".
- Every money mover: `ReentrancyGuard` + checks-effects-interactions +
  `SafeERC20` semantics (return-data-checked `call`; no `transfer` on ERC777-
  shaped tokens).
- EIP-712 everywhere a signature gates value; nonces are per-signer nullifiers;
  digests bind `chainId`.
- Never trust a stale credential: live re-check identity/risk at settlement
  (see `TaskEscrow.release` → `RiskGuard.authorize`).
- USDC is 6 decimals. ERC-721 `safeTransferFrom` selector collisions are real —
  use 4-byte custom errors, and remember `release(bytes32)` ≠ ERC721 shape.
- Cap-before-mint in any loop that mints (see `Akshaya.MAX_BATCH`).
- Test failure modes first (reverts, replay, wrong signer, double-attest), then
  happy paths. Fuzz the math. `forge test` must stay runnable **offline** —
  mock-mode `AegisRegistry` exists for exactly that.
- An EVM-level scenario harness (solc-js + ethereumjs/vm, no forge needed) is
  described in `docs/ARCHITECTURE.md` § Verification — build the equivalent
  when you change settlement math.

## Rules for the stack

- No secrets in git, ever. No `--private-key` CLI flags; keys come from env or
  `--key-stdin`. `.env*` is gitignored. Encrypted `.env.enc` files are **not**
  a pattern here — delete them on sight (gitleaks will flag them anyway).
- Node ≥ 24 (engines), TS strict, ESM only (`*.js` import specifiers).
- Frontend: per-button loader on every mutation; ≤3 primary buttons per flow;
  show `<Address>`-style shortened addresses and USD next to token amounts;
  no raster images — draw plates with `components/Engraving.tsx`.
- **Personal data is scoped per signed-in account** — reads/writes go through
  `frontend/lib/vault.ts` (`varanasi.<userId>.*`); never persist personal
  state to raw `localStorage`, and never merge the service's public receipt
  feed into a user vault (view-only display). Shared finance types live in
  `frontend/finance-types/` (mirrored into `service/` + `agent/` — keep in sync).
- The homepage is user-facing: never show internal engineering metrics (test
  counts, CI status) there; those live in docs and this file.
- **Finance demo rule:** `/v1/finance*` + `/finance` are **simulated** and
  labeled as such; `agent/src/finance/finance.ts::execute()` **throws** until
  the finance contracts are deployed, so demo state never broadcasts.
- Do NOT require env to build/test: no `NEXT_PUBLIC_*` keys in CI by design —
  pages show "setup notices" instead.
- GitHub rules: conventional commits (`feat|fix|refactor|chore|docs|test(scope):
  msg`), no force-push to shared branches, work lands via PR to `main`, CI
  (contracts/agent/service/frontend/gitleaks) green before merge.

## Never do

- **Never run the live agent loop** (`run.sh agent`, `aegis analyze` without
  `--skip-pay`) unless the user asks — it spends a real $0.01 x402 payment.
- **Never write `.env`** in-repo, never bind docs at non-existent assets —
  verify addresses/ports/counts against `docs/REFERENCE.md` (and update it in
  the same PR when a fact moves).
- **Never delete/rename** `service/data/`, `run.sh`, `frontend/finance-types/`,
  or the "Created with Grok" pill and its script in the frontend shell.

## Invariants you may not break

See `contracts/README.md` § Invariants — each law has a test. Any PR that
weakens one must carry a spec update in the same change explaining why the
universe changed.

## Style

Every source file starts with the one-line author header
(`// Author: Ramprasad — …` / `# Author:` / `<!-- Author -->`). Docs are
declarative, no marketing adjectives, tables over prose when listing facts.
Keep the tree light: no assets over 100 KB, no vendored deps, delete a
directory in the same PR that empties it.

## When editing, which file owns what

| You are changing… | Respect the source of truth in |
|---|---|
| Mandate shape / settlement | `docs/MANDATE.md` (type string is LOCKED) |
| Contract behavior | `contracts/src/**` + forge tests (mirror in `docs/ARCHITECTURE.md`) |
| Shared finance types | `frontend/finance-types/` (mirrored into `service/` + `agent/` — keep in sync) |
| Site copy/stats | `frontend/lib/site.ts` + `frontend/app/page.tsx` — user-facing only |
| Personal vault / isolation | `frontend/lib/vault.ts` |
| Routes | `service/src/server.ts` (list at `:4021/v1/...`) |
| Agent CLI | `agent/src/cli.ts` |
| Facts registry | `docs/REFERENCE.md` |
