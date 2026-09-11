# GhatStream — continuous escrow

> A hire that pays by the second, under a mandate, with a stop-cock the payer
> can turn at any instant. Named for the ghats where the river keeps flowing
> and the steps hold firm.

Author: Ramprasad · Contract: `contracts/src/GhatStream.sol` · Zero deps · 0.8.26

## The problem it kills

`TaskEscrow` settles a job with a verdict — brilliant for deliverables, wrong
for *time*. Agent-as-a-service (monitoring, research, moderation, indexing) is
paid by the hour, and today that means either trust: a subscription that
keeps billing while you sleep, or a pile of per-task mandates and validators
for what is one continuous service. Hourly-rate escrow with manual invoices is
where every freelance platform drowns.

GhatStream escrows the whole cap **up front**, lets value flow out **per
second**, and guarantees the two properties subscriptions never give you:

1. **Accrued is owed, forever.** Anyone (the agent, a keeper, the DAO of one)
   can `claim()`; funds route to the agent. Stop it, freeze it, revoke its
   ENS — the accrued is still claimable. Work that happened is paid.
2. **Unearned always returns.** `stop()` freezes the meter at that instant;
   after `expiry`, anyone `close()`s and sweeps the remainder to the payer.
   At no point can more than `min(cap, rate×elapsed, rate×maxDuration)` ever
   leave the contract. The cap is not a limit on promises; it is the money.

## Wire format

EIP-712 domain `("GhatStream", "1")` — one signature shapes everything:

```solidity
struct StreamMandate {
    address agent;           // who the flow pays
    address payer;           // signer + pull source (must be same wallet)
    address token;           // ERC20, 6-dec USDC-shaped, fee-on-transfer safe
    uint256 ratePerSecond;   // base units streamed
    uint256 cap;             // pulled + escrowed at open — the hard bound
    uint64  maxDuration;     // accrual saturates here even if stream lives on
    uint64  expiry;          // after this, anyone may close() + sweep
    uint256 nonce;           // per-PAYER replay nullifier
    uint256 chainId;         // must equal block.chainid
}
```

`streamId = keccak256(0x1901 ‖ domainSeparator ‖ structHash)` — the digest is
the primary key, so **replay is structurally impossible** and the same signed
mandate identifies the same stream on every deploy of the same domain.
Public helpers `streamMandateDigest` / `streamMandateStructHash` /
`streamTaskId` let CLIs and wizards sign and preview offline — same pattern
as `TaskEscrow.mandateDigest`, so one signing habit covers both rails.

## Lifecycle

| Transition | Caller | Effect |
|---|---|---|
| `open(m, sig)` | anyone (payer signs; pull from payer) | verify sig → nonce nullified → gate `isAuthorized(agent)` → pull `cap` (stored **as received**) → `StreamOpened` |
| `claim(id)` | anyone | pays `accrued − claimed` to the **agent**; saturates at `cap`; a claim reaching `cap` closes the stream and auto-sweeps the dust-zero books |
| `stop(id)` | **payer only** | freezes accrual at `min(cap, rate×Δt, rate×maxDuration)` — the tap is off; claims still pay up to the freeze |
| `close(id)` | anyone, `now > expiry` | sweeps `cap − claimed − refunded` to the payer, marks closed |

Accrual is pure arithmetic — no per-second transactions, no timer, no
oracle: `accruedOf = min(cap, rate × min(now − openedAt, maxDuration))`, or
the frozen value once stopped. A stream can idle for hours; its books are
exact the moment anyone reads them.

Errors are 4-byte custom (`UnauthorizedAgent`, `NotPayer`, `NothingToClaim`,
`NotExpiredYet`, `RateOverflowsCap`, `MandateExpired`, `NonceUsed`,
`StreamClosedAlready`…) — zero data collisions with ERC721 selectors, gas
flat, decoders trivial.

## Safety model

- **No admin.** `gate` is `immutable`, fixed at construction; there is no
  setter, no owner, nothing mutable at the top level. Deploy-time wiring is
  the only trusted decision.
- **Identity is checked at open, money survives revocation.** Revoking the
  agent's Aegis identity (the "Last Rite" one-click kill) blocks NEW streams;
  accrued-but-unclaimed funds remain claimable — a kill switch must stop harm
  without confiscating earned work. Both branches are tested.
- **Fee-on-transfer honest.** Like `TaskEscrow`, the stored `cap` is what the
  contract actually received, so taxing tokens cannot overstate the escrow
  (and cannot strand the difference — conservation is `claimed + refunded == cap`).
- **Overflow-proof by construction.** `ratePerSecond × maxDuration` is bound-
  checked at `open` (`RateOverflowsCap`), so views like `accruedOf` are total
  functions — no branch can ever wrap.
- **CEI everywhere**, per-transition `nonReentrant`, and the token never holds
  a callback surface (no `onERC721Received`-shaped hooks in this contract).

## Worked example (USDC 6dp)

A moderation agent at **$0.25/hour**: `rate = 69_444` wei/sec, cap for 7 days
= `$42 → 42_000_000` units, `maxDuration = 7d`, `expiry = 9d`.

- 3 hours of work: `claim` pays `746_604 ≈ $0.74`. Payer wakes up, doesn't
  need it: `stop()` at 3h05m → freeze at `747_299`.
- Final take: `$0.7473`. Ever. The other `$41.25` returns at `close()`.
- Payer ghosts entirely: after `expiry` (9d) the agent (or anyone) calls
  `close()`; frozen accrued minus claimed still goes to the agent, remainder
  to the payer. Nobody can lose money to *inattention* — the only failure
  mode is arithmetic.

## Invariants

1. `claimed(agent lifetime take) ≤ accrued ≤ cap` at every instant, any
   history of calls.
2. Conservation: `claimed + refunded == escrowed` the moment a stream closes;
   `== cap` after full lifecycle (tested to the unit).
3. One mandate, one stream: `streamId` collision-free, `usedNonce` per payer.
4. `stop` is payer-exclusivity; `close` needs `expiry` — and NOTHING needs a
   privileged caller for the money to get where it belongs.
5. Post-stop, accrued is constant across arbitrary time skips (frozen meter).

## Integration status

Deploy via `contracts/script/DeployInventions.s.sol` (env `AEGIS_REGISTRY`;
`GHAT_NO_GATE=1` for permissionless-open mode). Tests:
`contracts/test/GhatStream.t.sol` (9 scenarios incl. conservation +
Last-Rite) and the real-EVM harness `gGhat` block (open→accrue→claim→stop→
freeze→close). Marketplace streaming UX (`/hire` continuous mode) is the next
frontend slice.
