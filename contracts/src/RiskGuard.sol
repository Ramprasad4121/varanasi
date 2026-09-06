// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AegisRegistry} from "./AegisRegistry.sol";

/// @title RiskGuard — execution gate: ENSv2 identity + risk threshold
/// @notice Every guarded agent action must pass `authorize`: the agent wallet
///         must hold a live (non-expired, non-revoked) `*.aegis.eth` identity
///         in AegisRegistry AND the LLM-produced risk score must be within bounds.
contract RiskGuard {
    AegisRegistry public registry;
    address public owner;

    event Authorized(address indexed agent, uint256 riskScoreBps, uint256 maxAllowedBps);
    event RegistryUpdated(address indexed registry);

    error UnauthorizedAgent(address agent);
    error RiskTooHigh(uint256 scoreBps, uint256 maxAllowedBps);

    modifier onlyOwner() {
        require(msg.sender == owner, "not admin");
        _;
    }

    constructor(address _registry) {
        registry = AegisRegistry(_registry);
        owner = msg.sender;
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = AegisRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    function transferAdmin(address next) external onlyOwner {
        require(next != address(0), "zero");
        owner = next;
    }

    /// @notice Gate a guarded action.
    /// @param agent Agent wallet claiming the `*.aegis.eth` identity.
    /// @param riskScoreBps LLM risk score in basis points (0–10_000).
    /// @param maxAllowedBps Human-set threshold in basis points.
    /// @dev Reverts `UnauthorizedAgent` if `!registry.isAuthorized(agent)`;
    ///      reverts `RiskTooHigh` if `riskScoreBps > maxAllowedBps`.
    function authorize(address agent, uint256 riskScoreBps, uint256 maxAllowedBps) external returns (bool) {
        if (!registry.isAuthorized(agent)) revert UnauthorizedAgent(agent);
        if (riskScoreBps > maxAllowedBps) revert RiskTooHigh(riskScoreBps, maxAllowedBps);
        emit Authorized(agent, riskScoreBps, maxAllowedBps);
        return true;
    }
}
