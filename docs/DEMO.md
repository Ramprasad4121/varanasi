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

## 5. Reputation & streaming primitives (EVM-verified, deploy pending)

`Akshaya` (proof-of-outcome reputation) and `GhatStream` (continuous escrow)
are validated end-to-end on a real ethereumjs VM — 48 checks covering attest
→ coin/dust mint, double-attest refusal, soulbound refusal, 90d half-life
decay math (`10000 → 5000 → 1250`), post-revoke kill-switch behavior, stream
open/accrue/claim/stop/close, replay + unauthorized-agent refusal, and exact
funds conservation (`claimed + swept == escrowed`). Deploy through
`contracts/script/DeployInventions.s.sol`; live addresses land in
`contracts/README.md` § Sepolia and the frontend proof table on deploy.

- Retired: the Uniswap v4 `AegisHook`/DemoPool experiment was removed from the
  repo (2026-09-11); its live addresses remain onchain for history but are no
  longer maintained here. Enforcement lives at settlement now — `TaskEscrow`
  §6 below and `GhatStream` above.

## 6. Escrow loop (mandate → fund → validate → release, all live)

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

## 7. v2 hardened set (audit fixes, redeployed 2026-09-08)

All v2 contracts Sourcify-verified. Audit findings closed: label rules,
revoke-clears-mappings + unRevoke, 1825-day cap, 30-day attestation TTL,
pinned per-task threshold/validator, allowlist re-check at release,
cancel/refund split, zero-checks, 2-step ownership.

- AegisRegistry v2 `0x3913f1E6A0Be93180363aBd01Df7968d494033A8`
- RiskGuard v2 `0x668c01aE564D51baFF0029D361c20c534d738400`
- ~~AegisHook v2 `0x05043B527D67d7E4e3a2ed411fFBD15b8255c080`~~ — retired
  (see §5 note); the address stays live onchain as history.
- TaskEscrow v2 `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24`
  (validator allowlisted
  [tx](https://sepolia.etherscan.io/tx/0x71ebcaa3a8e91b2f646c5a79f9bcfbb2b78d581c0933c49455ef3e7b9f1bdc47))
- sentinel-1 re-minted on v2 registry (token #1, 90d):
  [tx](https://sepolia.etherscan.io/tx/0xa31520a82a8ea27c67f3b889d56eeab92944ae19e66645bee2958d3604134b41)
- Full v2 loop verified: paid `0.0.7162784@1788859852.371306176`,
  verdict ACT, guard wouldPass true
- v1 set (superseded, §1/§6) left deployed for history; all clients +
  frontend now point at v2

## 8. Revoke (kill-switch proven on v1 registry — mechanics unchanged in v2)

- Minted `revoke-demo` (token #2, 7d, agent = throwaway `0x6c3B…D844D`):
  [tx](https://sepolia.etherscan.io/tx/0xc893faf79bd5656c742cc5cdbe05798edb1ed92bba81d84f7957c60b6642119d)
- `isAuthorized(throwaway)` before: `true`
- Revoked via `revokeAgentByLabel("revoke-demo")`:
  [tx](https://sepolia.etherscan.io/tx/0xa7085e187947d8c35e4f83763a6668bb27a523db865f02b5cb24e172352c2043)
  (`AgentRevoked`, status 1)
- `isAuthorized(throwaway)` after: `false`
- Note: registry enforces one live identity per wallet, so the demo used a
  fresh throwaway agent wallet; `sentinel-1` (deployer) is untouched and live.

## Known quirks

- `@x402/hedera` `PrivateKey.fromString` on 0x-hex ECDSA keys yields
  facilitator-rejected signatures; `fromStringECDSA` is required
  (`agent/src/pay.ts`).
- Both facilitators reject the HBAR leg in preflight; the USDC leg settles.
  Payer prefers USDC, falls back to HBAR.
