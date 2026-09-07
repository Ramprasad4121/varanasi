// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AegisRegistry} from "./AegisRegistry.sol";

/// @title RiskGuard — execution gate: ENSv2 identity + risk threshold
/// @author Ramprasad
/// @notice Every guarded agent action must pass `authorize`: the agent wallet
///         must hold a live (non-expired, non-revoked) `*.aegis.eth` identity
///         in AegisRegistry AND the LLM-produced risk score must be within bounds.
contract RiskGuard {
    /// @notice AegisRegistry used as the live identity source of truth.
    AegisRegistry public registry;
    /// @notice Contract admin: may repoint the registry and transfer admin rights.
    address public owner;

    /// @notice Emitted when an agent passes the identity + threshold gate.
    event Authorized(address indexed agent, uint256 riskScoreBps, uint256 maxAllowedBps);
    /// @notice Emitted when the bound registry address is updated.
    event RegistryUpdated(address indexed registry);

    /// @notice Agent wallet holds no live (non-expired, non-revoked) identity.
    error UnauthorizedAgent(address agent);
    /// @notice Risk score exceeds the caller-supplied threshold.
    error RiskTooHigh(uint256 scoreBps, uint256 maxAllowedBps);

    modifier onlyOwner() {
        require(msg.sender == owner, "not admin");
        _;
    }

    /// @notice Deploy the guard bound to an AegisRegistry; deployer becomes owner.
    /// @param _registry AegisRegistry address used for live identity checks.
    constructor(address _registry) {
        registry = AegisRegistry(_registry);
        owner = msg.sender;
    }

    /// @notice Repoint the guard at a new registry (e.g. after a registry upgrade).
    /// @param _registry New AegisRegistry address.
    function setRegistry(address _registry) external onlyOwner {
        registry = AegisRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    /// @notice Transfer contract admin rights to a new address.
    /// @param next New owner address (must be non-zero).
    /// @dev Reverts with "zero" if next is address(0).
    function transferAdmin(address next) external onlyOwner {
        require(next != address(0), "zero");
        owner = next;
    }

    /// @notice Gate a guarded action.
    /// @param agent Agent wallet claiming the `*.aegis.eth` identity.
    /// @param riskScoreBps LLM risk score in basis points (0–10_000).
    /// @param maxAllowedBps Human-set threshold in basis points.
    /// @return ok True when identity is live and score is within bounds.
    /// @dev Reverts `UnauthorizedAgent` if `!registry.isAuthorized(agent)`;
    ///      reverts `RiskTooHigh` if `riskScoreBps > maxAllowedBps`.
    function authorize(address agent, uint256 riskScoreBps, uint256 maxAllowedBps) external returns (bool) {
        if (!registry.isAuthorized(agent)) revert UnauthorizedAgent(agent);
        if (riskScoreBps > maxAllowedBps) revert RiskTooHigh(riskScoreBps, maxAllowedBps);
        emit Authorized(agent, riskScoreBps, maxAllowedBps);
        return true;
    }
}
