// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {Akshaya} from "../src/Akshaya.sol";
import {GhatStream} from "../src/GhatStream.sol";

/// @title DeployInventions — Akshaya + GhatStream against the live rail
/// @author Ramprasad
/// @notice Deploys the two primitives that read from the deployed escrow and
///         registry. Both are fixed at construction (Akshaya: no admin at all;
///         GhatStream: identity gate immutable), so wire the right addresses.
/// @dev Usage:
///      TASK_ESCROW=0x... AEGIS_REGISTRY=0x... \
///        forge script script/DeployInventions.s.sol --rpc-url sepolia --broadcast --verify
///      GHAT_NO_GATE=1 deploys GhatStream with the identity gate disabled
///      (stream opens then require no live Aegis identity — permissionless mode).
contract DeployInventions is Script {
    function run() external {
        address escrow = vm.envAddress("TASK_ESCROW");
        address registry = vm.envOr("AEGIS_REGISTRY", address(0));
        bool noGate = vm.envOr("GHAT_NO_GATE", uint256(0)) == 1;
        require(noGate || registry != address(0), "set AEGIS_REGISTRY or GHAT_NO_GATE=1");
        address ghatGate = noGate ? address(0) : registry;

        vm.startBroadcast();
        Akshaya akshaya = new Akshaya(escrow);
        GhatStream ghat = new GhatStream(ghatGate);
        vm.stopBroadcast();

        console.log("Akshaya:    ", address(akshaya));
        console.log("  reads escrow:", escrow);
        console.log("GhatStream: ", address(ghat));
        console.log("  identity gate:", ghatGate);
    }
}
