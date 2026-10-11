// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./AssetsBase.sol";

/// Bank asset desk: auctions of items banks hold after a default.
contract BankAssetDeskTest is AssetsBase {
    uint256 constant RESERVE = 3_00_000_00; // Rs 3 lakh
    uint256 constant DUES = 2_10_000_00;

    function setUp() public {
        _deployPledge();
    }

    /// alice borrowed against her car, defaulted; the bank now holds the receipt.
    function _repossessed() internal returns (uint256 id) {
        id = _issueCar(alice);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        uint256 loanId = loans.borrow(id, 2_00_000_00, uint64(block.timestamp + 30 days));
        vm.stopPrank();
        vm.warp(block.timestamp + 31 days);
        vm.prank(bankOps);
        loans.claimDefault(loanId);
    }

    function _list(uint256 id, uint8 kind) internal returns (uint256 listingId) {
        uint64 win = uint64(block.timestamp + 30 days);
        uint64 bidEnd = uint64(block.timestamp + 35 days);
        uint64 revealEnd = kind == 1 ? bidEnd + 2 days : bidEnd;
        vm.startPrank(bankOps);
        receipts.approve(address(desk), id);
        listingId = desk.list(id, kind, 3, RESERVE, win, bidEnd, revealEnd, alice, DUES);
        vm.stopPrank();
    }

    function _solvent() internal view {
        assertEq(rupee.balanceOf(address(desk)), desk.totalEscrow() + desk.totalCredit());
    }

    function test_list_onlyBankOfReceipt_andSaneParams() public {
        uint256 id = _repossessed();
        vm.prank(bank2Ops);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskNotBank.selector, id, bank2Ops));
        desk.list(
            id,
            0,
            3,
            RESERVE,
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 2),
            uint64(block.timestamp + 2),
            alice,
            DUES
        );
        vm.startPrank(bankOps);
        receipts.approve(address(desk), id);
        vm.expectRevert(BankAssetDesk.DeskBadParams.selector); // no legal step
        desk.list(
            id,
            0,
            0,
            RESERVE,
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 2),
            uint64(block.timestamp + 2),
            alice,
            DUES
        );
        vm.expectRevert(BankAssetDesk.DeskBadParams.selector); // sealed needs a reveal phase
        desk.list(
            id,
            1,
            3,
            RESERVE,
            uint64(block.timestamp + 1),
            uint64(block.timestamp + 2),
            uint64(block.timestamp + 2),
            alice,
            DUES
        );
        vm.stopPrank();
    }

    function test_english_happyPath_settlesAfterWindow_withReattestation() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(buyerA);
        desk.bid(lid, RESERVE);
        vm.prank(buyerB);
        desk.bid(lid, RESERVE + 3_000_00); // +1 percent
        assertEq(desk.credit(buyerA), RESERVE); // outbid money waiting
        _solvent();

        vm.warp(block.timestamp + 36 days);
        vm.prank(bankOps);
        desk.settle(lid, 3_50_000_00, uint64(block.timestamp + 365 days));
        assertEq(receipts.ownerOf(id), buyerB);
        assertEq(receipts.receiptOf(id).appraisedPaise, 3_50_000_00);
        assertEq(desk.credit(bankOps), DUES); // bank gets its dues
        assertEq(desk.credit(alice), RESERVE + 3_000_00 - DUES); // surplus to the borrower
        _solvent();

        // the winner still cannot move it without the bank
        vm.prank(buyerB);
        vm.expectRevert();
        receipts.transferFrom(buyerB, rogue, id);

        uint256 b = rupee.balanceOf(buyerA);
        vm.prank(buyerA);
        desk.withdraw();
        assertEq(rupee.balanceOf(buyerA), b + RESERVE);
        _solvent();
    }

    function test_noSettleBeforeRedemptionWindowEnds() public {
        uint256 id = _repossessed();
        uint64 win = uint64(block.timestamp + 30 days);
        vm.startPrank(bankOps);
        receipts.approve(address(desk), id);
        // auction ends before the window: settlement still has to wait for the window
        uint256 lid = desk.list(
            id, 0, 3, RESERVE, win, uint64(block.timestamp + 1 days), uint64(block.timestamp + 1 days), alice, DUES
        );
        vm.stopPrank();
        vm.prank(buyerA);
        desk.bid(lid, RESERVE);
        vm.warp(block.timestamp + 2 days);
        vm.prank(bankOps);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskWindowOpen.selector, lid, win));
        desk.settle(lid, 1, uint64(block.timestamp + 1 days));
        assertEq(receipts.ownerOf(id), address(desk));
    }

    function test_borrowerRedeemsBeforeWindow_refundsBidders() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(buyerA);
        desk.bid(lid, RESERVE);
        vm.prank(alice);
        desk.redeem(lid);
        assertEq(receipts.ownerOf(id), alice);
        assertEq(desk.credit(buyerA), RESERVE);
        assertEq(desk.credit(bankOps), DUES);
        _solvent();
        vm.prank(buyerB);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskNotListed.selector, lid));
        desk.bid(lid, RESERVE * 2);
    }

    function test_borrowerCannotRedeemAfterWindow_orIfNotBorrower() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskNotBorrower.selector, lid, rogue));
        desk.redeem(lid);
        vm.warp(block.timestamp + 30 days + 1);
        vm.prank(alice);
        vm.expectRevert();
        desk.redeem(lid);
    }

    function test_onlyApprovedBuyers_andSellerCannotBid() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskNotApprovedBuyer.selector, rogue));
        desk.bid(lid, RESERVE);
        vm.prank(gov);
        desk.setApprovedBuyer(bankOps, true);
        vm.prank(bankOps);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskSellerCannotBid.selector, lid));
        desk.bid(lid, RESERVE);
    }

    function test_english_bidRules() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(buyerA);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskBidTooLow.selector, RESERVE - 1, RESERVE));
        desk.bid(lid, RESERVE - 1);
        vm.prank(buyerA);
        desk.bid(lid, RESERVE);
        uint256 min = desk.minimumBid(lid);
        assertEq(min, RESERVE + RESERVE / 100);
        vm.prank(buyerB);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskBidTooLow.selector, min - 1, min));
        desk.bid(lid, min - 1);
        vm.warp(block.timestamp + 36 days);
        vm.prank(buyerB);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskBiddingClosed.selector, lid));
        desk.bid(lid, min);
    }

    function test_noBids_unsold_returnsToBank() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.warp(block.timestamp + 36 days);
        vm.prank(bankOps);
        desk.settle(lid, 1, uint64(block.timestamp + 1 days));
        assertEq(receipts.ownerOf(id), bankOps);
    }

    function test_sealed_highestRevealWins_othersRefunded() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 1);
        bytes32 sa = "salt-a";
        bytes32 sb = "salt-b";
        uint256 bidA = 3_20_000_00;
        uint256 bidB = 3_40_000_00;
        vm.prank(buyerA);
        desk.commitBid(lid, keccak256(abi.encode(lid, buyerA, bidA, sa)), 4_00_000_00);
        vm.prank(buyerB);
        desk.commitBid(lid, keccak256(abi.encode(lid, buyerB, bidB, sb)), 3_50_000_00);
        _solvent();
        vm.prank(buyerA);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskNotRevealPhase.selector, lid));
        desk.revealBid(lid, bidA, sa);

        vm.warp(block.timestamp + 36 days);
        vm.prank(buyerA);
        desk.revealBid(lid, bidA, sa);
        vm.prank(buyerB);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskBadReveal.selector, lid));
        desk.revealBid(lid, bidB + 1, sb); // lie about the amount
        vm.prank(buyerB);
        desk.revealBid(lid, bidB, sb);
        assertEq(desk.credit(buyerA), 4_00_000_00); // outbid, whole deposit back
        vm.prank(buyerB);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskBadReveal.selector, lid));
        desk.revealBid(lid, bidB, sb); // twice

        vm.warp(block.timestamp + 3 days);
        vm.prank(bankOps);
        desk.settle(lid, bidB, uint64(block.timestamp + 365 days));
        assertEq(receipts.ownerOf(id), buyerB);
        assertEq(desk.credit(bankOps), DUES);
        assertEq(desk.credit(alice), bidB - DUES);
        assertEq(desk.credit(buyerB), 3_50_000_00 - bidB); // excess deposit back
        _solvent();
    }

    function test_sealed_unrevealedDepositReclaimable() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 1);
        vm.prank(buyerA);
        desk.commitBid(lid, keccak256("never-revealed"), RESERVE);
        vm.prank(buyerA);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskAuctionRunning.selector, lid));
        desk.reclaimDeposit(lid);
        vm.warp(block.timestamp + 38 days);
        vm.prank(buyerA);
        desk.reclaimDeposit(lid);
        assertEq(desk.credit(buyerA), RESERVE);
        _solvent();
    }

    function test_bankNeverSettles_highBidderReclaimsAfterTimeout() public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(buyerA);
        desk.bid(lid, RESERVE);
        vm.warp(block.timestamp + 36 days);
        vm.prank(buyerA);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskAuctionRunning.selector, lid));
        desk.reclaimUnsettled(lid);
        vm.warp(block.timestamp + 31 days);
        vm.prank(buyerA);
        desk.reclaimUnsettled(lid);
        assertEq(desk.credit(buyerA), RESERVE);
        vm.prank(bankOps);
        desk.settle(lid, 1, uint64(block.timestamp + 1 days));
        assertEq(receipts.ownerOf(id), bankOps); // unsold
        _solvent();
    }

    function test_jewelleryReserveAtLeast90PercentOfValue() public {
        PledgeReceipt.PledgeAttestation memory a =
            _pledgeAtt(bankOps, 3, 2_00_000_00, uint64(block.timestamp + 365 days));
        uint256 id = receipts.issue(a, _signPledge(bankKey, a));
        vm.startPrank(bankOps);
        receipts.approve(address(desk), id);
        uint64 w = uint64(block.timestamp + 30 days);
        vm.expectRevert(BankAssetDesk.DeskReserveTooLow.selector);
        desk.list(id, 0, 3, 1_79_999_99, w, w, w, alice, DUES);
        desk.list(id, 0, 3, 1_80_000_00, w, w, w, alice, DUES);
        vm.stopPrank();
    }

    function testFuzz_settleBeforeWindow_alwaysReverts(uint64 dt) public {
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        vm.prank(buyerA);
        desk.bid(lid, RESERVE);
        dt = uint64(bound(dt, 0, 30 days));
        vm.warp(block.timestamp + dt);
        vm.prank(bankOps);
        vm.expectRevert();
        desk.settle(lid, 1, uint64(block.timestamp + 400 days));
        assertEq(receipts.ownerOf(id), address(desk));
    }

    function testFuzz_onlyApprovedCanBid(address who, uint256 amt) public {
        vm.assume(!desk.approvedBuyer(who));
        uint256 id = _repossessed();
        uint256 lid = _list(id, 0);
        amt = bound(amt, RESERVE, RESERVE * 10);
        vm.prank(who);
        vm.expectRevert(abi.encodeWithSelector(BankAssetDesk.DeskNotApprovedBuyer.selector, who));
        desk.bid(lid, amt);
    }
}
