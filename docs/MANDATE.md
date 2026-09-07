# Varanasi Mandate Spec (Phase 1 — ETHOnline 2026)

One signed object authorizes one escrowed task. The human owner (payer) signs;
the agent (or anyone) submits. Settlement never depends on ERC-8004 onchain
state (Sepolia has no code at the canonical registry addresses — client reads
only, via `agent/src/erc8004.ts`).

## 1. EIP-712 type

Domain (locked): `{ name: "VaranasiTaskEscrow", version: "1", chainId,
verifyingContract }` — chainId + verifyingContract bind every signature to one
chain and one deployment.

Type string (locked, `MANDATE_TYPEHASH`):

```
Mandate(address agent,address merchant,address token,uint256 cap,
        uint64 windowStart,uint64 windowEnd,uint64 expiry,
        uint256 nonce,uint256 chainId)
```

| Field | Type | Meaning |
|---|---|---|
| `agent` | address | Agent wallet. Identity re-checked LIVE via `RiskGuard` at release. Non-zero. |
| `merchant` | address | Payee on release. Non-zero. Single-merchant scope (no allowlist). |
| `token` | address | ERC20 only (USDC-first; MockERC20 in tests). Non-zero. No ETH path exists. |
| `cap` | uint256 | Max escrowed amount, base units. Non-zero. Pulled via `safeTransferFrom` from the SIGNER. |
| `windowStart` / `windowEnd` | uint64 | Validation window (inclusive), `block.timestamp` clock. `windowStart <= windowEnd`. |
| `expiry` | uint64 | Refund gate. Must be `> block.timestamp` at fund. Refund iff `block.timestamp > expiry` (strict, no grace). |
| `nonce` | uint256 | Per-signer replay nullifier (`usedNonce[signer][nonce]`). |
| `chainId` | uint256 | Must equal `block.chainid` (`ChainIdMismatch` otherwise). |

`taskId = keccak256(abi.encode(mandateDigest))` — domain-bound, so ids differ
across chains and deployments. `fund` also reverts on existing `taskId`
(`TaskExists`, defense in depth behind the nonce nullifier).

## 2. AP2 constraint mapping

Varanasi mandates implement the AP2 shape (user-signed intent + merchant-bound
payment authorization) with a minimal field set. Mapping to AP2 concepts:

| AP2 concept | Mandate field(s) | Notes |
|---|---|---|
| IntentMandate.user | ECDSA recovered signer (= `payer`) | Attribution is `msg.sender` + EIP-712. Never `tx.origin`. |
| IntentMandate.agent | `agent` | Bound to `AegisRegistry` identity at release, not at sign. |
| Intent constraint: max amount | `cap` | Upper bound; settlement moves `fundedAmount` (amount RECEIVED, fee-on-transfer safe). |
| Intent constraint: expiry | `expiry` | Strict `>` refund gate; also kills `release` past expiry (`WindowExpired`). |
| Intent constraint: merchant scope | `merchant` | Single payee, not a list. Multi-merchant is out of scope. |
| IntentMandate.nonce | `nonce` | Per-signer nullifier, replay-safe. |
| Cart/PaymentMandate.merchant + amount | `merchant` + `cap` | No line items, no cart hash. Amount is a cap, not an invoice. |
| PaymentMandate.refund policy | `expiry` + permissionless `refund` | Anyone may settle once conditions hold (liveness). |
| — (no AP2 equivalent) | `windowStart`/`windowEnd` | Validation window for allowlisted score submission. Extension. |
| — (transport-level in AP2) | `chainId` + domain `verifyingContract` | Replay protection enforced ONCHAIN. Extension. |
| — (no AP2 equivalent) | global `thresholdBps` | Release bar (`score >= threshold`), owner-settable, `<= 10_000`. Extension. |

Explicitly NOT modeled (deferred): line items / cart hash, recurring caps,
multi-merchant allowlists, partial release (no partial release — all or
nothing), dispute arbitration beyond refund-after-expiry.

## 3. Extension points used

- **Validator set**: `setValidator(addr, bool)`, owner-managed, single-EOA on
  testnet. Scores are numeric bps; `submitValidation` is the only writer.
  Last-write-wins pre-settlement; post-settlement writes revert.
- **Threshold**: `setThreshold` (owner, `<= 10_000`, default 5_000 at deploy).
- **Reads for indexers**: `taskState(taskId)` (lightweight), `mandateDigest` /
  `mandateStructHash` / `mandateTaskId` (client signing + id precompute).
  Events (`TaskFunded`, `ValidationSubmitted`, `TaskReleased`, `TaskRefunded`,
  `TaskCancelled`) are the authoritative receipt; the service indexes them
  read-only.
- **Token leg**: any ERC20; accounting uses amount received. Fee-on-transfer,
  pausable, rebasing, and malicious tokens are a documented limitation —
  kill-shot uses MockERC20 / Sepolia USDC only.
- **No owner sweep**: no withdraw/rescue function exists by construction.
  Admin surface is validators + threshold + ownership transfer only.

## 4. Replay semantics

1. **Same mandate twice** → `NonceUsed` (per-signer nullifier, burned at fund).
2. **Same fields, new nonce** → distinct `taskId`, funds independently.
3. **Cross-chain replay** (same sig, other chain) → `ChainIdMismatch` on the
   explicit field; the domain separator would fail recovery independently.
4. **Cross-deploy replay** (same sig, sibling escrow) → digest mismatch:
   recovery yields a non-approver, and the allowance/balance pull probe
   reverts (`TokenFail`). No fund, no nonce burn for the payer.
5. **Tampered field** → same as (4): digest mismatch, no fund.
6. **Malformed signature** (bad `v`/`s`) → `BadSig`.
7. **Double settlement** (`release`→`refund`, `refund`×2, `release`×2) →
   `AlreadySettled`. State flips before transfer (CEI) + `nonReentrant`.

## 5. Revocation semantics

- **Agent identity revoked/expired between fund and release** → `release`
  reverts with `RiskGuard.UnauthorizedAgent` (inline `authorize` at release
  time; the stored `VALIDATED` flag is a hint, never proof). `refund` opens
  strictly after `expiry`. Covered by T10/T17.
- **Validator key compromised** → owner rotates via `setValidator(addr,
  false)`. Rotation bounds FUTURE submissions; an in-flight poisoned score is
  still gated by `thresholdBps` + the live `RiskGuard` check, and settlement
  is atomic. Residual risk (accepted): no retroactive score invalidation —
  rotate fast, keep thresholds honest.
- **Payer exit pre-validation** → `cancel` (payer-only, `FUNDED` state only).
  Any validation (even below threshold) kills `cancel` (`AlreadyValidated`);
  the payer's recourse is then `refund` after `expiry`.
- **Signed-but-unfunded mandate** → no onchain revocation registry
  (embedded mappings only, per locked scope). To burn a leaked mandate
  pre-fund, the payer funds it themselves (any allowance they control) and
  immediately `cancel`s, consuming the nonce.
- **Ownership** → `transferOwnership` (multisig at mainnet cutover; single-EOA
  accepted on testnet).

## 6. Release rule (normative)

`release(taskId)` succeeds iff ALL hold at release time, else reverts:

- (a) state is `FUNDED`/`VALIDATED` with a submitted score, `score >=
  thresholdBps` (`NoValidation` / `ScoreBelowThreshold` otherwise);
- (b) `RiskGuard.authorize(agent, score, cap)` passes — live
  `isAuthorized` re-check (`UnauthorizedAgent` / `RiskTooHigh` otherwise);
- (c) `block.timestamp <= expiry` (`WindowExpired` otherwise).

No partial release. No owner bypass. `block.timestamp` is the only clock.
