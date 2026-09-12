# contracts/ — AegisRegistry + RiskGuard (Foundry)

Author: Ramprasad

## Build / test

```sh
cd contracts
forge build
forge test
```

`forge test` runs fully offline — registry deploys in mock mode (ENS addresses unset → ENS fan-out skipped). **216 tests / 11 suites** (166 legacy + 50 `MandateTreeEscrow`).

## Mandate delegation trees + verdict network (`src/MandateTreeEscrow.sol`)

The agent-escrow layer's second settlement engine, built on `RiskGuard`:

| Concern | Detail |
|---|---|
| Delegation trees | `Mandate` (EIP-712: `parentTaskId, agent, merchant, token, cap, windowStart, windowEnd, expiry, nonce, chainId`) — root signed by the **payer**, children signed by the **parent node's agent**. No token moves on delegation; `cap` is carved from `parent.escrowed` and refunds/cancels roll up to the *direct* parent. Invariant: Σ escrowed ≡ treasury balance. |
| Child constraints | `cap ≤ parent.escrowed`, token match, window ⊆ parent window, `expiry ≤ parent.expiry`, parent must be live and `liveChildren == 0` gates release (proof composes leaf-first). |
| Verdict modes | Pinned at the first score write: **SingleValidator** (legacy `thresholdBps`, matches TaskEscrow) or **Quorum** (CRE verdict network). |
| Quorum | `submitNodeVerdict(taskId, scoreBps, reportHash)` allowlists reporters; the FIRST vote freezes `VerdictMode.Quorum` and `requiredQuorum = defaultQuorum` (deploy param, ≤ `MAX_QUORUM_NODES = 21`); release requires `agreeCount ≥ requiredQuorum`, `quality = agreeCount·10_000 / nodeCount`, then `authorize(agent, 10_000 − quality, pinnedThresholdBps)`. `reportHash` binds each vote to an attested CRE report (see `cre/quorum.ts` `reportDigest`). |
| Admin | `setValidator / setReporter / setThreshold / setDefaultQuorum` (owner), 2-step ownership transfer, `resetVerdict` (owner) reverts `SubsidyLock` if pruning an agreeing vote would drop a met quorum below the bar. |

Delegation plus the verdict network live entirely in `MandateTreeEscrow` — the
deployed `TaskEscrow`/`AegisRegistry`/`RiskGuard` are untouched and both paths
share the same mitigation layer. Coverage: the `MandateTreeEscrow.t.sol` matrix
(MT01–MT08: fund/replay/chain/delegation constraints/quorum/reset/reentrancy)
is fully green.

## Community finance + collateral + gold (src tree)

| Path | Contract | Role |
|---|---|---|
| `src/finance/SavingsVault.sol` | SavingsVault | pooled community savings |
| `src/finance/ChitPool.sol` | ChitPool | periodic contributions, rotating payout |
| `src/finance/LoanAgreement.sol` | LoanAgreement | term-loan between lender + borrower |
| `src/finance/FinancialReputation.sol` | FinancialReputation | member credit/reputation tracking |
| `src/collateral/CollateralVault.sol` | CollateralVault | collateral backing community loans |
| `src/gold/GoldRegistry.sol` + `GoldAttestor.sol` + `GoldToken.sol` | gold stack | gold-backed collateral (registry, attestor, metal token) |

Not yet deployed — demo state is address-seeded and simulated; the agent's
`execute()` throws until they go live. Protocol tests: 54 (see
`docs/REFERENCE.md` §6 for the breakdown).

## Deploy (Sepolia)

```sh
cd contracts
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
# custom wiring:
ENS_REGISTRY=0x... ENS_RESOLVER=0x... UNIVERSAL_RESOLVER=0x... PARENT_NAME=aegis.eth \
  forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
```

Deploys `AegisRegistry` (constructor ENS addresses + parent name), then `RiskGuard(registry)`, and logs all addresses.

## Sepolia addresses (ENSv2 Beta — https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta)

| Contract | Address |
|---|---|
| ETHRegistry (PermissionedRegistry) | `0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2` |
| RootRegistry (PermissionedRegistry) | `0x8115186E8f2E0B0281e86ab91f0f48Ba90364354` |
| ENSV2Resolver | `0x508cb4E4596429Ca98a1bB3112d88D18F92456b5` |
| PermissionedResolverImpl | `0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e` |
| UniversalResolverV2 (impl) | `0x4A1817d13E9cF196f471725176355C1234b63C70` |
| UR proxy (canonical entry) | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| ETHRegistrar | `0xa88553F454b77203B0D036A05c894d555EAAa2Cc` |
| UserRegistryImpl | `0x624a25d67B59D587752EbEc8DdeD8827dAe52050` |

Defaults in `Deploy.s.sol` + `setENSAddresses` use ETHRegistry / ENSV2Resolver / UniversalResolverV2. `foundry.toml` reads Sepolia RPC from `$SEPOLIA_RPC_URL`.

## How ENSv2 wiring works

- `src/interfaces/IENSv2.sol` — minimal `IPermissionedRegistry` / `IPermissionedResolver` / `IUniversalResolverV2` with NatSpec pointing at the real `ensdomains/contracts-v2` sources. Single integration point.
- `AegisRegistry.mintAgent(sublabel, wallet, days)` commits local state (owner/expiry/revocation maps) then best-effort fans out to ENSv2: `registerSubname` on the parent registry + `setAddr`/`setText` on the resolver. Revoke fans out to `transferFrom(…, 0)`.
- All ENS calls are try/catch-guarded and skipped when `ensRegistry == address(0)` (mock mode), so local state is never bricked by a Sepolia revert and tests pass offline.
- Post-deploy: `setENSAddresses(...)` + `setParentNode(namehash("aegis.eth"))` once `aegis.eth` is owned on Sepolia; wildcard resolution flows through UniversalResolverV2.
