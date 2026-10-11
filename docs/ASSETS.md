# Bank-backed assets: gold, silver, platinum, pledged items, bank asset desk

Status: local prototype on branch `hark/multi-asset` (builds on `hark/people-app`, PR #125). Mock bank signers only. Not deployed anywhere, not a regulated product. Read "Legal notes" at the end before showing any of this to a user or a bank. Test money only.

## One line per asset kind

| kind | examples | on chain | tradeable? |
|---|---|---|---|
| Fungible metal | gold, silver, platinum | one ERC-20 per metal, 1 token = 1 g fine metal, bank attested, per-metal proof of reserve and pause | metal tokens transfer like gold does today |
| Unique valuable | car, two wheeler, land papers, jewellery set | one ERC-721 pledge receipt per item, hashes only, bank holds the lien | no: moves only with a bank approval or through a trusted lien contract |
| Bank-held stock | defaulted gold loan jewellery, repossessed vehicle, SARFAESI property | the same pledge receipt, listed on the bank asset desk | only by auction among approved buyers, after the borrower's redemption window |

## Fungible metals (`contracts/src/assets/`)

Gold keeps its reviewed `BankGoldIssuer` + `GoldToken` + `GoldRegistry` unchanged (all gold tests pass as before). Every other metal gets its own copy of the same machine:

| contract | role |
|---|---|
| `MetalToken.sol` | ERC-20 + permit + ERC-2771, name and symbol per metal (e.g. "Varanasi Silver", vSILVER). Mint and burn only by its bound issuer. 1e18 units = 1 g fine metal. |
| `MetalCertificateRegistry.sol` | single-use deposit certificates, same state machine as `GoldRegistry` |
| `BankMetalIssuer.sol` | `BankGoldIssuer` generalised: same EIP-712 `BankAttestation` / `ReserveReport`, mint, redemption queue, disputes, signed reserve reports, bank caps, global and per-bank pause. Adds `metalCode` (e.g. "XAG"), an EIP-712 domain name per metal (so a silver signature can never mint platinum or gold), and a purity floor (`minPurityPermille`, e.g. 999 for silver bars). |
| `IMetalPriceFeed.sol` | display-only rupee price per gram, same shape as `IGoldPriceFeed` |
| `AssetRegistry.sol` | the list of metals the app offers. `listMetal(code, name, token, issuer)` checks token and issuer are bound to each other. `reserveOf(code)` / `allReserves()` give every metal's supply, attested, pending, disputed, fully backed and paused in one call. |

Why a copy and not a refactor of gold: the gold issuer is already reviewed and tested, and the people app and gold demo depend on its exact ABI. Moving gold onto `BankMetalIssuer` later is a redeploy, not a code change. A factory was left out on purpose: deploying token + registry + issuer from one contract would exceed the EIP-170 size limit; a deploy script does it in three transactions.

Per metal, enforced on chain and checked by `MetalInvariantTest` (random deposits, redemptions, releases, cancels and transfers across silver and platinum):

- `supply + pending + disputed <= attested` for each metal on its own
- one metal's pause, dispute or short reserve report never touches another metal
- gold supply is untouched by the other metals

## Unique valuables: pledge receipts (`PledgeReceipt.sol`, `PledgeLoan.sol`)

A car or a plot is not split into tradeable pieces. The bank inspects and appraises the item, keeps its lien (hypothecation noted on the vehicle RC, deposit of title deeds for land, custody for jewellery) and signs an EIP-712 `PledgeAttestation`:

| field | meaning |
|---|---|
| `bankId` | registered bank |
| `holder` | who gets the receipt (the owner, or the bank itself for repossessed stock) |
| `receiptRef` | bank's pledge number, hashed; single use |
| `assetClass` | 0 car, 1 two wheeler, 2 land document, 3 jewellery set, 4 other |
| `assetIdHash` | keccak256 of RC number / VIN / survey number / hallmark id plus a bank salt. Never the number itself. |
| `detailsHash` | hash of the bank's appraisal file |
| `appraisedPaise`, `appraisedAt`, `reappraiseBy` | value in paise and the date after which it must be re-checked |
| `nonce`, `expiry` | single use, time bound |

Rules the chain enforces:

- only a registered bank signer creates a receipt; each attestation and each `receiptRef` once
- a receipt moves between people only to the one address the bank approved (`approveTransfer`, one shot), or into / out of a contract governance trusts to enforce the lien (`lienMover`: the loan book and the asset desk). A lien mover has to drive the move itself, so nobody can push a receipt into the desk or the loan book behind its back
- the bank can `freeze` (dispute, police case, court order) and `release` (lien cleared, item handed back: receipt burned; not possible while a loan or the desk holds it)
- `collateralValuePaise` = appraisal minus a haircut per class (car 30%, two wheeler 40%, land 25%, jewellery 15%, other 50%); 0 when frozen or past `reappraiseBy`

`PledgeLoan`: the lender is always the bank that holds the lien, from its own lending pot. Most a holder can borrow = collateral value x LTV per class (car 60%, two wheeler 50%, land 60%, jewellery 75%, other 40%), so a Rs 6 lakh car lends at most Rs 2.52 lakh. The due date must fall before `reappraiseBy`. After the due date the bank `claimDefault`s and the receipt goes to the bank (next step: legal notice, then the asset desk). No interest in the demo. Solvency: the rupee balance of the loan book always equals the banks' free pots (`DeskInvariantTest.invariant_loanBookSolvent`).

Why a separate `PledgeLoan` and not `LoanAgreement` + `CollateralVault`: the vault is ERC-20 only and values a position by its token amount; a pledge receipt is one ERC-721 whose value is the bank's appraisal with a haircut and an expiry. `PledgeLoan` keeps the same lock, borrow, repay, default shape. Joining them behind one interface is an open item.

## Bank asset desk (`BankAssetDesk.sol`)

For items a bank already holds after a default. The bank lists the receipt with a reserve price, the legal step reached (demand notice, possession taken, auction notice served) and the end of the borrower's redemption window. English (open, rising, 1% minimum step) or sealed (commit, reveal) auction. Every bid is escrowed in mock rupee.

Enforced on chain:

- only approved buyers bid (`setApprovedBuyer`, governance, for vetted banks, NBFCs and dealers); the selling bank can never bid on its own listing
- nothing moves before the redemption window ends: `settle` reverts until both the window and the auction are over
- until then the borrower can `redeem` by paying the dues: the item goes back to the borrower, every bid is refunded
- at settlement the bank re-attests the value for the new holder (`moverReappraise`), the receipt moves to the winner, the bank gets its dues and any surplus goes to the borrower; below reserve the item goes back to the bank
- jewellery reserve price must be at least 90% of the bank's value
- escrow always covered: `rupee.balanceOf(desk) == totalEscrow + totalCredit` (pull payments; `DeskInvariantTest`)
- if the bank never settles, the high bidder takes the money back 30 days after the auction and window end
- the winner's receipt is still lien gated: it cannot be resold without the bank

No personal data: the borrower is a wallet address, the item an `assetIdHash`.

## In the app (test money)

`app/lib/assets.ts` is a browser test ledger that follows the contracts above with the same numbers (haircuts, LTVs, auction rules, surplus to borrower). It runs in both app modes. The chain-backed version of these screens is an open item; gold and chits stay on the chain in local mode as before.

| screen | route | one primary action |
|---|---|---|
| Silver (grams + rupees, Telugu + English, proof line) | `#silver` | Bank adds 100 g silver (demo) |
| Pledge an item: pick car / two wheeler / land papers / jewellery set, receipt card, borrow, pay back | `#pledge` | pledge, then borrow, then pay back |
| Bank asset desk (bank side, English) | `#bank` | approved buyer bids, then settle |

Entry points: Silver and Pledge tiles on Home and Gold; "Bank asset desk" link at the bottom of Home. No crypto words on these screens (checked by the walk-through).

## Tests

| suite | what |
|---|---|
| `test/assets/MetalIssuer.t.sol` | 13: registry lists and reads each reserve, rejects unbound pairs, owner only; silver mints 1 g per g; cross-domain signature refused; purity floor; certificate single use; per-metal pause; redeem and fulfil; short reserve report halts only that metal; 2 fuzz |
| `test/assets/Pledge.t.sol` | 19: issue stores hashes and values; wrong signer, replay, ref reuse, bad class, dates, expiry; transfer blocked without bank, bank approval one shot, cannot push into a lien mover, only the receipt's bank acts, freeze, stale value, release not while in loan, haircut bounds; borrow and repay, above LTV, term past re-appraisal, frozen, default only after due and only by the bank; 2 fuzz |
| `test/assets/BankAssetDesk.t.sol` | 14: list only by the receipt's bank with sane params; English happy path with re-attestation and surplus to borrower; no settle before the window; borrower redeems and bidders refunded; no redeem after the window; approved buyers only, seller cannot bid; bid rules; unsold; sealed reveal wins and refunds; unrevealed deposit reclaim; bank never settles; jewellery reserve floor; 2 fuzz |
| `test/assets/AssetsInvariant.t.sol` | `MetalInvariantTest`: per-metal supply within reserve, gold untouched. `DeskInvariantTest`: escrow fully covered, loan book solvent, no transfer before window, only approved bidders (random loans, defaults, listings, English and sealed bids, reveals, redemptions, settlements, withdrawals, clock moves) |
| `app/scripts/assets-test.mjs` | 6: silver, pledge numbers match the contracts, borrow limits, desk English auction and escrow, redemption, refused steps change nothing |
| `app/e2e/assets_e2e.py` | phone sized browser walk-through: save silver, Telugu, pledge a car, refused oversized loan, borrow and pay back, desk bid, unapproved bid refused, settle with surplus, borrower redeems; axe scan per screen; no console errors |

```
cd contracts && forge test --match-path 'test/assets/*'
cd app && npm run test:unit
scripts/app-public.sh --check     # includes the asset walk-through
```

### Slither triage (new contracts only)

Run: `slither . --filter-paths "lib/|test/|script/|src/(?!assets)"`. 1 Medium found and fixed: `reentrancy-no-eth` in `BankAssetDesk.redeem` (state was credited after pulling rupees; all entry points were already `nonReentrant` and the tokens are trusted, now effects come first). Remaining Low / Informational, accepted: `timestamp` (deadlines and windows are day scale), `reentrancy-benign` / `reentrancy-events` in `BankMetalIssuer` (same pattern as the reviewed gold issuer, calls only to its own bound token and registry), `calls-loop` in the registry and reserve views (view only, small lists), `dead-code` for the ERC-2771 `_msgData` override, one unindexed event address.

## Gold

Status: local prototype (gold first landed on branch `hark/gold-tokenization`). Mock bank signer only. Not deployed anywhere, not a regulated product. Read the "Regulatory status" section before showing this to any user or bank.

### One line

A partner bank holds the gold and signs what it holds; the chain makes sure no token exists that a bank signature does not cover, each certificate mints once, and anyone who holds the token can ask the bank for the metal.

### Flow

1. **Deposit.** A user brings gold (coins, bars, or jewellery) to a partner bank's gold deposit desk. This is a gold deposit, not a locker: the bank takes custody of the metal and owes fine gold back.
2. **Assay.** The bank (or its BIS-recognised assaying and hallmarking centre) tests and refines it. Result: milligrams of fine gold, e.g. 10.000 g gross at 995 fine = 9.950 g fine.
3. **Attest.** The bank's signing key (HSM or multisig in production) signs an EIP-712 `BankAttestation`:

   | field | meaning |
   |---|---|
   | `bankId` | registered bank id (bytes32) |
   | `user` | wallet that receives vGOLD |
   | `certificateId` | the bank's deposit certificate number, hashed; single use forever |
   | `fineGramsMilli` | milligrams of FINE gold after assay |
   | `purityPermille` | assayed fineness, e.g. 995 (informational; amount is already fine) |
   | `nonce` | per bank, single use; the bank can burn a nonce to cancel |
   | `expiry` | unix time after which the attestation is dead |

   Domain: name `Varanasi Gold`, version `1`, chainId, verifyingContract = `BankGoldIssuer`. So a signature cannot be replayed on another chain or another deployment.
4. **Mint.** Anyone relays `(attestation, signature)` to `BankGoldIssuer.mint`. The issuer checks the signer is that bank's registered key (EOA or ERC-1271 contract), the bank is not paused or short on reserves, expiry, nonce, then records the certificate in `GoldRegistry` (reverts if it was ever used or revoked) and mints `fineGramsMilli * 1e15` units to `user`. **1 vGOLD = 1 g fine gold, 18 decimals, 1 mg = 1e15 units.**
5. **Use.** vGOLD is a plain ERC20. Users trade it or lock it as collateral; the gold never leaves the bank. Transfers are never paused.
6. **Redeem.** Any holder (gasless through the relayer, see "For the app") calls `requestRedemption(bankId, amountMilli, deliveryRef)`. The tokens are burned at once and a `RedemptionRequested` event goes to the bank's back office. The bank KYCs the holder off chain, hands over the gold, then calls `fulfilRedemption(id, releaseRef)`; attested reserves drop by the same grams. If the bank refuses (KYC fails, below its minimum bar size) it calls `cancelRedemption` and the tokens are re-minted. If the bank does nothing for 30 days, the holder can `reclaimRedemption` and get the tokens back.

### For the app (Oct 9, 2026: built for rural Telangana/Andhra families and salaried users)

Everything an app needs is one view call, in grams and rupees, no crypto words:

| show the user | call | returns |
|---|---|---|
| "My gold: 9.950 g, Rs 1,19,400" | `issuer.myGold(wallet)` | milligrams, value in paise, price time |
| plain balance | `token.milligramsOf(wallet)` | milligrams (9950 = 9.950 g) |
| "My redemptions" with status | `issuer.redemptionsOf(wallet)` | ids + each request (bank, grams, branch ref, time, PENDING / FULFILLED / CANCELLED) |
| "Is my bank safe?" | `issuer.bankReserve(bankId)` or `issuer.allBankReserves()` | bank name, gold held, owed to holders, awaiting release, under dispute, fully backed yes/no, new deposits paused, last bank report, value of gold held in paise |
| whole system | `issuer.proofOfReserve()` | supply, attested, pending, disputed, fully backed |

Rupee values come from a display-only `IGoldPriceFeed` (`pricePaisePerGram()`), set by governance. The price is never used to mint, burn or redeem. With no feed set, rupee values read 0 and the app shows grams only. `MockGoldPriceFeed` is for demos.

Events an app or bank back office can index (all carry grams in milligrams and the holder where relevant): `GoldMinted(bankId, certificateId, user, fineMilli, purity)`, `RedemptionRequested(id, bankId, holder, amountMilli, deliveryRef)`, `RedemptionFulfilled(id, bankId, holder, amountMilli, releaseRef)`, `RedemptionCancelled(id, bankId, holder, amountMilli, reason)`, `CertificateDisputed`, `DisputeCleared`, `CertificateWrittenOff`, `ReserveReported`, `BankPaused` / `BankUnpaused`.

**No gas for users.** Users only sign; a Varanasi relayer pays gas.
- Mint: the bank's signed attestation can be submitted by anyone, so the relayer submits it.
- Transfer, redeem, reclaim: through OpenZeppelin's `ERC2771Forwarder` (a trusted forwarder fixed at deploy in both `GoldToken` and `BankGoldIssuer`). The user signs an EIP-712 `ForwardRequest`; the contracts see the user as the sender, never the relayer. Forwarder nonces stop replays; a request signed by the wrong key is rejected.
- Approvals: `GoldToken` supports EIP-2612 `permit`.
- Risk to note: whoever controls the forwarder deployment cannot forge signatures, but the forwarder address is immutable, so choose it once (the stock OZ forwarder, not a custom one).

### Contracts (`contracts/src/gold/`)

| contract | role |
|---|---|
| `GoldToken.sol` (vGOLD) | ERC20. Mint and burn only by the issuer, bound once by the deployer (`bindIssuer`, irreversible). |
| `GoldRegistry.sol` | Certificate store. `NONE -> MINTED`, `NONE -> REVOKED`, `MINTED -> DISPUTED -> MINTED or WRITTEN_OFF`. Every transition is issuer only. |
| `IGoldPriceFeed.sol`, `MockGoldPriceFeed.sol` | display-only rupee price per gram (paise) |
| `BankGoldIssuer.sol` | Bank registry (signer, operator, pause flags, reserve accounting), EIP-712 verification, mint, redemption queue, disputes, signed reserve reports, global pause. Owner = governance (should be a multisig + timelock before any real deployment). |

`GoldAttestor.sol` was removed: its attestor allowlist overlapped the registry's own allowlist and is replaced by one bank signer per `bankId`.

#### Roles

| role | can do |
|---|---|
| Governance (owner) | add banks, rotate a bank's signer/operator, global pause/unpause, unpause a bank, raise or clear disputes |
| Bank signer key | sign attestations and reserve reports (never sends transactions) |
| Bank operator | fulfil/cancel redemptions, revoke an unused certificate, burn a nonce, pause its own bank, raise a dispute, write off a disputed certificate by burning its own vGOLD |
| Anyone | relay a signed attestation or reserve report, request redemption with their own vGOLD |

### Proof of reserve

Per bank, in milligrams of fine gold:

- `attestedMilli`: gold the bank attests it holds for vGOLD (minted minus released minus written off)
- `liabilityMilli`: vGOLD outstanding attributed to this bank
- `pendingMilli`: burned into redemption, not yet released
- `disputedMilli`: part of attested that is under dispute

Enforced on chain (and checked by the invariant suite over 128,000 random calls):

- per bank: `attestedMilli == liabilityMilli + pendingMilli`, `disputedMilli <= attestedMilli`
- `sum(liabilityMilli) * 1e15 == vGOLD.totalSupply()`
- therefore `totalSupply <= sum of bank-attested outstanding grams` at all times

`proofOfReserve()` returns `(supplyMilli, attestedMilli, pendingMilli, disputedMilli, fullyBacked)` where `fullyBacked = supply + pending + disputed <= attested`.

**Signed reserve reports.** A bank (or anyone relaying its signature) can post `ReserveReport{bankId, reservesMilli, asOf, seq}` signed by the bank key. `seq` must increase. If `reservesMilli` is below what the bank owes (`attestedMilli`), minting at that bank halts until a later report covers it. This is the hook for an independent auditor's or a Chainlink PoR feed's number later.

### Disputes, pause, revoke

- **Unminted attestation:** the bank calls `revokeAttestation(bankId, certificateId)` or `invalidateNonce`. The signature can never mint.
- **Minted certificate:** cannot be revoked (old bug F3). The bank or governance calls `disputeCertificate`. Effects: the certificate's grams move into `disputedMilli`, the bank's minting pauses, `fullyBacked` turns false, redemptions that would release disputed grams are blocked. **Holder balances are never touched.**
  - Gold is found: governance `clearDispute`, then `unpauseBank`.
  - Gold is really missing: the bank buys back the same grams of vGOLD and calls `writeOffCertificate`, which burns from the bank operator's own balance and removes the grams from reserves. Until the bank does this the shortfall stays visible on chain.
- **Global pause** (governance): stops new mints and new redemption requests. Transfers, bank fulfil/cancel, and holder reclaim still work, so nobody gets stuck mid-redemption.
- **Bank pause:** the bank or governance can pause a bank's minting; only governance resumes it.

### Trust model

The bank is trusted for **custody and assay**: if it signs grams it does not hold, the chain cannot know. What the chain does guarantee:

- no vGOLD exists without a valid signature from a registered bank key
- each certificate and each nonce mints at most once, on one chain, on one deployment
- supply never exceeds what banks attested, per bank and in total
- a bank's own reserve report below its liability stops new minting automatically
- only the bank operator can confirm a release; only the holder or the bank can unwind a redemption
- nobody, including governance, can burn a holder's tokens

Governance is trusted to register honest banks and to rotate keys. Before mainnet: multisig + timelock on the owner, and a per-bank mint cap.

### Borrowing against vGOLD

`contracts/test/gold/GoldCollateral.t.sol` locks vGOLD in the existing `CollateralVault`, borrows mock INR through `LoanAgreement` (sized with a test-only INR/gram feed at 70% LTV), defaults, and the lender redeems the gold through the bank. It works, but read the review notes: `CollateralVault` has no price oracle and no price-based liquidation (only time-based default in `LoanAgreement`), and `LoanAgreement` has two critical bugs (L1, L2 in the review log) that must be fixed before any real collateral goes in.

### Run it

```
cd contracts && forge test --match-path 'test/gold/*'   # 39 tests incl. fuzz + invariant
scripts/gold-demo.sh                                    # local anvil, mock bank signer
```

Transcript: `demo/gold-demo.transcript.txt`.

### Tests

| suite | what |
|---|---|
| `BankGoldIssuer.t.sol` | 26: audit regressions F1 to F7, EIP-712 hygiene (redirect, expiry, nonce, cross chain, cross deployment, key rotation), pause, redemption, disputes, reserve reports, 2 fuzz |
| `GoldInvariant.t.sol` | handler over mint / transfer / redeem / fulfil / cancel / reclaim / dispute / clear / write-off; supply and per-bank conservation invariants |
| `GoldCollateral.t.sol` | vault + loan integration, plus 2 tests that document the open LoanAgreement exploits |
| `GoldApp.t.sol` | 8: my gold in grams and rupees, no-feed fallback, per-bank reserve views, gasless redemption + status, gasless transfer, relayer cannot spoof, permit, holder in events |

### Regulatory status (India, as checked on Oct 9, 2026)

This is not legal advice; it is what the public sources say.

- SEBI, Nov 8, 2025 (PR 70/2025): "Digital Gold / E-Gold" products sold by online platforms "are neither notified as securities nor regulated as commodity derivatives", operate "entirely outside the purview of SEBI", and none of the securities market investor protections apply. SEBI points investors to its regulated routes: exchange traded commodity derivatives, Gold ETFs, and Electronic Gold Receipts (EGRs). https://www.sebi.gov.in/sebi_data/attachdocs/nov-2025/1762580259409.pdf
- SEBI EGR framework (Board, Sep 28, 2021): EGRs are notified as securities under SCRA, trade on recognised stock exchanges, are fungible across vault managers, and holders can withdraw the gold on surrender. Vault Managers are SEBI intermediaries, must be Indian body corporates with at least Rs 50 crore net worth, and handle deposit, storage, EGR creation, withdrawal and reconciliation with the depository. https://www.sebi.gov.in/sebi_data/attachdocs/sep-2022/1664430234910.pdf
- SEBI consultation (Aug 2026) proposes widening the Vault Managers Regulations to all SEBI bullion instruments (EGRs, bullion ETFs, bullion derivatives) and raising minimum net worth to Rs 75 crore. https://www.sebi.gov.in/sebi_data/attachdocs/aug-2026/1786454556940.pdf
- Gold Monetisation Scheme: the Medium and Long Term Government Deposit parts were discontinued from Mar 26, 2025; Short Term Bank Deposits (1 to 3 years) continue at each bank's discretion. Banks credit deposits in 995 fineness gold. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2115009 and https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12801
- Not fetched, so unverified: EGR vault managers reportedly accept deposits only through accredited refineries or nominated agencies (SEBI EGR master circular, Jun 2024, seen only in a search excerpt).

What this means for the design: a freely transferable public-chain token over bank gold looks like the "digital gold" SEBI warned about, unless it sits inside a regulated wrapper. The most viable paths look like (1) the EGR route, with a SEBI-registered vault manager as custodian and the token as a mirror of demat EGRs, or (2) a bank's GMS Short Term Bank Deposit with the bank as the regulated party and Varanasi as its technology provider, piloted inside a regulator sandbox. Both need lawyers and the partner's regulator, not just code.

## Legal notes for silver, pledged items and the asset desk (India, checked Oct 11, 2026)

Not legal advice. Every item below needs a lawyer and the partner bank's compliance team before any real use.

- **RBI (Lending Against Gold and Silver Collateral) Directions, 2025** (June 6, 2025, updated Sep 29, 2025; to be complied with no later than April 1, 2026). Eligible collateral is only jewellery, ornaments and coins of gold or silver; no loans against primary gold or silver (bullion) or financial assets backed by them, and no loans to buy gold. Consumption loan LTV caps: 85% up to Rs 2.5 lakh, 80% above Rs 2.5 lakh up to Rs 5 lakh, 75% above Rs 5 lakh, maintained through the tenor. Only intrinsic metal value counts (no stones). Coins capped at 50 g gold / 500 g silver per borrower, ornaments at 1 kg gold / 10 kg silver. A lender may not re-pledge gold or silver pledged to it. Auctions: adequate notice to the borrower before auction (one month after a public notice if the borrower cannot be found), public advertisement in two newspapers, reserve price at least 90% of current value (85% after two failed auctions), first auction physically in the lending branch's district (online only after a failed first auction), the lender and its related parties may not bid, surplus refunded to the borrower within 7 working days. https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12859&Mode=0
  - What this means here: silver *savings* (bars and coins at 99.9%) are a deposit product, not collateral; a loan against silver savings would be a loan against primary silver, which is not allowed, so the app offers no loan against silver. Jewellery sets on pledge receipts follow the LTV table (our 15% haircut x 75% LTV is below every cap). The desk already enforces the 90% jewellery reserve floor, the seller-cannot-bid rule and surplus to the borrower; the physical-first-auction and newspaper notice rules are off chain, so gold loan jewellery should only come to the desk after a failed first physical auction.
- **Vehicles.** A vehicle loan is a hypothecation: the bank's lien is endorsed on the registration certificate under the Motor Vehicles Act and the owner keeps and uses the vehicle. Banks do not custody vehicles while the loan runs; they repossess only after default under the loan agreement. So the pledge receipt mirrors the RC endorsement, it is not a claim on a vehicle in a vault. (General practice, not checked against a primary source in this pass.)
- **Land and property.** Security over property is a mortgage (often by deposit of title deeds) and enforcement for secured lenders runs under SARFAESI: demand notice, then possession, then sale by public auction with notice periods. The desk's `legalStatus` mirrors those steps; it does not replace them. (Not checked against the SARFAESI rules text in this pass.)
- **Fractional tradeable tokens of real assets are likely securities.** A freely tradeable token that splits a car, a plot or a pool of jewellery into units sold to the public would likely be treated as a security or collective investment scheme under SEBI's remit (see the SEBI digital gold warning cited in the gold section). That is why pledge receipts are whole, non-fractional and bank-gated, and why desk trading is limited to approved banks and dealers. Opening trading to the public needs a regulated wrapper first.
- **Bank to bank transfers of loans.** If a bank sells the loan itself (not just the repossessed item), the RBI Master Direction (Transfer of Loan Exposures) Directions, 2021 applies: stressed loans go only to permitted transferees and ARCs, by assignment or novation, cash basis, Board-approved policy, e-auction platforms allowed, Swiss Challenge above Rs 100 crore. https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12166
- **Unclaimed deposits are out of scope.** Deposits and amounts unclaimed for ten years move to the RBI Depositor Education and Awareness (DEA) Fund under Section 26A of the Banking Regulation Act; the depositor can still claim from the bank. Those are not bank-owned assets and must never be listed on the desk. https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12589&Mode=0 . Unclaimed pledged gold and silver (two years after the loan is repaid) also stays the borrower's and needs reminders, not an auction (RBI 2025 directions, para 48).
- **Personal data.** Only hashes go on chain. The bank keeps the RC, VIN, survey number, KYC and appraisal file off chain under its own data protection duties.

## Open questions for Ram

1. Is silver savings enough for v1, or should silver also redeem and send like gold does in the app?
2. Which asset classes should the desk accept first: gold loan jewellery after a failed physical auction, repossessed two wheelers, or SARFAESI property?
3. Approved buyers: who vets them (each bank, Varanasi, or a consortium), and should banks be able to add their own?
4. Should pledge loans carry interest on chain (bank-set rate), and should the jewellery LTV follow the RBI slab table by loan size instead of one flat 75%?
5. Wire the new contracts into the local chain demo (deploy script + server state) so silver and pledges are chain backed like gold, or keep them on the browser test ledger until a bank partner is signed?
