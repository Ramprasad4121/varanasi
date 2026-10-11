// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GoldBase} from "../gold/GoldBase.sol";
import {ERC2771Forwarder} from "openzeppelin-contracts/contracts/metatx/ERC2771Forwarder.sol";
import {BankGoldIssuer} from "../../src/gold/BankGoldIssuer.sol";
import {GaslessCollateralVault} from "../../src/app/GaslessCollateralVault.sol";
import {GaslessLoanAgreement} from "../../src/app/GaslessLoanAgreement.sol";
import {LoanAgreement} from "../../src/finance/LoanAgreement.sol";
import {MockRupee} from "../../src/app/MockRupee.sol";

/// People app gold loan: a person pledges bank gold and borrows demo rupees from
/// the (mock) bank with zero gas. Every borrower action is signed by the borrower
/// and relayed through the ERC-2771 forwarder. Also covers the per-bank mint cap.
contract GoldLoanGaslessTest is GoldBase {
    bytes32 constant FWD_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );
    GaslessCollateralVault vault;
    GaslessLoanAgreement loans;
    MockRupee rupee;
    uint256 borrowerKey = 0xB0B0;
    address borrower;
    address lenderBank = makeAddr("mock-bank-lending-desk");
    address relayer = makeAddr("relayer");
    bytes32 constant POS = keccak256("ravi-gold-loan-1");
    uint256 constant GOLD = 10_000 * MG; // 10 g fine
    uint256 constant PRINCIPAL = 90_000_00; // Rs 90,000 (75% of 10 g at Rs 12,000/g)
    uint256 constant RATE_BPS = 222; // ~9% a year over a 90 day term
    uint256 constant TERM = 90 days;

    function setUp() public {
        _deployGold();
        borrower = vm.addr(borrowerKey);
        rupee = new MockRupee(address(this), address(forwarder));
        vault = new GaslessCollateralVault(address(this), address(forwarder));
        loans = new GaslessLoanAgreement(address(vault), address(forwarder));
        vault.admitAsset(address(token));
        vault.authorizeResolver(address(loans));
        _mint(BANK, borrower, keccak256("MB-AMP-GD-1"), 10_000, 1);
        rupee.mint(lenderBank, 10_000_000_00);
        vm.prank(lenderBank);
        rupee.approve(address(loans), type(uint256).max);
        vm.deal(relayer, 1 ether);
    }

    function _req(uint256 key, address from, address to, bytes memory data)
        internal
        view
        returns (ERC2771Forwarder.ForwardRequestData memory req)
    {
        req = ERC2771Forwarder.ForwardRequestData({
            from: from, to: to, value: 0, gas: 700_000, deadline: uint48(block.timestamp + 1 hours), data: data, signature: ""
        });
        (, string memory name, string memory version, uint256 chainId, address vc,,) = forwarder.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)), keccak256(bytes(version)), chainId, vc
            )
        );
        bytes32 sh = keccak256(
            abi.encode(FWD_TYPEHASH, from, to, 0, req.gas, forwarder.nonces(from), req.deadline, keccak256(data))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, sh)));
        req.signature = abi.encodePacked(r, s, v);
    }

    function _relay(address to, bytes memory data) internal {
        ERC2771Forwarder.ForwardRequestData memory req = _req(borrowerKey, borrower, to, data);
        vm.prank(relayer);
        forwarder.execute(req);
    }

    function _pledgeAndBorrow() internal returns (uint256 loanId) {
        _relay(address(token), abi.encodeCall(token.approve, (address(vault), GOLD)));
        _relay(address(vault), abi.encodeCall(vault.lock, (POS, address(token), address(loans), GOLD)));
        assertEq(vault.lockedBy(POS), borrower, "lockedBy is the signer, not the relayer");
        _relay(
            address(loans),
            abi.encodeCall(
                loans.createLoan,
                (lenderBank, borrower, address(rupee), PRINCIPAL, RATE_BPS, TERM, address(token), POS)
            )
        );
        loanId = loans.loanCount();
        vm.prank(lenderBank);
        loans.fundLoan(loanId);
        _relay(address(loans), abi.encodeCall(loans.drawLoan, (loanId)));
    }

    function test_pledgeBorrowRepay_zeroGas_goldComesBack() public {
        uint256 loanId = _pledgeAndBorrow();
        assertEq(rupee.balanceOf(borrower), PRINCIPAL);
        assertEq(token.balanceOf(borrower), 0);
        assertEq(token.balanceOf(address(vault)), GOLD);
        (uint256 supply, uint256 attested,,, bool backed) = issuer.proofOfReserve();
        assertEq(supply, attested);
        assertTrue(backed, "pledging never changes the bank reserve");

        vm.warp(block.timestamp + 45 days); // half the term: half the interest
        uint256 due = loans.outstanding(loanId);
        assertEq(due, PRINCIPAL + (PRINCIPAL * RATE_BPS) / 2 / 10_000);
        rupee.mint(borrower, due - PRINCIPAL);
        _relay(address(rupee), abi.encodeCall(rupee.approve, (address(loans), type(uint256).max)));
        vm.warp(block.timestamp + 1 hours); // interest moves between quote and execution
        uint256 exact = loans.outstanding(loanId);
        assertGt(exact, due);
        rupee.mint(borrower, exact - due);
        _relay(address(loans), abi.encodeCall(loans.repayAll, (loanId, exact)));

        assertEq(uint256(loans.stateOf(loanId)), 3, "closed");
        assertEq(token.balanceOf(borrower), GOLD, "gold back");
        assertEq(rupee.balanceOf(borrower), 0);
        assertEq(borrower.balance, 0, "borrower never paid gas");
        vm.prank(lenderBank);
        loans.withdrawRepaid(loanId);
        assertEq(rupee.balanceOf(lenderBank), 10_000_000_00 + exact - PRINCIPAL);
    }

    function test_repayAll_respectsMaxAmount() public {
        uint256 loanId = _pledgeAndBorrow();
        vm.warp(block.timestamp + 10 days);
        uint256 exact = loans.outstanding(loanId);
        rupee.mint(borrower, exact);
        vm.startPrank(borrower);
        rupee.approve(address(loans), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanOverpay.selector, loanId, exact, exact - 1));
        loans.repayAll(loanId, exact - 1);
        loans.repayAll(loanId, exact);
        vm.stopPrank();
        assertEq(loans.outstanding(loanId), 0);
    }

    function test_defaultAfterTerm_goldGoesToBank_notBefore() public {
        uint256 loanId = _pledgeAndBorrow();
        vm.expectRevert();
        loans.declareDefault(loanId);
        vm.warp(block.timestamp + TERM + 1);
        loans.declareDefault(loanId);
        assertEq(uint256(loans.stateOf(loanId)), 4);
        assertEq(token.balanceOf(lenderBank), GOLD);
        assertEq(rupee.balanceOf(borrower), PRINCIPAL, "borrower kept the loan money");
    }

    function test_relayerCannotPledgeOrBorrowForSomeoneElse() public {
        // a request for the borrower signed by another key is rejected
        ERC2771Forwarder.ForwardRequestData memory bad =
            _req(0xBAD, borrower, address(token), abi.encodeCall(token.approve, (address(vault), GOLD)));
        vm.prank(relayer);
        vm.expectRevert();
        forwarder.execute(bad);
        // the relayer calling directly acts as itself, holds no gold, cannot borrow for the borrower
        _relay(address(token), abi.encodeCall(token.approve, (address(vault), GOLD)));
        _relay(address(vault), abi.encodeCall(vault.lock, (POS, address(token), address(loans), GOLD)));
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotBorrower.selector, 0, relayer));
        loans.createLoan(lenderBank, borrower, address(rupee), PRINCIPAL, RATE_BPS, TERM, address(token), POS);
        // and cannot draw the money of a funded loan
        _relay(
            address(loans),
            abi.encodeCall(
                loans.createLoan,
                (lenderBank, borrower, address(rupee), PRINCIPAL, RATE_BPS, TERM, address(token), POS)
            )
        );
        vm.prank(lenderBank);
        loans.fundLoan(1);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotBorrower.selector, 1, relayer));
        loans.drawLoan(1);
    }

    function test_onlyNamedLenderFunds() public {
        _relay(address(token), abi.encodeCall(token.approve, (address(vault), GOLD)));
        _relay(address(vault), abi.encodeCall(vault.lock, (POS, address(token), address(loans), GOLD)));
        _relay(
            address(loans),
            abi.encodeCall(
                loans.createLoan,
                (lenderBank, borrower, address(rupee), PRINCIPAL, RATE_BPS, TERM, address(token), POS)
            )
        );
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotLender.selector, 1, relayer));
        loans.fundLoan(1);
    }

    /// Regression: withdrawRepaid used to zero the borrower's repaid counters, so after
    /// the lender took a part payment the borrower owed it again and could be defaulted.
    function test_lenderWithdrawalNeverReopensDebt() public {
        uint256 loanId = _pledgeAndBorrow();
        rupee.mint(borrower, 10_000_00);
        vm.startPrank(borrower);
        rupee.approve(address(loans), type(uint256).max);
        loans.repay(loanId, 50_000_00);
        vm.stopPrank();
        uint256 before = loans.outstanding(loanId);
        vm.prank(lenderBank);
        loans.withdrawRepaid(loanId);
        assertEq(loans.outstanding(loanId), before, "withdrawal must not change what the borrower owes");
        vm.prank(lenderBank);
        vm.expectRevert(LoanAgreement.LoanZeroAmount.selector);
        loans.withdrawRepaid(loanId); // nothing new to take
        uint256 rest = loans.outstanding(loanId);
        vm.prank(borrower);
        loans.repayAll(loanId, rest);
        assertEq(uint256(loans.stateOf(loanId)), 3);
        assertEq(token.balanceOf(borrower), GOLD);
        vm.prank(lenderBank);
        loans.withdrawRepaid(loanId);
        assertEq(loans.lenderWithdrawn(loanId), 50_000_00 + rest, "lender got exactly what was repaid");
        assertEq(rupee.balanceOf(address(loans)), 0, "nothing stuck in the loan contract");
    }

    // ---------------------------------------------------------------- stuck pledge recovery
    function test_unusedPledge_reclaimedOnlyByLocker() public {
        _relay(address(token), abi.encodeCall(token.approve, (address(vault), GOLD)));
        _relay(address(vault), abi.encodeCall(vault.lock, (POS, address(token), address(loans), GOLD)));
        // no loan was created (signal lost); a stranger cannot take it
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanNotCollateralOwner.selector, POS, relayer));
        loans.reclaimUnusedPosition(POS);
        _relay(address(loans), abi.encodeCall(loans.reclaimUnusedPosition, (POS)));
        assertEq(token.balanceOf(borrower), GOLD);
        assertEq(vault.value(POS), 0);
    }

    function test_usedPledge_cannotBeReclaimed() public {
        uint256 loanId = _pledgeAndBorrow();
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanAgreement.LoanPositionInUse.selector, POS));
        loans.reclaimUnusedPosition(POS);
        assertEq(uint256(loans.stateOf(loanId)), 2);
        assertEq(token.balanceOf(address(vault)), GOLD);
    }

    // ---------------------------------------------------------------- per-bank mint cap
    function test_mintCap_blocksDepositsAboveCap() public {
        vm.prank(gov);
        issuer.setBankMintCap(BANK, 15_000); // 15 g; 10 g already attested
        _mint(BANK, alice, keccak256("MB-AMP-GD-2"), 5_000, 2); // exactly at cap
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, keccak256("MB-AMP-GD-3"), 1, 3);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert(abi.encodeWithSelector(BankGoldIssuer.GoldBankCapReached.selector, BANK, 15_001, 15_000));
        issuer.mint(a, sig);
        // other banks are not affected
        _mint(BANK2, alice, keccak256("MB2-1"), 50_000, 1);
        // raising the cap reopens deposits; 0 means no cap
        vm.prank(gov);
        issuer.setBankMintCap(BANK, 0);
        issuer.mint(a, sig);
    }

    function test_mintCap_onlyOwner_knownBank() public {
        vm.prank(bankOps);
        vm.expectRevert();
        issuer.setBankMintCap(BANK, 1);
        vm.prank(gov);
        vm.expectRevert();
        issuer.setBankMintCap(keccak256("NO-SUCH-BANK"), 1);
    }

    function test_mintCap_redemptionFreesRoom() public {
        vm.prank(gov);
        issuer.setBankMintCap(BANK, 10_000); // full
        BankGoldIssuer.BankAttestation memory a = _att(BANK, alice, keccak256("MB-AMP-GD-4"), 2_000, 4);
        bytes memory sig = _sign(bankKey, a);
        vm.expectRevert();
        issuer.mint(a, sig);
        vm.prank(borrower);
        uint256 rid = issuer.requestRedemption(BANK, 2_000, "AMEERPET-01");
        vm.prank(bankOps);
        issuer.fulfilRedemption(rid, "HANDED-OVER");
        issuer.mint(a, sig); // gold left the vault, so there is room again
        assertEq(token.balanceOf(alice), 2_000 * MG);
    }
}
