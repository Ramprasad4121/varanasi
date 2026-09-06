# Demo evidence — varanasi end-to-end (all live, 2026-09-06)

One command runs the whole loop:
`npx tsx src/cli.ts analyze --agent sentinel-1.aegis.eth --pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --no-mcp`
(repo: `agent/`; needs `agent/.env` — gitignored, never committed)

## 1. Identity (ENSv2 / Sepolia)

- AegisRegistry `0x0aed80646680eb333e0d2129f6f0fa54503b5381` (Sourcify-verified)
- RiskGuard `0xc35861c4dbe63a9c8cfefd32c671998151c217ca` (Sourcify-verified)
- Mint tx `0xaac0018d2906e5773f5c28e14a49e54b02a8c4156f06c6a9473e74ccebc7c327`
  (AgentMinted: tokenId 1, `sentinel-1`, owner=agent wallet, 90d expiry)
- `isAuthorized(deployer)` → true; CLI reports `authorized: true, revoked: false`
- RiskGuard static `authorize(wallet, 200, 5000)` → `wouldPass: true`

## 2. Intel (The Graph, live Gateway)

- Subgraph `5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV` (official Uniswap V3)
- Pool `0x88e6a0c2...` USDC/WETH 0.05%: TVL ~$416.7M, lifetime vol ~$604B
- Curated pools pinned (spam-TV L filter documented in `agent/src/graph.ts`)

## 3. Alpha (Hedera x402, Blocky testnet facilitator)

- Service `http://localhost:4021` (`/v1/signal` $0.01 USDC or 0.01 HBAR,
  facilitator `https://api.testnet.blocky402.com`)
- Paid tx `0.0.7162784-1788675749-710110370` — CRYPTOTRANSFER SUCCESS,
  -10000 microUSDC (`0.0.429274`) from agent `0.0.10383444` to service
  `0.0.10384527`. HashScan:
  `https://hashscan.io/testnet/transaction/0.0.7162784-1788675749-710110370`
- Paid tx `0.0.7162784-1788676249-125024441` — same path, second run. HashScan:
  `https://hashscan.io/testnet/transaction/0.0.7162784-1788676249-125024441`
- Note: service `/v1/receipts` is in-memory (resets on restart); the mirror
  node + HashScan links are the durable proof.

## 4. Verdict

- `riskScoreBps: 200, decision: ACT` with factor breakdown
  (liquidity/activity/alpha), threshold 5000bps.

## 5. Revoke (human run — evidence slot)

- Cmd (forge): `SUBLABEL=sentinel-1 AEGIS_REGISTRY=0x0aed80646680eb333e0d2129f6f0fa54503b5381 forge script script/Revoke.s.sol --rpc-url sepolia --broadcast` (repo: `contracts/`)
- Cmd (agent): `npx tsx src/cli.ts revoke --label sentinel-1` (repo: `agent/`; needs `OWNER_PRIVATE_KEY` = human owner key)
- Expected: `isAuthorizedBefore: true` → tx mined → `isAuthorizedAfter: false`
- Revoke tx: TODO (paste Sepolia tx hash + Etherscan link after human run)
- Post-revoke CLI check: TODO (paste `revoked: true, authorized: false` output)

## Known quirks (documented for judges)

- `@x402/hedera` `PrivateKey.fromString` on 0x-hex ECDSA keys yields
  facilitator-rejected signatures; `fromStringECDSA` is required
  (`agent/src/pay.ts`).
- Both facilitators reject the HBAR leg in preflight; the USDC leg settles.
  Payer prefers USDC, falls back to HBAR.
