// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GoldBase} from "./GoldBase.sol";
import {BankGoldIssuer} from "../../src/gold/BankGoldIssuer.sol";
import {MockGoldPriceFeed} from "../../src/gold/MockGoldPriceFeed.sol";
import {ERC2771Forwarder} from "openzeppelin-contracts/contracts/metatx/ERC2771Forwarder.sol";

/// App-facing API: grams and rupees views, redemption status, per-bank
/// proof of reserve, and gasless use through the ERC-2771 forwarder + permit.
contract GoldAppTest is GoldBase {
    uint256 aliceKey = 0xA11CE;
    address user; // a wallet with a known key and zero ETH
    address relayer = makeAddr("relayer");
    MockGoldPriceFeed feed;

    bytes32 constant FWD_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)"
    );

    function setUp() public {
        _deployGold();
        user = vm.addr(aliceKey);
        feed = new MockGoldPriceFeed(gov, 1_200_000); // Rs 12,000 per gram (illustrative)
        vm.prank(gov);
        issuer.setPriceFeed(address(feed));
        _mint(BANK, user, keccak256("GD-1"), 9_950, 1);
        assertEq(user.balance, 0, "user never needs gas");
    }

    function _fwd(address to, bytes memory data, uint256 key, address from)
        internal
        view
        returns (ERC2771Forwarder.ForwardRequestData memory req)
    {
        req = ERC2771Forwarder.ForwardRequestData({
            from: from,
            to: to,
            value: 0,
            gas: 300_000,
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
        bytes32 structHash = keccak256(
            abi.encode(
                FWD_TYPEHASH, req.from, req.to, req.value, req.gas, forwarder.nonces(from), req.deadline, keccak256(req.data)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        req.signature = abi.encodePacked(r, s, v);
    }

    function test_myGoldInGramsAndRupees() public view {
        (uint256 mg, uint256 paise, uint256 asOf) = issuer.myGold(user);
        assertEq(mg, 9_950); // 9.950 g
        assertEq(paise, 11_940_000); // Rs 1,19,400.00
        assertGt(asOf, 0);
        assertEq(token.milligramsOf(user), 9_950);
    }

    function test_myGoldWithoutFeedShowsGramsOnly() public {
        vm.prank(gov);
        issuer.setPriceFeed(address(0));
        (uint256 mg, uint256 paise, uint256 asOf) = issuer.myGold(user);
        assertEq(mg, 9_950);
        assertEq(paise, 0);
        assertEq(asOf, 0);
    }

    function test_bankReservePerBankForApp() public {
        _mint(BANK2, bob, keccak256("B2-1"), 5_000, 1);
        BankGoldIssuer.BankReserveView memory v = issuer.bankReserve(BANK);
        assertEq(v.name, "Mock Bank 1 (gold deposit)");
        assertEq(v.goldHeldMilli, 9_950);
        assertEq(v.goldOwedToHoldersMilli, 9_950);
        assertTrue(v.fullyBacked);
        assertFalse(v.newDepositsPaused);
        assertEq(v.goldHeldValuePaise, 11_940_000);
        BankGoldIssuer.BankReserveView[] memory all = issuer.allBankReserves();
        assertEq(all.length, 2);
        assertEq(all[1].goldHeldMilli, 5_000);
    }

    /// Gasless redemption: the user signs, a relayer pays gas, the request is
    /// recorded for the USER (not the relayer) and shows up in "my redemptions".
    function test_gaslessRedemptionAndStatus() public {
        bytes memory data = abi.encodeCall(issuer.requestRedemption, (BANK, 2_000, keccak256("BRANCH-NLG")));
        ERC2771Forwarder.ForwardRequestData memory req = _fwd(address(issuer), data, aliceKey, user);
        vm.prank(relayer);
        forwarder.execute(req);
        assertEq(token.milligramsOf(user), 7_950);

        (uint256[] memory ids, BankGoldIssuer.Redemption[] memory list) = issuer.redemptionsOf(user);
        assertEq(ids.length, 1);
        assertEq(list[0].holder, user);
        assertEq(list[0].amountMilli, 2_000);
        assertEq(uint256(list[0].status), uint256(BankGoldIssuer.RedemptionStatus.PENDING));
        (uint256[] memory relayerIds,) = issuer.redemptionsOf(relayer);
        assertEq(relayerIds.length, 0);

        vm.prank(bankOps);
        issuer.fulfilRedemption(ids[0], "HANDED-OVER");
        (, list) = issuer.redemptionsOf(user);
        assertEq(uint256(list[0].status), uint256(BankGoldIssuer.RedemptionStatus.FULFILLED));

        // replaying the same signed request fails (forwarder nonce)
        vm.prank(relayer);
        vm.expectRevert();
        forwarder.execute(req);
    }

    function test_gaslessTransfer() public {
        bytes memory data = abi.encodeCall(token.transfer, (bob, 1e18));
        ERC2771Forwarder.ForwardRequestData memory req = _fwd(address(token), data, aliceKey, user);
        vm.prank(relayer);
        forwarder.execute(req);
        assertEq(token.milligramsOf(bob), 1_000);
        assertEq(token.milligramsOf(user), 8_950);
    }

    function test_relayerCannotSpendForSomeoneElse() public {
        // relayer signs a request claiming to be the user
        bytes memory data = abi.encodeCall(token.transfer, (relayer, 9.95e18));
        ERC2771Forwarder.ForwardRequestData memory req = _fwd(address(token), data, 0xBAD, user);
        vm.prank(relayer);
        vm.expectRevert();
        forwarder.execute(req);
        assertEq(token.milligramsOf(user), 9_950);
    }

    function test_permitLetsAppApproveWithoutGas() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                user,
                relayer,
                1e18,
                token.nonces(user),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(aliceKey, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
        vm.prank(relayer);
        token.permit(user, relayer, 1e18, deadline, v, r, s);
        assertEq(token.allowance(user, relayer), 1e18);
    }

    function test_eventsCarryHolderForAppIndexing() public {
        vm.prank(user);
        uint256 id = issuer.requestRedemption(BANK, 1_000, "B");
        vm.expectEmit(true, true, true, true);
        emit BankGoldIssuer.RedemptionCancelled(id, BANK, user, 1_000, "KYC-PENDING");
        vm.prank(bankOps);
        issuer.cancelRedemption(id, "KYC-PENDING");
    }
}
