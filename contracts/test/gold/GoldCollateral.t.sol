// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GoldBase} from "./GoldBase.sol";
import {CollateralVault} from "../../src/collateral/CollateralVault.sol";
import {LoanAgreement} from "../../src/finance/LoanAgreement.sol";
import {MockERC20} from "../../src/MockERC20.sol";
import {MockGoldPriceFeed} from "../../src/gold/MockGoldPriceFeed.sol";

/// Integration: vGOLD as collateral in the existing CollateralVault + LoanAgreement.
contract GoldCollateralTest is GoldBase {
    CollateralVault vault;
    LoanAgreement loans;
    MockERC20 inr;
    MockGoldPriceFeed feed;
    address lender = makeAddr("lender");
    bytes32 constant POS = keccak256("alice-gold-loan");
    uint256 constant LTV_BPS = 7_000; // 70% of gold value
    uint256 constant TERM = 90 days;

    function setUp() public {
        _deployGold();
        vault = new CollateralVault(address(this));
        loans = new LoanAgreement(address(vault));
        vault.admitAsset(address(token));
        vault.authorizeResolver(address(loans));
        inr = new MockERC20("Mock INR", "mINR", 18);
        feed = new MockGoldPriceFeed(address(this), 1_200_000); // Rs 12,000/g in paise; illustrative, not a quote
        inr.mint(lender, 10_000_000e18);
        _mint(BANK, alice, keccak256("SBI-GD-1"), 100_000, 1); // 100 g fine
    }

    function _openLoan() internal returns (uint256 loanId, uint256 principal) {
        (uint256 paisePerGram,) = feed.pricePaisePerGram();
        // 100 g * price, paise -> mINR (18 decimals), at 70% LTV = 840,000 mINR
        principal = (100 * paisePerGram * 1e16 * LTV_BPS) / 10_000;
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), address(loans), 100e18);
        loanId = loans.createLoan(lender, alice, address(inr), principal, 900, TERM, address(token), POS);
        vm.stopPrank();
        vm.startPrank(lender);
        inr.approve(address(loans), principal);
        loans.fundLoan(loanId);
        vm.stopPrank();
        vm.prank(alice);
        loans.drawLoan(loanId);
    }

    /// Borrow INR against 100 g of bank gold, default, lender takes the vGOLD and
    /// (as any holder can) asks the bank to release physical gold.
    function test_borrowAgainstGold_defaultThenLenderRedeems() public {
        (uint256 loanId, uint256 principal) = _openLoan();
        assertEq(inr.balanceOf(alice), principal);
        assertEq(token.balanceOf(address(vault)), 100e18);
        (uint256 supply, uint256 attested,,, bool backed) = issuer.proofOfReserve();
        assertEq(supply, attested);
        assertTrue(backed, "locking in a vault never changes reserves");

        vm.warp(block.timestamp + TERM + 1);
        loans.declareDefault(loanId);
        assertEq(token.balanceOf(lender), 100e18);

        vm.prank(lender);
        uint256 rid = issuer.requestRedemption(BANK, 100_000, "LENDER-BRANCH");
        vm.prank(bankOps);
        issuer.fulfilRedemption(rid, "BAR-RELEASED");
        (supply, attested,,,) = issuer.proofOfReserve();
        assertEq(supply, 0);
        assertEq(attested, 0);
    }

    function test_borrowAgainstGold_repayReturnsGold() public {
        (uint256 loanId,) = _openLoan();
        uint256 owed = loans.totalOwed(loanId);
        inr.mint(alice, owed);
        vm.startPrank(alice);
        inr.approve(address(loans), owed);
        loans.repay(loanId, owed);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 100e18);
    }

    /// L1 (fixed): a stranger cannot open a loan against gold someone else locked.
    function test_L1_strangerCannotOpenLoanOnLockedGold() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), address(loans), 100e18); // step 1 of her loan
        vm.stopPrank();

        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotCollateralOwner.selector, POS, rogue));
        loans.createLoan(rogue, rogue, address(inr), 1, 0, 1, address(token), POS);
        assertEq(token.balanceOf(address(vault)), 100e18, "Alice's gold stays locked");
    }

    /// L1 (fixed): only the borrower can propose a loan in their own name.
    function test_L1_callerMustBeBorrower() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), address(loans), 100e18);
        vm.stopPrank();
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotBorrower.selector, 0, rogue));
        loans.createLoan(lender, alice, address(inr), 1e18, 0, 1 days, address(token), POS);
    }

    /// L1 (fixed): one locked position backs at most one loan.
    function test_L1_positionCannotBackTwoLoans() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), address(loans), 100e18);
        loans.createLoan(lender, alice, address(inr), 1e18, 0, 1 days, address(token), POS);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanPositionInUse.selector, POS));
        loans.createLoan(alice, alice, address(inr), 1, 0, 1, address(token), POS);
        vm.stopPrank();
    }

    /// L1 (fixed): the position must be locked to the loan contract, not to the borrower.
    function test_L1_positionMustBeOwnedByLoanContract() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), alice, 100e18);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotCollateralOwner.selector, POS, alice));
        loans.createLoan(lender, alice, address(inr), 1e18, 0, 1 days, address(token), POS);
        vm.stopPrank();
    }

    /// L2 (fixed): nobody but the lender can spend the lender's allowance.
    function test_L2_onlyLenderCanFund() public {
        vm.prank(lender);
        inr.approve(address(loans), type(uint256).max); // lender pre-approved once
        _mint(BANK, rogue, keccak256("dust"), 1, 2);
        bytes32 pos = keccak256("rogue-dust");
        vm.startPrank(rogue);
        token.approve(address(vault), 1e15);
        vault.lock(pos, address(token), address(loans), 1e15); // 1 mg of gold
        uint256 id = loans.createLoan(lender, rogue, address(inr), 1_000_000e18, 0, 365 days, address(token), pos);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotLender.selector, id, rogue));
        loans.fundLoan(id);
        vm.stopPrank();
        assertEq(inr.balanceOf(rogue), 0, "no money moved without the lender");
        assertEq(inr.balanceOf(lender), 10_000_000e18);
    }

    /// A loan nobody funds can be cancelled by the borrower, who gets the gold back.
    function test_cancelUnfundedLoanReturnsGold() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), address(loans), 100e18);
        uint256 id = loans.createLoan(lender, alice, address(inr), 1e18, 0, 1 days, address(token), POS);
        vm.stopPrank();
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotBorrower.selector, id, rogue));
        loans.cancelLoan(id);
        vm.prank(alice);
        loans.cancelLoan(id);
        assertEq(token.balanceOf(alice), 100e18);
        vm.prank(lender);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanFundedAlready.selector, id));
        loans.fundLoan(id);
    }
}
