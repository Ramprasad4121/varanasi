// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {CollateralVault} from "../../src/collateral/CollateralVault.sol";
import {LoanAgreement} from "../../src/finance/LoanAgreement.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @title LoanAgreementTest — create, fund, draw, repay (close), default, collateral release
/// @author Ramprasad
contract LoanAgreementTest is Test {
    CollateralVault vault;
    LoanAgreement loans;
    MockERC20 token;

    address lender = address(0x0000ced1);
    address borrower = address(0x0000b07e);
    address admin = address(0x0000ad11);

    uint256 constant PRINCIPAL = 5_000e18;
    uint256 constant TERM = 30 days;
    bytes32 posId = keccak256("loan-collateral");

    function setUp() public {
        token = new MockERC20("USDM", "USDM", 18);
        vault = new CollateralVault(address(this)); // keeps test deployer as owner
        loans = new LoanAgreement(address(vault));
        vault.admitAsset(address(token));
        vault.authorizeResolver(address(loans));

        token.mint(lender, PRINCIPAL * 10);
        token.mint(borrower, PRINCIPAL * 10);
        token.mint(address(this), PRINCIPAL * 10);
        token.approve(address(vault), type(uint256).max);
        token.approve(address(loans), type(uint256).max);
    }

    /// @dev Borrower locks collateral owned by the loan contract (the loan contract
    ///      becomes the vault position owner so it can release on repay/default).
    function _borrowerLocksCollateral() internal {
        vm.startPrank(borrower);
        token.approve(address(vault), type(uint256).max);
        vault.lock(posId, address(token), address(loans), PRINCIPAL);
        vm.stopPrank();
        assertEq(vault.value(posId), PRINCIPAL);
    }

    function _createAndActivate() internal returns (uint256 loanId) {
        _borrowerLocksCollateral();
        loanId = loans.createLoan(lender, borrower, address(token), PRINCIPAL, 500, TERM, address(token), posId);
        vm.prank(lender);
        token.approve(address(loans), PRINCIPAL);
        vm.prank(lender);
        loans.fundLoan(loanId);
        vm.prank(borrower);
        loans.drawLoan(loanId);
        return loanId;
    }

    function test_CannotCreateWithoutCollateral() public {
        vm.expectRevert();
        loans.createLoan(lender, borrower, address(token), PRINCIPAL, 500, TERM, address(token), posId);
    }

    function test_FullLifecycleClose() public {
        uint256 loanId = _createAndActivate();
        assertEq(token.balanceOf(borrower), PRINCIPAL * 10); // 10 minted - 1 collateral + 1 draw
        assertEq(token.balanceOf(lender), PRINCIPAL * 10 - PRINCIPAL);

        // Repay right after draw: interest ~0, so pay back principal.
        vm.startPrank(borrower);
        token.approve(address(loans), type(uint256).max);
        loans.repay(loanId, PRINCIPAL);
        vm.stopPrank();

        // Closed + collateral returned to borrower.
        assertEq(uint256(loans.stateOf(loanId)), 3); // Repaid
        assertEq(vault.value(posId), 0);
        assertEq(token.balanceOf(borrower), PRINCIPAL * 10);

        // Lender withdraws repaid principal.
        vm.prank(lender);
        loans.withdrawRepaid(loanId);
        assertEq(token.balanceOf(lender), PRINCIPAL * 10);
    }

    function test_PartialRepaymentsThenClose() public {
        uint256 loanId = _createAndActivate();
        vm.startPrank(borrower);
        token.approve(address(loans), type(uint256).max);
        loans.repay(loanId, PRINCIPAL / 2);
        loans.repay(loanId, PRINCIPAL / 2);
        vm.stopPrank();
        assertEq(uint256(loans.stateOf(loanId)), 3);
        assertEq(vault.value(posId), 0);
    }

    function test_OverpayReverts() public {
        uint256 loanId = _createAndActivate();
        vm.startPrank(borrower);
        token.approve(address(loans), type(uint256).max);
        vm.expectRevert();
        loans.repay(loanId, PRINCIPAL + 1);
        vm.stopPrank();
    }

    function test_InterestAccruesWithTime() public {
        // 5% simple interest over the term (interestBps = 500).
        uint256 loanId = _createAndActivate();
        vm.warp(block.timestamp + TERM / 2);
        assertEq(loans.totalOwed(loanId), PRINCIPAL * 1025 / 1000);
        vm.warp(block.timestamp + TERM / 2);
        assertEq(loans.totalOwed(loanId), PRINCIPAL * 105 / 100);
    }

    function test_DefaultAfterTermReleasesCollateralToLender() public {
        uint256 loanId = _createAndActivate();
        vm.warp(block.timestamp + TERM + 1);
        vm.prank(lender);
        loans.declareDefault(loanId);

        assertEq(uint256(loans.stateOf(loanId)), 4); // Defaulted
        assertEq(vault.value(posId), 0);
        // Lender: -principal (funded) + collateral back = net zero principal.
        assertEq(token.balanceOf(lender), PRINCIPAL * 10);
        // Borrower keeps the drawn principal (defaulted).
        assertEq(token.balanceOf(borrower), PRINCIPAL * 10);
    }

    function test_CannotDefaultBeforeTerm() public {
        uint256 loanId = _createAndActivate();
        vm.prank(lender);
        vm.expectRevert();
        loans.declareDefault(loanId);
    }

    function test_OnlyBorrowerCanDraw() public {
        _borrowerLocksCollateral();
        uint256 loanId = loans.createLoan(lender, borrower, address(token), PRINCIPAL, 500, TERM, address(token), posId);
        vm.prank(lender);
        token.approve(address(loans), PRINCIPAL);
        vm.prank(lender);
        loans.fundLoan(loanId);
        vm.prank(lender);
        vm.expectRevert();
        loans.drawLoan(loanId);
    }

    function test_OnlyLenderCanWithdrawRepaid() public {
        uint256 loanId = _createAndActivate();
        vm.startPrank(borrower);
        token.approve(address(loans), type(uint256).max);
        loans.repay(loanId, PRINCIPAL);
        vm.stopPrank();

        vm.prank(borrower);
        vm.expectRevert();
        loans.withdrawRepaid(loanId);
    }

    function test_RepayLocksAfterClose() public {
        uint256 loanId = _createAndActivate();
        vm.startPrank(borrower);
        token.approve(address(loans), type(uint256).max);
        loans.repay(loanId, PRINCIPAL);
        vm.expectRevert();
        loans.repay(loanId, 1);
        vm.stopPrank();
    }
}