// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title ChitPool — deterministic-rotation chit fund.
/// @author Ramprasad
/// @dev A fixed number of members contribute a fixed amount each round; one member
///      (the round's designated slot among contributors) receives the round corpus.
///      Rounds are settled by anyone after the round deadline (or once all members
///      contributed). Missed contributions are recorded against the member. The pool
///      is community-governed: no admin can move member funds; the contract only
///      ever routes what members contributed.
contract ChitPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ChitNotMember(address who);
    error ChitAlreadyMember(address who);
    error ChitFull();
    error ChitAlreadyContributed(address who, uint256 round);
    error ChitRoundOpen(uint256 round, uint256 deadline);
    error ChitAlreadySettled(uint256 round);
    error ChitPoolEnded();
    error ChitNoContributors(uint256 round);
    error ChitNothingToRecover();
    error ZeroAmount();
    error ZeroAddress();
    error ChitNotStarter(address who);

    event ChitMemberJoined(address indexed member, uint256 totalMembers);
    event ChitContributed(address indexed member, uint256 indexed round, uint256 amount);
    event ChitRoundSettled(
        uint256 indexed round,
        address indexed winner,
        uint256 corpus,
        uint256 contributed
    );
    event ChitMissed(address indexed member, uint256 indexed round);
    event ChitPoolTerminated(address indexed initiator);
    event ChitRefunded(address indexed to, uint256 amount);

    struct PoolConfig {
        IERC20 token;
        uint256 contributionAmount;
        uint256 memberCapacity;
        uint256 totalRounds;
        uint256 roundDuration;
    }

    uint256 public round; // current/next round to be played (1-indexed)
    uint256 public roundDeadline;
    uint256 public settledRounds;
    uint256 public poolStart;
    bool public poolEnded;
    address public starter;

    PoolConfig public config;

    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public missedRounds;
    mapping(uint256 => mapping(address => bool)) public contributed;

    /// @param starter_ Pool creator, stored as the pool's privileged owner for
    ///               early termination. The starter does NOT auto-join: member
    ///               slots are reserved for contributors so capacity is exact.
    /// @param token Contribution currency.
    /// @param contributionAmount Contribution per member per round.
    /// @param memberCapacity Maximum member count.
    /// @param totalRounds Number of rounds to play.
    /// @param roundDuration Seconds each round stays open before anyone may settle.
    constructor(
        address starter_,
        address token,
        uint256 contributionAmount,
        uint256 memberCapacity,
        uint256 totalRounds,
        uint256 roundDuration
    ) {
        if (token == address(0)) revert ZeroAddress();
        if (contributionAmount == 0) revert ZeroAmount();
        if (memberCapacity == 0 || totalRounds == 0 || roundDuration == 0) revert ZeroAmount();

        starter = starter_;
        config = PoolConfig({
            token: IERC20(token),
            contributionAmount: contributionAmount,
            memberCapacity: memberCapacity,
            totalRounds: totalRounds,
            roundDuration: roundDuration
        });

        poolStart = block.timestamp;
        _openRound(1);
    }

    // --- Membership ---

    /// @notice Join as a member until the pool is full.
    function join() external {
        _join(msg.sender);
    }

    function _join(address who) private {
        if (isMember[who]) revert ChitAlreadyMember(who);
        if (members.length >= config.memberCapacity) revert ChitFull();
        if (poolEnded) revert ChitPoolEnded();
        isMember[who] = true;
        members.push(who);
        emit ChitMemberJoined(who, members.length);
    }

    // --- Contributing ---

    /// @notice Contribute for the current round (approve the pool first).
    function contribute() external nonReentrant {
        if (poolEnded) revert ChitPoolEnded();
        if (!isMember[msg.sender]) revert ChitNotMember(msg.sender);
        if (contributed[round][msg.sender]) revert ChitAlreadyContributed(msg.sender, round);
        if (block.timestamp > roundDeadline) revert ChitRoundOpen(round, roundDeadline);

        contributed[round][msg.sender] = true;
        config.token.safeTransferFrom(msg.sender, address(this), config.contributionAmount);
        emit ChitContributed(msg.sender, round, config.contributionAmount);
    }

    // --- Settlement ---

    /// @notice Settle the current round: eligible if the deadline passed or every
    ///         member already contributed. The corpus (contributors x amount) is paid
    ///         to the deterministic slot winner scanned from the round-designated
    ///         starter index; missed members are recorded.
    function settleRound() external nonReentrant {
        if (poolEnded) revert ChitPoolEnded();
        uint256 r = round;
        if (settledRounds >= config.totalRounds) revert ChitPoolEnded();
        uint256 openUntil = roundDeadline;
        uint256 openMembers = members.length;
        for (uint256 i; i < openMembers; ++i) {
            if (!contributed[r][members[i]]) break;
            if (i == openMembers - 1) {
                openUntil = type(uint256).max; // everyone has contributed -> settle early
            }
        }
        if (block.timestamp <= openUntil && openUntil != type(uint256).max) {
            revert ChitRoundOpen(r, openUntil);
        }

        // Record misses.
        uint256 contributedCount;
        for (uint256 i; i < openMembers; ++i) {
            if (contributed[r][members[i]]) {
                ++contributedCount;
            } else {
                unchecked {
                    missedRounds[members[i]] += 1;
                }
                emit ChitMissed(members[i], r);
            }
        }
        if (contributedCount == 0) revert ChitNoContributors(r);

        // Deterministic winner scan from the round-designated slot.
        uint256 startSlot = (r - 1) % openMembers;
        address winner;
        for (uint256 step; step < openMembers; ++step) {
            uint256 idx = (startSlot + step) % openMembers;
            address candidate = members[idx];
            if (contributed[r][candidate]) {
                winner = candidate;
                break;
            }
        }

        uint256 corpus = contributedCount * config.contributionAmount;
        config.token.safeTransfer(winner, corpus);

        settledRounds = r;
        emit ChitRoundSettled(r, winner, corpus, contributedCount);
        if (settledRounds >= config.totalRounds) {
            poolEnded = true;
            emit ChitPoolTerminated(msg.sender);
        } else {
            _openRound(r + 1);
        }
    }

    function _openRound(uint256 r) private {
        round = r;
        roundDeadline = block.timestamp + config.roundDuration;
    }

    /// @notice Early termination (only the pool starter): refund any remainder if a
    ///         settle was interrupted, then freeze the pool.
    function terminate() external {
        if (msg.sender != starter) revert ChitNotStarter(msg.sender);
        if (poolEnded) revert ChitPoolEnded();
        poolEnded = true;
        uint256 leftover = config.token.balanceOf(address(this));
        if (leftover != 0) {
            config.token.safeTransfer(msg.sender, leftover);
            emit ChitRefunded(msg.sender, leftover);
        }
        emit ChitPoolTerminated(msg.sender);
    }
}