// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ChitPool} from "../../src/finance/ChitPool.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @title ChitPoolAuditTest: regression tests for the Oct 9 2026 ChitPool audit.
/// @dev Each test was written to FAIL against the pre-audit ChitPool and pass
///      after the fix. See docs/REVIEW_LOG.md (chit audit) for the findings.
contract ChitPoolAuditTest is Test {
    ChitPool pool;
    MockERC20 token;

    address starter = address(0x5747);
    address bob = address(0x0000b0bb);
    address carol = address(0x0000ca7e);
    address dave = address(0x0000dae7);
    address[3] private m;

    uint256 constant C = 1_000e18;
    uint256 constant DURATION = 7 days;

    event ChitRoundSettled(uint256 indexed round, address indexed winner, uint256 corpus, uint256 contributed);

    function setUp() public {
        m[0] = bob;
        m[1] = carol;
        m[2] = dave;
        token = new MockERC20("USDM", "USDM", 18);
        pool = new ChitPool(starter, address(token), C, 3, 3, DURATION);
        for (uint256 i; i < 3; ++i) {
            token.mint(m[i], C * 10);
            vm.prank(m[i]);
            token.approve(address(pool), type(uint256).max);
        }
    }

    function _joinAll() internal {
        for (uint256 i; i < 3; ++i) {
            vm.prank(m[i]);
            pool.join();
        }
    }

    function _pay(address who) internal {
        vm.prank(who);
        pool.contribute();
    }

    /// CRITICAL (foreman rug): terminate() used to sweep every token in the pool
    /// to the starter, including the open round's member contributions.
    function test_Audit_TerminateRefundsContributorsNotStarter() public {
        _joinAll();
        _pay(bob);
        _pay(carol);
        vm.prank(starter);
        pool.terminate();
        assertEq(token.balanceOf(starter), 0, "starter took member funds");
        assertEq(token.balanceOf(bob), C * 10, "bob not refunded");
        assertEq(token.balanceOf(carol), C * 10, "carol not refunded");
        assertEq(token.balanceOf(address(pool)), 0);
    }

    /// HIGH (win twice): when the slot member misses, the scan hands the pot to the
    /// next contributor even if that contributor already won.
    function test_Audit_NoMemberWinsTwice() public {
        // via_ir may re-read block.timestamp after vm.warp: track time as literals.
        uint256 t = 1;
        _joinAll();
        // Round 1: carol misses; slot 0 = bob wins.
        _pay(bob);
        _pay(dave);
        t += DURATION + 1;
        vm.warp(t);
        pool.settleRound();
        // Round 2: carol misses again; slot 1 = carol skipped, dave wins.
        _pay(bob);
        _pay(dave);
        t += DURATION + 1;
        vm.warp(t);
        pool.settleRound();
        // Round 3: only past winners pay. Nobody eligible may win again.
        _pay(bob);
        _pay(dave);
        uint256 bobBefore = token.balanceOf(bob);
        uint256 daveBefore = token.balanceOf(dave);
        t += DURATION + 1;
        vm.warp(t);
        pool.settleRound();
        // Both get their round 3 contribution back, nobody collects 2C.
        assertEq(token.balanceOf(bob), bobBefore + C, "bob");
        assertEq(token.balanceOf(dave), daveBefore + C, "dave");
        assertEq(token.balanceOf(address(pool)), 0);
    }

    /// MEDIUM (stuck pool): a round where nobody pays reverted forever
    /// (ChitNoContributors) while contribute() also reverts after the deadline.
    function test_Audit_EmptyRoundAdvances() public {
        _joinAll();
        vm.warp(block.timestamp + DURATION + 1);
        pool.settleRound();
        assertEq(pool.round(), 2);
        assertEq(pool.missedRounds(bob), 1);
    }

    /// HIGH (config): more rounds than members guarantees repeat winners.
    function test_Audit_RoundsCannotExceedCapacity() public {
        vm.expectRevert();
        new ChitPool(starter, address(token), C, 3, 4, DURATION);
    }

    /// MEDIUM (rotation): settling before the group is full lets the first joiners
    /// split pots and late joiners reshuffle the rotation.
    function test_Audit_SettleNeedsFullPool() public {
        vm.prank(bob);
        pool.join();
        vm.prank(carol);
        pool.join();
        _pay(bob);
        _pay(carol);
        vm.warp(block.timestamp + DURATION + 1);
        vm.expectRevert();
        pool.settleRound();
    }

    /// MEDIUM: round 1 deadline ran from construction, so a pool that filled late
    /// could never take a round 1 contribution. The deadline now starts when full.
    function test_Audit_Round1ClockStartsWhenFull() public {
        // Literal time: via_ir may re-read block.timestamp after vm.warp.
        uint256 t = 1 + DURATION + 1;
        vm.warp(t);
        _joinAll();
        _pay(bob);
        assertEq(pool.roundDeadline(), t + DURATION);
    }
}
