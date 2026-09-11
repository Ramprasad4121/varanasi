# Step 2 · Market Analysis

Author: Ramprasad · 2026-09-11 · Status: DONE (sources cited; refresh quarterly)

All third-party figures below are from public sources cited in §6. Our own
TAM/SAM/SOM estimates are clearly labeled as ours.

## 1. The category

**Agentic commerce**: transactions initiated or executed by autonomous AI
agents on behalf of a principal. In 2025–2026 the category moved from concept
to production on three fronts simultaneously:

- **Card networks**: Visa Intelligent Commerce + Trusted Agent Protocol, and
  Mastercard Agent Pay / AP4M for machines, both announced for global rollout
  from 2026 (Visa's AI-ready-merchant tooling and Mastercard's 30+ day-one
  partners including Coinbase, Stripe, Adyen, Cloudflare) [3][6].
- **Open payment protocols**: the IMF's 2026 payments note identifies AP2 —
  which binds agent-initiated actions to cryptographically verifiable
  mandates specifying scope, limits, actor identity, and conditions — as the
  core trust mechanism at the agent layer, with x402 as its stablecoin
  extension [2].
- **Machine payments at scale**: Coinbase's x402 protocol processed ~165
  million agent transactions from ~69,000 active agents in its first months,
  with ~$50M cumulative volume by late April 2026, averaging ~$0.30 per call
  [1].

## 2. Market size (third-party estimates)

| Source | Estimate |
|---|---|
| McKinsey QuantumBlack (Oct 2025) | $3–5T agent-orchestrated global retail spend by 2030 [1] |
| Juniper Research (Apr 2026) | $8B agentic spend in 2026 → $1.5T globally by 2030 [1] |
| Edgar Dunn (C2B slice) | ~$136B (2025) → $1.7T (2030), 67% CAGR [4] |
| Globe Market Research | Agentic commerce platforms $5.9B (2026) → $95.2B (2035), 36.2% CAGR [5] |
| Adobe Analytics | +4,700% YoY genAI traffic to US retail sites (Jul 2024→Jul 2025); AI-driven revenue-per-visit +84% (Jan–Jul 2025) [1] |

Estimates differ by definition (spend orchestrated vs. platforms monetizing
that spend). We plan against the conservative end: **tens of billions in
platform revenue by 2030, orchestrating trillions in spend**.

## 3. Our TAM / SAM / SOM (our estimates — challenge them)

- **TAM** — enforcement/settlement infrastructure and trust tooling for
  agentic commerce. Proxy: platform layer of the above (~$95B by 2035 [5])
  × the fraction that is payments/risk infrastructure (~10–15%) ⇒
  **~$10–14B addressable by 2035**.
- **SAM** — agent-native, onchain settlement (x402/AP2-shaped rails,
  stablecoin-settled tasks) for English-speaking, crypto-adjacent builders
  and agent platforms. If onchain agent payments are even 1–2% of agent
  commerce spend by 2030, SAM ≈ **$15–30B of flow**, monetizable at
  10–50 bps ⇒ **$15–150M fee pool**.
- **SOM (3 years)** — the slice we can win as the enforcement rail for
  x402/AP2-adjacent agent commerce: $250M–1B settled volume/year × 25 bps ⇒
  **$60–250K protocol fees in year 1 of mainnet**, growing with the x402
  network; plus Signal API subscriptions (SaaS, `company/06-business-model.md`).
  Honest read: fees alone do not fund the company early; subscriptions and
  enterprise do. That is planned for in `company/09-finance.md`.

## 4. Demand drivers (why now)

1. Agent transaction volume is already machine-scale (165M x402 tx [1]) but
   authorization is still human-legacy (keys, approvals).
2. The liability vacuum: no binding agent-dispute rule from the networks;
   ACP puts losses on merchants/PSPs [6] — someone must own *enforcement*,
   and onchain escrow is the neutral, verifiable place to put it.
3. AP2 formalizes the shape we already implement (mandates with scope,
   limits, identity, conditions [2]) — standards tailwind.
4. Stablecoin settlement for machines is live (x402; Mastercard stablecoin
   support [3][6]).
5. Agent-side losses are now visible and frequent enough to be a budget line
   (prompt injection, key theft, hallucinated destinations) — the "why now"
   for buyers.

## 5. The gap we occupy (validated against sources)

Neither card-network path solves the machine-native problem end-to-end:
Visa's TAP carries intent/recognition/payment data but liability stays with
merchant/PSP and there is no agent-specific dispute rule; Mastercard stores
permissions on public chains but the settlement rail remains card-first [3][6].
AP2 defines the mandate shape; **nobody ships the enforcement-and-evidence
layer at settlement for onchain agent work** — escrowed task funds,
revocable agent identity, quality-bar release, refund-by-default, audit
trail. That is varanasi's lane, and it is deliberately interoperable with
both worlds (AP2-shaped mandates, x402 payments, ERC-8004 identity).

## 6. Sources

1. Eco.com, "What Is Agentic Commerce? The 2026 Guide" — McKinsey $3–5T;
   Juniper $8B→$1.5T; x402 69k agents / 165M tx / ~$50M volume; Adobe
   Analytics figures. https://eco.com/support/en/articles/14839400
2. IMF eLibrary, "How Agentic AI Will Reshape Payments", IMF Notes 2026
   (AP2 as the core mandate mechanism; x402 stablecoin extension).
   https://www.elibrary.imf.org/view/journals/068/2026/004/article-A001-en.xml
3. Digital Applied, "Visa + OpenAI: Tokenized Payments for Shopping Agents"
   (TAP elements; AP4M partners; stablecoin run rates; June 2026 tooling).
   https://www.digitalapplied.com/blog/visa-openai-tokenized-agentic-commerce-payments-merchant-guide
4. Edgar Dunn, "Agentic Commerce: The Future of Payments" (C2B TAM $136B
   2025 → $1.7T 2030).
   https://www.edgardunn.com/articles/agentic-commerce-the-future-of-payments
5. Globe Market Research, "Agentic Commerce Market to Surpass USD 95.2
   Billion by 2035" ($5.9B 2026, 36.2% CAGR).
   https://www.globemarketresearch.com/reports/agentic-commerce-market
6. Digital Applied, "Who Vouches for the Bot? Agent Checkout Authentication"
   (no binding agent-dispute rule; ACP assigns loss to merchant/PSP).
   https://www.digitalapplied.com/blog/agent-checkout-authentication-card-networks-2026
