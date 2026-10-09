// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ERC2771Forwarder} from "openzeppelin-contracts/contracts/metatx/ERC2771Forwarder.sol";
import {ChitFund} from "../../src/finance/chit/ChitFund.sol";
import {MockRupee} from "../../src/app/MockRupee.sol";

/// People app: every chit action (approve, join, pay, sealed bid, reveal, take
/// money out) works with zero gas for the member. The member signs, a relayer
/// submits through the ERC-2771 forwarder, the chit sees the member as sender.
contract ChitGaslessTest is Test {
    bytes32 constant FWD_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );
    ERC2771Forwarder forwarder;
    MockRupee rupee;
    ChitFund fund;
    address foreman = makeAddr("foreman");
    address relayer = makeAddr("relayer");
    uint256[] keys;
    address[] members;
    uint256 constant C = 5_000_00; // Rs 5,000 a month, in paise

    function setUp() public {
        forwarder = new ERC2771Forwarder("Varanasi Relayer");
        rupee = new MockRupee(address(this), address(forwarder));
        for (uint256 i; i < 3; ++i) {
            keys.push(0xA11CE + i);
            members.push(vm.addr(keys[i]));
            rupee.mint(members[i], 50_000_00);
        }
        ChitFund.Params memory p;
        p.token = address(rupee);
        p.contribution = C;
        p.mode = ChitFund.Mode.AUCTION;
        p.payWindow = 3 days;
        p.gracePeriod = 2 days;
        p.revealWindow = 1 days;
        p.commissionBps = 500;
        p.maxDiscountBps = 3000;
        p.lateFeeBps = 200;
        p.forfeitBps = 1000;
        vm.prank(foreman);
        fund = new ChitFund(p, members, address(forwarder));
        vm.deal(relayer, 1 ether);
    }

    function _req(uint256 i, address to, bytes memory data)
        internal
        view
        returns (ERC2771Forwarder.ForwardRequestData memory req)
    {
        req = ERC2771Forwarder.ForwardRequestData({
            from: members[i],
            to: to,
            value: 0,
            gas: 500_000,
            deadline: uint48(block.timestamp + 1 hours),
            data: data,
            signature: ""
        });
        (, string memory name, string memory version, uint256 chainId, address vc,,) = forwarder.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                vc
            )
        );
        bytes32 sh = keccak256(
            abi.encode(
                FWD_TYPEHASH, req.from, req.to, 0, req.gas, forwarder.nonces(members[i]), req.deadline, keccak256(data)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[i], keccak256(abi.encodePacked("\x19\x01", domain, sh)));
        req.signature = abi.encodePacked(r, s, v);
    }

    function _relay(uint256 i, address to, bytes memory data) internal {
        ERC2771Forwarder.ForwardRequestData memory req = _req(i, to, data);
        vm.prank(relayer);
        forwarder.execute(req);
    }

    function test_wholeRoundWithZeroGas() public {
        for (uint256 i; i < 3; ++i) {
            _relay(i, address(rupee), abi.encodeCall(rupee.approve, (address(fund), type(uint256).max)));
            _relay(i, address(fund), abi.encodeCall(ChitFund.enroll, ()));
        }
        assertTrue(fund.started());
        for (uint256 i; i < 3; ++i) {
            _relay(i, address(fund), abi.encodeCall(ChitFund.contribute, ()));
            assertTrue(fund.paid(1, members[i]));
        }
        // members 0 and 1 place sealed bids (the amount they accept from a Rs 15,000 pot)
        uint256[2] memory bids = [uint256(12_000_00), uint256(13_500_00)];
        bytes32[2] memory salts = [keccak256("s0"), keccak256("s1")];
        for (uint256 i; i < 2; ++i) {
            bytes32 h = keccak256(abi.encode(address(fund), uint256(1), members[i], bids[i], salts[i]));
            _relay(i, address(fund), abi.encodeCall(ChitFund.commitBid, (h)));
        }
        vm.warp(fund.graceEnd());
        for (uint256 i; i < 2; ++i) {
            _relay(i, address(fund), abi.encodeCall(ChitFund.revealBid, (bids[i], salts[i])));
        }
        vm.warp(fund.revealEnd());
        fund.settle();
        ChitFund.RoundResult memory res = fund.result(1);
        assertEq(res.winner, members[0], "lowest bid wins");
        assertEq(res.payout, 12_000_00);
        assertEq(res.commission, 750_00, "foreman takes at most 5% of the pot");
        // discount 3,000 - commission 750 = 2,250 shared by the 2 other members
        assertEq(res.dividendEach, 1_125_00);

        // member 1 takes the dividend out, gasless
        uint256 before = rupee.balanceOf(members[1]);
        _relay(1, address(fund), abi.encodeCall(ChitFund.withdraw, ()));
        assertEq(rupee.balanceOf(members[1]) - before, 1_125_00);

        for (uint256 i; i < 3; ++i) {
            assertEq(members[i].balance, 0, "members never hold or spend gas");
        }
    }

    function test_relayerCannotActForMember() public {
        ERC2771Forwarder.ForwardRequestData memory req = _req(0, address(fund), abi.encodeCall(ChitFund.enroll, ()));
        req.from = members[1]; // claim to be someone else
        vm.prank(relayer);
        vm.expectRevert();
        forwarder.execute(req);
        assertFalse(fund.enrolled(members[1]));
    }

    function test_directCallsStillWork() public {
        vm.prank(members[0]);
        fund.enroll();
        assertTrue(fund.enrolled(members[0]));
    }
}
