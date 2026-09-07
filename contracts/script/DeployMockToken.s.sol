// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @title DeployMockToken — demo ERC20 deployment + mint script
/// @author Ramprasad
/// @notice Deploy one MockERC20 (demo USD) + mint to sender.
/// @dev Env: TOKEN_NAME (default VaranasiUSD), TOKEN_SYMBOL (default vUSD),
///      TOKEN_DECIMALS (default 6), MINT_TO (default sender), MINT_AMOUNT (default 1e9).
contract DeployMockToken is Script {
    /// @notice Deploy a MockERC20 with env-configured name/symbol/decimals and mint initial supply.
    function run() external {
        string memory name = vm.envOr("TOKEN_NAME", string("VaranasiUSD"));
        string memory symbol = vm.envOr("TOKEN_SYMBOL", string("vUSD"));
        uint8 decimals = uint8(vm.envOr("TOKEN_DECIMALS", uint256(6)));
        address to = vm.envOr("MINT_TO", msg.sender);
        uint256 amount = vm.envOr("MINT_AMOUNT", uint256(1_000_000_000));
        vm.startBroadcast();
        MockERC20 token = new MockERC20(name, symbol, decimals);
        token.mint(to, amount);
        vm.stopBroadcast();
        console.log("MockERC20:", address(token));
        console.log("Minted:", amount, "to", to);
    }
}
