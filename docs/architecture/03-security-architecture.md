# 03 · Security Architecture & Threat Model — varanasi

Author: Ramprasad · 2026-09-11

Inputs: `docs/SECURITY_REVIEW.md` (contracts review, v2 hardening),
`docs/MANDATE.md` (protocol semantics), `TEST_INFRA.md` (adversarial tier 5).
This document organizes them into the company security architecture and adds
the STRIDE threat model required before mainnet.

## 1. Trust model

**Who is trusted with what (least trust by construction):**

| Actor | Trusted with | NOT trusted with |
|---|---|---|
| Human owner (payer) | Signing mandates; funding; revoking identity | — (they are the principal) |
| Agent | Working inside the mandate; its own identity key | Payer keys, standing allowances, funds custody |
| Validator (allowlisted) | Submitting a score for a task | Moving funds; release still requires RiskGuard re-check |
| Varanasi (company) | Operating the signal service; admin params (validators, threshold) via owner role | Custody of funds (no sweep exists); signing mandates; overriding settlement |
| Merchant | Receiving released funds | Nothing (cannot self-release) |
| External data (Graph, signals) | Advisory intelligence only | Authorization (scores are re-checked at settlement) |

Core stance: **compromise of the agent, the company, or any single oracle does
not strand or steal user funds.** Escrowed funds can always be recovered via
permissionless `refund` after expiry.

## 2. Security invariants (must hold at all times)

1. Mandates are EIP-712-domain-bound (`VaranasiTaskEscrow`, v1, chainId,
   verifyingContract) — cross-chain and cross-deployment replay is impossible.
2. Nonces nullify per signer; `taskId` collision reverts (`TaskExists`).
3. `release` requires: identity live (not revoked/expired) **and**
   `scoreBps >= threshold` **and** inside window — re-checked in the same
   transaction via RiskGuard.
4. Strict `expiry` refund gate, no grace, permissionless caller.
5. Accounting uses amount received (fee-on-transfer safe); ERC20 only, no ETH
   path.
6. No owner sweep / withdraw / rescue function exists.
7. Agents never hold payer keys; frontend never persists raw credentials.
8. Face-proof biometrics never touch varanasi storage; only nullifiers.
9. Secrets only in gitignored `.env` (600) / encrypted `.env.enc`; gitleaks CI
   gate.

## 3. STRIDE threat model (per boundary)

Boundary A — **Human ↔ Frontend (browser)**
- *Spoofing*: phishing clones → mitigated by Privy-hosted auth flows,
  domain-pinning guidance; residual risk documented.
- *Tampering*: malicious browser extensions can alter UI — but cannot forge
  EIP-712 signatures (wallet-side) or move escrow (onchain). Damage bounded
  to what a wrong-but-signed mandate allows; cap/window/expiry bound it.
- *Repudiation*: mandates are signer-attributable (recovered payer) +
  task events onchain. Low.
- *Info disclosure*: vault is public-chain data + labels; no keys stored. Low.
- *DoS*: frontend down → users still settle via CLI or directly onchain
  (permissionless liveness).

Boundary B — **Agent ↔ Contracts**
- *Spoofing*: agent impersonation → identity re-checked live at release;
  revoked/expired identity fails closed.
- *Tampering*: modified mandate fields → EIP-712 recovery mismatch; replay →
  nonce + chainId + taskId guards.
- *Elevation*: validator key compromise → can submit generous scores, but
  cannot bypass identity checks, windows, or expiry; scope limited to tasks
  whose payer accepted that validator set. Mitigation roadmap: multi-validator
  quorum (`company/05-product-strategy.md`).

Boundary C — **Agent/Client ↔ Signal service (x402)**
- *Spoofing*: unpaid access → 402 gate + Blocky402 verification before
  payload; receipts on Hedera.
- *Tampering/MITM*: payment headers verified server-side against facilitator;
  TLS in production.
- *DoS*: service down → paid signals unavailable, but escrow settlement is
  unaffected (service is not in the money path).

Boundary D — **Contracts ↔ Execution venues (AegisHook / Uniswap v4)**
- Hook enforces `beforeSwap`-only permission bits; PoolManager-only caller
  check; gate order: identity → fresh attestation (TTL) → RiskGuard →
  `SwapAuthorized` with zero fee delta.
- *Elevation*: pool deployer choosing not to use the hook → out of scope
  (opt-in venue); documented as adoption, not security, dependency.

Boundary E — **Supply chain**
- Lockfiles committed (`package-lock.json`, `foundry.lock`); CI pins Node 24
  and Foundry stable; Dependabot configured; patch-package pins Privy
  fill-rule fix (documented in repo history). Gitleaks on full history.

## 4. Known accepted risks & disposition

From `docs/SECURITY_REVIEW.md` (kept honest, not hidden):

| Risk | Severity | Status / plan |
|---|---|---|
| Single-EOA admin can revoke identities / repoint ENS | Medium (testnet) | **Mainnet blocker**: multisig + timelock before any mainnet deploy; identities portable via ENS names as escape path |
| `RiskGuard.authorize` permissionless event emission (caller attestations, not proof) | Note | Indexers instructed to treat as attestations; attestation TTL on hook side |
| Fee-on-transfer / rebasing / malicious tokens | Documented limitation | Kill-shot scope: MockERC20 / USDC only; token allowlist before mainnet |
| Single validator set (owner-managed) | Medium | Quorum validator set on roadmap |
| No onchain oracle (scores computed offchain) | By design | Scores are advisory inputs re-checked against thresholds onchain; independent attestation network is the scale-up path |
| Service receipts file (Tier 2) rebuildable | Low | Replaced by event-fed store; not load-bearing |

## 5. Security program gates (pre-mainnet checklist)

1. Two independent audits on frozen contracts (see `company/12-security-trust.md`
   for scope: TaskEscrow + AegisRegistry first).
2. Admin migration to multisig (e.g., 2-of-3 → 3-of-5) + timelock ≥ 24h.
3. Public bug bounty (tiered, escrow contracts highest).
4. Fuzzing/invariant suite extended (Foundry `forge test` + invariant tests).
5. Onchain monitoring + alerting (identity revocations, threshold changes,
  large fund events) — `04-infrastructure.md` §5.
6. Incident response runbook rehearsed (SEV taxonomy in
   `company/11-engineering.md`).

## 6. Cryptographic inventory

| Primitive | Use | Library |
|---|---|---|
| ECDSA (secp256k1) | Mandate signatures, agent wallet | OpenZeppelin ECDSA / Viem / wallet |
| EIP-712 | Typed mandate signing | OZ EIP712 (contract), Viem (client) |
| keccak256 | taskId derivation, typehashes | Solidity native |
| AES-256-CBC + PBKDF2 | Encrypted secrets at rest (`.env.enc`) | External tooling, documented |
| Hedera ECDSA + HCS | x402 payment signing, audit ordering | @hiero-ledger/sdk |
| World ID proof + nullifier | Human uniqueness tiers | World verifier API |
