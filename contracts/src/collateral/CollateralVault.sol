// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ICollateral} from "./ICollateral.sol";
import {IERC20} from "../lib/IERC20.sol";
import {SafeERC20} from "../lib/SafeERC20.sol";
import {Pausable} from "../lib/Pausable.sol";
import {Ownable} from "../lib/Ownable.sol";
import {EnumerableSet} from "../lib/EnumerableSet.sol";

/// @title CollateralVault — holds ERC20 collateral positions behind opaque locks.
/// @author Ramprasad
/// @dev Positions are keyed by `positionId`; locking pulls the asset in (msg.sender
///      must approve), unlocking sends it back to the position owner. A position can
///      be locked exactly once (replay protection) and the same `positionId` cannot
///      be reused as long as it is active. A whitelisted set of assets is enforced.
contract CollateralVault is ICollateral, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    error CollateralPositionLocked(bytes32 positionId);
    error CollateralEmpty(bytes32 positionId);
    error CollateralNotOwner(address caller, address owner);
    error CollateralNotAllowedAsset(address token);
    error CollateralZeroAmount();
    error CollateralZeroAddress();
    error CollateralNotAuthorizedResolver(address caller);

    event CollateralLocked(
        bytes32 indexed positionId,
        address indexed token,
        address indexed owner,
        uint256 amount
    );
    event CollateralUnlocked(
        bytes32 indexed positionId,
        address indexed to,
        uint256 amount
    );
    event AssetAdmitted(address indexed token);
    event AssetRemoved(address indexed token);
    event ResolverAuthorized(address indexed resolver);
    event ResolverDeauthorized(address indexed resolver);

    struct Position {
        address token;
        address owner;
        uint256 amount;
    }

    EnumerableSet.AddressSet private _allowedAssets;
    mapping(address => bool) public isAuthorizedResolver;

    mapping(bytes32 => Position) public positions;

    /// @param admin Owner of the vault (admission + pause control).
    constructor(address admin) Ownable(admin) {}

    /// @notice Authorize a protocol contract (e.g. LoanAgreement) to release
    ///         positions under its control. Release is a move, not a steal:
    ///         the resolver can only release positions it locked.
    function authorizeResolver(address resolver) external onlyOwner {
        if (resolver == address(0)) revert CollateralZeroAddress();
        isAuthorizedResolver[resolver] = true;
        emit ResolverAuthorized(resolver);
    }

    function deauthorizeResolver(address resolver) external onlyOwner {
        isAuthorizedResolver[resolver] = false;
        emit ResolverDeauthorized(resolver);
    }

    /// @notice Admit an ERC20 to be used as collateral.
    function admitAsset(address token) external onlyOwner whenNotPaused {
        if (token == address(0)) revert CollateralZeroAddress();
        if (_allowedAssets.add(token)) {
            emit AssetAdmitted(token);
        }
    }

    /// @notice Remove an ERC20 from the collateral allowlist (existing positions stay locked).
    function removeAsset(address token) external onlyOwner {
        if (_allowedAssets.remove(token)) {
            emit AssetRemoved(token);
        }
    }

    /// @inheritdoc ICollateral
    function lock(bytes32 positionId, address token, address owner, uint256 amount)
        external
        whenNotPaused
    {
        Position storage p = positions[positionId];
        if (p.amount != 0) revert CollateralPositionLocked(positionId);
        if (owner == address(0)) revert CollateralZeroAddress();
        if (token == address(0)) revert CollateralZeroAddress();
        if (amount == 0) revert CollateralZeroAmount();
        if (!_allowedAssets.contains(token)) revert CollateralNotAllowedAsset(token);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        p.token = token;
        p.owner = owner;
        p.amount = amount;
        emit CollateralLocked(positionId, token, owner, amount);
    }

    /// @inheritdoc ICollateral
    function unlock(bytes32 positionId) external {
        Position storage p = positions[positionId];
        if (p.amount == 0) revert CollateralEmpty(positionId);
        if (p.owner != msg.sender) revert CollateralNotOwner(msg.sender, p.owner);
        IERC20 token = IERC20(p.token);
        uint256 amount = p.amount;
        delete positions[positionId];
        token.safeTransfer(msg.sender, amount);
        emit CollateralUnlocked(positionId, msg.sender, amount);
    }

    /// @notice Authorized-release path for protocol resolvers: moves a position
    ///         balance to an arbitrary beneficiary (used by LoanAgreement on
    ///         repayment/foreclosure). Only an authorized resolver may call and
    ///         only on positions it owns (msg.sender must be the position owner).
    function release(bytes32 positionId, address to) external {
        Position storage p = positions[positionId];
        if (p.amount == 0) revert CollateralEmpty(positionId);
        if (!isAuthorizedResolver[msg.sender]) revert CollateralNotAuthorizedResolver(msg.sender);
        if (p.owner != msg.sender) revert CollateralNotOwner(msg.sender, p.owner);
        if (to == address(0)) revert CollateralZeroAddress();
        IERC20 token = IERC20(p.token);
        uint256 amount = p.amount;
        delete positions[positionId];
        token.safeTransfer(to, amount);
        emit CollateralUnlocked(positionId, to, amount);
    }

    /// @inheritdoc ICollateral
    function value(bytes32 positionId) external view returns (uint256) {
        return positions[positionId].amount;
    }

    /// @notice Full position data (convenience for frontends / keepers).
    function positionOf(bytes32 positionId)
        external
        view
        returns (address token, address owner, uint256 amount)
    {
        Position storage p = positions[positionId];
        return (p.token, p.owner, p.amount);
    }

    /// @notice Whether `token` is admitted as collateral.
    function isAllowedAsset(address token) external view returns (bool) {
        return _allowedAssets.contains(token);
    }

    /// @notice Number of admitted assets.
    function allowedAssetCount() external view returns (uint256) {
        return _allowedAssets.length();
    }
}