# Step 1 · Company Charter

Author: Ramprasad · 2026-09-11 · Status: DONE (revisit annually)

## Name

**Varanasi.** Named for the city on the Ganges — among the oldest continuously
inhabited places on earth, where people go to settle accounts. Commerce there
has run on trust, witnessed transaction, and ritual proof for millennia.
Varanasi the company brings that idea to machine commerce: **settlement you
can witness, enforced at the moment of payment.**

## Problem (one paragraph)

Autonomous agents are entering commerce with credentials built for humans —
API keys, session keys, standing approvals, raw private keys. A single
injected prompt, hallucinated address, or stolen key drains a treasury, and
nothing in the payment path checks identity, authorization, or work quality
at the moment money moves. The card networks are shipping scoped credentials
(Visa TAP, Mastercard AP4M), but as of writing neither has published a
binding agent-dispute rule, and the Agentic Commerce Protocol's written answer
assigns the loss to the merchant and PSP. Every layer of the agent stack has
an owner except the loss. (Sources: `company/02-market-analysis.md` §5.)

## Vision

A world where a trillion dollars of agent-orchestrated commerce settles
**on proof, not on promises** — where hiring an AI agent is as bounded,
auditable, and revocable as hiring a contractor.

## Mission

Make the enforcement rail for agentic commerce: **one signed mandate bounds
one escrowed task**, identity is revocable in one click, and payment releases
only when work clears a bar — with every decision leaving evidence onchain.

## Values (with teeth — each has a matching engineering rule)

| Value | The rule that enforces it |
|---|---|
| **Enforcement over intention** | Checks live in contracts in the money path, never only in prompts or policy docs (architecture P1). |
| **Fail closed** | Any doubt — missing identity, stale attestation, unverifiable human — returns the safe answer (`tierFor` returns `guest`). |
| **Evidence, not screenshots** | Every claim ships with a tx hash, receipt link, or test run. `docs/DEMO.md` is the format. |
| **The user owns the keys, the data, the exit** | Non-custodial by construction; no owner sweep exists; MIT license; chain is the backup if we disappear. |
| **Honest adversarial defaults** | We publish our own accepted risks (`docs/SECURITY_REVIEW.md`) and test debt (`docs/architecture/05-testing-strategy.md` §6). |
| **Community product** | Anyone can fork the repo and paste `PROMPT.md` into any agent; the protocol must work without us. |

## Company objectives (2026–2027)

1. **Ship mainnet-grade rails**: audited contracts, multisig+timelock admin,
   L2 settlement. Gate: security checklist in
   `docs/architecture/03-security-architecture.md` §5 fully green.
2. **Prove demand**: 100 externally-funded escrow tasks settled with ≥ 2
   independent validator sets in operation.
3. **Become interoperable**: mandates remain AP2-shaped; x402-native payments;
   ERC-8004 read-side identity — varanasi is a rail, not a walled garden.
4. **Stay solvent without selling custody**: revenue from protocol fees and
   signal subscriptions (`company/06-business-model.md`), never from holding
   user funds.

## What we will not do

- Hold user keys or custody user funds (escrow is a contract, not a balance
  sheet).
- Ship unaudited contracts to mainnet.
- Launch a token as a substitute for product-market fit. (Any future token
  decision requires the governance process in `company/15-governance.md` §5
  and legal review first.)
- Compete on agent intelligence. We are the rail agents run on — model
  quality is our partners' business.

## Founding

Founded by Ramprasad (CEO/CTO). Built in the open at
`github.com/Ramprasad4121/varanasi`, MIT-licensed, from ETHOnline 2026
(testnet-live, evidence-backed) into a company. Legal formation steps in
`company/10-legal-compliance.md`.
