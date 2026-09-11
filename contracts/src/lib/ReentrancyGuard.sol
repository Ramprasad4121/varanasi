// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ReentrancyGuard — minimal mutual-exclusion lock (no dependency)
/// @author Ramprasad
/// @notice OpenZeppelin-shaped `_locked` sentinel with a `nonReentrant`
///         modifier. Only the interaction tail of a guarded function needs
///         exclusion (state is always flipped BEFORE token calls in varanasi
///         contracts), but defense-in-depth is cheap: ~40 sload/sstore gas.
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    /// @notice Lock sentinel; 1 outside a guarded call, 2 inside.
    uint256 private _locked = _NOT_ENTERED;

    /// @notice Re-entered a guarded function.
    error ReentrantCall();

    modifier nonReentrant() {
        if (_locked == _ENTERED) revert ReentrantCall();
        _locked = _ENTERED;
        _;
        _locked = _NOT_ENTERED;
    }
}
