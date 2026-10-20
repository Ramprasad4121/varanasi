# Bank-backed gold (vGOLD)

Status: local prototype on branch `hark/gold-tokenization`. Mock bank signer only. Not deployed anywhere, not a regulated product. Read the "Regulatory status" section before showing this to any user or bank.

## One line

A partner bank holds the gold and signs what it holds; the chain makes sure no token exists that a bank signature does not cover, each certificate mints once, and anyone who holds the token can ask the bank for the metal.

## Flow

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

## For the app (Oct 9, 2026: built for rural Telangana/Andhra families and salaried users)

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

## Contracts (`contracts/src/gold/`)

| contract | role |
|---|---|
| `GoldToken.sol` (vGOLD) | ERC20. Mint and burn only by the issuer, bound once by the deployer (`bindIssuer`, irreversible). |
| `GoldRegistry.sol` | Certificate store. `NONE -> MINTED`, `NONE -> REVOKED`, `MINTED -> DISPUTED -> MINTED or WRITTEN_OFF`. Every transition is issuer only. |
| `IGoldPriceFeed.sol`, `MockGoldPriceFeed.sol` | display-only rupee price per gram (paise) |
| `BankGoldIssuer.sol` | Bank registry (signer, operator, pause flags, reserve accounting), EIP-712 verification, mint, redemption queue, disputes, signed reserve reports, global pause. Owner = governance (should be a multisig + timelock before any real deployment). |

`GoldAttestor.sol` was removed: its attestor allowlist overlapped the registry's own allowlist and is replaced by one bank signer per `bankId`.

### Roles

| role | can do |
|---|---|
| Governance (owner) | add banks, rotate a bank's signer/operator, global pause/unpause, unpause a bank, raise or clear disputes |
| Bank signer key | sign attestations and reserve reports (never sends transactions) |
| Bank operator | fulfil/cancel redemptions, revoke an unused certificate, burn a nonce, pause its own bank, raise a dispute, write off a disputed certificate by burning its own vGOLD |
| Anyone | relay a signed attestation or reserve report, request redemption with their own vGOLD |

## Proof of reserve

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

## Disputes, pause, revoke

- **Unminted attestation:** the bank calls `revokeAttestation(bankId, certificateId)` or `invalidateNonce`. The signature can never mint.
- **Minted certificate:** cannot be revoked (old bug F3). The bank or governance calls `disputeCertificate`. Effects: the certificate's grams move into `disputedMilli`, the bank's minting pauses, `fullyBacked` turns false, redemptions that would release disputed grams are blocked. **Holder balances are never touched.**
  - Gold is found: governance `clearDispute`, then `unpauseBank`.
  - Gold is really missing: the bank buys back the same grams of vGOLD and calls `writeOffCertificate`, which burns from the bank operator's own balance and removes the grams from reserves. Until the bank does this the shortfall stays visible on chain.
- **Global pause** (governance): stops new mints and new redemption requests. Transfers, bank fulfil/cancel, and holder reclaim still work, so nobody gets stuck mid-redemption.
- **Bank pause:** the bank or governance can pause a bank's minting; only governance resumes it.

## Trust model

The bank is trusted for **custody and assay**: if it signs grams it does not hold, the chain cannot know. What the chain does guarantee:

- no vGOLD exists without a valid signature from a registered bank key
- each certificate and each nonce mints at most once, on one chain, on one deployment
- supply never exceeds what banks attested, per bank and in total
- a bank's own reserve report below its liability stops new minting automatically
- only the bank operator can confirm a release; only the holder or the bank can unwind a redemption
- nobody, including governance, can burn a holder's tokens

Governance is trusted to register honest banks and to rotate keys. Before mainnet: multisig + timelock on the owner, and a per-bank mint cap.

## Borrowing against vGOLD

`contracts/test/gold/GoldCollateral.t.sol` locks vGOLD in the existing `CollateralVault`, borrows mock INR through `LoanAgreement` (sized with a test-only INR/gram feed at 70% LTV), defaults, and the lender redeems the gold through the bank. It works, but read the review notes: `CollateralVault` has no price oracle and no price-based liquidation (only time-based default in `LoanAgreement`), and `LoanAgreement` has two critical bugs (L1, L2 in the review log) that must be fixed before any real collateral goes in.

## Run it

```
cd contracts && forge test --match-path 'test/gold/*'   # 39 tests incl. fuzz + invariant
scripts/gold-demo.sh                                    # local anvil, mock bank signer
```

Transcript: `demo/gold-demo.transcript.txt`.

## Tests

| suite | what |
|---|---|
| `BankGoldIssuer.t.sol` | 26: audit regressions F1 to F7, EIP-712 hygiene (redirect, expiry, nonce, cross chain, cross deployment, key rotation), pause, redemption, disputes, reserve reports, 2 fuzz |
| `GoldInvariant.t.sol` | handler over mint / transfer / redeem / fulfil / cancel / reclaim / dispute / clear / write-off; supply and per-bank conservation invariants |
| `GoldCollateral.t.sol` | vault + loan integration, plus 2 tests that document the open LoanAgreement exploits |
| `GoldApp.t.sol` | 8: my gold in grams and rupees, no-feed fallback, per-bank reserve views, gasless redemption + status, gasless transfer, relayer cannot spoof, permit, holder in events |

## Regulatory status (India, as checked on Oct 9, 2026)

This is not legal advice; it is what the public sources say.

- SEBI, Nov 8, 2025 (PR 70/2025): "Digital Gold / E-Gold" products sold by online platforms "are neither notified as securities nor regulated as commodity derivatives", operate "entirely outside the purview of SEBI", and none of the securities market investor protections apply. SEBI points investors to its regulated routes: exchange traded commodity derivatives, Gold ETFs, and Electronic Gold Receipts (EGRs). https://www.sebi.gov.in/sebi_data/attachdocs/nov-2025/1762580259409.pdf
- SEBI EGR framework (Board, Sep 28, 2021): EGRs are notified as securities under SCRA, trade on recognised stock exchanges, are fungible across vault managers, and holders can withdraw the gold on surrender. Vault Managers are SEBI intermediaries, must be Indian body corporates with at least Rs 50 crore net worth, and handle deposit, storage, EGR creation, withdrawal and reconciliation with the depository. https://www.sebi.gov.in/sebi_data/attachdocs/sep-2022/1664430234910.pdf
- SEBI consultation (Aug 2026) proposes widening the Vault Managers Regulations to all SEBI bullion instruments (EGRs, bullion ETFs, bullion derivatives) and raising minimum net worth to Rs 75 crore. https://www.sebi.gov.in/sebi_data/attachdocs/aug-2026/1786454556940.pdf
- Gold Monetisation Scheme: the Medium and Long Term Government Deposit parts were discontinued from Mar 26, 2025; Short Term Bank Deposits (1 to 3 years) continue at each bank's discretion. Banks credit deposits in 995 fineness gold. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2115009 and https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12801
- Not fetched, so unverified: EGR vault managers reportedly accept deposits only through accredited refineries or nominated agencies (SEBI EGR master circular, Jun 2024, seen only in a search excerpt).

What this means for the design: a freely transferable public-chain token over bank gold looks like the "digital gold" SEBI warned about, unless it sits inside a regulated wrapper. The most viable paths look like (1) the EGR route, with a SEBI-registered vault manager as custodian and the token as a mirror of demat EGRs, or (2) a bank's GMS Short Term Bank Deposit with the bank as the regulated party and Varanasi as its technology provider, piloted inside a regulator sandbox. Both need lawyers and the partner's regulator, not just code.
