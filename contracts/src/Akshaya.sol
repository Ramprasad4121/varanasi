// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVaranasiTaskEscrow} from "./interfaces/IVaranasiTaskEscrow.sol";

/// @title Akshaya — the Imperishable: proof-of-outcome agent reputation
/// @author Ramprasad
/// @notice What it is: a reputation registry that NOBODY can write opinions
///         into. Anyone may call `attest(taskId)`, but the only accepted
///         evidence is the escrow contract itself: Akshaya reads
///         `VaranasiTaskEscrow.tasks(taskId)` live and mints a soulbound
///         receipt ONLY for a terminal, money-moved outcome —
///         Released → an Akshaya coin (+W_REL to the agent's index),
///         Refunded → a Dust mark (−W_DUST). Cancelled/active → nothing.
/// @dev Why "capital-secured reputation": every coin required a real payer to
///      escrow real cap, a validator to clear a quality bar, and a live
///      identity gate at release. Reputation cannot be farmed for free; the
///      cheapest forge is an honest refund, which costs the agent's future.
/// @dev Decay: the index is a half-life accumulator — raw scores decay by ½
///      every PERIOD (90d) via integer right-shifts (arithmetic shift keeps
///      sign for negative dust; each period rounds dust toward zero, which
///      forgives slow agents but never forgets them instantly). A one-off
///      great hire matters for months; a long quiet stretch washes both coin
///      and dust back toward zero. `scoreOf` is a view — zero storage churn.
/// @dev Soulbound: receipts are non-transferable by construction (transfer /
///      approve exist only to revert with `Soulbound()` — wallets and
///      indexers see a well-formed ERC-721 event surface).
/// @dev Trust surface: no owner, no admin, no upgrade, no oracle, no
///      operator key. The ONLY assumption is the immutable escrow address it
///      reads. Deploy once; the registry of good faith cannot be silenced.
contract Akshaya {
    // ── Constants ──

    /// @notice Half-life, in seconds, of an agent's reputation index (90 days).
    uint256 public constant PERIOD = 90 days;
    /// @notice Index bump for one Released task (in bps-equivalent units).
    int256 public constant W_REL = 10_000;
    /// @notice Index penalty for one Refunded (missed-bar) task.
    int256 public constant W_DUST = 4_000;

    /// @notice Outcome codes stored with each receipt.
    uint8 public constant OUTCOME_RELEASED = 1;
    /// @notice Outcome code for a refunded (missed-bar) task.
    uint8 public constant OUTCOME_REFUNDED = 2;

    // ── Types ──

    /// @notice One soulbound receipt for one terminal outcome.
    struct Receipt {
        address agent; // soul the receipt is bound to
        uint8 outcome; // 1 = Released (coin) · 2 = Refunded (dust)
        uint64 at; // block.timestamp at attestation
        uint64 scoreBps; // validator quality score recorded on the task
    }

    /// @notice Per-agent rolling ledger backing the decayed score.
    struct Ledger {
        uint128 coins; // lifetime Released outcomes
        uint128 dust; // lifetime Refunded outcomes
        int256 raw; // decay accumulator, scaled by 2^periods-since-anchor
        uint32 period; // period index at last accrual (block.timestamp / PERIOD)
    }

    // ── Storage ──

    /// @notice The escrow whose terminal states are the only admissible evidence.
    IVaranasiTaskEscrow public immutable escrow;
    /// @notice tokenId => Receipt (tokenId starts at 1; 0 is "no token").
    mapping(uint256 => Receipt) public receipt;
    /// @notice taskId => minted tokenId (idempotency anchor + client lookup).
    mapping(bytes32 => uint256) public tokenByTask;
    /// @notice agent => rolling ledger.
    mapping(address => Ledger) public ledger;

    // ERC-721 (soulbound) surface — events per spec so indexers work as-is.
    mapping(uint256 => address) private _owner;
    mapping(address => uint256) private _balance;
    uint256 private _nextTokenId = 1;
    // Approvals exist only to be refused: this keeps the interface honest.
    mapping(uint256 => address) private _approved;
    mapping(address => mapping(address => bool)) private _operator;

    // ── Events ──

    /// @notice A terminal outcome was attested and its receipt minted.
    event Attested(bytes32 indexed taskId, address indexed agent, uint8 outcome, uint256 indexed tokenId);
    /// @notice Emitted on every receipt mint (spec-compliant ERC-721 Transfer).
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    /// @notice Emitted — always zero-address to zero-address: nothing is
    ///         approvable on a soulbound receipt. Present for indexer parity.
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    /// @notice Emitted for ERC-721 indexer parity; every pair is pinned false.
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ── Errors ──

    /// @notice Task is not attested yet (state must be Released or Refunded).
    error NotSettled(bytes32 taskId);
    /// @notice This task was already attested (one receipt per outcome).
    error AlreadyAttested(bytes32 taskId);
    /// @notice Receipts are non-transferable — forever, by design.
    error Soulbound();
    /// @notice Unknown tokenId.
    error UnknownToken(uint256 tokenId);

    /// @notice Bind Akshaya to a deployed TaskEscrow. That binding is eternal.
    /// @param _escrow VaranasiTaskEscrow address whose outcomes define truth.
    constructor(address _escrow) {
        escrow = IVaranasiTaskEscrow(_escrow);
    }

    // ── Attestation (the only write path) ──

    /// @notice Attest a task's terminal outcome. Permissionless: the evidence is
    ///         the escrow's own storage — the caller supplies nothing but the id.
    /// @param taskId Task to attest (must be Released or Refunded on-chain).
    /// @return tokenId Receipt token minted to the agent.
    function attest(bytes32 taskId) public returns (uint256 tokenId) {
        if (tokenByTask[taskId] != 0) revert AlreadyAttested(taskId);

        // Read the escrow directly: (payer, agent, merchant, token, cap,
        // funded, windowStart, windowEnd, expiry, scoreBps, validator,
        // pinnedThreshold, pinnedValidator, state) — only agent, score, state
        // are consulted; everything else is evidence we must not reinterpret.
        (, address agent, , , , , , , , uint256 scoreBps, , , , uint8 state) = escrow.tasks(taskId);
        if (state != 3 && state != 4) revert NotSettled(taskId);
        uint8 outcome = state == 3 ? OUTCOME_RELEASED : OUTCOME_REFUNDED;

        uint256 id = _nextTokenId;
        tokenByTask[taskId] = id;
        receipt[id] = Receipt({agent: agent, outcome: outcome, at: uint64(block.timestamp), scoreBps: uint64(scoreBps)});

        _accrue(agent, outcome);
        _mint(agent, id);
        emit Attested(taskId, agent, outcome, id);
        unchecked {
            ++_nextTokenId;
        }
        tokenId = id;
    }

    /// @notice Batch attest. Reverts wholesale if any entry is invalid (a
    ///         partially-attested batch is exactly the confusion this repo
    ///         exists to remove — callers must present provable ids only).
    /// @param taskIds Tasks to attest.
    function attestBatch(bytes32[] calldata taskIds) external {
        for (uint256 i; i < taskIds.length; ++i) attest(taskIds[i]);
    }

    /// @dev Decay-then-add. `raw` is the index scaled by 2^k where k counts
    ///      periods since this agent's last accrual; shifting right by the
    ///      elapsed delta re-scales before adding the new weight.
    function _accrue(address agent, uint8 outcome) private {
        Ledger storage l = ledger[agent];
        uint32 pNow = uint32(block.timestamp / PERIOD);
        uint32 delta = pNow - l.period; // monotonic clock; underflow impossible
        if (delta >= 32) {
            l.raw = outcome == OUTCOME_RELEASED ? W_REL : -W_DUST; // fully washed
        } else {
            l.raw = (l.raw >> delta) + (outcome == OUTCOME_RELEASED ? W_REL : -W_DUST);
        }
        l.period = pNow;
        if (outcome == OUTCOME_RELEASED) {
            ++l.coins;
        } else {
            ++l.dust;
        }
    }

    // ── Reputation views ──

    /// @notice Decay-corrected reputation index right now (can be negative).
    /// @dev 10_000 ≈ one fresh release at full weight; halves every PERIOD.
    function scoreOf(address agent) public view returns (int256) {
        Ledger storage l = ledger[agent];
        uint32 delta = uint32(block.timestamp / PERIOD) - l.period;
        if (delta >= 32) return 0;
        return l.raw >> delta;
    }

    /// @notice Full read surface for services/UIs in one call.
    /// @return coins lifetime releases
    /// @return dust lifetime refunds
    /// @return score current decayed index
    /// @return lastPeriod accrual anchor (periods since zero time)
    function statsOf(address agent)
        external
        view
        returns (uint128 coins, uint128 dust, int256 score, uint32 lastPeriod)
    {
        Ledger storage l = ledger[agent];
        return (l.coins, l.dust, scoreOf(agent), l.period);
    }

    // ── Soulbound ERC-721 surface ──

    /// @notice Owner of a receipt (the agent soul it is bound to).
    function ownerOf(uint256 tokenId) external view returns (address) {
        address o = _owner[tokenId];
        if (o == address(0)) revert UnknownToken(tokenId);
        return o;
    }

    /// @notice Receipts held by `agent` (coins + dust).
    function balanceOf(address agent) external view returns (uint256) {
        return _balance[agent];
    }

    /// @notice Total receipts ever minted.
    function totalReceipts() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @dev Mint — internal-only. There is no burn: the record is Imperishable
    ///      (Akshaya), and decay already prices staleness into the score.
    function _mint(address to, uint256 tokenId) private {
        _owner[tokenId] = to;
        _balance[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }
    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }
    function approve(address, uint256) external pure {
        revert Soulbound();
    }
    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }
    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }
    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }
    /// @notice ERC-165 support probe: 0x80ac5870 (ERC-721).
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac5870 || id == 0x01ffc9a7;
    }
}
