# Step 8 · Organization Design & Hiring Plan

Author: Ramprasad · 2026-09-11 · Status: ACTIVE

## 1. Organization shape

Founder-led, flat, senior-first. Small teams that own surfaces end-to-end.
No middle management below 20 people. The org maps to the architecture, so
ownership never floats:

| Pod | Owns (see `docs/architecture/01-system-architecture.md` §6) | Headcount now → P2 |
|---|---|---|
| Protocol engineering | `contracts/` + `docs/MANDATE.md` spec | 1 → 3 |
| Agent platform | `agent/` (CLI, workers, SDK) | 1 → 2 |
| Backend & data | `service/`, receipts/HCS, indexer | 1 → 2 |
| Product & frontend | `frontend/` marketplace, vault, wizard | 1 → 2 |
| Security (embedded, not siloed) | audits liaison, threat model, bounty | 0 → 1 + external firms |
| Founder/CEO-CTO | strategy, fundraising, design partners | 1 |
| BD/partnerships (P2) | marketplaces, facilitators | 0 → 1 |
| Design (fractional) | Colosseum system, DX | fractional |

Today the "full engineering team" is real but founder-orchestrated: the repo
records parallel workstreams (integration, E2E track, security review) as
tracked in PROJECT.md's ownership tables; the company plan above is the human
equivalent of those roles.

## 2. Hiring sequence (spend follows verified milestones)

1. **Now (pre-seed)**: no hires; fractional design; external audit budget only.
2. **Post-seed**: Protocol engineer #2 (audit remediation, multisig, quorum
   design); backend engineer (staging, observability, indexer).
3. **P2 (mainnet)**: agent-platform engineer (SDK); security lead; DevOps
   contract-to-hire.
4. **P3**: BD; enterprise sales; second protocol engineer (validator
   network).

Every hire has a 90-day mission written before the offer (e.g., Protocol #2:
"quorum validator spec + audit remediation merged + invariant suites live").

## 3. Ownership & RACI (standing decisions)

| Decision | R | A | C | I |
|---|---|---|---|---|
| Contract changes (spec/`MANDATE.md`) | Protocol pod | Founder | Security, auditors | All |
| Production deploys (contracts) | Protocol pod | Founder + multisig signers | Auditors | All |
| Service/frontend releases | Owning pod | Founder | QA gates (CI) | All |
| Security disclosures | Security lead | Founder | Affected users, auditors | Public post-fix |
| Treasury spend > $10K | Founder | Founder | Bookkeeper | Team |
| Pricing changes | Founder | Founder | Design partners | Team |
| Anything touching custody/keys | **prohibited** | — | — | — |

## 4. Culture rules with operational teeth

- **Evidence or it didn't happen** — every claim links to code, a tx, or a
  test run (repo convention, extended to company ops).
- **Publish your own risks** — docs/SECURITY_REVIEW.md culture carries into
  postmortems (blameless, public where possible).
- **The repo is the company memory** — decisions land as ADRs/docs, not
  Slack threads (see `15-governance.md` §3).
- **Small, verifiable increments** — granular commits, CI-gated merges,
  weekly changelog.

## 5. Compensation & equity philosophy

- Market-rate cash at seed; meaningful equity for early engineers
  (4-year vest, 1-year cliff, 10-year exercise window).
- No tokens promised, ever, as compensation until `15-governance.md` §5
  process + legal clearance says otherwise.
- Contractors (design, legal, audit) paid on milestone deliverables.
