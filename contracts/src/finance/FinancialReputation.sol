// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "../lib/Ownable.sol";

/// @title FinancialReputation — event-derived credit counters + composite score.
/// @author Ramprasad
/// @dev Not a credit bureau: a transparent, on-chain aggregation of on-chain
///      financial behavior. Authorized recorders (SavingsVault, ChitPool,
///      LoanAgreement, CollateralVault, settlement contracts) bump per-address
///      counters. `creditScoreBps` and `riskScoreBps` derive from those aggregates
///      so any RiskGuard (or gate) can consume the same signal.
contract FinancialReputation is Ownable {
    error RepoNotAuthorized(address caller);
    error ZeroAddress();
    error ScoreOverflow();

    event RecorderAuthorized(address indexed recorder);
    event RecorderRevoked(address indexed recorder);
    event ContributionRecorded(address indexed who, uint256 amount, bytes32 context);
    event RepaymentRecorded(address indexed who, uint256 amount, bool onTime, bytes32 context);
    event DefaultRecorded(address indexed who, uint256 amount, bytes32 context);
    event ChitRoundRecorded(address indexed who, bool completed, bytes32 context);
    event SettlementRecorded(address indexed who, uint256 amount, bool success, bytes32 context);
    event CollateralRecorded(address indexed who, bytes32 positionId, bytes32 context);

    struct Profile {
        uint256 contributions;
        uint256 onTimeRepayments;
        uint256 lateRepayments;
        uint256 defaults;
        uint256 chitRoundsCompleted;
        uint256 chitRoundsMissed;
        uint256 successfulSettlements;
        uint256 failedSettlements;
        uint256 collateralPositions;
    }

    // Weights (hard-coded, conservative) used to derive the composite score.
    uint256 internal constant _W_CONTRIBUTION = 20;
    uint256 internal constant _W_ON_TIME = 40;
    uint256 internal constant _W_LATE = 15;
    uint256 internal constant _W_DEFAULT = 60;
    uint256 internal constant _W_CHIT_COMPLETE = 15;
    uint256 internal constant _W_CHIT_MISSED = 10;
    uint256 internal constant _W_SETTLE_START = 5;
    uint256 internal constant _W_SETTLE_SUCCESS = 5;
    uint256 internal constant _W_COLLATERAL = 10;

    mapping(address => Profile) public profiles;
    mapping(address => bool) public isAllowedRecorder;

    address[] public recorders;

    /// @param admin Owner (recorder governance).
    constructor(address admin) Ownable(admin) {}

    modifier onlyRecorder() {
        if (!isAllowedRecorder[msg.sender]) revert RepoNotAuthorized(msg.sender);
        _;
    }

    /// @notice Grant a contract the right to record behavior.
    function authorizeRecorder(address recorder) external onlyOwner {
        if (recorder == address(0)) revert ZeroAddress();
        if (isAllowedRecorder[recorder]) return;
        isAllowedRecorder[recorder] = true;
        recorders.push(recorder);
        emit RecorderAuthorized(recorder);
    }

    function revokeRecorder(address recorder) external onlyOwner {
        if (!isAllowedRecorder[recorder]) return;
        isAllowedRecorder[recorder] = false;
        for (uint256 i; i < recorders.length; ++i) {
            if (recorders[i] == recorder) {
                recorders[i] = recorders[recorders.length - 1];
                recorders.pop();
                break;
            }
        }
        emit RecorderRevoked(recorder);
    }

    // --- Recording (only authorized protocol contracts) ---

    function recordContribution(address who, uint256 amount, bytes32 context) external onlyRecorder {
        profiles[who].contributions += amount;
        emit ContributionRecorded(who, amount, context);
    }

    function recordRepayment(address who, uint256 amount, bool onTime, bytes32 context) external onlyRecorder {
        if (onTime) {
            profiles[who].onTimeRepayments++;
        } else {
            profiles[who].lateRepayments++;
        }
        emit RepaymentRecorded(who, amount, onTime, context);
    }

    function recordDefault(address who, uint256 amount, bytes32 context) external onlyRecorder {
        profiles[who].defaults++;
        emit DefaultRecorded(who, amount, context);
    }

    function recordChitRound(address who, bool completed, bytes32 context) external onlyRecorder {
        if (completed) {
            profiles[who].chitRoundsCompleted++;
        } else {
            profiles[who].chitRoundsMissed++;
        }
        emit ChitRoundRecorded(who, completed, context);
    }

    function recordSettlement(address who, uint256 amount, bool success, bytes32 context) external onlyRecorder {
        if (success) {
            profiles[who].successfulSettlements++;
        } else {
            profiles[who].failedSettlements++;
        }
        emit SettlementRecorded(who, amount, success, context);
    }

    function recordCollateral(address who, bytes32 positionId, bytes32 context) external onlyRecorder {
        profiles[who].collateralPositions++;
        emit CollateralRecorded(who, positionId, context);
    }

    // --- Composite score (0-bad .. 10_000-good) ---

    function creditScoreBps(address who) public view returns (uint256) {
        Profile storage p = profiles[who];
        uint256 positives =
            p.onTimeRepayments * _W_ON_TIME
            + p.chitRoundsCompleted * _W_CHIT_COMPLETE
            + p.collateralPositions * _W_COLLATERAL;
        // Contributions: count-based, capped effect (10+ contributions = full weight).
        uint256 contributionCredit = p.contributions > 0
            ? (p.contributions < 10 ? p.contributions * _W_CONTRIBUTION : 10 * _W_CONTRIBUTION)
            : 0;
        positives += contributionCredit;
        if (p.successfulSettlements > 0) {
            positives += p.successfulSettlements * _W_SETTLE_SUCCESS;
        }

        uint256 negatives =
            p.defaults * _W_DEFAULT
            + p.lateRepayments * _W_LATE
            + p.chitRoundsMissed * _W_CHIT_MISSED;
        if (p.failedSettlements > 0) {
            negatives += p.failedSettlements * _W_SETTLE_START;
        }

        // Neutral baseline: a healthy inactive user sits at 5_000.
        uint256 score = 5_000 + positives - negatives;
        return score > 10_000 ? 10_000 : score;
    }

    function riskScoreBps(address who) external view returns (uint256) {
        return 10_000 - creditScoreBps(who);
    }

    /// @notice Whether the address has a reputation "red flag" (defaults or
    ///         failing settlement) — used as an optional RiskGuard signal.
    function isFlagged(address who) external view returns (bool) {
        Profile storage p = profiles[who];
        return p.defaults > 0 || p.failedSettlements > 0;
    }

    function hasHistory(address who) external view returns (bool) {
        Profile storage p = profiles[who];
        return p.contributions > 0 || p.onTimeRepayments > 0 || p.lateRepayments > 0
            || p.defaults > 0 || p.chitRoundsCompleted > 0 || p.collateralPositions > 0;
    }

    function recorderCount() external view returns (uint256) {
        return recorders.length;
    }
}