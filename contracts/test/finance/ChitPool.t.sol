// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ChitPool} from "../../src/finance/ChitPool.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @title ChitPoolTest — membership, contributions, deterministic settlement, termination
/// @author Ramprasad
contract ChitPoolTest is Test {
    ChitPool pool;
    MockERC20 token;

    address bob = address(0x0000b0bb);
    address carol = address(0x0000ca7e);
    address dave = address(0x0000dae7);
    address stranger = address(0x0000aadd);

    address[3] private members;

    uint256 constant CONTRIB = 1_000e18;
    uint256 constant CAPACITY = 3;
    uint256 constant ROUNDS = 3;
    uint256 constant DURATION = 7 days;

    event ChitRoundSettled(uint256 indexed round, address indexed winner, uint256 corpus, uint256 contributed);
    event ChitMissed(address indexed member, uint256 indexed round);

    function setUp() public {
        members[0] = bob;
        members[1] = carol;
        members[2] = dave;

        token = new MockERC20("USDM", "USDM", 18);
        pool = new ChitPool(address(this), address(token), CONTRIB, CAPACITY, ROUNDS, DURATION);
        for (uint256 i; i < 3; ++i) {
            token.mint(members[i], CONTRIB * ROUNDS * 2);
            vm.startPrank(members[i]);
            token.approve(address(pool), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _joinAll() public {
        for (uint256 i; i < 3; ++i) {
            vm.prank(members[i]);
            pool.join();
        }
    }

    function _contributeAll() public {
        for (uint256 i; i < 3; ++i) {
            vm.prank(members[i]);
            pool.contribute();
        }
    }

    function test_MembershipFullRejects() public {
        _joinAll();
        vm.prank(stranger);
        vm.expectRevert(ChitPool.ChitFull.selector);
        pool.join();
    }

    function test_ContributeRequiresMembershipAndOncePerRound() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ChitPool.ChitNotMember.selector, stranger));
        pool.contribute();

        vm.prank(bob);
        pool.join();
        vm.prank(bob);
        pool.contribute();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ChitPool.ChitAlreadyContributed.selector, bob, 1));
        pool.contribute();
    }

    function test_DeterministicRoundWinnerRotation() public {
        _joinAll();

        for (uint256 r = 1; r <= ROUNDS; ++r) {
            address expected = members[(r - 1) % 3];
            uint256 before = token.balanceOf(expected);
            _contributeAll();
            vm.prank(address(this));
            vm.expectEmit(true, true, false, false);
            emit ChitRoundSettled(r, expected, 3 * CONTRIB, 3);
            pool.settleRound();
            // Winner wins the corpus but also paid the contribution: net +2*CONTRIB.
            assertEq(token.balanceOf(expected), before + 2 * CONTRIB);
        }
        assertTrue(pool.poolEnded());
        assertEq(pool.settledRounds(), ROUNDS);
        // Contract must hold nothing extra.
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_MissedMemberIsRecordedAndDoesNotWin() public {
        _joinAll();
        // Bob + dave contribute, carol misses round 1.
        vm.prank(bob);
        pool.contribute();
        vm.prank(dave);
        pool.contribute();

        // Winner slot round 1 = bob; carol marked missed after the deadline.
        vm.warp(block.timestamp + DURATION + 1);
        vm.expectEmit(true, true, false, false);
        emit ChitMissed(carol, 1);
        vm.expectEmit(true, true, false, false);
        emit ChitRoundSettled(1, bob, 2 * CONTRIB, 2);
        pool.settleRound();
        assertEq(pool.missedRounds(carol), 1);

        // Round 2: everyone contributes; winner = carol (slot (2-1)%3).
        _contributeAll();
        vm.prank(address(this));
        pool.settleRound();
        assertEq(token.balanceOf(carol), 2 * CONTRIB * ROUNDS - CONTRIB + 3 * CONTRIB); // paid then won round 2 corpus
    }

    function test_RevertSettleTooEarlyThenSettleAfterDeadline() public {
        _joinAll();
        vm.prank(bob);
        pool.contribute();
        vm.prank(carol);
        pool.contribute();

        // Not all contributed and deadline not passed -> cannot settle.
        vm.prank(address(this));
        vm.expectRevert();
        pool.settleRound();

        // After the deadline anyone may settle.
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(dave);
        pool.settleRound();
        assertEq(pool.settledRounds(), 1);
        assertEq(pool.missedRounds(dave), 1);
    }

    function test_TerminateOnlyStarter() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ChitPool.ChitNotStarter.selector, bob));
        pool.terminate();

        vm.prank(address(this));
        pool.terminate();
        assertTrue(pool.poolEnded());
    }

    function test_PoolEndsAfterLastRound() public {
        _joinAll();
        for (uint256 r; r < ROUNDS; ++r) {
            _contributeAll();
            vm.prank(address(this));
            pool.settleRound();
        }
        vm.prank(bob);
        vm.expectRevert(ChitPool.ChitPoolEnded.selector);
        pool.contribute();
        assertTrue(pool.poolEnded());
    }
}