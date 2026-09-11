# Architecture Documentation — varanasi

Author: Ramprasad · 2026-09-11

This directory is the **company-grade architecture record** for varanasi. It
complements — and does not replace — the historical hackathon record in
[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) (sponsor narrative) and the
protocol spec in [`docs/MANDATE.md`](../MANDATE.md) (normative mandate
semantics). Where the three disagree, the order of authority is:

1. **Code** (`contracts/src`, `agent/src`, `service/src`, `frontend/`)
2. `docs/MANDATE.md` (protocol spec)
3. These documents (system view)

## Reading order

| # | Document | Question it answers |
|---|----------|---------------------|
| 1 | [`01-system-architecture.md`](01-system-architecture.md) | What are the moving parts and how do they connect? |
| 2 | [`02-data-architecture.md`](02-data-architecture.md) | Where does data live, who owns it, how long does it survive? |
| 3 | [`03-security-architecture.md`](03-security-architecture.md) | What is the trust model and what are we defending against? |
| 4 | [`04-infrastructure.md`](04-infrastructure.md) | How is it deployed, observed, and recovered? |
| 5 | [`05-testing-strategy.md`](05-testing-strategy.md) | How do we prove it works before users depend on it? |

## System snapshot (verified 2026-09-11)

- **Contracts**: 5 Solidity files, 1,508 lines, solc `0.8.26`, `via_ir = true`,
  Foundry. Deployed on Sepolia (chain 11155111). CI green on `main`
  (forge build + test).
- **Agent**: TypeScript CLI + workers, 153/153 vitest tests green.
- **Service**: Express 5 TypeScript, x402-gated paid routes, Hedera testnet
  payments, HCS audit topic.
- **Frontend**: Next.js 14 App Router, Privy auth, 9 routes, zero-console-error
  policy in E2E.
- **E2E**: 132 cases, tiers 1–4 (+ adversarial tier 5), 106/106 tiers 1–3
  verified locally 2026-09-11.

## Canonical deployments (Sepolia)

Source of truth: `frontend/lib/site.ts` and `agent/src/mandate.ts` defaults.
Historical demo-phase addresses live in [`docs/DEMO.md`](../DEMO.md).

| Contract | Address | Role |
|---|---|---|
| `TaskEscrow` | `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24` | Mandate-gated ERC20 escrow |
| `AegisRegistry` | `0x3913f1E6A0Be93180363aBd01Df7968d494033A8` | ENSv2-backed agent identity |
| `RiskGuard` | `0x668c01aE564D51baFF0029D361c20c534d738400` | Identity/score authorization gate |
| `AegisHook` | `0x05043B527D67d7E4e3a2ed411fFBD15b8255c080` | Uniswap v4 `beforeSwap` gate |
| `MockERC20` (vUSD) | `0x6169A84cD7430042fb697c2cC131F663212E8b30` | Demo settlement token (6 dec) |

The whitepaper is [`docs/WHITEPAPER.md`](../WHITEPAPER.md). The company
build (strategy, org, finance, GTM, risk) is [`company/`](../../company/).
