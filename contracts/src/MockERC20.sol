// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockERC20 — mintable demo settlement token (zero dependencies)
/// @author Ramprasad
/// @notice Standard-ERC20 surface (balanceOf/allowance/transfer/approve/
///         transferFrom + Transfer/Approval events) with an open `mint` used
///         ONLY to fund Sepolia/testnet demos (6 decimals like USDC).
///         Not for mainnet: no permit, no meta-tx — this is a demo token and
///         says so in its own name.
contract MockERC20 {
    /// @notice Emitted on every demo mint (in addition to Transfer).
    event Mint(address indexed to, uint256 amount, address indexed minter);

    /// @notice Standard ERC-20 events (declared locally — zero dependencies).
    event Transfer(address indexed from, address indexed to, uint256 value);
    /// @notice Standard ERC-20 approval event.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Mint target is the zero address.
    error ZeroAddress();
    /// @notice Mint amount is zero.
    error ZeroAmount();
    /// @notice Token name or symbol is empty.
    error EmptyMetadata();
    /// @notice Insufficient balance for transfer.
    error InsufficientBalance(address from, uint256 have, uint256 want);
    /// @notice Insufficient allowance for transferFrom.
    error InsufficientAllowance(address owner, address spender, uint256 have, uint256 want);

    string public name;
    string public symbol;
    /// @notice Token decimals supplied at construction (6 for USDC-style demos).
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @param name_ Token name (non-empty).
    /// @param symbol_ Token symbol (non-empty).
    /// @param decimals_ Token decimals (e.g. 6 or 18).
    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        if (bytes(name_).length == 0 || bytes(symbol_).length == 0) revert EmptyMetadata();
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    /// @notice Mint `amount` tokens to `to`. Permissionless by design: demo only.
    /// @param to Recipient address (must be non-zero).
    /// @param amount Number of base units to mint (must be > 0).
    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Mint(to, amount, msg.sender);
        emit Transfer(address(0), to, amount);
    }

    /// @notice Transfer `amount` to `to`. Returns true (spec-compliant bool).
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Set caller's allowance for `spender` to `amount`.
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Move `amount` from `from` to `to`, debiting caller's allowance.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance(from, msg.sender, allowed, amount);
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 have = balanceOf[from];
        if (have < amount) revert InsufficientBalance(from, have, amount);
        unchecked {
            balanceOf[from] = have - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
