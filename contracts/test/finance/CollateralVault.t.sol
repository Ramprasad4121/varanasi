// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {CollateralVault} from "../../src/collateral/CollateralVault.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @title CollateralVaultTest — lock/unlock/release + allowlist + access rules
/// @author Ramprasad
contract CollateralVaultTest is Test {
    CollateralVault vault;
    MockERC20 token;
    MockERC20 other;

    address admin = address(0x0000ad11);
    address alice = address(0x0000a11c);
    address bob = address(0x0000b0bb);
    address resolver = address(0x00010f00);

    bytes32 posA = keccak256("pos-a");
    bytes32 posB = keccak256("pos-b");

    uint256 constant AMOUNT = 1_000e18;

    event CollateralLocked(bytes32 indexed positionId, address indexed token, address indexed owner, uint256 amount);
    event CollateralUnlocked(bytes32 indexed positionId, address indexed to, uint256 amount);

    function setUp() public {
        vm.prank(admin);
        vault = new CollateralVault(admin);
        token = new MockERC20("USDM", "USDM", 18);
        other = new MockERC20("DAI", "DAI", 18);

        vm.prank(admin);
        vault.admitAsset(address(token));
        vm.prank(admin);
        vault.admitAsset(address(other));

        token.mint(alice, AMOUNT * 10);
        token.mint(bob, AMOUNT * 10);
    }

    function test_LockTransfersAndRecords() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vm.expectEmit(true, true, true, true);
        emit CollateralLocked(posA, address(token), alice, AMOUNT);
        vault.lock(posA, address(token), alice, AMOUNT);
        vm.stopPrank();

        (address t, address owner, uint256 amt) = vault.positionOf(posA);
        assertEq(t, address(token));
        assertEq(owner, alice);
        assertEq(amt, AMOUNT);
        assertEq(token.balanceOf(address(vault)), AMOUNT);
        assertEq(vault.value(posA), AMOUNT);
    }

    function test_RevertWhenCollateralNotAllowed() public {
        vm.startPrank(alice);
        other.mint(address(this), AMOUNT);
        // Mint to alice and try to lock the non-admitted token via alice's balance.
        vm.stopPrank();
        token.mint(bob, AMOUNT);
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        // admittance is per-token: `other` not admitted yet — simulate by using other
        // as the collateral asset but never admitting it.
        MockERC20 rogue = new MockERC20("ROGUE", "ROGUE", 18);
        rogue.mint(alice, AMOUNT);
        rogue.approve(address(vault), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.CollateralNotAllowedAsset.selector, address(rogue)));
        vault.lock(posA, address(rogue), alice, AMOUNT);
        vm.stopPrank();
    }

    function test_RevertWhenLockingTwice() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT * 2);
        vault.lock(posA, address(token), alice, AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.CollateralPositionLocked.selector, posA));
        vault.lock(posA, address(token), bob, AMOUNT);
        vm.stopPrank();
    }

    function test_UnlockByOwnerTransfersBack() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vault.lock(posA, address(token), alice, AMOUNT);
        vm.expectEmit(true, true, true, true);
        emit CollateralUnlocked(posA, alice, AMOUNT);
        vault.unlock(posA);
        vm.stopPrank();

        assertEq(token.balanceOf(alice), AMOUNT * 10); // minted 10, spent 1, got 1 back
        assertEq(vault.value(posA), 0);
    }

    function test_RevertUnlockByNonOwner() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vault.lock(posA, address(token), alice, AMOUNT);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.CollateralNotOwner.selector, bob, alice));
        vault.unlock(posA);
    }

    function test_UnlockEmptyReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.CollateralEmpty.selector, posA));
        vault.unlock(posA);
    }

    function test_OnlyAuthorizedResolverCanRelease() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vault.lock(posA, address(token), alice, AMOUNT);
        vm.stopPrank();

        // Unauthorized resolver: blocked.
        vm.prank(resolver);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.CollateralNotAuthorizedResolver.selector, resolver));
        vault.release(posA, bob);

        // Authorize resolver, but the position owner is alice, so still blocked.
        vm.prank(admin);
        vault.authorizeResolver(resolver);
        vm.prank(resolver);
        vm.expectRevert(abi.encodeWithSelector(CollateralVault.CollateralNotOwner.selector, resolver, alice));
        vault.release(posA, bob);
    }

    function test_AuthorizedResolverReleasesOwnedPosition() public {
        // Alice locks to herself but resolver must own it: instead lock with
        // resolver as the OWNER and authorize the resolver to release.
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vault.lock(posB, address(token), resolver, AMOUNT);
        vm.stopPrank();

        vm.prank(admin);
        vault.authorizeResolver(resolver);

        vm.prank(resolver);
        vault.release(posB, bob);

        assertEq(token.balanceOf(bob), AMOUNT * 11);
        assertEq(vault.value(posB), 0);
    }

    function test_OnlyOwnerCanAdmitAndAuthorize() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.admitAsset(address(other));

        vm.prank(alice);
        vm.expectRevert();
        vault.authorizeResolver(resolver);
    }

    function test_RekeyPositionAfterUnlock() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT * 2);
        vault.lock(posA, address(token), alice, AMOUNT);
        vault.unlock(posA);
        // Now alice can lock the same positionId again (double-spend prevention resets).
        vault.lock(posA, address(token), alice, AMOUNT);
        vm.stopPrank();
        assertEq(vault.value(posA), AMOUNT);
    }
}