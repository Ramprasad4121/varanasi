// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "../lib/IERC20.sol";
import {SafeERC20} from "../lib/SafeERC20.sol";
import {ReentrancyGuard} from "../lib/ReentrancyGuard.sol";
import {Pausable} from "../lib/Pausable.sol";
import {Ownable} from "../lib/Ownable.sol";

/// @title SavingsVault — personal savings vaults with optional recurring deposits.
/// @author Ramprasad
/// @dev One vault contract serves one ERC20 (the "savings token"). A user opens a
///      vault (active), deposits, optionally configures a recurring deposit that any
///      keeper can execute when due (KeptRecurring), and can withdraw anytime.
///      Recurring deposits pull from an allowance the user pre-authorized, so a
///      keeper never gets custody of funds.
contract SavingsVault is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    error VaultAlreadyActive(address who);
    error VaultInactive(address who);
    error VaultNotEmpty(address who, uint256 balance);
    error VaultInsufficient(address who, uint256 balance, uint256 requested);
    error RecurringNotEnabled(address who);
    error RecurringNotDue(uint256 nextDue, uint256 now);
    error ZeroAmount();
    error ZeroAddress();

    event VaultOpened(address indexed who);
    event VaultClosed(address indexed who);
    event VaultDeposited(address indexed who, uint256 amount);
    event VaultWithdrawn(address indexed who, uint256 amount);
    event RecurringConfigured(
        address indexed who,
        uint256 amount,
        uint256 interval
    );
    event RecurringDisabled(address indexed who);
    event RecurringExecuted(address indexed who, uint256 amount, uint256 nextDue);

    struct Vault {
        bool active;
        uint256 balance;
        uint256 recurringAmount;
        uint256 recurringInterval;
        bool recurringEnabled;
        uint256 lastRecurringAt;
        uint256 createdAt;
        uint256 closedAt;
    }

    IERC20 public immutable token;

    mapping(address => Vault) public vaults;

    address[] public vaultOwners;

    /// @param admin Owner (pause control).
    /// @param savingsToken ERC20 this vault accepts.
    constructor(address admin, address savingsToken) Ownable(admin) {
        if (savingsToken == address(0)) revert ZeroAddress();
        token = IERC20(savingsToken);
    }

    // --- Lifecycle ---

    /// @notice Open a savings vault. Anyone may open one.
    function openVault() external whenNotPaused {
        Vault storage v = vaults[msg.sender];
        if (v.active) revert VaultAlreadyActive(msg.sender);
        v.active = true;
        v.createdAt = block.timestamp;
        vaultOwners.push(msg.sender);
        emit VaultOpened(msg.sender);
    }

    /// @notice Close the vault. Balance must be withdrawn first (guards against
    ///         silently stranded funds); after close no further deposits/recurring
    ///         execute.
    function closeVault() external nonReentrant {
        Vault storage v = vaults[msg.sender];
        if (!v.active) revert VaultInactive(msg.sender);
        if (v.balance != 0) revert VaultNotEmpty(msg.sender, v.balance);
        v.active = false;
        v.recurringEnabled = false;
        v.closedAt = block.timestamp;
        emit VaultClosed(msg.sender);
    }

    // --- Deposits / withdrawals ---

    /// @notice Deposit via ERC20 allowance.
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        Vault storage v = vaults[msg.sender];
        if (!v.active) revert VaultInactive(msg.sender);
        if (amount == 0) revert ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        v.balance += amount;
        emit VaultDeposited(msg.sender, amount);
    }

    /// @notice Withdraw back to the owner anytime (even after close).
    function withdraw(uint256 amount) external nonReentrant {
        Vault storage v = vaults[msg.sender];
        if (v.balance < amount) revert VaultInsufficient(msg.sender, v.balance, amount);
        v.balance -= amount;
        token.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    // --- Recurring configuration ---

    /// @notice Set a recurring deposit (approve the token first). Setting amount 0
    ///         disables it.
    function setRecurring(uint256 amount, uint256 interval) external {
        Vault storage v = vaults[msg.sender];
        if (!v.active) revert VaultInactive(msg.sender);
        if (amount != 0 && interval == 0) revert ZeroAmount();
        v.recurringAmount = amount;
        v.recurringInterval = interval;
        v.recurringEnabled = amount != 0;
        emit RecurringConfigured(msg.sender, amount, interval);
    }

    function disableRecurring() external {
        Vault storage v = vaults[msg.sender];
        if (!v.active) revert VaultInactive(msg.sender);
        v.recurringEnabled = false;
        v.recurringAmount = 0;
        emit RecurringDisabled(msg.sender);
    }

    /// @notice Keeper-executed recurring deposit. Pulls `recurringAmount` from the
    ///         vault owner's allowance when `interval` has elapsed since the last
    ///         execution (or since vault opening).
    function executeRecurring(address who) external nonReentrant whenNotPaused {
        Vault storage v = vaults[who];
        if (!v.active) revert VaultInactive(who);
        if (!v.recurringEnabled || v.recurringAmount == 0) revert RecurringNotEnabled(who);

        uint256 nextDue = v.lastRecurringAt == 0
            ? v.createdAt + v.recurringInterval
            : v.lastRecurringAt + v.recurringInterval;
        if (block.timestamp < nextDue) revert RecurringNotDue(nextDue, block.timestamp);

        uint256 amount = v.recurringAmount;
        token.safeTransferFrom(who, address(this), amount);
        v.balance += amount;
        v.lastRecurringAt = block.timestamp;
        emit RecurringExecuted(who, amount, v.lastRecurringAt + v.recurringInterval);
    }

    // --- Views ---

    /// @notice Emergency pause (owner). Deposits + recurring execution halt;
    ///         withdrawals stay available so funds are never locked.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function count() external view returns (uint256) {
        return vaultOwners.length;
    }
}