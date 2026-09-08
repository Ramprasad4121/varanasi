// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";

/// @title AegisTest — unit tests for AegisRegistry + RiskGuard
/// @author Ramprasad
/// @notice Covers mint, expiry, revoke, renew and RiskGuard authorization; runs in mock mode offline.
contract AegisTest is Test {
    AegisRegistry registry;
    RiskGuard guard;

    address human = address(0xA11CE);
    address agent = address(0xBEEF);
    address stranger = address(0xDEAD);

    event AgentMinted(
        uint256 indexed tokenId, string sublabel, address indexed agentWallet, address indexed humanOwner, uint64 expiry
    );
    event AgentRevoked(uint256 indexed tokenId, string sublabel, address indexed humanOwner);

    function setUp() public {
        // Mock mode: ENS addresses unset → standalone, offline-friendly.
        vm.prank(human);
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        guard = new RiskGuard(address(registry));
    }

    // ── mint ──

    function test_MintSetsExpiryOwnerAndAuth() public {
        vm.prank(human);
        vm.expectEmit(true, true, true, true);
        emit AgentMinted(1, "agent-1", agent, human, uint64(block.timestamp + 30 days));
        uint256 id = registry.mintAgent("agent-1", agent, 30);

        assertEq(id, 1);
        assertEq(registry.tokenOwner(id), human);
        assertEq(registry.agentOf(id), agent);
        assertEq(registry.expiry(id), block.timestamp + 30 days);
        assertTrue(registry.isAuthorized(agent));
        assertEq(registry.tokenByAgent(agent), id);
        assertEq(registry.agentName(id), "agent-1.aegis.eth");
    }

    function test_MintRevertsOnDuplicateLabel() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        vm.expectRevert(AegisRegistry.LabelTaken.selector);
        registry.mintAgent("agent-1", stranger, 30);
    }

    function test_MintRevertsOnDuplicateWallet() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        vm.expectRevert(AegisRegistry.LabelTaken.selector);
        registry.mintAgent("agent-2", agent, 30);
    }

    function test_MintRevertsOnZeroWalletOrZeroDays() public {
        vm.prank(human);
        vm.expectRevert(AegisRegistry.ZeroAddress.selector);
        registry.mintAgent("zero-wallet", address(0), 30);
        vm.prank(human);
        vm.expectRevert(AegisRegistry.ZeroExpiry.selector);
        registry.mintAgent("zero-days", agent, 0);
    }

    // ── v2 label rules: 3-32 chars, [a-z0-9-] ──

    function test_LabelRules_RejectInvalid() public {
        string[8] memory bad = [
            "",
            "ab",
            "UPPER",
            "has space",
            "has.dot",
            "under_score",
            "Agent-1",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // 33 chars
        ];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.prank(human);
            vm.expectRevert(abi.encodeWithSelector(AegisRegistry.LabelInvalid.selector, bad[i]));
            registry.mintAgent(bad[i], address(uint160(0x1000 + i)), 30);
        }
    }

    function test_LabelRules_AcceptBoundaries() public {
        vm.prank(human);
        uint256 id1 = registry.mintAgent("abc", address(0x1111), 30); // min length
        assertEq(id1, 1);
        vm.prank(human);
        uint256 id2 = registry.mintAgent("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", address(0x2222), 30); // 32 chars
        assertEq(id2, 2);
        vm.prank(human);
        uint256 id3 = registry.mintAgent("a-1-0-z", address(0x3333), 30);
        assertEq(id3, 3);
    }

    // ── v2 MAX_EXPIRY_DAYS cap ──

    function test_MaxExpiryDays_MintAndRenewCapped() public {
        assertEq(registry.MAX_EXPIRY_DAYS(), 1825);
        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(AegisRegistry.ExpiryTooLong.selector, 1826, 1825)
        );
        registry.mintAgent("too-long", agent, 1826);
        vm.prank(human);
        uint256 id = registry.mintAgent("max-ok", agent, 1825);

        vm.prank(human);
        vm.expectRevert(
            abi.encodeWithSelector(AegisRegistry.ExpiryTooLong.selector, 1826, 1825)
        );
        registry.renewAgent(id, 1826);
    }

    // ── expiry ──

    function test_ExpiryDeauthorizes() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        assertTrue(registry.isAuthorized(agent));
        vm.warp(block.timestamp + 30 days + 1);
        assertFalse(registry.isAuthorized(agent));
    }

    // ── revoke ──

    function test_RevokeByIdDeauthorizes() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        vm.expectEmit(true, false, true, true);
        emit AgentRevoked(id, "agent-1", human);
        registry.revokeAgent(id);
        assertTrue(registry.revoked(id));
        assertFalse(registry.isAuthorized(agent));
    }

    function test_RevokeByLabelDeauthorizes() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgentByLabel("agent-1");
        assertFalse(registry.isAuthorized(agent));
    }

    function test_RevokeRevertsForNonOwner() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(stranger);
        vm.expectRevert(AegisRegistry.NotTokenOwner.selector);
        registry.revokeAgent(id);
    }

    function test_RevokeUnknownLabelReverts() public {
        vm.prank(human);
        vm.expectRevert(AegisRegistry.UnknownToken.selector);
        registry.revokeAgentByLabel("never-minted");
    }

    function test_DoubleRevokeByLabelRevertsUnknown() public {
        // v2: revoke FREES the label (grief recourse), so a second
        // revoke-by-label finds no mapping and reverts UnknownToken.
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgentByLabel("agent-1");
        vm.prank(human);
        vm.expectRevert(AegisRegistry.UnknownToken.selector);
        registry.revokeAgentByLabel("agent-1");
        assertFalse(registry.isAuthorized(agent));
    }

    // ── v2 revoke clears lookups + label freed for re-mint ──

    function test_RevokeClearsLookupsAndFreesLabel() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgent(id);
        assertTrue(registry.revoked(id));
        assertEq(registry.tokenByAgent(agent), 0);
        assertEq(registry.tokenByLabelHash(keccak256(bytes("agent-1"))), 0);
        assertFalse(registry.isAuthorized(agent));

        // Victim re-mints the freed label on a fresh wallet.
        vm.prank(human);
        uint256 id2 = registry.mintAgent("agent-1", stranger, 30);
        assertTrue(id2 != id);
        assertEq(registry.tokenByAgent(stranger), id2);
        assertTrue(registry.isAuthorized(stranger));
    }

    // ── v2 unRevoke accident recourse ──

    event AgentUnrevoked(uint256 indexed tokenId, string sublabel, address indexed humanOwner);

    function test_UnRevokeRestoresAuthorization() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgent(id);
        assertFalse(registry.isAuthorized(agent));

        vm.prank(human);
        vm.expectEmit(true, false, true, true);
        emit AgentUnrevoked(id, "agent-1", human);
        registry.unRevoke(id);

        assertFalse(registry.revoked(id));
        assertEq(registry.tokenByAgent(agent), id);
        assertEq(registry.tokenByLabelHash(keccak256(bytes("agent-1"))), id);
        assertTrue(registry.isAuthorized(agent));
    }

    function test_UnRevokeRevertsWhenLiveOrStranger() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        vm.expectRevert(abi.encodeWithSelector(AegisRegistry.NotRevoked.selector, id));
        registry.unRevoke(id);

        vm.prank(human);
        registry.revokeAgent(id);
        vm.prank(stranger);
        vm.expectRevert(AegisRegistry.NotTokenOwner.selector);
        registry.unRevoke(id);
    }

    function test_UnRevokeRevertsWhenLabelReminted() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgent(id);
        // Label grabbed by someone else while revoked: restore must not steal it.
        vm.prank(stranger);
        registry.mintAgent("agent-1", stranger, 30);
        vm.prank(human);
        vm.expectRevert(AegisRegistry.LabelTaken.selector);
        registry.unRevoke(id);
    }

    // ── renew ──

    function test_RenewExtendsExpiry() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        uint64 before = registry.expiry(id);
        vm.prank(human);
        registry.renewAgent(id, 30);
        assertEq(registry.expiry(id), before + 30 days);
        assertTrue(registry.isAuthorized(agent));
    }

    function test_RenewAfterExpiryReauthorizes() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.warp(block.timestamp + 31 days);
        assertFalse(registry.isAuthorized(agent));
        vm.prank(human);
        registry.renewAgentByLabel("agent-1", 30);
        assertTrue(registry.isAuthorized(agent));
    }

    function test_RenewDoesNotClearRevocation() public {
        vm.prank(human);
        uint256 id = registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgent(id);
        vm.prank(human);
        registry.renewAgent(id, 30);
        assertFalse(registry.isAuthorized(agent)); // explicit: revoke sticks
    }

    // ── RiskGuard ──

    function test_GuardAllowsLiveAgentUnderThreshold() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        assertTrue(guard.authorize(agent, 2_000, 5_000));
    }

    function test_GuardDeniesUnknownWallet() public {
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, stranger));
        guard.authorize(stranger, 100, 5_000);
    }

    function test_GuardDeniesRevokedAgent() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.prank(human);
        registry.revokeAgentByLabel("agent-1");
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, agent));
        guard.authorize(agent, 100, 5_000);
    }

    function test_GuardDeniesExpiredAgent() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.UnauthorizedAgent.selector, agent));
        guard.authorize(agent, 100, 5_000);
    }

    function test_GuardDeniesHighRisk() public {
        vm.prank(human);
        registry.mintAgent("agent-1", agent, 30);
        vm.expectRevert(abi.encodeWithSelector(RiskGuard.RiskTooHigh.selector, 8_000, 5_000));
        guard.authorize(agent, 8_000, 5_000);
    }

    // ── v2 2-step ownership + repoint guards ──

    function test_TwoStepOwnership_Registry() public {
        assertEq(registry.owner(), human);
        vm.prank(human);
        registry.transferOwnership(stranger);
        assertEq(registry.owner(), human); // unchanged until accept
        assertEq(registry.pendingOwner(), stranger);

        vm.prank(human);
        vm.expectRevert(abi.encodeWithSelector(AegisRegistry.NotPendingOwner.selector, human));
        registry.acceptOwnership();

        vm.prank(stranger);
        registry.acceptOwnership();
        assertEq(registry.owner(), stranger);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_TransferAdminAliasIsTwoStep() public {
        vm.prank(human);
        registry.transferAdmin(stranger);
        assertEq(registry.owner(), human);
        vm.prank(stranger);
        registry.acceptOwnership();
        assertEq(registry.owner(), stranger);
    }

    function test_RiskGuardSetRegistryRejectsZero() public {
        vm.expectRevert(RiskGuard.ZeroAddress.selector);
        guard.setRegistry(address(0));
    }
    function test_SetENSAddresses() public {
        vm.prank(human);
        registry.setENSAddresses(
            0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2, // ETHRegistry
            0x508cb4E4596429Ca98a1bB3112d88D18F92456b5, // ENSV2Resolver
            0x4A1817d13E9cF196f471725176355C1234b63C70 // UniversalResolverV2
        );
        assertEq(registry.ensRegistry(), 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2);
    }
}
