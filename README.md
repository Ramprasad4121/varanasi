# varanasi

Humans authorize autonomous agents — and agents prove it onchain before they act.
Each agent carries a revocable `*.aegis.eth` identity (ENSv2, Sepolia), reasons
over live Uniswap data (The Graph), and pays per API call in USDC on Hedera
testnet (x402 via the Blocky facilitator). A full loop — resolve → intel →
pay → verdict → guard check — runs in one CLI command, ~11 seconds.

> Rebrand note: formerly built as "AEGIS". Deployed Sepolia contracts
> (`AegisRegistry`, `RiskGuard`) and env vars (`AEGIS_REGISTRY`, …) keep
> their names — immutable onchain, so no redeploy for the rename.

## Live proof (not screenshots — click through)

| What | Where |
|---|---|
| `AegisRegistry` (Sourcify-verified) | [Sepolia `0x0aed80646680eb333e0d2129f6f0fa54503b5381`](https://sepolia.etherscan.io/address/0x0aed80646680eb333e0d2129f6f0fa54503b5381) |
| `RiskGuard` (Sourcify-verified) | [Sepolia `0xc35861c4dbe63a9c8cfefd32c671998151c217ca`](https://sepolia.etherscan.io/address/0xc35861c4dbe63a9c8cfefd32c671998151c217ca) |
| Agent mint (`sentinel-1`, 90d) | [tx `0xaac0018d…c327`](https://sepolia.etherscan.io/tx/0xaac0018d2906e5773f5c28e14a49e54b02a8c4156f06c6a9473e74ccebc7c327) |
| Paid x402 call ($0.01 USDC agent → service) | [HashScan `0.0.7162784-1788675749-710110370`](https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370) |
| Paid x402 call (second run) | [HashScan `0.0.7162784-1788676249-125024441`](https://hashscan.io/testnet/transaction/0.0.7162784-1788676249-125024441) |
| HCS payment audit topic | [HashScan topic `0.0.10389504`](https://hashscan.io/testnet/topic/0.0.10389504) |
| Uniswap v4 hook (live, attested 200bps) | [Sepolia `0xf3710a05cbb61eb8b1a73886eb68a341f69d0080`](https://sepolia.etherscan.io/address/0xf3710a05cbb61eb8b1a73886eb68a341f69d0080) |

Full evidence log: [`docs/DEMO.md`](docs/DEMO.md).

## How it works

```
Human (EOA / Privy embedded wallet / World-verified)
  │ mints + funds + can revoke anytime
  ▼
AegisRegistry (Sepolia) → agent wallet bound to sentinel-1.aegis.eth
  │ expiring, revocable, single source of truth: isAuthorized(wallet)
  ▼
varanasi agent (TypeScript)
  │ 1. resolves the ENSv2 name → wallet + authorization
  │ 2. pulls live pool data from the official Uniswap V3 subgraph (The Graph gateway)
  │ 3. buys a premium alpha signal over x402 ($0.01 USDC, Hedera testnet, Blocky facilitator)
  │ 4. reasons → risk score in bps → ACT / SKIP (heuristic, or --llm with fallback)
  │ 5. static-checks RiskGuard.authorize onchain (never sends a tx for the check)
  ▼
Outcome: verdict JSON with factor breakdown + HashScan receipt.
Enforcement: AegisHook (Uniswap v4 beforeSwap) reverts unauthorized / over-threshold swaps.
Audit: every paid call is also logged to a Hedera Consensus Service topic.
```

Remove any one of identity, data, or payments and the loop cannot run —
each sponsor integration is load-bearing, not decorative.

## Quickstart

Prereqs: Node 24, Foundry, a Sepolia RPC URL, two Hedera testnet ECDSA
accounts (agent funded with testnet USDC from `faucet.circle.com`), and a
Subgraph Studio API key. Secrets live in gitignored `.env` files — see
`service/.env.example` and `agent/.env.example`. Never commit keys.

```bash
# 1. paid signal service (Hedera x402, Blocky testnet facilitator)
cd service && npm install && npm run dev        # :4021

# 2. agent — one command, full loop (~11s)
cd ../agent && npm install
npx tsx src/cli.ts analyze \
  --agent sentinel-1.aegis.eth \
  --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp

# 3. frontend marketplace
cd ../frontend && npm install && npm run dev    # :3000
```

Contracts:

```bash
cd contracts && forge test                      # 36/36 (registry, guard, v4 hook)
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --broadcast \
  --sender $ADDR --private-key $SEPOLIA_PRIVATE_KEY
```

Optional: `--llm` (OpenAI-compatible reasoning with heuristic fallback),
`--skip-pay` (intel-only), `--pair` (Uniswap V2 leg).

## Repo map

- `contracts/` — Foundry: `AegisRegistry`, `RiskGuard`, `AegisHook` (Uniswap v4),
  ENSv2 wiring, deploy scripts, 36 tests
- `agent/` — TS agent: ENS resolve, Graph gateway client (+ MCP wrapper,
  `SKILL.md` for reuse), x402 payer, heuristic + LLM brain, CLI
- `service/` — x402-gated alpha API (Blocky facilitator), HCS audit logging
- `frontend/` — Next.js marketplace: agents, pool intel, paid signals,
  verdicts + `/human` (World Selfie tiers) + `/privy` (embedded-wallet treasury)
- `cre/` — Chainlink CRE confidential workflow: private thresholds in TEE,
  public verdict out
- `bazantic/` — gateway OpenAPI + multi-service recipe spec
- `docs/` — `ARCHITECTURE.md`, `DEMO.md` (evidence), `SECURITY_REVIEW.md`,
  `VIDEO_SCRIPT.md`

## Prize tracks (ETHOnline 2026, From Scratch)

Entered: **The Graph** (AI use case — live subgraphs as the agent's data
source + reusable MCP tooling), **ENS** (agents as expiring, revocable
`*.aegis.eth` subnames — identity is the auth layer), **Hedera** (live
x402 service on testnet settled via Blocky + HCS audit trail).
Extended in-repo: Uniswap (v4 risk-hook), Privy (embedded-wallet treasury),
World (Selfie-gated agent tiers), Chainlink (confidential risk in TEE),
Bazantic (sponsor-spanning recipe).

## Security posture

Contracts hold no funds and take no oracles; ENS fan-out is post-commit +
try/catch; immutable, no proxies/delegatecall. Source-verified on Sepolia
via Sourcify. Secrets never touch git (gitignored envs + a credential-blocking
pre-push hook). Known tradeoffs (single-EOA admin, post-settlement request
validation, HBAR-leg facilitator behavior) are written up in
[`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) and `docs/DEMO.md`.

## License

MIT — see [LICENSE](LICENSE).
