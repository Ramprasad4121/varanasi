# Akshaya — proof-of-outcome reputation

> The undecayable claim about an agent is one minted from money that already
> moved. Named for the "undecaying" — because the score *does* decay, but the
> receipts never lie.

Author: Ramprasad · Contract: `contracts/src/Akshaya.sol` · Zero deps · 0.8.26

## The problem it kills

Every agent reputation system on the market is **opinion with a token bolted
on**: a registry you can write to, a score an admin curates, stars from
wallets that paid nothing. It is Sybil bait, and it is a database wearing a
smart contract.

Akshaya accepts no opinions. The **only** way to move its numbers is
`attest(bytes32 taskId)` — and a task can only be attested once it is in a
TERMINAL state of `TaskEscrow` (`state == 3` released or `4` refunded/cancelled).
Akshaya reads the escrow itself (`IVaranasiTaskEscrow(tasks())`); there is no
setter, no admin, no oracle, no upgradable proxy. **Reputation is a pure
function of settled, capital-secured outcomes.**

## Mechanics

| Fact | Value |
|---|---|
| Released task (work passed, merchant paid) | agent `raw += W_REL = +10_000` bps, `coins += 1` |
| Refunded/cancelled task | `raw -= W_DUST = 4_000`, `dust += 1` |
| Receipt | one soulbound ERC-721 per task, `ownerOf` = the agent wallet |
| Idempotency | `tokenByTask[taskId]` set once; second `attest` → `AlreadyAttested` |
| Decay | `raw` halves per `PERIOD = 90 days` since last settle: `raw >>= delta` (signed, toward zero) |
| Reported score | `scoreOf(agent) = raw >> (currentPeriod − storedPeriod)` — **view-side**, no gas to read history |
| Batch | `attestBatch(taskIds)` — **all-or-nothing** (a partially-attested batch is exactly the confusion this rail exists to remove) |

`statsOf(agent) → (coins, dust, score, period)` returns the whole picture in
one call. `balanceOf(agent) == coins + dust` always (soulbound ⇒ no inflows
except mints, no outflows, ever: `transferFrom`/`approve`/`setApprovalForAll`
all revert `Soulbound()`).

## Why the decay is half-life on the *signed* accumulator

`raw` is `int256`; the per-period step is `(raw >> delta) + weight`, computed
lazily at mutation time and stored with the period it was settled in.
Consequences, each tested:

1. A perfect agent that idles for 90 days: `10_000 → 5_000 → 2_500…` — merit
   you must keep earning.
2. Debt heals at half-speed too: arithmetic `>>` on negative `raw` moves it
   toward zero (−15_000 → −7_500 → −3_750), with a **−1 sticky floor** —
   `−1 >> 1 = −1` forever under floor semantics. So a burned agent fades but
   can never idle its way back to a clean record on its own. Redemption is
   possible; amnesia is not: `dust` count persists forever as history
   (`coins`/`dust` never decay — only the score does).
3. `delta ≥ 32` (≈ 8 years of silence) is treated as fully washed: the score
   resets to the fresh weight alone (`raw = ±W`, `dust` retained) — a legacy
   that old is evidence of nothing, but the receipts still count.

## Attack surface (all closed)

| Attack | Answer |
|---|---|
| Admin mints good reputation | No admin. Constructor takes `escrow` only. |
| Attest fake/pending task | `NotSettled` unless escrow says terminal; taskId is `keccak(digest)` of a payer-signed mandate — forging a released task = breaking the escrow. |
| Sybil: self-hire yourself as merchant | Cost model: releasing to your own agent means your own capital left the escrow to your own merchant — you paid real money for the coin. Reputation is capital-secured, unlike every star system. |
| Double-attest same task | `tokenByTask` nullifier; also blocks re-minting via batch. |
| Trade the receipts | `Soulbound()` revert on every ERC-721 mutation; standard `supportsInterface(0x80ac5870)` still answers true so indexers parse it. |
| Gas grief on batch | `attestBatch` is all-or-nothing: any invalid id reverts the whole batch and mutates nothing, so batchers self-police; per-attest state is O(1) regardless of history size. |

## Integration

- **agent CLI**: `aegis reputation <0x…|sublabel>` (read-only, one RPC pair of
  calls), `aegis attest <taskId>` (permissionless writer; pre-checks
  `tokenByTask` to skip known work). `agent/src/akshaya.ts`.
- **service**: expose score in signal payloads so the verdict line reads
  "score 5,000/10,000 (1 coin, 0 dust)".
- **frontend**: agent cards show the Akshaya plate (decayed score + receipts)
  with an explorer link to each `Attested` event — proof, not badges.
- **Deploy**: `contracts/script/DeployInventions.s.sol` — wire
  `TASK_ESCROW` at construction and it is finished forever.

## Invariants

1. `tokenByTask[t] != 0` ⇔ an `Attested(t, agent, outcome, id)` happened for terminal `t`.
2. For every agent: `scoreOf` ∈ [−4000·dust, +10000·coins], pre-decay — each
   attestation's weight is bounded and decay only shrabs.
3. `balanceOf(a) == coins(a) + dust(a)` and `totalReceipts == Σ attests`.
4. Two agents can never receive receipts for the same `taskId` (nullifier + terminal read).
5. No state read from Akshaya mutates; all views are free-lunch safe offchain.
