# Step 4 · Customer Discovery — ICP, Personas, Jobs-to-be-Done

Author: Ramprasad · 2026-09-11 · Status: DONE v1 (validate with 20 interviews
before scaling spend — see `07-gtm.md` §2)

## 1. The pain, in the customer's words

"An agent with my API key is a loaded gun." — anyone who has ever given an
agent a spending credential. The JTBD: **"When I delegate spending or work to
an autonomous agent, I want the money to move only inside bounds I set and
only when the work is proven, so I can scale delegation without scaling
risk."**

## 2. Ideal Customer Profile (ICP), in priority order

### ICP 1 — Agent platform / marketplace operators (B2B, design partner)
- **Who**: teams running fleets of paid agents or marketplaces where agents
  transact (x402-style economies, agent app stores).
- **Pain**: their users get drained by one bad agent; they carry the trust
  burden with no enforcement primitive; chargeback/liability rules don't
  exist yet for agents.
- **JTBD**: "Bound every agent task in escrow with revocable identity so my
  marketplace's worst day is a refund, not a theft."
- **Why they buy**: trust is their core product; varanasi is infrastructure
  for it.
- **Evidence of need**: x402's 69k active agents and ~$50M volume [sources in
  `02-market-analysis.md`] with per-call payments but no task escrow.

### ICP 2 — DeFi-native teams and DAOs hiring autonomous workers
- **Who**: treasuries/protocols using agents for market making, LP
  management, monitoring, airdrop/ops work.
- **Pain**: agents need standing approvals to be useful; revocation is
  manual; every approval is a future incident.
- **JTBD**: "Give the agent a mandate, not my keys; get work or a refund."

### ICP 3 — Individual builders (developer early-adopter wedge)
- **Who**: solo devs running scout/analyst/freelancer-style agents on their
  own capital; crypto-native tinkerers.
- **Pain**: no clean way to bound agent spend; DIY escrow is a weekend of
  Solidity and a lifetime of liability.
- **JTBD**: "One CLI command to hire an agent with a cap and a kill switch."
- **Role in strategy**: they are the product's feedback engine and the
  content engine (open-source repo, `PROMPT.md` agent onboarding). Free tier.

### ICP 4 (later) — enterprises procuring agentic services
- Procurement wants the evidence trail (mandates, receipts, HCS audit) more
  than the crypto. Requires the compliance work in `10-legal-compliance.md`.
  Not a 2026 target; a 2027 one.

## 3. Personas

**"The Operator" — platform eng lead (ICP 1).** KPI: trust incidents = 0.
Buys rails, not dashboards. Objection: "another integration" → answer: MIT
SDK, x402-native, one EIP-712 object.
**"The Treasurer" — DAO/protocol ops (ICP 2).** KPI: approval surface area.
Lives in multisigs. Objection: "contract risk" → answer: audits + no-sweep
construction + permissionless refund.
**"The Builder" — solo dev (ICP 3).** KPI: agent P&L. Objection: "is this
real?" → answer: paste `PROMPT.md`, run the loop, check HashScan.

## 4. Anti-ICP (do not build for, yet)

- Consumers hiring shopping agents (card rails' territory for now; revisit
  when AP2 networks interop).
- Agents needing sub-millisecond settlement (we are task-scoped, not HFT).
- Anyone wanting us to custody funds ( charter prohibits it).

## 5. Discovery plan (the step, not just the doc)

1. 20 problem interviews (10 ICP-1, 6 ICP-2, 4 ICP-3) — questions fixed in
   interview kit; success = ≥ 60% articulate the pain unprompted and name a
   current workaround (per-call caps, manual revocation, "we just don't").
2. 3 paid design-partner pilots on staging (mandate-hired agent tasks with
   real (testnet) money and real workloads).
3. Instrumented Signal API beta ($0.01 testnet) as a lead magnet — usage is
   the survey.
4. Kill criteria (honesty clause): if < 30% of ICP-1 interviews express
   willingness to change integration plans for bounded escrow, revisit the
   wedge before raising.
