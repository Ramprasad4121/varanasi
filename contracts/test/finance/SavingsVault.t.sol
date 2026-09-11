// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {SavingsVault} from "../../src/finance/SavingsVault.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @title SavingsVaultTest — lifecycle, deposits, withdrawals, recurring keeper path
/// @author Ramprasad
contract SavingsVaultTest is Test {
    SavingsVault vault;
    MockERC20 token;

    address admin = address(0x0000ad11);
    address alice = address(0x0000a11c);
    address keeper = address(0x0000aee9);
    uint256 constant AMOUNT = 100e18;

    event VaultDeposited(address indexed who, uint256 amount);
    event VaultWithdrawn(address indexed who, uint256 amount);
    event RecurringExecuted(address indexed who, uint256 amount, uint256 nextDue);

    function setUp() public {
        token = new MockERC20("USDM", "USDM", 18);
        vm.prank(admin);
        vault = new SavingsVault(admin, address(token));
        token.mint(alice, AMOUNT * 10);
    }

    function test_OpenDepositWithdraw() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vm.expectEmit(true, true, true, true);
        emit VaultDeposited(alice, AMOUNT);
        vault.deposit(AMOUNT);
        vm.expectEmit(true, true, true, true);
        emit VaultWithdrawn(alice, AMOUNT / 2);
        vault.withdraw(AMOUNT / 2);
        vm.stopPrank();

        (bool active, uint256 bal,,,,,,) = _getVault(alice);
        assertTrue(active);
        assertEq(bal, AMOUNT / 2);
    }

    function test_CannotDepositBeforeOpen() public {
        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(SavingsVault.VaultInactive.selector, alice));
        vault.deposit(AMOUNT);
        vm.stopPrank();
    }

    function test_CloseRequiresEmpty() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vault.deposit(AMOUNT);
        vm.expectRevert();
        vault.closeVault();
        vm.stopPrank();
    }

    function test_CloseAfterWithdrawAll() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vault.deposit(AMOUNT);
        vault.withdraw(AMOUNT);
        vault.closeVault();
        // Re-opening after close is allowed (fresh start).
        vault.openVault();
        (bool reopened,, ,,,, ,) = _getVault(alice);
        assertTrue(reopened);
        vm.stopPrank();
    }

    function test_RecurringKeeperExecutesWhenDue() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT * 10);
        vault.setRecurring(AMOUNT, 30 days);
        vm.stopPrank();

        // Not due yet.
        vm.prank(keeper);
        vm.expectRevert();
        vault.executeRecurring(alice);

        // Keeper executes after interval.
        vm.warp(block.timestamp + 31 days);
        vm.prank(keeper);
        vault.executeRecurring(alice);

        (,,,, bool ren, uint256 last,,) = _getVault(alice);
        assertTrue(ren);
        assertEq(last, block.timestamp);
        assertEq(token.balanceOf(address(vault)), AMOUNT);
    }

    function test_RecurringSkipsIfNotEnabled() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vm.stopPrank();

        vm.warp(block.timestamp + 31 days);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SavingsVault.RecurringNotEnabled.selector, alice));
        vault.executeRecurring(alice);
    }

    function test_WithdrawMoreThanBalanceReverts() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vault.deposit(AMOUNT);
        vm.expectRevert();
        vault.withdraw(AMOUNT + 1);
        vm.stopPrank();
    }

    function test_RecurringInvalidConfig() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vm.expectRevert();
        vault.setRecurring(AMOUNT, 0);
        vm.stopPrank();
    }

    function test_PauseBlocksDepositsNotWithdrawals() public {
        vm.startPrank(alice);
        vault.openVault();
        token.approve(address(vault), AMOUNT);
        vault.deposit(AMOUNT);
        vm.stopPrank();

        vm.prank(admin);
        vault.pause();

        vm.startPrank(alice);
        token.approve(address(vault), AMOUNT);
        vm.expectRevert();
        vault.deposit(AMOUNT);
        vault.withdraw(AMOUNT); // allowed
        vm.stopPrank();
    }

    function _getVault(address who)
        internal
        view
        returns (
            bool active,
            uint256 bal,
            uint256 recAmt,
            uint256 recInt,
            bool ren,
            uint256 last,
            uint256 created,
            uint256 closed
        )
    {
        return vault.vaults(who);
    }
}