# Step 10 · Legal, Entity & Compliance Posture

Author: Ramprasad · 2026-09-11 · Status: ACTIVE checklist (not legal advice;
execute with counsel)

## 1. Entity formation (immediate, pre-seed)

- [ ] Incorporate **Delaware C-Corp** (standard for venture-backed infra
  startups; Wyoming/other evaluated with counsel for crypto-specific needs).
- [ ] Founder stock purchase agreement + 83(b) election (within 30 days).
- [ ] IP assignment: all repo contributions assigned to the entity
  (contributor CLA for outside PRs; the MIT LICENSE stays — open-core, the
  company owns brand, patents-if-any, and commercial services).
- [ ] Trademark search + filing for "varanasi" / "aegis" marks in software
  classes.
- [ ] Bank account + bookkeeper + registered agent; cap table on a managed
  platform from day one.

## 2. Open-source posture

- Today: everything MIT (repo LICENSE). Keeps the promise "the rail survives
  the company" and drives adoption.
- Decision rule (revisit at P2): stay MIT for contracts/SDK (trust and
  adoption) **unless** free-rider risk measurably blocks revenue; commercial
  terms then live in R3 services, not license restrictions. Any license
  change follows `15-governance.md` §4 (it is a promise-breaking change).

## 3. Regulatory posture (crypto-adjacent infra)

Framing varanasi for regulators, accurately:

- **Not a custodian**: the company holds no user funds; escrow is a
  self-custodial smart contract; no owner sweep exists
  (`docs/MANDATE.md` §3). Money-transmission analysis must still be run per
  jurisdiction with counsel — checklist below.
- **No token**: nothing issued, nothing promised (`01-charter.md` §"will not
  do"). Any change requires the governance process + legal opinion first.
- **Payments**: x402 settlement in stablecoins by users/agents directly;
  the company's paid service sells data/software subscriptions (R2) —
  ordinary-course business.
- **Securities**: no yield, no pooling, no profit-share from contracts to
  holders; protocol fees (when enabled) accrue to the company as service
  revenue, documented plainly.
- [ ] Money-transmission analysis (US state-by-state) with payments counsel.
- [ ] OFAC sanctions screening plan for service access + marketplace
  listings (geo/IP blocks at minimum; address screening at P2).
- [ ] MiCA/EMT-classification review before EU marketing (P3).
- [ ] Export/encryption compliance for the SDK (standard TS; trivial but
  filed).

## 4. Data protection

- No keys, no passwords, no biometrics stored (only World nullifiers —
  see `docs/architecture/02-data-architecture.md` §5).
- [ ] Privacy policy + DPA templates at GA; GDPR reps if EU users.
- [ ] Data map maintained in `02-data-architecture.md` (already the source
  of truth).

## 5. Contract/protocol legal hygiene

- [ ] Terms of service for frontend + Signal API (disclaimers: testnet,
  no warranty, MIT code).
- [ ] Design-partner LOI/pilot templates (IP clean, no exclusivity).
- [ ] Bug bounty terms + safe-harbor language (with `12-security-trust.md`).
- [ ] Audit engagement letters (scope = contracts + spec
  `docs/MANDATE.md`).

## 6. Insurance (P2)

- [ ] Tech E&O + cyber policy quotes at first paid customer.

## 7. Litigation/liability awareness

The category's liability vacuum (networks assigning agent-dispute loss to
merchants/PSPs — `02-market-analysis.md` §5) is our commercial opportunity
**and** a reason our own terms must be explicit: mandates are user-signed
authorization evidence; varanasi provides enforcement infrastructure, not
payment guarantees. Counsel reviews every user-facing claim for this
framing.
