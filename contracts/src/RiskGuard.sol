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

    /// @notice Optional financial-reputation oracle. When set, `authorize` also
    ///         rejects agents whose on-chain financial behavior is flagged
    ///         (defaults / failed settlements), and can cap the reputation risk
    ///         score. Zero = feature disabled (behavior is unchanged).
    IFinancialReputation public reputation;
    /// @notice Max reputation risk score (bps) an agent may carry before being
    ///         blocked by the reputation gate. Defaults to fully permissive.
    uint256 public maxReputationRiskBps = 10_000;

    /// @notice Emitted when an agent passes the identity + threshold gate.
    event Authorized(address indexed agent, uint256 riskScoreBps, uint256 maxAllowedBps);
    /// @notice Emitted when the bound registry address is updated.
    event RegistryUpdated(address indexed registry);
    /// @notice Emitted when the optional reputation oracle is wired.
    event ReputationUpdated(address indexed reputation);
    event ReputationRiskCapUpdated(uint256 maxRiskBps);

    /// @notice Agent wallet holds no live (non-expired, non-revoked) identity.
    error UnauthorizedAgent(address agent);
    /// @notice Risk score exceeds the caller-supplied threshold.
    error RiskTooHigh(uint256 scoreBps, uint256 maxAllowedBps);
    /// @notice Address argument is zero.
    /// @dev Author: Ramprasad.
    error ZeroAddress();

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
    /// @param _registry New AegisRegistry address (must be non-zero).
    /// @dev Author: Ramprasad.
    /// @dev Production: front this with a timelock/multisig (no timelock code here).
    function setRegistry(address _registry) external onlyOwner {
        if (_registry == address(0)) revert ZeroAddress();
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

    /// @notice Wire the optional reputation oracle.
    /// @param rep Reputation contract (or zero to disable the gate).
    function setReputation(address rep) external onlyOwner {
        reputation = IFinancialReputation(rep);
        emit ReputationUpdated(rep);
    }

    /// @notice Cap the reputation risk score that agents may carry.
    function setMaxReputationRiskBps(uint256 maxRiskBps) external onlyOwner {
        maxReputationRiskBps = maxRiskBps > 10_000 ? 10_000 : maxRiskBps;
        emit ReputationRiskCapUpdated(maxReputationRiskBps);
    }

    /// @notice Error: agent carries a reputation red flag.
    error FlaggedAgent(address agent);
    /// @notice Error: reputation risk score exceeds the configured cap.
    error ReputationRiskTooHigh(address agent, uint256 riskBps, uint256 maxRiskBps);

    /// @notice Gate a guarded action.
    /// @param agent Agent wallet claiming the `*.aegis.eth` identity.
    /// @param riskScoreBps LLM risk score in basis points (0–10_000).
    /// @param maxAllowedBps Human-set threshold in basis points.
    /// @return ok True when identity is live, score is within bounds, and the
    ///         optional reputation gate (if wired) is passed.
    /// @dev Reverts `UnauthorizedAgent` if `!registry.isAuthorized(agent)`;
    ///      reverts `RiskTooHigh` if `riskScoreBps > maxAllowedBps`;
    ///      reverts `FlaggedAgent` / `ReputationRiskTooHigh` when the optional
    ///      reputation oracle is wired and the agent is flagged.
    function authorize(address agent, uint256 riskScoreBps, uint256 maxAllowedBps) external returns (bool) {
        if (!registry.isAuthorized(agent)) revert UnauthorizedAgent(agent);
        if (riskScoreBps > maxAllowedBps) revert RiskTooHigh(riskScoreBps, maxAllowedBps);
        if (address(reputation) != address(0)) {
            if (reputation.isFlagged(agent)) revert FlaggedAgent(agent);
            uint256 repRisk = reputation.riskScoreBps(agent);
            if (repRisk > maxReputationRiskBps) {
                revert ReputationRiskTooHigh(agent, repRisk, maxReputationRiskBps);
            }
        }
        emit Authorized(agent, riskScoreBps, maxAllowedBps);
        return true;
    }
}

/// @title IFinancialReputation — minimal surface RiskGuard consumes.
/// @author Ramprasad
interface IFinancialReputation {
    function isFlagged(address who) external view returns (bool);
    function riskScoreBps(address who) external view returns (uint256);
}
