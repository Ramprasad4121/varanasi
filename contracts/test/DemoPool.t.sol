// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";

import {MockERC20} from "../src/MockERC20.sol";
import {AegisHook} from "../src/AegisHook.sol";
import {DemoPoolLib} from "../script/DemoPool.s.sol";

/// @notice Fork-free unit coverage for the DemoPool showtime flow.
/// @dev Full pool creation needs Sepolia (live hook + periphery), so this file
///      covers the pure helpers (sorting, key params, range, unlock-data
///      encoding) plus MockERC20. `testFork_LiveWiring` runs ONLY when
///      SEPOLIA_RPC_URL is present and otherwise returns early (pass-through).
/// @notice External harness so `vm.expectRevert` can catch DemoPoolLib reverts
///         (internal library calls are inlined and invisible to expectRevert).
contract DemoPoolHarness {
    function sort(address a, address b) external pure returns (Currency c0, Currency c1) {
        return DemoPoolLib.sortCurrencies(a, b);
    }

    function mintUnlock(PoolKey memory key, uint256 liquidity, address owner)
        external
        pure
        returns (bytes memory)
    {
        return DemoPoolLib.mintUnlockData(key, liquidity, owner);
    }
}

contract DemoPoolTest is Test {
    // Live Sepolia wiring (mirrors DemoPoolLib; asserted, never written).
    address internal constant HOOK = 0xf3710A05cbb61eb8B1a73886eb68a341f69D0080;
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant POSITION_MANAGER = 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4;
    address internal constant QUOTER = 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address internal constant DEPLOYER = 0x1c686ac3aEF0E5534d772E840bBf20dfF30797a8;

    DemoPoolHarness internal harness = new DemoPoolHarness();

    // ── sorting ──

    function test_SortCurrenciesOrders() public pure {
        // 0xBEEF (48879) < 0xA11CE (659918): the smaller address is currency0.
        (Currency c0, Currency c1) = DemoPoolLib.sortCurrencies(address(0xBEEF), address(0xA11CE));
        assertEq(Currency.unwrap(c0), address(0xBEEF));
        assertEq(Currency.unwrap(c1), address(0xA11CE));
        assertTrue(Currency.unwrap(c0) < Currency.unwrap(c1));
    }

    function testFuzz_SortCurrencies(address a, address b) public pure {
        vm.assume(a != address(0) && b != address(0) && a != b);
        (Currency c0, Currency c1) = DemoPoolLib.sortCurrencies(a, b);
        assertTrue(Currency.unwrap(c0) < Currency.unwrap(c1));
        assertTrue(Currency.unwrap(c0) == a || Currency.unwrap(c0) == b);
        assertTrue(Currency.unwrap(c1) == a || Currency.unwrap(c1) == b);
    }

    function test_SortCurrenciesReverts() public {
        vm.expectRevert(DemoPoolLib.ZeroAddress.selector);
        harness.sort(address(0), address(0xA11CE));
        vm.expectRevert(DemoPoolLib.IdenticalTokens.selector);
        harness.sort(address(0xA11CE), address(0xA11CE));
    }

    // ── key params ──

    function test_BuildKeyParams() public pure {
        (Currency c0, Currency c1) = DemoPoolLib.sortCurrencies(address(0xBEEF), address(0xA11CE));
        PoolKey memory key = DemoPoolLib.buildKey(c0, c1);
        assertEq(key.fee, 3000);
        assertEq(key.tickSpacing, 60);
        assertEq(address(key.hooks), HOOK);
        assertEq(Currency.unwrap(key.currency0) < Currency.unwrap(key.currency1), true);
    }

    function test_SqrtPriceOneToOne() public pure {
        assertEq(DemoPoolLib.SQRT_PRICE_1_1, 79228162514264337593543950336); // 2**96
    }

    // ── range + liquidity ──

    function test_ValidatedTicks() public pure {
        (int24 lower, int24 upper) = DemoPoolLib.validatedTicks();
        assertEq(lower, -600);
        assertEq(upper, 600);
        assertEq(lower % 60, 0);
        assertEq(upper % 60, 0);
    }

    function test_LiquidityForDepositPositive() public pure {
        assertGt(DemoPoolLib.liquidityForDeposit(), 0);
    }

    // ── unlock-data encoding roundtrip ──

    function test_MintUnlockDataRoundtrip() public {
        (Currency c0, Currency c1) = DemoPoolLib.sortCurrencies(address(0xBEEF), address(0xA11CE));
        PoolKey memory key = DemoPoolLib.buildKey(c0, c1);
        uint256 liquidity = DemoPoolLib.liquidityForDeposit();
        address owner = address(0xBEEF);

        bytes memory unlockData = DemoPoolLib.mintUnlockData(key, liquidity, owner);
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));

        assertEq(actions.length, 2);
        assertEq(uint8(actions[0]), 0x02); // MINT_POSITION
        assertEq(uint8(actions[1]), 0x0d); // SETTLE_PAIR
        assertEq(params.length, 2);

        (
            PoolKey memory decodedKey,
            int24 tickLower,
            int24 tickUpper,
            uint256 decodedLiquidity,
            uint128 amount0Max,
            uint128 amount1Max,
            address decodedOwner,
        ) = abi.decode(params[0], (PoolKey, int24, int24, uint256, uint128, uint128, address, bytes));
        assertEq(decodedKey.fee, 3000);
        assertEq(decodedKey.tickSpacing, 60);
        assertEq(address(decodedKey.hooks), HOOK);
        assertEq(tickLower, -600);
        assertEq(tickUpper, 600);
        assertEq(decodedLiquidity, liquidity);
        assertGt(amount0Max, 0);
        assertGt(amount1Max, 0);
        assertEq(decodedOwner, owner);
    }

    function test_MintUnlockDataSettlePair() public pure {
        (Currency c0, Currency c1) = DemoPoolLib.sortCurrencies(address(0xBEEF), address(0xA11CE));
        PoolKey memory key = DemoPoolLib.buildKey(c0, c1);
        bytes memory unlockData =
            DemoPoolLib.mintUnlockData(key, DemoPoolLib.liquidityForDeposit(), address(0xBEEF));
        (, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        (bytes32 w0, bytes32 w1) = abi.decode(params[1], (bytes32, bytes32));
        assertEq(w0, bytes32(uint256(uint160(Currency.unwrap(c0)))));
        assertEq(w1, bytes32(uint256(uint160(Currency.unwrap(c1)))));
    }

    function test_MintUnlockDataRevertsOnZeroOwner() public {
        (Currency c0, Currency c1) = DemoPoolLib.sortCurrencies(address(0xBEEF), address(0xA11CE));
        vm.expectRevert(DemoPoolLib.ZeroAddress.selector);
        harness.mintUnlock(DemoPoolLib.buildKey(c0, c1), 1 ether, address(0));
    }

    // ── MockERC20 ──

    function test_MockMintAndDecimals() public {
        MockERC20 token = new MockERC20("Demo Token A", "DMO-A", 18);
        assertEq(token.decimals(), 18);
        token.mint(address(0xBEEF), 100 ether);
        assertEq(token.balanceOf(address(0xBEEF)), 100 ether);
    }

    function test_MockMintReverts() public {
        MockERC20 token = new MockERC20("Demo Token A", "DMO-A", 18);
        vm.expectRevert(MockERC20.ZeroAddress.selector);
        token.mint(address(0), 1 ether);
        vm.expectRevert(MockERC20.ZeroAmount.selector);
        token.mint(address(0xBEEF), 0);
        vm.expectRevert(MockERC20.EmptyMetadata.selector);
        new MockERC20("", "DMO-A", 18);
    }

    // ── Sepolia fork (opt-in) ──

    /// @notice Verifies live wiring on a Sepolia fork. Skips (passes) without SEPOLIA_RPC_URL.
    function testFork_LiveWiring() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // no RPC configured: skip
        vm.createSelectFork(rpc);

        assertGt(HOOK.code.length, 0, "hook missing");
        assertGt(POOL_MANAGER.code.length, 0, "pool manager missing");
        assertGt(POSITION_MANAGER.code.length, 0, "position manager missing");
        assertGt(QUOTER.code.length, 0, "quoter missing");
        assertGt(PERMIT2.code.length, 0, "permit2 missing");

        AegisHook hook = AegisHook(HOOK);
        assertEq(hook.owner(), DEPLOYER);
        assertEq(hook.defaultMaxAllowedBps(), 5000);
        assertEq(address(hook.poolManager()), POOL_MANAGER);
    }
}
