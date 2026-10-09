// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ChitFund} from "../../../src/finance/chit/ChitFund.sol";
import {MockERC20} from "../../../src/MockERC20.sol";

/// @dev Random walk over a 5 member auction chit: pay, skip, bid, post
///      collateral, withdraw, advance time, settle.
contract ChitHandler is Test {
    ChitFund public fund;
    MockERC20 public token;
    address[] public m;
    address public foreman;

    mapping(address => uint256) public winCount;
    uint256 public settledRounds;
    bool public feeCapBroken;
    bool public excludedWon;
    mapping(uint256 => mapping(address => uint256)) internal _bid;

    constructor(ChitFund f, MockERC20 t, address[] memory members_, address foreman_) {
        fund = f;
        token = t;
        m = members_;
        foreman = foreman_;
    }

    function _live() internal view returns (bool) {
        return fund.started() && !fund.finalized();
    }

    function pay(uint256 i) external {
        if (!_live()) return;
        address who = m[i % m.length];
        (, bool ex,,,,) = fund.stateOf(who);
        uint256 r = fund.round();
        if (ex || fund.paid(r, who) || block.timestamp >= fund.graceEnd()) return;
        vm.prank(who);
        fund.contribute();
    }

    function post(uint256 i, uint256 amt) external {
        if (!_live()) return;
        address who = m[i % m.length];
        amt = bound(amt, 1, 50_000_00);
        if (token.balanceOf(who) < amt) return;
        vm.prank(who);
        fund.postCollateral(who, amt);
    }

    function bid(uint256 i, uint256 discountBps) external {
        if (!_live()) return;
        address who = m[i % m.length];
        uint256 r = fund.round();
        (bool won, bool ex,,,,) = fund.stateOf(who);
        if (won || ex || fund.commitment(r, who) != bytes32(0) || block.timestamp >= fund.graceEnd()) return;
        uint256 pot = 5 * 5_000_00;
        uint256 b = pot - (pot * bound(discountBps, 0, 3000)) / 10_000;
        _bid[r][who] = b;
        vm.prank(who);
        fund.commitBid(keccak256(abi.encode(address(fund), r, who, b, bytes32(r))));
    }

    function reveal(uint256 i) external {
        if (!_live()) return;
        address who = m[i % m.length];
        uint256 r = fund.round();
        uint256 b = _bid[r][who];
        if (b == 0 || fund.revealed(r, who)) return;
        if (block.timestamp < fund.graceEnd() || block.timestamp >= fund.revealEnd()) return;
        (bool won, bool ex,, uint32 paidCount,,) = fund.stateOf(who);
        if (won || ex || !fund.paid(r, who)) return;
        uint256 pot = fund.expectedPot();
        if (b > pot || b < (pot * 7000 + 9999) / 10_000) return;
        if (fund.escrow(who) + b < (m.length - paidCount) * fund.contribution()) return;
        vm.prank(who);
        fund.revealBid(b, bytes32(r));
    }

    function withdraw(uint256 i) external {
        address who = m[i % m.length];
        if (fund.credit(who) + fund.escrowFree(who) == 0) return;
        vm.prank(who);
        fund.withdraw();
    }

    function warp(uint256 secs) external {
        if (!_live()) return;
        uint256 target = fund.roundStart() + bound(secs, 0, 7 days);
        if (target > block.timestamp) vm.warp(target);
    }

    function settle() external {
        if (!_live() || block.timestamp < fund.revealEnd()) return;
        uint256 r = fund.round();
        fund.settle();
        settledRounds = r;
        ChitFund.RoundResult memory res = fund.result(r);
        if (res.commission * 10_000 > res.pot * 500) feeCapBroken = true;
        if (res.winner != address(0)) {
            winCount[res.winner] += 1;
            (, bool ex,,,,) = fund.stateOf(res.winner);
            if (ex) excludedWon = true;
        }
    }

    function members() external view returns (address[] memory) {
        return m;
    }
}

contract ChitFundInvariantTest is Test {
    ChitHandler handler;
    ChitFund fund;
    MockERC20 token;
    address[] m;
    address foreman = address(0xF0E);

    function setUp() public {
        token = new MockERC20("INR", "INR", 2);
        for (uint256 i; i < 5; ++i) m.push(address(uint160(0xB000 + i)));
        ChitFund.Params memory p;
        p.token = address(token);
        p.contribution = 5_000_00;
        p.mode = ChitFund.Mode.AUCTION;
        p.payWindow = 3 days;
        p.gracePeriod = 2 days;
        p.revealWindow = 1 days;
        p.commissionBps = 500;
        p.maxDiscountBps = 3000;
        p.lateFeeBps = 200;
        p.forfeitBps = 1000;
        vm.prank(foreman);
        fund = new ChitFund(p, m);
        for (uint256 i; i < 5; ++i) {
            token.mint(m[i], 500_000_00);
            vm.startPrank(m[i]);
            token.approve(address(fund), type(uint256).max);
            fund.enroll();
            vm.stopPrank();
        }
        handler = new ChitHandler(fund, token, m, foreman);
        targetContract(address(handler));
    }

    /// Conservation: the fund always holds exactly what it owes.
    function invariant_conservation() public view {
        assertEq(token.balanceOf(address(fund)), fund.totalOwed());
    }

    /// Each member wins at most once, and all N win once the fund is finished
    /// unless excluded for default.
    function invariant_eachWinsAtMostOnce() public view {
        for (uint256 i; i < 5; ++i) assertLe(handler.winCount(m[i]), 1);
        if (fund.finalized()) {
            for (uint256 i; i < 5; ++i) {
                (, bool ex,,,,) = fund.stateOf(m[i]);
                assertEq(handler.winCount(m[i]), ex ? 0 : 1);
            }
        }
    }

    /// Foreman fee never above 5% of a round pot; excluded members never win.
    function invariant_feeCapAndExclusion() public view {
        assertFalse(handler.feeCapBroken());
        assertFalse(handler.excludedWon());
        assertLe(fund.foremanCredit() * 10_000, 5 * (5 * 5_000_00) * 500);
    }
}
