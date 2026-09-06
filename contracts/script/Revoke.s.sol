// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";

/// @notice Revoke an agent subname by label.
/// @dev Usage: SUBLABEL=sentinel-1 AEGIS_REGISTRY=0x... forge script script/Revoke.s.sol --rpc-url sepolia --broadcast
contract Revoke is Script {
    function run() external {
        address reg = vm.envAddress("AEGIS_REGISTRY");
        string memory label = vm.envString("SUBLABEL");
        vm.startBroadcast();
        AegisRegistry(reg).revokeAgentByLabel(label);
        vm.stopBroadcast();
        console.log("Revoked label:", label);
        console.log("Registry:", reg);
    }
}
