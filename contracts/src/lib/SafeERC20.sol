// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "./IERC20.sol";

/// @title SafeERC20 — token-call wrapper that tolerates non-standard ERC-20s
/// @author Ramprasad
/// @notice USDT-class tokens return no bool from transfer/transferFrom/approve.
///         Direct calls would revert or silently succeed on such tokens; this
///         lib accepts EITHER (a) empty return data OR (b) a 32-byte `true`,
///         and reverts with a named error otherwise. Same semantics as
///         OpenZeppelin's SafeERC20 minus the dependency — the entire varanasi
///         contracts tree compiles with zero external libraries (forge-std is
///         test-only).
library SafeERC20 {
    /// @notice Token call failed (reverted, or returned a falsy value).
    error TransferFailed(address token);
    /// @notice approve() failed (reverted, or returned a falsy value).
    error ApproveFailed(address token);

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_tryCall(token, abi.encodeCall(IERC20.transfer, (to, value)))) revert TransferFailed(address(token));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_tryCall(token, abi.encodeCall(IERC20.transferFrom, (from, to, value)))) {
            revert TransferFailed(address(token));
        }
    }

    /// @notice Approve `spender` — resets to `value`. Not the increase/decrease
    ///         dance; varanasi escrows are funded from an explicit allowance the
    ///         payer sets, and we never rewrite a live allowance from the
    ///         contracts themselves.
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        (bool ok, bytes memory ret) = address(token).call(abi.encodeCall(IERC20.approve, (spender, value)));
        if (!ok || !(ret.length == 0 || abi.decode(ret, (bool)))) revert ApproveFailed(address(token));
    }

    /// @dev Low-level call; success iff ok && (no return data || return == true).
    function _tryCall(IERC20 token, bytes memory data) private returns (bool) {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok) return false;
        if (ret.length == 0) return true;
        return abi.decode(ret, (bool));
    }
}
