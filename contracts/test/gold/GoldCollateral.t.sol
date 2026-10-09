// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GoldBase} from "./GoldBase.sol";
import {CollateralVault} from "../../src/collateral/CollateralVault.sol";
import {LoanAgreement} from "../../src/finance/LoanAgreement.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// Test-only INR-per-gram feed. CollateralVault has no oracle of its own.
contract MockGoldPriceFeed {
    uint256 public inrPerGram; // 18 decimals
    constructor(uint256 p) {
        inrPerGram = p;
    }
    function set(uint256 p) external {
        inrPerGram = p;
    }
}

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
        feed = new MockGoldPriceFeed(12_000e18); // illustrative price, not a quote
        inr.mint(lender, 10_000_000e18);
        _mint(BANK, alice, keccak256("SBI-GD-1"), 100_000, 1); // 100 g fine
    }

    function _openLoan() internal returns (uint256 loanId, uint256 principal) {
        principal = (100 * feed.inrPerGram() * LTV_BPS) / 10_000; // 840,000 mINR
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

    /// KNOWN ISSUE L1 (LoanAgreement, not fixed on this branch): createLoan does not
    /// check who locked the position, so a stranger can open a 1 wei loan against
    /// Alice's locked gold, default it and foreclose her collateral to himself.
    /// This test PASSES while the bug exists; flip it to expectRevert once fixed.
    function test_KNOWN_ISSUE_L1_strangerForeclosesLockedGold() public {
        vm.startPrank(alice);
        token.approve(address(vault), 100e18);
        vault.lock(POS, address(token), address(loans), 100e18); // step 1 of her loan
        vm.stopPrank();

        inr.mint(rogue, 1);
        vm.startPrank(rogue);
        uint256 id = loans.createLoan(rogue, rogue, address(inr), 1, 0, 1, address(token), POS);
        inr.approve(address(loans), 1);
        loans.fundLoan(id);
        loans.drawLoan(id);
        vm.warp(block.timestamp + 2);
        loans.declareDefault(id);
        vm.stopPrank();
        assertEq(token.balanceOf(rogue), 100e18, "stranger took Alice's gold");
    }

    /// KNOWN ISSUE L2: fundLoan pulls from `lender` without lender consent, so
    /// anyone can spend a lender's standing allowance on a loan they invent.
    function test_KNOWN_ISSUE_L2_anyoneSpendsLenderAllowance() public {
        vm.prank(lender);
        inr.approve(address(loans), type(uint256).max); // lender pre-approved once
        _mint(BANK, rogue, keccak256("dust"), 1, 2);
        bytes32 pos = keccak256("rogue-dust");
        vm.startPrank(rogue);
        token.approve(address(vault), 1e15);
        vault.lock(pos, address(token), address(loans), 1e15); // 1 mg of gold
        uint256 id = loans.createLoan(lender, rogue, address(inr), 1_000_000e18, 0, 365 days, address(token), pos);
        loans.fundLoan(id);
        loans.drawLoan(id);
        vm.stopPrank();
        assertEq(inr.balanceOf(rogue), 1_000_000e18, "1M mINR borrowed against 1 mg");
    }
}
