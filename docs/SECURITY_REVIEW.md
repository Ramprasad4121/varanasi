# Security review — varanasi contracts (ethskills-driven, 2026-09-06)

Author: Ramprasad

Method: read `ethskills` router + `ship` + `security` + `standards` +
`building-blocks` + `addresses` BEFORE further Solidity/onchain work.
Contracts below were deployed before the skill was read; this is the
post-hoc review the skill demands, plus gates for anything new onchain.

Deployed (Sepolia): AegisRegistry `0x0aed80646680eb333e0d2129f6f0fa54503b5381`,
RiskGuard `0xc35861c4dbe63a9c8cfefd32c671998151c217ca`.
Both source-verified via Sourcify (Etherscan forwarding included).

## Checklist result (security/SKILL.md)

- Access control: mint open-by-design (self-registration, owner bound to
  caller); revoke/renew restricted to token owner or admin. PASS with note.
- AdminEO A backdoor: single-EOA admin can revoke ANY identity and repoint
  ENS addresses. Acceptable for hackathon testnet; production must move to
  multisig/timelock. Escape path: identities are portable via ENS names.
- Reentrancy: no value held, no external calls before state; ENS fan-out is
  post-commit + try/catch. CEI effectively satisfied. PASS.
- Tokens: none held/moved. Decimals/SafeERC20 N/A.
- Oracles: none onchain (risk scores computed offchain). N/A.
- Math: bps arithmetic offchain only. Onchain time math noted below.
- Events on every state change: yes (mint/revoke/renew/ENS update/registry).
- No proxies, no delegatecall, immutable (as the skill recommends for MVPs).
- No infinite approvals, no swaps, no signatures. N/A.

## Findings (no fund risk; contracts hold no value)

1. (Minor) `mintAgent` has no upper bound on `expiryDays`; extreme values
   truncate in the `uint64` expiry cast. Status: FIXED (v2) — `MAX_EXPIRY_DAYS
   = 1825` enforced in `mintAgent`/`renewAgent`/`renewAgentByLabel` (new error
   `ExpiryTooLong`).
2. (Minor) Empty/unnormalized sublabels accepted. Status: FIXED (v2) — label
   rules 3–32 chars, charset `[a-z0-9-]` (new error `LabelInvalid`); rejects
   empty/uppercase/spaces/dots/underscores.
3. (Note) `RiskGuard.authorize` is permissionless and emits `Authorized`
   events any caller can trigger. Events are caller attestations, not proof;
   indexers must treat them as such. Documented, acceptable for demo.
4. (Standard) Identity is custom + ENSv2, not ERC-8004. Deliberate: the ENS
   prize requires ENSv2 centrality. Follow-up if time: register agents on
   ERC-8004 IdentityRegistry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`)
   as a cross-agent trust complement (also Hedera-track extra credit).

## Contracts v2 hardening (accepted external audit; testnet redeploy)

Context: uncommitted working tree on top of `c9697c3`; contracts WILL
redeploy on testnet, so behavior changes below are intentional. `forge build`
+ `forge test` green: 111/111 (baseline 86 + 25 new/updated).
Build note: `foundry.toml` sets `via_ir = true` — v2 growth pushed
`TaskEscrow.fund`'s optimizer-inlined frame past legacy codegen's stack
limit; semantics unchanged.
NatSpec note: solc rejects `@author` on non-contract elements (error 6546),
so v2 attribution is contract-level `@author Ramprasad` (all four contracts)
plus `@dev Author: Ramprasad.` lines on new functions/errors/events.

- H3/H4/M13/M17 registry grief — FIXED: (a) label rules above; (b) revoke
  CLEARS `tokenByAgent` + `tokenByLabelHash` (label freed, `AgentRevoked`
  still emitted) + new `unRevoke(tokenId, owner-or-tokenOwner)` for accidents
  (reverts `NotRevoked` when live, `LabelTaken` if re-minted while revoked);
  (c) renew-on-revoked keeps the explicit old behavior (extends expiry, revoke
  sticks — documented in NatSpec, covered by `test_RenewDoesNotClearRevocation`);
  (d) `MAX_EXPIRY_DAYS = 1825` cap in mint/renew. Permissionless mint KEPT
  (demo openness) — grief-recourse documented: owner revokes → mappings
  clear → victim re-mints. Behavior change: second `revokeAgentByLabel`
  after a revoke now reverts `UnknownToken` (label freed); test updated.
- H1 hook attribution — FIXED: `beforeSwap` accepts OPTIONAL EIP-712
  attestation via `hookData = abi.encode(agent, scoreBps, expiry,
  validatorSig)` over `(agent, scoreBps, expiry, poolId, chainId, hook)`
  (new `ATTESTATION_TYPEHASH`, public `attestationDigest` helper for
  clients); non-empty hookData verifies validator (owner-or-operator)
  signature + expiry (`BadAttestation`/`AttestationExpired`) and uses the
  attested agent (no `tx.origin`); empty hookData keeps the legacy
  `tx.origin` + stored-score path (demo compat, NEVER removed). Attested
  scores are RISK bps (same convention as `setAgentRisk`); pool/chain/hook
  binding kills cross-pool/cross-chain replay.
- H5 operator bounds — FIXED: `MAX_ATTESTATION_TTL = 30 days` enforced in
  `setAgentRisk` (`deadline <= now + TTL`, else `BadDeadline`); quorum/
  multisig validator set + rotation documented as a production item in
  NatSpec (single owner/operator signers are a testnet stand-in).
- M8/M9/M10/M11 escrow semantics — FIXED: (a) `release` calls
  `authorize(agent, BPS - scoreBps, pinnedThreshold)` with the QUALITY→RISK
  inversion documented in NatSpec (validator scores are quality, high =
  good; `authorize` takes risk, low = safe); (b) `thresholdBps` + validator
  pinned per task at fund/first-validation time (`pinnedThresholdBps`,
  `pinnedValidator` on `Task`; release uses pinned values, ignores later
  global changes); first validator write pins, later writes must come from
  the SAME validator (`ValidatorMismatch` — kills flip-flop); (c) release
  re-checks `isValidator[pinnedValidator]` live (reverts `NotValidator` if
  removed); (d) `cancel` requires `block.timestamp <= expiry`
  (`WindowExpired` — clean split: post-expiry settlement belongs to refund).
- M12 + LOW admin safety — FIXED: zero-address checks on all repoint
  functions (`RiskGuard.setRegistry` gained `ZeroAddress`; Hook/Escrow
  already had them); 2-step ownership (`transferOwnership` →
  `acceptOwnership` + `pendingOwner`) on Registry/Hook/Escrow
  (`transferAdmin` kept as a 2-step alias on Registry for scripts/UIs);
  timelock-as-production documented in NatSpec (no timelock code, by design).
- DEFERRED (deliberate, with reason): permissionless mint stays (demo
  openness + documented grief-recourse, above); legacy `tx.origin` hook path
  stays (demo compat — router-driven agent EOAs); `RiskGuard.transferAdmin`
  stays 1-step (out of the mandated Registry/Hook/Escrow scope; single-EOA
  admin is already an accepted testnet risk, multisig pre-production);
  `setENSAddresses` still accepts `address(0)` per-leg (required for mock/
  offline mode — zero-checking it would brick `forge test` offline);
  attested-hook validators are owner/operators, not a quorum (production
  item, above).

## Gates before any new onchain write

- New Solidity must pass this checklist + `forge test` + fresh-context QA.
- Verify source on every deploy (Sourcify, no key needed).
- Say "onchain", never "on-chain".

## Hackathon-accepted risks (P1s, no fund risk; contracts hold no value)

- P1 `tx.origin` attribution (`AegisHook.sol:165`): `beforeSwap` attributes the
  swap to `tx.origin` (agent EOA). Phishing / malicious-intermediary contracts
  could swap in the agent's name while an attestation is live. Status:
  hackathon-accepted (demo agents are EOAs; PoolManager is the only authorized
  caller). Hardening plan: pass the agent via signed `hookData` (EIP-712
  attestation: agent, scoreBps, deadline, poolId) verified onchain instead of
  `tx.origin`.
- P1 permissionless mint (`AegisRegistry.sol:113`): `mintAgent` is open
  self-registration — anyone can mint a subname bound to any wallet address
  (owner = caller). Squatting / misleading labels possible; `isAuthorized`
  treats any minted identity as valid. Status: hackathon-accepted (testnet
  demo; no value at risk). Hardening plan: signature-gated mint (agent wallet
  must sign the sublabel + human owner) + optional allowlist / mint fee.
