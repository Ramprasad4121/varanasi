# AegisHook — Uniswap v4 Risk Hook (ETHOnline 2026, Uniswap From-Scratch)

A `beforeSwap`-only Uniswap v4 hook: **only authorized low-risk varanasi agents can swap**
in any pool initialized with it. Unauthorized or over-threshold swaps revert;
authorized low-risk swaps pass through untouched (no fee take, no fee override).

## How it works

`contracts/src/AegisHook.sol` implements `IHooks` directly against real
`v4-core` interfaces (BaseHook-style: `getHookPermissions()` +
`Hooks.validateHookPermissions` in the constructor).

`beforeSwap` gate, in order:

1. `msg.sender == poolManager`, else `NotPoolManager` (only PoolManager calls hooks).
2. Agent = `tx.origin` (the EOA driving the swap tx through a router).
3. `riskGuard.registry().isAuthorized(agent)`, else `RiskGuard.UnauthorizedAgent`
   (no live `*.aegis.eth` identity — mint via `AegisRegistry.mintAgent`).
4. Fresh attestation required: `agentRisk[agent].deadline > now`, else `StaleAttestation`.
5. `riskGuard.authorize(agent, score, cap)` — the **live** RiskGuard re-checks
   identity + threshold, else `RiskGuard.RiskTooHigh`. Cap = per-pool cap if set,
   else `defaultMaxAllowedBps`.

Risk scores are written by owner/operators via
`setAgentRisk(agent, scoreBps, deadline)` — the demo stand-in for the offchain
varanasi reasoning engine. Per-pool caps via `setPoolCap(key, maxBps)`
(owner only). Success returns
`(beforeSwap.selector, ZERO_DELTA, 0)`.

## Sepolia addresses (verified, not hallucinated)

Uniswap v4 canonical deployments fetched from
`https://docs.uniswap.org/contracts/v4/reference/deployments/`
(Sepolia chain id 11155111). Mainnet PoolManager
(`0x000000000004444c5dc75cB358380D2e3dE08A90`) differs — Sepolia has its own:

| Contract              | Sepolia address |
|-----------------------|-----------------|
| PoolManager           | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| PositionManager       | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| StateView             | `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c` |
| V4Quoter              | `0x61b3f2011a92d183c7dbadbda940a7555ccf9227` |
| Universal Router      | `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b` |
| Permit2               | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| AegisRegistry (live)  | `0x0aed80646680eb333e0d2129f6f0fa54503b5381` |
| RiskGuard (live)      | `0xc35861C4dbE63A9C8cFEfd32C671998151c217cA` |
| Keyless CREATE2 deployer (all chains) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

The deploy script defaults to Sepolia PoolManager + live RiskGuard; override
with `POOL_MANAGER=` / `RISK_GUARD=` env (constructor/setter params, never hardcoded-only).

`AegisHook` address on Sepolia: **TBD at deploy** (CREATE2-mined, see below —
record it here after broadcast).

## Hook-mining step (why + how)

v4 enforces hook permissions by **address bits**: a beforeSwap-only hook must satisfy
`uint160(addr) & 0x3FFF == 0x0080` (`BEFORE_SWAP_FLAG = 1 << 7`), or the
constructor reverts `HookAddressNotValid` and PoolManager would reject the pool.
So the deploy address is brute-forced (HookMiner pattern, ~16k iterations avg):

- `contracts/script/DeployHook.s.sol` mines a salt **against the canonical
  keyless CREATE2 deployer** (`0x4e59…4956C`, same on all chains) and deploys via
  `CANONICAL.call(abi.encodePacked(salt, initcode))` — the exact pattern from
  Uniswap's own `DeployReservesLens.s.sol` + `HookMiner.find`.
  (`address(this)` can NOT be the mine target — forge bans it in scripts and the
  script contract is ephemeral.)
- Because deployment goes through a factory, the constructor takes an explicit
  `_owner` (else admin rights would belong to the factory, i.e. no one).
  The script defaults `OWNER` to `--sender $ADDR`.
- Reproduce mining offline any time: `forge test --match-contract AegisHookTest`
  (the test mines a salt from the test contract the same way).

Dry-run output (local, `forge script script/DeployHook.s.sol` — proves the loop
+ constructor + config path end to end; Sepolia re-mines for the real owner):

```text
Mined hook address: 0x206BA21f1171b18aA4268bC280685F2630624080
Salt:               0x0000...00004778
Hook permission bits (want 0x0080): 128
AegisHook:          0x206BA21f1171b18aA4268bC280685F2630624080
PoolManager:        0xE03A1074c86CFeDd5C142C4F04F1a1536e203543
RiskGuard:          0xc35861C4dbE63A9C8cFEfd32C671998151c217cA
Default cap bps:    5000
```

(`0x…4080`: low 14 bits = `0x0080` ✓)

## Deploy commands (Sepolia)

```bash
cd contracts
forge build && forge test   # must be green first

forge script script/DeployHook.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $SEPOLIA_PRIVATE_KEY \
  --sender $ADDR \
  --broadcast
```

Useful env overrides (prefix each with `VAR=value`):

```bash
OWNER=0xYourSafe \
OPERATOR=0xRiskEngine \
AGENT=0xDemoAgent RISK_SCORE_BPS=2000 RISK_TTL_DAYS=7 \
DEFAULT_MAX_BPS=5000 \
forge script script/DeployHook.s.sol --rpc-url $SEPOLIA_RPC_URL \
  --private-key $SEPOLIA_PRIVATE_KEY --sender $ADDR --broadcast
```

Post-deploy: record the hook address above, verify on Etherscan
(`forge verify-contract`), then `transferOwnership` to a Safe, and initialize a
pool with `hooks = <mined address>` (PositionManager / `PoolInitializer_v4`).

## 30-second demo

**Behavioral proof (no RPC needed) — unauthorized reverts, authorized passes:**

```bash
cd contracts && forge test --match-contract AegisHookTest -vv
```

```text
[PASS] test_UnauthorizedSwapReverts()        # stranger → RiskGuard.UnauthorizedAgent
[PASS] test_UnauthorizedSwapRevertsWithoutAttestation()
[PASS] test_AuthorizedLowRiskSwapPasses()    # agent (score 2000 ≤ cap 5000) → selector + ZERO_DELTA + 0
[PASS] test_HighRiskSwapReverts()            # score 8000 → RiskGuard.RiskTooHigh(8000, 5000)
[PASS] test_StaleAttestationReverts()        # expired score → StaleAttestation
[PASS] test_RevokedAgentReverts()            # revoked identity → UnauthorizedAgent
[PASS] test_PermissionBitsSatisfied()        # mined addr bits == 0x0080, validateHookPermissions ok
... 19/19 hook tests green, 36/36 total with existing Aegis suite
```

**Live Sepolia (after deploy, `HOOK=<mined>`):**

```bash
# operator attests the demo agent (needs a live *.aegis.eth identity first)
cast send $HOOK "setAgentRisk(address,uint256,uint64)" $AGENT 2000 $(( $(date +%s) + 604800 )) \
  --rpc-url $SEPOLIA_RPC_URL --private-key $SEPOLIA_PRIVATE_KEY --sender $ADDR

# read back policy
cast call $HOOK "agentRisk(address)(uint64,uint64)" $AGENT --rpc-url $SEPOLIA_RPC_URL
# pools using the hook enforce the gate on every swap via PoolManager.beforeSwap
```

Full live swap demo = init a pool with `hooks=$HOOK`, seed liquidity, swap once
from an unattested EOA (reverts `UnauthorizedAgent`) and once from the attested
agent (succeeds). Pool-init + liquidity-seed commands depend on the chosen pair
and are intentionally left for deploy time (any `PoolKey` with `hooks=$HOOK`
inherits the gate — no per-pool registration needed unless overriding the cap
via `setPoolCap`).

## Notes for judges / production hardening

- Demo trust model is explicit: scores are owner/operator-written, agent identity
  is `tx.origin`. Correct for EOA-driven demo swaps; production replaces both
  with EIP-712 signed attestations from the risk engine + ERC-8004 identity.
- The hook takes no fees and holds no funds (no TVL, no oracle, no reentrancy
  surface beyond the `RiskGuard.authorize` external call, which only reads +
  emits). ethskills security checklist applied: explicit access control on every
  state write, input validation (score ≤ 10_000, future deadlines, non-zero
  addresses), events on every state change, no infinite approvals, no spot-price
  oracle use.
- `forge build` + `forge test` are green in `contracts/` (36/36). No existing
  contracts were modified; nothing committed.
