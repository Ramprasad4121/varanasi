# Step 15 · Governance

Author: Ramprasad · 2026-09-11 · Status: ACTIVE

## 1. Governance philosophy

Varanasi governs like it enforces: **rules over discretion, evidence over
assertion, and the smallest surface that can make a decision.** Today that
means founder-led governance with written rules; as value at risk grows, the
rules — not the rulers — get promoted to contracts, multisigs, and
eventually community process.

## 2. Decision rights today (who can say yes)

| Domain | Decider | Constraint |
|---|---|---|
| Product scope & priorities | Founder (CEO) | Roadmap doc is the record |
| Engineering standards | Founder (CTO) | CI + docs are the record |
| Contract/protocol changes | RFC → Founder sign-off | Spec-first, audit at mainnet |
| Spend ≤ $10K | Founder | Weekly ledger |
| Spend > $10K | Founder + bookkeeper countersign | `09-finance.md` §6 |
| Security disclosures | Founder + security lead | Safe-harbor policy `12-security-trust.md` §4 |
| Promise-breaking changes* | Supermajority of the company **and** public notice | *See §4 |

## 3. How decisions are recorded (the RFC/ADR ladder)

1. **L1 — Code comment / commit**: reversible, local.
2. **L2 — Docs update**: behavior-affecting (this repo's default; the E2E
   tiers assert docs↔code parity, so drift is a test failure, not an
   opinion).
3. **L3 — ADR** (`docs/architecture/01-system-architecture.md` §8 digest or
   standalone): architecture-affecting; requires a rejected-alternatives
   section.
4. **L4 — Protocol RFC** (edit proposal to `docs/MANDATE.md`): changes
   mandate semantics; requires: written proposal → 7-day comment window →
   audit delta plan → founder sign-off (post-mainnet: multisig + timelock
   execution).
5. **L5 — Charter change**: mission/values/custody promises — §4.

## 4. Promise-breaking changes (never silent)

Three promises are load-bearing for every user: (a) no custody / no owner
sweep, (b) MIT-open code, (c) refund-first failure modes. Any change to
these requires: public notice ≥ 30 days, a migration path for existing
tasks/identities, and — post-mainnet — timelocked onchain execution with
an escape window. Absent that, the promise stands.

## 5. Onchain governance trajectory (deliberately staged)

| Stage | Admin surface | Mechanism |
|---|---|---|
| Now (testnet) | Single EOA (documented accepted risk) | Founder keys |
| P1 (mainnet-ready) | Multisig 2-of-3 → 3-of-5 + ≥24h timelock | Threshold + owner ops on validators/threshold params only |
| P2 | Validator set governance (add/remove via multisig) | Quorum parameters onchain |
| P3 (only if earned) | Community governance of protocol params | Requires: sustainable fee revenue, legal clearance, a live token/legal-wrapper decision process — **no token is planned or promised today**; any token decision follows this section and `10-legal-compliance.md` §3 |

## 6. Board & advisors (post-seed)

- Standard 5-seat board at seed: 2 founders, 2 investors, 1 independent
  (security-background preferred — the independent's job is the custody
  promise).
- Advisory board: payments/regulatory counsel, one auditor-partner, one
  agent-platform operator (design partner voice).

## 7. Transparency defaults

- Company docs (this directory) updated in-repo; changelog weekly.
- Metrics ledger (`13-metrics.md`) append-only.
- Postmortems public. Audit reports public. Accepted risks public.
- The one thing we don't publish preemptively: unfixed vulnerabilities
  (coordinated disclosure policy governs those).
