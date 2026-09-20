// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";

/// @title DeployEscrow — TaskEscrow deployment script
/// @author Ramprasad
/// @notice Deploy TaskEscrow (Phase 1, ETHOnline 2026).
/// @dev Usage:
///      forge script script/DeployEscrow.s.sol --rpc-url sepolia --broadcast --verify
///      Env overrides (all optional; RISK_GUARD must be non-zero to deploy):
///        RISK_GUARD      live RiskGuard address (default: address(0) → reverts)
///        THRESHOLD_BPS   global release bar, score >= threshold (default: 5000)
///        PROTOCOL_FEE_BPS protocol take on release, 0–1000 (default: 0 = off)
///        TREASURY        fee receiver (required when PROTOCOL_FEE_BPS > 0)
///      No secrets required. Read-only until --broadcast. Never commits.
contract DeployEscrow is Script {
    /// @notice Execute the deployment: reads RISK_GUARD + THRESHOLD_BPS and broadcasts TaskEscrow.
    function run() external {
        address riskGuard = vm.envOr("RISK_GUARD", address(0));
        uint256 thresholdBps = vm.envOr("THRESHOLD_BPS", uint256(5_000));
        require(riskGuard != address(0), "RISK_GUARD unset");

        vm.startBroadcast();
        TaskEscrow escrow = new TaskEscrow(riskGuard, thresholdBps);
        uint256 feeBps = vm.envOr("PROTOCOL_FEE_BPS", uint256(0));
        address treasury = vm.envOr("TREASURY", address(0));
        if (feeBps > 0) {
            require(treasury != address(0), "TREASURY unset");
            escrow.setProtocolFee(feeBps, treasury);
        }
        vm.stopBroadcast();

        console.log("TaskEscrow:  ", address(escrow));
        console.log("RiskGuard:   ", riskGuard);
        console.log("ThresholdBps:", thresholdBps);
        console.log("FeeBps:      ", feeBps);
        console.log("Treasury:    ", treasury);
        console.log("ChainId:     ", block.chainid);
    }
}
