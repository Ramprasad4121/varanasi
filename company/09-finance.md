# Step 9 · Financial Plan & Funding Strategy

Author: Ramprasad · 2026-09-11 · Status: ACTIVE (assumptions labeled; this is
a plan, not a report — no revenue exists today)

## 1. Current financial state

- **Revenue: $0** (testnet-only product; no fees charged by design).
- **Costs to date**: infra ≈ $0 (local + testnet + free tiers), founder time,
  audit-exchange covered in-kind (v2 hardening accepted as external review —
  see `docs/SECURITY_REVIEW.md`).
- **Assets**: working product (P0 complete), open-source codebase (MIT),
  testnet deployments, hackathon visibility, this company plan.

## 2. Cost structure (monthly, post-formation)

| Item | Pre-seed | Post-seed (5 ppl) | P2 (8 ppl) |
|---|---|---|---|
| Payroll (cash) | $0 | $60K | $110K |
| Legal/accounting | $2K | $4K | $6K |
| Cloud/staging/RPC | $0.5K | $2K | $5K |
| Audit reserve (amortized) | — | $8K | $10K |
| Bug bounty pool | — | $2K | $5K |
| GTM/events | $0.5K | $3K | $8K |
| **Total/mo** | **~$3K** | **~$79K** | **~$144K** |

## 3. Funding strategy (tranches tied to de-risking, not vanity rounds)

1. **Bootstrap + prizes (now)**: keep burn ≈ 0; hackathon outcomes; the repo
   is the pitch.
2. **Pre-seed/SEED ($1.5–2.5M, target Q4 2026–Q1 2027)** — unlocks: entity,
   2 audits, 2 hires, staging+mainnet prep, 12–18 months runway at ~$80K/mo.
   Investor thesis: security-critical infra at the x402/AP2 inflection;
   evidence-first execution. Use-of-funds: 45% engineering, 25% audits/
   security, 15% infra, 15% GTM.
3. **Series A (only if)**: ≥ $5M annualized settled volume + ≥ $500K ARR
   (R2+R3) + validator network design validated by design partners.
4. **Non-dilutive**: grants (ecosystem programs for ENS/Graph/Hedera-style
   integrations), audit-credit programs, hackathon prizes.

## 4. Projections (scenario, 3-year, mainnet H1 2027)

| | Bear | Base | Bull |
|---|---|---|---|
| Settled volume yr-1 mainnet | $2M | $20M | $150M |
| R1 fees (25 bps) | $5K | $50K | $375K |
| R2 ARR | $60K | $300K | $1.2M |
| R3 | $0 | $100K | $500K |
| **Revenue yr-1** | **$65K** | **$450K** | **$2.1M** |

Honest reading: even bull-case yr-1 doesn't cover P2 opex — the company is
a bet on the category curve (`02-market-analysis.md`), with R2 as the bridge
and R1 as the compounding tail. Runway discipline (§6) is the survival rule.

## 5. Treasury policy (company funds, distinct from user escrow)

- 6 months minimum runway in fiat/stables at all times; founder salaries
  deferred until post-seed.
- Crypto holdings (if any grants/prizes) converted to stables within 30
  days; no yield strategies on operating funds.
- **No commingling ever**: company treasury ↔ user escrow are different
  universes by construction (contracts hold user funds; company cannot move
  them — no sweep function exists).

## 6. Controls

- Two-signer rule for spend > $10K (founder + bookkeeper thresholds per
  `08-org-design.md` §3).
- Monthly close within 10 business days; investor update quarterly from
  `13-metrics.md` ledger + this doc's actuals.
- Audit-ready books from day one (entity formation in
  `10-legal-compliance.md` includes accountant setup).
