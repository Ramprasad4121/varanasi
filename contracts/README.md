# contracts/ — the enforcement rail

Solidity 0.8.26, **zero external dependencies** (only `forge-std` for tests).
Everything — EIP-712 hashing, strict ECDSA recovery, SafeERC20 semantics, the
reentrancy guard, the demo token — lives in [`src/lib/`](src/lib) and is
audited with the same care as the protocol contracts. One `forge build` on a
fresh clone; no remappings to lose sleep over, no subtree to drift.

| Contract | Role |
|---|---|
| `TaskEscrow.sol` | EIP-712 mandate-gated ERC20 escrow: fund → validate → release (or refund). The money moves only where a signed cap allows, re-checked live at settlement. |
| `AegisRegistry.sol` | ENSv2-backed agent identity (`*.aegis.eth`): expiring, revocable, one live name per wallet. Mock mode when ENS addresses are unset → tests run offline. |
| `RiskGuard.sol` | Execution gate pairing live identity with a risk bound. `release` calls it inline; revocation mid-flight strands funds for refund, never release. |
| `Akshaya.sol` | **New.** Proof-of-outcome reputation. No admin, no oracle: `attest(taskId)` reads the escrow itself, mints a soulbound receipt, and maintains a half-life-decayed score. Capital-secured by construction. |
| `GhatStream.sol` | **New.** Continuous escrow. A signed mandate caps a per-second payment flow: agent claims accrued whenever, payer can stop the tap at any instant, and the unearned remainder always returns. |
| `MockERC20.sol` | 6-decimal demo token with open `mint`. Testnet furniture only. |

## Build / test

```sh
cd contracts
forge build          # solc 0.8.26, viaIR (see foundry.toml note)
forge test           # fully offline — registry mock mode, no RPC needed
forge test --match-contract AkshayaTest
forge test --match-contract GhatStreamTest
```

The `test/` suites encode the locked matrix (T1–T20): replay, window,
validator pinning, fee-on-transfer accounting, reentrancy probe, quality→risk
inversion, decay arithmetic, soulbound refusal, stop-cock semantics, and
funds-conservation.

A dependency-free runtime check also lives in CI's sibling flow: compile with
`solc-js`, deploy on `@ethereumjs/vm`, drive the whole lifecycle with real
viem EIP-712 signatures (see `docs/ARCHITECTURE.md` § Verification).

## Deploy

```sh
# registry + guard
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
# escrow (bound to a live RiskGuard + threshold)
RISK_GUARD=0x... THRESHOLD_BPS=5000 forge script script/DeployEscrow.s.sol --rpc-url sepolia --broadcast --verify
# the inventions (Akshaya reads the deployed escrow; GhatStream gates on the registry)
TASK_ESCROW=0x... AEGIS_REGISTRY=0x... forge script script/DeployInventions.s.sol --rpc-url sepolia --broadcast --verify
```

`foundry.toml` reads Sepolia RPC from `$SEPOLIA_RPC_URL`. Never commit keys —
use a hardware wallet signer or a throwaway testnet account.

## Sepolia testnet (chainId 11155111)

Live v2 rail (source of truth: `agent/src/mandate.ts`, `frontend/lib/site.ts`
— verify on the explorer before funding):

| Contract | Address |
|---|---|
| TaskEscrow | `0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24` |
| RiskGuard | `0x668c01aE564D51baFF0029D361c20c534d738400` |
| AegisRegistry | `0x3913f1E6A0Be93180363aBd01Df7968d494033A8` |
| MockERC20 (vUSD) | `0x6169A84cD7430042fb697c2cC131F663212E8b30` |
| Akshaya / GhatStream | deploy from this tree (`DeployInventions.s.sol`); Akshaya → `TASK_ESCROW` above, GhatStream → registry above |

> Deployed v1 `TaskEscrow` was built against OpenZeppelin libs; `src/` here is
> the zero-dep rewrite with the identical wire surface (EIP-712 domain
> `VaranasiTaskEscrow`/`1`, same `Mandate` typehash, same ABI, same revert
> selectors — all exercised on a real EVM). Akshaya **must** be wired to a
> `TaskEscrow` deployed from this tree so both sides agree byte-for-byte.

## Invariants (proven by `forge test`)

1. **No release without a live identity** — guard re-checked at release time, never cached.
2. **No double-spend** — per-signer nonce + `keccak(digest)` task ids.
3. **CEI + pull settlement** — state flips before tokens move; no callbacks.
4. **Goalposts pinned at fund** — later admin threshold/validator changes can't move a live task's bar.
5. **Fee-on-transfer honesty** — escrow records what it *received*, releases/refunds that.
6. **Conservation** — every unit leaves for merchant, payer, or (streams) exactly `claimed + swept == cap`.
7. **Reputation is evidence, not opinion** — Akshaya accepts only terminal escrow states, once each.
8. **Bounded harm (streams)** — at every instant, agent's lifetime take ≤ accrued so far; unearned funds are always payer-recoverable.
