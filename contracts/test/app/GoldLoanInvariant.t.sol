// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {GoldBase} from "../gold/GoldBase.sol";
import {GoldToken} from "../../src/gold/GoldToken.sol";
import {GaslessCollateralVault} from "../../src/app/GaslessCollateralVault.sol";
import {GaslessLoanAgreement} from "../../src/app/GaslessLoanAgreement.sol";
import {MockRupee} from "../../src/app/MockRupee.sol";

/// Random sequences of gold loan actions (pledge, ask, fund, draw, repay, cancel,
/// default, pledge without a loan, reclaim, time passing) by several borrowers.
contract GoldLoanHandler is Test {
    GoldToken public token;
    GaslessCollateralVault public vault;
    GaslessLoanAgreement public loans;
    MockRupee public rupee;
    address public lender;
    address[] public actors;

    bytes32[] public positions; // every position ever used
    uint256[] public loanIds;
    mapping(uint256 => bytes32) public posOfLoan;
    mapping(uint256 => address) public borrowerOf;
    mapping(uint256 => uint256) public principalOf;
    bytes32[] public loosePositions; // pledged with no loan yet
    mapping(bytes32 => address) public looseOwner;
    uint256 public expectedLoanContractRupee; // funded not drawn + repaid (the lender never withdraws here)
    uint256 public nonce;
    uint256 public calls;

    uint256 constant MG = 1e15;
    uint256 constant TERM = 90 days;

    constructor(
        GoldToken t,
        GaslessCollateralVault v,
        GaslessLoanAgreement l,
        MockRupee r,
        address lender_,
        address[] memory a
    ) {
        token = t;
        vault = v;
        loans = l;
        rupee = r;
        lender = lender_;
        actors = a;
    }

    function positionsLength() external view returns (uint256) {
        return positions.length;
    }

    function loansLength() external view returns (uint256) {
        return loanIds.length;
    }

    function actorsLength() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function _newPos(address who) internal returns (bytes32 p) {
        p = keccak256(abi.encode("pos", who, nonce++));
        positions.push(p);
    }

    function _lock(address who, uint256 milli) internal returns (bytes32 p, bool ok) {
        uint256 amount = milli * MG;
        if (token.balanceOf(who) < amount || amount == 0) return (p, false);
        p = _newPos(who);
        vm.startPrank(who);
        token.approve(address(vault), amount);
        try vault.lock(p, address(token), address(loans), amount) {
            ok = true;
        } catch {}
        vm.stopPrank();
    }

    function openLoan(uint256 actorSeed, uint256 milliSeed, uint256 rupeeSeed) external {
        calls++;
        address who = _actor(actorSeed);
        (bytes32 p, bool ok) = _lock(who, bound(milliSeed, 1, 4_000));
        if (!ok) return;
        uint256 principal = bound(rupeeSeed, 100_00, 30_000_00);
        vm.prank(who);
        try loans.createLoan(lender, who, address(rupee), principal, 222, TERM, address(token), p) returns (
            uint256 id
        ) {
            loanIds.push(id);
            posOfLoan[id] = p;
            borrowerOf[id] = who;
            principalOf[id] = principal;
        } catch {
            loosePositions.push(p);
            looseOwner[p] = who;
        }
    }

    function pledgeOnly(uint256 actorSeed, uint256 milliSeed) external {
        calls++;
        address who = _actor(actorSeed);
        (bytes32 p, bool ok) = _lock(who, bound(milliSeed, 1, 2_000));
        if (!ok) return;
        loosePositions.push(p);
        looseOwner[p] = who;
    }

    function reclaim(uint256 seed) external {
        calls++;
        if (loosePositions.length == 0) return;
        bytes32 p = loosePositions[seed % loosePositions.length];
        vm.prank(looseOwner[p]);
        try loans.reclaimUnusedPosition(p) {} catch {}
    }

    function _pick(uint256 seed) internal view returns (uint256 id, bool ok) {
        if (loanIds.length == 0) return (0, false);
        return (loanIds[seed % loanIds.length], true);
    }

    function fund(uint256 seed) external {
        calls++;
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        vm.prank(lender);
        try loans.fundLoan(id) {
            expectedLoanContractRupee += principalOf[id];
        } catch {}
    }

    function draw(uint256 seed) external {
        calls++;
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        vm.prank(borrowerOf[id]);
        try loans.drawLoan(id) {
            expectedLoanContractRupee -= principalOf[id];
        } catch {}
    }

    function repay(uint256 seed) external {
        calls++;
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        address who = borrowerOf[id];
        vm.startPrank(who);
        rupee.approve(address(loans), type(uint256).max);
        try loans.repayAll(id, type(uint128).max) returns (uint256 paid) {
            expectedLoanContractRupee += paid;
        } catch {}
        vm.stopPrank();
    }

    function cancel(uint256 seed) external {
        calls++;
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        vm.prank(borrowerOf[id]);
        try loans.cancelLoan(id) {} catch {}
    }

    function defaultLoan(uint256 seed) external {
        calls++;
        (uint256 id, bool ok) = _pick(seed);
        if (!ok) return;
        vm.warp(block.timestamp + TERM + 1);
        vm.prank(lender);
        try loans.declareDefault(id) {} catch {}
    }

    function passTime(uint256 s) external {
        calls++;
        vm.warp(block.timestamp + bound(s, 1, 30 days));
    }
}

/// Invariants for the people app gold loan rail (CollateralVault + LoanAgreement):
///  1. the vault holds exactly the grams of all open positions (no gold stuck or missing)
///  2. gold is conserved: borrowers + bank + vault always add up to what was minted
///  3. an open loan (asked, approved, running) always has its pledge locked; a repaid or
///     cancelled loan never leaves gold in the vault
///  4. rupees are conserved and the loan contract is solvent: it holds exactly the money
///     approved but not taken plus what borrowers repaid
contract GoldLoanInvariantTest is GoldBase {
    GoldLoanHandler handler;
    GaslessCollateralVault vault;
    GaslessLoanAgreement loans;
    MockRupee rupee;
    address lender = makeAddr("mock-bank-loan-desk");
    address[] actors;
    uint256 goldMinted;
    uint256 rupeeMinted;

    function setUp() public {
        _deployGold();
        rupee = new MockRupee(address(this), address(forwarder));
        vault = new GaslessCollateralVault(address(this), address(forwarder));
        loans = new GaslessLoanAgreement(address(vault), address(forwarder));
        vault.admitAsset(address(token));
        vault.authorizeResolver(address(loans));
        for (uint256 i = 0; i < 3; i++) {
            address a = makeAddr(string(abi.encodePacked("borrower", vm.toString(i))));
            actors.push(a);
            _mint(BANK, a, keccak256(abi.encode("cert", i)), 10_000, i + 1); // 10 g each
            goldMinted += 10_000 * MG;
            rupee.mint(a, 1_000_000_00);
            rupeeMinted += 1_000_000_00;
        }
        rupee.mint(lender, 100_000_000_00);
        rupeeMinted += 100_000_000_00;
        vm.prank(lender);
        rupee.approve(address(loans), type(uint256).max);

        handler = new GoldLoanHandler(token, vault, loans, rupee, lender, actors);
        targetContract(address(handler));
    }

    /// The handler is wired right: a scripted run reaches repaid, defaulted, cancelled
    /// and reclaimed (so the random runs above are not just silently failing calls).
    function test_handlerReachesEveryLoanState() public {
        handler.openLoan(0, 3_000, 20_000_00); // loan 1
        handler.fund(0);
        handler.draw(0);
        handler.repay(0);
        assertEq(loans.stateOf(handler.loanIds(0)), 3, "repaid");
        handler.openLoan(1, 2_000, 10_000_00); // loan 2
        handler.fund(1);
        handler.draw(1);
        handler.defaultLoan(1);
        assertEq(loans.stateOf(handler.loanIds(1)), 4, "defaulted");
        assertEq(token.balanceOf(lender), 2_000 * MG, "bank kept the pledge");
        handler.openLoan(2, 1_000, 5_000_00); // loan 3
        handler.cancel(2);
        assertEq(loans.stateOf(handler.loanIds(2)), 5, "cancelled");
        handler.pledgeOnly(0, 500);
        handler.reclaim(0);
        assertEq(token.balanceOf(address(vault)), 0, "everything left the vault");
        invariant_goldConserved();
        invariant_rupeeConservedAndLoanContractSolvent();
    }

    function invariant_vaultHoldsExactlyOpenPositions() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.positionsLength(); i++) {
            sum += vault.value(handler.positions(i));
        }
        assertEq(token.balanceOf(address(vault)), sum, "vault balance != sum of positions");
    }

    function invariant_goldConserved() public view {
        uint256 total = token.balanceOf(address(vault)) + token.balanceOf(lender);
        for (uint256 i = 0; i < actors.length; i++) {
            total += token.balanceOf(actors[i]);
        }
        assertEq(total, goldMinted, "gold appeared or vanished");
    }

    function invariant_pledgeLockedWhileLoanOpen() public view {
        for (uint256 i = 0; i < handler.loansLength(); i++) {
            uint256 id = handler.loanIds(i);
            uint8 st = loans.stateOf(id);
            uint256 locked = vault.value(handler.posOfLoan(id));
            if (st <= 2) assertGt(locked, 0, "open loan without its pledge");
            else assertEq(locked, 0, "closed loan left gold in the vault");
        }
    }

    function invariant_rupeeConservedAndLoanContractSolvent() public view {
        uint256 total = rupee.balanceOf(lender) + rupee.balanceOf(address(loans));
        for (uint256 i = 0; i < actors.length; i++) {
            total += rupee.balanceOf(actors[i]);
        }
        assertEq(total, rupeeMinted, "rupees appeared or vanished");
        assertEq(rupee.balanceOf(address(loans)), handler.expectedLoanContractRupee(), "loan contract balance drifted");
    }
}
