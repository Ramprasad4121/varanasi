// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {Akshaya} from "../src/Akshaya.sol";
import {GhatStream} from "../src/GhatStream.sol";

/// @title DeployInventions — Akshaya + GhatStream against the live rail
/// @author Ramprasad
/// @notice Deploys the two read-from-the-escrow primitives. Both are fixed to
///         their wiring at construction (Akshaya: no admin at all; GhatStream:
///         gate wiring only), so wire the right addresses.
/// @dev Usage:
///        TASK_ESCROW=0x... AEGIS_REGISTRY=0x... \
///          forge script script/DeployInventions.s.sol --rpc-url sepolia --broadcast --verify
///        GHAT_NO_GATE=1 to deploy GhatStream with the identity gate disabled.
contract DeployInventions is Script {
    function run() external {
        address escrow = vm.envAddress("TASK_ESCROW");
        address registry = vm.envOr("AEGIS_REGISTRY", address(0));
        bool noGate = vm.envOr("GHAT_NO_GATE", uint256(0)) == 1;
        address ghatGate = noGate ? address(0) : (registry == address(0) ? escrow : registry);
        // escrow-as-gate is invalid; require explicit registry when gate on.
        require(noGate || registry != address(0), "set AEGIS_REGISTRY or GHAT_NO_GATE=1");

        vm.startBroadcast();
        Akshaya akshaya = new Akshaya(escrow);
        GhatStream ghat = new GhatStream(registry);
        vm.stopBroadcast();

        console.log("Akshaya:   ", address(akshaya));
        console.log("  reads escrow:", escrow);
        console.log("GhatStream:", address(ghat));
        console.log("  identity gate:", ghatGate);
        void ghatGate;
    }
}
