// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICollateral — generic collateral interface used by Loan/Chit/Mandate.
/// @author Ramprasad
/// @dev Every collateral-backed primitive consumes this view: lock, unlock,
///      and value. Concrete implementations (CollateralVault) own the checks.
interface ICollateral {
    /// @notice Lock `amount` of `token` under `positionId` on behalf of `owner`.
    /// @param positionId Protocol-chosen unique position id (bytes32).
    /// @param token ERC20 collateral asset to lock.
    /// @param owner Who may unlock/release the position.
    /// @param amount Amount of the collateral asset locked (base units).
    /// @dev Implementations pull the asset from the caller (approve first) and
    ///      enforce their own allowlist.
    function lock(bytes32 positionId, address token, address owner, uint256 amount) external;

    /// @notice Release a position back to its owner.
    /// @param positionId Position to unlock.
    /// @dev Owner-only (or an allowlisted resolution caller) in implementations.
    function unlock(bytes32 positionId) external;

    /// @notice Authorized-resolution path for allowlisted protocol contracts
    ///         (e.g. a loan contract) to move a position to `to`. The caller must
    ///         own the position and be allowlisted by the implementation.
    /// @param positionId Position to release.
    /// @param to Recipient of the released collateral.
    function release(bytes32 positionId, address to) external;

    /// @notice Current liquidation value of a position (base units).
    /// @param positionId Position to value.
    /// @return value Amount of the locked asset (base units).
    function value(bytes32 positionId) external view returns (uint256);
}