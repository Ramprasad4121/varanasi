// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {RiskGuard} from "./RiskGuard.sol";

/// @title VaranasiMandateTreeEscrow — settlement layer for multi-agent economies.
/// @author Ramprasad
/// @notice A mandate is a TREE, not a leaf. The root mandate is signed by the
///         human payer exactly as in TaskEscrow; but the root's AGENT
///         (orchestrator) can cryptographically issue child mandates for
///         sub-agents WITHOUT holding their keys or their identities. The
///         contract — not trust — enforces every child is carved from the
///         parent's remaining escrowed cap, fits inside the parent's window,
///         and cannot outlive the parent's expiry. A parent cannot release
///         until every child in its subtree has settled (proof composes UP the
///         tree), and no node can extract more than its escrowed slot, so the
///         total that leaves a subtree never exceeds the root's funded cap.
///
/// Verdicts: each node is scored by EITHER the legacy single-allowlisted
/// validator path OR the Chainlink CRE quorum path (a network of independent
/// TEE verdict nodes). The first score submitted pins the node's verdict
/// mode; release on a quorum node requires `agreeCount >= requiredQuorum`
/// from distinct CRE report hashes relayed by allowlisted verdict reporters.
///
/// Token custody: one treasury balance (ERC20-only), per-task `escrowed`
/// slots. Delegation MOVES `cap` from the parent slot into the child slot
/// (treasury unchanged); a released node pays its full `escrowed` to its
/// merchant; a refunded/cancelled child returns its `escrowed` to its direct
/// parent slot (or the payer, for a root). Invariant: Σ over all tasks of
/// `escrowed` ≡ treasury, so solvency is structural.
///
/// @dev State machine per node (root and child alike):
///        [NONE] --fund|delegate--> [FUNDED] --validation--> [VALIDATED]
///        [FUNDED|VALIDATED] --release (children settled, gates: score /
///                           quorum, RiskGuard, expiry)--> [RELEASED]
///        [FUNDED|VALIDATED] --refund (after expiry, children settled)--> [REFUNDED]
///        [FUNDED] --cancel (payer / parent agent, children settled)--> [CANCELLED]
/// @dev ERC-8004 is a CLIENT-side concern only (see TaskEscrow) — this
///      contract never imports it. Authorization is: root = EIP-712 signature
///      from the payer; child = EIP-712 signature from the parent's agent.
///      msg.sender attribution + EIP-712 only (never tx.origin).
contract MandateTreeEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──

    /// @notice EIP-712 mandate. Identical encoding for root and child; the
    ///         `parentTaskId` discriminates the sig authority:
    ///          - parentTaskId == 0 → root, signature must recover the payer
    ///            (tokens are pulled from the payer into `escrowed`).
    ///          - parentTaskId != 0 → child, signature must recover the
    ///            parent task's agent (no token pull: `cap` is carved from the
    ///            parent's `escrowed` slot).
    /// @dev Type string (locked):
    ///      "Mandate(bytes32 parentTaskId,address agent,address merchant,"
    ///      "address token,uint256 cap,uint64 windowStart,uint64 windowEnd,"
    ///      "uint64 expiry,uint256 nonce,uint256 chainId)"
    struct Mandate {
        bytes32 parentTaskId; // 0 = root mandate
        address agent; // executor; for a child, must pass RiskGuard live at release
        address merchant; // payee on release
        address token; // ERC20 only; children must match the parent's token
        uint256 cap; // root: pulled from payer; child: carved from parent slot
        uint64 windowStart; // validation window open (block.timestamp clock)
        uint64 windowEnd; // validation window close (inclusive)
        uint64 expiry; // refund gate: refund iff block.timestamp > expiry
        uint256 nonce; // per-signer replay nullifier
        uint256 chainId; // must equal block.chainid
    }

    /// @notice Lifecycle states for a node (None = uninitialized).
    enum State {
        None,
        Funded,
        Validated,
        Released,
        Refunded,
        Cancelled
    }

    /// @notice Verdict mode pinned at a node's first score write.
    enum VerdictMode {
        None,
        SingleValidator,
        Quorum
    }

    /// @notice Stored node record. `escrowed` is the live slot this node may
    ///         settle; `liveChildren` counts non-terminal children (blocks
    ///         parent settlement until it reaches zero).
    struct Node {
        bytes32 parentTaskId; // 0 = root
        address issuer; // root: mandate signer (payer); child: parent agent
        address agent;
        address merchant;
        address token; // single-currency tree: always equals root's token
        uint256 cap; // nominal carve/pull at creation (audit/UX)
        uint256 escrowed; // live slot value (solvency: Σ escrowed ≡ treasury)
        uint256 liveChildren; // non-terminal children still holding slots
        uint64 windowStart;
        uint64 windowEnd;
        uint64 expiry;
        // Single-validator path (legacy).
        uint256 scoreBps;
        address validator;
        uint256 pinnedThresholdBps;
        address pinnedValidator;
        // Quorum path (Chainlink CRE verdict network).
        VerdictMode verdictMode; // pinned at first score write
        uint256 nodeCount; // distinct verdict reporters that voted
        uint256 agreeCount; // reporters with nodeScore >= pinnedThresholdBps
        uint256 requiredQuorum; // frozen from global defaultQuorum at first vote
        State state;
    }

    /// @notice Per-node score + attestation reference, for audit.
    /// @dev `reportHash` binds an on-chain vote to an off-chain CRE report
    ///      digest (tamper-evident pointer; full TEE attestation verification
    ///      via a CRE report reader is the production hardening step).
    struct VerdictRecord {
        uint256 scoreBps;
        bytes32 reportHash;
    }

    // ── Constants ──

    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "Mandate(bytes32 parentTaskId,address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)"
    );

    /// @notice Basis-points denominator: scores and thresholds are 0-10_000.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Upper bound on distinct verdict-node votes per task (bounds
    ///         median scan gas; CRE networks are small — 3-7 is realistic).
    uint256 public constant MAX_QUORUM_NODES = 21;

    // ── Storage ──

    /// @notice Live RiskGuard re-checked inline at every release.
    RiskGuard public immutable riskGuard;
    /// @notice Contract admin: validators, reporters, thresholds, ownership.
    /// @dev Production: timelock/multisig (no timelock code here by design).
    address public owner;
    /// @notice Pending owner (2-step ownership).
    address public pendingOwner;
    /// @notice Global release bar for the single-validator path: score >= bar.
    uint256 public thresholdBps;
    /// @notice Global quorum for the CRE path: a node releases iff
    ///         agreeCount >= this (default 2-of-3; owner-settable).
    uint256 public defaultQuorum = 2;

    /// @notice signer => nonce => consumed (per-signer replay nullifier).
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    /// @notice taskId => Node (embedded registry; no separate contract).
    mapping(bytes32 => Node) public nodes;
    /// @notice Validator allowlist (legacy single-validator path).
    mapping(address => bool) public isValidator;
    /// @notice CRE verdict-report reporter allowlist (relays signed quorum votes).
    mapping(address => bool) public isReporter;
    /// @notice taskId => reporter => score + report hash (distinct reporters).
    mapping(bytes32 => mapping(address => VerdictRecord)) public verdicts;

    // ── Events (authoritative receipt; service indexes these read-only) ──

    /// @notice Emitted when a root escrow is funded from the payer's allowance.
    event TaskFunded(
        bytes32 indexed taskId,
        address indexed payer,
        address indexed agent,
        address merchant,
        address token,
        uint256 amount,
        uint64 expiry,
        uint256 nonce
    );
    /// @notice Emitted when a parent agent carves a child escrow from its slot.
    event ChildDelegated(
        bytes32 indexed parentTaskId,
        bytes32 indexed childTaskId,
        address indexed agent,
        address merchant,
        uint256 cap,
        uint64 expiry
    );
    /// @notice Emitted when an allowlisted validator submits (or revises) a score.
    event ValidationSubmitted(bytes32 indexed taskId, address indexed validator, uint256 scoreBps);
    /// @notice Emitted when a CRE reporter submits a node verdict for a task.
    event QuorumVoteSubmitted(
        bytes32 indexed taskId,
        address indexed reporter,
        uint256 scoreBps,
        bytes32 reportHash,
        uint256 agreeCount,
        uint256 nodeCount,
        uint256 requiredQuorum
    );
    /// @notice Emitted when a node's escrowed slot is released to its merchant.
    event TaskReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    /// @notice Emitted when a node's escrowed slot is refunded (payer/up-tree).
    event TaskRefunded(bytes32 indexed taskId, address indexed payee, uint256 amount);
    /// @notice Emitted when a node is cancelled pre-validation.
    event TaskCancelled(bytes32 indexed taskId, address indexed payee, uint256 amount);
    /// @notice Emitted when a reporter record is reset (node replaced).
    event VerdictReset(bytes32 indexed taskId, address indexed reporter);
    /// @notice Emitted when the validator allowlist is updated.
    event ValidatorUpdated(address indexed validator, bool allowed);
    /// @notice Emitted when the CRE reporter allowlist is updated.
    event ReporterUpdated(address indexed reporter, bool allowed);
    /// @notice Emitted when the single-validator release bar is updated.
    event ThresholdUpdated(uint256 thresholdBps);
    /// @notice Emitted when the default CRE quorum is updated.
    event DefaultQuorumUpdated(uint256 quorum);
    /// @notice Emitted when ownership transfer is initiated (2-step).
    event OwnershipTransferStarted(address indexed next, address indexed prev);
    /// @notice Emitted when ownership transfer is accepted.
    event OwnershipTransferred(address indexed next, address indexed prev);

    // ── Distinct errors (no shared/clever reuse; CLI maps revert -> message) ──

    error BadSig(address recovered);
    error NonceUsed(address signer, uint256 nonce);
    error TaskExists(bytes32 taskId);
    error UnknownTask(bytes32 taskId);
    error MandateExpired(uint64 expiry, uint256 nowTs);
    error BadWindow(uint64 windowStart, uint64 windowEnd);
    error ZeroAgent();
    error ZeroMerchant();
    error ZeroToken();
    error ZeroCap();
    error ZeroAddress();
    error TokenFail(address token, address from, uint256 amount);
    error ChainIdMismatch(uint256 mandateChainId, uint256 chainId);
    error NotValidator(address caller);
    error NotReporter(address caller);
    error StaleTask(bytes32 taskId);
    error OutsideWindow(bytes32 taskId, uint256 nowTs);
    error BadScore(uint256 scoreBps);
    error NoValidation(bytes32 taskId);
    error NotFundedOrValidated(bytes32 taskId);
    error ScoreBelowThreshold(bytes32 taskId, uint256 scoreBps, uint256 thresholdBps);
    error WindowExpired(bytes32 taskId, uint256 nowTs, uint64 expiry);
    error NotExpired(bytes32 taskId, uint256 nowTs, uint64 expiry);
    error AlreadySettled(bytes32 taskId);
    error AlreadyValidated(bytes32 taskId);
    error NotPayer(address caller, address payer);
    error NotOwner(address caller);
    error NotPendingOwner(address caller);
    error BadThreshold(uint256 thresholdBps);
    error ValidatorMismatch(bytes32 taskId, address expected, address caller);
    error BadParent(bytes32 taskId);
    error ParentNotLive(bytes32 parentTaskId, uint8 state);
    error ParentMismatch(bytes32 parentTaskId);
    error CapExceedsParent(bytes32 parentTaskId, uint256 wanted, uint256 available);
    error WindowNotSubset(uint64 childStart, uint64 childEnd, uint64 parentStart, uint64 parentEnd);
    error ExpiryExceedsParent(uint64 childExpiry, uint64 parentExpiry);
    error TokenMismatch(address childToken, address parentToken);
    error ChildrenLive(bytes32 taskId, uint256 liveChildren);
    error NotRoot(bytes32 taskId);
    error MalformedChild(bytes32 parentTaskId);
    error SubsidyLock();
    error VerdictModeLocked(bytes32 taskId, uint8 mode);
    error QuorumNotMet(bytes32 taskId, uint256 agreeCount, uint256 requiredQuorum);
    error TooManyVotes(bytes32 taskId, uint256 nodeCount);
    error BadQuorum(uint256 quorum);
    error ZeroReportHash();
    error VerdictModeConflicts(bytes32 taskId, uint8 existing, uint8 attempted);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// @notice Deploy the tree escrow bound to a live RiskGuard + release bar.
    /// @param _riskGuard Live RiskGuard authorizer (identity + risk gate).
    /// @param _thresholdBps Single-validator release bar (score >= bar).
    /// @param _defaultQuorum CRE quorum for the verdict-network path (> 0).
    constructor(
        address _riskGuard,
        uint256 _thresholdBps,
        uint256 _defaultQuorum
    ) EIP712("VaranasiMandateTreeEscrow", "1") {
        if (_riskGuard == address(0)) revert ZeroAddress();
        if (_thresholdBps > BPS_DENOMINATOR) revert BadThreshold(_thresholdBps);
        if (_defaultQuorum == 0 || _defaultQuorum > MAX_QUORUM_NODES) revert BadQuorum(_defaultQuorum);
        riskGuard = RiskGuard(_riskGuard);
        owner = msg.sender;
        thresholdBps = _thresholdBps;
        defaultQuorum = _defaultQuorum;
    }

    // ── Admin ──

    function setValidator(address validator, bool allowed) external onlyOwner {
        if (validator == address(0)) revert ZeroAddress();
        isValidator[validator] = allowed;
        emit ValidatorUpdated(validator, allowed);
    }

    function setReporter(address reporter, bool allowed) external onlyOwner {
        if (reporter == address(0)) revert ZeroAddress();
        isReporter[reporter] = allowed;
        emit ReporterUpdated(reporter, allowed);
    }

    function setThreshold(uint256 _thresholdBps) external onlyOwner {
        if (_thresholdBps > BPS_DENOMINATOR) revert BadThreshold(_thresholdBps);
        thresholdBps = _thresholdBps;
        emit ThresholdUpdated(_thresholdBps);
    }

    function setDefaultQuorum(uint256 quorum) external onlyOwner {
        if (quorum == 0 || quorum > MAX_QUORUM_NODES) revert BadQuorum(quorum);
        defaultQuorum = quorum;
        emit DefaultQuorumUpdated(quorum);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        pendingOwner = next;
        emit OwnershipTransferStarted(next, owner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner(msg.sender);
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(owner, msg.sender);
    }

    // ── EIP-712 helpers (public for clients/tests; domain binds chainId+this) ──

    function mandateStructHash(Mandate calldata m) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MANDATE_TYPEHASH,
                m.parentTaskId,
                m.agent,
                m.merchant,
                m.token,
                m.cap,
                m.windowStart,
                m.windowEnd,
                m.expiry,
                m.nonce,
                m.chainId
            )
        );
    }

    function mandateDigest(Mandate calldata m) public view returns (bytes32) {
        return _hashTypedDataV4(mandateStructHash(m));
    }

    /// @notice taskId derivation: keccak of the domain-bound digest (chain +
    ///         verifyingContract bound, so cross-chain ids differ).
    function mandateTaskId(Mandate calldata m) public view returns (bytes32) {
        return keccak256(abi.encode(mandateDigest(m)));
    }

    function nodeState(bytes32 taskId) external view returns (State) {
        return nodes[taskId].state;
    }

    /// @notice Full node record (typed struct; the mapping getter flattens to a
    ///         tuple, so clients should use this).
    function node(bytes32 taskId) external view returns (Node memory) {
        return nodes[taskId];
    }

    /// @dev Static mandate checks shared by fund + delegate: zero fields,
    ///      chain, expiry strictly in the future, valid window.
    function _checkMandate(Mandate memory m) internal view {
        if (m.agent == address(0)) revert ZeroAgent();
        if (m.merchant == address(0)) revert ZeroMerchant();
        if (m.token == address(0)) revert ZeroToken();
        if (m.cap == 0) revert ZeroCap();
        if (m.chainId != block.chainid) revert ChainIdMismatch(m.chainId, block.chainid);
        if (m.expiry <= block.timestamp) revert MandateExpired(m.expiry, block.timestamp);
        if (m.windowStart > m.windowEnd) revert BadWindow(m.windowStart, m.windowEnd);
    }

    // ── Core: root funding ──

    /// @notice Fund a root escrow from a signed mandate. Permissionless
    ///         (sig-gated): anyone may submit; funds are pulled from the
    ///         SIGNER (payer), so the signer must allow escrow >= cap.
    /// @param _m Root mandate (parentTaskId must be zero).
    /// @param sig EIP-712 signature over mandateDigest(m) by the payer.
    /// @return taskId New root task id (== mandateTaskId(m)).
    function fund(Mandate calldata _m, bytes calldata sig) external nonReentrant returns (bytes32 taskId) {
        if (_m.parentTaskId != bytes32(0)) revert NotRoot(_m.parentTaskId);
        _checkMandate(_m);

        bytes32 digest = _hashTypedDataV4(mandateStructHash(_m));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer == address(0)) revert BadSig(signer);
        if (usedNonce[signer][_m.nonce]) revert NonceUsed(signer, _m.nonce);

        taskId = keccak256(abi.encode(digest));
        if (nodes[taskId].state != State.None) revert TaskExists(taskId);

        // Effects before interactions (CEI).
        usedNonce[signer][_m.nonce] = true;
        Node storage t = nodes[taskId];
        t.issuer = signer;
        t.agent = _m.agent;
        t.merchant = _m.merchant;
        t.token = _m.token;
        t.cap = _m.cap;
        t.pinnedThresholdBps = thresholdBps; // freeze the bar at fund time
        t.windowStart = _m.windowStart;
        t.windowEnd = _m.windowEnd;
        t.expiry = _m.expiry;
        t.state = State.Funded;

        uint256 before = IERC20(_m.token).balanceOf(address(this));
        IERC20(_m.token).safeTransferFrom(signer, address(this), _m.cap);
        uint256 received = IERC20(_m.token).balanceOf(address(this)) - before;
        t.escrowed = received; // fee-on-transfer safe; slot == treasury delta

        emit TaskFunded(taskId, signer, _m.agent, _m.merchant, _m.token, received, _m.expiry, _m.nonce);
    }

    // ── Core: delegation (the tree) ──

    /// @notice Carve a child escrow out of a live parent's slot. The child
    ///         mandate is signed by the PARENT's AGENT (the orchestrator) —
    ///         never by the sub-agent, so the orchestrator needs no sub-agent
    ///         key and no sub-agent identity to wire the tree. Signature
    ///         authority: recovering signer must equal parent.node.agent.
    ///
    /// Contract-enforced invariants (no trust):
    ///   • child.cap <= parent.escrowed (remaining parent cap; moves the slot)
    ///   • parentTaskId points at a live (Funded/Validated) parent
    ///   • child.token == parent.token
    ///   • child.windowStart >= parent.windowStart && child.windowEnd <= parent.windowEnd
    ///   • child.expiry <= parent.expiry
    ///   • parent.liveChildren increments (parent settlement waits on child)
    ///
    /// @param m Child mandate (parentTaskId must reference a live parent).
    /// @param sig EIP-712 signature over mandateDigest(m) by parent.agent.
    /// @return childTaskId New child task id (== mandateTaskId(m)).
    function delegate(Mandate calldata m, bytes calldata sig) external nonReentrant returns (bytes32 childTaskId) {
        if (m.parentTaskId == bytes32(0)) revert MalformedChild(bytes32(0));
        _checkMandate(m);

        Node storage parent = nodes[m.parentTaskId];
        if (parent.state == State.None) revert UnknownTask(m.parentTaskId);
        if (
            parent.state == State.Released || parent.state == State.Refunded || parent.state == State.Cancelled
        ) revert ParentNotLive(m.parentTaskId, uint8(parent.state));

        bytes32 digest = _hashTypedDataV4(mandateStructHash(m));
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer == address(0)) revert BadSig(signer);
        if (signer != parent.agent) revert BadParent(m.parentTaskId);
        if (usedNonce[signer][m.nonce]) revert NonceUsed(signer, m.nonce);

        childTaskId = keccak256(abi.encode(digest));
        if (nodes[childTaskId].state != State.None) revert TaskExists(childTaskId);

        // Child is carved from the parent's live slot — hard ceiling on a
        // subtree's total payout (Σ child caps <= root cap by induction).
        if (m.cap > parent.escrowed) {
            revert CapExceedsParent(m.parentTaskId, m.cap, parent.escrowed);
        }
        if (m.token != parent.token) revert TokenMismatch(m.token, parent.token);
        if (m.windowStart < parent.windowStart || m.windowEnd > parent.windowEnd) {
            revert WindowNotSubset(m.windowStart, m.windowEnd, parent.windowStart, parent.windowEnd);
        }
        if (m.expiry > parent.expiry) revert ExpiryExceedsParent(m.expiry, parent.expiry);

        // Effects before interactions (CEI): move slot + book the child before
        // any token call (none here — delegation is pure accounting).
        parent.escrowed -= m.cap;
        parent.liveChildren += 1;

        usedNonce[signer][m.nonce] = true;
        Node storage c = nodes[childTaskId];
        c.parentTaskId = m.parentTaskId;
        c.issuer = signer; // parent agent (can cancel like a payer on children)
        c.agent = m.agent;
        c.merchant = m.merchant;
        c.token = m.token;
        c.cap = m.cap;
        c.escrowed = m.cap;
        c.pinnedThresholdBps = thresholdBps; // freeze at delegation time
        c.windowStart = m.windowStart;
        c.windowEnd = m.windowEnd;
        c.expiry = m.expiry;
        c.state = State.Funded;

        emit ChildDelegated(m.parentTaskId, childTaskId, m.agent, m.merchant, m.cap, m.expiry);
    }

    // ── Core: single-validator path (legacy parity) ──

    /// @notice Submit (or revise) a validation score on the legacy path.
    ///         FIRST score write pins the node's verdict mode: if the node is
    ///         already locked to Quorum, this reverts (VerdictModeConflicts).
    /// @param taskId Node to validate.
    /// @param scoreBps Numeric score in basis points (0-10_000).
    function submitValidation(bytes32 taskId, uint256 scoreBps) external {
        Node storage t = nodes[taskId];
        if (t.state != State.Funded && t.state != State.Validated) revert StaleTask(taskId);
        if (!isValidator[msg.sender]) revert NotValidator(msg.sender);
        if (scoreBps > BPS_DENOMINATOR) revert BadScore(scoreBps);
        if (t.verdictMode == VerdictMode.Quorum) {
            revert VerdictModeConflicts(taskId, uint8(t.verdictMode), uint8(VerdictMode.SingleValidator));
        }
        if (t.pinnedValidator == address(0)) {
            t.verdictMode = VerdictMode.SingleValidator;
            t.pinnedValidator = msg.sender;
        } else if (msg.sender != t.pinnedValidator) {
            revert ValidatorMismatch(taskId, t.pinnedValidator, msg.sender);
        }
        if (block.timestamp < t.windowStart || block.timestamp > t.windowEnd) {
            revert OutsideWindow(taskId, block.timestamp);
        }

        t.scoreBps = scoreBps;
        t.validator = msg.sender;
        t.state = State.Validated;

        emit ValidationSubmitted(taskId, msg.sender, scoreBps);
    }

    // ── Core: CRE quorum verdict path ──

    /// @notice Relay one verdict node's CRE report into the node. Allowlisted
    ///         reporters only (the CRE relay bot; the signed DON report digest
    ///         is bound here so on-chain votes are tamper-evident). Each
    ///         distinct reporter votes at most once (re-votes overwrite the
    ///         same reporter's record — this is a node slot, not a double vote).
    ///         FIRST vote pins the node's verdict mode to Quorum; a legacy
    ///         single-validator write after that reverts.
    /// @param taskId Node receiving the coverage.
    /// @param scoreBps This verdict node's quality score (0-10_000).
    /// @param reportHash Digest of the attested CRE report (non-zero).
    function submitNodeVerdict(bytes32 taskId, uint256 scoreBps, bytes32 reportHash) external {
        Node storage t = nodes[taskId];
        if (t.state != State.Funded && t.state != State.Validated) revert StaleTask(taskId);
        if (!isReporter[msg.sender]) revert NotReporter(msg.sender);
        if (scoreBps > BPS_DENOMINATOR) revert BadScore(scoreBps);
        if (reportHash == bytes32(0)) revert ZeroReportHash();
        if (t.verdictMode == VerdictMode.SingleValidator) {
            revert VerdictModeConflicts(taskId, uint8(t.verdictMode), uint8(VerdictMode.Quorum));
        }

        // FIRST vote pins the node's verdict mode to Quorum (a legacy
        // single-validator write after that reverts above). Pinning twice is
        // idempotent (requiredQuorum is frozen once — see below).
        bool first = t.verdictMode != VerdictMode.Quorum;
        if (first) {
            t.verdictMode = VerdictMode.Quorum;
            t.requiredQuorum = defaultQuorum; // freeze the bar at first vote
        }

        VerdictRecord storage rec = verdicts[taskId][msg.sender];
        bool fresh = rec.reportHash == bytes32(0);
        if (fresh) {
            t.nodeCount += 1;
        } else {
            // Re-vote: adjust agreement only if boundary flipped.
            bool wasAgree = rec.scoreBps >= t.pinnedThresholdBps;
            bool nowAgree = scoreBps >= t.pinnedThresholdBps;
            if (wasAgree && !nowAgree) t.agreeCount -= 1;
            if (!wasAgree && nowAgree) t.agreeCount += 1;
        }
        if (t.nodeCount > MAX_QUORUM_NODES) revert TooManyVotes(taskId, t.nodeCount);

        rec.scoreBps = scoreBps;
        rec.reportHash = reportHash;
        if (fresh && scoreBps >= t.pinnedThresholdBps) {
            t.agreeCount += 1;
        }

        emit QuorumVoteSubmitted(
            taskId, msg.sender, scoreBps, reportHash, t.agreeCount, t.nodeCount, t.requiredQuorum
        );
    }

    /// @notice Reset a reporter's verdict record (node replacement / bot
    ///         rotation). Free reroll up to mode-lock: once more than
    ///         requiredQuorum - 1 distinct reporters have voted, resets could
    ///         shuffle quorum below the bar, so resets revert unless the node
    ///         already met quorum (idempotent pruning) or has zero votes.
    /// @param taskId Node whose report is being replaced.
    /// @param reporter Reporter slot to reset.
    function resetVerdict(bytes32 taskId, address reporter) external onlyOwner {
        Node storage t = nodes[taskId];
        if (t.state == State.None) revert UnknownTask(taskId);
        VerdictRecord storage rec = verdicts[taskId][reporter];
        if (rec.reportHash == bytes32(0)) return; // nothing to reset (idempotent)

        bool wasAgree = rec.scoreBps >= t.pinnedThresholdBps;
        if (wasAgree && t.agreeCount >= t.requiredQuorum && t.agreeCount - 1 < t.requiredQuorum) {
            // Removing the last agreeing vote that still holds a met quorum
            // would strand releaseability below the bar — refuse instead of
            // letting a relay bot rotate its way under the threshold.
            revert SubsidyLock();
        }

        delete verdicts[taskId][reporter];
        t.nodeCount -= 1;
        if (wasAgree) t.agreeCount -= 1;
        emit VerdictReset(taskId, reporter);
    }

    // ── Core: settlement ──

    /// @notice Release a node's escrowed slot to its merchant. Permissionless
    ///         (liveness). Succeeds iff AT RELEASE TIME:
    ///         • all children in the subtree settled (proof composes up):
    ///           this node's liveChildren == 0
    ///         • the node is validated on its pinned verdict mode:
    ///           SingleValidator → last score >= pinned threshold AND pinned
    ///             validator still allowlisted;
    ///           Quorum → agreeCount >= requiredQuorum (threshold agreement
    ///             across independent CRE verdict nodes)
    ///         • live RiskGuard.authorize(agent, BPS - score, pinned threshold)
    ///           passes (identity/revocation re-check; children's identities
    ///           were independently gated at each child's own release)
    ///         • block.timestamp <= expiry
    ///         For a SingleValidator node the risk inversion uses the stored
    ///         score; for a Quorum node it uses agreeCount-scaled risk, see
    ///         note below.
    /// @param taskId Node to release.
    function release(bytes32 taskId) external nonReentrant {
        Node storage t = nodes[taskId];
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.state == State.None) revert NotFundedOrValidated(taskId);
        if (t.liveChildren != 0) revert ChildrenLive(taskId, t.liveChildren);
        if (block.timestamp > t.expiry) revert WindowExpired(taskId, block.timestamp, t.expiry);
        if (t.verdictMode == VerdictMode.None) revert NoValidation(taskId);

        uint256 qualityScore;
        if (t.verdictMode == VerdictMode.SingleValidator) {
            if (!isValidator[t.pinnedValidator]) revert NotValidator(t.pinnedValidator);
            if (t.scoreBps < t.pinnedThresholdBps) {
                revert ScoreBelowThreshold(taskId, t.scoreBps, t.pinnedThresholdBps);
            }
            qualityScore = t.scoreBps;
        } else {
            // Quorum: threshold agreement among independent verdict nodes.
            // Quality = agreeCount/base scaled to bps for the inversion:
            //   quality = (agreeCount * 10_000) / nodeCount
            // so a fully-agreeing committee reports quality 10_000, and the
            // risk inversion (10_000 - quality) stays in [0, 10_000].
            if (t.agreeCount < t.requiredQuorum) {
                revert QuorumNotMet(taskId, t.agreeCount, t.requiredQuorum);
            }
            qualityScore = t.nodeCount == 0 ? 0 : (t.agreeCount * BPS_DENOMINATOR) / t.nodeCount;
        }

        // QUALITY→RISK INVERSION (explicit, TaskEscrow parity). RiskGuard
        // takes a RISK score (low = safe); validator/CRE quality is high=good,
        // so pass (10_000 - quality) against the PINNED threshold. Threshold
        // agreement already implies quality >= pinned bar (each vote scored
        // >= pinned), so risk <= pinned by construction.
        riskGuard.authorize(t.agent, BPS_DENOMINATOR - qualityScore, t.pinnedThresholdBps);

        // Effects before interactions (CEI).
        t.state = State.Released;
        uint256 amount = t.escrowed;
        t.escrowed = 0;
        address merchant = t.merchant;
        address token = t.token;

        IERC20(token).safeTransfer(merchant, amount);

        _settleUp(taskId);
        emit TaskReleased(taskId, merchant, amount);
    }

    /// @notice Refund a node's escrowed slot. Permissionless, strictly after
    ///         expiry. A root refunds to the human payer; a child refunds its
    ///         slot back UP the tree into its direct parent's `escrowed` (so
    ///         the orchestrator reclaims unused sub-mandate value). Requires
    ///         the whole subtree settled (liveChildren == 0) so the parent
    ///         slot never freezes behind live grandchildren.
    /// @param taskId Node to refund.
    function refund(bytes32 taskId) external nonReentrant {
        Node storage t = nodes[taskId];
        if (t.state == State.None) revert UnknownTask(taskId);
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.liveChildren != 0) revert ChildrenLive(taskId, t.liveChildren);
        if (block.timestamp <= t.expiry) revert NotExpired(taskId, block.timestamp, t.expiry);

        // Effects before interactions (CEI).
        t.state = State.Refunded;
        uint256 amount = t.escrowed;
        t.escrowed = 0;

        address payee;
        address token = t.token;
        if (t.parentTaskId == bytes32(0)) {
            payee = t.issuer; // root → human payer
            IERC20(token).safeTransfer(payee, amount);
        } else {
            // Child → return the slot to its parent (accounting only, treasury
            // unchanged). The parent can then re-delegate or release the value.
            Node storage parent = nodes[t.parentTaskId];
            parent.escrowed += amount;
            payee = parent.agent;
        }

        _settleUp(taskId);
        emit TaskRefunded(taskId, payee, amount);
    }

    /// @notice Cancel a node pre-validation and release its slot. Root cancel
    ///         is payer-only; a child cancel is allowed by its direct parent
    ///         agent (the orchestrator who issued it) or by the root payer
    ///         (ultimate authority). Requires the subtree settled.
    /// @param taskId Node to cancel.
    function cancel(bytes32 taskId) external nonReentrant {
        Node storage t = nodes[taskId];
        if (t.state == State.None) revert UnknownTask(taskId);
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.liveChildren != 0) revert ChildrenLive(taskId, t.liveChildren);
        if (t.state == State.Validated) revert AlreadyValidated(taskId);
        if (block.timestamp > t.expiry) revert WindowExpired(taskId, block.timestamp, t.expiry);

        // Authority: root → payer; child → direct parent agent (the delegate
        // issuer) OR the root human payer (ultimate authority over the tree).
        if (t.parentTaskId == bytes32(0)) {
            if (msg.sender != t.issuer) revert NotPayer(msg.sender, t.issuer);
        } else {
            bytes32 rootTaskId = _rootOf(t.parentTaskId);
            Node storage root = nodes[rootTaskId];
            if (msg.sender != t.issuer && msg.sender != root.issuer) {
                revert NotPayer(msg.sender, root.issuer);
            }
        }

        // Effects before interactions (CEI).
        t.state = State.Cancelled;
        uint256 amount = t.escrowed;
        t.escrowed = 0;

        address payee;
        address token = t.token;
        if (t.parentTaskId == bytes32(0)) {
            payee = t.issuer;
            IERC20(token).safeTransfer(payee, amount);
        } else {
            Node storage parent = nodes[t.parentTaskId];
            parent.escrowed += amount;
            payee = parent.agent;
        }

        _settleUp(taskId);
        emit TaskCancelled(taskId, payee, amount);
    }

    // ── Internals ──

    /// @dev Walk to the root ancestor (bounded depth via check below).
    function _rootOf(bytes32 start) internal view returns (bytes32) {
        bytes32 cur = start;
        for (uint256 i = 0; i < 256; i++) {
            Node storage n = nodes[cur];
            if (n.state == State.None) break; // defensive; shouldn't happen
            bytes32 up = n.parentTaskId;
            if (up == bytes32(0)) return cur;
            cur = up;
        }
        return cur;
    }

    /// @dev Decrement the direct parent's liveChildren after a node settles.
    ///      Runs LAST, after effects, so a settled parent unlock is visible.
    function _settleUp(bytes32 taskId) internal {
        Node storage t = nodes[taskId];
        Node storage parent = nodes[t.parentTaskId];
        if (t.parentTaskId != bytes32(0)) {
            if (parent.liveChildren > 0) parent.liveChildren -= 1;
        }
    }
}