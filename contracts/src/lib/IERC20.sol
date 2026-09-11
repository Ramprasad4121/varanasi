// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IERC20 — minimal ERC-20 interface (no external dependencies)
/// @author Ramprasad
/// @notice Hand-rolled interface + events only. Kept byte-compatible with the
///         ERC-20 spec so real tokens (USDC/DAI/…) satisfy it as-is.
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function decimals() external view returns (uint8);
}
