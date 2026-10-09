// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ChitFund} from "../../../src/finance/chit/ChitFund.sol";
import {MockERC20} from "../../../src/MockERC20.sol";

/// @dev Shared fixture for ChitFund tests. Time is always set from values read
///      off the fund (via_ir may re-read block.timestamp after vm.warp).
abstract contract ChitFundBase is Test {
    ChitFund fund;
    MockERC20 token;
    address foreman = address(0xF0E);
    address[] m;

    uint64 constant PAY = 3 days;
    uint64 constant GRACE = 2 days;
    uint64 constant REVEAL = 1 days;

    function _params(address tok, uint256 c, ChitFund.Mode mode) internal pure returns (ChitFund.Params memory p) {
        p.token = tok;
        p.contribution = c;
        p.mode = mode;
        p.payWindow = PAY;
        p.gracePeriod = GRACE;
        p.revealWindow = REVEAL;
        p.commissionBps = mode == ChitFund.Mode.AUCTION ? 500 : 0;
        p.maxDiscountBps = 3000;
        p.lateFeeBps = 200;
        p.forfeitBps = 1000;
        p.revealBond = 0;
        p.randomness = address(0);
        p.vrfTimeout = 0;
    }

    function _members(uint256 n) internal {
        delete m;
        for (uint256 i; i < n; ++i) {
            m.push(address(uint160(0xA000 + i)));
        }
    }

    function _deploy(ChitFund.Params memory p, uint256 n, uint256 mintEach) internal {
        _members(n);
        vm.prank(foreman);
        fund = new ChitFund(p, m, address(0));
        for (uint256 i; i < n; ++i) {
            token.mint(m[i], mintEach);
            vm.prank(m[i]);
            token.approve(address(fund), type(uint256).max);
        }
    }

    function _enrollAll() internal {
        for (uint256 i; i < m.length; ++i) {
            vm.prank(m[i]);
            fund.enroll();
        }
    }

    function _payAll() internal {
        for (uint256 i; i < m.length; ++i) {
            (, bool excluded,,,,) = fund.stateOf(m[i]);
            if (excluded || fund.paid(fund.round(), m[i])) continue;
            vm.prank(m[i]);
            fund.contribute();
        }
    }

    function _payAllBut(address skip) internal {
        for (uint256 i; i < m.length; ++i) {
            if (m[i] == skip) continue;
            (, bool excluded,,,,) = fund.stateOf(m[i]);
            if (excluded) continue;
            vm.prank(m[i]);
            fund.contribute();
        }
    }

    function _toReveal() internal {
        vm.warp(fund.graceEnd());
    }

    function _toSettle() internal {
        vm.warp(fund.revealEnd());
    }

    function _bidHash(address who, uint256 bid, bytes32 salt) internal view returns (bytes32) {
        return keccak256(abi.encode(address(fund), fund.round(), who, bid, salt));
    }

    function _commitBid(address who, uint256 bid) internal {
        bytes32 h = _bidHash(who, bid, keccak256(abi.encode(who, bid)));
        vm.prank(who);
        fund.commitBid(h);
    }

    function _revealBid(address who, uint256 bid) internal {
        vm.prank(who);
        fund.revealBid(bid, keccak256(abi.encode(who, bid)));
    }

    function _won(address who) internal view returns (bool w) {
        (w,,,,,) = fund.stateOf(who);
    }

    function _assertConserved() internal view {
        assertEq(token.balanceOf(address(fund)), fund.totalOwed(), "conservation");
    }

    function _withdrawAll() internal {
        for (uint256 i; i < m.length; ++i) {
            if (fund.credit(m[i]) + fund.escrowFree(m[i]) == 0) continue;
            vm.prank(m[i]);
            fund.withdraw();
        }
        if (fund.foremanCredit() != 0) {
            vm.prank(foreman);
            fund.withdrawCommission();
        }
    }
}
