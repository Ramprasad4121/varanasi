// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IACPHook — ERC-8183 optional hook interface.
/// @dev beforeAction may revert to block; afterAction revert rolls back. claimRefund is never hooked.
interface IACPHook {
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}
