// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";

import {AegisRegistry} from "../src/AegisRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {AegisHook} from "../src/AegisHook.sol";

/// @title AegisHookTest — unit tests for AegisHook against real v4-core types
/// @author Ramprasad
/// @notice Unit tests for AegisHook against REAL v4-core types.
/// @dev The hook is deployed via CREATE2 with a mined salt so its address
///      carries exactly the beforeSwap permission bit — the same HookMiner
///      pattern the Sepolia deploy script uses. `beforeSwap` is invoked with
///      `vm.prank(poolManager, agent)` so msg.sender is the bound PoolManager
///      and tx.origin is the agent EOA (the hook attributes swaps to tx.origin).
contract AegisHookTest is Test {
    using PoolIdLibrary for PoolKey;

    // Low 14 bits must equal BEFORE_SWAP_FLAG (1 << 7).
    uint160 internal constant WANT_FLAGS = 1 << 7;
    uint160 internal constant ALL_HOOK_MASK = uint160((1 << 14) - 1);

    AegisRegistry registry;
    RiskGuard guard;
    AegisHook hook;

    // Dummy PoolManager stand-in: beforeSwap only checks msg.sender against it.
    address poolManager = address(0xCA11ED);
    uint256 defaultCap = 5_000;

    address human = address(0xA11CE);
    address agent = address(0xBEEF);
    address stranger = address(0xDEAD);

    PoolKey key;

    function setUp() public {
        vm.prank(human);
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        guard = new RiskGuard(address(registry));

        bytes memory creation = abi.encodePacked(
            type(AegisHook).creationCode, abi.encode(IPoolManager(poolManager), guard, defaultCap, address(this))
        );
        bytes32 salt = _findSalt(creation);
        hook = new AegisHook{salt: salt}(IPoolManager(poolManager), guard, defaultCap, address(this));

        key = PoolKey({
            currency0: Currency.wrap(address(0xC0A)),
            currency1: Currency.wrap(address(0xC0B)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        // Live identity for the agent; fresh low-risk attestation by default.
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        hook.setAgentRisk(agent, 2_000, uint64(block.timestamp + 7 days));
    }

    // ── hook-mining (HookMiner pattern) ──

    function _findSalt(bytes memory creation) internal view returns (bytes32 salt) {
        bytes32 initHash = keccak256(creation);
        for (uint256 i = 0; i < 500_000; i++) {
            salt = bytes32(i);
            address addr = vm.computeCreate2Address(salt, initHash, address(this));
            if ((uint160(addr) & ALL_HOOK_MASK) == WANT_FLAGS) return salt;
        }
        revert("salt not found");
    }

    function _swapAs(address origin)
        internal
        returns (bytes4 selector, BeforeSwapDelta delta, uint24 fee)
    {
        return _swapAsWithData(origin, "");
    }

    function _swapAsWithData(address origin, bytes memory hookData)
        internal
        returns (bytes4 selector, BeforeSwapDelta delta, uint24 fee)
    {
        SwapParams memory params =
            SwapParams({zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 4_295_128_739});
        vm.prank(poolManager, origin);
        return hook.beforeSwap(address(this), key, params, hookData);
    }

    // Attestation signer (operator EOA): hook owner/operator sigs verify as validators.
    uint256 internal validatorKey = 0xA11CE1;
    address internal validatorEOA = vm.addr(0xA11CE1);

    function _attestHookData(address attestedAgent, uint64 score, uint64 expiry)
        internal
        returns (bytes memory)
    {
        bytes32 digest = hook.attestationDigest(attestedAgent, score, expiry, key.toId());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(validatorKey, digest);
        return abi.encode(attestedAgent, score, expiry, abi.encodePacked(r, s, v));
    }

    // ── permission bits ──

    function test_PermissionBitsSatisfied() public view {
        assertEq(uint160(address(hook)) & ALL_HOOK_MASK, WANT_FLAGS);
        // Must not revert: mined address matches declared permissions.
        Hooks.validateHookPermissions(IHooks(address(hook)), hook.getHookPermissions());
        Hooks.Permissions memory p = hook.getHookPermissions();
        assertTrue(p.beforeSwap);
        assertFalse(p.afterSwap);
        assertFalse(p.beforeInitialize);
        assertFalse(p.beforeDonate);
        assertFalse(p.beforeSwapReturnDelta);
    }

    function test_ConstructorRevertsOnUnminedAddress() public {
        // A plain deployment lands on an address without the permission bits.
        try new AegisHook(IPoolManager(poolManager), guard, defaultCap, address(this)) returns (AegisHook) {
            fail("expected HookAddressNotValid");
        } catch (bytes memory err) {
            assertEq(bytes4(err), Hooks.HookAddressNotValid.selector);
        }
    }

    // ── the gate ──

    function test_AuthorizedLowRiskSwapPasses() public {
        (bytes4 sel, BeforeSwapDelta delta, uint24 fee) = _swapAs(agent);
        assertEq(sel, IHooks.beforeSwap.selector);
        assertTrue(BeforeSwapDelta.unwrap(delta) == BeforeSwapDelta.unwrap(BeforeSwapDeltaLibrary.ZERO_DELTA));
        assertEq(fee, 0); // no fee take, no fee override
    }

    function test_UnauthorizedSwapReverts() public {
        // Stranger holds no *.aegis.eth identity (attested or not, identity fails first).
        hook.setAgentRisk(stranger, 100, uint64(block.timestamp + 7 days));
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, stranger));
        _swapAs(stranger);
    }

    function test_UnauthorizedSwapRevertsWithoutAttestation() public {
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, stranger));
        _swapAs(stranger);
    }

    function test_HighRiskSwapReverts() public {
        hook.setAgentRisk(agent, 8_000, uint64(block.timestamp + 7 days));
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, 8_000, defaultCap));
        _swapAs(agent);
    }

    function test_BoundaryScorePasses() public {
        hook.setAgentRisk(agent, defaultCap, uint64(block.timestamp + 7 days));
        (bytes4 sel,,) = _swapAs(agent);
        assertEq(sel, IHooks.beforeSwap.selector);
    }

    function test_StaleAttestationReverts() public {
        hook.setAgentRisk(agent, 100, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(abi.encodeWithSelector(AegisHook.StaleAttestation.selector, agent));
        _swapAs(agent);
    }

    function test_RevokedAgentReverts() public {
        vm.prank(human);
        registry.revokeAgentByLabel("agent-1");
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, agent));
        _swapAs(agent);
    }

    function test_ExpiredIdentityReverts() public {
        vm.warp(block.timestamp + 31 days); // identity expired AND attestation stale-proof? refresh attestation
        hook.setAgentRisk(agent, 100, uint64(block.timestamp + 7 days));
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, agent));
        _swapAs(agent);
    }

    function test_NonPoolManagerCallerReverts() public {
        SwapParams memory params =
            SwapParams({zeroForOne: true, amountSpecified: -1 ether, sqrtPriceLimitX96: 4_295_128_739});
        vm.expectRevert(abi.encodeWithSelector(AegisHook.NotPoolManager.selector, address(this)));
        hook.beforeSwap(address(this), key, params, "");
    }

    // ── v2 EIP-712 attested path (hookData) ──

    function test_AttestedSwapPassesWithoutTxOrigin() public {
        hook.setOperator(validatorEOA, true);
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory hookData = _attestHookData(agent, 2_000, expiry);
        // tx.origin is a stranger with no identity: attested agent must be used.
        (bytes4 sel,,) = _swapAsWithData(stranger, hookData);
        assertEq(sel, IHooks.beforeSwap.selector);
    }

    function test_AttestedSwapExpiredReverts() public {
        hook.setOperator(validatorEOA, true);
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory hookData = _attestHookData(agent, 2_000, expiry);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(
            abi.encodeWithSelector(AegisHook.AttestationExpired.selector, agent, expiry)
        );
        _swapAsWithData(stranger, hookData);
    }

    function test_AttestedSwapBadSigReverts() public {
        hook.setOperator(validatorEOA, true);
        uint64 expiry = uint64(block.timestamp + 1 days);
        // Signed by an unknown key (not owner/operator).
        bytes32 digest = hook.attestationDigest(agent, 2_000, expiry, key.toId());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest);
        bytes memory hookData = abi.encode(agent, uint64(2_000), expiry, abi.encodePacked(r, s, v));
        vm.expectRevert(
            abi.encodeWithSelector(AegisHook.BadAttestation.selector, agent, vm.addr(0xBAD))
        );
        _swapAsWithData(stranger, hookData);
    }

    function test_AttestedSwapTamperedScoreReverts() public {
        hook.setOperator(validatorEOA, true);
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory hookData = _attestHookData(agent, 2_000, expiry);
        // Tamper the score after signing: digest mismatch → BadAttestation.
        bytes memory tampered = abi.encode(agent, uint64(100), expiry, _sigOf(hookData));
        vm.expectRevert(); // BadAttestation with an unpredictable recovered signer
        _swapAsWithData(stranger, tampered);
    }

    function _sigOf(bytes memory hookData) internal pure returns (bytes memory sig) {
        (,,, sig) = abi.decode(hookData, (address, uint64, uint64, bytes));
    }

    function test_AttestedSwapUnauthorizedAgentReverts() public {
        hook.setOperator(validatorEOA, true);
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory hookData = _attestHookData(stranger, 100, expiry); // stranger: no identity
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, stranger));
        _swapAsWithData(stranger, hookData);
    }

    function test_AttestedSwapHighRiskReverts() public {
        hook.setOperator(validatorEOA, true);
        uint64 expiry = uint64(block.timestamp + 1 days);
        bytes memory hookData = _attestHookData(agent, 8_000, expiry);
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, 8_000, defaultCap));
        _swapAsWithData(stranger, hookData);
    }

    // ── v2 MAX_ATTESTATION_TTL bound ──

    function test_SetAgentRiskEnforcesMaxTTL() public {
        assertEq(hook.MAX_ATTESTATION_TTL(), 30 days);
        uint64 tooFar = uint64(block.timestamp + 30 days + 1);
        vm.expectRevert(abi.encodeWithSelector(AegisHook.BadDeadline.selector, tooFar));
        hook.setAgentRisk(agent, 100, tooFar);
        // Boundary passes.
        hook.setAgentRisk(agent, 100, uint64(block.timestamp + 30 days));
    }

    // ── per-pool caps ──

    function test_PoolCapOverridesDefault() public {
        // Tighten this pool's cap below the agent's score → revert with pool cap.
        hook.setPoolCap(key, 1_000);
        assertEq(hook.effectiveCap(key), 1_000);
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, 2_000, 1_000));
        _swapAs(agent);
        // Clearing restores the default cap → passes again.
        hook.clearPoolCap(key);
        assertEq(hook.effectiveCap(key), defaultCap);
        (bytes4 sel,,) = _swapAs(agent);
        assertEq(sel, IHooks.beforeSwap.selector);
    }

    function test_SetDefaultCap() public {
        hook.setDefaultMaxAllowedBps(1_000);
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, 2_000, 1_000));
        _swapAs(agent);
    }

    // ── admin / writers ──

    function test_OnlyOperatorCanSetRisk() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AegisHook.NotOperator.selector, stranger));
        hook.setAgentRisk(stranger, 100, uint64(block.timestamp + 1 days));

        hook.setOperator(stranger, true);
        vm.prank(stranger);
        hook.setAgentRisk(stranger, 100, uint64(block.timestamp + 1 days));
        (uint64 score,) = hook.agentRisk(stranger);
        assertEq(score, 100);
    }

    function test_SetAgentRiskValidatesInputs() public {
        vm.expectRevert(AegisHook.ZeroAddress.selector);
        hook.setAgentRisk(address(0), 100, uint64(block.timestamp + 1 days));
        vm.expectRevert(abi.encodeWithSelector(AegisHook.BadScore.selector, 10_001));
        hook.setAgentRisk(agent, 10_001, uint64(block.timestamp + 1 days));
        vm.expectRevert(abi.encodeWithSelector(AegisHook.BadDeadline.selector, uint64(block.timestamp)));
        hook.setAgentRisk(agent, 100, uint64(block.timestamp));
    }

    function test_OnlyOwnerManagesPolicy() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AegisHook.NotOwner.selector, stranger));
        hook.setPoolCap(key, 1_000);
    }

    function test_SetRiskGuard() public {
        RiskGuard guard2 = new RiskGuard(address(registry));
        hook.setRiskGuard(guard2);
        assertEq(address(hook.riskGuard()), address(guard2));
    }

    function test_TwoStepOwnership_Hook() public {
        hook.transferOwnership(human);
        assertEq(hook.owner(), address(this)); // unchanged until accept
        assertEq(hook.pendingOwner(), human);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AegisHook.NotPendingOwner.selector, stranger));
        hook.acceptOwnership();
        vm.prank(human);
        hook.acceptOwnership();
        assertEq(hook.owner(), human);
        assertEq(hook.pendingOwner(), address(0));
    }

    function test_RegistryViewTracksGuard() public view {
        assertEq(address(hook.registry()), address(registry));
    }

    function test_WrongHookFunctionsRevert() public {
        vm.expectRevert(AegisHook.WrongHookFunction.selector);
        hook.afterSwap(address(this), key, SwapParams(true, -1 ether, 4_295_128_739), BalanceDelta.wrap(0), "");
    }
}
