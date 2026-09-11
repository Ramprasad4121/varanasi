# Step 6 · Business Model, Pricing & Unit Economics

Author: Ramprasad · 2026-09-11 · Status: ACTIVE (revisit at first mainnet revenue)

## 1. Model overview

Three revenue lines, one design rule: **we never earn from holding user
funds.** Fees attach to settled outcomes and to data/software value.

| Line | What | Basis | Phase |
|---|---|---|---|
| R1 — Protocol fee | bps on escrow release volume | Pure usage, charged in-token at settlement | P2 (mainnet) |
| R2 — Signal & risk subscriptions | Aegis Signal API (the x402-gated service today), risk scoring, monitoring/alerting tiers | SaaS per seat/agent + metered calls | P1 beta → P2 GA |
| R3 — Enterprise & infrastructure | Private deployments, compliance/evidence packages, SLA support, custom validator sets | Contracts (annual) | P3 (ICP 4) |

Rationale: fee pools alone are small early (see `02-market-analysis.md` §3
SOM math); R2 funds the company while R1 grows with the network. R3 is the
margin line once procurement-grade evidence (mandates + HCS audit) is the
differentiator.

## 2. Pricing (launch targets, testable)

- **Free/community**: testnet everything; mainnet read + self-serve mandates
  with no platform fee for the first N tasks (growth instrumented).
- **Protocol fee (R1)**: **25 bps** on release volume at launch (0 bps during
  the first mainnet quarter to seed liquidity of demand). Merchant-side,
  visible in the mandate economics; refund path charges nothing.
- **Signal API (R2)**: per-call x402 (today $0.01 USDC on testnet — stays
  pay-as-you-go for agents) **and** subscription tiers for platforms:
  Builder $0 (rate-limited) / Pro $99/mo (alerts, history, 10 agents) /
  Scale $999/mo (SLOs, 100 agents, private facilitator routing). Prices are
  hypotheses to A/B at GA.
- **Enterprise (R3)**: from $50K/yr; includes evidence export (HCS topic
  subscription), custom thresholds, private validator sets.

## 3. Unit economics (per settled task, mainnet L2 assumptions — labeled)

Assumptions (to validate at P2): avg task $50; L2 gas per escrow lifecycle
(fund+validate+release ≈ 4 calls) ≈ $0.05; signal cost $0.01; service infra
allocation ≈ $0.02.

- Revenue: 25 bps × $50 = **$0.125** per task.
- Direct cost: ≈ **$0.08** (gas borne by users today — if we subsidize,
  this is the number to watch; company-borne cost ≈ $0.03 infra).
- Gross margin at scale: **~75%+** on company-borne costs; infrastructure
  scales sub-linearly (stateless service, cache rebuildable).
- Break-even on R1 alone: ~$1.5M/yr opex ÷ $0.125/task ⇒ ~12M tasks/yr —
  unrealistic alone; R2 is the bridge (100 Scale customers ≈ $1.2M ARR).
- LTV/CAC targets: ICP-1 design partners CAC ≈ $0 (founder-led); at scale
  target LTV/CAC ≥ 3 with payback < 12 months on R2.

## 4. Why users pay (value capture, not tax)

- Payer: bounded worst case (refund, not theft) — insurance-like value per
  task.
- Merchant/agent: access to spend-capped principals they couldn't otherwise
  serve (trust unlock) — 25 bps is cheap vs. card fees.
- Platform: incident-cost avoidance + evidence for their own users.

## 5. Fee mechanics (protocol detail)

Charged as a deduction at release, in the settlement token, no separate
invoice; refunds never pay fees. Contract change required (today's testnet
escrow fee-free by design) → goes through spec RFC (`docs/MANDATE.md`) +
audit in P1/P2. Cap: owner-settable, hard-coded ≤ 50 bps ceiling in the
same change.

## 6. Business risks specific to the model

- Fee capture depends on mainnet volume that may be slow (mitigation: R2
  funding bridge, honest SOM).
- Free-rider forks (MIT license): the moat is reputation, validators, and
  integrations — not license lock-in; enterprise value shifts to R3.
- Facilitator take rates on x402 compress our margin on R2 bundles; monitor
  and multi-home facilitators.
