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
   truncate in the `uint64` expiry cast. Fix: cap (e.g. 3650 days).
2. (Minor) Empty/unnormalized sublabels accepted. Fix: reject empty labels.
3. (Note) `RiskGuard.authorize` is permissionless and emits `Authorized`
   events any caller can trigger. Events are caller attestations, not proof;
   indexers must treat them as such. Documented, acceptable for demo.
4. (Standard) Identity is custom + ENSv2, not ERC-8004. Deliberate: the ENS
   prize requires ENSv2 centrality. Follow-up if time: register agents on
   ERC-8004 IdentityRegistry (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`)
   as a cross-agent trust complement (also Hedera-track extra credit).

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
