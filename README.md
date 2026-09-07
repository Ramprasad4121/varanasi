# varanasi

**The enforcement rail for agentic commerce.** Agents move money on promises —
signed intents, session keys, API credentials. Varanasi moves the check to
where the money moves: mandates verified at settlement, reputation grounded
in payment, release gated on proof.

Author: Ramprasad · License: MIT · ETHOnline 2026

## Live onchain

| Mandate escrows released | x402 payments settled | Agent identities live | Forge tests green |
|---|---|---|---|
| 1+ | 3+ | 2 | 86/86 |

Proof, not screenshots: [`docs/DEMO.md`](docs/DEMO.md) — every row links to
Etherscan / HashScan. Repo: `github.com/Ramprasad4121/varanasi`.

## Start as an agent — one prompt

Paste [`PROMPT.md`](PROMPT.md) into any coding agent (Claude, Codex, Cursor).
It reads the repo in order and runs the full loop in one command:

```
npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth \
  --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp
```

ENS identity → live Uniswap intel (The Graph) → $0.01 USDC x402 payment
(Hedera testnet) → ACT/SKIP verdict → RiskGuard check → HashScan receipt.
~11 seconds, JSON out.

## Start as a human — one command

```bash
./run.sh        # boots signal service (:4021) + marketplace (:3000)
./run.sh agent  # fires the full agent loop once
```

Needs: Node 24, gitignored `.env` files (see `service/.env.example`,
`agent/.env.example`). Never commit keys.

## The old way vs the varanasi way

**Old way** — agent gets a private key and standing approvals. One injected
prompt, one hallucinated address, and the treasury drains. Bankr/Grok
($180K, Morse code), AIXBT (55.5 ETH). No budget model, no escrow, no audit.

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
  (Uniswap v4), deploy scripts, 86 forge tests
- `agent/` — mandate signing, escrow client, ENS + Graph + x402, CLI
- `service/` — x402-gated alpha API, HCS audit log
- `frontend/` — marketplace + `/human` + `/privy`
- `cre/` — confidential risk workflow · `bazantic/` — gateway + recipe
- `docs/` — `MANDATE.md` (spec) · `DEMO.md` (evidence) · `SECURITY_REVIEW.md`
  · `SUBMISSION.md` · `VIDEO_SCRIPT.md` · `KEYS.md`

## FAQ

**Is varanasi for agents or humans?**
Agents first. Humans set mandates, fund escrows, and hold the kill switch —
agents do everything else inside bounds they cannot exceed.

**Which chains?**
Sepolia (contracts) + Hedera testnet (payments) today; mainnet cutover
planned with zero contract changes.

**What does it cost to run?**
One agent loop ≈ $0.01 USDC + Sepolia gas cents. Escrowed funds are the
user's own, refundable on expiry.

**Production ready?**
Testnet-proven with mainnet cutover tracked in `docs/SUBMISSION.md`.
Contracts hold only user-escrowed funds, are Sourcify-verified, and carry
no owner sweep.
