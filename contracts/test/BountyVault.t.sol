// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {RiskGuardEvaluator} from "../src/RiskGuardEvaluator.sol";
import {BountyVault} from "../src/BountyVault.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract BountyVaultTest is Test {
    AgenticCommerce acp;
    RiskGuardEvaluator ev;
    BountyVault vault;
    MockERC20 usdc;

    address sponsor = address(0x5905);
    address hunter = address(0x4A7);
    address hunter2 = address(0x4A8);
    address treasury = address(0x7E);
    address target = address(0x7A26E7);
    uint256 signerKey = 0xA11CE;

    uint256 constant POT = 10_000e6;
    uint256 constant BOND = 50e6;
    bytes32 constant INV_CRIT = keccak256("SolvencyInvariant.sol");
    bytes32 constant INV_HIGH = keccak256("AccountingInvariant.sol");
    bytes32 constant POC = keccak256("exploit bytes");
    bytes32 constant LOGS = keccak256("logs");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        acp = new AgenticCommerce(IERC20(address(usdc)), treasury, 100); // 1%
        address[] memory s = new address[](1);
        s[0] = vm.addr(signerKey);
        ev = new RiskGuardEvaluator(acp, address(this), s);
        vault = new BountyVault(acp, address(ev));
        usdc.mint(sponsor, 1_000_000e6);
        usdc.mint(hunter, 1_000e6);
        usdc.mint(hunter2, 1_000e6);
        vm.prank(sponsor);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(hunter);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(hunter2);
        usdc.approve(address(vault), type(uint256).max);
        vm.roll(100);
    }

    function _bounty() internal returns (uint256 id) {
        bytes32[] memory inv = new bytes32[](2);
        inv[0] = INV_CRIT;
        inv[1] = INV_HIGH;
        uint256[] memory pay = new uint256[](2);
        pay[0] = 5_000e6;
        pay[1] = 1_000e6;
        vm.prank(sponsor);
        id = vault.createBounty(target, POT, BOND, uint64(block.timestamp + 30 days), 1 days, inv, pay);
    }

    function _open(address who, uint256 bountyId, uint256 tier) internal returns (uint256 claimId, uint256 jobId) {
        vm.prank(who);
        (claimId, jobId) = vault.openClaim(bountyId, tier, 99);
        vm.prank(who);
        acp.submit(jobId, POC, "");
    }

    function _settle(uint256 jobId, bool pass) internal {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ev.verdictDigest(jobId, POC, pass, LOGS));
        ev.settle(jobId, POC, pass, LOGS, abi.encodePacked(r, s, v));
    }

    function _available(uint256 id) internal view returns (uint256 a) {
        (,,,,, a,,) = vault.bountyInfo(id);
    }

    function _status(uint256 claimId) internal view returns (BountyVault.ClaimStatus st) {
        (,,,,,, st) = vault.claims(claimId);
    }

    // ------------------------------------------------------------- create

    function test_createBounty_commitsTiersAndPullsPot() public {
        uint256 id = _bounty();
        assertEq(usdc.balanceOf(address(vault)), POT);
        assertEq(_available(id), POT);
        BountyVault.Tier memory t = vault.tierOf(id, 0);
        assertEq(t.invariantHash, INV_CRIT);
        assertEq(t.payout, 5_000e6);
        assertFalse(t.paid);
    }

    function test_createBounty_potMustCoverLargestTier() public {
        bytes32[] memory inv = new bytes32[](1);
        inv[0] = INV_CRIT;
        uint256[] memory pay = new uint256[](1);
        pay[0] = POT + 1;
        vm.prank(sponsor);
        vm.expectRevert(abi.encodeWithSelector(BountyVault.InsufficientPot.selector, POT, POT + 1));
        vault.createBounty(target, POT, BOND, uint64(block.timestamp + 1 days), 1 days, inv, pay);
    }

    function test_createBounty_badParams() public {
        bytes32[] memory inv = new bytes32[](1);
        uint256[] memory pay = new uint256[](1);
        pay[0] = 1;
        vm.startPrank(sponsor);
        vm.expectRevert(BountyVault.BadParam.selector); // zero invariant hash
        vault.createBounty(target, POT, BOND, uint64(block.timestamp + 1 days), 1 days, inv, pay);
        inv[0] = INV_CRIT;
        vm.expectRevert(BountyVault.BadParam.selector); // zero bond
        vault.createBounty(target, POT, 0, uint64(block.timestamp + 1 days), 1 days, inv, pay);
        vm.expectRevert(BountyVault.BadParam.selector); // past deadline
        vault.createBounty(target, POT, BOND, uint64(block.timestamp), 1 days, inv, pay);
        vm.expectRevert(BountyVault.BadParam.selector); // length mismatch
        vault.createBounty(target, POT, BOND, uint64(block.timestamp + 1 days), 1 days, inv, new uint256[](2));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- claim

    function test_openClaim_postsBond_fundsJob_bindsTerms() public {
        uint256 id = _bounty();
        vm.prank(hunter);
        (uint256 claimId, uint256 jobId) = vault.openClaim(id, 0, 99);
        assertEq(usdc.balanceOf(hunter), 1_000e6 - BOND);
        assertEq(usdc.balanceOf(address(acp)), 5_000e6);
        assertEq(_available(id), POT - 5_000e6);
        AgenticCommerce.Job memory j = acp.getJob(jobId);
        assertEq(j.client, address(vault));
        assertEq(j.provider, hunter);
        assertEq(j.evaluator, address(ev));
        assertEq(j.hook, address(vault));
        assertEq(j.budget, 5_000e6);
        assertEq(uint8(j.status), uint8(AgenticCommerce.Status.Funded));
        assertEq(vault.claimOfJob(jobId), claimId);
        // description carries the committed terms so the verifier can read them from the job alone
        assertEq(
            j.description,
            string.concat(
                "varanasi-bounty:v1:vault=",
                vm.toLowercase(vm.toString(address(vault))),
                ":bounty=1:tier=0:forkBlock=99:invariant=",
                vm.toString(INV_CRIT)
            )
        );
    }

    function test_oneOpenClaimPerTier() public {
        uint256 id = _bounty();
        _open(hunter, id, 0);
        vm.prank(hunter2);
        vm.expectRevert(BountyVault.TierUnavailable.selector);
        vault.openClaim(id, 0, 99);
        // other tier is free
        vm.prank(hunter2);
        vault.openClaim(id, 1, 99);
    }

    function test_validPoC_paysTier_returnsBond_closesTier() public {
        uint256 id = _bounty();
        (uint256 claimId, uint256 jobId) = _open(hunter, id, 0);
        _settle(jobId, true);
        assertEq(usdc.balanceOf(hunter), 1_000e6 - BOND + 4_950e6); // tier minus 1% fee
        assertEq(usdc.balanceOf(treasury), 50e6);
        assertEq(vault.credit(hunter), BOND);
        vm.prank(hunter);
        vault.withdrawCredit();
        assertEq(usdc.balanceOf(hunter), 1_000e6 + 4_950e6);
        assertEq(uint8(_status(claimId)), uint8(BountyVault.ClaimStatus.Paid));
        assertTrue(vault.tierOf(id, 0).paid);
        assertEq(_available(id), POT - 5_000e6);
        vm.prank(hunter2);
        vm.expectRevert(BountyVault.TierUnavailable.selector); // duplicate never paid twice
        vault.openClaim(id, 0, 99);
    }

    function test_invalidPoC_slashesBond_restoresPot_reopensTier() public {
        uint256 id = _bounty();
        (uint256 claimId, uint256 jobId) = _open(hunter, id, 0);
        _settle(jobId, false);
        assertEq(usdc.balanceOf(hunter), 1_000e6 - BOND);
        assertEq(vault.credit(hunter), 0);
        assertEq(uint8(_status(claimId)), uint8(BountyVault.ClaimStatus.Slashed));
        assertEq(_available(id), POT + BOND); // slashed bond grows the pot
        assertEq(usdc.balanceOf(address(vault)), POT + BOND);
        assertFalse(vault.tierOf(id, 0).paid);
        // tier reopens for the next hunter
        (, uint256 job2) = _open(hunter2, id, 0);
        _settle(job2, true);
        assertTrue(vault.tierOf(id, 0).paid);
    }

    function test_cannotFlipSlashedClaim() public {
        uint256 id = _bounty();
        (, uint256 jobId) = _open(hunter, id, 0);
        _settle(jobId, false);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ev.verdictDigest(jobId, POC, true, LOGS));
        vm.expectRevert(abi.encodeWithSelector(RiskGuardEvaluator.AlreadySettled.selector, jobId));
        ev.settle(jobId, POC, true, LOGS, abi.encodePacked(r, s, v));
    }

    function test_expiredClaim_refundsBond_andPot() public {
        uint256 id = _bounty();
        (uint256 claimId,) = _open(hunter, id, 0);
        vm.expectRevert(BountyVault.JobNotExpired.selector);
        vault.reclaimExpired(claimId);
        vm.warp(block.timestamp + 1 days + 1);
        vault.reclaimExpired(claimId);
        assertEq(vault.credit(hunter), BOND);
        assertEq(_available(id), POT);
        assertEq(uint8(_status(claimId)), uint8(BountyVault.ClaimStatus.Refunded));
        vm.expectRevert(BountyVault.ClaimNotOpen.selector);
        vault.reclaimExpired(claimId);
    }

    function test_expiredClaim_afterDirectClaimRefund() public {
        uint256 id = _bounty();
        (uint256 claimId, uint256 jobId) = _open(hunter, id, 0);
        vm.warp(block.timestamp + 1 days + 1);
        acp.claimRefund(jobId); // someone refunds on commerce directly (unhooked)
        vault.reclaimExpired(claimId);
        assertEq(vault.credit(hunter), BOND);
        assertEq(_available(id), POT);
    }

    function test_hookOnlyCommerce() public {
        vm.expectRevert(BountyVault.NotCommerce.selector);
        vault.afterAction(1, AgenticCommerce.complete.selector, "");
        vm.expectRevert(BountyVault.NotCommerce.selector);
        vault.beforeAction(1, AgenticCommerce.submit.selector, "");
    }

    function test_onlyHunterCanSubmit() public {
        uint256 id = _bounty();
        vm.prank(hunter);
        (, uint256 jobId) = vault.openClaim(id, 0, 99);
        vm.prank(hunter2);
        vm.expectRevert(AgenticCommerce.NotAuthorized.selector);
        acp.submit(jobId, POC, "");
    }

    function test_hunterCannotChangeBudget() public {
        uint256 id = _bounty();
        vm.prank(hunter);
        (, uint256 jobId) = vault.openClaim(id, 0, 99);
        vm.prank(hunter);
        vm.expectRevert(abi.encodeWithSelector(AgenticCommerce.WrongStatus.selector, AgenticCommerce.Status.Funded));
        acp.setBudget(jobId, 1, "");
    }

    function test_noClaimsAfterDeadline_andSponsorWithdraw() public {
        uint256 id = _bounty();
        (, uint256 jobId) = _open(hunter, id, 1);
        vm.prank(sponsor);
        vm.expectRevert(BountyVault.StillActive.selector);
        vault.withdrawRemaining(id);
        _settle(jobId, false);
        vm.warp(block.timestamp + 31 days);
        vm.prank(hunter2);
        vm.expectRevert(BountyVault.BountyClosed.selector);
        vault.openClaim(id, 0, 99);
        vm.prank(hunter);
        vm.expectRevert(BountyVault.NotSponsor.selector);
        vault.withdrawRemaining(id);
        uint256 before = usdc.balanceOf(sponsor);
        vm.prank(sponsor);
        vault.withdrawRemaining(id);
        assertEq(usdc.balanceOf(sponsor), before + POT + BOND);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function test_potExhaustion_blocksClaim() public {
        bytes32[] memory inv = new bytes32[](2);
        inv[0] = INV_CRIT;
        inv[1] = INV_HIGH;
        uint256[] memory pay = new uint256[](2);
        pay[0] = 5_000e6;
        pay[1] = 5_000e6;
        vm.prank(sponsor);
        uint256 id = vault.createBounty(target, 5_000e6, BOND, uint64(block.timestamp + 1 days), 1 days, inv, pay);
        _open(hunter, id, 0);
        vm.prank(hunter2);
        vm.expectRevert(abi.encodeWithSelector(BountyVault.InsufficientPot.selector, 0, 5_000e6));
        vault.openClaim(id, 1, 99);
        vm.prank(sponsor);
        vault.topUp(id, 5_000e6);
        vm.prank(hunter2);
        vault.openClaim(id, 1, 99);
    }

    // ---------------------------------------------------------------- fuzz

    /// Conservation: whatever mix of pass / fail / expiry happens, every token is accounted for:
    /// vault balance == pot available + unclaimed credit, commerce holds nothing, fee == 1% of paid tiers.
    function testFuzz_accountingConserved(uint8 outcomesSeed, uint8 n, uint96 bondSeed) public {
        n = uint8(bound(n, 1, 6));
        uint256 bond = bound(bondSeed, 1, 500e6);
        bytes32[] memory inv = new bytes32[](n);
        uint256[] memory pay = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            inv[i] = keccak256(abi.encode(i));
            pay[i] = (i + 1) * 100e6;
        }
        vm.prank(sponsor);
        uint256 id = vault.createBounty(target, 3_000e6, bond, uint64(block.timestamp + 30 days), 1 days, inv, pay);

        uint256[] memory jobs = new uint256[](n);
        uint256[] memory claimIds = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            address h = address(uint160(0x1000 + i));
            usdc.mint(h, bond);
            vm.prank(h);
            usdc.approve(address(vault), bond);
            vm.prank(h);
            (claimIds[i], jobs[i]) = vault.openClaim(id, i, 99);
            vm.prank(h);
            acp.submit(jobs[i], POC, "");
        }
        uint256 expectedAvail = 3_000e6;
        uint256 paidGross;
        for (uint256 i; i < n; ++i) {
            uint256 o = (uint256(outcomesSeed) >> (i % 8)) % 3;
            expectedAvail -= pay[i];
            if (o == 0) {
                _settle(jobs[i], true);
                paidGross += pay[i];
            } else if (o == 1) {
                _settle(jobs[i], false);
                expectedAvail += pay[i] + bond;
            }
        }
        vm.warp(block.timestamp + 1 days + 1);
        for (uint256 i; i < n; ++i) {
            if (_status(claimIds[i]) == BountyVault.ClaimStatus.Open) {
                vault.reclaimExpired(claimIds[i]);
                expectedAvail += pay[i];
            }
        }
        uint256 credits;
        for (uint256 i; i < n; ++i) {
            credits += vault.credit(address(uint160(0x1000 + i)));
        }
        assertEq(_available(id), expectedAvail);
        assertEq(usdc.balanceOf(address(vault)), expectedAvail + credits);
        assertEq(usdc.balanceOf(address(acp)), 0);
        assertEq(usdc.balanceOf(treasury), (paidGross * 100) / 10_000); // payouts are multiples of 100e6: no fee dust
        (,,,,,, uint256 openClaims,) = vault.bountyInfo(id);
        assertEq(openClaims, 0);
    }

    /// No sequence lets a tier be paid twice.
    function testFuzz_tierPaysOnce(bool firstPass, bool secondPass) public {
        uint256 id = _bounty();
        (, uint256 j1) = _open(hunter, id, 0);
        _settle(j1, firstPass);
        if (firstPass) {
            vm.prank(hunter2);
            vm.expectRevert(BountyVault.TierUnavailable.selector);
            vault.openClaim(id, 0, 99);
            return;
        }
        (, uint256 j2) = _open(hunter2, id, 0);
        _settle(j2, secondPass);
        uint256 paidToHunters =
            usdc.balanceOf(hunter) + usdc.balanceOf(hunter2) + vault.credit(hunter) + vault.credit(hunter2);
        uint256 expected = 2_000e6 - BOND + (secondPass ? 4_950e6 : 0) - (secondPass ? 0 : BOND);
        assertEq(paidToHunters, expected);
    }
}
