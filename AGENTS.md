# AGENTS.md — the agent-first contract for varanasi

> Paste this (or point your agent at it) to become productive in this repo in
> one read. It is also the law for AI-assisted PRs here: follow it or CI will
> not have you.

## Read in this order

1. `README.md` — what and why.
2. `docs/ARCHITECTURE.md` — the rail, in one page.
3. The contract you'll touch: `contracts/src/*.sol` (zero external deps —
   everything lives in `contracts/src/lib/`).
4. `docs/MANDATE.md` · `docs/AKSHAYA.md` · `docs/GHATSTREAM.md` — specs for the
   three money primitives.

## The repo in one breath

`contracts/` (Foundry, 0.8.26, viaIR) → `agent/` (TS CLI `aegis`, viem) →
`service/` (Express, x402 on Hedera) → `frontend/` (Next 14, Privy, all-SVG).
Sepolia escrow rail + Hedera testnet payments. Mainnet cutover must require
zero contract changes.

## Commands

```bash
cd contracts && forge build && forge test        # offline, mock-mode registry
cd ../agent  && npm run typecheck && npm test    # vitest, mocked viem
cd ../service && npm run typecheck && npm run build && node --test test/
cd ../frontend && npm run typecheck && npm run build
./run.sh                                          # boots service :4021 + web :3000
```

## Rules for Solidity (the house law)

- Say **onchain**, never "on-chain".
- Contracts are for ownership, transfers, commitments — not databases. History
  is read from events.
- **Zero external dependencies** in `src/`. New primitives go in `src/lib/`,
  audited like the rest. (Only `forge-std` may be imported, in tests.)
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
  `--key-stdin`. `.env*` is gitignored; encrypted `.env.enc` files are not a
  pattern here — delete them on sight.
- Node ≥ 24 (engines), TS strict, ESM only (`*.js` import specifiers).
- Frontend: per-button loader on every mutation; ≤3 primary buttons per flow;
  show `<Address>`-style shortened addresses and USD next to token amounts;
  no raster images — draw plates with `components/Engraving.tsx`.
- GitHub rules: conventional commits (`feat|fix|refactor|chore|docs|test(scope):
  msg`), no force-push to shared branches, work lands via PR to `main`, CI
  green before merge.

## Invariants you may not break

See `contracts/README.md` § Invariants — 8 numbered laws, each with a test.
Any PR that weakens one must carry a spec update in the same change explaining
why the universe changed.

## Style

Every source file starts with the one-line author header
(`// Author: Ramprasad — …` / `# Author:` / `<!-- Author -->`). Docs are
declarative, no marketing adjectives, tables over prose when listing facts.
Keep the tree light: no assets over 100 KB, no vendored deps, delete a
directory in the same PR that empties it.
