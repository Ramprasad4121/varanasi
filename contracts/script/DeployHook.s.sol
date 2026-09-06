// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";

import {RiskGuard} from "../src/RiskGuard.sol";
import {AegisHook} from "../src/AegisHook.sol";

/// @notice Deploy AegisHook to Sepolia at a hook-valid address (HookMiner pattern).
/// @dev Mining AND deployment both go through the canonical keyless CREATE2
///      deployer (Arachnid deterministic-deployment-proxy, same address on
///      every EVM chain — also whitelisted in forge-std). The hook's `owner`
///      constructor arg is set to OWNER, because a factory deployment would
///      otherwise leave msg.sender (and thus admin rights) with the factory.
///      Pattern mirrors Uniswap's own `DeployReservesLens.s.sol` + `HookMiner`:
///      mine offchain-in-script → `CANONICAL.call(abi.encodePacked(salt, initcode))`.
/// @dev Usage (see contracts/UNISWAP.md for the full checklist):
///      forge script script/DeployHook.s.sol --rpc-url $SEPOLIA_RPC_URL \
///        --private-key $SEPOLIA_PRIVATE_KEY --sender $ADDR --broadcast
///      Env overrides (all optional):
///        POOL_MANAGER   (default: Sepolia canonical 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543)
///        RISK_GUARD     (default: live 0xc35861C4dbE63A9C8cFEfd32C671998151c217cA)
///        DEFAULT_MAX_BPS(default: 5000)
///        OWNER          (default: script msg.sender, i.e. --sender $ADDR)
///        OPERATOR       (optional extra risk writer, address or 0x0 to skip)
///        AGENT          (optional demo agent to attest, address or 0x0 to skip)
///        RISK_SCORE_BPS (default: 2000; used only if AGENT set)
///        RISK_TTL_DAYS  (default: 7; used only if AGENT set)
contract DeployHook is Script {
    /// @notice Canonical Uniswap v4 PoolManager on Sepolia (docs.uniswap.org → v4 deployments).
    address internal constant SEPOLIA_POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    /// @notice Live AEGIS RiskGuard on Sepolia.
    address internal constant SEPOLIA_RISK_GUARD = 0xc35861C4dbE63A9C8cFEfd32C671998151c217cA;
    /// @notice Keyless cross-chain CREATE2 deployer (Arachnid proxy). Same on all EVM chains.
    address internal constant CANONICAL_CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        address poolManager = vm.envOr("POOL_MANAGER", SEPOLIA_POOL_MANAGER);
        address riskGuard = vm.envOr("RISK_GUARD", SEPOLIA_RISK_GUARD);
        uint256 defaultMaxBps = vm.envOr("DEFAULT_MAX_BPS", uint256(5_000));
        address owner = vm.envOr("OWNER", msg.sender);
        address operator = vm.envOr("OPERATOR", address(0));
        address agent = vm.envOr("AGENT", address(0));
        uint256 riskScore = vm.envOr("RISK_SCORE_BPS", uint256(2_000));
        uint256 riskTtlDays = vm.envOr("RISK_TTL_DAYS", uint256(7));

        require(poolManager != address(0) && riskGuard != address(0), "zero wiring");
        require(owner != address(0), "zero owner");
        require(defaultMaxBps <= 10_000, "bad cap");

        bytes memory initcode = abi.encodePacked(
            type(AegisHook).creationCode,
            abi.encode(IPoolManager(poolManager), RiskGuard(riskGuard), defaultMaxBps, owner)
        );
        (bytes32 salt, address expected) = _mineSalt(initcode);
        console.log("Mined hook address:", expected);
        console.log("Salt:");
        console.logBytes32(salt);
        console.log("Hook permission bits (want 0x0080):", uint160(expected) & Hooks.ALL_HOOK_MASK);

        if (CANONICAL_CREATE2_DEPLOYER.code.length == 0) {
            // Local dry-run (no --rpc-url): deployer has no code here. Mining
            // preview above is chain-independent except the deployer address —
            // re-run with --rpc-url $SEPOLIA_RPC_URL to deploy for real.
            console.log("Dry-run only: canonical deployer missing locally. Re-run with --rpc-url.");
            return;
        }

        vm.startBroadcast();
        if (expected.code.length == 0) {
            (bool ok,) = CANONICAL_CREATE2_DEPLOYER.call(abi.encodePacked(salt, initcode));
            require(ok && expected.code.length != 0, "hook deployment failed");
        }
        AegisHook hook = AegisHook(expected);
        require(hook.owner() == owner, "owner mismatch");
        if (operator != address(0)) hook.setOperator(operator, true);
        if (agent != address(0)) {
            hook.setAgentRisk(agent, riskScore, uint64(block.timestamp + riskTtlDays * 1 days));
        }
        vm.stopBroadcast();

        console.log("AegisHook:      ", address(hook));
        console.log("PoolManager:    ", poolManager);
        console.log("RiskGuard:      ", riskGuard);
        console.log("Default cap bps:", defaultMaxBps);
        console.log("Owner:          ", hook.owner());
    }

    /// @notice HookMiner-style brute force: find a salt so the canonical
    ///         deployer lands the hook on a beforeSwap-only address
    ///         (`uint160(addr) & 0x3FFF == 0x0080`). ~16k iterations on average.
    function _mineSalt(bytes memory initcode) internal view returns (bytes32 salt, address expected) {
        bytes32 initHash = keccak256(initcode);
        for (uint256 i = 0; i < 500_000; i++) {
            salt = bytes32(i);
            expected = address(
                uint160(
                    uint256(
                        keccak256(abi.encodePacked(bytes1(0xff), CANONICAL_CREATE2_DEPLOYER, salt, initHash))
                    )
                )
            );
            if (expected.code.length == 0 && uint160(expected) & Hooks.ALL_HOOK_MASK == Hooks.BEFORE_SWAP_FLAG) {
                return (salt, expected);
            }
        }
        revert("salt not mined");
    }
}
