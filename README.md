# varanasi

![ci](https://github.com/Ramprasad4121/varanasi/actions/workflows/ci.yml/badge.svg)
[![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![solidity](https://img.shields.io/badge/solidity-0.8.26-blue)](contracts)
[![zero deps](https://img.shields.io/badge/contract%20deps-zero-brightgreen)](contracts/src/lib)

**The enforcement rail for agentic commerce.** Hire an AI agent, lock a spending
cap, and pay only when the work is proven. Agents never hold your keys.

Author: Ramprasad · License: MIT

## What it is

Agents today move money on promises — signed intents, session keys, API
credentials. One injected prompt and the treasury drains.

Varanasi moves the check to where the money moves:

1. You sign a **mandate** (cap, window, expiry, nonce). Funds lock in escrow.
2. The agent works inside those bounds. Replay is impossible.
3. Release pays the merchant when the work clears the bar. Miss it — you are
   refunded, with the evidence onchain.
4. One click revokes the agent identity everywhere.

This is a **community product**. Hire from the homepage. Point any coding
agent at [`AGENTS.md`](AGENTS.md) — the repo is agent-first. Fork it.

Two new primitives raise the floor for everyone: **Akshaya** — reputation
that is only ever minted from settled escrow outcomes, decays on a 90-day
half-life, and cannot be transferred — and **GhatStream** — continuous
escrow, where payment flows per second and the payer can freeze the tap at
any instant, with the unearned remainder always returning. Specs:
[`docs/AKSHAYA.md`](docs/AKSHAYA.md), [`docs/GHATSTREAM.md`](docs/GHATSTREAM.md).

## Identity — how your data is kept

Sign in once. Hires, listed agents, and the treasury follow the account — not
the browser.

Varanasi uses **Privy** (not Apple, not a raw password file):

| You tap | What you get |
|---|---|
| Email, Google, or GitHub | An account you already have |
| Wallet (MetaMask, etc.) | The address you already use |
| First-time email/social | A **self-custodial embedded Sepolia wallet**, created for you |

The product **never stores private keys or raw passwords**. Better Auth / Privy
hold the session. The vault stores only public data: your 0x address, hire
receipts, listed agent names.

Open **Sign in** in the nav, or `/account` for the vault, or `/privy` for the
treasury dashboard (mint, fund, revoke).

Setup: copy `frontend/.env.example` → `frontend/.env.local`, set
`NEXT_PUBLIC_PRIVY_APP_ID` from [dashboard.privy.io](https://dashboard.privy.io).
Details in [`frontend/PRIVY.md`](frontend/PRIVY.md).

## Live onchain

| Mandate escrows released | x402 payments settled | Agent identities live | Local checks green |
|---|---|---|---|
| 1+ | 3+ | 2 | 204 (vitest + real-EVM harness) + full forge suites |

Proof, not screenshots: [`docs/DEMO.md`](docs/DEMO.md) — every row links to
Etherscan / HashScan.

## Start as a human

```bash
./run.sh        # boots signal service (:4021) + marketplace (:3000)
```

Needs: Node 24, gitignored `.env` files (`service/.env.example`,
`agent/.env.example`, `frontend/.env.example`). Never commit keys.

On the site: **Sign in** → **Hire** on any agent card → pick Scout, Analyst, or
Freelancer → lock cap / window / expiry → **Authorize & fund**. Watch Funded →
Validated → Released (or Refunded). Your vault at `/account` keeps the hire.

## Start as an agent

Paste [`AGENTS.md`](AGENTS.md) into any coding agent (Claude, Codex, Cursor).
It reads the repo in order and runs the full loop:

```
npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth \
  --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp
```

ENS identity → live Uniswap intel (The Graph) → $0.01 USDC x402 payment
(Hedera testnet) → ACT/SKIP verdict → RiskGuard check → HashScan receipt.

Or hire from the CLI:

```
npx tsx src/cli.ts hire --agent scout --cap 10 --window-hours 24
```

Lending intel: `npx tsx src/cli.ts lending markets --symbols USDC,WETH`.
Reputation: `npx tsx src/cli.ts reputation <agent>` reads the agent's Akshaya
score straight off the chain; `attest <taskId>` mints the soulbound receipt
for any settled task — permissionless, idempotent, capital-secured.

## The old way vs the varanasi way

**Old way** — agent gets a private key and standing approvals. One injected
prompt, one hallucinated address, and the treasury drains.

**Varanasi way** — agent gets a signed mandate (cap, window, expiry, nonce).

1. Funds lock in escrow; replay impossible (nonce nullified).
2. Allowlisted validator scores the work; release needs score ≥ threshold
   **and** a live identity + threshold re-check, in the same transaction.
3. Miss the bar → auto-refund with evidence. Misbehave → human revokes the
   identity and every downstream gate closes.
4. Every settled task feeds **Akshaya** — a soulbound, decaying score minted
   only from onchain outcomes — plus a Hedera audit topic.

## Zero in the way

- **Zero standing credentials** — agents hold mandates, never keys or allowances.
- **Zero trust in prompts** — checks run in contracts, not in the agent's head.
- **Zero double-spend** — nonces + escrowed funds, verified at settlement.
- **Zero lock-in** — AP2-shaped mandates, ERC-8004-native identity, any x402 rail.

## Map

- `contracts/` — zero-dependency Solidity: `TaskEscrow`, `AegisRegistry`,
  `RiskGuard`, `Akshaya`, `GhatStream`, `MockERC20` + in-repo libs
  (`src/lib/`: EIP712, ECDSA, SafeERC20, ReentrancyGuard), deploy scripts,
  forge tests
- `agent/` — TS CLI (`aegis`): mandate signing, escrow + Akshaya clients,
  ENS / Graph / x402 / Aave intel, demo workers, `revoke` kill switch
- `service/` — x402-gated signal API (Express, Hedera settlement), HCS audit
  log, adversarial test harness
- `frontend/` — Next.js marketplace: hire wizard, vault, treasury — zero
  raster bytes, all line-art SVG
- `docs/` — `MANDATE.md` · `AKSHAYA.md` · `GHATSTREAM.md` · `ARCHITECTURE.md`
  · `DEMO.md` (evidence) · `SECURITY_REVIEW.md`

## FAQ

**Is varanasi for agents or humans?**
Both. Humans set mandates, fund escrows, and hold the kill switch. Agents do
the work inside bounds they cannot exceed.

**How do I keep my hires if I switch devices?**
Sign in (email, Google, GitHub, or wallet). The vault is keyed to that
identity. Guests keep a copy in the current browser only.

**Which chains?**
Sepolia (contracts) + Hedera testnet (payments) today; mainnet cutover with
zero contract changes.

**What does it cost to run?**
One agent loop ≈ $0.01 USDC + Sepolia gas cents. Escrowed funds are the
user's own, refundable on expiry.

**Does Varanasi hold my keys?**
No. The embedded wallet is self-custodial via Privy recovery. The vault stores
public addresses and receipts only.
