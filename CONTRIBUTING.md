# Contributing

Thanks for helping. This repo holds the Varanasi contracts (`contracts/`, Foundry) and
several apps; the people app (gold savings, chits, gold loans in Telugu and English) is
in `app/`. Everything here is a demo with test money.

## Setup

- Foundry (`forge`, `anvil`): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- Node 22.18 or newer, npm
- For browser tests: `pip install playwright==1.48.0 && python3 -m playwright install chromium`
- Optional: `pip install pre-commit && pre-commit install` (runs prettier, eslint, forge fmt on staged files)
- Or with Docker: `docker compose up --build` runs the local chain and the app on http://localhost:3100

## Before you open a PR

```
cd contracts && forge test
cd app && npm ci && npx tsc --noEmit && npx next lint && npm run test:unit
scripts/app-demo.sh --check        # API smoke test on a local chain
scripts/app-public.sh --check      # waitlist + demo ledger + browser walk-through
```

CI runs the same steps (`.github/workflows/people-app.yml`).

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org): `feat(app): ...`,
`fix(contracts): ...`, `test: ...`, `docs: ...`, `ci: ...`, `chore: ...`. Notable changes
go in `CHANGELOG.md` under "Unreleased".

## Rules for the people app

- Plain words. Screens never say wallet, gas, token, blockchain or crypto.
- Every new string in English and Telugu (`app/lib/i18n.ts`). Telugu needs a native speaker review before real users.
- Rupees and grams first. Big text, tap targets at least 48 px, works at 360 px wide.
- Test money only. Never claim users, revenue or a bank partnership that does not exist.
- No em dashes or en dashes in user facing copy.
