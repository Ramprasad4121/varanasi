// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IVaranasiTaskEscrow — read-only surface of the deployed escrow
/// @author Ramprasad
/// @notice The exact `tasks(bytes32)` getter shape of VaranasiTaskEscrow
///         (14-slot tuple: mandate fields + settlement state). Contracts like
///         Akshaya read *through* this interface to verify outcomes directly
///         from escrow storage — trustless read-verification, no oracles.
/// @dev State enum: 0 None · 1 Funded · 2 Validated · 3 Released · 4 Refunded · 5 Cancelled.
interface IVaranasiTaskEscrow {
    function tasks(bytes32 taskId)
        external
        view
        returns (
            address payer,
            address agent,
            address merchant,
            address token,
            uint256 cap,
            uint256 fundedAmount,
            uint64 windowStart,
            uint64 windowEnd,
            uint64 expiry,
            uint256 scoreBps,
            address validator,
            uint256 pinnedThresholdBps,
            address pinnedValidator,
            uint8 state
        );
}
