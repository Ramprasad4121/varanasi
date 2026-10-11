// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {GoldToken} from "../../src/gold/GoldToken.sol";
import {GoldRegistry} from "../../src/gold/GoldRegistry.sol";
import {BankGoldIssuer} from "../../src/gold/BankGoldIssuer.sol";
import {MetalToken} from "../../src/assets/MetalToken.sol";
import {MetalCertificateRegistry} from "../../src/assets/MetalCertificateRegistry.sol";
import {BankMetalIssuer} from "../../src/assets/BankMetalIssuer.sol";
import {AssetRegistry} from "../../src/assets/AssetRegistry.sol";
import {PledgeReceipt} from "../../src/assets/PledgeReceipt.sol";
import {PledgeLoan} from "../../src/assets/PledgeLoan.sol";
import {BankAssetDesk} from "../../src/assets/BankAssetDesk.sol";
import {MockRupee} from "../../src/app/MockRupee.sol";

/// Shared deployment for the multi-asset suites: gold (existing), silver and
/// platinum (BankMetalIssuer), the asset registry, pledge receipts, the pledge
/// loan book and the bank asset desk. Bank keys are mock keys.
abstract contract AssetsBase is Test {
    address gov = makeAddr("governance");
    address bankOps = makeAddr("bank-ops");
    address bank2Ops = makeAddr("bank2-ops");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address rogue = makeAddr("rogue");
    address buyerA = makeAddr("buyer-a");
    address buyerB = makeAddr("buyer-b");

    uint256 bankKey = 0xB4A1C;
    uint256 bank2Key = 0xB4A2C;
    address bankSigner;
    address bank2Signer;

    bytes32 constant BANK = keccak256("MOCK-BANK-1");
    bytes32 constant BANK2 = keccak256("MOCK-BANK-2");
    bytes32 constant XAU = "XAU";
    bytes32 constant XAG = "XAG";
    bytes32 constant XPT = "XPT";
    uint256 constant MG = 1e15;

    GoldToken gold;
    GoldRegistry goldReg;
    BankGoldIssuer goldIssuer;
    MetalToken silver;
    BankMetalIssuer silverIssuer;
    MetalToken platinum;
    BankMetalIssuer platinumIssuer;
    AssetRegistry assets;

    PledgeReceipt receipts;
    PledgeLoan loans;
    BankAssetDesk desk;
    MockRupee rupee;

    uint256 nonceSeq;

    function _deployMetals() internal {
        bankSigner = vm.addr(bankKey);
        bank2Signer = vm.addr(bank2Key);
        gold = new GoldToken(address(0));
        goldReg = new GoldRegistry();
        goldIssuer = new BankGoldIssuer(gov, address(gold), address(goldReg), address(0));
        gold.bindIssuer(address(goldIssuer));
        goldReg.bindIssuer(address(goldIssuer));

        (silver, silverIssuer) = _newMetal("Varanasi Silver", "vSILVER", XAG, 999);
        (platinum, platinumIssuer) = _newMetal("Varanasi Platinum", "vPLAT", XPT, 950);

        vm.startPrank(gov);
        goldIssuer.addBank(BANK, "Mock Bank 1", bankSigner, bankOps);
        silverIssuer.addBank(BANK, "Mock Bank 1", bankSigner, bankOps);
        silverIssuer.addBank(BANK2, "Mock Bank 2", bank2Signer, bank2Ops);
        platinumIssuer.addBank(BANK, "Mock Bank 1", bankSigner, bankOps);
        assets = new AssetRegistry(gov);
        assets.listMetal(XAU, "Gold", address(gold), address(goldIssuer));
        assets.listMetal(XAG, "Silver", address(silver), address(silverIssuer));
        assets.listMetal(XPT, "Platinum", address(platinum), address(platinumIssuer));
        vm.stopPrank();
    }

    function _newMetal(string memory name, string memory symbol, bytes32 code, uint16 minPurity)
        internal
        returns (MetalToken t, BankMetalIssuer i)
    {
        t = new MetalToken(name, symbol, address(0));
        MetalCertificateRegistry r = new MetalCertificateRegistry();
        i = new BankMetalIssuer(gov, address(t), address(r), address(0), code, name, minPurity);
        t.bindIssuer(address(i));
        r.bindIssuer(address(i));
    }

    function _metalAtt(bytes32 bankId, address user, bytes32 cert, uint256 fineMilli, uint256 purity)
        internal
        returns (BankMetalIssuer.BankAttestation memory a)
    {
        a = BankMetalIssuer.BankAttestation({
            bankId: bankId,
            user: user,
            certificateId: cert,
            fineGramsMilli: fineMilli,
            purityPermille: purity,
            nonce: ++nonceSeq,
            expiry: block.timestamp + 1 days
        });
    }

    function _signMetal(BankMetalIssuer issuer, uint256 key, BankMetalIssuer.BankAttestation memory a)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, issuer.hashAttestation(a));
        return abi.encodePacked(r, s, v);
    }

    function _mintMetal(BankMetalIssuer issuer, address user, uint256 fineMilli) internal returns (bytes32 cert) {
        cert = keccak256(abi.encode(address(issuer), "cert", nonceSeq + 1));
        BankMetalIssuer.BankAttestation memory a = _metalAtt(BANK, user, cert, fineMilli, 999);
        issuer.mint(a, _signMetal(issuer, bankKey, a));
    }

    // ---------------------------------------------------------------- pledge
    function _deployPledge() internal {
        if (bankSigner == address(0)) {
            bankSigner = vm.addr(bankKey);
            bank2Signer = vm.addr(bank2Key);
        }
        vm.startPrank(gov);
        receipts = new PledgeReceipt(gov);
        rupee = new MockRupee(gov, address(0));
        loans = new PledgeLoan(gov, address(receipts), address(rupee));
        desk = new BankAssetDesk(gov, address(receipts), address(rupee));
        receipts.addBank(BANK, "Mock Bank 1", bankSigner, bankOps);
        receipts.addBank(BANK2, "Mock Bank 2", bank2Signer, bank2Ops);
        receipts.setLienMover(address(loans), true);
        receipts.setLienMover(address(desk), true);
        desk.setApprovedBuyer(buyerA, true);
        desk.setApprovedBuyer(buyerB, true);
        desk.setApprovedBuyer(bank2Ops, true);
        rupee.mint(bankOps, 100_000_000_00);
        rupee.mint(alice, 10_000_000_00);
        rupee.mint(buyerA, 100_000_000_00);
        rupee.mint(buyerB, 100_000_000_00);
        rupee.mint(bank2Ops, 100_000_000_00);
        vm.stopPrank();
        vm.prank(bankOps);
        rupee.approve(address(loans), type(uint256).max);
        vm.prank(bankOps);
        loans.fund(BANK, 50_000_000_00); // Rs 5 crore lending pot
        for (uint256 i; i < 4; ++i) {
            address who = [alice, buyerA, buyerB, bank2Ops][i];
            vm.startPrank(who);
            rupee.approve(address(loans), type(uint256).max);
            rupee.approve(address(desk), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _pledgeAtt(address holder, uint8 cls, uint256 paise, uint64 reappraiseBy)
        internal
        returns (PledgeReceipt.PledgeAttestation memory a)
    {
        uint256 n = ++nonceSeq;
        a = PledgeReceipt.PledgeAttestation({
            bankId: BANK,
            holder: holder,
            receiptRef: keccak256(abi.encode("pledge", n)),
            assetClass: cls,
            assetIdHash: keccak256(abi.encode("RC-TS09-hash", n)),
            detailsHash: keccak256(abi.encode("appraisal-file", n)),
            appraisedPaise: paise,
            appraisedAt: uint64(block.timestamp),
            reappraiseBy: reappraiseBy,
            nonce: n,
            expiry: block.timestamp + 1 days
        });
    }

    function _signPledge(uint256 key, PledgeReceipt.PledgeAttestation memory a) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, receipts.hashAttestation(a));
        return abi.encodePacked(r, s, v);
    }

    /// Issue a receipt for a Rs 6 lakh car (class 0) valid for a year.
    function _issueCar(address holder) internal returns (uint256 id) {
        PledgeReceipt.PledgeAttestation memory a =
            _pledgeAtt(holder, 0, 6_00_000_00, uint64(block.timestamp + 365 days));
        id = receipts.issue(a, _signPledge(bankKey, a));
    }
}
