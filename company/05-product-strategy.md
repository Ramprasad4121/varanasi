# Step 5 · Product Strategy & Roadmap

Author: Ramprasad · 2026-09-11 · Status: ACTIVE (reviewed per release)

## 1. Product thesis

Ship the **enforcement rail**, not the agent. The product is the guarantee:
one signed mandate bounds one escrowed task; identity is revocable; release
requires proof; everything leaves evidence. Everything we build either
strengthens that guarantee, makes it cheaper, or makes it easier to adopt.

## 2. Product principles

1. **Protocol first**: contracts are the product; UI and CLI are views onto
   the protocol (never the source of truth).
2. **Worst day is a refund**: any failure — stale identity, low score,
   missed window, dead company — must degrade to refund, never to loss.
3. **Boring where it's money**: minimal field set (9 mandate fields), strict
   gates, no exotic tokens, no partial release until specified and audited.
4. **A wedge you can paste into an agent**: `PROMPT.md`, one-command loops,
   `--no-mcp` offline modes — adoption via agent ecosystems.
5. **Every release ships evidence**: docs/DEMO.md refreshed or the release
   isn't done.

## 3. Current state (P0 — verified 2026-09-11)

| Capability | State | Evidence |
|---|---|---|
| Mandate-gated escrow (EIP-712, 9 fields, replay-proof) | Live, Sepolia | `contracts/src/TaskEscrow.sol`, DEMO §7 |
| Revocable expiring agent identity (ENSv2 `*.aegis.eth`) | Live | `AegisRegistry.sol`, DEMO §1 |
| Identity + score gate re-checked at settlement | Live | `RiskGuard.sol` |
| Execution gating at swap time | Live | `AegisHook.sol` (Uniswap v4 `beforeSwap`) |
| Machine-paid signals (x402, Hedera testnet) | Live | service + DEMO §3 (HashScan receipts) |
| Agent intelligence loop (ENS → Graph → pay → reason → verdict) | Live | `./run.sh agent`, DEMO §2–4 |
| Marketplace + hire wizard + vault + treasury | Live | frontend 9 routes, E2E tiers |
| Human tiers (World Selfie Check) | Integrated (sandbox) | `WORLD.md` |
| Quality gates | 153 agent tests; 106/106 E2E t1–3; CI green | CI + local runs |

## 4. Roadmap

### P1 — Mainnet-ready company (Q4 2026)
- Company formation, IP assignment, security program start (steps 10, 12).
- Contracts frozen → **two independent audits** (TaskEscrow +
  AegisRegistry first scope).
- Admin to **multisig + timelock**; token allowlist; validator quorum design
  (multi-validator with dispute window) specced.
- Invariant/fuzz suites: funds-conservation, state-machine exhaustiveness.
- Observability: staging deploy, onchain alerting (revocations, threshold
  changes), load gate pass (`docs/architecture/04-infrastructure.md` §6).
- Exit criteria: audit remediations merged, checklist
  (`docs/architecture/03-security-architecture.md` §5) green.

### P2 — Mainnet launch + SDK (H1 2027)
- Mainnet deployment on an L2 chosen by: escrow throughput, x402 facilitator
  support, USDC liquidity, ENS interoperability. (Candidates under
  evaluation; decision recorded here when made.)
- `@varanasi/sdk` (mandate signing, escrow client, identity) + npm package
  for the CLI; docs site; QuickNode/Alchemy-class RPC redundancy.
- Signal API GA (subscription tiers), HCS mainnet topic.
- Marketplace v2: agent listings with onchain reputation grounded in settled
  task history (payment-grounded, Sybil-resistant via human tiers + identity
  expiry).
- Exit criteria: first externally-funded mainnet task settled + refunded
  path exercised in production.

### P3 — Rail at network scale (H2 2027+)
- Validator network: decentralized score attestation with stake + slashing
  economics (spec + audit before any launch; token decision only via
  `15-governance.md` §5).
- AP2 interop conformance suite (mandate ↔ IntentMandate translation).
- Cross-chain mandate portability (today chainId binding is strict by
  design; relaxation is a spec change via RFC in `docs/MANDATE.md`).
- Deferred protocol features, only with updated spec + audits: partial
  release, multi-merchant allowlists, recurring caps, arbitration escalation.

## 5. Explicit non-goals

Model/agent intelligence, custody, card-network replacement, consumer
shopping UX, MEV/searcher activity, cross-margin credit.

## 6. Moat reinforcement per phase

P1: security posture (audits, multisig) — trust compounding.
P2: developer experience + marketplace lock-in via reputation histories.
P3: network effects of validators + data (settled-task reputation corpus).

## 7. Build-versus-wait list (what we deliberately deferred and the trigger)

| Deferred | Trigger to build |
|---|---|
| Multi-validator quorum | First design partner needing score disputes resolved |
| Partial release | Demand from freelance-style tasks with milestones |
| Arbitration hook | Enterprise procurement (ICP 4) requiring human escalation |
| Cross-chain mandates | Multi-chain agent fleets among customers |
| Token/governance decentralization | Sustainable fee revenue + legal clearance — never before |
