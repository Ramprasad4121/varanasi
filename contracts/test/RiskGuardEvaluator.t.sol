// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {RiskGuardEvaluator} from "../src/RiskGuardEvaluator.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract RiskGuardEvaluatorTest is Test {
    AgenticCommerce acp;
    RiskGuardEvaluator ev;
    MockERC20 usdc;
    address client = address(0xC1);
    address provider = address(0xB0);
    address treasury = address(0x7E);
    address owner = address(0x0A);
    address relayer = address(0x5E1A);
    uint256 signerKey = 0xA11CE;
    address signer;
    uint256 constant BUDGET = 1_000e6;
    bytes32 constant DELIV = keccak256("poc-file-bytes");
    bytes32 constant LOGS = keccak256("run-logs");

    function setUp() public {
        signer = vm.addr(signerKey);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        acp = new AgenticCommerce(IERC20(address(usdc)), treasury, 100);
        address[] memory s = new address[](1);
        s[0] = signer;
        ev = new RiskGuardEvaluator(acp, owner, s);
        usdc.mint(client, 100_000e6);
        vm.prank(client);
        usdc.approve(address(acp), type(uint256).max);
    }

    function _job(address evaluator) internal returns (uint256 id) {
        vm.startPrank(client);
        id = acp.createJob(provider, evaluator, block.timestamp + 1 days, "PoC: invariant solvency", address(0));
        acp.setBudget(id, BUDGET, "");
        acp.fund(id, BUDGET, "");
        vm.stopPrank();
    }

    function _submitted() internal returns (uint256 id) {
        id = _job(address(ev));
        vm.prank(provider);
        acp.submit(id, DELIV, "");
    }

    function _sign(uint256 key, uint256 jobId, bytes32 d, bool pass, bytes32 logs) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, ev.verdictDigest(jobId, d, pass, logs));
        return abi.encodePacked(r, s, v);
    }

    function test_digestMatchesManualEip712() public view {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Varanasi RiskGuardEvaluator"),
                keccak256("1"),
                block.chainid,
                address(ev)
            )
        );
        bytes32 sh = keccak256(abi.encode(ev.VERDICT_TYPEHASH(), uint256(7), DELIV, true, LOGS));
        assertEq(ev.verdictDigest(7, DELIV, true, LOGS), keccak256(abi.encodePacked("\x19\x01", domain, sh)));
        assertEq(ev.domainSeparator(), domain);
    }

    function test_pass_paysProvider_anyRelayer() public {
        uint256 id = _submitted();
        bytes memory sig = _sign(signerKey, id, DELIV, true, LOGS);
        vm.prank(relayer);
        ev.settle(id, DELIV, true, LOGS, sig);
        assertEq(usdc.balanceOf(provider), 990e6);
        assertEq(usdc.balanceOf(treasury), 10e6);
        assertEq(uint8(acp.getJob(id).status), uint8(AgenticCommerce.Status.Completed));
        RiskGuardEvaluator.Settlement memory st = ev.settlementOf(id);
        assertTrue(st.settled && st.pass);
        assertEq(st.signer, signer);
        assertEq(st.logsHash, LOGS);
    }

    function test_fail_refundsClient() public {
        uint256 id = _submitted();
        uint256 before = usdc.balanceOf(client);
        ev.settle(id, DELIV, false, LOGS, _sign(signerKey, id, DELIV, false, LOGS));
        assertEq(usdc.balanceOf(client), before + BUDGET);
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(uint8(acp.getJob(id).status), uint8(AgenticCommerce.Status.Rejected));
    }

    function test_cannotFlipFailToPass() public {
        uint256 id = _submitted();
        ev.settle(id, DELIV, false, LOGS, _sign(signerKey, id, DELIV, false, LOGS));
        bytes memory passSig = _sign(signerKey, id, DELIV, true, LOGS);
        vm.expectRevert(abi.encodeWithSelector(RiskGuardEvaluator.AlreadySettled.selector, id));
        ev.settle(id, DELIV, true, LOGS, passSig);
    }

    function test_cannotReplaySameVerdict() public {
        uint256 id = _submitted();
        bytes memory sig = _sign(signerKey, id, DELIV, true, LOGS);
        ev.settle(id, DELIV, true, LOGS, sig);
        vm.expectRevert(abi.encodeWithSelector(RiskGuardEvaluator.AlreadySettled.selector, id));
        ev.settle(id, DELIV, true, LOGS, sig);
    }

    function test_verdictForOtherJob_rejected() public {
        uint256 a = _submitted();
        uint256 b = _submitted();
        bytes memory sigA = _sign(signerKey, a, DELIV, true, LOGS);
        vm.expectRevert(); // recovers a different (non-allowlisted) address
        ev.settle(b, DELIV, true, LOGS, sigA);
        // and a's sig still works for a
        ev.settle(a, DELIV, true, LOGS, sigA);
    }

    function test_deliverableMismatch_reverts() public {
        uint256 id = _submitted();
        bytes32 other = keccak256("different poc");
        bytes memory sig = _sign(signerKey, id, other, true, LOGS);
        vm.expectRevert(abi.encodeWithSelector(RiskGuardEvaluator.DeliverableMismatch.selector, DELIV, other));
        ev.settle(id, other, true, LOGS, sig);
    }

    function test_tamperedFields_revert() public {
        uint256 id = _submitted();
        bytes memory failSig = _sign(signerKey, id, DELIV, false, LOGS);
        vm.expectRevert(); // flipped pass bit -> different digest -> unknown signer
        ev.settle(id, DELIV, true, LOGS, failSig);
        vm.expectRevert(); // swapped logsHash
        ev.settle(id, DELIV, false, keccak256("other logs"), failSig);
    }

    function test_unknownSigner_reverts() public {
        uint256 id = _submitted();
        uint256 evil = 0xBAD;
        bytes memory sig = _sign(evil, id, DELIV, true, LOGS);
        vm.expectRevert(abi.encodeWithSelector(RiskGuardEvaluator.UnknownSigner.selector, vm.addr(evil)));
        ev.settle(id, DELIV, true, LOGS, sig);
    }

    function test_removedSigner_reverts() public {
        uint256 id = _submitted();
        vm.prank(owner);
        ev.setSigner(signer, false);
        bytes memory sig = _sign(signerKey, id, DELIV, true, LOGS);
        vm.expectRevert(abi.encodeWithSelector(RiskGuardEvaluator.UnknownSigner.selector, signer));
        ev.settle(id, DELIV, true, LOGS, sig);
    }

    function test_malformedSignature_reverts() public {
        uint256 id = _submitted();
        vm.expectRevert();
        ev.settle(id, DELIV, true, LOGS, hex"1234");
    }

    function test_notSubmitted_reverts() public {
        uint256 id = _job(address(ev)); // funded, not submitted
        bytes memory sig = _sign(signerKey, id, bytes32(0), true, LOGS);
        vm.expectRevert(
            abi.encodeWithSelector(RiskGuardEvaluator.JobNotSubmitted.selector, AgenticCommerce.Status.Funded)
        );
        ev.settle(id, bytes32(0), true, LOGS, sig);
    }

    function test_jobWithOtherEvaluator_reverts() public {
        uint256 id = _job(address(0xE7));
        vm.prank(provider);
        acp.submit(id, DELIV, "");
        bytes memory sig = _sign(signerKey, id, DELIV, true, LOGS);
        vm.expectRevert(RiskGuardEvaluator.NotEvaluatorForJob.selector);
        ev.settle(id, DELIV, true, LOGS, sig);
    }

    function test_expiredRefundedJob_cannotSettle() public {
        uint256 id = _submitted();
        vm.warp(block.timestamp + 2 days);
        acp.claimRefund(id);
        bytes memory sig = _sign(signerKey, id, DELIV, true, LOGS);
        vm.expectRevert(
            abi.encodeWithSelector(RiskGuardEvaluator.JobNotSubmitted.selector, AgenticCommerce.Status.Expired)
        );
        ev.settle(id, DELIV, true, LOGS, sig);
    }

    function test_evaluatorAddressCannotBeBypassed_directComplete() public {
        uint256 id = _submitted();
        vm.prank(relayer);
        vm.expectRevert(AgenticCommerce.NotAuthorized.selector);
        acp.complete(id, bytes32(0), "");
    }

    function test_crossDeploymentReplay_rejected() public {
        // same commerce, second evaluator with the same signer: a verdict signed for ev is useless on ev2
        address[] memory s = new address[](1);
        s[0] = signer;
        RiskGuardEvaluator ev2 = new RiskGuardEvaluator(acp, owner, s);
        vm.startPrank(client);
        uint256 id = acp.createJob(provider, address(ev2), block.timestamp + 1 days, "x", address(0));
        acp.setBudget(id, BUDGET, "");
        acp.fund(id, BUDGET, "");
        vm.stopPrank();
        vm.prank(provider);
        acp.submit(id, DELIV, "");
        bytes memory sigForEv = _sign(signerKey, id, DELIV, true, LOGS);
        vm.expectRevert();
        ev2.settle(id, DELIV, true, LOGS, sigForEv);
    }

    function test_admin_onlyOwner_and_twoStepOwnership() public {
        vm.expectRevert(RiskGuardEvaluator.NotOwner.selector);
        ev.setSigner(address(0xDEAD), true);
        vm.prank(owner);
        ev.transferOwnership(address(0xB055));
        vm.expectRevert(RiskGuardEvaluator.NotOwner.selector);
        ev.acceptOwnership();
        vm.prank(address(0xB055));
        ev.acceptOwnership();
        assertEq(ev.owner(), address(0xB055));
        vm.prank(address(0xB055));
        ev.setSigner(address(0xDEAD), true);
        assertTrue(ev.isSigner(address(0xDEAD)));
    }

    function test_constructor_badParams() public {
        address[] memory s = new address[](1);
        vm.expectRevert(RiskGuardEvaluator.BadParam.selector);
        new RiskGuardEvaluator(acp, owner, s); // zero signer
        vm.expectRevert(RiskGuardEvaluator.BadParam.selector);
        new RiskGuardEvaluator(AgenticCommerce(address(0)), owner, new address[](0));
    }

    /// fuzz: any verdict not signed by the allowlisted key over exactly these fields never settles
    function testFuzz_onlyExactSignedVerdictSettles(uint256 key, bytes32 d, bool pass, bytes32 logs) public {
        key = bound(key, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);
        vm.assume(key != signerKey);
        uint256 id = _submitted();
        bytes memory sig = _sign(key, id, DELIV, pass, logs);
        vm.expectRevert();
        ev.settle(id, DELIV, pass, logs, sig);
        if (d != DELIV) {
            bytes memory good = _sign(signerKey, id, d, pass, logs);
            vm.expectRevert();
            ev.settle(id, d, pass, logs, good);
        }
        ev.settle(id, DELIV, pass, logs, _sign(signerKey, id, DELIV, pass, logs));
        assertTrue(ev.settlementOf(id).settled);
    }
}
