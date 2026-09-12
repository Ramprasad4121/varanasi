// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {GoldRegistry} from "../../src/gold/GoldRegistry.sol";
import {GoldAttestor} from "../../src/gold/GoldAttestor.sol";
import {GoldToken} from "../../src/gold/GoldToken.sol";

/// @title GoldTest — verify → mint → redeem lifecycle + access rules
/// @author Ramprasad
contract GoldTest is Test {
    GoldRegistry registry;
    GoldAttestor attestor;
    GoldToken token;

    address admin = address(0x0000ad11);
    address verifier = address(0x0000beee);
    address rogue = address(0x000050a1);
    address owner = address(0x0000ee00);
    bytes32 assetA = keccak256("asset-a");
    bytes32 custodian = keccak256("vault-keeper");

    event GoldVerified(
        bytes32 indexed assetId,
        uint256 weightGrams,
        uint256 purityBps,
        string custodian,
        address indexed owner,
        address indexed attestor,
        uint256 version
    );

    function setUp() public {
        vm.prank(admin);
        registry = new GoldRegistry(admin);
        vm.prank(admin);
        attestor = new GoldAttestor(admin, address(registry));
        token = new GoldToken(address(registry));

        vm.startPrank(admin);
        registry.addAttestor(address(attestor)); // the attestor CONTRACT is the registry attestor
        attestor.allowAttestor(verifier); // only `verifier` EOA may invoke attest()
        attestor.addCustodian(custodian, "Varanasi Keeper Vault");
        vm.stopPrank();
    }

    function test_VerifyOnlyByAttestor() public {
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(GoldRegistry.GoldNotAuthorizedAttestor.selector, rogue));
        registry.verifyAsset(assetA, 10, 9990, "Keeper", owner);
    }

    function test_AttestorVerifiesAndLogs() public {
        vm.prank(verifier);
        vm.expectEmit(true, true, true, false);
        emit GoldVerified(assetA, 10, 9990, "Varanasi Keeper Vault", owner, address(attestor), 0);
        attestor.attest(assetA, 10, 9990, "Varanasi Keeper Vault", owner, custodian);

        GoldRegistry.GoldPosition memory p = registry.positionOf(assetA);
        assertEq(uint256(p.status), uint256(GoldRegistry.Status.VERIFIED));
        assertEq(p.weightGrams, 10);
        assertEq(p.purityBps, 9990);
        assertEq(p.owner, owner);
        assertEq(p.attestor, address(attestor));
    }

    function test_RevertAttestWithUnknownCustodian() public {
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(GoldAttestor.CustodianUnknown.selector, keccak256("unknown")));
        attestor.attest(assetA, 10, 9990, "Keeper", owner, keccak256("unknown"));
    }

    function test_RevertReplayAttestation() public {
        vm.prank(verifier);
        attestor.attest(assetA, 10, 9990, "Varanasi Keeper Vault", owner, custodian);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(GoldRegistry.GoldPositionExists.selector, assetA));
        attestor.attest(assetA, 20, 9990, "Varanasi Keeper Vault", owner, custodian);
    }

    function test_MintRequiresVerifiedAndOwner() public {
        // Not verified -> revert.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldPositionNotVerified.selector, assetA));
        token.mint(assetA);

        vm.prank(verifier);
        attestor.attest(assetA, 10, 9990, "Varanasi Keeper Vault", owner, custodian);

        // Non-owner cannot claim.
        vm.prank(address(0x0000bee0));
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldOnlyPositionOwner.selector, assetA, address(0x0000bee0), owner));
        token.mint(assetA);

        // Owner mints 10 grams (GRAMS_SCALE per gram).
        vm.prank(owner);
        token.mint(assetA);
        assertEq(token.balanceOf(owner), 10 * token.GRAMS_SCALE());
        GoldRegistry.GoldPosition memory p = registry.positionOf(assetA);
        assertEq(uint256(p.status), uint256(GoldRegistry.Status.MINTED));

        // Replay: cannot mint twice.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldPositionNotVerified.selector, assetA));
        token.mint(assetA);
    }

    function test_RedeemBurnsAndMarksRedeemed() public {
        vm.prank(verifier);
        attestor.attest(assetA, 10, 9990, "Varanasi Keeper Vault", owner, custodian);
        vm.prank(owner);
        token.mint(assetA);

        vm.prank(owner);
        token.redeem(assetA);
        assertEq(token.balanceOf(owner), 0);
        GoldRegistry.GoldPosition memory p = registry.positionOf(assetA);
        assertEq(uint256(p.status), uint256(GoldRegistry.Status.REDEEMED));

        // Cannot redeem again.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldPositionNotMinted.selector, assetA));
        token.redeem(assetA);
    }

    function test_RevertRedeemByNonOwner() public {
        vm.prank(verifier);
        attestor.attest(assetA, 10, 9990, "Varanasi Keeper Vault", owner, custodian);
        vm.prank(owner);
        token.mint(assetA);

        vm.prank(address(0x0000dea1));
        vm.expectRevert(abi.encodeWithSelector(GoldToken.GoldOnlyPositionOwner.selector, assetA, address(0x0000dea1), owner));
        token.redeem(assetA);
    }

    function test_RevokedPositionCanReVerifyWithVersionBump() public {
        vm.prank(verifier);
        attestor.attest(assetA, 10, 9990, "Varanasi Keeper Vault", owner, custodian);
        vm.prank(verifier);
        attestor.revoke(assetA);
        assertEq(uint256(registry.positionOf(assetA).status), uint256(GoldRegistry.Status.REVOKED));

        vm.prank(verifier);
        vm.expectEmit(true, true, true, false);
        emit GoldVerified(assetA, 12, 9990, "Varanasi Keeper Vault", owner, address(attestor), 1);
        attestor.attest(assetA, 12, 9990, "Varanasi Keeper Vault", owner, custodian);
        assertEq(registry.positionOf(assetA).version, 1);
    }

    function test_OnlyOwnerGovernsAttestorAndCustodian() public {
        vm.prank(rogue);
        vm.expectRevert();
        registry.addAttestor(rogue);

        vm.prank(rogue);
        vm.expectRevert();
        attestor.addCustodian(keccak256("x"), "X");
    }
}