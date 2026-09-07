// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — mintable demo token for the AegisHook live revert demo
/// @author Ramprasad
/// @notice OpenZeppelin ERC20 with 6/18-configurable decimals and an open
///         `mint` used ONLY to fund the Sepolia demo pool + demo swaps.
///         Holds no ether: no payable functions, no receive/fallback.
contract MockERC20 is ERC20 {
    /// @notice Emitted on every demo mint (in addition to OZ's Transfer).
    /// @param to Recipient of the newly minted tokens.
    /// @param amount Number of base units minted.
    /// @param minter Caller that triggered the mint.
    event Mint(address indexed to, uint256 amount, address indexed minter);

    /// @notice Mint target is the zero address.
    error ZeroAddress();
    /// @notice Mint amount is zero.
    error ZeroAmount();
    /// @notice Token name or symbol is empty.
    error EmptyMetadata();

    /// @notice Token decimals override supplied at construction (e.g. 6 or 18).
    uint8 private immutable _tokenDecimals;

    /// @param name_ Token name (non-empty).
    /// @param symbol_ Token symbol (non-empty).
    /// @param decimals_ Token decimals (e.g. 18).
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0) revert EmptyMetadata();
        _tokenDecimals = decimals_;
    }

    /// @notice Mint `amount` tokens to `to`. Permissionless by design: demo only.
    /// @param to Recipient address (must be non-zero).
    /// @param amount Number of base units to mint (must be > 0).
    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        _mint(to, amount);
        emit Mint(to, amount, msg.sender);
    }

    /// @notice Returns the token decimals configured at deployment.
    /// @return decimals_ Number of decimals (e.g. 6 or 18).
    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }
}
