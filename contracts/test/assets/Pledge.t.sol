// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./AssetsBase.sol";

/// Pledge receipts for unique valuables and loans against them.
contract PledgeTest is AssetsBase {
    function setUp() public {
        _deployPledge();
    }

    // ------------------------------------------------------------ issue
    function test_issue_storesHashesOnly_andValue() public {
        uint256 id = _issueCar(alice);
        assertEq(receipts.ownerOf(id), alice);
        PledgeReceipt.Receipt memory r = receipts.receiptOf(id);
        assertEq(r.bankId, BANK);
        assertEq(r.appraisedPaise, 6_00_000_00);
        // Rs 6 lakh car, 30 percent haircut -> Rs 4.2 lakh lendable value
        assertEq(receipts.collateralValuePaise(id), 4_20_000_00);
    }

    function test_issue_rejectsWrongSigner_replay_andRefReuse() public {
        PledgeReceipt.PledgeAttestation memory a = _pledgeAtt(alice, 0, 1_00_000_00, uint64(block.timestamp + 30 days));
        bytes memory bad = _signPledge(bank2Key, a);
        vm.expectRevert(PledgeReceipt.PledgeBadSignature.selector);
        receipts.issue(a, bad);
        bytes memory sig = _signPledge(bankKey, a);
        receipts.issue(a, sig);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeNonceUsed.selector, BANK, a.nonce));
        receipts.issue(a, sig);
        a.nonce = 999_999;
        sig = _signPledge(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeRefUsed.selector, a.receiptRef));
        receipts.issue(a, sig);
    }

    function test_issue_rejectsBadClassDatesExpiry() public {
        PledgeReceipt.PledgeAttestation memory a = _pledgeAtt(alice, 7, 1, uint64(block.timestamp + 1 days));
        bytes memory sig = _signPledge(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeBadClass.selector, 7));
        receipts.issue(a, sig);
        a = _pledgeAtt(alice, 0, 1, uint64(block.timestamp));
        sig = _signPledge(bankKey, a);
        vm.expectRevert(PledgeReceipt.PledgeBadDates.selector);
        receipts.issue(a, sig);
        a = _pledgeAtt(alice, 0, 1, uint64(block.timestamp + 10 days));
        sig = _signPledge(bankKey, a);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeExpired.selector, a.expiry));
        receipts.issue(a, sig);
    }

    // ------------------------------------------------------------ transfer gate
    function test_transfer_blockedWithoutBankApproval() public {
        uint256 id = _issueCar(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeTransferNotApproved.selector, id, bob));
        receipts.transferFrom(alice, bob, id);
    }

    function test_transfer_bankApprovedIsOneShot() public {
        uint256 id = _issueCar(alice);
        vm.prank(bankOps);
        receipts.approveTransfer(id, bob);
        vm.prank(alice);
        receipts.transferFrom(alice, bob, id);
        assertEq(receipts.ownerOf(id), bob);
        assertEq(receipts.approvedTo(id), address(0));
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeTransferNotApproved.selector, id, alice));
        receipts.transferFrom(bob, alice, id);
    }

    function test_cannotPushReceiptIntoLienMover() public {
        uint256 id = _issueCar(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeTransferNotApproved.selector, id, address(desk)));
        receipts.transferFrom(alice, address(desk), id);
    }

    function test_onlyBankOperatorActs() public {
        uint256 id = _issueCar(alice);
        vm.startPrank(rogue);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeNotBankOperator.selector, BANK, rogue));
        receipts.approveTransfer(id, rogue);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeNotBankOperator.selector, BANK, rogue));
        receipts.freeze(id, "x");
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeNotBankOperator.selector, BANK, rogue));
        receipts.release(id, "x");
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeNotLienMover.selector, rogue));
        receipts.moverReappraise(id, 1, uint64(block.timestamp + 1));
        vm.stopPrank();
        vm.prank(bank2Ops); // other bank's operator has no say
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeNotBankOperator.selector, BANK, bank2Ops));
        receipts.freeze(id, "x");
    }

    function test_freeze_blocksMoves_andZeroesValue() public {
        uint256 id = _issueCar(alice);
        vm.startPrank(bankOps);
        receipts.approveTransfer(id, bob);
        receipts.freeze(id, "court-order");
        vm.stopPrank();
        assertEq(receipts.collateralValuePaise(id), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeFrozen.selector, id));
        receipts.transferFrom(alice, bob, id);
        vm.prank(bankOps);
        receipts.unfreeze(id);
        assertGt(receipts.collateralValuePaise(id), 0);
    }

    function test_value_zeroAfterReappraisalDate_andReappraiseRestores() public {
        uint256 id = _issueCar(alice);
        vm.warp(block.timestamp + 366 days);
        assertEq(receipts.collateralValuePaise(id), 0);
        vm.prank(bankOps);
        receipts.reappraise(id, 5_00_000_00, uint64(block.timestamp + 180 days));
        assertEq(receipts.collateralValuePaise(id), 3_50_000_00);
    }

    function test_release_burns_butNotWhileInLoan() public {
        uint256 id = _issueCar(alice);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        loans.borrow(id, 1_00_000_00, uint64(block.timestamp + 90 days));
        vm.stopPrank();
        vm.prank(bankOps);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeHeldByLienMover.selector, id));
        receipts.release(id, "x");
    }

    function test_setHaircut_bounds() public {
        vm.startPrank(gov);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeBadHaircut.selector, 10_000));
        receipts.setHaircut(0, 10_000);
        vm.expectRevert(abi.encodeWithSelector(PledgeReceipt.PledgeBadClass.selector, 5));
        receipts.setHaircut(5, 1);
        receipts.setHaircut(0, 2000);
        vm.stopPrank();
        assertEq(receipts.haircutBps(0), 2000);
    }

    // ------------------------------------------------------------ loans
    function test_borrowRepay_receiptComesBack() public {
        uint256 id = _issueCar(alice);
        // max = 4.2 lakh * 60 percent = Rs 2.52 lakh
        assertEq(loans.maxBorrowPaise(id), 2_52_000_00);
        uint256 before = rupee.balanceOf(alice);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        uint256 loanId = loans.borrow(id, 2_52_000_00, uint64(block.timestamp + 90 days));
        assertEq(receipts.ownerOf(id), address(loans));
        assertEq(rupee.balanceOf(alice), before + 2_52_000_00);
        loans.repay(loanId);
        vm.stopPrank();
        assertEq(receipts.ownerOf(id), alice);
        assertEq(rupee.balanceOf(alice), before);
    }

    function test_borrow_aboveLtv_reverts() public {
        uint256 id = _issueCar(alice);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        vm.expectRevert(abi.encodeWithSelector(PledgeLoan.LoanTooLarge.selector, 2_52_000_01, 2_52_000_00));
        loans.borrow(id, 2_52_000_01, uint64(block.timestamp + 90 days));
        vm.stopPrank();
    }

    function test_borrow_termPastReappraisal_reverts() public {
        uint256 id = _issueCar(alice);
        PledgeReceipt.Receipt memory r = receipts.receiptOf(id);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        vm.expectRevert(abi.encodeWithSelector(PledgeLoan.LoanBadTerm.selector, r.reappraiseBy + 1, r.reappraiseBy));
        loans.borrow(id, 1, r.reappraiseBy + 1);
        vm.stopPrank();
    }

    function test_borrow_frozen_reverts() public {
        uint256 id = _issueCar(alice);
        vm.prank(bankOps);
        receipts.freeze(id, "x");
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        vm.expectRevert(abi.encodeWithSelector(PledgeLoan.LoanTooLarge.selector, 1, 0));
        loans.borrow(id, 1, uint64(block.timestamp + 1 days));
        vm.stopPrank();
    }

    function test_default_onlyAfterDue_onlyBank() public {
        uint256 id = _issueCar(alice);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        uint256 loanId = loans.borrow(id, 1_00_000_00, uint64(block.timestamp + 30 days));
        vm.stopPrank();
        vm.prank(bankOps);
        vm.expectRevert();
        loans.claimDefault(loanId);
        vm.warp(block.timestamp + 31 days);
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(PledgeLoan.LoanNotBank.selector, BANK, rogue));
        loans.claimDefault(loanId);
        vm.prank(bankOps);
        loans.claimDefault(loanId);
        assertEq(receipts.ownerOf(id), bankOps);
    }

    function test_onlyBorrowerRepays_andLiquidityBounds() public {
        uint256 id = _issueCar(alice);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        uint256 loanId = loans.borrow(id, 1_00_000_00, uint64(block.timestamp + 30 days));
        vm.stopPrank();
        vm.prank(buyerA);
        vm.expectRevert(abi.encodeWithSelector(PledgeLoan.LoanNotBorrower.selector, loanId, buyerA));
        loans.repay(loanId);
        vm.prank(bankOps);
        vm.expectRevert();
        loans.withdraw(BANK, 50_000_000_00); // part of the pot is lent out
    }

    function testFuzz_borrow_neverAboveLtvValue(uint256 paise, uint8 cls, uint256 appraised) public {
        cls = uint8(bound(cls, 0, 4));
        appraised = bound(appraised, 1_000_00, 1_00_00_000_00);
        PledgeReceipt.PledgeAttestation memory a = _pledgeAtt(alice, cls, appraised, uint64(block.timestamp + 200 days));
        uint256 id = receipts.issue(a, _signPledge(bankKey, a));
        uint256 maxP = loans.maxBorrowPaise(id);
        paise = bound(paise, 1, appraised);
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        if (paise > maxP) {
            vm.expectRevert();
            loans.borrow(id, paise, uint64(block.timestamp + 100 days));
        } else {
            loans.borrow(id, paise, uint64(block.timestamp + 100 days));
            assertLe(paise, appraised);
            assertEq(rupee.balanceOf(address(loans)), loans.totalLiquidity());
        }
        vm.stopPrank();
    }

    function testFuzz_strangerNeverMovesReceipt(address stranger, address to) public {
        vm.assume(stranger != address(0) && to != address(0) && to != alice);
        vm.assume(!receipts.lienMover(to) && !receipts.lienMover(stranger));
        uint256 id = _issueCar(alice);
        vm.prank(stranger);
        vm.expectRevert();
        receipts.transferFrom(alice, to, id);
        vm.prank(alice);
        vm.expectRevert();
        receipts.transferFrom(alice, to, id);
        assertEq(receipts.ownerOf(id), alice);
    }
}
