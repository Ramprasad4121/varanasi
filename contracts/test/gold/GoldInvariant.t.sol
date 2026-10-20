// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {GoldBase} from "./GoldBase.sol";
import {GoldToken} from "../../src/gold/GoldToken.sol";
import {GoldRegistry} from "../../src/gold/GoldRegistry.sol";
import {BankGoldIssuer} from "../../src/gold/BankGoldIssuer.sol";

/// Random walk over mint / transfer / redeem / fulfil / cancel / reclaim /
/// dispute / clear / write-off. Every call is wrapped so the walk keeps going.
contract GoldHandler is Test {
    BankGoldIssuer issuer;
    GoldToken token;
    GoldRegistry registry;
    bytes32[2] banks;
    uint256[2] keys;
    address[2] ops;
    address gov;
    address[4] actors;
    bytes32[] public certs;
    uint256[] public openRedemptions;
    uint256 nonce;
    uint256 public okMint;
    uint256 public okFulfil;
    uint256 public okCancel;
    uint256 public okDispute;
    uint256 public okWriteOff;
    uint256 public okClear;

    constructor(
        BankGoldIssuer i,
        bytes32[2] memory b,
        uint256[2] memory k,
        address[2] memory o,
        address g,
        address[4] memory a
    ) {
        issuer = i;
        token = i.token();
        registry = i.registry();
        banks = b;
        keys = k;
        ops = o;
        gov = g;
        actors = a;
    }

    function mint(uint256 bankSeed, uint256 actorSeed, uint256 milli) external {
        uint256 bi = bankSeed % 2;
        address user = actorSeed % 5 == 4 ? ops[bi] : actors[actorSeed % 4];
        milli = bound(milli, 1, 1e8);
        BankGoldIssuer.BankAttestation memory a = BankGoldIssuer.BankAttestation({
            bankId: banks[bi],
            user: user,
            certificateId: keccak256(abi.encode("cert", ++nonce)),
            fineGramsMilli: milli,
            purityPermille: 995,
            nonce: nonce,
            expiry: block.timestamp + 1 days
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[bi], issuer.hashAttestation(a));
        try issuer.mint(a, abi.encodePacked(r, s, v)) {
            certs.push(a.certificateId);
            okMint++;
        } catch {}
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amt) external {
        address from = actors[fromSeed % 4];
        amt = bound(amt, 0, token.balanceOf(from));
        vm.prank(from);
        token.transfer(actors[toSeed % 4], amt);
    }

    function request(uint256 actorSeed, uint256 bankSeed, uint256 milli) external {
        address who = actors[actorSeed % 4];
        bytes32 bankId = banks[bankSeed % 2];
        uint256 maxMilli = token.balanceOf(who) / 1e15;
        uint256 liab = issuer.bankOf(bankId).liabilityMilli;
        if (liab < maxMilli) maxMilli = liab;
        if (maxMilli == 0) return;
        milli = bound(milli, 1, maxMilli);
        vm.prank(who);
        try issuer.requestRedemption(bankId, milli, "B") returns (uint256 id) {
            openRedemptions.push(id);
        } catch {}
    }

    function settle(uint256 idxSeed, uint256 mode) external {
        if (openRedemptions.length == 0) return;
        uint256 idx = idxSeed % openRedemptions.length;
        uint256 id = openRedemptions[idx];
        (bytes32 bankId, address holder,,,,) = issuer.redemptions(id);
        address op = issuer.bankOf(bankId).operator;
        bool done;
        mode = mode % 3;
        if (mode == 0) {
            vm.prank(op);
            try issuer.fulfilRedemption(id, "R") { done = true; okFulfil++; } catch {}
        } else if (mode == 1) {
            vm.prank(op);
            try issuer.cancelRedemption(id, "C") { done = true; okCancel++; } catch {}
        } else {
            vm.warp(block.timestamp + 31 days);
            vm.prank(holder);
            try issuer.reclaimRedemption(id) { done = true; okCancel++; } catch {}
        }
        if (done) {
            openRedemptions[idx] = openRedemptions[openRedemptions.length - 1];
            openRedemptions.pop();
        }
    }

    function dispute(uint256 certSeed) external {
        if (certs.length == 0) return;
        vm.prank(gov);
        try issuer.disputeCertificate(certs[certSeed % certs.length], "D") { okDispute++; } catch {}
    }

    function resolve(uint256 certSeed, bool writeOff) external {
        if (certs.length == 0) return;
        bytes32 c = certs[certSeed % certs.length];
        if (writeOff) {
            bytes32 bankId = registry.certificateOf(c).bankId;
            vm.prank(issuer.bankOf(bankId).operator);
            try issuer.writeOffCertificate(c) { okWriteOff++; } catch {}
        } else {
            vm.prank(gov);
            try issuer.clearDispute(c) { okClear++; } catch {}
        }
        vm.prank(gov);
        try issuer.unpauseBank(banks[certSeed % 2]) {} catch {}
    }
}

contract GoldInvariantTest is GoldBase {
    GoldHandler handler;

    function setUp() public {
        _deployGold();
        address[4] memory actors = [alice, bob, makeAddr("carol"), makeAddr("dave")];
        handler = new GoldHandler(
            issuer, [BANK, BANK2], [bankKey, bank2Key], [bankOps, bank2Ops], gov, actors
        );
        targetContract(address(handler));
    }

    /// The headline property: vGOLD supply never exceeds bank-attested grams.
    function invariant_supplyNeverExceedsAttested() public view {
        assertLe(token.totalSupply(), issuer.totalAttestedMilli() * MG);
    }

    /// Exact per-bank conservation: attested == liability + pending, and the
    /// sum of bank liabilities is exactly the token supply.
    function invariant_perBankConservation() public view {
        uint256 liab;
        uint256 att;
        uint256 pend;
        uint256 disp;
        for (uint256 i; i < issuer.bankCount(); ++i) {
            BankGoldIssuer.Bank memory b = issuer.bankOf(issuer.bankIds(i));
            assertEq(b.attestedMilli, b.liabilityMilli + b.pendingMilli, "bank conservation");
            assertLe(b.disputedMilli, b.attestedMilli, "disputed within attested");
            liab += b.liabilityMilli;
            att += b.attestedMilli;
            pend += b.pendingMilli;
            disp += b.disputedMilli;
        }
        assertEq(liab * MG, token.totalSupply(), "supply == sum liabilities");
        assertEq(att, issuer.totalAttestedMilli());
        assertEq(pend, issuer.totalPendingMilli());
        assertEq(disp, issuer.totalDisputedMilli());
    }

    /// Coverage report: shows the walk reaches every state, not only mints.
    function afterInvariant() public view {
        console.log("ok mint", handler.okMint(), "ok fulfil", handler.okFulfil());
        console.log("ok cancel/reclaim", handler.okCancel(), "ok dispute", handler.okDispute());
        console.log("ok writeOff", handler.okWriteOff(), "ok clear", handler.okClear());
    }
}
