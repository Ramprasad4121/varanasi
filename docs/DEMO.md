# Demo evidence — varanasi end-to-end (all live, 2026-09-06)

Author: Ramprasad

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
- Note: service `/v1/receipts` is file-backed (`service/data/receipts.json`,
  last 100); the mirror node + HashScan links are the durable proof.

## 4. Verdict

- `riskScoreBps: 200, decision: ACT` with factor breakdown
  (liquidity/activity/alpha), threshold 5000bps.

## 5. Enforcement (Uniswap v4 hook, Sepolia)

- AegisHook `0xf3710a05cbb61eb8b1a73886eb68a341f69d0080` (Sourcify-verified,
  `beforeSwap`-only bits `...0080`, deployed via canonical CREATE2, salt `0x135d`)
- Wired: PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`,
  RiskGuard `0xc358…17ca`, default cap 5000bps, owner = deployer
- Attested: deployer agent score 200bps, 30d TTL (`agentRisk` onchain)
- Gate order per swap: PoolManager-only → registry identity → fresh
  attestation → RiskGuard re-check → `SwapAuthorized` event, zero fee delta

## 7. Escrow loop (mandate → fund → validate → release, all live)

- TaskEscrow `0xba038d50d70cf63ced17f3f23f77df4783f188da` (Sourcify-verified),
  threshold 5000bps, validator = deployer (allowlisted
  [tx](https://sepolia.etherscan.io/tx/0x9353081df46a8805129b301cac91808ab16f2a74beb83c37d7fb6308d116a01e))
- Mock token vUSD `0x6169A84cD7430042fb697c2cC131F663212E8b30` (6 decimals,
  minted 1000 to deployer)
- Approve escrow 10 vUSD:
  [tx](https://sepolia.etherscan.io/tx/0x00b7513d35719561dc06fb679c3bcebaf71f2109ca4857f433c7a65f326b25ec)
- Signed EIP-712 mandate (agent=deployer, merchant=dEaD, cap 10 vUSD,
  window 1h, expiry 24h) via `npx tsx src/cli.ts mandate …` (repo: `agent/`);
  taskId `0x03c850258e7ec98a7034e95103d1afe27a4b334a09a238041cba86cadba554dc`
- Fund: [tx](https://sepolia.etherscan.io/tx/0x1a3765459f57f7b7af607623a5bface64680d771032695f6c9fa34915886f572)
  (`TaskFunded`, status 1)
- Validate score 8000:
  [tx](https://sepolia.etherscan.io/tx/0xfde951571e35eaa1d0206b139322d539697846c00c3e8d508b01b76b13b2c061)
- Release: [tx](https://sepolia.etherscan.io/tx/0x94b44e473c0746ed365e8714000ef41a7f21bbc4276c9aca29b9d134651eb702)
  (RiskGuard `Authorized` + 10 vUSD escrow→merchant + `TaskReleased`;
  `taskState` = Released)

## 8. Revoke (human run — evidence slot)

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
