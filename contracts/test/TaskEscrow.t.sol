// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Minimal ERC20 that reenters TaskEscrow.release inside transfer.
/// @dev Used ONLY as the T16 reentrancy probe. transferFrom stays benign so
///      fund() succeeds; transfer() attempts one reentrant release, which must
///      fail (nonReentrant + CEI), recorded via reentriesBlocked.
contract ReentrantERC20 {
    TaskEscrow public escrow;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;
    bytes32 public target;
    bool public armed;
    uint256 public reentriesBlocked;

    function configure(address _escrow) external {
        escrow = TaskEscrow(_escrow);
    }

    function mint(address to, uint256 amount) external {
        balances[to] += amount;
    }

    function balanceOf(address a) external view returns (uint256) {
        return balances[a];
    }

    function allowance(address o, address s) external view returns (uint256) {
        return allowances[o][s];
    }

    function approve(address s, uint256 amount) external returns (bool) {
        allowances[msg.sender][s] = amount;
        return true;
    }

    function arm(bytes32 taskId) external {
        target = taskId;
        armed = true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balances[msg.sender] -= amount;
        balances[to] += amount;
        if (armed) {
            armed = false;
            try escrow.release(target) {} catch {
                reentriesBlocked += 1;
            }
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowances[from][msg.sender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;
        return true;
    }
}

/// @title TaskEscrowTest — locked test matrix T1-T17 (+ forge side of T18)
/// @author Ramprasad
/// @notice T18 (TS sign/verify), T19 (TS client vs anvil), T20 (Sepolia E2E)
///         live outside Foundry per the eng review worktree plan; the EIP-712
///         round-trip / tamper / wrong-chain cases below are their onchain
///         counterparts (T3, tamper, round-trip).
contract TaskEscrowTest is Test {
    AegisRegistry registry;
    RiskGuard guard;
    TaskEscrow escrow;
    MockERC20 usdc;

    uint256 payerKey = 424242;
    address payer;
    address agent = address(0xA6E17);
    address merchant = address(0x4E2C4);
    address validator = address(0x8A11DA702);
    address validator2 = address(0x8A11DA703);
    address stranger = address(0xDEAD);

    uint256 constant CAP = 1_000_000; // 1 USDC (6dp)
    uint256 constant THRESHOLD = 5_000;
    uint256 constant PASS_SCORE = 8_000;
    uint256 constant FAIL_SCORE = 4_000;

    uint256 nonceSeq;
    uint256 agentTokenId;

    event TaskFunded(
        bytes32 indexed taskId,
        address indexed payer_,
        address indexed agent_,
        address merchant_,
        address token_,
        uint256 amount,
        uint64 expiry,
        uint256 nonce
    );
    event ValidationSubmitted(bytes32 indexed taskId, address indexed validator_, uint256 scoreBps);
    event TaskReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event TaskRefunded(bytes32 indexed taskId, address indexed payer_, uint256 amount);
    event TaskCancelled(bytes32 indexed taskId, address indexed payer_, uint256 amount);

    function setUp() public {
        payer = vm.addr(payerKey);
        // Mock mode: ENS addresses unset → offline-friendly.
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        guard = new RiskGuard(address(registry));
        escrow = new TaskEscrow(address(guard), THRESHOLD);
        escrow.setValidator(validator, true);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(payer, 100_000_000);

        // Payer pre-approves the escrow (agent-executed fund pulls from payer).
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);

        // Live identity for the agent (test contract = registry owner + minter).
        agentTokenId = registry.mintAgent("escrow-agent", agent, 30);
    }

    // ── helpers ──

    function _mandate() internal returns (TaskEscrow.Mandate memory m) {
        m.agent = agent;
        m.merchant = merchant;
        m.token = address(usdc);
        m.cap = CAP;
        m.windowStart = uint64(block.timestamp);
        m.windowEnd = uint64(block.timestamp + 1 days);
        m.expiry = uint64(block.timestamp + 2 days);
        m.nonce = ++nonceSeq;
        m.chainId = block.chainid;
    }

    function _sign(TaskEscrow.Mandate memory m, uint256 key) internal returns (bytes memory) {
        bytes32 digest = escrow.mandateDigest(m);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Permissionless submission by a third party (agent executes, payer signed).
    function _fund() internal returns (bytes32 taskId, TaskEscrow.Mandate memory m) {
        m = _mandate();
        taskId = escrow.fund(m, _sign(m, payerKey));
    }

    function _fundValidated(uint256 score) internal returns (bytes32 taskId) {
        (taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, score);
    }

    // ── T1: fund happy ──

    function test_T01_FundHappy() public {
        TaskEscrow.Mandate memory m = _mandate();
        bytes32 expectedId = escrow.mandateTaskId(m);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.expectEmit(true, true, true, true);
        emit TaskFunded(expectedId, payer, agent, merchant, address(usdc), CAP, m.expiry, m.nonce);
        bytes32 taskId = escrow.fund(m, _sign(m, payerKey));

        assertEq(taskId, expectedId);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Funded));
        assertEq(usdc.balanceOf(address(escrow)), CAP);
        assertEq(usdc.balanceOf(payer), payerBefore - CAP);
        assertTrue(escrow.usedNonce(payer, m.nonce));
    }

    function test_T01_DistinctNoncesDistinctTasks() public {
        (bytes32 id1,) = _fund();
        (bytes32 id2,) = _fund();
        assertTrue(id1 != id2);
        assertEq(uint8(escrow.taskState(id2)), uint8(TaskEscrow.State.Funded));
    }

    // ── T2: replay same mandate ──

    function test_T02_ReplaySameNonceReverts() public {
        TaskEscrow.Mandate memory m = _mandate();
        bytes memory sig = _sign(m, payerKey);
        escrow.fund(m, sig);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NonceUsed.selector, payer, m.nonce));
        escrow.fund(m, sig);
    }

    // ── T3: cross-chain / cross-deploy replay ──

    function test_T03a_WrongChainIdFieldReverts() public {
        TaskEscrow.Mandate memory m = _mandate();
        m.chainId = block.chainid + 1;
        bytes memory sig = _sign(m, payerKey);

        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.ChainIdMismatch.selector, m.chainId, block.chainid));
        escrow.fund(m, sig);
    }

    function test_T03b_CrossDeploySigCannotFund() public {
        TaskEscrow sibling = new TaskEscrow(address(guard), THRESHOLD);
        TaskEscrow.Mandate memory m = _mandate();
        // Signed for the SIBLING domain (different verifyingContract).
        bytes32 digest = sibling.mandateDigest(m);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Wrong-domain digest recovers to a non-approver, so the pull probe
        // fails: reverts (no fund, no nonce consumed for the payer).
        vm.expectRevert();
        escrow.fund(m, sig);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertFalse(escrow.usedNonce(payer, m.nonce));
    }

    function test_BadSig_MalformedSignatureReverts() public {
        TaskEscrow.Mandate memory m = _mandate();
        bytes memory sig = _sign(m, payerKey);
        sig[64] = bytes1(uint8(0)); // corrupt v → tryRecover reports an error
        try escrow.fund(m, sig) {
            fail("malformed sig must revert");
        } catch (bytes memory reason) {
            assertEq(bytes4(reason), TaskEscrow.BadSig.selector);
        }
    }

    // ── T4: expired mandate / bad window / zero fields / token fail ──

    function test_T04_ExpiredMandateReverts() public {
        TaskEscrow.Mandate memory m = _mandate();
        m.expiry = uint64(block.timestamp); // strict: expiry must be > now
        bytes memory sig = _sign(m, payerKey); // hoisted: expectRevert sees fund
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.MandateExpired.selector, m.expiry, block.timestamp));
        escrow.fund(m, sig);
    }

    function test_T04_BadWindowReverts() public {
        TaskEscrow.Mandate memory m = _mandate();
        m.windowStart = m.windowEnd + 1;
        bytes memory sig = _sign(m, payerKey); // hoisted: expectRevert sees fund
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.BadWindow.selector, m.windowStart, m.windowEnd));
        escrow.fund(m, sig);
    }

    function test_T04_ZeroFieldsRevert() public {
        TaskEscrow.Mandate memory m = _mandate();
        m.agent = address(0);
        bytes memory sig = _sign(m, payerKey); // hoisted
        vm.expectRevert(TaskEscrow.ZeroAgent.selector);
        escrow.fund(m, sig);

        m = _mandate();
        m.token = address(0);
        sig = _sign(m, payerKey); // hoisted
        vm.expectRevert(TaskEscrow.ZeroToken.selector);
        escrow.fund(m, sig);

        m = _mandate();
        m.cap = 0;
        sig = _sign(m, payerKey); // hoisted
        vm.expectRevert(TaskEscrow.ZeroCap.selector);
        escrow.fund(m, sig);
    }

    function test_T04_NoAllowanceRevertsTokenFail() public {
        // Separate token without any approval from the payer.
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        other.mint(payer, CAP);
        TaskEscrow.Mandate memory m = _mandate();
        m.token = address(other);
        bytes memory sig = _sign(m, payerKey); // hoisted: expectRevert sees fund
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.TokenFail.selector, address(other), payer, CAP));
        escrow.fund(m, sig);
    }

    // ── EIP-712 (forge side of T18): round-trip / tamper ──

    function test_EIP712_RoundTripDigestMatchesFund() public {
        TaskEscrow.Mandate memory m = _mandate();
        bytes32 digest = escrow.mandateDigest(m);
        // Independent recomputation: domain separator + struct hash.
        bytes32 structHash = escrow.mandateStructHash(m);
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("VaranasiTaskEscrow")),
                keccak256(bytes("1")),
                block.chainid,
                address(escrow)
            )
        );
        assertEq(digest, keccak256(abi.encodePacked(hex"1901", domain, structHash)));

        (bytes32 taskId,) = _fundWithMandate(m);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Funded));
    }

    function test_EIP712_TamperedFieldCannotFund() public {
        TaskEscrow.Mandate memory m = _mandate();
        bytes memory sig = _sign(m, payerKey);
        m.cap += 1; // tamper AFTER signing: digest mismatch recovers to a
        // non-approver, so the pull probe fails (revert, no fund).
        vm.expectRevert();
        escrow.fund(m, sig);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function _fundWithMandate(TaskEscrow.Mandate memory m) internal returns (bytes32, TaskEscrow.Mandate memory) {
        return (escrow.fund(m, _sign(m, payerKey)), m);
    }

    // ── T5: validator allowlist ──

    function test_T05_StrangerSubmitReverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NotValidator.selector, stranger));
        escrow.submitValidation(taskId, PASS_SCORE);
    }

    function test_T05_ValidatorSubmitOk() public {
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        vm.expectEmit(true, true, false, true);
        emit ValidationSubmitted(taskId, validator, PASS_SCORE);
        escrow.submitValidation(taskId, PASS_SCORE);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Validated));
    }

    // ── T6: overwrite = last-write-wins ──

    function test_T06a_OverwriteDownwardBlocksRelease() public {
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE);
        vm.prank(validator);
        escrow.submitValidation(taskId, FAIL_SCORE); // latest wins
        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.ScoreBelowThreshold.selector, taskId, FAIL_SCORE, THRESHOLD)
        );
        escrow.release(taskId);
    }

    function test_T06b_OverwriteUpwardUnblocksRelease() public {
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, FAIL_SCORE);
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE); // latest wins
        escrow.release(taskId);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Released));
    }

    // ── T7: score bound ──

    function test_T07_ScoreAbove10000Reverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.BadScore.selector, 10_001));
        escrow.submitValidation(taskId, 10_001);
    }

    function test_T07_SubmitOutsideWindowReverts() public {
        (bytes32 taskId,) = _fund();
        vm.warp(block.timestamp + 1 days + 1); // past windowEnd, before expiry
        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.OutsideWindow.selector, taskId, block.timestamp));
        escrow.submitValidation(taskId, PASS_SCORE);
    }

    // ── T8: release happy (permissionless caller) ──

    function test_T08_ReleaseHappy() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        uint256 merchantBefore = usdc.balanceOf(merchant);

        vm.prank(stranger); // anyone may settle (liveness)
        vm.expectEmit(true, true, false, true);
        emit TaskReleased(taskId, merchant, CAP);
        escrow.release(taskId);

        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Released));
        assertEq(usdc.balanceOf(merchant), merchantBefore + CAP);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_T08_ReleaseWithoutValidationReverts() public {
        (bytes32 taskId,) = _fund();
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NoValidation.selector, taskId));
        escrow.release(taskId);
    }

    // ── T9: release below threshold ──

    function test_T09_ReleaseBelowThresholdReverts() public {
        bytes32 taskId = _fundValidated(FAIL_SCORE);
        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.ScoreBelowThreshold.selector, taskId, FAIL_SCORE, THRESHOLD)
        );
        escrow.release(taskId);
        // State untouched: still VALIDATED, funds still held.
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Validated));
        assertEq(usdc.balanceOf(address(escrow)), CAP);
    }

    // ── T10/T17: revocation mid-flight + live guard re-check ──

    function test_T10_RevocationBetweenFundAndReleaseReverts() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        registry.revokeAgent(agentTokenId);

        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, agent));
        escrow.release(taskId);
    }

    function test_T17_GuardRecheckIsLiveNotEventTrust() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        // Guard passes pre-revocation (fresh read, not stored flag).
        assertTrue(guard.authorize(agent, PASS_SCORE, CAP));

        registry.revokeAgent(agentTokenId);
        // Release re-reads the guard inline: reverts, no payout.
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, agent));
        escrow.release(taskId);
        assertEq(usdc.balanceOf(merchant), 0);

        // Refund path opens strictly after expiry for the revoked task.
        vm.warp(block.timestamp + 2 days + 1);
        uint256 payerBefore = usdc.balanceOf(payer);
        escrow.refund(taskId);
        assertEq(usdc.balanceOf(payer), payerBefore + CAP);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Refunded));
    }

    // ── T11: expiry race ──

    function test_T11_ExpiryRaceReleaseRevertsRefundSucceeds() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        vm.warp(block.timestamp + 2 days + 1); // past expiry

        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.WindowExpired.selector, taskId, block.timestamp, block.timestamp - 1)
        );
        escrow.release(taskId);

        uint256 payerBefore = usdc.balanceOf(payer);
        escrow.refund(taskId);
        assertEq(usdc.balanceOf(payer), payerBefore + CAP);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Refunded));
    }

    // ── T12: early refund ──

    function test_T12_RefundBeforeExpiryReverts() public {
        (bytes32 taskId, TaskEscrow.Mandate memory m) = _fund();
        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.NotExpired.selector, taskId, block.timestamp, m.expiry)
        );
        escrow.refund(taskId);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Funded));
    }

    function test_T12_RefundAtExactExpiryStillReverts() public {
        TaskEscrow.Mandate memory m = _mandate();
        (bytes32 taskId,) = _fundWithMandate(m);
        vm.warp(m.expiry); // strict >: equality is NOT enough
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NotExpired.selector, taskId, m.expiry, m.expiry));
        escrow.refund(taskId);
    }

    // ── T13: double settle ──

    function test_T13a_ReleaseThenRefundReverts() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        escrow.release(taskId);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.AlreadySettled.selector, taskId));
        escrow.refund(taskId);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.AlreadySettled.selector, taskId));
        escrow.release(taskId);
    }

    function test_T13b_RefundTwiceReverts() public {
        (bytes32 taskId,) = _fund();
        vm.warp(block.timestamp + 2 days + 1);
        escrow.refund(taskId);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.AlreadySettled.selector, taskId));
        escrow.refund(taskId);
    }

    function test_T13c_ValidateAfterSettlementReverts() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        escrow.release(taskId);
        vm.prank(validator);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.StaleTask.selector, taskId));
        escrow.submitValidation(taskId, PASS_SCORE);
    }

    // ── T14/T15: cancel ──

    function test_T14_CancelPreValidationByPayer() public {
        (bytes32 taskId,) = _fund();
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        vm.expectEmit(true, true, false, true);
        emit TaskCancelled(taskId, payer, CAP);
        escrow.cancel(taskId);

        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Cancelled));
        assertEq(usdc.balanceOf(payer), payerBefore + CAP);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_T15a_CancelPostValidationReverts() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.AlreadyValidated.selector, taskId));
        escrow.cancel(taskId);
    }

    function test_T15b_CancelByStrangerReverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NotPayer.selector, stranger, payer));
        escrow.cancel(taskId);
    }

    // ── T16: reentrancy probe ──

    function test_T16_ReentrantTokenCannotDoublePay() public {
        ReentrantERC20 evil = new ReentrantERC20();
        evil.configure(address(escrow));
        evil.mint(payer, CAP);
        vm.prank(payer);
        evil.approve(address(escrow), CAP);

        TaskEscrow.Mandate memory m = _mandate();
        m.token = address(evil);
        bytes32 taskId = escrow.fund(m, _sign(m, payerKey));
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE);

        evil.arm(taskId);
        uint256 merchantBefore = evil.balanceOf(merchant);
        escrow.release(taskId); // outer succeeds; inner reentry blocked

        assertEq(evil.reentriesBlocked(), 1);
        assertEq(evil.balanceOf(merchant), merchantBefore + CAP); // exactly once
        assertEq(evil.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Released));
    }

    // ── v2 pinned threshold/validator ──

    function test_PinnedThresholdSurvivesRaise() public {
        (bytes32 taskId,) = _fund(); // pins THRESHOLD (5_000)
        escrow.setThreshold(9_000); // later global change must not move the bar
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE);
        escrow.release(taskId);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Released));
    }

    function test_PinnedThresholdSurvivesLower() public {
        (bytes32 taskId,) = _fund(); // pins THRESHOLD (5_000)
        escrow.setThreshold(1_000); // lowering must not rescue a failing task
        vm.prank(validator);
        escrow.submitValidation(taskId, FAIL_SCORE);
        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.ScoreBelowThreshold.selector, taskId, FAIL_SCORE, THRESHOLD)
        );
        escrow.release(taskId);
    }

    function test_SecondValidatorCannotOverwrite() public {
        escrow.setValidator(validator2, true);
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE); // first write pins validator
        vm.prank(validator2);
        vm.expectRevert(
            abi.encodeWithSelector(
                TaskEscrow.ValidatorMismatch.selector, taskId, validator, validator2
            )
        );
        escrow.submitValidation(taskId, FAIL_SCORE);
        // Pinned validator's score still settles.
        escrow.release(taskId);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Released));
    }

    function test_ReleaseBlockedWhenPinnedValidatorRemoved() public {
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE);
        escrow.setValidator(validator, false);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NotValidator.selector, validator));
        escrow.release(taskId);
    }

    function test_InvertedRiskBindsOnAsymmetricThreshold() public {
        escrow.setThreshold(2_000);
        (bytes32 taskId,) = _fund(); // pins 2_000
        vm.prank(validator);
        escrow.submitValidation(taskId, 5_000); // quality passes 2_000 bar...
        // ...but inverted risk (10_000 - 5_000 = 5_000) exceeds pinned 2_000.
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, 5_000, 2_000));
        escrow.release(taskId);
        vm.prank(validator);
        escrow.submitValidation(taskId, 9_000); // risk 1_000 <= 2_000
        escrow.release(taskId);
        assertEq(uint8(escrow.taskState(taskId)), uint8(TaskEscrow.State.Released));
    }

    // ── v2 cancel/refund split ──

    function test_CancelAfterExpiryRevertsRefundWorks() public {
        (bytes32 taskId, TaskEscrow.Mandate memory m) = _fund();
        vm.warp(m.expiry + 1);
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(TaskEscrow.WindowExpired.selector, taskId, block.timestamp, m.expiry)
        );
        escrow.cancel(taskId);
        // Refund path owns post-expiry settlement.
        uint256 payerBefore = usdc.balanceOf(payer);
        escrow.refund(taskId);
        assertEq(usdc.balanceOf(payer), payerBefore + CAP);
    }

    // ── v2 2-step ownership ──

    function test_TwoStepOwnership_Escrow() public {
        escrow.transferOwnership(stranger);
        assertEq(escrow.owner(), address(this)); // unchanged until accept
        assertEq(escrow.pendingOwner(), stranger);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NotOwner.selector, stranger));
        escrow.setThreshold(1); // stranger is not owner yet
        vm.prank(stranger);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), stranger);
        assertEq(escrow.pendingOwner(), address(0));
    }

    // ── admin ──

    function test_AdminNonOwnerCannotSetValidator() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.NotOwner.selector, stranger));
        escrow.setValidator(stranger, true);
    }

    function test_AdminThresholdBounds() public {
        vm.expectRevert(abi.encodeWithSelector(TaskEscrow.BadThreshold.selector, 10_001));
        escrow.setThreshold(10_001);
        escrow.setThreshold(9_000);
        assertEq(escrow.thresholdBps(), 9_000);
    }
}
