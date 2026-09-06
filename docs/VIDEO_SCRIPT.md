# Video script — varanasi 2-min demo (8 × 15s beats)

Total ~2:00. Each beat: say it → run cmd → show expected output.

## Beat 1 — Hook (0:00–0:15)

Say: "Humans authorize agents. Agents pay per call. Everything is revocable."

- Cmd: none (title card)
- Expected: repo + architecture diagram on screen
- Link: `docs/ARCHITECTURE.md`

## Beat 2 — Identity (0:15–0:30)

Say: "The agent is `sentinel-1.aegis.eth` — an ENSv2 subname bound to a wallet, expiring, revocable."

- Cmd: `npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp --skip-pay` (repo: `agent/`)
- Expected: `"authorized": true, "revoked": false`, `mode: "registry-only"` (or `"registry+ens"`)
- Link: `docs/DEMO.md` §1 — AegisRegistry `0x0aed80646680eb333e0d2129f6f0fa54503b5381` (Sourcify-verified)

## Beat 3 — Intel (0:30–0:45)

Say: "Live Uniswap V3 intel from The Graph — no mocks."

- Cmd: same as Beat 2 (intel leg)
- Expected: pool USDC/WETH 0.05%, TVL ~$416.7M, lifetime vol ~$604B
- Link: `docs/DEMO.md` §2 — subgraph `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV`

## Beat 4 — Pay (0:45–1:00)

Say: "Premium alpha costs $0.01 USDC on Hedera testnet — agent pays per call via x402."

- Cmd: full loop without `--skip-pay` (needs funded `HEDERA_AGENT_ACCOUNT_ID`)
- Expected: paid receipt with `txHash`, e.g. `0.0.7162784-1788675749-710110370`
- Link: https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370 (`docs/DEMO.md` §3)

## Beat 5 — Verdict (1:00–1:15)

Say: "Heuristic reasoning fuses intel + alpha into a risk score and an ACT/SKIP verdict."

- Cmd: same full loop (verdict in JSON output)
- Expected: `riskScoreBps: 200, decision: ACT`, threshold 5000bps; `guard.wouldPass: true`
- Link: `docs/DEMO.md` §4 — RiskGuard `0xc35861c4dbe63a9c8cfefd32c671998151c217ca`

## Beat 6 — Revoke (1:15–1:30)

Say: "The human pulls the plug — revoke by label, authorization flips to false."

- Cmd: `SUBLABEL=sentinel-1 AEGIS_REGISTRY=0x0aed80646680eb333e0d2129f6f0fa54503b5381 forge script script/Revoke.s.sol --rpc-url sepolia --broadcast` (repo: `contracts/`) or `npx tsx src/cli.ts revoke --label sentinel-1` (repo: `agent/`)
- Expected: `isAuthorizedBefore: true` → tx mined → `isAuthorizedAfter: false`
- Link: TODO (human run — paste Sepolia tx link here; slot: `docs/DEMO.md` §5)

## Beat 7 — Receipts (1:30–1:45)

Say: "Every paid call leaves a receipt — file-backed, surviving restarts."

- Cmd: `curl http://localhost:4021/v1/receipts`
- Expected: `{ "count": N, "receipts": [...] }` with HashScan links; persisted in `service/data/receipts.json`
- Link: `docs/DEMO.md` §3

## Beat 8 — Close (1:45–2:00)

Say: "varanasi: human-authorized agents, live intel, pay-per-call alpha. Links below."

- Cmd: none (links card)
- Expected: repo, DEMO.md, HashScan/Sepolia links on screen
- Link: TODO (upload video, paste URL here)
