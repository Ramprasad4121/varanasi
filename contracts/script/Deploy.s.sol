// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";

/// @title Deploy — AegisRegistry + RiskGuard deployment script
/// @author Ramprasad
/// @notice Deploy AegisRegistry then RiskGuard.
/// @dev Usage:
///      forge script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
///      Env overrides (all optional; defaults = Sepolia ENSv2 Beta, mock if zero):
///        ENS_REGISTRY, ENS_RESOLVER, UNIVERSAL_RESOLVER, PARENT_NAME
contract Deploy is Script {
    /// @notice Execute the deployment: reads env overrides and broadcasts AegisRegistry + RiskGuard.
    function run() external {
        address ensRegistry = vm.envOr("ENS_REGISTRY", 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2); // ETHRegistry
        address ensResolver = vm.envOr("ENS_RESOLVER", 0x508cb4E4596429Ca98a1bB3112d88D18F92456b5); // ENSV2Resolver
        address ur = vm.envOr("UNIVERSAL_RESOLVER", 0x4A1817d13E9cF196f471725176355C1234b63C70); // UniversalResolverV2
        string memory parentName = vm.envOr("PARENT_NAME", string("aegis.eth"));

        vm.startBroadcast();
        AegisRegistry registry = new AegisRegistry(ensRegistry, ensResolver, ur, parentName);
        RiskGuard guard = new RiskGuard(address(registry));
        vm.stopBroadcast();

        console.log("AegisRegistry:", address(registry));
        console.log("RiskGuard:    ", address(guard));
        console.log("ENS registry: ", ensRegistry);
        console.log("ENS resolver: ", ensResolver);
        console.log("URv2:         ", ur);
        console.log("Parent:       ", parentName);
    }
}
