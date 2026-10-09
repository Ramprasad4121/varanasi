# Varanasi chit funds (on-chain ROSCA)

Contract: `contracts/src/finance/chit/ChitFund.sol` (randomness: `IRandomness.sol`, test VRF: `MockRandomness.sol`).
Legacy `contracts/src/finance/ChitPool.sol` (simple rotation) was audited and fixed, see "Audit of ChitPool" below; new groups should use ChitFund.
Status: local only, branch `hark/chit-funds`. Not deployed. Needs legal review before any real user (see "Law" below).

## Rules in one screen

- A foreman deploys a group with N members (2 to 50), a fixed contribution C per round, and N rounds.
- Every member pays C every round. The pot each round is what was paid (N x C when everyone pays).
- Each round one member who has not won yet takes the pot. Every member wins exactly once. Past winners cannot bid or be drawn again.
- Three ways to pick the winner, fixed when the group is created:
  - FIXED_ORDER: the published member order.
  - DRAW: members commit then reveal random seeds; optional Chainlink VRF on top.
  - AUCTION: sealed bids (commit then reveal). The lowest bid (largest discount) wins.
- Foreman commission (auction only) = min(discount, 5% of the pot). The cap is a hard constant (500 bps) checked in the constructor.
- The rest of the discount, plus late fees and forfeited reveal bonds, is split equally among the other members who paid that round. Rounding dust goes to the round winner.
- Amounts are in the token's base units, so any ERC20 decimals work: an INR stablecoin with 2 decimals, USDC with 6, or a gold token like vGOLD with 18 (1 token = 1 g, so a "10 g a month" chit is C = 10e18). Fee on transfer tokens are rejected.

### Worked example (tested exactly in `test_WorkedExample_TenMembers_Rs5000`)

10 members, Rs 5,000 a month, 2 decimal INR token.

| item | amount |
| --- | --- |
| pot | Rs 50,000.00 |
| winning bid (prize) | Rs 45,000.00 |
| discount | Rs 5,000.00 |
| foreman (5% of pot, capped) | Rs 2,500.00 |
| dividend pool | Rs 2,500.00 |
| each of the 9 others | Rs 277.77 |
| dust (2,500.00 minus 9 x 277.77) | Rs 0.07, to the winner |

Nothing is lost: 45,000 + 2,500 + 9 x 277.77 + 0.07 = 50,000.

## Round timeline

Each round starts when the previous one settles (round 1 starts when the last member enrolls).

1. Pay window (`payWindow`, e.g. 3 days): pay C on time.
2. Grace (`gracePeriod`, e.g. 2 days): pay C plus late fee (`lateFeeBps` of C). The fee goes into that round's dividend pool. Bid and seed commits also close at the end of grace.
3. Reveal window (`revealWindow`, e.g. 1 day): reveal bids or seeds.
4. Settle: anyone can call `settle()` after the reveal window. It never transfers tokens, it only updates balances, so nobody can block it (no blacklist or revert griefing). Everyone pulls their money with `withdraw()`.

## Winner security: escrow backed liability (one design for both "collateral" and "hold back")

A winner still owes (N minus rounds paid) x C. The prize is credited to the winner's escrow, and only the part of escrow above that liability can be withdrawn.

- Want the whole prize now? Post collateral first (`postCollateral`). Anyone can post for a member, for example a family guarantor.
- No collateral? The prize is held back and released C at a time as each later contribution is paid.
- Winner skips a round: C is slashed from escrow into the pot, the member is marked as a defaulter, and a late fee sized penalty is taken from any escrow above the liability. The group is always paid.
- Auction bidders must already be covered: a bid is accepted only if escrow plus bid covers the remaining contributions. In FIXED_ORDER, DRAW and no bid rounds the prize can be smaller than the liability only after heavy defaults; then the prize is fully locked and any later shortfall is recorded in the `Slashed` event.

This matches the Chit Funds Act 1982 s.22(1) proviso (a prized subscriber may take the net chit amount without security by agreeing to deduction of all future subscriptions) and s.31 (prized subscriber security).

Why not reuse `CollateralVault`: it only releases whole positions (no rolling release of C per round), its owner can pause new locks and change the asset allowlist and resolver set, which adds an admin who could freeze a group. ChitFund keeps collateral inside the group with no admin.

## Defaults and forfeits (non winners)

- A member who has not won and does not pay by the end of grace is excluded: no more payments, cannot win.
- Once every remaining member has won, any leftover rounds are "settlement rounds": their pots go to a reserve.
- At the end of the fund the reserve is paid out in this order:
  1. Each excluded member gets back what they paid minus `forfeitBps` (e.g. 10%). Pro rata if the reserve is short. (Act s.30(3): defaulter's contributions repaid after termination subject to deductions in the agreement.)
  2. Members who paid in more than they received (their pots were smaller because of the default) are made whole.
  3. Anything left (the forfeit) is split equally among non excluded members, dust to the first of them.

## Randomness (DRAW mode)

- Members commit `keccak256(abi.encode(fund, round, member, seed, salt))` before grace ends, with an optional reveal bond.
- Reveal in the reveal window. The draw seed is the XOR of revealed seeds.
- A member who commits and does not reveal loses the bond (to the dividend pool) and cannot win that round. So the "last revealer withholds" trick can never help the withholder; it can only flip one bit for someone else, at the cost of the bond.
- `IRandomness` (request then read) lets a Chainlink VRF adapter drop in. The request is made only after reveals close, so member seeds are fixed before the VRF word exists. If VRF does not answer within `vrfTimeout`, the round falls back to the member seeds (or `prevrandao` if nobody revealed). Recommended for real groups: VRF on, reveal bond on.
- Only one eligible member left: they win without any draw.

## Auction rules

- Sealed bids: commit before grace ends, reveal in the reveal window. Only members who paid this round and have not won can reveal.
- Bid range: pot x (1 minus maxDiscount) up to the pot. The Act caps discount at 30% of the gross chit amount (s.6(3)); default `maxDiscountBps = 3000`.
- Equal lowest bids are settled by lot (Act s.6(4)), seeded by the XOR of all revealed bid salts.
- No bids: the first eligible member in the published order takes the full pot, no discount, no commission.

## Trust model

| actor | can | cannot |
| --- | --- | --- |
| foreman | create the group and pick members; cancel before start (no money exists yet); withdraw commission | touch member funds, change terms, pause, sweep, bid, commit seeds, settle differently from anyone else, take more than 5% of any pot |
| member | pay, bid, commit/reveal, post collateral, withdraw own credit and free escrow | withdraw escrow below their liability, win twice, win after exclusion |
| anyone | settle after the reveal window, request VRF, post collateral for a member | anything else |
| token issuer | a pausable or blacklisting token (USDC, a bank gold token) can freeze withdrawals | change ChitFund balances |

Tests that enforce this: `test_Foreman_OnlyCommission`, `test_Foreman_CommissionCapAndMembership`, `test_Foreman_CancelOnlyBeforeStart`, `test_Draw_ForemanCannotCommitOrReveal`, plus invariants below.

## Tests

- Unit: worked example (2 and 18 decimals), gold chit in grams, full auction cycle, no bids rule, tie by lot, bid bounds, deep bid needs collateral, past winner cannot bid, unpaid bidder cannot reveal, wrong salt, fixed order net zero, draw from seeds, non revealer loses bond and cannot win, VRF request/fulfil, VRF timeout fallback, late fee to pot, payment closed after grace, winner default slashed, non winner exclusion and end refunds, foreman limits, fee on transfer rejected.
- Fuzz (256 runs each): auction cycle over N in 2..12, C up to 1e27, random bids (fee cap, pot fully routed, each wins once, nothing stuck, no value created); draw with random withholders; random defaults and late payments in fixed and auction modes.
- Invariant (5 member auction, 128k random calls): token balance == `totalOwed()`; each member wins at most once and exactly once unless excluded; foreman fee <= 5% of each pot; excluded members never win.
- Demo: `scripts/chit-demo.sh` runs a 5 member auction chit on local anvil with one winner who stops paying and is slashed.

## Audit of ChitPool (Oct 9, 2026)

Failing tests first (`contracts/test/finance/ChitPoolAudit.t.sol`), then fixes:

| severity | finding | fix |
| --- | --- | --- |
| Critical | `terminate()` sent the whole pool balance (members' open round contributions) to the starter: a one call rug | refunds each contributor of the open round; starter gets nothing |
| High | a member could win twice (slot member misses, scan picks a past winner; or totalRounds > members) | `hasWon` skip, rounds <= capacity, refund round when only past winners paid |
| High | no default handling: a winner could take the pot and stop paying with no consequence | not fixable in the legacy design; use ChitFund (escrow backed liability) |
| Medium | a round where nobody paid reverted forever (`ChitNoContributors`) while contribute also reverted: pool bricked | empty round advances |
| Medium | settle before the group was full; late joiners reshuffled the rotation | settle requires a full pool |
| Medium | round 1 deadline ran from deployment, so a pool that filled late could never take round 1 | clock starts when the pool fills |
| Low | winner is predictable (deterministic rotation), no auction, no commission, unbounded member loops | by design for the legacy pool; ChitFund covers these |

## Law (summary; full notes and sources in HANDOFF.md "Chit fund risks")

An on-chain ROSCA is a "chit" under the Chit Funds Act 1982 (s.2(b) covers "Rotating Savings and Credit Institution or by any other name"). Running one needs prior State sanction and registration (s.4), a foreman security deposit (s.20), and has caps (commission 7% since 2020, discount 30%, duration 5 years). Legal review before real users.

## Known limits and next steps

- Foreman security deposit (s.20) is not modelled on chain. Option: a foreman bond held by the contract and slashable by members' vote.
- Coverage is 100% of remaining contributions; the Act's "sufficient security" is one third more (s.21(1)(e) Explanation). Configurable coverage is a one line change if Ram wants it.
- Collateral must be the contribution token. Gold collateral for a rupee chit needs a price oracle.
- Member substitution for excluded members (s.29) and a 7 day cure after removal (s.28) are not modelled; the grace period plays the cure role.
- Real Chainlink VRF adapter not written yet (interface is ready).
