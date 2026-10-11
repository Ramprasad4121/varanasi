// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./AssetsBase.sol";

/// Random sequences of metal deposits, redemptions, bank releases and transfers
/// across silver and platinum.
contract MetalHandler is AssetsBase {
    BankMetalIssuer[2] public issuers;
    MetalToken[2] public tokens;
    address[3] internal users;
    uint256[] internal pendingIds;
    uint256[] internal pendingIssuer;

    constructor(BankMetalIssuer s, BankMetalIssuer p, MetalToken st, MetalToken pt, uint256 key, address ops) {
        issuers = [s, p];
        tokens = [st, pt];
        bankKey = key;
        bankOps = ops;
        users = [makeAddr("u1"), makeAddr("u2"), makeAddr("u3")];
    }

    function deposit(uint256 which, uint256 user, uint64 fine) external {
        BankMetalIssuer i = issuers[which % 2];
        fine = uint64(bound(fine, 1, 1e9));
        BankMetalIssuer.BankAttestation memory a =
            _metalAtt(BANK, users[user % 3], keccak256(abi.encode("inv", nonceSeq + 1)), fine, 999);
        i.mint(a, _signMetal(i, bankKey, a));
    }

    function redeem(uint256 which, uint256 user, uint256 amt) external {
        uint256 w = which % 2;
        address u = users[user % 3];
        uint256 bal = tokens[w].balanceOf(u) / MG;
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.prank(u);
        uint256 id = issuers[w].requestRedemption(BANK, amt, "inv");
        pendingIds.push(id);
        pendingIssuer.push(w);
    }

    function fulfil(uint256 k) external {
        if (pendingIds.length == 0) return;
        k = k % pendingIds.length;
        uint256 id = pendingIds[k];
        BankMetalIssuer i = issuers[pendingIssuer[k]];
        pendingIds[k] = pendingIds[pendingIds.length - 1];
        pendingIds.pop();
        pendingIssuer[k] = pendingIssuer[pendingIssuer.length - 1];
        pendingIssuer.pop();
        vm.prank(bankOps);
        if (uint256(keccak256(abi.encode(id))) % 2 == 0) i.fulfilRedemption(id, "r");
        else i.cancelRedemption(id, "c");
    }

    function transfer(uint256 which, uint256 from, uint256 to, uint256 amt) external {
        MetalToken t = tokens[which % 2];
        address f = users[from % 3];
        uint256 bal = t.balanceOf(f);
        if (bal == 0) return;
        vm.prank(f);
        t.transfer(users[to % 3], bound(amt, 0, bal));
    }
}

contract MetalInvariantTest is AssetsBase {
    MetalHandler handler;

    function setUp() public {
        _deployMetals();
        handler = new MetalHandler(silverIssuer, platinumIssuer, silver, platinum, bankKey, bankOps);
        targetContract(address(handler));
    }

    function _check(BankMetalIssuer i, MetalToken t) internal view {
        (uint256 supply, uint256 attested, uint256 pending, uint256 disputed, bool ok) = i.proofOfReserve();
        assertTrue(ok, "fully backed");
        assertLe(supply + pending + disputed, attested, "supply <= attested reserve");
        assertEq(t.totalSupply() % MG, 0, "whole milligrams only");
    }

    function invariant_perMetalSupplyWithinReserve() public view {
        _check(silverIssuer, silver);
        _check(platinumIssuer, platinum);
    }

    function invariant_goldUntouchedByOtherMetals() public view {
        assertEq(gold.totalSupply(), 0);
    }
}

/// Random loans, defaults, listings, bids, redemptions and settlements.
contract DeskHandler is AssetsBase {
    uint256[] public openLoans;
    uint256[] public liveListings;
    uint256 public movedBeforeWindow; // must stay 0
    uint256 public unapprovedBidAccepted; // must stay 0
    uint256 public ghostSettled;
    uint256 public ghostRedeemed;

    constructor(
        PledgeReceipt r,
        PledgeLoan l,
        BankAssetDesk d,
        MockRupee m,
        uint256 key,
        address ops,
        address a,
        address ba,
        address bb
    ) {
        receipts = r;
        loans = l;
        desk = d;
        rupee = m;
        bankKey = key;
        bankOps = ops;
        alice = a;
        buyerA = ba;
        buyerB = bb;
    }

    function borrow(uint256 paise, uint8 cls) external {
        cls = uint8(bound(cls, 0, 4));
        PledgeReceipt.PledgeAttestation memory a =
            _pledgeAtt(alice, cls, 6_00_000_00, uint64(block.timestamp + 365 days));
        uint256 id = receipts.issue(a, _signPledge(bankKey, a));
        uint256 maxP = loans.maxBorrowPaise(id);
        paise = bound(paise, 1, maxP);
        if (paise > loans.liquidityOf(BANK)) return;
        vm.startPrank(alice);
        receipts.approve(address(loans), id);
        openLoans.push(loans.borrow(id, paise, uint64(block.timestamp + 10 days)));
        vm.stopPrank();
    }

    function repay(uint256 k) external {
        if (openLoans.length == 0) return;
        k = k % openLoans.length;
        uint256 loanId = openLoans[k];
        _dropLoan(k);
        vm.prank(alice);
        loans.repay(loanId);
    }

    function defaultAndList(uint256 k, bool sealed_) external {
        if (openLoans.length == 0) return;
        k = k % openLoans.length;
        uint256 loanId = openLoans[k];
        (uint256 tokenId,,,,, uint64 dueAt,) = loans.loans(loanId);
        if (block.timestamp <= dueAt) vm.warp(dueAt + 1);
        _dropLoan(k);
        vm.startPrank(bankOps);
        loans.claimDefault(loanId);
        receipts.approve(address(desk), tokenId);
        uint64 bidEnd = uint64(block.timestamp + 5 days);
        uint256 lid = desk.list(
            tokenId,
            sealed_ ? 1 : 0,
            3,
            1_00_000_00,
            uint64(block.timestamp + 7 days),
            bidEnd,
            sealed_ ? bidEnd + 1 days : bidEnd,
            alice,
            50_000_00
        );
        vm.stopPrank();
        liveListings.push(lid);
    }

    function bidEnglish(uint256 k, uint256 bump, bool useB) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        (,,, uint8 kind,, BankAssetDesk.Status st,, uint64 bidEnd,,,,,) = desk.listings(lid);
        if (kind != 0 || st != BankAssetDesk.Status.LISTED || block.timestamp > bidEnd) return;
        uint256 amt = desk.minimumBid(lid) + bound(bump, 0, 1_00_000_00);
        vm.prank(useB ? buyerB : buyerA);
        desk.bid(lid, amt);
    }

    function bidStranger(uint256 k) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        vm.prank(makeAddr("stranger"));
        try desk.bid(lid, 10_00_000_00) {
            unapprovedBidAccepted++;
        } catch {}
    }

    function commitSealed(uint256 k, uint256 amt, bool useB) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        (,,, uint8 kind,, BankAssetDesk.Status st,, uint64 bidEnd,,,,,) = desk.listings(lid);
        if (kind != 1 || st != BankAssetDesk.Status.LISTED || block.timestamp > bidEnd) return;
        address who = useB ? buyerB : buyerA;
        if (desk.commitmentOf(lid, who) != bytes32(0)) return;
        amt = bound(amt, 1_00_000_00, 5_00_000_00);
        vm.prank(who);
        desk.commitBid(lid, keccak256(abi.encode(lid, who, amt, bytes32("s"))), amt);
    }

    function revealSealed(uint256 k, uint256 amt, bool useB) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        address who = useB ? buyerB : buyerA;
        amt = bound(amt, 1_00_000_00, 5_00_000_00);
        vm.prank(who);
        try desk.revealBid(lid, amt, bytes32("s")) {} catch {}
    }

    function redeem(uint256 k) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        vm.prank(alice);
        try desk.redeem(lid) {
            ghostRedeemed++;
        } catch {}
    }

    function settle(uint256 k) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        (,,,,,, uint64 win,,,,,,) = desk.listings(lid);
        bool early = block.timestamp <= win;
        vm.prank(bankOps);
        try desk.settle(lid, 1_00_000_00, uint64(block.timestamp + 30 days)) {
            ghostSettled++;
            if (early) movedBeforeWindow++;
        } catch {}
    }

    function reclaim(uint256 k, bool useB) external {
        if (liveListings.length == 0) return;
        uint256 lid = liveListings[k % liveListings.length];
        vm.prank(useB ? buyerB : buyerA);
        try desk.reclaimDeposit(lid) {} catch {}
    }

    function withdraw(bool useB) external {
        address who = useB ? buyerB : buyerA;
        if (desk.credit(who) == 0) return;
        vm.prank(who);
        desk.withdraw();
    }

    function warp(uint32 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 hours, 3 days));
    }

    function _dropLoan(uint256 k) internal {
        openLoans[k] = openLoans[openLoans.length - 1];
        openLoans.pop();
    }

    function listingCountLive() external view returns (uint256) {
        return liveListings.length;
    }

    function liveListingAt(uint256 i) external view returns (uint256) {
        return liveListings[i];
    }
}

contract DeskInvariantTest is AssetsBase {
    DeskHandler handler;

    function setUp() public {
        _deployPledge();
        handler = new DeskHandler(receipts, loans, desk, rupee, bankKey, bankOps, alice, buyerA, buyerB);
        targetContract(address(handler));
    }

    function invariant_deskEscrowFullyCovered() public view {
        assertEq(rupee.balanceOf(address(desk)), desk.totalEscrow() + desk.totalCredit());
    }

    function afterInvariant() public view {
        console.log("settled", handler.ghostSettled(), "redeemed", handler.ghostRedeemed());
    }

    function invariant_loanBookSolvent() public view {
        assertEq(rupee.balanceOf(address(loans)), loans.totalLiquidity());
    }

    function invariant_noTransferBeforeWindow_andOnlyApprovedBidders() public view {
        assertEq(handler.movedBeforeWindow(), 0);
        assertEq(handler.unapprovedBidAccepted(), 0);
        for (uint256 i; i < handler.listingCountLive(); ++i) {
            uint256 lid = handler.liveListingAt(i);
            (uint256 tokenId,,,,, BankAssetDesk.Status st,,,,,,,) = desk.listings(lid);
            if (st == BankAssetDesk.Status.LISTED) {
                assertEq(receipts.ownerOf(tokenId), address(desk), "receipt stays at desk until window ends");
            }
        }
    }
}
