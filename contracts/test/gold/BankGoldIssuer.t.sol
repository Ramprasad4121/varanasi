// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GoldBase} from "./GoldBase.sol";
import {GoldToken} from "../../src/gold/GoldToken.sol";
import {GoldRegistry} from "../../src/gold/GoldRegistry.sol";
import {BankGoldIssuer} from "../../src/gold/BankGoldIssuer.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

/// Unit + fuzz tests for bank-attested gold: EIP-712 mint, single-use
/// certificates, fungible redemption, disputes, proof of reserve.
contract BankGoldIssuerTest is GoldBase {
    bytes32 constant CERT = keccak256("SBI-GD-2026-000123");

    function setUp() public {
        _deployGold();
    }

    // -------------------------------------------------------------- audit regressions (F1..F7)

    /// F1: registry transitions are issuer-only (old markMinted was open).
    function test_F1_registryTransitionsOnlyIssuer() public {
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(GoldRegistry.GoldRegistryOnlyIssuer.selector, rogue));
        registry.recordMint(CERT, BANK, rogue, 1, 995);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(GoldRegistry.GoldRegistryOnlyIssuer.selector, rogue));
        registry.recordRevoke(CERT, BANK);
    }

    /// F2: nobody but the issuer can flip a certificate or mint/burn vGOLD.
    function test_F2_noUnbackedStatusFlipOrMint() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.startPrank(rogue);
        vm.expectRevert(abi.encodeWithSelector(GoldRegistry.GoldRegistryOnlyIssuer.selector, rogue));
        registry.setStatus(CERT, GoldRegistry.Status.WRITTEN_OFF);
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldTokenOnlyIssuer.selector, rogue));
        token.mint(rogue, 1e18);
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldTokenOnlyIssuer.selector, rogue));
        token.burn(alice, 1e18);
        vm.stopPrank();
        vm.expectRevert(GoldToken.GoldTokenIssuerAlreadySet.selector);
        token.bindIssuer(rogue);
    }

    /// F3: a minted certificate cannot be revoked; dispute keeps supply accounted.
    function test_F3_mintedCertCannotBeRevokedOnlyDisputed() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(bankOps);
        vm.expectRevert(
            abi.encodeWithSelector(
                GoldRegistry.GoldRegistryBadTransition.selector,
                CERT,
                GoldRegistry.Status.MINTED,
                GoldRegistry.Status.REVOKED
            )
        );
        issuer.revokeAttestation(BANK, CERT);
        vm.prank(bankOps);
        issuer.disputeCertificate(CERT, "ASSAY");
        (uint256 supply, uint256 attested,, uint256 disputed, bool backed) = issuer.proofOfReserve();
        assertEq(supply, 10_000);
        assertEq(attested, 10_000);
        assertEq(disputed, 10_000);
        assertFalse(backed, "disputed grams must show as not backed");
        assertEq(token.balanceOf(alice), 10e18, "holder balance untouched");
    }

    /// F4: certificate ids are single use forever; re-assay needs a new id.
    function test_F4_certificateSingleUse() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 10_000, 2);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(
            abi.encodeWithSelector(
                GoldRegistry.GoldRegistryBadTransition.selector,
                CERT,
                GoldRegistry.Status.MINTED,
                GoldRegistry.Status.MINTED
            )
        );
        issuer.mint(a, sig);
        _mint(BANK, alice, keccak256("SBI-GD-2026-000124"), 10_000, 2);
        assertEq(token.balanceOf(alice), 20e18);
    }

    /// F5: 1 vGOLD = 1 g FINE gold with milligram precision (10 g of 995 = 9.950 g).
    function test_F5_fineGramsMilligramPrecision() public {
        _mint(BANK, alice, CERT, 9_950, 1);
        assertEq(token.balanceOf(alice), 9.95e18);
        assertEq(token.decimals(), 18);
        _mint(BANK, bob, keccak256("c2"), 1, 2); // one milligram
        assertEq(token.balanceOf(bob), 1e15);
    }

    /// F6: any holder can redeem fungible vGOLD, not only the depositor.
    function test_F6_anyHolderCanRedeem() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(alice);
        token.transfer(bob, 4e18);
        vm.prank(bob);
        uint256 id = issuer.requestRedemption(BANK, 4_000, "BRANCH-HYD-01");
        assertEq(token.balanceOf(bob), 0);
        vm.prank(bankOps);
        issuer.fulfilRedemption(id, "RELEASE-77");
        (uint256 supply, uint256 attested, uint256 pending,, bool backed) = issuer.proofOfReserve();
        assertEq(supply, 6_000);
        assertEq(attested, 6_000);
        assertEq(pending, 0);
        assertTrue(backed);
    }

    /// F7: supply needs a signature from the registered bank key.
    function test_F7_requiresBankSignature() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, rogue, CERT, 1e9, 1);
        bytes memory forged = _sign(0xBAD, a);
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, forged);
        // another bank's key cannot mint against BANK
        bytes memory wrongBank = _sign(bank2Key, a);
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, wrongBank);
        // tampered amount breaks the signature
        bytes memory good = _sign(bankKey, a);
        a.fineGramsMilli += 1;
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, good);
    }

    // -------------------------------------------------------------- EIP-712 hygiene

    function test_relayerCannotRedirect() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 5_000, 1);
        bytes memory sig = _sign(bankKey, a);
        a.user = rogue;
        vm.prank(rogue);
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, sig);
        a.user = alice;
        vm.prank(rogue); // anyone may relay the honest one
        issuer.mint(a, sig);
        assertEq(token.balanceOf(alice), 5e18);
        assertEq(token.balanceOf(rogue), 0);
    }

    function test_expiredAttestationRejected() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 5_000, 1);
        bytes memory sig = _sign(bankKey, a);
        vm.warp(a.expiry + 1);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldExpired.selector, a.expiry));
        issuer.mint(a, sig);
    }

    function test_nonceSingleUseAndInvalidation() public {
        _mint(BANK, alice, CERT, 1_000, 7);
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, keccak256("c2"), 1_000, 7);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNonceUsed.selector, BANK, 7));
        issuer.mint(a, sig);
        vm.prank(bankOps);
        issuer.invalidateNonce(BANK, 8);
        a.nonce = 8;
        sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNonceUsed.selector, BANK, 8));
        issuer.mint(a, sig);
    }

    function test_crossChainAndCrossContractReplayRejected() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 1_000, 1);
        bytes memory sig = _sign(bankKey, a);
        // same signature on a second deployment (different verifyingContract)
        GoldToken t2 = new GoldToken();
        GoldRegistry r2 = new GoldRegistry();
        BankGoldIssuer i2 = new BankGoldIssuer(gov, address(t2), address(r2));
        t2.bindIssuer(address(i2));
        r2.bindIssuer(address(i2));
        vm.prank(gov);
        i2.addBank(BANK, "Mock Bank 1", bankSigner, bankOps);
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        i2.mint(a, sig);
        // same contract, different chain id
        vm.chainId(137);
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, sig);
    }

    function test_revokeUnmintedAttestation() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 1_000, 1);
        bytes memory sig = _sign(bankKey, a);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNotBankOperator.selector, BANK, rogue));
        issuer.revokeAttestation(BANK, CERT);
        vm.prank(bankOps);
        issuer.revokeAttestation(BANK, CERT);
        assertEq(uint256(registry.statusOf(CERT)), uint256(GoldRegistry.Status.REVOKED));
        vm.expectRevert(
            abi.encodeWithSelector(
                GoldRegistry.GoldRegistryBadTransition.selector,
                CERT,
                GoldRegistry.Status.REVOKED,
                GoldRegistry.Status.MINTED
            )
        );
        issuer.mint(a, sig);
    }

    function test_signerRotationKillsOldAttestations() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 1_000, 1);
        bytes memory sig = _sign(bankKey, a);
        vm.prank(gov);
        issuer.setBankSigner(BANK, vm.addr(0x5E1));
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, sig);
    }

    function test_inputValidation() public {
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 0, 1);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(BankGoldIssuer.GoldZeroAmount.selector);
        issuer.mint(a, sig);
        a = _att(BANK, alice, CERT, 1_000, 1);
        a.purityPermille = 1001;
        sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldBadPurity.selector, 1001));
        issuer.mint(a, sig);
        a = _att(keccak256("NOPE"), alice, CERT, 1_000, 1);
        sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldUnknownBank.selector, keccak256("NOPE")));
        issuer.mint(a, sig);
        a = _att(BANK, address(0), CERT, 1_000, 1);
        sig = _sign(bankKey, a);
        vm.expectRevert(BankGoldIssuer.GoldZeroAddress.selector);
        issuer.mint(a, sig);
    }

    // -------------------------------------------------------------- pause

    function test_globalPauseStopsMintAndRequestsNotTransfersOrFulfil() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(alice);
        uint256 id = issuer.requestRedemption(BANK, 1_000, "B");
        vm.prank(rogue);
        vm.expectRevert();
        issuer.pause();
        vm.prank(gov);
        issuer.pause();
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, keccak256("c2"), 1_000, 2);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        issuer.mint(a, sig);
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        issuer.requestRedemption(BANK, 1_000, "B");
        vm.prank(alice);
        token.transfer(bob, 1e18); // transfers never frozen
        vm.prank(bankOps);
        issuer.fulfilRedemption(id, "R"); // in-flight redemptions still settle
        vm.prank(gov);
        issuer.unpause();
        issuer.mint(a, sig);
    }

    function test_bankPauseIsPerBankAndOnlyGovUnpauses() public {
        vm.prank(bankOps);
        issuer.pauseBank(BANK);
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 1_000, 1);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldBankPaused.selector, BANK));
        issuer.mint(a, sig);
        _mint(BANK2, alice, keccak256("b2"), 1_000, 1); // other bank unaffected
        vm.prank(bankOps);
        vm.expectRevert();
        issuer.unpauseBank(BANK);
        vm.prank(gov);
        issuer.unpauseBank(BANK);
        issuer.mint(a, sig);
    }

    // -------------------------------------------------------------- redemption

    function test_redemptionCancelReMints() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(alice);
        uint256 id = issuer.requestRedemption(BANK, 2_500, "B");
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNotBankOperator.selector, BANK, rogue));
        issuer.cancelRedemption(id, "KYC");
        vm.prank(bankOps);
        issuer.cancelRedemption(id, "KYC");
        assertEq(token.balanceOf(alice), 10e18);
        vm.prank(bankOps);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldRedemptionNotPending.selector, id));
        issuer.fulfilRedemption(id, "R");
    }

    function test_redemptionReclaimAfterTimeout() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(alice);
        uint256 id = issuer.requestRedemption(BANK, 2_500, "B");
        vm.prank(alice);
        vm.expectRevert();
        issuer.reclaimRedemption(id);
        vm.warp(block.timestamp + 30 days);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNotRedeemer.selector, id, bob));
        issuer.reclaimRedemption(id);
        vm.prank(alice);
        issuer.reclaimRedemption(id);
        assertEq(token.balanceOf(alice), 10e18);
    }

    function test_redemptionBoundedByBankLiability() public {
        _mint(BANK, alice, CERT, 1_000, 1);
        _mint(BANK2, alice, keccak256("b2"), 5_000, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldExceedsLiability.selector, BANK, 2_000, 1_000));
        issuer.requestRedemption(BANK, 2_000, "B");
        vm.prank(bob);
        vm.expectRevert(); // no balance
        issuer.requestRedemption(BANK, 500, "B");
    }

    // -------------------------------------------------------------- disputes

    function test_disputeThenClear() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNotBankOperator.selector, BANK, rogue));
        issuer.disputeCertificate(CERT, "X");
        vm.prank(gov);
        issuer.disputeCertificate(CERT, "COURT");
        assertTrue(issuer.bankOf(BANK).paused);
        // redemptions that would release disputed grams are blocked
        vm.prank(alice);
        uint256 id = issuer.requestRedemption(BANK, 1_000, "B");
        vm.prank(bankOps);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldDisputeCoverage.selector, BANK));
        issuer.fulfilRedemption(id, "R");
        vm.prank(gov);
        issuer.clearDispute(CERT);
        vm.prank(bankOps);
        issuer.fulfilRedemption(id, "R");
        (,,, uint256 disputed, bool backed) = issuer.proofOfReserve();
        assertEq(disputed, 0);
        assertTrue(backed);
    }

    function test_disputeWriteOffBurnsOnlyBankTokens() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        _mint(BANK, bankOps, keccak256("bank-own"), 10_000, 2); // bank bought back / holds vGOLD
        vm.prank(bankOps);
        issuer.disputeCertificate(CERT, "FAKE-ASSAY");
        vm.prank(gov);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldNotBankOperator.selector, BANK, gov));
        issuer.writeOffCertificate(CERT);
        vm.prank(bankOps);
        issuer.writeOffCertificate(CERT);
        assertEq(token.balanceOf(alice), 10e18, "user balance never burned");
        assertEq(token.balanceOf(bankOps), 0);
        (uint256 supply, uint256 attested,, uint256 disputed, bool backed) = issuer.proofOfReserve();
        assertEq(supply, 10_000);
        assertEq(attested, 10_000);
        assertEq(disputed, 0);
        assertTrue(backed);
    }

    function test_writeOffWithoutTokensReverts() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(bankOps);
        issuer.disputeCertificate(CERT, "X");
        vm.prank(bankOps);
        vm.expectRevert(); // bank holds no vGOLD: dispute stays open, PoR shows shortfall
        issuer.writeOffCertificate(CERT);
    }

    function test_cannotDisputeAlreadyReleasedGrams() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        vm.prank(alice);
        uint256 id = issuer.requestRedemption(BANK, 10_000, "B");
        vm.prank(bankOps);
        issuer.fulfilRedemption(id, "R");
        vm.prank(gov);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldDisputeCoverage.selector, BANK));
        issuer.disputeCertificate(CERT, "LATE");
    }

    // -------------------------------------------------------------- reserve reports

    function test_reserveReportShortfallHaltsMint() public {
        _mint(BANK, alice, CERT, 10_000, 1);
        BankGoldIssuer.ReserveReport memory rep =
            BankGoldIssuer.ReserveReport({bankId: BANK, reservesMilli: 9_000, asOf: block.timestamp, seq: 1});
        issuer.submitReserveReport(rep, _signReport(bankKey, rep));
        assertTrue(issuer.bankOf(BANK).reportShortfall);
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, keccak256("c2"), 1_000, 2);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldReserveShortfall.selector, BANK));
        issuer.mint(a, sig);
        // replayed / stale report rejected
        bytes memory repSig = _signReport(bankKey, rep);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldStaleReport.selector, 1, 1));
        issuer.submitReserveReport(rep, repSig);
        // forged report rejected
        rep.seq = 2;
        rep.reservesMilli = 10_000;
        bytes memory forged = _signReport(0xBAD, rep);
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.submitReserveReport(rep, forged);
        issuer.submitReserveReport(rep, _signReport(bankKey, rep));
        assertFalse(issuer.bankOf(BANK).reportShortfall);
        issuer.mint(a, sig);
    }

    // -------------------------------------------------------------- fuzz

    function testFuzz_mintRedeemConservesGrams(uint64 fineRaw, uint64 redeemRaw, uint64 sendRaw) public {
        uint256 fine = bound(uint256(fineRaw), 1, 1e9);
        uint256 send = bound(uint256(sendRaw), 0, fine);
        uint256 redeem = bound(uint256(redeemRaw), 1, fine);
        _mint(BANK, alice, CERT, fine, 1);
        assertEq(token.balanceOf(alice), fine * MG);
        vm.prank(alice);
        token.transfer(bob, send * MG);
        address who = redeem <= send ? bob : alice;
        if (who == alice && redeem > fine - send) redeem = fine - send;
        if (redeem == 0) return;
        vm.prank(who);
        uint256 id = issuer.requestRedemption(BANK, redeem, "B");
        vm.prank(bankOps);
        issuer.fulfilRedemption(id, "R");
        (uint256 supply, uint256 attested, uint256 pending,, bool backed) = issuer.proofOfReserve();
        assertEq(supply, fine - redeem);
        assertEq(attested, fine - redeem);
        assertEq(pending, 0);
        assertTrue(backed);
    }

    function testFuzz_anyFieldTamperBreaksSignature(uint8 field, uint256 delta) public {
        delta = bound(delta, 1, type(uint64).max);
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, CERT, 1_000, 1);
        bytes memory sig = _sign(bankKey, a);
        field = uint8(bound(field, 0, 3));
        if (field == 0) a.certificateId = bytes32(uint256(a.certificateId) ^ delta);
        if (field == 1) a.fineGramsMilli = 1_001 + (delta % 1e6);
        if (field == 2) a.nonce = 1 + delta;
        if (field == 3) a.expiry = a.expiry + delta;
        vm.expectRevert(BankGoldIssuer.GoldBadSignature.selector);
        issuer.mint(a, sig);
    }
}
