// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {Actions} from "v4-periphery/src/libraries/Actions.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {IPositionManager} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

import {MockERC20} from "../src/MockERC20.sol";

/// @notice Shared constants + pure helpers for the AegisHook live revert demo.
/// @dev All addresses verified live on Sepolia. Fork-free helpers are covered
///      by contracts/test/DemoPool.t.sol; the full flow needs Sepolia.
library DemoPoolLib {
    // ── Live Sepolia wiring (verified) ──
    address internal constant HOOK = 0xf3710A05cbb61eb8B1a73886eb68a341f69D0080;
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant POSITION_MANAGER = 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // ── Pool params ──
    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;
    int24 internal constant TICK_LOWER = -600;
    int24 internal constant TICK_UPPER = 600;
    /// @notice 1:1 starting price (2**96).
    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    // ── Demo funding ──
    uint256 internal constant MINT_SUPPLY = 1_000_000 ether;
    uint256 internal constant DEPOSIT0 = 1_000 ether;
    uint256 internal constant DEPOSIT1 = 1_000 ether;

    error ZeroAddress();
    error IdenticalTokens();
    error BadRange(int24 tickLower, int24 tickUpper);
    error ZeroLiquidity();

    /// @notice Sort two token addresses into (currency0, currency1), currency0 < currency1.
    function sortCurrencies(address tokenA, address tokenB) internal pure returns (Currency c0, Currency c1) {
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();
        if (tokenA == tokenB) revert IdenticalTokens();
        (c0, c1) = tokenA < tokenB
            ? (Currency.wrap(tokenA), Currency.wrap(tokenB))
            : (Currency.wrap(tokenB), Currency.wrap(tokenA));
    }

    /// @notice Build the demo PoolKey: fee 3000, tickSpacing 60, hooks = live AegisHook.
    function buildKey(Currency currency0, Currency currency1) internal pure returns (PoolKey memory key) {
        key = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(HOOK)
        });
    }

    /// @notice Validate the fixed -600/+600 range against tickSpacing 60.
    function validatedTicks() internal pure returns (int24 tickLower, int24 tickUpper) {
        (tickLower, tickUpper) = (TICK_LOWER, TICK_UPPER);
        if (tickLower >= tickUpper) revert BadRange(tickLower, tickUpper);
        if (tickLower % TICK_SPACING != 0 || tickUpper % TICK_SPACING != 0) {
            revert BadRange(tickLower, tickUpper);
        }
    }

    /// @notice Liquidity units for (DEPOSIT0, DEPOSIT1) over -600/+600 at 1:1.
    function liquidityForDeposit() internal pure returns (uint256 liquidity) {
        uint160 sqrtA = TickMath.getSqrtPriceAtTick(TICK_LOWER);
        uint160 sqrtB = TickMath.getSqrtPriceAtTick(TICK_UPPER);
        liquidity = LiquidityAmounts.getLiquidityForAmounts(SQRT_PRICE_1_1, sqrtA, sqrtB, DEPOSIT0, DEPOSIT1);
        if (liquidity == 0) revert ZeroLiquidity();
    }

    /// @notice Encode PositionManager unlockData for MINT_POSITION + SETTLE_PAIR.
    function mintUnlockData(PoolKey memory key, uint256 liquidity, address owner)
        internal
        pure
        returns (bytes memory unlockData)
    {
        if (owner == address(0)) revert ZeroAddress();
        if (liquidity == 0) revert ZeroLiquidity();
        (int24 tickLower, int24 tickUpper) = validatedTicks();
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(
            key, tickLower, tickUpper, liquidity, uint128(DEPOSIT0), uint128(DEPOSIT1), owner, bytes("")
        );
        params[1] = abi.encode(key.currency0, key.currency1);
        unlockData = abi.encode(actions, params);
    }
}

/// @notice ONE demo script: deploy 2 mocks, fund sender, init the hooked pool,
///         approve via Permit2, mint -600/+600 liquidity. Broadcast on Sepolia.
/// @dev Holds no value: `run` is non-payable and the script has no receive/fallback.
///      Usage:
///        forge script script/DemoPool.s.sol --rpc-url $SEPOLIA_RPC_URL \
///          --private-key $SEPOLIA_PRIVATE_KEY --sender $ADDR --broadcast
contract DemoPool is Script {
    function run() external {
        address sender = msg.sender;
        require(sender != address(0), "zero sender");

        vm.startBroadcast();

        MockERC20 tokenA = new MockERC20("Demo Token A", "DMO-A", 18);
        MockERC20 tokenB = new MockERC20("Demo Token B", "DMO-B", 18);
        tokenA.mint(sender, DemoPoolLib.MINT_SUPPLY);
        tokenB.mint(sender, DemoPoolLib.MINT_SUPPLY);

        (Currency currency0, Currency currency1) =
            DemoPoolLib.sortCurrencies(address(tokenA), address(tokenB));
        PoolKey memory key = DemoPoolLib.buildKey(currency0, currency1);

        IPoolManager poolManager = IPoolManager(DemoPoolLib.POOL_MANAGER);
        poolManager.initialize(key, DemoPoolLib.SQRT_PRICE_1_1);

        // Permit2 path: ERC20 -> Permit2 approval, then Permit2 -> PositionManager.
        MockERC20(Currency.unwrap(currency0)).approve(DemoPoolLib.PERMIT2, type(uint256).max);
        MockERC20(Currency.unwrap(currency1)).approve(DemoPoolLib.PERMIT2, type(uint256).max);
        IAllowanceTransfer(DemoPoolLib.PERMIT2).approve(
            Currency.unwrap(currency0), DemoPoolLib.POSITION_MANAGER, type(uint160).max, type(uint48).max
        );
        IAllowanceTransfer(DemoPoolLib.PERMIT2).approve(
            Currency.unwrap(currency1), DemoPoolLib.POSITION_MANAGER, type(uint160).max, type(uint48).max
        );

        uint256 liquidity = DemoPoolLib.liquidityForDeposit();
        bytes memory unlockData = DemoPoolLib.mintUnlockData(key, liquidity, sender);
        IPositionManager(DemoPoolLib.POSITION_MANAGER).modifyLiquidities(unlockData, block.timestamp + 1 hours);

        vm.stopBroadcast();

        console.log("tokenA:          ", address(tokenA));
        console.log("tokenB:          ", address(tokenB));
        console.log("currency0:       ", Currency.unwrap(currency0));
        console.log("currency1:       ", Currency.unwrap(currency1));
        console.log("liquidity units: ", liquidity);
    }
}
