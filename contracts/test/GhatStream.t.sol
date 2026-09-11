// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";
import {GhatStream} from "../src/GhatStream.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @title GhatStreamTest — continuous escrow: accrual, stop-cock, sweep, gates
/// @author Ramprasad
contract GhatStreamTest is Test {
    AegisRegistry registry;
    GhatStream ghat;
    MockERC20 usdc;

    uint256 payerKey = 424242;
    address payer;
    address agent = address(0xA6E17);
    address noIdAgent = address(0xBAD);
    address relayer = address(0x5E77);

    uint256 constant RATE = 100;
    uint256 constant CAP = 10_000;
    uint64 constant MAX_DURATION = 60;
    uint64 constant STREAM_TTL = 3600;

    uint256 nonceSeq;

    function setUp() public {
        payer = vm.addr(payerKey);
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        ghat = new GhatStream(address(registry));
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(payer, 100_000_000);
        vm.prank(payer);
        usdc.approve(address(ghat), type(uint256).max);
        registry.mintAgent("stream-1", agent, 90);
    }

    function _mandate(address who, uint64 ttl) internal view returns (GhatStream.StreamMandate memory m) {
        m.agent = who;
        m.payer = payer;
        m.token = address(usdc);
        m.ratePerSecond = RATE;
        m.cap = CAP;
        m.maxDuration = MAX_DURATION;
        m.expiry = uint64(block.timestamp) + ttl;
        m.nonce = ++nonceSeq;
        m.chainId = block.chainid;
    }

    function _sign(GhatStream.StreamMandate memory m) internal returns (bytes memory) {
        bytes32 digest = ghat.streamMandateDigest(m);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _opened() internal returns (bytes32 id) {
        GhatStream.StreamMandate memory m = _mandate(agent, STREAM_TTL);
        vm.prank(relayer); // permissionless submission path
        id = ghat.open(m, _sign(m));
    }

    function test_Open_EscrowsCapAndRequiresIdentity() public {
        GhatStream.StreamMandate memory m = _mandate(noIdAgent, STREAM_TTL);
        vm.expectRevert(abi.encodeWithSelector(GhatStream.UnauthorizedAgent.selector, noIdAgent));
        ghat.open(m, _sign(m));

        bytes32 id = _opened();
        assertEq(usdc.balanceOf(address(ghat)), CAP, "cap locked");
        (,,,, uint256 cap,, uint256 refunded,, uint64 openedAt,, bool frozen, bool closed) = ghat.streamOf(id);
        assertEq(cap, CAP);
        assertEq(refunded, 0);
        assertEq(openedAt, uint64(block.timestamp));
        assertFalse(frozen);
        assertFalse(closed);
    }

    function test_ReplayAndChainBinding() public {
        GhatStream.StreamMandate memory m = _mandate(agent, STREAM_TTL);
        bytes memory sig = _sign(m);
        ghat.open(m, sig);
        vm.expectRevert(abi.encodeWithSelector(GhatStream.NonceUsed.selector, payer, m.nonce));
        ghat.open(m, sig);
    }

    function test_AccrualAndClaim() public {
        bytes32 id = _opened();
        assertEq(ghat.claimableOf(id), 0, "zero at t=0");
        skip(10);
        assertEq(ghat.accruedOf(id), 10 * RATE);
        vm.prank(relayer); // anyone may claim; funds still route to the agent
        ghat.claim(id);
        assertEq(usdc.balanceOf(agent), 10 * RATE, "agent paid");
        assertEq(usdc.balanceOf(relayer), 0);
        vm.expectRevert(abi.encodeWithSelector(GhatStream.NothingToClaim.selector, id));
        ghat.claim(id);
    }

    function test_SaturationBelowCapThenSweep() public {
        bytes32 id = _opened();
        skip(MAX_DURATION + 30); // flow saturates at maxDuration
        uint256 due = uint256(MAX_DURATION) * RATE; // 60×100 = 6000 < cap
        assertEq(ghat.accruedOf(id), due, "min(cap, rate×dur)");
        assertLt(due, CAP);
        ghat.claim(id);
        assertEq(usdc.balanceOf(agent), due);
        skip(STREAM_TTL);
        uint256 p0 = usdc.balanceOf(payer);
        ghat.close(id);
        assertEq(usdc.balanceOf(payer) - p0, CAP - due, "remainder swept");
        assertEq(usdc.balanceOf(address(ghat)), 0, "nothing left behind");
    }

    function test_FullClaimAutoUnwindsWithoutWaitingExpiry() public {
        // rate×maxDuration ≥ cap → claiming the full cap closes the books now
        GhatStream.StreamMandate memory m = _mandate(agent, STREAM_TTL);
        m.ratePerSecond = 1_000; // 60 × 1000 = 60_000 > cap 10_000
        bytes32 id = ghat.open(m, _sign(m));
        skip(MAX_DURATION);
        assertEq(ghat.accruedOf(id), CAP, "accrual clamps to cap");
        ghat.claim(id);
        assertEq(usdc.balanceOf(agent), CAP);
        assertEq(usdc.balanceOf(address(ghat)), 0);
        // stream is auto-closed: no lingering dust to sweep
        vm.expectRevert(abi.encodeWithSelector(GhatStream.StreamClosedAlready.selector, id));
        ghat.close(id);
    }

    function test_StopFreezesAccrual() public {
        bytes32 id = _opened();
        skip(20);
        vm.prank(relayer);
        ghat.claim(id);
        uint256 first = usdc.balanceOf(agent);
        assertEq(first, 20 * RATE);

        vm.expectRevert(abi.encodeWithSelector(GhatStream.NotPayer.selector, address(this), payer));
        ghat.stop(id);

        vm.prank(payer);
        ghat.stop(id);
        uint256 frozen = ghat.accruedOf(id);
        skip(600); // a full minute of idleness must earn NOTHING
        assertEq(ghat.accruedOf(id), frozen, "frozen");

        // agent still owns what it earned before the stop; claimable closes the gap
        assertEq(ghat.claimableOf(id), frozen - first);
        vm.prank(agent);
        ghat.claim(id);
        assertEq(usdc.balanceOf(agent), frozen);
        assertEq(usdc.balanceOf(address(ghat)), CAP - frozen, "unearned still escrowed");

        vm.expectRevert(abi.encodeWithSelector(GhatStream.NotExpiredYet.selector, id, block.timestamp, uint64(block.timestamp + 2980)));
        ghat.close(id);
    }

    function test_CloseGatesAndConservation() public {
        bytes32 id = _opened();
        skip(15);
        ghat.claim(id);
        uint256 agentGot = usdc.balanceOf(agent);

        vm.expectRevert();
        ghat.close(id); // not expired

        skip(STREAM_TTL); // beyond expiry (block.timestamp advanced past it)
        uint256 payerBefore = usdc.balanceOf(payer);
        ghat.close(id);
        uint256 swept = usdc.balanceOf(payer) - payerBefore;
        assertEq(agentGot + swept, CAP, "conservation: agent + payer == cap");
        assertEq(usdc.balanceOf(address(ghat)), 0);

        vm.expectRevert(abi.encodeWithSelector(GhatStream.StreamClosedAlready.selector, id));
        ghat.claim(id);
    }

    function test_BadParamsRevert() public {
        GhatStream.StreamMandate memory m = _mandate(agent, STREAM_TTL);
        m.ratePerSecond = 0;
        vm.expectRevert(GhatStream.ZeroRate.selector);
        ghat.open(m, _sign(m));

        m = _mandate(agent, STREAM_TTL);
        m.cap = 0;
        vm.expectRevert(GhatStream.ZeroCap.selector);
        ghat.open(m, _sign(m));

        m = _mandate(agent, 0);
        vm.expectRevert(); // expiry must be in the future (MandateExpired)
        ghat.open(m, _sign(m));

        m = _mandate(agent, STREAM_TTL);
        m.maxDuration = type(uint64).max;
        m.ratePerSecond = type(uint256).max;
        vm.expectRevert(abi.encodeWithSelector(GhatStream.RateOverflowsCap.selector, m.ratePerSecond, m.maxDuration));
        ghat.open(m, _sign(m));
    }

    function test_UnknownAndZeroStreamPaths() public {
        bytes32 ghost = bytes32(uint256(0xDEAD));
        vm.expectRevert(abi.encodeWithSelector(GhatStream.UnknownStream.selector, ghost));
        ghat.claim(ghost);
        vm.expectRevert(abi.encodeWithSelector(GhatStream.UnknownStream.selector, ghost));
        ghat.close(ghost);
        vm.expectRevert(abi.encodeWithSelector(GhatStream.UnknownStream.selector, ghost));
        ghat.stop(ghost);
        assertEq(ghat.accruedOf(ghost), 0);
        assertEq(ghat.remainderOf(ghost), 0);
    }

    function test_RevokedIdentityKeepsAccruedMoney() public {
        bytes32 id = _opened();
        skip(30);
        // human kills the agent identity (Last Rite):
        registry.revokeAgent(1); // first minted token = agent's
        // accrued work is still claimable — revocation stops NEW flows, never steals earned ones
        ghat.claim(id);
        assertEq(usdc.balanceOf(agent), 30 * RATE);
        // but opening a new stream for the revoked agent must fail
        GhatStream.StreamMandate memory m = _mandate(agent, STREAM_TTL);
        vm.expectRevert(abi.encodeWithSelector(GhatStream.UnauthorizedAgent.selector, agent));
        ghat.open(m, _sign(m));
    }
}
