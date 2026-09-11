# Contributing

Author: Ramprasad · MIT · varanasi is a community product — "fork the rail" is a feature.

Start with [`AGENTS.md`](AGENTS.md), even if you're human (the repo is
agent-first; the doc is the shortest complete map).

## Ground rules

1. **Conventional commits** — `feat(scope): …`, `fix(contracts): …`,
   `docs(readme): …`, `chore`, `refactor`, `test`, `perf`. Imperative, ≤72ch
   subject. PR titles follow the same law (squash-merged, so the title *is*
   the history).
2. **CI or it didn't happen** — `forge test` + agent/service/frontend jobs
   must be green with zero secrets configured. If your change needs a secret
   to test, it needs a mock added in the same PR.
3. **No force-pushes** on shared branches. No `--no-verify`. Never commit
   keys, `.env` files, or anything that looks like either (a gitleaks job
   will find you anyway).
4. **Contracts rule:** zero external deps in `src/`, money-moving = guard +
   guard-again, new primitives belong in `contracts/src/lib/` with their own
   tests, and every invariant added gets a numbered line in
   `contracts/README.md` § Invariants + a test that *fails* without it.
5. **Onchain spelling** — one word. Docs speak in tables and proofs, not adjectives.

## Workflow

```sh
git checkout -b feat/<you>-<thing>
# …work; run the affected suites…
cd contracts && forge test
cd ../agent   && npm run typecheck && npm test
cd ../service && npm run typecheck && npm run build && node --test test/
cd ../frontend && npm run typecheck && npm run build
git push -u origin feat/<you>-<thing>   # then open a PR → main
```

PR body: what breaks without this, how it's tested (name the test files), and
a one-line changelog entry appended to `CHANGELOG.md` under **Unreleased**.

## Issue / PR etiquette

- Bugs need a repro command; contracts bugs need a failing test or a mainnet/
  Sepolia tx link. We fix at the layer where the money moves.
- Feature PRs that add a dependency (npm or gitmodule) need justification in
  the PR description: this repo ships lean on purpose.
- Security issues: **do not open a public issue** — see [`SECURITY.md`](SECURITY.md).

## What we will not merge

Upgradable proxies, admin multisig "just in case" paths, new RPC providers
that require API keys in CI, anything holding private keys client-side,
screenshots where a tx link belongs, images where a `Engraving` belongs.
