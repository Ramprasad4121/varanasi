// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./lib/IERC20.sol";
import {SafeERC20} from "./lib/SafeERC20.sol";
import {ReentrancyGuard} from "./lib/ReentrancyGuard.sol";
import {EIP712} from "./lib/EIP712.sol";
import {ECDSA} from "./lib/ECDSA.sol";
import {RiskGuard} from "./RiskGuard.sol";

/// @title VaranasiTaskEscrow — ERC20-only escrow gated by EIP-712 mandates,
///         allowlisted validator scores, and a live RiskGuard re-check.
/// @author Ramprasad
/// @notice Phase 1 (ETHOnline 2026). Locked architecture per eng review:
///         ERC20-only (no payable, no receive/fallback), EIP-712 mandate with
///         embedded registry (no separate MandateRegistry contract), release iff
///         (latest validator score >= threshold AND inline
///         RiskGuard.authorize at release time), refund strictly after expiry,
///         permissionless release/refund (liveness), payer-only pre-validation
///         cancel, last-write-wins validator semantics, CEI + ReentrancyGuard +
///         SafeERC20 + pull settlement, no owner sweep, msg.sender + EIP-712
///         attribution (never tx.origin), block.timestamp-only clocks.
/// @dev ERC-8004 is a CLIENT-side concern only (Sepolia has no code at the
///      canonical registry addresses). This contract never imports or calls
///      IERC8004 onchain — settlement must not depend on ERC-8004 state.
///
/// State machine (ASCII, per repo diagram rule):
///
///                            fund(mandate,sig)
///       [NONE] ----------------------------------> [FUNDED]
///          |                                          |
///          | cancel (payer, pre-validation only)      | submitValidation (allowlisted,
///          |                                        | score in window, last-write-wins)
///          v                                          v
///     [CANCELLED] <------------------------------ [VALIDATED]
///          |                |
///          |  (terminal)    | release (anyone; re-checks latest score +
///          |                | RiskGuard.authorize live at release time)
///          |                v
///          |           [RELEASED] (terminal; pull to merchant)
///          |
///          | refund (anyone; block.timestamp > expiry STRICT;
///          | FUNDED or VALIDATED only)
///          v
///     [REFUNDED] (terminal; pull to payer)
///
///   Release re-reads the LATEST stored score plus live RiskGuard state and
///   never trusts the VALIDATED label alone (validator overwrite safety).
///   Every transition flips state BEFORE any token transfer (CEI).
contract TaskEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──

    /// @notice EIP-712 mandate signed by the human owner (payer). Agent executes.
    /// @dev Type string (locked):
    ///      "Mandate(address agent,address merchant,address token,uint256 cap,"
    ///      "uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,"
    ///      "uint256 chainId)"
    struct Mandate {
        address agent;
        address merchant; // payee
        address token; // ERC20 only
        uint256 cap; // max escrowed amount (base units)
        uint64 windowStart; // validation window open (block.timestamp clock)
        uint64 windowEnd; // validation window close (inclusive)
        uint64 expiry; // refund gate: refund iff block.timestamp > expiry
        uint256 nonce; // per-signer replay nullifier
        uint256 chainId; // must equal block.chainid (cross-chain replay guard)
    }

    /// @notice Lifecycle states for a task (None = uninitialized).
    enum State {
        None,
        Funded,
        Validated,
        Released,
        Refunded,
        Cancelled
    }

/// @notice Stored task record: embedded mandate fields plus settlement state.
/// @dev fundedAmount records tokens RECEIVED (fee-on-transfer safe); scoreBps
///      always holds the LATEST validator score (last-write-wins).
///      pinnedThresholdBps + pinnedValidator are frozen at fund/first-validation
///      time so later global admin changes cannot move a live task's goalposts;
///      release re-checks isValidator[pinnedValidator] live.
/// @dev QUALITY→RISK INVERSION (explicit): validator scores are QUALITY bps
///      (high = good work) while RiskGuard.authorize takes a RISK score
///      (low = safe). Release therefore calls
///      authorize(agent, BPS_DENOMINATOR - scoreBps, pinnedThresholdBps):
///      a task releases iff quality >= pinnedThreshold AND risk
///      (10_000 - quality) <= pinnedThreshold. For the symmetric 5_000 default
///      both bars coincide; for asymmetric thresholds the combined gate is
///      score >= max(pinned, 10_000 - pinned).
    struct Task {
        address payer; // mandate signer, receives refund/cancel
        address agent; // identity checked live via RiskGuard at release
        address merchant; // payee on release
        address token; // ERC20 held
        uint256 cap; // mandate cap, passed as maxAllowedBps to RiskGuard
        uint256 fundedAmount; // amount RECEIVED at fund (fee-on-transfer safe)
        uint64 windowStart;
        uint64 windowEnd;
        uint64 expiry;
        uint256 scoreBps; // LATEST validator score (last-write-wins)
        address validator; // author of latest score
        uint256 pinnedThresholdBps; // thresholdBps frozen at fund time
        address pinnedValidator; // first validator writer (later writes must match)
        State state;
    }

    // ── Constants ──

    /// @notice keccak256 of the locked Mandate type string above.
    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "Mandate(address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)"
    );

    /// @notice Basis-points denominator: scores and thresholds are 0-10_000.
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── Storage ──

    /// @notice Live RiskGuard re-checked inline at every release.
    RiskGuard public immutable riskGuard;
    /// @notice Contract admin: manages validators, threshold, ownership.
    /// @dev Production: timelock/multisig (no timelock code here by design).
    address public owner;
    /// @notice Pending owner set by transferOwnership; must call acceptOwnership.
    /// @dev Author: Ramprasad.
    address public pendingOwner;
    /// @notice Global release bar: release requires latest score >= thresholdBps.
    uint256 public thresholdBps;

    /// @notice signer => nonce => consumed (per-signer replay nullifier).
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    /// @notice taskId => Task (embedded mandate registry; no separate contract).
    mapping(bytes32 => Task) public tasks;
    /// @notice validator allowlist (owner-managed; single-EOA admin on testnet).
    mapping(address => bool) public isValidator;

    // ── Events (authoritative receipt; service indexes these read-only) ──

    /// @notice Emitted when escrow is funded from the payer's allowance.
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
    /// @notice Emitted when an allowlisted validator submits (or revises) a score.
    event ValidationSubmitted(bytes32 indexed taskId, address indexed validator, uint256 scoreBps);
    /// @notice Emitted when escrowed funds are released to the merchant.
    event TaskReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    /// @notice Emitted when escrowed funds are refunded to the payer after expiry.
    event TaskRefunded(bytes32 indexed taskId, address indexed payer, uint256 amount);
    /// @notice Emitted when the payer cancels a pre-validation escrow.
    event TaskCancelled(bytes32 indexed taskId, address indexed payer, uint256 amount);
    /// @notice Emitted when the validator allowlist is updated.
    event ValidatorUpdated(address indexed validator, bool allowed);
    /// @notice Emitted when the global release threshold is updated.
    event ThresholdUpdated(uint256 thresholdBps);
    /// @notice Emitted when contract ownership is transferred.
    event OwnershipTransferred(address indexed next);
    /// @notice Emitted when contract ownership transfer is initiated (2-step).
    /// @dev Author: Ramprasad.
    event OwnershipTransferStarted(address indexed next, address indexed prev);

    // ── Distinct errors (no shared/clever reuse; CLI maps revert -> message) ──

    /// @notice EIP-712 signature failed to recover a valid signer.
    error BadSig(address recovered);
    /// @notice Mandate nonce was already consumed by this signer.
    error NonceUsed(address signer, uint256 nonce);
    /// @notice Task id already exists (replay or duplicate mandate).
    error TaskExists(bytes32 taskId);
    /// @notice Task id is unknown (never funded).
    error UnknownTask(bytes32 taskId);
    /// @notice Mandate expiry is not in the future at fund time.
    error MandateExpired(uint64 expiry, uint256 nowTs);
    /// @notice Validation window is inverted (start > end).
    error BadWindow(uint64 windowStart, uint64 windowEnd);
    /// @notice Mandate agent address is zero.
    error ZeroAgent();
    /// @notice Mandate merchant address is zero.
    error ZeroMerchant();
    /// @notice Mandate token address is zero.
    error ZeroToken();
    /// @notice Mandate cap is zero.
    error ZeroCap();
    /// @notice Address argument is zero.
    error ZeroAddress();
    /// @notice Token pull pre-check failed (allowance or balance below cap).
    error TokenFail(address token, address from, uint256 amount);
    /// @notice Mandate chain id does not match the execution chain.
    error ChainIdMismatch(uint256 mandateChainId, uint256 chainId);
    /// @notice Caller is not an allowlisted validator.
    error NotValidator(address caller);
    /// @notice Task is not in Funded/Validated state for validation.
    error StaleTask(bytes32 taskId);
    /// @notice Validation submitted outside the mandate window.
    error OutsideWindow(bytes32 taskId, uint256 nowTs);
    /// @notice Score exceeds 10_000 bps.
    error BadScore(uint256 scoreBps);
    /// @notice No validation exists yet for this task.
    error NoValidation(bytes32 taskId);
    /// @notice Task was never funded or validated.
    error NotFundedOrValidated(bytes32 taskId);
    /// @notice Latest score is below the global threshold.
    error ScoreBelowThreshold(bytes32 taskId, uint256 scoreBps, uint256 thresholdBps);
    /// @notice Release attempted after expiry.
    error WindowExpired(bytes32 taskId, uint256 nowTs, uint64 expiry);
    /// @notice Refund attempted before expiry (must be strictly after).
    error NotExpired(bytes32 taskId, uint256 nowTs, uint64 expiry);
    /// @notice Task already reached a terminal state.
    error AlreadySettled(bytes32 taskId);
    /// @notice Task already validated (cancel no longer allowed).
    error AlreadyValidated(bytes32 taskId);
    /// @notice Caller is not the mandate payer.
    error NotPayer(address caller, address payer);
    /// @notice Caller is not the contract owner.
    error NotOwner(address caller);
    /// @notice Threshold exceeds 10_000 bps.
    error BadThreshold(uint256 thresholdBps);
    /// @notice A different validator tried to overwrite the pinned validator's score.
    /// @dev Author: Ramprasad.
    error ValidatorMismatch(bytes32 taskId, address expected, address caller);
    /// @notice Caller is not the pending owner.
    /// @dev Author: Ramprasad.
    error NotPendingOwner(address caller);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    /// @notice Deploy the escrow bound to a live RiskGuard and threshold.
    /// @param _riskGuard Live RiskGuard re-checked inline at every release.
    /// @param _thresholdBps Global release bar: score >= threshold (<= 10_000).
    constructor(address _riskGuard, uint256 _thresholdBps) EIP712("VaranasiTaskEscrow", "1") {
        if (_riskGuard == address(0)) revert ZeroAddress();
        if (_thresholdBps > BPS_DENOMINATOR) revert BadThreshold(_thresholdBps);
        riskGuard = RiskGuard(_riskGuard);
        owner = msg.sender;
        thresholdBps = _thresholdBps;
    }

    // ── Admin (owner-managed validator set + threshold; no sweep fn exists) ──

    /// @notice Add or remove an allowlisted validator.
    /// @param validator Validator address to update.
    /// @param allowed True to allow, false to remove.
    function setValidator(address validator, bool allowed) external onlyOwner {
        if (validator == address(0)) revert ZeroAddress();
        isValidator[validator] = allowed;
        emit ValidatorUpdated(validator, allowed);
    }

    /// @notice Update the global release threshold (score must be >= threshold).
    /// @param _thresholdBps New threshold in bps (must be <= 10_000).
    function setThreshold(uint256 _thresholdBps) external onlyOwner {
        if (_thresholdBps > BPS_DENOMINATOR) revert BadThreshold(_thresholdBps);
        thresholdBps = _thresholdBps;
        emit ThresholdUpdated(_thresholdBps);
    }

    /// @notice Transfer contract admin rights to a new owner (2-step).
    /// @param next New owner address (must be non-zero; must call acceptOwnership).
    /// @dev Author: Ramprasad.
    /// @dev Production: front this with a timelock (no timelock code here).
    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        pendingOwner = next;
        emit OwnershipTransferStarted(next, owner);
    }

    /// @notice Accept pending admin rights (called by the pending owner).
    /// @dev Author: Ramprasad.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner(msg.sender);
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(owner);
    }

    // ── EIP-712 helpers (public for clients/tests; domain binds chainId + this) ──

    /// @notice EIP-712 struct hash of a mandate (without domain separator).
    /// @param m Mandate to hash.
    /// @return structHash keccak256 of the Mandate type encoding.
    function mandateStructHash(Mandate calldata m) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MANDATE_TYPEHASH,
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

    /// @notice Full EIP-712 digest to sign (EIP-191 prefix + domain + struct).
    /// @param m Mandate to digest (domain binds chainId and this contract).
    /// @return digest Signable digest for the payer's EIP-712 signature.
    function mandateDigest(Mandate calldata m) public view returns (bytes32) {
        return _hashTypedDataV4(mandateStructHash(m));
    }

    /// @notice Lightweight state read (service indexer / UI poll this, not the
    ///         full 12-field tasks tuple).
    /// @param taskId Task to query.
    /// @return state Current lifecycle state of the task.
    function taskState(bytes32 taskId) external view returns (State) {
        return tasks[taskId].state;
    }

    /// @notice taskId derivation: keccak of the domain-bound digest (chain +
    ///         verifyingContract bound, so cross-chain/cross-deploy ids differ).
    /// @param m Mandate whose task id is derived.
    /// @return taskId keccak256 of the mandate digest.
    function mandateTaskId(Mandate calldata m) public view returns (bytes32) {
        return keccak256(abi.encode(mandateDigest(m)));
    }

    // ── Core ──

    /// @notice Fund an escrow from a signed mandate. Permissionless (sig-gated):
    ///         anyone may submit; funds are pulled from the SIGNER (payer), so
    ///         the signer must have set allowance(token, escrow) >= cap.
    /// @param m Mandate fields (chainId must equal block.chainid).
    /// @param sig EIP-712 signature over mandateDigest(m) by the payer.
    /// @return taskId New task id (== mandateTaskId(m)).
    function fund(Mandate calldata m, bytes calldata sig) external nonReentrant returns (bytes32 taskId) {
        _checkMandate(m);

        bytes32 digest = _hashTypedDataV4(mandateStructHash(m));
        (address signer, bool valid) = ECDSA.tryRecover(digest, sig);
        if (!valid || signer == address(0)) revert BadSig(signer);
        if (usedNonce[signer][m.nonce]) revert NonceUsed(signer, m.nonce);

        taskId = keccak256(abi.encode(digest));
        if (tasks[taskId].state != State.None) revert TaskExists(taskId);

        _pullAndRecord(taskId, signer, m);
    }

    /// @dev Static mandate field checks (chain, expiry, window, zero fields).
    function _checkMandate(Mandate calldata m) internal view {
        if (m.agent == address(0)) revert ZeroAgent();
        if (m.merchant == address(0)) revert ZeroMerchant();
        if (m.token == address(0)) revert ZeroToken();
        if (m.cap == 0) revert ZeroCap();
        if (m.chainId != block.chainid) revert ChainIdMismatch(m.chainId, block.chainid);
        if (m.expiry <= block.timestamp) revert MandateExpired(m.expiry, block.timestamp);
        if (m.windowStart > m.windowEnd) revert BadWindow(m.windowStart, m.windowEnd);
    }

    /// @dev Nullifier + task record (effects) then token pull (interaction),
    ///      then received-amount accounting. Split from fund for stack depth.
    function _pullAndRecord(bytes32 taskId, address signer, Mandate calldata m) internal {
        // Upfront allowance/balance probe so failures map to TokenFail
        // instead of an opaque token revert.
        if (IERC20(m.token).allowance(signer, address(this)) < m.cap) revert TokenFail(m.token, signer, m.cap);
        if (IERC20(m.token).balanceOf(signer) < m.cap) revert TokenFail(m.token, signer, m.cap);

        // Effects before interactions (CEI).
        usedNonce[signer][m.nonce] = true;
        Task storage t = tasks[taskId];
        t.payer = signer;
        t.agent = m.agent;
        t.merchant = m.merchant;
        t.token = m.token;
        t.cap = m.cap;
        t.windowStart = m.windowStart;
        t.windowEnd = m.windowEnd;
        t.expiry = m.expiry;
        t.pinnedThresholdBps = thresholdBps; // freeze the bar at fund time
        t.state = State.Funded;

        uint256 before = IERC20(m.token).balanceOf(address(this));
        IERC20(m.token).safeTransferFrom(signer, address(this), m.cap);
        t.fundedAmount = IERC20(m.token).balanceOf(address(this)) - before; // RECEIVED (fee-on-transfer safe)

        emit TaskFunded(taskId, signer, m.agent, m.merchant, m.token, t.fundedAmount, m.expiry, m.nonce);
    }

    /// @notice Submit (or revise) a validation score. Allowlisted validators
    ///         only; LAST-WRITE-WINS pre-settlement; post-settlement reverts.
    /// @param taskId Task to validate.
    /// @param scoreBps Numeric score in basis points (0-10_000, no eval/LLM here).
    /// @dev First validator write PINS pinnedValidator; later writes must come
    ///      from the SAME validator (kills flip-flop between competing
    ///      validators). Removing the pinned validator via setValidator blocks
    ///      release (release re-checks isValidator live).
    /// @dev Author: Ramprasad.
    function submitValidation(bytes32 taskId, uint256 scoreBps) external {
        Task storage t = tasks[taskId];
        if (t.state != State.Funded && t.state != State.Validated) revert StaleTask(taskId);
        if (!isValidator[msg.sender]) revert NotValidator(msg.sender);
        if (scoreBps > BPS_DENOMINATOR) revert BadScore(scoreBps);
        if (t.pinnedValidator == address(0)) {
            t.pinnedValidator = msg.sender; // first write pins
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

    /// @notice Release escrowed funds to the merchant. Permissionless (liveness:
    ///         anyone may settle once conditions hold). Succeeds iff ALL hold
    ///         AT RELEASE TIME: latest score >= PINNED threshold AND live
    ///         RiskGuard.authorize(agent, BPS - score, pinnedThreshold) passes AND
    ///         block.timestamp <= expiry AND the pinned validator is still
    ///         allowlisted. No partial release. Later global threshold changes
    ///         never move a funded task's bar (pinned at fund time).
    /// @param taskId Task to release.
    /// @dev Author: Ramprasad.
    function release(bytes32 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.state == State.None) revert NotFundedOrValidated(taskId);
        if (t.validator == address(0)) revert NoValidation(taskId);
        if (block.timestamp > t.expiry) revert WindowExpired(taskId, block.timestamp, t.expiry);
        if (!isValidator[t.pinnedValidator]) revert NotValidator(t.pinnedValidator);
        if (t.scoreBps < t.pinnedThresholdBps) {
            revert ScoreBelowThreshold(taskId, t.scoreBps, t.pinnedThresholdBps);
        }

        // Live guard re-check (Checks phase): revocation/expiry landing between
        // fund and release is caught HERE, never trusted from stored state or
        // events. Reverts UnauthorizedAgent / RiskTooHigh from RiskGuard.
        // QUALITY→RISK INVERSION (explicit): validator scores are quality
        // (high = good) but authorize takes risk (low = safe), so pass
        // BPS_DENOMINATOR - scoreBps against the PINNED threshold (NOT the
        // live global, NOT the token cap).
        riskGuard.authorize(t.agent, BPS_DENOMINATOR - t.scoreBps, t.pinnedThresholdBps);

        // Effects before interactions (CEI).
        t.state = State.Released;
        uint256 amount = t.fundedAmount;
        address merchant = t.merchant;
        address token = t.token;

        IERC20(token).safeTransfer(merchant, amount);

        emit TaskReleased(taskId, merchant, amount);
    }

    /// @notice Refund escrowed funds to the payer. Permissionless, strictly
    ///         after expiry (block.timestamp > expiry, no grace constant).
    /// @param taskId Task to refund (FUNDED or stale VALIDATED).
    function refund(bytes32 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        if (t.state == State.None) revert UnknownTask(taskId);
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (block.timestamp <= t.expiry) revert NotExpired(taskId, block.timestamp, t.expiry);

        // Effects before interactions (CEI).
        t.state = State.Refunded;
        uint256 amount = t.fundedAmount;
        address payer = t.payer;
        address token = t.token;

        IERC20(token).safeTransfer(payer, amount);

        emit TaskRefunded(taskId, payer, amount);
    }

    /// @notice Cancel pre-validation and return funds to the payer.
    ///         Payer-only, FUNDED state only (any validation kills cancel),
    ///         and only at block.timestamp <= expiry (clean split: after expiry
    ///         the refund path owns settlement).
    /// @param taskId Task to cancel.
    /// @dev Author: Ramprasad.
    function cancel(bytes32 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        if (t.state == State.None) revert UnknownTask(taskId);
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.state == State.Validated) revert AlreadyValidated(taskId);
        if (msg.sender != t.payer) revert NotPayer(msg.sender, t.payer);
        if (block.timestamp > t.expiry) revert WindowExpired(taskId, block.timestamp, t.expiry);

        // Effects before interactions (CEI).
        t.state = State.Cancelled;
        uint256 amount = t.fundedAmount;
        address payer = t.payer;
        address token = t.token;

        IERC20(token).safeTransfer(payer, amount);

        emit TaskCancelled(taskId, payer, amount);
    }

}
