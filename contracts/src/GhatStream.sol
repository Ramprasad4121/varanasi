// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./lib/IERC20.sol";
import {SafeERC20} from "./lib/SafeERC20.sol";
import {ReentrancyGuard} from "./lib/ReentrancyGuard.sol";
import {EIP712} from "./lib/EIP712.sol";
import {ECDSA} from "./lib/ECDSA.sol";

/// @title AegisRegistry — minimum surface GhatStream needs for the live-identity gate
/// @dev Only `isAuthorized` is called; interface kept minimal so the gate works
///      against any registry with the same semantics (AegisRegistry does).
interface IIdentityGate {
    function isAuthorized(address agent) external view returns (bool);
}

/// @title GhatStream — continuous escrow for agentic work
/// @author Ramprasad
/// @notice Escrow that flows: a human signs a stream mandate (agent, token,
///         per-second rate, hard cap, max duration, expiry) and the cap locks
///         in this contract. The agent accrues second-by-second and claims the
///         accrued dust whenever it wants — or a relayer claims for it (funds
///         always route to the agent). The human can STOP at any instant:
///         accrual freezes where it stands, and the entire unearned remainder
///         is always, unconditionally refundable. Bounded harm is the product.
/// @dev Invented here, named after the ghats of Varanasi, where the flow meets
///      the stone: the river (work) moves continuously, the steps (mandate)
///      decide where it can and cannot reach.
/// @dev Semantics:
///      • accrued(t) = min(cap, ratePerSecond × min(t − openedAt, maxDuration))
///      • claimable  = min(accrued(now) − claimed, cap − claimed) — and after
///        stop()/auto-freeze, accrued no longer grows (frozen at stop time)
///      • stop(): payer-only, freezes accrual, refunds 0..cap−claimed to payer
///        ONLY at close; the agent keeps a claim window until expiry
///      • close(): after expiry, anyone may sweep the unclaimed remainder to
///        the payer; claims after close revert — so an idle agent's unclaimed
///        accrued expires back to the human. "Nothing flows past the ghat."
///      • Once cap is fully claimed, the stream self-closes (auto-unwind).
/// @dev Mandate enforcement mirrors TaskEscrow: EIP-712 signed by the payer,
///      per-signer nonce nullification, chainId binding, id = keccak(digest),
///      permissionless submission (anyone can open a correctly-signed stream;
///      funds are pulled from the SIGNER). Optional live-identity gate: when a
///      registry is bound, opening requires `isAuthorized(agent)` — the same
///      kill switch the escrow's release path re-checks. Revoking an identity
///      never steals accrued money (work is work); it only stops new flows.
/// @dev CEI everywhere, SafeERC20 (non-standard tokens tolerated),
///      ReentrancyGuard on every token-moving function, no admin keys over
///      user funds. The identity gate is constructor-fixed: no admin, ever.
contract GhatStream is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──

    /// @notice Stream mandate signed by the human (payer). Type string (locked):
    ///  "StreamMandate(address agent,address payer,address token,uint256 ratePerSecond,
    ///   uint256 cap,uint64 maxDuration,uint64 expiry,uint256 nonce,uint256 chainId)"
    struct StreamMandate {
        address agent; // who the flow pays
        address payer; // who signs and funds (must equal msg.sender pull source)
        address token; // ERC20 only, like TaskEscrow
        uint256 ratePerSecond; // base units streamed per second
        uint256 cap; // total escrowed on open — the hardest bound
        uint64 maxDuration; // seconds until accrual saturates (at cap anyway)
        uint64 expiry; // after this, anyone may close() and sweep remainder
        uint256 nonce; // per-payer replay nullifier
        uint256 chainId; // must equal block.chainid
    }

    /// @notice Stored stream. `frozenAccrued` is set once when accrual stops.
    struct Stream {
        address payer;
        address agent;
        address token;
        uint256 ratePerSecond;
        uint256 cap; // escrowed amount actually RECEIVED (fee-on-transfer safe)
        uint256 claimed; // lifetime paid to agent
        uint256 refunded; // lifetime swept back to payer
        uint64 openedAt;
        uint64 maxDuration;
        uint64 expiry;
        uint64 frozenAt; // 0 while flowing; else timestamp accrual stopped
        bool closed;
    }

    // ── Constants ──

    /// @notice keccak256 of the locked StreamMandate type string.
    bytes32 public constant STREAM_MANDATE_TYPEHASH = keccak256(
        "StreamMandate(address agent,address payer,address token,uint256 ratePerSecond,uint256 cap,uint64 maxDuration,uint64 expiry,uint256 nonce,uint256 chainId)"
    );

    // ── Storage ──

    /// @notice streamId => Stream (0-id absent).
    mapping(bytes32 => Stream) public streams;
    /// @notice payer => nonce => consumed (replay nullifier, per signer).
    mapping(address => mapping(uint256 => bool)) public usedNonce;
    /// @notice Identity gate (may be address(0) = gate disabled). Fixed at
    ///         construction — the whole contract has no mutable admin at all.
    IIdentityGate public immutable gate;

    // ── Events ──

    /// @notice A stream was opened and its cap escrowed.
    event StreamOpened(bytes32 indexed streamId, address indexed payer, address indexed agent, address token, uint256 cap, uint256 ratePerSecond, uint64 openedAt, uint64 expiry);
    /// @notice Accrued units were paid out to the agent.
    event StreamClaimed(bytes32 indexed streamId, uint256 amount, uint256 claimedTotal);
    /// @notice Payer stopped the flow; accrual frozen until expiry.
    event StreamStopped(bytes32 indexed streamId, uint256 frozenAccrued);
    /// @notice Stream closed; unclaimed remainder returned to the payer.
    event StreamClosed(bytes32 indexed streamId, uint256 remainderToPayer);

    // ── Errors ──

    error BadSig(address recovered);
    error NonceUsed(address signer, uint256 nonce);
    error StreamExists(bytes32 streamId);
    error UnknownStream(bytes32 streamId);
    error StreamClosedAlready(bytes32 streamId);
    error NotExpiredYet(bytes32 streamId, uint256 nowTs, uint64 expiry);
    error NothingToClaim(bytes32 streamId);
    error MandateExpired(uint64 expiry, uint256 nowTs);
    error ZeroAgent();
    error ZeroPayer();
    error ZeroToken();
    error ZeroCap();
    error ZeroRate();
    error ZeroDuration();
    error BadWindow(uint64 maxDuration, uint64 expiry);
    error ChainIdMismatch(uint256 mandateChainId, uint256 chainId);
    error TokenFail(address token, address from, uint256 amount);
    error NotPayer(address caller, address payer);
    error RateOverflowsCap(uint256 ratePerSecond, uint64 maxDuration);
    error UnauthorizedAgent(address agent);

    /// @notice Bind the identity gate.
    /// @param _gate AegisRegistry (isAuthorized) or address(0) to disable gating.
    constructor(address _gate) EIP712("GhatStream", "1") {
        gate = IIdentityGate(_gate);
    }

    // ── EIP-712 helpers (public: CLI + wizard reuse them for offline signing) ──

    /// @notice EIP-712 struct hash of a stream mandate.
    function streamMandateStructHash(StreamMandate calldata m) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                STREAM_MANDATE_TYPEHASH,
                m.agent,
                m.payer,
                m.token,
                m.ratePerSecond,
                m.cap,
                m.maxDuration,
                m.expiry,
                m.nonce,
                m.chainId
            )
        );
    }

    /// @notice Full EIP-712 digest to sign.
    function streamMandateDigest(StreamMandate calldata m) public view returns (bytes32) {
        return _hashTypedDataV4(streamMandateStructHash(m));
    }

    /// @notice streamId derivation: keccak of the domain-bound digest.
    function streamTaskId(StreamMandate calldata m) public view returns (bytes32) {
        return keccak256(abi.encode(streamMandateDigest(m)));
    }

    // ── Views ──

    /// @notice Units accrued so far (frozen after stop, saturated at maxDuration).
    function accruedOf(bytes32 streamId) public view returns (uint256) {
        Stream storage s = streams[streamId];
        if (s.agent == address(0)) return 0;
        uint64 clock = s.frozenAt != 0 ? s.frozenAt : uint64(block.timestamp);
        uint64 elapsed = clock > s.openedAt ? clock - s.openedAt : 0;
        if (elapsed > s.maxDuration) elapsed = s.maxDuration;
        uint256 flow = elapsed * s.ratePerSecond;
        return flow > s.cap ? s.cap : flow;
    }

    /// @notice Currently claimable (accrued − claimed; 0 when closed).
    function claimableOf(bytes32 streamId) public view returns (uint256) {
        Stream storage s = streams[streamId];
        if (s.closed) return 0;
        uint256 acc = accruedOf(streamId);
        return acc > s.claimed ? acc - s.claimed : 0;
    }

    /// @notice Remainder that returns to the payer on close.
    function remainderOf(bytes32 streamId) public view returns (uint256) {
        Stream storage s = streams[streamId];
        if (s.agent == address(0)) return 0;
        uint256 held = s.cap - s.refunded;
        return held > s.claimed ? held - s.claimed : 0;
    }

    // ── Core lifecycle ──

    /// @notice Open a stream from a signed mandate (mirror of TaskEscrow.fund):
    ///         permissionless submission, signer-pulled funds, nonce burn.
    /// @param m StreamMandate fields (chainId must equal block.chainid).
    /// @param sig EIP-712 signature over streamMandateDigest(m) by the payer.
    /// @return streamId = streamTaskId(m).
    function open(StreamMandate calldata m, bytes calldata sig) external nonReentrant returns (bytes32 streamId) {
        if (m.agent == address(0)) revert ZeroAgent();
        if (m.payer == address(0)) revert ZeroPayer();
        if (m.token == address(0)) revert ZeroToken();
        if (m.cap == 0) revert ZeroCap();
        if (m.ratePerSecond == 0) revert ZeroRate();
        if (m.maxDuration == 0) revert ZeroDuration();
        if (m.ratePerSecond > type(uint256).max / m.maxDuration) revert RateOverflowsCap(m.ratePerSecond, m.maxDuration);
        if (m.chainId != block.chainid) revert ChainIdMismatch(m.chainId, block.chainid);
        if (m.expiry <= block.timestamp) revert MandateExpired(m.expiry, block.timestamp);
        if (address(gate) != address(0) && !gate.isAuthorized(m.agent)) revert UnauthorizedAgent(m.agent);

        bytes32 digest = _hashTypedDataV4(streamMandateStructHash(m));
        (address signer, bool valid) = ECDSA.tryRecover(digest, sig);
        if (!valid || signer != m.payer) revert BadSig(signer);
        if (usedNonce[signer][m.nonce]) revert NonceUsed(signer, m.nonce);

        streamId = keccak256(abi.encode(digest));
        if (streams[streamId].agent != address(0)) revert StreamExists(streamId);

        // Upfront probes so failures map to TokenFail, not opaque token reverts.
        if (IERC20(m.token).allowance(signer, address(this)) < m.cap) revert TokenFail(m.token, signer, m.cap);
        if (IERC20(m.token).balanceOf(signer) < m.cap) revert TokenFail(m.token, signer, m.cap);

        // Effects.
        usedNonce[signer][m.nonce] = true;
        Stream storage s = streams[streamId];
        s.payer = signer;
        s.agent = m.agent;
        s.token = m.token;
        s.ratePerSecond = m.ratePerSecond;
        s.maxDuration = m.maxDuration;
        s.expiry = m.expiry;
        s.openedAt = uint64(block.timestamp);

        // Interaction + received-amount accounting (fee-on-transfer safe).
        uint256 before = IERC20(m.token).balanceOf(address(this));
        IERC20(m.token).safeTransferFrom(signer, address(this), m.cap);
        s.cap = IERC20(m.token).balanceOf(address(this)) - before;

        emit StreamOpened(streamId, signer, m.agent, m.token, s.cap, m.ratePerSecond, s.openedAt, m.expiry);
    }

    /// @notice Pay accrued units to the agent. Callable by anyone (liveness);
    ///         funds can ONLY ever move to s.agent. Auto-unwinds when the cap
    ///         is fully claimed — no dangling zero-balance streams.
    /// @param streamId Stream to claim on.
    /// @return amount Units just paid out (0 → revert, gas-free idempotence).
    function claim(bytes32 streamId) external nonReentrant returns (uint256 amount) {
        Stream storage s = streams[streamId];
        if (s.agent == address(0)) revert UnknownStream(streamId);
        if (s.closed) revert StreamClosedAlready(streamId);

        uint256 acc = accruedOf(streamId);
        amount = acc > s.claimed ? acc - s.claimed : 0;
        if (amount == 0) revert NothingToClaim(streamId);

        // Effects before interactions.
        s.claimed += amount;
        address agent = s.agent;
        address token = s.token;

        IERC20(token).safeTransfer(agent, amount);
        emit StreamClaimed(streamId, amount, s.claimed);

        // Auto-unwind: full cap claimed → nothing can remain to refund.
        if (s.claimed == s.cap) {
            s.closed = true;
            emit StreamClosed(streamId, 0);
        }
    }

    /// @notice Payer stop-cock: freeze accrual at the current instant. The
    ///         agent keeps claiming what it earned until expiry; the unearned
    ///         remainder leaves on close(). Bounded harm, at any moment:
    ///         worst case the agent earns exactly what flowed so far.
    /// @param streamId Stream to stop.
    function stop(bytes32 streamId) external {
        Stream storage s = streams[streamId];
        if (s.agent == address(0)) revert UnknownStream(streamId);
        if (msg.sender != s.payer) revert NotPayer(msg.sender, s.payer);
        if (s.frozenAt != 0 || s.closed) revert StreamClosedAlready(streamId);

        s.frozenAt = uint64(block.timestamp);
        emit StreamStopped(streamId, accruedOf(streamId));
    }

    /// @notice Close after expiry (or after the flow was stopped and claimed
    ///         out, still gated on expiry): sweep every unclaimed unit back to
    ///         the payer. Permissionless for liveness.
    /// @param streamId Stream to close.
    /// @return remainder Units returned to the payer.
    function close(bytes32 streamId) external nonReentrant returns (uint256 remainder) {
        Stream storage s = streams[streamId];
        if (s.agent == address(0)) revert UnknownStream(streamId);
        if (s.closed) revert StreamClosedAlready(streamId);

        uint256 held = s.cap - s.refunded;
        remainder = held > s.claimed ? held - s.claimed : 0;
        // Close is gated on expiry — UNLESS the flow was stopped and fully
        // claimed (remainder 0): then closing early just settles the books.
        if (block.timestamp <= s.expiry && !(remainder == 0 && s.frozenAt != 0)) {
            revert NotExpiredYet(streamId, block.timestamp, s.expiry);
        }

        // Effects.
        s.closed = true;
        s.refunded += remainder;
        if (s.frozenAt == 0) s.frozenAt = uint64(block.timestamp);
        address payer = s.payer;
        address token = s.token;

        if (remainder > 0) IERC20(token).safeTransfer(payer, remainder);
        emit StreamClosed(streamId, remainder);
    }

    /// @notice Read the whole stream in one call (UIs/services).
    function streamOf(bytes32 streamId)
        external
        view
        returns (
            address payer,
            address agent,
            address token,
            uint256 ratePerSecond,
            uint256 cap,
            uint256 claimed,
            uint256 refunded,
            uint256 accrued,
            uint64 openedAt,
            uint64 maxDuration,
            uint64 expiry,
            bool frozen,
            bool closed
        )
    {
        Stream storage s = streams[streamId];
        return (
            s.payer,
            s.agent,
            s.token,
            s.ratePerSecond,
            s.cap,
            s.claimed,
            s.refunded,
            accruedOf(streamId),
            s.openedAt,
            s.maxDuration,
            s.expiry,
            s.frozenAt != 0,
            s.closed
        );
    }
}
