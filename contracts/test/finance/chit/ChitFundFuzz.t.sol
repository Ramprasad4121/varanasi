// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ChitFundBase} from "./ChitFundBase.sol";
import {ChitFund} from "../../../src/finance/chit/ChitFund.sol";
import {MockERC20} from "../../../src/MockERC20.sol";

/// @dev Fuzz over member count, contribution size, bids, seeds and defaults.
contract ChitFundFuzzTest is ChitFundBase {
    function _sumBalances() internal view returns (uint256 s) {
        for (uint256 i; i < m.length; ++i) s += token.balanceOf(m[i]);
        s += token.balanceOf(foreman) + token.balanceOf(address(fund));
    }

    function testFuzz_AuctionCycle(uint8 nRaw, uint96 cRaw, uint256 seed) public {
        uint256 n = bound(nRaw, 2, 12);
        uint256 c = bound(cRaw, 1, 1e27);
        token = new MockERC20("T", "T", 18);
        _deploy(_params(address(token), c, ChitFund.Mode.AUCTION), n, c * 3 * n);
        _enrollAll();
        uint256 supply = _sumBalances();
        for (uint256 i; i < n; ++i) {
            vm.prank(m[i]);
            fund.postCollateral(m[i], c * n);
        }
        uint256[] memory wins = new uint256[](n);
        for (uint256 r = 1; r <= n; ++r) {
            _payAll();
            uint256 pot = fund.expectedPot();
            uint256[] memory bids = new uint256[](n);
            for (uint256 i; i < n; ++i) {
                if (_won(m[i])) continue;
                seed = uint256(keccak256(abi.encode(seed, i)));
                if (seed % 4 == 0) continue; // some members do not bid
                uint256 maxDiscount = (pot * 3000) / 10_000;
                bids[i] = pot - (seed % (maxDiscount + 1));
                _commitBid(m[i], bids[i]);
            }
            _toReveal();
            for (uint256 i; i < n; ++i) {
                if (bids[i] != 0) _revealBid(m[i], bids[i]);
            }
            _toSettle();
            fund.settle();
            ChitFund.RoundResult memory res = fund.result(r);
            assertLe(res.commission * 10_000, res.pot * 500, "fee <= 5% of pot");
            assertEq(res.payout + res.commission + res.dividendEach * (n - 1) + res.dust, res.pot, "pot fully routed");
            for (uint256 i; i < n; ++i) {
                if (m[i] == res.winner) wins[i] += 1;
            }
            _assertConserved();
        }
        for (uint256 i; i < n; ++i) assertEq(wins[i], 1, "each member wins exactly once");
        _withdrawAll();
        assertEq(token.balanceOf(address(fund)), 0, "no stuck funds");
        assertEq(_sumBalances(), supply, "no value created or destroyed");
    }

    function testFuzz_DrawEachWinsOnce(uint8 nRaw, uint256 seed) public {
        uint256 n = bound(nRaw, 2, 15);
        token = new MockERC20("T", "T", 6);
        ChitFund.Params memory p = _params(address(token), 7e6, ChitFund.Mode.DRAW);
        p.revealBond = 1e6;
        _deploy(p, n, 7e6 * n * 2);
        _enrollAll();
        for (uint256 r = 1; r <= n; ++r) {
            _payAll();
            uint256[] memory seeds = new uint256[](n);
            for (uint256 i; i < n; ++i) {
                seed = uint256(keccak256(abi.encode(seed, r, i)));
                seeds[i] = seed | 1;
                bytes32 h = keccak256(abi.encode(address(fund), r, m[i], seeds[i], bytes32(seeds[i])));
                vm.prank(m[i]);
                fund.commitSeed(h);
            }
            _toReveal();
            for (uint256 i; i < n; ++i) {
                if ((seeds[i] >> 8) % 5 == 0) continue; // some withhold
                vm.prank(m[i]);
                fund.revealSeed(seeds[i], bytes32(seeds[i]));
            }
            _toSettle();
            fund.settle();
            _assertConserved();
        }
        for (uint256 i; i < n; ++i) assertTrue(_won(m[i]));
        _withdrawAll();
        assertEq(token.balanceOf(address(fund)), 0);
    }

    /// Random defaults by winners and non winners: funds are conserved, nobody
    /// wins twice, excluded members never win, and everything can be withdrawn.
    function testFuzz_DefaultsConserve(uint8 nRaw, uint256 skipSeed, bool auction) public {
        uint256 n = bound(nRaw, 2, 10);
        uint256 c = 1_000_00;
        token = new MockERC20("INR", "INR", 2);
        ChitFund.Mode mode = auction ? ChitFund.Mode.AUCTION : ChitFund.Mode.FIXED_ORDER;
        _deploy(_params(address(token), c, mode), n, c * n * 3);
        _enrollAll();
        uint256 supply = _sumBalances();
        for (uint256 r = 1; r <= n; ++r) {
            for (uint256 i; i < n; ++i) {
                skipSeed = uint256(keccak256(abi.encode(skipSeed, r, i)));
                (, bool ex,,,,) = fund.stateOf(m[i]);
                if (ex || skipSeed % 6 == 0) continue; // about 1 in 6 skips
                if (skipSeed % 7 == 0) vm.warp(fund.payDeadline()); // some pay late
                vm.prank(m[i]);
                fund.contribute();
            }
            _toSettle();
            fund.settle();
            address w = fund.result(r).winner;
            if (w != address(0)) {
                (, bool ex,,,,) = fund.stateOf(w);
                assertFalse(ex, "excluded member won");
            }
            _assertConserved();
        }
        assertTrue(fund.finalized());
        _withdrawAll();
        assertEq(token.balanceOf(address(fund)), 0, "no stuck funds");
        assertEq(_sumBalances(), supply, "conservation");
    }
}
