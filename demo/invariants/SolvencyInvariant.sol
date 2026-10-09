// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDepositVault {
    function balances(address) external view returns (uint256);
    function depositors(uint256) external view returns (address);
    function depositorCount() external view returns (uint256);
}

/// @title SolvencyInvariant: the invariant the sponsor commits to (keccak256 of this file).
/// @notice Holds while the vault's ETH covers what it owes every depositor.
///         The Varanasi verifier deploys this next to the target on a sandboxed fork,
///         checks holds() == true before the PoC runs and holds() == false after.
contract SolvencyInvariant {
    IDepositVault public immutable target;

    constructor(address target_) {
        target = IDepositVault(target_);
    }

    function owed() public view returns (uint256 sum) {
        uint256 n = target.depositorCount();
        for (uint256 i; i < n; ++i) sum += target.balances(target.depositors(i));
    }

    function holds() external view returns (bool) {
        return address(target).balance >= owed();
    }
}
