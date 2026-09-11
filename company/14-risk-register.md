# Step 14 · Risk Register

Author: Ramprasad · 2026-09-11 · Status: ACTIVE (reviewed weekly; movement logged)

Scoring: Impact (1–5) × Likelihood (1–5). Owner is accountable for the
mitigation. "Realized" risks get postmortem links.

## 1. Product & security risks

| ID | Risk | I | L | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-01 | Critical contract bug at mainnet (guarantee bypass / fund loss) | 5 | 2 | 10 | Audits ×2 + invariant suites + bounty + refund-first failure modes + staged rollouts | Security |
| R-02 | Admin-key compromise (single EOA today) | 4 | 2 | 8 | **Multisig + timelock before mainnet** (P1 blocker); identities portable via ENS | Protocol |
| R-03 | Validator collusion (inflated scores) | 4 | 2 | 8 | Release also requires identity+window gates; quorum + slashing design at P2; scope-limited blast radius | Protocol |
| R-04 | Supply-chain attack (npm/facilitator) | 4 | 2 | 8 | Lockfiles, pinned CI, Dependabot, vendor patches documented | Backend |
| R-05 | x402 facilitator compromise/outage | 3 | 2 | 6 | Multi-home facilitators; service not in money path; degraded free tier | Backend |
| R-06 | Frontend/browsers compromised (phishing) | 3 | 3 | 9 | Privy-hosted auth; wallet-side signing only; damage bounded by mandate caps | Product |

## 2. Market & business risks

| ID | Risk | I | L | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-07 | Category timing (agent commerce slower than forecast) | 4 | 3 | 12 | R2 bridge revenue; lean burn; kill-criteria honored | Founder |
| R-08 | Card networks absorb enforcement (TAP/AP4M add dispute rules) | 4 | 3 | 12 | Complement posture — interop (AP2 shape) rather than head-on; onchain-native slice they don't serve | Founder |
| R-09 | MIT free-rider fork captures value | 2 | 4 | 8 | Moat = validators, reputation corpus, integrations, trust record — not license lock | Founder |
| R-10 | Fee pool too small to sustain (fee-only failure) | 4 | 3 | 12 | Model planned for R2/R3 bridge (`06-business-model.md` §3); Series A gate honest | Founder |
| R-11 | Design partners don't convert from pilots | 3 | 3 | 9 | Kill criteria at 20-interview gate; pivot wedge (ICP2 → ICP1 or reverse) before scaling spend | Founder |

## 3. Regulatory risks

| ID | Risk | I | L | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-12 | Money-transmission characterization | 4 | 2 | 8 | Non-custodial by construction; counsel analysis per jurisdiction before GA (`10-legal-compliance.md`) | Legal (fractional) |
| R-13 | Stablecoin rule changes hit x402 path | 3 | 3 | 9 | Rail-agnostic settlement design (any ERC20; chainId-bound today, extensible) | Protocol |
| R-14 | Sanctions/AML exposure via open service | 3 | 2 | 6 | Screening plan at P2; geo controls; no custody reduces surface | Legal |

## 4. Company risks

| ID | Risk | I | L | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-15 | Founder bus factor (pre-seed) | 5 | 3 | 15 | Docs-first company (this directory); grant co-maintainers commit rights; hire #1 = protocol engineer | Founder |
| R-16 | Funding round fails (2026–27 market) | 4 | 3 | 12 | Burn floor ≈ $3K/mo (survivable indefinitely); grants; services revenue | Founder |
| R-17 | Key-engineer departure post-seed | 3 | 3 | 9 | Vesting, docs-as-memory culture, pairing on audits | Founder |
| R-18 | Hackathon-grade artifacts (docs drift) mislead | 2 | 3 | 6 | E2E tiers assert doc↔code parity; "order of authority" rule in `docs/architecture/README.md` | All |

## 5. Movement log

| Date | Change |
|---|---|
| 2026-09-11 | Register created from threat model + strategy docs. Top exposures: R-15 (bus factor), R-07/R-10 (market/fee timing), R-08 (network absorption). |

## 6. Standing rule

Any SEV or near-miss adds a row here within 5 business days, with a link to
the postmortem. Risks are only closed with evidence, never with optimism.
