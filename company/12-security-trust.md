# Step 12 · Security & Trust Program

Author: Ramprasad · 2026-09-11 · Status: ACTIVE (program starts pre-seed)

Trust is the product. This program turns the one-off hackathon security
review (`docs/SECURITY_REVIEW.md`) into a standing company function.

## 1. Current security posture (verified 2026-09-11)

- Contracts: v2-hardened (expiry caps, label rules), external review accepted
  (testnet), Sourcify-verified, immutable, no proxies, no owner sweep.
- Tests: forge suite in CI; 153 agent tests; 106/106 E2E tiers 1–3 local;
  adversarial tier 5 exercised during integration.
- Secrets: gitignored `.env` only, mode 600, encrypted `.env.enc` blobs,
  gitleaks CI gate on full history (0 findings).
- Documented accepted risks + dispositions:
  `docs/architecture/03-security-architecture.md` §4.

## 2. Audit program (P1, funded post-seed)

| # | Scope | When | Gate |
|---|---|---|---|
| A1 | TaskEscrow + docs/MANDATE.md semantics (replay, gates, accounting) | P1 freeze | Mainnet blocker |
| A2 | AegisRegistry + RiskGuard + AegisHook (identity, gates, hook math) | P1 | Mainnet blocker |
| A3 | Fee-mechanics change (R1 enablement) + validator quorum | P2 | Deploy blocker for that change |
| Continuous | Invariant/fuzz suites in CI; annual re-audit on material change | ongoing | Release gate |

Auditor selection: two independent firms (one boutique deep-review, one
brand-name for institutional trust); reports published unredacted.

## 3. Bug bounty (launches with mainnet)

- Scope: contracts in-scope at canonical addresses; critical = fund loss /
  guarantee bypass (e.g., release without gates, replay across domains).
- Tiers: Critical $25–50K / High $5–10K / Med $1–2.5K / Low swag+credits,
  funded from the bounty reserve (`09-finance.md`).
- Safe harbor: good-faith research, no exploits on live tasks, 90-day
  coordinated disclosure; we commit to public disclosure after fix.

## 4. Disclosure policy

- security@ channel (PGP key published at P2); acknowledge < 48h.
- Fix windows: critical 7d, high 30d, med 90d; users notified pre-fix if
  fund-relevant (with mitigation, e.g., "revoke identities now").
- Post-fix: public writeup + registry update + postmortem link.

## 5. Operational security

- Prod keys in managed secret store; deploy keys scoped; no laptop holds
  mainnet admin keys (multisig signers on hardware, geographically split).
- Admin keys: mainnet owner = multisig (3-of-5 target) behind a ≥ 24h
  timelock for threshold/validator changes; documented in the threat model.
- Access: least privilege, SSO, 2FA hardware for admin surfaces;
  quarterly access review.
- Supply chain: lockfiles, Dependabot, pinned toolchains (CI pins Node 24 /
  Foundry stable), patch-package deltas documented.

## 6. Trust artifacts (public, maintained)

1. `docs/DEMO.md` — live evidence ledger (tx-linked).
2. `docs/SECURITY_REVIEW.md` + accepted-risk table — honesty as policy.
3. Audit reports + remediation PRs (published).
4. Status page + onchain alerting feed (P2).
5. This program, reviewed quarterly by the founder + security lead.
