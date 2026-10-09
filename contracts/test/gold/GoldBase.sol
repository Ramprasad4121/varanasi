// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {GoldToken} from "../../src/gold/GoldToken.sol";
import {GoldRegistry} from "../../src/gold/GoldRegistry.sol";
import {BankGoldIssuer} from "../../src/gold/BankGoldIssuer.sol";

/// Shared deployment + mock bank signer for the gold suites.
abstract contract GoldBase is Test {
    GoldToken token;
    GoldRegistry registry;
    BankGoldIssuer issuer;

    address gov = makeAddr("governance");
    address bankOps = makeAddr("sbi-ops");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address rogue = makeAddr("rogue");

    uint256 bankKey = 0xB4A1C;
    address bankSigner;
    uint256 bank2Key = 0xB4A2C;
    address bank2Signer;
    address bank2Ops = makeAddr("bank2-ops");

    bytes32 constant BANK = keccak256("MOCK-BANK-1");
    bytes32 constant BANK2 = keccak256("MOCK-BANK-2");
    uint256 constant MG = 1e15; // token units per milligram

    function _deployGold() internal {
        bankSigner = vm.addr(bankKey);
        bank2Signer = vm.addr(bank2Key);
        token = new GoldToken();
        registry = new GoldRegistry();
        issuer = new BankGoldIssuer(gov, address(token), address(registry));
        token.bindIssuer(address(issuer));
        registry.bindIssuer(address(issuer));
        vm.startPrank(gov);
        issuer.addBank(BANK, "Mock Bank 1 (gold deposit)", bankSigner, bankOps);
        issuer.addBank(BANK2, "Mock Bank 2", bank2Signer, bank2Ops);
        vm.stopPrank();
    }

    function _att(bytes32 bankId, address user, bytes32 cert, uint256 fineMilli, uint256 nonce)
        internal
        view
        returns (BankGoldIssuer.BankAttestation memory a)
    {
        a = BankGoldIssuer.BankAttestation({
            bankId: bankId,
            user: user,
            certificateId: cert,
            fineGramsMilli: fineMilli,
            purityPermille: 995,
            nonce: nonce,
            expiry: block.timestamp + 1 days
        });
    }

    function _sign(uint256 key, BankGoldIssuer.BankAttestation memory a) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, issuer.hashAttestation(a));
        return abi.encodePacked(r, s, v);
    }

    function _signReport(uint256 key, BankGoldIssuer.ReserveReport memory rep) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(issuer.RESERVE_TYPEHASH(), rep.bankId, rep.reservesMilli, rep.asOf, rep.seq)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", issuer.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _keyOf(bytes32 bankId) internal view returns (uint256) {
        return bankId == BANK ? bankKey : bank2Key;
    }

    function _mint(bytes32 bankId, address user, bytes32 cert, uint256 fineMilli, uint256 nonce) internal {
        BankGoldIssuer.BankAttestation memory a = _att(bankId, user, cert, fineMilli, nonce);
        issuer.mint(a, _sign(_keyOf(bankId), a));
    }
}
