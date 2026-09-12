// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {MandateTreeEscrow} from "../src/MandateTreeEscrow.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @notice Minimal reentrant ERC20 probe for MandateTreeEscrow.release.
/// @dev transferFrom stays benign so fund() succeeds; transfer() attempts one
///      reentrant release during payout, which must be blocked by nonReentrant
///      + CEI (recorded via reentriesBlocked).
contract ReentrantTreeERC20 {
    MandateTreeEscrow public escrow;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;
    bytes32 public target;
    bool public armed;
    uint256 public reentriesBlocked;

    function configure(address _escrow) external {
        escrow = MandateTreeEscrow(_escrow);
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

/// @title MandateTreeEscrowTest — delegation trees + CRE quorum verdicts
/// @author Ramprasad
/// @notice Locked matrix MT1.. covering: root fund, tree constraints,
///         single-validator parity, CRE quorum path (threshold agreement,
///         mode conflicts, re-votes, resets), settlement (release/refund/
///         cancel), solvency invariant and reentrancy.
contract MandateTreeEscrowTest is Test {
    AegisRegistry registry;
    RiskGuard guard;
    MandateTreeEscrow escrow;
    MockERC20 usdc;

    uint256 payerKey = 424242;
    address payer;
    uint256 orchKey = 987654;
    address orchestrator; // parent agent (signs child mandates)
    uint256 scoutKey = 555001;
    address scout; // sub-agent: signs grandchild mandates + holds live identity
    address merchant = address(0x4E2C4);
    address childMerchant = address(0xC41D);
    uint256 validator2Key = 555002;
    address validator = address(0x8A11DA702);
    address validator2;
    address reporter1 = address(0x91E4B0A1);
    address reporter2 = address(0x91E4B0A2);
    address reporter3 = address(0x91E4B0A3);
    address stranger = address(0xDEAD);

    uint256 constant CAP = 1_000_000; // 1 USDC (6dp)
    uint256 constant THRESHOLD = 5_000;
    uint256 constant PASS_SCORE = 8_000;
    uint256 constant FAIL_SCORE = 4_000;

    uint256 nonceSeq;

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
    event ChildDelegated(
        bytes32 indexed parentTaskId,
        bytes32 indexed childTaskId,
        address indexed agent,
        address merchant,
        uint256 cap,
        uint64 expiry
    );
    event ValidationSubmitted(bytes32 indexed taskId, address indexed validator_, uint256 scoreBps);
    event QuorumVoteSubmitted(
        bytes32 indexed taskId,
        address indexed reporter,
        uint256 scoreBps,
        bytes32 reportHash,
        uint256 agreeCount,
        uint256 nodeCount,
        uint256 requiredQuorum
    );
    event TaskReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event TaskRefunded(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event TaskCancelled(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event VerdictReset(bytes32 indexed taskId, address indexed reporter);

    function setUp() public {
        vm.warp(1_700_000_000); // realistic epoch (foundry defaults to ts=1)
        payer = vm.addr(payerKey);
        orchestrator = vm.addr(orchKey);
        scout = vm.addr(scoutKey);
        validator2 = vm.addr(validator2Key);
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        guard = new RiskGuard(address(registry));
        escrow = new MandateTreeEscrow(address(guard), THRESHOLD, 2);
        escrow.setValidator(validator, true);
        escrow.setValidator(validator2, true);
        escrow.setReporter(reporter1, true);
        escrow.setReporter(reporter2, true);
        escrow.setReporter(reporter3, true);

        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(payer, 100_000_000);

        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);

        // Live identities: root + child agents must pass RiskGuard at release.
        registry.mintAgent("root-agent", orchestrator, 30);
        registry.mintAgent("scout", scout, 30);
    }

    // ── helpers ──

    function _root() internal returns (MandateTreeEscrow.Mandate memory m) {
        m.parentTaskId = bytes32(0);
        m.agent = orchestrator;
        m.merchant = merchant;
        m.token = address(usdc);
        m.cap = CAP;
        m.windowStart = uint64(block.timestamp);
        m.windowEnd = uint64(block.timestamp + 1 days);
        m.expiry = uint64(block.timestamp + 2 days);
        m.nonce = ++nonceSeq;
        m.chainId = block.chainid;
    }

    function _child(bytes32 parentId, address childAgent, uint256 cap) internal returns (MandateTreeEscrow.Mandate memory m) {
        m.parentTaskId = parentId;
        m.agent = childAgent;
        m.merchant = childMerchant;
        m.token = address(usdc);
        m.cap = cap;
        m.windowStart = uint64(block.timestamp);
        m.windowEnd = uint64(block.timestamp + 1 days);
        m.expiry = uint64(block.timestamp + 2 days);
        m.nonce = ++nonceSeq;
        m.chainId = block.chainid;
    }

    function _sign(MandateTreeEscrow.Mandate memory m, uint256 key) internal returns (bytes memory) {
        bytes32 digest = escrow.mandateDigest(m);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _fund() internal returns (bytes32 taskId, MandateTreeEscrow.Mandate memory m) {
        m = _root();
        taskId = escrow.fund(m, _sign(m, payerKey));
    }

    function _fundValidated(uint256 score) internal returns (bytes32 taskId) {
        (taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, score);
    }

    function _delegate(
        bytes32 parentId,
        address childAgent,
        uint256 cap
    ) internal returns (bytes32 childTaskId, MandateTreeEscrow.Mandate memory m) {
        m = _child(parentId, childAgent, cap);
        childTaskId = escrow.delegate(m, _sign(m, orchKey));
    }

    /// @dev Delegate where the parent node's agent is a key-controlled wallet
    ///      other than the orchestrator (deep chains).
    function _delegateFrom(
        bytes32 parentId,
        uint256 parentAgentKey,
        address childAgent,
        uint256 cap
    ) internal returns (bytes32 childTaskId, MandateTreeEscrow.Mandate memory m) {
        m = _child(parentId, childAgent, cap);
        childTaskId = escrow.delegate(m, _sign(m, parentAgentKey));
    }

    function _node(bytes32 id) internal returns (MandateTreeEscrow.Node memory) {
        return escrow.node(id);
    }

    // ── MT1: root fund ──

    function test_MT01_RootFundHappy() public {
        MandateTreeEscrow.Mandate memory m = _root();
        bytes32 expectedId = escrow.mandateTaskId(m);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.expectEmit(true, true, true, true);
        emit TaskFunded(expectedId, payer, orchestrator, merchant, address(usdc), CAP, m.expiry, m.nonce);
        bytes32 taskId = escrow.fund(m, _sign(m, payerKey));

        assertEq(taskId, expectedId);
        assertEq(uint8(escrow.nodeState(taskId)), uint8(MandateTreeEscrow.State.Funded));
        assertEq(usdc.balanceOf(address(escrow)), CAP);
        assertEq(usdc.balanceOf(payer), payerBefore - CAP);
        assertTrue(escrow.usedNonce(payer, m.nonce));
    }

    function test_MT01_RootOnly() public {
        MandateTreeEscrow.Mandate memory m = _root();
        m.parentTaskId = bytes32(uint256(1));
        bytes memory sig = _sign(m, payerKey);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.NotRoot.selector, m.parentTaskId)
        );
        escrow.fund(m, sig);
    }

    function test_MT01_ParentTaskIdZeroMalformedChild() public {
        (bytes32 parentId,) = _fund();
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, 100);
        m.parentTaskId = bytes32(0);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.MalformedChild.selector, bytes32(0)));
        escrow.delegate(m, sig);
    }

    function test_MT01_NonceReplayReverts() public {
        MandateTreeEscrow.Mandate memory m = _root();
        bytes memory sig = _sign(m, payerKey);
        escrow.fund(m, sig);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NonceUsed.selector, payer, m.nonce));
        escrow.fund(m, sig);
    }

    function test_MT01_WrongChainReverts() public {
        MandateTreeEscrow.Mandate memory m = _root();
        m.chainId = block.chainid + 1;
        bytes memory sig = _sign(m, payerKey);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.ChainIdMismatch.selector, m.chainId, block.chainid)
        );
        escrow.fund(m, sig);
    }

    function test_MT01_TamperedSigReverts() public {
        MandateTreeEscrow.Mandate memory m = _root();
        bytes memory junk = new bytes(65); // garbage signature, not a signable payload
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.BadSig.selector, address(0)));
        escrow.fund(m, junk);
    }

    function test_MT01_ZeroFieldsRevert() public {
        MandateTreeEscrow.Mandate memory m = _root();
        m.agent = address(0);
        bytes memory sig = _sign(m, payerKey);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.ZeroAgent.selector));
        escrow.fund(m, sig);

        m = _root();
        m.cap = 0;
        sig = _sign(m, payerKey);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.ZeroCap.selector));
        escrow.fund(m, sig);
    }

    function test_MT01_ExpiredMandateReverts() public {
        MandateTreeEscrow.Mandate memory m = _root();
        m.expiry = uint64(block.timestamp);
        bytes memory sig = _sign(m, payerKey);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.MandateExpired.selector, m.expiry, block.timestamp)
        );
        escrow.fund(m, sig);
    }

    // ── MT2: delegation tree constraints ──

    function test_MT02_DelegateHappy() public {
        (bytes32 parentId,) = _fund();
        uint256 childCap = 400_000;
        (bytes32 childId, MandateTreeEscrow.Mandate memory m) = _delegate(parentId, scout, childCap);

        assertEq(childId, escrow.mandateTaskId(m));
        MandateTreeEscrow.Node memory p = _node(parentId);
        assertEq(p.cap, CAP);
        assertEq(p.escrowed, CAP - childCap);
        assertEq(p.liveChildren, 1);
        MandateTreeEscrow.Node memory c = _node(childId);
        assertEq(c.cap, childCap);
        assertEq(c.escrowed, childCap);
        assertEq(c.liveChildren, 0);
        assertEq(usdc.balanceOf(address(escrow)), CAP); // treasury unchanged
    }

    function test_MT02_ChainOfDelegations() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 300_000);
        (bytes32 grandId, MandateTreeEscrow.Mandate memory gm) =
            _delegateFrom(childId, scoutKey, stranger, 100_000);
        assertEq(gm.parentTaskId, childId);

        MandateTreeEscrow.Node memory c = _node(childId);
        assertEq(c.escrowed, 200_000);
        assertEq(c.liveChildren, 1);
        MandateTreeEscrow.Node memory root = _node(rootId);
        assertEq(root.escrowed, 700_000);
        assertEq(root.liveChildren, 1);
        MandateTreeEscrow.Node memory g = _node(grandId);
        assertEq(g.escrowed, 100_000);
        assertEq(usdc.balanceOf(address(escrow)), CAP); // Σ escrowed ≡ treasury
    }

    function test_MT02_CapExceedsParentReverts() public {
        (bytes32 parentId,) = _fund();
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, CAP + 1);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.CapExceedsParent.selector, parentId, CAP + 1, CAP)
        );
        escrow.delegate(m, sig);
    }

    function test_MT02_TokenMismatchReverts() public {
        (bytes32 parentId,) = _fund();
        MockERC20 dai = new MockERC20("DAI", "DAI", 18);
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, 100);
        m.token = address(dai);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.TokenMismatch.selector, address(dai), address(usdc)));
        escrow.delegate(m, sig);
    }

    function test_MT02_WindowNotSubsetReverts() public {
        (bytes32 parentId,) = _fund();
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, 100);
        m.windowStart = uint64(block.timestamp - 10);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(
            abi.encodeWithSelector(
                MandateTreeEscrow.WindowNotSubset.selector,
                m.windowStart,
                m.windowEnd,
                uint64(block.timestamp),
                m.windowEnd
            )
        );
        escrow.delegate(m, sig);
    }

    function test_MT02_ExpiryExceedsParentReverts() public {
        (bytes32 parentId,) = _fund();
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, 100);
        m.expiry = uint64(block.timestamp + 3 days);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.ExpiryExceedsParent.selector, m.expiry, uint64(block.timestamp + 2 days))
        );
        escrow.delegate(m, sig);
    }

    function test_MT02_UnknownParentReverts() public {
        MandateTreeEscrow.Mandate memory m = _child(bytes32(uint256(9)), scout, 100);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.UnknownTask.selector, m.parentTaskId));
        escrow.delegate(m, sig);
    }

    function test_MT02_ReleasedParentReverts() public {
        bytes32 parentId = _fundValidated(PASS_SCORE);
        escrow.release(parentId);
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, 100);
        bytes memory sig = _sign(m, orchKey);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.ParentNotLive.selector, parentId, uint8(MandateTreeEscrow.State.Released))
        );
        escrow.delegate(m, sig);
    }

    function test_MT02_ChildSignedByWrongPartyReverts() public {
        (bytes32 parentId,) = _fund();
        MandateTreeEscrow.Mandate memory m = _child(parentId, scout, 100);
        bytes memory sig = _sign(m, payerKey); // payer is NOT the parent agent
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.BadParent.selector, parentId));
        escrow.delegate(m, sig);
    }

    function test_MT02_ChildExecutorCannotCancelOwn() public {
        // scout (child agent) must NOT be able to cancel its own mandate.
        bytes32 parentId = _fundValidated(PASS_SCORE);
        (bytes32 childId,) = _delegate(parentId, scout, 200_000);
        vm.prank(scout);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NotPayer.selector, scout, payer));
        escrow.cancel(childId);
    }

    // ── MT3: single-validator (legacy parity inside the tree) ──

    function test_MT03_ValidateAndReleaseRoot() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        uint256 before = usdc.balanceOf(merchant);
        escrow.release(taskId);
        assertEq(usdc.balanceOf(merchant), before + CAP);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(uint8(escrow.nodeState(taskId)), uint8(MandateTreeEscrow.State.Released));
    }

    function test_MT03_ReleaseWithoutValidationReverts() public {
        (bytes32 taskId,) = _fund();
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NoValidation.selector, taskId));
        escrow.release(taskId);
    }

    function test_MT03_LowScoreBlocksRelease() public {
        bytes32 taskId = _fundValidated(FAIL_SCORE);
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.ScoreBelowThreshold.selector, taskId, FAIL_SCORE, THRESHOLD)
        );
        escrow.release(taskId);
    }

    function test_MT03_RevokedValidatorBlocksRelease() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        vm.prank(address(this));
        escrow.setValidator(validator, false);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NotValidator.selector, validator));
        escrow.release(taskId);
    }

    function test_MT03_SecondValidatorMismatchReverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE);
        vm.prank(validator2); // second allowlisted validator ≠ pinned validator
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.ValidatorMismatch.selector, taskId, validator, validator2)
        );
        escrow.submitValidation(taskId, PASS_SCORE);
    }

    function test_MT03_NonValidatorReverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NotValidator.selector, stranger));
        escrow.submitValidation(taskId, PASS_SCORE);
    }

    function test_MT03_IdentityGateBlocksRelease() public {
        // Revoke the agent's identity → release must fail even with a pass score.
        bytes32 taskId = _fundValidated(PASS_SCORE);
        vm.prank(address(this)); // registry owner
        registry.revokeAgentByLabel("root-agent");
        vm.prank(stranger); // anyone can attempt release
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, orchestrator));
        escrow.release(taskId);
    }

    // ── MT4: root release waits on children (proof composes up) ──

    function test_MT04_RootReleaseBlockedWhileChildLive() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 300_000);

        vm.prank(validator);
        escrow.submitValidation(rootId, PASS_SCORE);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.ChildrenLive.selector, rootId, 1));
        escrow.release(rootId);

        // Settle the child first, then root release becomes possible.
        vm.prank(validator);
        escrow.submitValidation(childId, PASS_SCORE);
        escrow.release(childId);
        uint256 merchantBefore = usdc.balanceOf(merchant);
        escrow.release(rootId);
        assertEq(usdc.balanceOf(merchant), merchantBefore + 700_000);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_MT04_GrandchildBlocksMiddleRelease() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 300_000);
        // Grandchild's agent key-scoped: the child's agent (scout) signs it.
        (bytes32 grandId,) = _delegateFrom(childId, scoutKey, scout, 100_000);

        vm.prank(validator);
        escrow.submitValidation(childId, PASS_SCORE);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.ChildrenLive.selector, childId, 1));
        escrow.release(childId);

        // Settle grandchild first (leaf), then child, then root; release is leaf-first.
        vm.prank(validator);
        escrow.submitValidation(grandId, PASS_SCORE);
        escrow.release(grandId);
        escrow.release(childId);
        vm.prank(validator);
        escrow.submitValidation(rootId, PASS_SCORE);
        escrow.release(rootId);
        assertEq(usdc.balanceOf(merchant) + usdc.balanceOf(childMerchant), CAP);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ── MT5: CRE quorum verdict path ──

    function test_MT05_QuorumTwoOfThreeReleases() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, PASS_SCORE);
        _vote(taskId, reporter3, FAIL_SCORE);

        MandateTreeEscrow.Node memory n = _node(taskId);
        assertEq(n.nodeCount, 3);
        assertEq(n.agreeCount, 2);
        assertEq(n.requiredQuorum, 2);

        escrow.release(taskId);
        assertEq(usdc.balanceOf(merchant), CAP);
        assertEq(uint8(escrow.nodeState(taskId)), uint8(MandateTreeEscrow.State.Released));
    }

    function test_MT05_QuorumNotMetReverts() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, FAIL_SCORE);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.QuorumNotMet.selector, taskId, 1, 2));
        escrow.release(taskId);
    }

    function test_MT05_NonReporterReverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NotReporter.selector, stranger));
        escrow.submitNodeVerdict(taskId, PASS_SCORE, bytes32(uint256(1)));
    }

    function test_MT05_ZeroReportHashReverts() public {
        (bytes32 taskId,) = _fund();
        vm.prank(reporter1);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.ZeroReportHash.selector));
        escrow.submitNodeVerdict(taskId, PASS_SCORE, bytes32(0));
    }

    function test_MT05_ModeConflictSingleThenQuorum() public {
        bytes32 taskId = _fundValidated(PASS_SCORE);
        vm.prank(reporter1);
        vm.expectRevert(
            abi.encodeWithSelector(
                MandateTreeEscrow.VerdictModeConflicts.selector,
                taskId,
                uint8(MandateTreeEscrow.VerdictMode.SingleValidator),
                uint8(MandateTreeEscrow.VerdictMode.Quorum)
            )
        );
        escrow.submitNodeVerdict(taskId, PASS_SCORE, bytes32(uint256(1)));
    }

    function test_MT05_ModeConflictQuorumThenSingle() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        vm.prank(validator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MandateTreeEscrow.VerdictModeConflicts.selector,
                taskId,
                uint8(MandateTreeEscrow.VerdictMode.Quorum),
                uint8(MandateTreeEscrow.VerdictMode.SingleValidator)
            )
        );
        escrow.submitValidation(taskId, PASS_SCORE);
    }

    function test_MT05_RevoteOverwrites() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, PASS_SCORE);
        // reporter2 flips to dissent — agreement drops below bar.
        _vote(taskId, reporter2, FAIL_SCORE);
        MandateTreeEscrow.Node memory n = _node(taskId);
        assertEq(n.nodeCount, 2);
        assertEq(n.agreeCount, 1);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.QuorumNotMet.selector, taskId, 1, 2));
        escrow.release(taskId);
        // Flip back → agreement restored → release is live again.
        _vote(taskId, reporter2, PASS_SCORE);
        escrow.release(taskId);
        assertEq(usdc.balanceOf(merchant), CAP);
    }

    function test_MT05_TooManyDistinctVotesReverts() public {
        (bytes32 taskId,) = _fund();
        for (uint256 i = 0; i < 21; i++) {
            address rep = address(uint160(uint256(keccak256(abi.encode(i)))));
            vm.prank(escrow.owner());
            escrow.setReporter(rep, true);
            vm.prank(rep);
            escrow.submitNodeVerdict(taskId, PASS_SCORE, bytes32(uint256(i + 1)));
        }
        address last = address(uint160(uint256(keccak256(abi.encode(99)))));
        vm.prank(escrow.owner());
        escrow.setReporter(last, true);
        vm.prank(last);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.TooManyVotes.selector, taskId, 22));
        escrow.submitNodeVerdict(taskId, PASS_SCORE, bytes32(uint256(100)));
    }

    function test_MT05_QuorumFreezeUnaffectedByDefaultChange() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        // Owner changes defaultQuorum mid-flight: requiredQuorum stays frozen.
        vm.prank(address(this));
        escrow.setDefaultQuorum(3);
        _vote(taskId, reporter2, PASS_SCORE);
        MandateTreeEscrow.Node memory n = _node(taskId);
        assertEq(n.requiredQuorum, 2);
        assertEq(escrow.defaultQuorum(), 3);
    }

    function test_MT05_ReleasesWhenAgreementExceedsDefaultQuorumChange() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, PASS_SCORE); // 2/2 met against the frozen bar
        escrow.release(taskId);
        assertEq(uint8(escrow.nodeState(taskId)), uint8(MandateTreeEscrow.State.Released));
    }

    // ── MT6: resetVerdict (node replacement) ──

    function test_MT06_NonOwnerResetReverts() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NotOwner.selector, stranger));
        escrow.resetVerdict(taskId, reporter1);
    }

    function test_MT06_ResetDissentingVote() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, FAIL_SCORE);
        vm.prank(address(this));
        escrow.resetVerdict(taskId, reporter2);
        MandateTreeEscrow.Node memory n = _node(taskId);
        assertEq(n.nodeCount, 1);
        assertEq(n.agreeCount, 1);
        // Still met (agreeCount 1 >= required 2? no — single agree needs reset other).
        // Add another agreeing reporter to reach quorum, proving reset was clean.
        _vote(taskId, reporter3, PASS_SCORE);
        escrow.release(taskId);
    }

    function test_MT06_ResetIdempotentWhenEmpty() public {
        (bytes32 taskId,) = _fund();
        vm.prank(address(this));
        escrow.resetVerdict(taskId, reporter1); // no record → no-op, no revert
        assertTrue(true);
    }

    function test_MT06_ResetCannotDropMetQuorum() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, PASS_SCORE); // exactly 2/2, met
        vm.prank(address(this));
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.SubsidyLock.selector));
        escrow.resetVerdict(taskId, reporter1);
    }

    function test_MT06_ResetAllowedWhenSurplusAgreement() public {
        (bytes32 taskId,) = _fund();
        _vote(taskId, reporter1, PASS_SCORE);
        _vote(taskId, reporter2, PASS_SCORE);
        _vote(taskId, reporter3, PASS_SCORE); // 3/3, surplus
        vm.prank(address(this));
        escrow.resetVerdict(taskId, reporter3); // leaves 2/2 >= quorum → allowed
        MandateTreeEscrow.Node memory n = _node(taskId);
        assertEq(n.nodeCount, 2);
        assertEq(n.agreeCount, 2);
        escrow.release(taskId);
    }

    // ── MT7: refund & cancel (up-tree slot return) ──

    function test_MT07_ChildRefundReturnsSlotToParent() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 400_000);

        vm.warp(block.timestamp + 3 days); // past expiry
        escrow.refund(childId);

        MandateTreeEscrow.Node memory p = _node(rootId);
        assertEq(p.escrowed, CAP); // slot returned up-tree
        assertEq(p.liveChildren, 0);
        assertEq(usdc.balanceOf(address(escrow)), CAP); // treasury unchanged (pure accounting)
    }

    function test_MT07_ChildRefundThenRootRefundRestoresPayer() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 400_000);
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.warp(block.timestamp + 3 days);
        escrow.refund(childId);
        escrow.refund(rootId);

        assertEq(usdc.balanceOf(payer), payerBefore + CAP + 0); // 600k from root + entire cap refunded once
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_MT07_RefundBeforeExpiryReverts() public {
        (bytes32 rootId,) = _fund();
        vm.expectRevert(
            abi.encodeWithSelector(MandateTreeEscrow.NotExpired.selector, rootId, block.timestamp, uint64(block.timestamp + 2 days))
        );
        escrow.refund(rootId);
    }

    function test_MT07_RootCancelPayerOnly() public {
        (bytes32 rootId,) = _fund();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.NotPayer.selector, stranger, payer));
        escrow.cancel(rootId);

        uint256 payerBefore = usdc.balanceOf(payer);
        vm.prank(payer);
        escrow.cancel(rootId);
        assertEq(usdc.balanceOf(payer), payerBefore + CAP);
        assertEq(uint8(escrow.nodeState(rootId)), uint8(MandateTreeEscrow.State.Cancelled));
    }

    function test_MT07_RootPayerCanCancelChild() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 300_000);
        uint256 payerSlotBack;
        // Cancel child (root payer may) → slot moves into root escrowed (accounting).
        vm.prank(payer);
        escrow.cancel(childId);
        MandateTreeEscrow.Node memory p = _node(rootId);
        assertEq(p.escrowed, CAP);
    }

    function test_MT07_OrchestratorCanCancelChild() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 300_000);
        vm.prank(orchestrator);
        escrow.cancel(childId);
        MandateTreeEscrow.Node memory p = _node(rootId);
        assertEq(p.escrowed, CAP);
    }

    function test_MT07_ValidatedChildCannotCancel() public {
        (bytes32 rootId,) = _fund();
        (bytes32 childId,) = _delegate(rootId, scout, 300_000);
        vm.prank(validator);
        escrow.submitValidation(childId, PASS_SCORE);
        vm.expectRevert(abi.encodeWithSelector(MandateTreeEscrow.AlreadyValidated.selector, childId));
        escrow.cancel(childId);
    }

    // ── MT8: reentrancy ──

    function test_MT08_ReentrantReleaseBlocked() public {
        ReentrantTreeERC20 tok = new ReentrantTreeERC20();
        tok.configure(address(escrow));
        tok.mint(payer, CAP);
        vm.prank(payer);
        tok.approve(address(escrow), type(uint256).max);

        MandateTreeEscrow.Mandate memory m = _root();
        m.token = address(tok);
        bytes32 taskId = escrow.fund(m, _sign(m, payerKey));
        vm.prank(validator);
        escrow.submitValidation(taskId, PASS_SCORE);

        tok.arm(taskId);
        escrow.release(taskId); // payout transfer() attempts reentrant release
        assertEq(tok.reentriesBlocked(), 1);
        assertEq(uint8(escrow.nodeState(taskId)), uint8(MandateTreeEscrow.State.Released));
    }

    // ── helpers (quorum vote + getters) ──

    function _vote(bytes32 taskId, address rep, uint256 score) internal {
        vm.prank(rep);
        escrow.submitNodeVerdict(taskId, score, _reportHash(taskId, rep, score));
    }

    function _reportHash(bytes32 taskId, address rep, uint256 score) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(taskId, rep, score));
    }
}