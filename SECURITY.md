# Security

Author: Ramprasad · Reporting and the honest threat surface.

## Report a vulnerability

Email the address on the repo author's GitHub profile (Ramprasad4121) with
subject `varanasi-sec`. Include: contract + line, the money-flow it breaks,
and a minimum repro (Foundry test or a tx on Sepolia). Expect:

- Ack ≤ 48h. Fix + disclosure on the public repo when patched.
- Testnet contracts currently hold demo value only — but assume mainnet
  intent: findings affecting `TaskEscrow`, `Akshaya`, `GhatStream`,
  `RiskGuard`, or `AegisRegistry` are treated as funds-at-risk.

**Do not open public issues for vulnerabilities.** If you need
coordination, file a GitHub private vulnerability report
(Security tab → Report a vulnerability).

## Design stance (why the surface is small)

- Contracts hold value only while a signed mandate says so; every privileged
  path is either gone (Akshaya/GhatStream have **no admin at all**) or a
  2-step ownership transfer + live-identity kill switch (escrow/registry).
- The kill switch is a *user* feature (`aegis revoke`): revoking identity
  strands funds only into the refund path — it cannot redirect a single unit
  to anyone but the mandate's merchant or payer.
- Reentrancy: guard + CEI + no callbacks + fee-on-transfer accounting —
  probed by an attack-token test, not assumed.
- Signatures: EIP-712 with per-signer nonce nullifiers and chainId binding;
  strict ECDSA (malleability rejected). Cross-implementation parity
  (viem ↔ Solidity digests) is checked in CI.

## User-data isolation (browser vault)

- Every personal record (hires, listed agents, receipts cache, human-proof
  state) is written under a key namespaced by the signed-in Privy user id
  (`varanasi.<userId>.*`). Accounts sharing a browser cannot read each other;
  legacy unscoped guest data is migrated on first sign-in and deleted.
- The service's `GET /v1/receipts` is a **public** feed of paid requests
  (txId + amount — everything on HashScan is public anyway). The UI renders it
  view-only and never merges it into a user's vault.
- On-chain state (escrow, Akshaya scores, registry) is deliberately public and
  address-scoped: privacy there comes from your key discipline, not the UI.
- On a shared machine, signed-out users see an empty vault; clearing site data
  removes any local cache entirely.

## Known accepted risks (testnet, read before mainnet)

| Risk | Why accepted today | Before mainnet |
|---|---|---|
| Permissionless `mintAgent` (self-registration) | Squatting is the worst case; identity ≠ authorization for value | Signature-gated mint (plan in `SECURITY_REVIEW.md`) |
| Validator allowlist is operator-run | Release needs score ≥ pinned threshold; low-cap demo tasks | Per-token threshold policies + staked validators |
| x402 facilitator (Blocky testnet) is external | Signal API, not settlement rail; escrow never trusts it | Facilitator-independent settlement (already true) |
| `service/data/receipts.json` file-backed | ≤100 entries, audit convenience; HashScan is the durable proof | Hedgehog/HCS-only reads in UI (stub shipped) |

## Hardening backlog (tracked)

- `Akshaya`/`GhatStream`: external audit pass (they were written post-review
  with the full checklist applied; treat this file as the baseline to re-run).
- `TaskEscrow`: storage gap + version for the 14-field `tasks()` tuple if any
  field is ever added (layout is documented in `docs/MANDATE.md`).
- Frontend: CSP nonce for Privy's injected scripts (needs Privy SDK support).
