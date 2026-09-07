// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {RiskGuard} from "./RiskGuard.sol";

/// @title VaranasiTaskEscrow — ERC20-only escrow gated by EIP-712 mandates,
///         allowlisted validator scores, and a live RiskGuard re-check.
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

    enum State {
        None,
        Funded,
        Validated,
        Released,
        Refunded,
        Cancelled
    }

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
        State state;
    }

    // ── Constants ──

    /// @notice keccak256 of the locked Mandate type string above.
    bytes32 public constant MANDATE_TYPEHASH = keccak256(
        "Mandate(address agent,address merchant,address token,uint256 cap,uint64 windowStart,uint64 windowEnd,uint64 expiry,uint256 nonce,uint256 chainId)"
    );

    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ── Storage ──

    RiskGuard public immutable riskGuard;
    address public owner;
    uint256 public thresholdBps;

    /// @notice signer => nonce => consumed (per-signer replay nullifier).
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    /// @notice taskId => Task (embedded mandate registry; no separate contract).
    mapping(bytes32 => Task) public tasks;
    /// @notice validator allowlist (owner-managed; single-EOA admin on testnet).
    mapping(address => bool) public isValidator;

    // ── Events (authoritative receipt; service indexes these read-only) ──

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
    event ValidationSubmitted(bytes32 indexed taskId, address indexed validator, uint256 scoreBps);
    event TaskReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event TaskRefunded(bytes32 indexed taskId, address indexed payer, uint256 amount);
    event TaskCancelled(bytes32 indexed taskId, address indexed payer, uint256 amount);
    event ValidatorUpdated(address indexed validator, bool allowed);
    event ThresholdUpdated(uint256 thresholdBps);
    event OwnershipTransferred(address indexed next);

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
    error BadThreshold(uint256 thresholdBps);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

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

    function setValidator(address validator, bool allowed) external onlyOwner {
        if (validator == address(0)) revert ZeroAddress();
        isValidator[validator] = allowed;
        emit ValidatorUpdated(validator, allowed);
    }

    function setThreshold(uint256 _thresholdBps) external onlyOwner {
        if (_thresholdBps > BPS_DENOMINATOR) revert BadThreshold(_thresholdBps);
        thresholdBps = _thresholdBps;
        emit ThresholdUpdated(_thresholdBps);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        owner = next;
        emit OwnershipTransferred(next);
    }

    // ── EIP-712 helpers (public for clients/tests; domain binds chainId + this) ──

    /// @notice EIP-712 struct hash of a mandate (without domain separator).
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
    function mandateDigest(Mandate calldata m) public view returns (bytes32) {
        return _hashTypedDataV4(mandateStructHash(m));
    }

    /// @notice Lightweight state read (service indexer / UI poll this, not the
    ///         full 12-field tasks tuple).
    function taskState(bytes32 taskId) external view returns (State) {
        return tasks[taskId].state;
    }

    /// @notice taskId derivation: keccak of the domain-bound digest (chain +
    ///         verifyingContract bound, so cross-chain/cross-deploy ids differ).
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
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, sig);
        if (err != ECDSA.RecoverError.NoError || signer == address(0)) revert BadSig(signer);
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
        t.state = State.Funded;

        address token = m.token;
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(signer, address(this), m.cap);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        t.fundedAmount = received; // amount RECEIVED (fee-on-transfer safe)

        emit TaskFunded(taskId, signer, m.agent, m.merchant, token, received, m.expiry, m.nonce);
    }

    /// @notice Submit (or revise) a validation score. Allowlisted validators
    ///         only; LAST-WRITE-WINS pre-settlement; post-settlement reverts.
    /// @param taskId Task to validate.
    /// @param scoreBps Numeric score in basis points (0-10_000, no eval/LLM here).
    function submitValidation(bytes32 taskId, uint256 scoreBps) external {
        Task storage t = tasks[taskId];
        if (t.state != State.Funded && t.state != State.Validated) revert StaleTask(taskId);
        if (!isValidator[msg.sender]) revert NotValidator(msg.sender);
        if (scoreBps > BPS_DENOMINATOR) revert BadScore(scoreBps);
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
    ///         AT RELEASE TIME: latest score >= threshold AND live
    ///         RiskGuard.authorize(agent, score, cap) passes AND
    ///         block.timestamp <= expiry. No partial release.
    /// @param taskId Task to release.
    function release(bytes32 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.state == State.None) revert NotFundedOrValidated(taskId);
        if (t.validator == address(0)) revert NoValidation(taskId);
        if (block.timestamp > t.expiry) revert WindowExpired(taskId, block.timestamp, t.expiry);
        if (t.scoreBps < thresholdBps) revert ScoreBelowThreshold(taskId, t.scoreBps, thresholdBps);

        // Live guard re-check (Checks phase): revocation/expiry landing between
        // fund and release is caught HERE, never trusted from stored state or
        // events. Reverts UnauthorizedAgent / RiskTooHigh from RiskGuard.
        // Locked wiring: authorize(agent, latestScore, cap). NOTE: cap is a
        // token AMOUNT, not bps; for USDC-scale caps it exceeds 10_000, so the
        // live UnauthorizedAgent identity check is the binding guard here and
        // score >= thresholdBps above is the binding bar.
        riskGuard.authorize(t.agent, t.scoreBps, t.cap);

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
    ///         Payer-only, FUNDED state only (any validation kills cancel).
    /// @param taskId Task to cancel.
    function cancel(bytes32 taskId) external nonReentrant {
        Task storage t = tasks[taskId];
        if (t.state == State.None) revert UnknownTask(taskId);
        if (
            t.state == State.Released || t.state == State.Refunded || t.state == State.Cancelled
        ) revert AlreadySettled(taskId);
        if (t.state == State.Validated) revert AlreadyValidated(taskId);
        if (msg.sender != t.payer) revert NotPayer(msg.sender, t.payer);

        // Effects before interactions (CEI).
        t.state = State.Cancelled;
        uint256 amount = t.fundedAmount;
        address payer = t.payer;
        address token = t.token;

        IERC20(token).safeTransfer(payer, amount);

        emit TaskCancelled(taskId, payer, amount);
    }

}
