# varanasi

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

This is a **community product**. Hire from the homepage. Paste
[`PROMPT.md`](PROMPT.md) into any coding agent. Fork the repo.

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

| Mandate escrows released | x402 payments settled | Agent identities live | Tests green |
|---|---|---|---|
| 1+ | 3+ | 2 | 243/243 |

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

Paste [`PROMPT.md`](PROMPT.md) into any coding agent (Claude, Codex, Cursor).
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

## The old way vs the varanasi way

**Old way** — agent gets a private key and standing approvals. One injected
prompt, one hallucinated address, and the treasury drains.

**Varanasi way** — agent gets a signed mandate (cap, window, expiry, nonce).

1. Funds lock in escrow; replay impossible (nonce nullified).
2. Allowlisted validator scores the work; release needs score ≥ threshold
   **and** a live identity + threshold re-check, in the same transaction.
3. Miss the bar → auto-refund with evidence. Misbehave → human revokes the
   identity and every downstream gate closes.
4. Every payment feeds Sybil-resistant reputation and a Hedera audit topic.

## Zero in the way

- **Zero standing credentials** — agents hold mandates, never keys or allowances.
- **Zero trust in prompts** — checks run in contracts, not in the agent's head.
- **Zero double-spend** — nonces + escrowed funds, verified at settlement.
- **Zero lock-in** — AP2-shaped mandates, ERC-8004-native identity, any x402 rail.

## Map

- `contracts/` — `TaskEscrow`, `AegisRegistry`, `RiskGuard`, `AegisHook`
  (Uniswap v4), deploy scripts, forge tests
- `agent/` — mandate signing, escrow client, ENS + Graph + x402 + Aave MCP,
  demo workers (scout / analyst / freelancer), CLI
- `service/` — x402-gated alpha API, HCS audit log
- `frontend/` — marketplace, Hire wizard, `/account` vault, `/privy` treasury
- `cre/` — confidential risk workflow · `bazantic/` — gateway + recipe
- `docs/` — `MANDATE.md` (spec) · `DEMO.md` (evidence) · `SECURITY_REVIEW.md`

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
