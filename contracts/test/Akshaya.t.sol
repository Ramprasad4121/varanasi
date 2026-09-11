// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {AegisRegistry} from "../src/AegisRegistry.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {TaskEscrow} from "../src/TaskEscrow.sol";
import {Akshaya} from "../src/Akshaya.sol";
import {MockERC20} from "../src/MockERC20.sol";

/// @title AkshayaTest — proof-of-outcome reputation, decay, soulbound
/// @author Ramprasad
/// @notice Same stack as TaskEscrowTest (mock-mode registry → offline). The
///         scenario mirrors contracts/README § Invariants and the EVM harness.
contract AkshayaTest is Test {
    AegisRegistry registry;
    RiskGuard guard;
    TaskEscrow escrow;
    Akshaya akshaya;
    MockERC20 usdc;

    uint256 payerKey = 424242;
    address payer;
    address agent = address(0xA6E17);
    address merchant = address(0x4E2C4);
    address validator = address(0x8A11DA702);

    uint256 constant CAP = 1_000_000;
    uint256 constant THRESHOLD = 5_000;

    uint256 nonceSeq;

    /// @dev Locally declared so expectEmit can match the onchain event shape
    ///      (house pattern from TaskEscrow.t.sol — Solidity cannot emit via
    ///      contract-qualified references).
    event Attested(bytes32 indexed taskId, address indexed agent, uint8 outcome, uint256 indexed tokenId);

    function setUp() public {
        payer = vm.addr(payerKey);
        registry = new AegisRegistry(address(0), address(0), address(0), "aegis.eth");
        guard = new RiskGuard(address(registry));
        escrow = new TaskEscrow(address(guard), THRESHOLD);
        escrow.setValidator(validator, true);
        akshaya = new Akshaya(address(escrow));
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdc.mint(payer, 100_000_000);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
        registry.mintAgent("sentinel-1", agent, 90);
    }

    function _mandate(uint256 nonce) internal view returns (TaskEscrow.Mandate memory m) {
        m.agent = agent;
        m.merchant = merchant;
        m.token = address(usdc);
        m.cap = CAP;
        m.windowStart = uint64(block.timestamp);
        m.windowEnd = uint64(block.timestamp + 1 days);
        m.expiry = uint64(block.timestamp + 7 days);
        m.nonce = nonce;
        m.chainId = block.chainid;
    }

    function _sign(TaskEscrow.Mandate memory m) internal returns (bytes memory) {
        bytes32 digest = escrow.mandateDigest(m);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev fund + validate + release — a completed, paid hire.
    function _released() internal returns (bytes32 taskId) {
        TaskEscrow.Mandate memory m = _mandate(++nonceSeq);
        taskId = escrow.fund(m, _sign(m));
        vm.prank(validator);
        escrow.submitValidation(taskId, 8_000);
        escrow.release(taskId);
    }

    function test_AttestRelease_MintsCoinAndScore() public {
        bytes32 id = _released();
        uint256 balBefore = usdc.balanceOf(merchant);
        assertEq(balBefore, CAP, "release paid");

        vm.expectEmit(true, true, false, false);
        emit Attested(id, agent, 1, 1);
        akshaya.attest(id);

        (uint128 coins, uint128 dust, int256 score, uint32 period) = akshaya.statsOf(agent);
        assertEq(coins, 1);
        assertEq(dust, 0);
        assertEq(score, 10_000);
        assertEq(period, uint32(block.timestamp / akshaya.PERIOD()));
        assertEq(akshaya.balanceOf(agent), 1);
        assertEq(akshaya.ownerOf(1), agent);
        assertEq(usdc.balanceOf(address(akshaya)), 0, "holds no tokens");
    }

    function test_AttestIsIdempotent() public {
        bytes32 id = _released();
        akshaya.attest(id);
        vm.expectRevert(abi.encodeWithSelector(Akshaya.AlreadyAttested.selector, id));
        akshaya.attest(id);
    }

    function test_AttestRejectsNonTerminal() public {
        TaskEscrow.Mandate memory m = _mandate(++nonceSeq);
        bytes32 id = escrow.fund(m, _sign(m));
        vm.expectRevert(abi.encodeWithSelector(Akshaya.NotSettled.selector, id));
        akshaya.attest(id);

        vm.prank(validator);
        escrow.submitValidation(id, 8_000); // VALIDATED — still not terminal
        vm.expectRevert(abi.encodeWithSelector(Akshaya.NotSettled.selector, id));
        akshaya.attest(id);
    }

    function test_RefundMintsDust() public {
        TaskEscrow.Mandate memory m = _mandate(++nonceSeq);
        bytes32 id = escrow.fund(m, _sign(m));
        vm.warp(block.timestamp + 8 days);
        escrow.refund(id);
        akshaya.attest(id);
        (uint128 coins, uint128 dust, int256 score,) = akshaya.statsOf(agent);
        assertEq(coins, 0);
        assertEq(dust, 1);
        assertEq(score, -4_000);
    }

    function test_DecayHalfLife() public {
        bytes32 id = _released();
        akshaya.attest(id);
        assertEq(akshaya.scoreOf(agent), 10_000);
        vm.warp(block.timestamp + 90 days - 1);
        assertEq(akshaya.scoreOf(agent), 10_000, "not yet a full period");
        vm.warp(block.timestamp + 1);
        assertEq(akshaya.scoreOf(agent), 5_000, "halved at 90d");
        vm.warp(block.timestamp + 180 days);
        assertEq(akshaya.scoreOf(agent), 1_250, "halved twice more");
    }

    function test_CoinThenDustSignedDecay() public {
        bytes32 a = _released();
        akshaya.attest(a);
        vm.warp(block.timestamp + 180 days); // coin decayed to 10_000>>2 = 2_500
        TaskEscrow.Mandate memory m = _mandate(++nonceSeq);
        bytes32 b = escrow.fund(m, _sign(m));
        vm.warp(block.timestamp + 8 days);
        escrow.refund(b);
        akshaya.attest(b); // raw = 2_500 − 4_000 = −1_500
        assertEq(akshaya.scoreOf(agent), -1_500);
    }

    function test_Soulbound() public {
        bytes32 id = _released();
        akshaya.attest(id);
        vm.expectRevert(Akshaya.Soulbound.selector);
        akshaya.transferFrom(agent, address(0xB0B), 1);
        vm.expectRevert(Akshaya.Soulbound.selector);
        akshaya.approve(address(0xB0B), 1);
        vm.expectRevert(Akshaya.Soulbound.selector);
        akshaya.setApprovalForAll(address(0xB0B), true);
        assertTrue(akshaya.supportsInterface(0x80ac5870));
    }

    function test_BatchAndUnknownToken() public {
        bytes32 a = _released();
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = a;
        akshaya.attestBatch(ids);
        assertEq(akshaya.totalReceipts(), 1);
        vm.expectRevert(abi.encodeWithSelector(Akshaya.UnknownToken.selector, 99));
        akshaya.ownerOf(99);
    }
}
