# varanasi

**The enforcement rail for agentic commerce** — mandates verified at
settlement, reputation grounded in payment, release gated on proof.

AI agents move money on promises: signed intents, session keys, API
credentials. Every post-mortem — Bankr/Grok ($180K, Morse code), AIXBT
(55.5 ETH), ClawHavoc (341 malicious skills) — ends in the same place:
the check has to run where the money moves, not in the agent's head.
x402 disclaims budgets. AP2 punts disputes. ERC-8004 admits Sybil.
Varanasi is the layer all three leave open: an EIP-712 mandate bound to
an onchain escrow, released only on allowlisted validation plus a live
identity-and-threshold re-check, with every step auditable and every
payment feeding Sybil-resistant reputation.

Author: Ramprasad ([@Ramprasad4121](https://github.com/Ramprasad4121)) —
ETHOnline 2026. License: MIT.

## Live proof (click, don't trust)

| What | Where |
|---|---|
| `TaskEscrow` (Sourcify-verified) | [Sepolia `0xba038d50d70cf63ced17f3f23f77df4783f188da`](https://sepolia.etherscan.io/address/0xba038d50d70cf63ced17f3f23f77df4783f188da) |
| Mandate → fund → validate → release | [fund](https://sepolia.etherscan.io/tx/0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572) · [validate 8000](https://sepolia.etherscan.io/tx/0xfde951571e35eaa1d0206b139322d539697846c00c3e8d508b01b76b13b2c061) · [release](https://sepolia.etherscan.io/tx/0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702) |
| `AegisHook` (Uniswap v4, attested 200bps) | [Sepolia `0xf3710a05cbb61eb8b1a73886eb68a341f69d0080`](https://sepolia.etherscan.io/address/0xf3710a05cbb61eb8b1a73886eb68a341f69d0080) |
| `AegisRegistry` + `RiskGuard` (verified) | [`0x0aed…5381`](https://sepolia.etherscan.io/address/0x0aed80646680eb333e0d2129f6f0fa54503b5381) · [`0xc358…17ca`](https://sepolia.etherscan.io/address/0xc35861c4dbe63a9c8cfefd32c671998151c217ca) |
| Paid x402 signal ($0.01 USDC, Blocky) | [HashScan](https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370) · [second run](https://hashscan.io/testnet/transaction/0.0.7162784-1788676249-125024441) |
| HCS payment audit topic | [`0.0.10389504`](https://hashscan.io/testnet/topic/0.0.10389504) |

Full evidence: [`docs/DEMO.md`](docs/DEMO.md). Mandate spec: [`docs/MANDATE.md`](docs/MANDATE.md).

## How it works

```
Human (EOA / Privy wallet / World-verified human)
  │ signs an EIP-712 mandate: agent, merchant, token, cap, window, expiry, nonce
  ▼
TaskEscrow (Sepolia) — funds locked, nonce nullified, replay impossible
  │ allowlisted validator scores the work (last-write-wins, window-checked)
  ▼
Release gate (one transaction, all inline):
  validation score ≥ threshold AND RiskGuard.authorize(agent) live
  → merchant paid, TaskReleased event, ERC-8004 feedback emitted (payer-rated)
  else → refund after expiry, evidence appended
```

Guard rails around it: `AegisRegistry` (revocable `*.aegis.eth` identity),
`AegisHook` (Uniswap v4 swaps revert for unauthorized/over-threshold agents),
x402 metering for agent API spend, HCS audit trail for every payment.

## Quickstart

Prereqs: Node 24, Foundry, Sepolia RPC, Hedera testnet ECDSA accounts (agent
funded with testnet USDC), Subgraph Studio key. Secrets live in gitignored
`.env` files (`service/.env.example`, `agent/.env.example`). Never commit keys.

```bash
# contracts — 86 tests
cd contracts && forge test

# x402 signal service (Hedera, Blocky facilitator) — :4021
cd service && npm install && npm run dev

# agent — full loop: ENS → Graph intel → paid signal → verdict → guard check
cd agent && npm install
npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth \
  --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp

# mandate → escrow loop (offline sign, then fund/validate/release)
npx tsx src/cli.ts mandate --agent $AGENT --merchant $MERCHANT --token $TOKEN \
  --cap 10000000 --window-start $WS --window-end $WE --expiry $EX \
  --private-key $PAYER_KEY

# frontend marketplace — :3000
cd frontend && npm install && npm run dev
```

## Repo map

- `contracts/` — `TaskEscrow` (mandates + escrow + validation), `AegisRegistry`
  (identity), `RiskGuard` (threshold gate), `AegisHook` (v4 swaps),
  `MockERC20`, deploy scripts, 86 forge tests
- `agent/` — mandate signing (EIP-712), escrow client, ENS resolve, Graph
  gateway + MCP tooling (`SKILL.md`), x402 payer, heuristic + LLM brain, CLI
- `service/` — x402-gated alpha API (Blocky facilitator), HCS audit logging
- `frontend/` — marketplace: agents, pool intel, paid signals, verdicts,
  `/human` (World tiers), `/privy` (embedded-wallet treasury)
- `cre/` — Chainlink CRE confidential workflow (private thresholds in TEE)
- `bazantic/` — gateway OpenAPI + multi-service recipe
- `docs/` — `MANDATE.md` (spec), `ARCHITECTURE.md`, `DEMO.md` (evidence),
  `SECURITY_REVIEW.md`, `VIDEO_SCRIPT.md`

## Prize tracks (ETHOnline 2026, From Scratch)

Entered: **The Graph** (live subgraphs as the agent's data source + reusable
MCP tooling), **ENS** (expiring, revocable `*.aegis.eth` identity as the auth
layer), **Hedera** (live x402 service settled via Blocky + HCS audit trail).
Extended in-repo: Uniswap (v4 risk-hook), Privy (treasury + human override),
World (human-verified tiers), Chainlink (confidential risk), Bazantic (recipe).

## Security posture

Escrow is the only value-holding contract: CEI + `ReentrancyGuard` +
`SafeERC20`, no payable, no owner sweep, pull settlement. Everything
source-verified via Sourcify. Secrets never touch git (ignored envs +
credential-blocking pre-push hook). Accepted tradeoffs (single-EOA admin on
testnet, `tx.origin` attribution in hook demo paths, post-settlement request
validation) are written up in [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md).

## License

MIT — see [LICENSE](LICENSE).
