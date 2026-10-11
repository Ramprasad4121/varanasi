// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./AssetsBase.sol";

/// Silver and platinum on BankMetalIssuer, listed next to the untouched gold issuer.
contract MetalIssuerTest is AssetsBase {
    function setUp() public {
        _deployMetals();
    }

    function test_registry_listsThreeMetals_andReadsEachReserve() public {
        assertEq(assets.metalCount(), 3);
        _mintMetal(silverIssuer, alice, 100_000); // 100 g silver
        AssetRegistry.MetalReserveView[] memory all = assets.allReserves();
        assertEq(all.length, 3);
        assertEq(all[1].name, "Silver");
        assertEq(all[1].supplyMilli, 100_000);
        assertEq(all[1].attestedMilli, 100_000);
        assertTrue(all[1].fullyBacked);
        assertEq(all[0].supplyMilli, 0); // gold untouched
        assertEq(all[2].supplyMilli, 0);
    }

    function test_registry_rejectsUnboundPair() public {
        vm.prank(gov);
        vm.expectRevert(
            abi.encodeWithSelector(AssetRegistry.AssetNotBound.selector, address(silver), address(platinumIssuer))
        );
        assets.listMetal("BAD", "Bad", address(silver), address(platinumIssuer));
    }

    function test_registry_onlyOwner_andNoDuplicates() public {
        vm.prank(rogue);
        vm.expectRevert();
        assets.listMetal("ZZZ", "x", address(silver), address(silverIssuer));
        vm.prank(gov);
        vm.expectRevert(abi.encodeWithSelector(AssetRegistry.AssetExists.selector, XAG));
        assets.listMetal(XAG, "Silver", address(silver), address(silverIssuer));
        vm.prank(gov);
        assets.setActive(XPT, false);
        assertFalse(assets.metalOf(XPT).active);
    }

    function test_silver_mintOneGramPerGram() public {
        _mintMetal(silverIssuer, alice, 250_500); // 250.5 g
        assertEq(silver.balanceOf(alice), 250_500 * MG);
        assertEq(silver.milligramsOf(alice), 250_500);
        assertEq(silver.symbol(), "vSILVER");
        assertEq(silverIssuer.metalCode(), XAG);
    }

    function test_silverAttestation_cannotMintPlatinum_crossDomain() public {
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, alice, "c1", 1000, 999);
        bytes memory sig = _signMetal(silverIssuer, bankKey, a);
        vm.expectRevert(BankMetalIssuer.MetalBadSignature.selector);
        platinumIssuer.mint(a, sig);
    }

    function test_silver_purityFloorEnforced() public {
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, alice, "c1", 1000, 925); // sterling, below 999 floor
        bytes memory sig = _signMetal(silverIssuer, bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankMetalIssuer.MetalBadPurity.selector, 925));
        silverIssuer.mint(a, sig);
    }

    function test_constructor_rejectsBadPurityFloor() public {
        MetalToken t = new MetalToken("x", "x", address(0));
        MetalCertificateRegistry r = new MetalCertificateRegistry();
        vm.expectRevert(abi.encodeWithSelector(BankMetalIssuer.MetalBadPurity.selector, 0));
        new BankMetalIssuer(gov, address(t), address(r), address(0), "X", "x", 0);
    }

    function test_certificateSingleUse() public {
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, alice, "c1", 1000, 999);
        silverIssuer.mint(a, _signMetal(silverIssuer, bankKey, a));
        BankMetalIssuer.BankAttestation memory b = _metalAtt(BANK, alice, "c1", 1000, 999); // same cert, new nonce
        bytes memory sig = _signMetal(silverIssuer, bankKey, b);
        vm.expectRevert();
        silverIssuer.mint(b, sig);
    }

    function test_perMetalPause_onlyStopsThatMetal() public {
        vm.prank(gov);
        silverIssuer.pause();
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, alice, "c1", 1000, 999);
        bytes memory sig = _signMetal(silverIssuer, bankKey, a);
        vm.expectRevert();
        silverIssuer.mint(a, sig);
        _mintMetal(platinumIssuer, alice, 1000); // platinum still works
        assertEq(platinum.milligramsOf(alice), 1000);
        assertTrue(assets.reserveOf(XAG).paused);
        assertFalse(assets.reserveOf(XPT).paused);
    }

    function test_redeemAndFulfil_reduceReserve() public {
        _mintMetal(silverIssuer, alice, 5000);
        vm.prank(alice);
        uint256 id = silverIssuer.requestRedemption(BANK, 2000, "branch-1");
        (uint256 supply,, uint256 pending,, bool ok) = silverIssuer.proofOfReserve();
        assertEq(supply, 3000);
        assertEq(pending, 2000);
        assertTrue(ok);
        vm.prank(bankOps);
        silverIssuer.fulfilRedemption(id, "released");
        (, uint256 attested,,,) = silverIssuer.proofOfReserve();
        assertEq(attested, 3000);
    }

    function test_shortReserveReport_haltsThatMetalOnly() public {
        _mintMetal(silverIssuer, alice, 5000);
        BankMetalIssuer.ReserveReport memory rep =
            BankMetalIssuer.ReserveReport({bankId: BANK, reservesMilli: 4000, asOf: block.timestamp, seq: 1});
        bytes32 sh =
            keccak256(abi.encode(silverIssuer.RESERVE_TYPEHASH(), rep.bankId, rep.reservesMilli, rep.asOf, rep.seq));
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(bankKey, keccak256(abi.encodePacked("\x19\x01", silverIssuer.domainSeparator(), sh)));
        silverIssuer.submitReserveReport(rep, abi.encodePacked(r, s, v));
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, alice, "c9", 1000, 999);
        bytes memory sig = _signMetal(silverIssuer, bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankMetalIssuer.MetalReserveShortfall.selector, BANK));
        silverIssuer.mint(a, sig);
        _mintMetal(platinumIssuer, alice, 1000);
    }

    function testFuzz_mintThenRedeem_supplyNeverAboveReserve(uint64 fine, uint64 redeem) public {
        fine = uint64(bound(fine, 1, 1e9));
        redeem = uint64(bound(redeem, 1, fine));
        _mintMetal(silverIssuer, alice, fine);
        vm.prank(alice);
        silverIssuer.requestRedemption(BANK, redeem, "b");
        (uint256 supply, uint256 attested, uint256 pending, uint256 disputed, bool ok) = silverIssuer.proofOfReserve();
        assertTrue(ok);
        assertLe(supply + pending + disputed, attested);
        assertEq(silver.totalSupply(), uint256(fine - redeem) * MG);
    }

    function testFuzz_wrongSignerNeverMints(uint256 key) public {
        key = bound(key, 1, 1e30);
        vm.assume(key != bankKey);
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, alice, "c1", 1000, 999);
        bytes memory sig = _signMetal(silverIssuer, key, a);
        vm.expectRevert(BankMetalIssuer.MetalBadSignature.selector);
        silverIssuer.mint(a, sig);
    }
}
