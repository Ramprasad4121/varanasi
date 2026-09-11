# Step 3 · Competitive Landscape & Positioning

Author: Ramprasad · 2026-09-11 · Status: DONE (living document — refresh as
the space moves monthly)

## 1. Map of the enforcement problem space

Axes: **who enforces** (network/rail vs. contract) × **what settles** (card
money vs. onchain money). Varanasi sits in the only quadrant that combines
permissionless verification with machine-native settlement.

|  | Card rails settle | Onchain settles |
|---|---|---|
| **Network enforces** (closed, permissioned) | Visa Intelligent Commerce / TAP; Mastercard Agent Pay / AP4M | Mastercard's onchain permission storage ( Polygon/Solana/Base) |
| **Contract enforces** (open, permissionless) | — (Agentic Commerce Protocol spec assigns loss to merchant/PSP) | **Varanasi** (mandate escrow + revocable identity + gated release) |

## 2. Competitor classes

### A. Card networks (Visa TAP, Mastercard AP4M)
Strengths: distribution, merchant acceptance, fraud tooling (Agent Score,
Large Transaction Model).
Gaps (as of writing): no binding agent-dispute rule; liability assigned to
merchant/PSP; agent permissions are data, not escrowed funds; card economics
do not clear sub-cent machine calls well [sources in
`02-market-analysis.md` §6].
**Our posture**: complement, not compete. AP2-shaped mandates mean a varanasi
mandate can gate card-settled commerce where issuers want it; we interoperate,
they distribute.

### B. Wallet/session-key infrastructure (safe.session, session keys, MPC
wallets, spend-limited keys)
Strengths: good key hygiene, per-session spend limits, fast UX.
Gaps: enforcement lives *with the key holder's policy engine*; the agent
still transacts from the principal's balance; no task-level escrow, no
merchant-bound release condition, no evidence trail, no identity revocation
semantics.
**Our posture**: their tech handles *custody*; varanasi handles *the task*.
TaskEscrow can sit behind any wallet; we are the settlement condition.

### C. x402 facilitators and agent-payment gateways (incl. Coinbase
Agent.market ecosystem)
Strengths: machine-native HTTP payments at scale (165M tx), real adoption.
Gaps: x402 pays per call; it does not hold funds against work, verify
identity liveness, or gate release on proof. A paid signal can still be wrong
and the money is gone.
**Our posture**: varanasi is a heavy x402 user and builds *on* it (paid
signals today). We add the escrow/identity layer x402 deliberately does not
have. Agent.market-style marketplaces are a distribution channel for
mandate-hired agents.

### D. Agent frameworks & orchestration (LangChain/CrewAI-class, agent
wallets built into platforms)
Strengths: developer mindshare.
Gaps: policy enforcement is offchain config; "spend limits" are advisory
prompts unless backed by contracts (architecture principle P1).
**Our posture**: be the settlement layer any framework plugs into; publish
SDK functions (roadmap P2) rather than compete on orchestration.

### E. Onchain escrow/arbitration incumbents (Kleros-class arbitration,
freelance escrow protocols)
Strengths: dispute resolution depth.
Gaps: human-jury latency and cost; not agent-identity-aware; not
machine-speed.
**Our posture**: varanasi's default is deterministic release/refund, with
arbitration as an optional escalation layer (deferred scope,
`docs/MANDATE.md` §2).

## 3. Why varanasi wins (the moat, honestly)

1. **Enforcement at settlement is architecturally first**: escrowed funds +
   onchain gates mean our guarantees do not depend on our servers, our
   honesty, or our survival. Policy-engine competitors cannot claim this
   without re-architecting.
2. **Identity with a kill switch**: ENSv2-native, revocable, expiring agent
   identity (`*.aegis.eth`) re-checked live at settlement — one revoke closes
   escrow release and Uniswap v4 execution in the same block.
3. **Evidence as a product**: every task emits an event trail; payments leave
   mirror-node receipts; audits land on HCS. Compliance teams can *verify*
   rather than *trust*.
4. **Standards leverage as distribution**: EIP-712, ENS, ERC-8004, AP2
   shape, x402, Uniswap v4 hooks — each standard we implement is a community
   we inherit.
5. **Working system today, in the open**: not a whitepaper architecture —
   153 agent tests, CI-green contracts, live testnet deployments with
   onchain evidence (`docs/DEMO.md`). Openness is the moat against
   closed-rail capture.

Sustaining the moat requires: mainnet security posture (audits, multisig),
developer experience (SDK/CLI quality), and being the default rail in
agent marketplaces — tracked as strategic risks in `14-risk-register.md`.

## 4. Positioning statement

> For agent platforms and operators who let autonomous agents move real
> money, **varanasi is the enforcement rail** that bounds every task in a
> signed mandate, escrows the funds, and releases them only on verified
> proof — because in agentic commerce, the check must live where the money
> moves.

Anti-position (what we are not): not an agent builder, not a model provider,
not a custodian, not a card network replacement.
