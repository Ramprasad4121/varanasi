# Tutorial — your first full run of varanasi

Author: Ramprasad

One path, no assumed knowledge. By the end you have hired an agent, watched a
funded→validated→released (or refunded) flow, and seen your community-finance
vault. Everything is demo-safe: **no real funds move** unless you explicitly
run the paid signal path.

Time: ~30 minutes. Works on the live site (Vercel) or locally with `./run.sh`.

## 0. Prerequisites

- A browser (live site) **or** the repo + Node 24 (local).
- Live site: just open the homepage. Local: `./run.sh` then
  http://localhost:3000.

## 1. Create an account

Use the **Sign in** control in the nav.

| Option | Result |
|---|---|
| Email / Google / GitHub | Account + self-custodial embedded Sepolia wallet created for you |
| Wallet (MetaMask, etc.) | Your existing address |

The product never stores private keys. Your vault keyed to your identity:
hires, listed agents, treasury follow the account.

## 2. Hire an agent

1. From the homepage, open **Hire** (or use the agent list at `/agents`).
2. Pick a worker type — **Scout**, **Analyst**, or **Freelancer**.
3. Set the guardrails: **cap** (max spend), **window** (hours), **expiry**.
4. **Authorize & fund** — funds lock in escrow, replay impossible (nonce
   nullified).

Watch the lifecycle on the agent card:
`Funded → Validated → Released` (paid to the merchant) or `Refunded`
(work missed the bar). Your signed hire appears in **`/account`**.

## 3. See the live flows on-chain (proof, not screenshots)

Open `/proof` (or the "Start as a human" links in the README). Every claim
links to Etherscan / HashScan:

- An escrow released on Etherscan
- An x402 payment settled on HashScan
- An agent identity minted on Etherscan

## 4. Tour your community-finance vault

Open **`/finance`**.

1. Read your portfolio — savings vault, chit fund, term loan, gold-backed
   collateral, and a credit score.
2. Read what your steward **recommends** (e.g. contribute more this month).
3. If you have an address, load **your** deterministic portfolio via the
   address form — the same address always yields the same portfolio.

Every figure is labeled **simulated**. The agent's `execute()` throws until
the finance contracts go live, so no demo state ever broadcasts.

## 5. (Optional) Pay for one premium alpha signal — real $0.01

This is the only step that spends real testnet money and only from the **agent**
side — the human payer stays spend-free:

```bash
cd agent && npx tsx src/cli.ts analyze \
  --agent sentinel-1.aegis.eth \
  --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp
```

ENS identity → live Uniswap intel (The Graph) → $0.01 USDC x402 payment
(Hedera testnet) → ACT/SKIP verdict → RiskGuard check → HashScan receipt.
See `service/README.md` for receiver setup. Runs only when you explicitly
invoke it.

## You're done

You've used the product as a user: account → hire → escrow → verdict →
finance vault. Next:

- Run it as an **agent**: paste [`PROMPT.md`](../PROMPT.md) into any coding agent.
- Deploy work: see [`HOWTO.md`](HOWTO.md).
- Facts: [`REFERENCE.md`](REFERENCE.md). Semantics: [`MANDATE.md`](MANDATE.md).