// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {FinancialReputation} from "../../src/finance/FinancialReputation.sol";
import {RiskGuard} from "../../src/RiskGuard.sol";
import {AegisRegistry} from "../../src/AegisRegistry.sol";

/// @title FinancialReputationTest — scoring, flags, per-record access + RiskGuard hook
/// @author Ramprasad
contract FinancialReputationTest is Test {
    FinancialReputation rep;
    RiskGuard guard;
    AegisRegistry registry;

    address admin = address(0x0000ad11);
    address recorder = address(0x0000abcd);
    address rogue = address(0x000050a1);
    address agent = address(0x0000a6e4);
    address human = address(0x0000aa4a);

    function setUp() public {
        vm.prank(admin);
        rep = new FinancialReputation(admin);

        vm.prank(human);
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        guard = new RiskGuard(address(registry));
        // Mint an identity for the agent so RiskGuard sees a live agent.
        vm.prank(human);
        registry.mintAgent("fin-agent", agent, 30);
    }

    function test_OnlyRecorderCanRecord() public {
        vm.prank(rogue);
        vm.expectRevert(abi.encodeWithSelector(FinancialReputation.RepoNotAuthorized.selector, rogue));
        rep.recordRepayment(rogue, 100e18, true, keccak256("x"));
    }

    function test_GoodHistoryScoresAboveNeutral() public {
        vm.prank(admin);
        rep.authorizeRecorder(recorder);
        vm.startPrank(recorder);
        rep.recordRepayment(agent, 100e18, true, keccak256("r1"));
        rep.recordRepayment(agent, 100e18, true, keccak256("r2"));
        rep.recordContribution(agent, 100e18, keccak256("c1"));
        rep.recordChitRound(agent, true, keccak256("chit1"));
        vm.stopPrank();

        uint256 score = rep.creditScoreBps(agent);
        assertGt(score, 5_000);
        assertLe(score, 10_000);
    }

    function test_DefaultDragsScoreBelowNeutral() public {
        vm.prank(admin);
        rep.authorizeRecorder(recorder);
        vm.startPrank(recorder);
        rep.recordDefault(agent, 500e18, keccak256("d1"));
        rep.recordRepayment(agent, 100e18, true, keccak256("r1"));
        vm.stopPrank();

        uint256 score = rep.creditScoreBps(agent);
        assertLt(score, 5_000);
        assertTrue(rep.isFlagged(agent));
        assertEq(rep.riskScoreBps(agent), 10_000 - score);
    }

    function test_NoHistoryIsNeutralAndNotFlagged() public {
        assertEq(rep.creditScoreBps(agent), 5_000);
        assertFalse(rep.isFlagged(agent));
        assertFalse(rep.hasHistory(agent));
    }

    function test_FlaggedAgentBlockedByRiskGuardHook() public {
        vm.prank(admin);
        rep.authorizeRecorder(recorder);
        vm.prank(recorder);
        rep.recordDefault(agent, 100e18, keccak256("d1"));

        // Wire the reputation oracle into RiskGuard.
        guard.setReputation(address(rep));
        guard.setMaxReputationRiskBps(5_000);

        // Agent carries a red flag -> blocked even with a clean LLM score.
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.FlaggedAgent.selector, agent));
        guard.authorize(agent, 100, 500);
    }

    function test_CleanRepoNotFlaggedHookDoesNotBlock() public {
        vm.prank(admin);
        rep.authorizeRecorder(recorder);
        vm.prank(recorder);
        rep.recordRepayment(agent, 100e18, true, keccak256("r1"));

        guard.setReputation(address(rep));
        guard.setMaxReputationRiskBps(5_000);

        assertTrue(guard.authorize(agent, 100, 500));
    }

    function test_ReputationRiskOverCapBlocks() public {
        vm.prank(admin);
        rep.authorizeRecorder(recorder);
        vm.startPrank(recorder);
        rep.recordRepayment(agent, 100e18, false, keccak256("late"));
        rep.recordRepayment(agent, 100e18, false, keccak256("late2"));
        rep.recordContribution(agent, 100e18, keccak256("c1"));
        vm.stopPrank();

        guard.setReputation(address(rep));
        guard.setMaxReputationRiskBps(1); // very strict

        vm.expectRevert();
        guard.authorize(agent, 100, 500);
    }

    function test_WithoutHookBehaviorUnchanged() public {
        assertTrue(guard.authorize(agent, 100, 500));

        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, uint256(600), uint256(500)));
        guard.authorize(agent, 600, 500);
    }

    function test_OnlyOwnerGovernsRecorders() public {
        vm.prank(rogue);
        vm.expectRevert();
        rep.authorizeRecorder(recorder);
        vm.prank(rogue);
        vm.expectRevert();
        rep.revokeRecorder(recorder);
    }
}