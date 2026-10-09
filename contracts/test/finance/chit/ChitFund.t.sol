// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ChitFundBase} from "./ChitFundBase.sol";
import {ChitFund} from "../../../src/finance/chit/ChitFund.sol";
import {MockRandomness} from "../../../src/finance/chit/MockRandomness.sol";
import {MockERC20} from "../../../src/MockERC20.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @dev Takes 1% on every transfer: must be rejected by ChitFund.
contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

contract ChitFundTest is ChitFundBase {
    // Rs 5,000 with 2 decimals (paise).
    uint256 constant C_INR = 5_000_00;

    function _auctionInr(uint256 n) internal {
        token = new MockERC20("INR Stable", "INRS", 2);
        _deploy(_params(address(token), C_INR, ChitFund.Mode.AUCTION), n, C_INR * 40);
        _enrollAll();
    }

    // ------------------------------------------------------------------
    // Worked example (Ram's numbers)
    // ------------------------------------------------------------------

    /// Pot 50,000; winning bid 45,000; discount 5,000; foreman 2,500;
    /// 2,500 split among 9 others = 277.77 each; 0.07 dust to the winner.
    function test_WorkedExample_TenMembers_Rs5000() public {
        _auctionInr(10);
        _payAll();
        address w = m[3];
        _commitBid(w, 45_000_00);
        _commitBid(m[5], 47_000_00);
        _toReveal();
        _revealBid(w, 45_000_00);
        _revealBid(m[5], 47_000_00);
        _toSettle();
        fund.settle();

        ChitFund.RoundResult memory r = fund.result(1);
        assertEq(r.winner, w);
        assertEq(r.pot, 50_000_00);
        assertEq(r.payout, 45_000_00);
        assertEq(r.commission, 2_500_00);
        assertEq(r.dividendEach, 277_77);
        assertEq(r.dust, 7);
        assertEq(fund.foremanCredit(), 2_500_00);
        for (uint256 i; i < 10; ++i) {
            if (m[i] == w) continue;
            assertEq(fund.credit(m[i]), 277_77);
        }
        assertEq(fund.credit(w), 7);
        // 2,500 = 9 x 277.77 + 0.07: nothing lost.
        assertEq(9 * r.dividendEach + r.dust, 2_500_00);

        // Prize is locked against the 9 remaining contributions (45,000).
        assertEq(fund.escrow(w), 45_000_00);
        assertEq(fund.liability(w), 45_000_00);
        assertEq(fund.escrowFree(w), 0);
        // Posting 45,000 collateral frees the whole prize.
        vm.prank(w);
        fund.postCollateral(w, 45_000_00);
        uint256 before = token.balanceOf(w);
        vm.prank(w);
        fund.withdraw();
        assertEq(token.balanceOf(w) - before, 45_000_00 + 7);
        _assertConserved();
    }

    /// Same numbers with 18 decimals: rounding stays exact and dust is tracked.
    function test_WorkedExample_18Decimals() public {
        token = new MockERC20("USD", "USD", 18);
        _deploy(_params(address(token), 5_000e18, ChitFund.Mode.AUCTION), 10, 5_000e18 * 40);
        _enrollAll();
        _payAll();
        _commitBid(m[0], 45_000e18);
        _toReveal();
        _revealBid(m[0], 45_000e18);
        _toSettle();
        fund.settle();
        ChitFund.RoundResult memory r = fund.result(1);
        assertEq(r.commission, 2_500e18);
        assertEq(r.dividendEach, uint256(2_500e18) / 9);
        assertEq(r.dividendEach * 9 + r.dust, 2_500e18);
        _assertConserved();
    }

    // ------------------------------------------------------------------
    // Auction mode
    // ------------------------------------------------------------------

    function test_Auction_FullCycle_EachWinsOnce_FeeCapped() public {
        _auctionInr(5);
        // Everyone posts full collateral up front so any bid is covered.
        for (uint256 i; i < 5; ++i) {
            vm.prank(m[i]);
            fund.postCollateral(m[i], 4 * C_INR);
        }
        for (uint256 r = 1; r <= 5; ++r) {
            _payAll();
            uint256 bid = 25_000_00 - 1_000_00 * (6 - r) / 2;
            for (uint256 i; i < 5; ++i) {
                if (!_won(m[i])) {
                    _commitBid(m[i], bid + i * 10_00);
                }
            }
            _toReveal();
            for (uint256 i; i < 5; ++i) {
                if (!_won(m[i])) _revealBid(m[i], bid + i * 10_00);
            }
            _toSettle();
            fund.settle();
            ChitFund.RoundResult memory res = fund.result(r);
            assertLe(res.commission * 10_000, res.pot * 500, "fee cap");
            _assertConserved();
        }
        assertTrue(fund.finalized());
        for (uint256 i; i < 5; ++i) assertTrue(_won(m[i]));
        _withdrawAll();
        assertEq(token.balanceOf(address(fund)), 0);
    }

    function test_Auction_NoBids_FirstEligibleTakesFullPot() public {
        _auctionInr(4);
        _payAll();
        _toSettle();
        fund.settle();
        ChitFund.RoundResult memory r = fund.result(1);
        assertEq(r.winner, m[0]);
        assertEq(r.payout, 4 * C_INR);
        assertEq(r.commission, 0);
    }

    /// Chit Funds Act s.6(4): equal best bids are settled by lot, not by
    /// reveal order. The lot is seeded by all revealed salts.
    function test_Auction_TieSettledByLot() public {
        _auctionInr(4);
        _payAll();
        _commitBid(m[1], 18_000_00);
        _commitBid(m[2], 18_000_00);
        _commitBid(m[3], 19_000_00);
        _toReveal();
        _revealBid(m[2], 18_000_00);
        _revealBid(m[1], 18_000_00);
        _revealBid(m[3], 19_000_00);
        assertEq(fund.bestBidTies(), 2);
        uint256 entropy = uint256(keccak256(abi.encode(m[1], uint256(18_000_00))))
            ^ uint256(keccak256(abi.encode(m[2], uint256(18_000_00))))
            ^ uint256(keccak256(abi.encode(m[3], uint256(19_000_00))));
        uint256 pick = uint256(keccak256(abi.encode(entropy, address(fund), uint256(1)))) % 2;
        _toSettle();
        fund.settle();
        // Tied set in member order: m[1], m[2].
        assertEq(fund.result(1).winner, pick == 0 ? m[1] : m[2]);
        assertEq(fund.result(1).payout, 18_000_00);
    }

    function test_Auction_BidBounds() public {
        _auctionInr(10);
        _payAll();
        _commitBid(m[0], 50_000_01);
        _commitBid(m[1], 34_999_99); // more than 30% discount
        _toReveal();
        vm.expectRevert();
        _revealBid(m[0], 50_000_01);
        vm.expectRevert();
        _revealBid(m[1], 34_999_99);
    }

    function test_Auction_DeepBidNeedsCollateral() public {
        _auctionInr(10);
        _payAll();
        _commitBid(m[0], 35_000_00); // 9 x 5,000 = 45,000 still owed
        _toReveal();
        vm.expectRevert(abi.encodeWithSelector(ChitFund.NotEligible.selector, m[0]));
        _revealBid(m[0], 35_000_00);
        vm.prank(m[0]);
        fund.postCollateral(m[0], 10_000_00);
        _revealBid(m[0], 35_000_00);
        assertEq(fund.bestBidder(), m[0]);
    }

    function test_Auction_PastWinnerCannotBid() public {
        _auctionInr(3);
        _payAll();
        _toSettle();
        fund.settle(); // m[0] wins (no bids)
        _payAll();
        bytes32 h = _bidHash(m[0], 10_000_00, bytes32(0));
        vm.prank(m[0]);
        vm.expectRevert(abi.encodeWithSelector(ChitFund.NotEligible.selector, m[0]));
        fund.commitBid(h);
    }

    function test_Auction_UnpaidBidderCannotReveal() public {
        _auctionInr(3);
        _payAllBut(m[1]);
        _commitBid(m[1], 14_000_00);
        _toReveal();
        vm.expectRevert(abi.encodeWithSelector(ChitFund.NotEligible.selector, m[1]));
        _revealBid(m[1], 14_000_00);
    }

    function test_Auction_WrongSaltRejected() public {
        _auctionInr(3);
        _payAll();
        _commitBid(m[1], 14_000_00);
        _toReveal();
        vm.prank(m[1]);
        vm.expectRevert(abi.encodeWithSelector(ChitFund.BadReveal.selector, m[1]));
        fund.revealBid(14_000_00, bytes32(uint256(1)));
    }

    // ------------------------------------------------------------------
    // Fixed order and draw modes
    // ------------------------------------------------------------------

    function test_FixedOrder_FullCycle_NetZero() public {
        token = new MockERC20("USD", "USD", 6);
        uint256 c = 100e6;
        _deploy(_params(address(token), c, ChitFund.Mode.FIXED_ORDER), 4, c * 10);
        _enrollAll();
        for (uint256 r = 1; r <= 4; ++r) {
            _payAll();
            _toSettle();
            fund.settle();
            assertEq(fund.result(r).winner, m[r - 1]);
            _assertConserved();
        }
        _withdrawAll();
        for (uint256 i; i < 4; ++i) assertEq(token.balanceOf(m[i]), c * 10);
        assertEq(token.balanceOf(address(fund)), 0);
    }

    function _drawFund(uint256 n, uint256 bond, address rnd) internal {
        token = new MockERC20("USD", "USD", 18);
        ChitFund.Params memory p = _params(address(token), 1e18, ChitFund.Mode.DRAW);
        p.revealBond = bond;
        p.randomness = rnd;
        p.vrfTimeout = rnd == address(0) ? 0 : 1 days;
        _deploy(p, n, 100e18);
        _enrollAll();
    }

    function _seedHash(address who, uint256 seed) internal view returns (bytes32) {
        return keccak256(abi.encode(address(fund), fund.round(), who, seed, bytes32(seed)));
    }

    function _commitSeed(address who, uint256 seed) internal {
        bytes32 h = _seedHash(who, seed);
        vm.prank(who);
        fund.commitSeed(h);
    }

    function _revealSeed(address who, uint256 seed) internal {
        vm.prank(who);
        fund.revealSeed(seed, bytes32(seed));
    }

    function test_Draw_WinnerFollowsRevealedSeeds() public {
        _drawFund(4, 0, address(0));
        _payAll();
        uint256 x;
        for (uint256 i; i < 4; ++i) {
            _commitSeed(m[i], 1000 + i * 7);
            x ^= 1000 + i * 7;
        }
        _toReveal();
        for (uint256 i; i < 4; ++i) _revealSeed(m[i], 1000 + i * 7);
        _toSettle();
        fund.settle();
        uint256 pick = uint256(keccak256(abi.encode(x, address(fund), uint256(1)))) % 4;
        assertEq(fund.result(1).winner, m[pick]);
    }

    function test_Draw_NonRevealerForfeitsBondAndCannotWin() public {
        uint256 bond = 0.1e18;
        _drawFund(3, bond, address(0));
        _payAll();
        _commitSeed(m[0], 11);
        _commitSeed(m[1], 22);
        _commitSeed(m[2], 33);
        _toReveal();
        _revealSeed(m[0], 11);
        _revealSeed(m[1], 22);
        // m[2] withholds its reveal (last revealer attack).
        _toSettle();
        fund.settle();
        ChitFund.RoundResult memory r = fund.result(1);
        assertTrue(r.winner != m[2], "non revealer won");
        (,,,,, uint32 missed) = fund.stateOf(m[2]);
        assertEq(missed, 1);
        // Bond went to the dividend pool of the two non winners.
        uint256 other = r.winner == m[0] ? 1 : 0;
        assertEq(fund.credit(m[other]), bond + bond / 2);
        assertEq(fund.credit(m[2]), bond / 2);
        _assertConserved();
    }

    function test_Draw_VRF_RequestFulfillSettle() public {
        MockRandomness vrf = new MockRandomness();
        _drawFund(5, 0, address(vrf));
        _payAll();
        _toSettle();
        vm.expectRevert(abi.encodeWithSelector(ChitFund.RandomnessPending.selector, uint256(1)));
        fund.settle();
        fund.requestRandomness();
        vm.expectRevert(abi.encodeWithSelector(ChitFund.RandomnessPending.selector, uint256(1)));
        fund.settle();
        vrf.fulfill(fund.randomnessKey(1), 123456789);
        fund.settle();
        uint256 pick = uint256(keccak256(abi.encode(uint256(123456789), uint256(0)))) % 5;
        assertEq(fund.result(1).winner, m[pick]);
    }

    function test_Draw_VRF_TimeoutFallsBack() public {
        MockRandomness vrf = new MockRandomness();
        _drawFund(3, 0, address(vrf));
        _payAll();
        _toSettle();
        fund.requestRandomness();
        vm.warp(fund.revealEnd() + 1 days);
        fund.settle();
        assertTrue(fund.result(1).winner != address(0));
    }

    function test_Draw_ForemanCannotCommitOrReveal() public {
        _drawFund(3, 0, address(0));
        vm.prank(foreman);
        vm.expectRevert(abi.encodeWithSelector(ChitFund.NotMember.selector, foreman));
        fund.commitSeed(bytes32(uint256(1)));
    }

    // ------------------------------------------------------------------
    // Late payment, default, exclusion
    // ------------------------------------------------------------------

    function test_LateFeeJoinsPot() public {
        _auctionInr(3);
        vm.prank(m[0]);
        fund.contribute();
        vm.prank(m[1]);
        fund.contribute();
        vm.warp(fund.payDeadline()); // grace period
        vm.prank(m[2]);
        fund.contribute();
        uint256 fee = C_INR * 200 / 10_000;
        assertEq(fund.roundExtras(), fee);
        _toSettle();
        fund.settle(); // no bids: m[0] wins full pot, fee split between m[1], m[2]
        assertEq(fund.credit(m[1]), fee / 2);
        assertEq(fund.credit(m[2]), fee / 2);
        _assertConserved();
    }

    function test_PaymentClosedAfterGrace() public {
        _auctionInr(3);
        _toReveal();
        vm.prank(m[0]);
        vm.expectRevert(abi.encodeWithSelector(ChitFund.PaymentClosed.selector, uint256(1)));
        fund.contribute();
    }

    function test_WinnerDefault_SlashedFromEscrow_GroupWhole() public {
        _auctionInr(3);
        _payAll();
        _toSettle();
        fund.settle(); // m[0] wins 15,000; owes 2 x 5,000
        address w = m[0];
        vm.prank(w);
        fund.postCollateral(w, 2 * C_INR);
        vm.prank(w);
        fund.withdraw(); // takes the whole 15,000 prize
        assertEq(fund.escrow(w), 2 * C_INR);
        // Round 2: winner stops paying.
        _payAllBut(w);
        _toSettle();
        fund.settle();
        ChitFund.RoundResult memory r = fund.result(2);
        assertEq(r.pot, 3 * C_INR, "group made whole");
        assertEq(fund.escrow(w), C_INR, "slashed one contribution");
        (,,,, uint32 defaults,) = fund.stateOf(w);
        assertEq(defaults, 1);
        _assertConserved();
    }

    function test_NonWinnerDefault_ExcludedThenRefundedAtEnd() public {
        token = new MockERC20("USD", "USD", 6);
        uint256 c = 100e6;
        _deploy(_params(address(token), c, ChitFund.Mode.FIXED_ORDER), 4, c * 10);
        _enrollAll();
        address d = m[3];
        // Round 1: all pay, m[0] wins.
        _payAll();
        _toSettle();
        fund.settle();
        // Round 2: d defaults.
        _payAllBut(d);
        _toSettle();
        fund.settle();
        (, bool excluded,,,,) = fund.stateOf(d);
        assertTrue(excluded);
        vm.prank(d);
        vm.expectRevert(abi.encodeWithSelector(ChitFund.Excluded.selector, d));
        fund.contribute();
        // Round 3: m[2] wins. Round 4: nobody eligible, settlement round.
        _payAll();
        _toSettle();
        fund.settle();
        assertEq(fund.result(3).winner, m[2]);
        _payAll();
        _toSettle();
        fund.settle();
        assertEq(fund.result(4).winner, address(0));
        assertTrue(fund.finalized());
        // d paid 1 x 100, forfeits 10%: refund 90. Reserve 300, rest 210.
        // m[1], m[2] won 300 pots after paying 400: made whole (+100 each).
        // Last 10 (d's forfeit) split 3 ways, dust 1 to m[0].
        assertEq(fund.credit(d), 90e6);
        assertEq(fund.credit(m[1]), 100e6 + 3_333_333);
        assertEq(fund.credit(m[2]), 100e6 + 3_333_333);
        assertEq(fund.credit(m[0]), 3_333_334);
        _withdrawAll();
        assertEq(token.balanceOf(address(fund)), 0);
        assertFalse(_won(d));
    }

    // ------------------------------------------------------------------
    // Foreman cannot touch member funds or rig outcomes
    // ------------------------------------------------------------------

    function test_Foreman_OnlyCommission() public {
        _auctionInr(10);
        _payAll();
        _commitBid(m[4], 45_000_00);
        _toReveal();
        _revealBid(m[4], 45_000_00);
        _toSettle();
        fund.settle();
        vm.startPrank(foreman);
        vm.expectRevert(ChitFund.NothingToWithdraw.selector);
        fund.withdraw();
        vm.expectRevert(abi.encodeWithSelector(ChitFund.AlreadyStarted.selector));
        fund.cancel();
        vm.expectRevert(abi.encodeWithSelector(ChitFund.NotMember.selector, foreman));
        fund.contribute();
        uint256 got = fund.withdrawCommission();
        vm.stopPrank();
        assertEq(got, 2_500_00);
        assertEq(token.balanceOf(foreman), 2_500_00);
        _assertConserved();
    }

    function test_Foreman_CommissionCapAndMembership() public {
        token = new MockERC20("USD", "USD", 18);
        ChitFund.Params memory p = _params(address(token), 1e18, ChitFund.Mode.AUCTION);
        p.commissionBps = 501;
        _members(3);
        vm.prank(foreman);
        vm.expectRevert(ChitFund.BadParams.selector);
        new ChitFund(p, m);
        p.commissionBps = 500;
        m[1] = foreman;
        vm.prank(foreman);
        vm.expectRevert(ChitFund.BadMembers.selector);
        new ChitFund(p, m);
        m[1] = m[0];
        vm.prank(foreman);
        vm.expectRevert(ChitFund.BadMembers.selector);
        new ChitFund(p, m);
    }

    function test_Foreman_CancelOnlyBeforeStart() public {
        token = new MockERC20("USD", "USD", 18);
        _deploy(_params(address(token), 1e18, ChitFund.Mode.DRAW), 3, 10e18);
        vm.prank(m[0]);
        vm.expectRevert(abi.encodeWithSelector(ChitFund.NotForeman.selector, m[0]));
        fund.cancel();
        vm.prank(foreman);
        fund.cancel();
        vm.prank(m[0]);
        vm.expectRevert(ChitFund.FundClosed.selector);
        fund.enroll();
    }

    function test_SettleBeforeRevealEndReverts() public {
        _auctionInr(3);
        _payAll();
        vm.expectRevert();
        fund.settle();
    }

    function test_FeeOnTransferTokenRejected() public {
        FeeToken ft = new FeeToken();
        _members(2);
        vm.prank(foreman);
        fund = new ChitFund(_params(address(ft), 100e18, ChitFund.Mode.FIXED_ORDER), m);
        ft.mint(m[0], 1_000e18);
        vm.prank(m[0]);
        ft.approve(address(fund), type(uint256).max);
        _enrollAll();
        vm.prank(m[0]);
        vm.expectRevert();
        fund.contribute();
    }
}
