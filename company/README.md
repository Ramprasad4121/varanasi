# The Varanasi Company Build

Author: Ramprasad · 2026-09-11

This directory is the **company operating system** — the complete, ordered
record of building varanasi from a working hackathon product into a company.
Each document is one step in the standard sequence of company/product
formation. Statuses are honest: DONE, ACTIVE, or PLANNED.

Product reality check that everything below builds on (verified 2026-09-11):
153/153 agent tests, 106/106 E2E tiers 1–3, CI green on `main` across
contracts/agent/service/frontend + gitleaks, live Sepolia + Hedera testnet
deployments with onchain evidence in `docs/DEMO.md`.

## The steps, in order

| Step | Document | Question answered | Status |
|---|---|---|---|
| 1 | [`01-charter.md`](01-charter.md) | Why does this company exist? Vision, mission, values, objectives | DONE |
| 2 | [`02-market-analysis.md`](02-market-analysis.md) | Is this a market worth building in? Size, growth, drivers | DONE (cited) |
| 3 | [`03-competition.md`](03-competition.md) | Who else is building this, and why do we win? | DONE |
| 4 | [`04-customers.md`](04-customers.md) | Who exactly do we serve, and what job do they hire us for? | DONE |
| 5 | [`05-product-strategy.md`](05-product-strategy.md) | What do we build, in what order, and what is the moat? | ACTIVE |
| 6 | [`06-business-model.md`](06-business-model.md) | How do we make money, and does unit economics work? | ACTIVE |
| 7 | [`07-gtm.md`](07-gtm.md) | How do we reach customers and turn them into users? | ACTIVE |
| 8 | [`08-org-design.md`](08-org-design.md) | Who builds it? Team, roles, ownership, hiring plan | ACTIVE |
| 9 | [`09-finance.md`](09-finance.md) | What does it cost, and how is it funded? | ACTIVE |
| 10 | [`10-legal-compliance.md`](10-legal-compliance.md) | Entity, IP, regulatory posture | ACTIVE |
| 11 | [`11-engineering.md`](11-engineering.md) | How does the team ship safely, week after week? | ACTIVE |
| 12 | [`12-security-trust.md`](12-security-trust.md) | Audits, bounties, disclosure, trust program | ACTIVE |
| 13 | [`13-metrics.md`](13-metrics.md) | What do we measure, and what are the targets? | ACTIVE |
| 14 | [`14-risk-register.md`](14-risk-register.md) | What can kill us, and what do we do about it? | ACTIVE |
| 15 | [`15-governance.md`](15-governance.md) | Who decides what, now and as we scale | ACTIVE |

## Companion documents

- **Whitepaper** (the public thesis): [`docs/WHITEPAPER.md`](../docs/WHITEPAPER.md)
- **Architecture** (the CTO record): [`docs/architecture/`](../docs/architecture/)
- **Protocol spec**: [`docs/MANDATE.md`](../docs/MANDATE.md)
- **Security review**: [`docs/SECURITY_REVIEW.md`](../docs/SECURITY_REVIEW.md)
- **Live evidence**: [`docs/DEMO.md`](../docs/DEMO.md)

## Operating cadence (how this directory stays alive)

- **Weekly**: metrics snapshot appended to `13-metrics.md` ledger; risk
  register reviewed for movement.
- **Per release**: `05-product-strategy.md` roadmap table updated with
  evidence links; `docs/DEMO.md` refreshed.
- **Quarterly**: strategy documents (2–7) revisited against reality;
  board/investor update assembled from 9 + 13.
- **On any incident**: `14-risk-register.md` gains the realized risk and the
  postmortem link.

Rule: a claim in this directory without a link to code, a doc, a transaction,
or a cited source is a bug in the document. Fix it or delete the claim.
