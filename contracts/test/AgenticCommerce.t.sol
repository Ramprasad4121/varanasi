// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {IACPHook} from "../src/interfaces/IACPHook.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract BlockingHook is IACPHook {
    bool public blockAll;
    function setBlock(bool b) external { blockAll = b; }
    function beforeAction(uint256, bytes4, bytes calldata) external view { require(!blockAll, "blocked"); }
    function afterAction(uint256, bytes4, bytes calldata) external {}
}

contract AgenticCommerceTest is Test {
    AgenticCommerce acp;
    MockERC20 usdc;
    address client = address(0xC1);
    address provider = address(0xB0);
    address evaluator = address(0xE7);
    address treasury = address(0x7E);
    uint256 constant BUDGET = 1_000e6;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        acp = new AgenticCommerce(IERC20(address(usdc)), treasury, 100); // 1%
        usdc.mint(client, 10_000e6);
        vm.prank(client);
        usdc.approve(address(acp), type(uint256).max);
    }

    function _funded(address hook) internal returns (uint256 id) {
        vm.startPrank(client);
        id = acp.createJob(provider, evaluator, block.timestamp + 1 days, "PoC for invariant X", hook);
        acp.setBudget(id, BUDGET, "");
        acp.fund(id, BUDGET, "");
        vm.stopPrank();
    }

    function test_happyPath_paysProviderMinusFee() public {
        uint256 id = _funded(address(0));
        vm.prank(provider);
        acp.submit(id, keccak256("deliverable"), "");
        vm.prank(evaluator);
        acp.complete(id, bytes32("pass"), "");
        assertEq(usdc.balanceOf(provider), 990e6);
        assertEq(usdc.balanceOf(treasury), 10e6);
        assertEq(uint8(acp.getJob(id).status), uint8(AgenticCommerce.Status.Completed));
    }

    function test_evaluatorReject_refundsClientNoFee() public {
        uint256 id = _funded(address(0));
        vm.prank(provider);
        acp.submit(id, keccak256("bad"), "");
        uint256 before = usdc.balanceOf(client);
        vm.prank(evaluator);
        acp.reject(id, bytes32("fail"), "");
        assertEq(usdc.balanceOf(client), before + BUDGET);
        assertEq(usdc.balanceOf(treasury), 0);
    }

    function test_fund_revertsOnBudgetMismatch() public {
        vm.startPrank(client);
        uint256 id = acp.createJob(provider, evaluator, block.timestamp + 1 days, "x", address(0));
        acp.setBudget(id, BUDGET, "");
        vm.expectRevert(abi.encodeWithSelector(AgenticCommerce.BudgetMismatch.selector, BUDGET, BUDGET - 1));
        acp.fund(id, BUDGET - 1, "");
        vm.stopPrank();
    }

    function test_providerFrontrunBudget_blockedByExpectedBudget() public {
        vm.prank(client);
        uint256 id = acp.createJob(provider, evaluator, block.timestamp + 1 days, "x", address(0));
        vm.prank(client);
        acp.setBudget(id, BUDGET, "");
        vm.prank(provider);
        acp.setBudget(id, BUDGET * 5, "");
        vm.prank(client);
        vm.expectRevert();
        acp.fund(id, BUDGET, "");
    }

    function test_onlyEvaluatorCompletes() public {
        uint256 id = _funded(address(0));
        vm.prank(provider);
        acp.submit(id, keccak256("d"), "");
        vm.prank(provider);
        vm.expectRevert(AgenticCommerce.NotAuthorized.selector);
        acp.complete(id, bytes32("pass"), "");
        vm.prank(client);
        vm.expectRevert(AgenticCommerce.NotAuthorized.selector);
        acp.complete(id, bytes32("pass"), "");
    }

    function test_claimRefund_afterExpiry_evenIfHookBlocks() public {
        BlockingHook hook = new BlockingHook();
        uint256 id = _funded(address(hook));
        hook.setBlock(true);
        vm.warp(block.timestamp + 1 days);
        uint256 before = usdc.balanceOf(client);
        acp.claimRefund(id);
        assertEq(usdc.balanceOf(client), before + BUDGET);
    }

    function test_claimRefund_beforeExpiry_reverts() public {
        uint256 id = _funded(address(0));
        vm.expectRevert(AgenticCommerce.NotExpired.selector);
        acp.claimRefund(id);
    }

    function test_hookCanBlockActions() public {
        BlockingHook hook = new BlockingHook();
        hook.setBlock(true);
        vm.startPrank(client);
        uint256 id = acp.createJob(provider, evaluator, block.timestamp + 1 days, "x", address(hook));
        vm.expectRevert(bytes("blocked"));
        acp.setBudget(id, BUDGET, "");
        vm.stopPrank();
    }

    function test_submitAfterExpiry_reverts() public {
        uint256 id = _funded(address(0));
        vm.warp(block.timestamp + 1 days);
        vm.prank(provider);
        vm.expectRevert(AgenticCommerce.Expired_.selector);
        acp.submit(id, keccak256("late"), "");
    }

    function test_noDoubleSettle() public {
        uint256 id = _funded(address(0));
        vm.prank(provider);
        acp.submit(id, keccak256("d"), "");
        vm.prank(evaluator);
        acp.complete(id, bytes32("pass"), "");
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert();
        acp.claimRefund(id);
        vm.prank(evaluator);
        vm.expectRevert();
        acp.reject(id, bytes32("x"), "");
    }

    function testFuzz_feeConservesFunds(uint96 budget) public {
        vm.assume(budget > 0 && budget <= 10_000e6);
        vm.startPrank(client);
        uint256 id = acp.createJob(provider, evaluator, block.timestamp + 1 days, "x", address(0));
        acp.setBudget(id, budget, "");
        acp.fund(id, budget, "");
        vm.stopPrank();
        vm.prank(provider);
        acp.submit(id, keccak256("d"), "");
        vm.prank(evaluator);
        acp.complete(id, bytes32("pass"), "");
        assertEq(usdc.balanceOf(provider) + usdc.balanceOf(treasury), budget);
        assertLe(usdc.balanceOf(treasury), uint256(budget) / 100 + 1);
    }
}
