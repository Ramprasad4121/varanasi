# Architecture — varanasi

Author: Ramprasad · The rail in one page; specs in `MANDATE.md` · `AKSHAYA.md` · `GHATSTREAM.md`.

## Thesis

Agentic commerce fails at the money layer: keys, session tokens, standing
approvals — anything the agent can spend *beyond* what was agreed. Varanasi
makes over-spend structurally impossible by moving every check to the
transaction that moves value. Four primitives, one rail:

```
 Human                    Agent                  Chain (Sepolia)                     Settlement
┌──────────┐   sign    ┌──────────┐   call    ┌───────────────────────────────┐   ┌────────────┐
│ frontend │ ────────► │  aegis   │ ────────► │ TaskEscrow ──► RiskGuard      │ ◄─┤ validator  │
│ /hire    │  mandate  │  CLI     │  reads    │    ▲                ▲         │   │ score ≥ θ  │
└──────────┘           └────┬─────┘           │  Akshaya      AegisRegistry   │   └────────────┘
                          │ pay (x402)        │  (soulbound,   (ENSv2 names,  │
                          ▼                   │   decayed)      revocable)    │
                    ┌──────────┐              │  GhatStream ── same gate      │
                    │ service  │              └───────────────────────────────┘
                    │ :4021    │                 hedera testnet (USDC/HBAR)
                    └──────────┘
```

- **`TaskEscrow`** — the mandate rail. Payer signs an EIP-712 `Mandate`
  (agent, merchant, token, cap, window, expiry, nonce). `fund` pulls exactly
  `cap` and nullifies the nonce; `taskId = keccak(digest)` makes replay
  structurally impossible. `submitValidation` pins score; `release` requires
  `score ≥ threshold` **re-checked live** (guard + registry), CEI,
  reentrancy-guarded. `refund`/`cancel` close the loop after expiry.
- **`AegisRegistry`** — revocable identity. One live ENSv2 subname per wallet,
  expiring (`≤ 1825d`), revoke clears lookup mappings (label freed for
  re-mint). Mock mode (`ens == address(0)`) makes the entire test suite
  runnable offline.
- **`RiskGuard`** — stateless gate: `authorize(agent, riskBps, maxBps)` = live
  identity ∧ risk bound. Called *inline* by both settlement rails — never
  cached, so the kill switch has instant effect on new value movement.
- **`Akshaya`** — reputation as a fold over settled outcomes (see
  `AKSHAYA.md`). No admin, no oracle; escrow state is the only input.
- **`GhatStream`** — the same mandate discipline for *time* instead of
  deliverables (see `GHATSTREAM.md`): per-second accrual, payer stop-cock,
  remainder always returns.

`src/lib/` (all zero-dep, audited in-tree): `EIP712` (domain separator with
EIP-712 salt fallback), `ECDSA` (65-byte, v∈{27,28}, low-s enforced),
`SafeERC20` (return-data-checked calls, no `transfer`), `IERC20`,
`ReentrancyGuard`. The repo's *only* external dep is `forge-std` (tests).

## Data-flow rules

1. Anything with money attached is keyed by `keccak(signed digest)` and
   carries a per-signer `usedNonce` nullifier (both escrow and streams) —
   exactly one chain state per signature.
2. Every transition is externally callable by an *incentivized* party
   (agent wants release/claim; anyone can attest/close) — contracts never
   self-schedule.
3. Reads are free: `accruedOf/taskState/scoreOf/statsOf` are total functions;
   indexers reconstruct history from events only.
4. The frontend and service read the chain; the chain never reads them.

## Verification

| Layer | Harness | What it proves |
|---|---|---|
| Foundry | `contracts/test/{TaskEscrow,Aegis,Akshaya,GhatStream}.t.sol` | Locked matrix T1–T20: replay, tamper, windows, fee-on-transfer accounting, reentrancy probe, decay arithmetic, soulbound refusal, stream conservation, kill-switch gating |
| Real EVM (no forge needed) | solc-js `--ir` compile → `@ethereumjs/vm` deploy → drive with **viem**-signed txs; TS-side digest must equal `mandateDigest()` onchain | Bytecode behavior on an actual EVM incl. cross-implementation EIP-712 parity; 48 checks green incl. the two "gotcha" regressions (tuple-decode off-by-one, journal-cache staleness after revert) |
| Agent/service | vitest (156, mocked viem/fetch) + `node --test` adversarial HTTP harness | No network or keys in CI; signing/verification parity client-side |
| Frontend | `next build` (13 static routes) | Degrades gracefully with zero env keys |
| Secrets | gitleaks in CI | `.env*` never committed (pattern enforced, not assumed) |

## Failure model (who loses what, when everything goes wrong)

| Failure | Consequence |
|---|---|
| Agent misbehaves mid-window | Payer revokes identity → release path blocked at guard → funds refundable at expiry. Streams: `stop()` freezes meter at that second. |
| Validator silent | No release (score < bar or absent); refund after expiry. Streams don't need validators — the meter is the verdict. |
| Payer ghosts a stream | `expiry` + `close()` by anyone; agent's accrued claimable forever; remainder to payer's wallet. |
| Reputation attacker | `attest` costs nothing but pays nothing: coins require capital that actually left an escrow to a merchant. |
| Registry ENS layer down | Mock/off-chain `isAuthorized` path still governs settlement (registry is source of truth for its own mappings). |

## What is deliberately NOT here

No DEX pool hooks anymore (the v4 experiment retired — enforcement at
settlement subsumes it), no DB, no admin panels, no upgradeable proxies, no
oracles beyond the explicit validator allowlist. Every "nice to have" in this
repo either gates money or isn't in the repo.
