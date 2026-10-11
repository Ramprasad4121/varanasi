// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {CollateralVault} from "../../src/collateral/CollateralVault.sol";
import {MockERC20} from "../../src/MockERC20.sol";

/// @notice Token that burns 1% of every transfer (fee-on-transfer).
contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @notice Token that re-enters the vault from inside transferFrom, trying to lock the
///         same position id a second time before the first lock finishes.
contract ReentrantToken is ERC20 {
    CollateralVault public vault;
    bytes32 public pos;
    bool public armed;
    bytes public reentryError;

    constructor() ERC20("Re", "RE") {}

    function mint(address to, uint256 a) external {
        _mint(to, a);
    }

    function arm(CollateralVault v, bytes32 p) external {
        vault = v;
        pos = p;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        bool ok = super.transferFrom(from, to, value);
        if (armed) {
            armed = false;
            _mint(address(this), value);
            _approve(address(this), address(vault), value);
            try vault.lock(pos, address(this), address(this), value) {}
            catch (bytes memory err) {
                reentryError = err;
            }
        }
        return ok;
    }
}

/// @title CollateralVaultLockSafetyTest: lock() follows checks-effects-interactions and
///        refuses fee-on-transfer tokens (Slither reentrancy-no-eth triage, 2026-10-11)
contract CollateralVaultLockSafetyTest is Test {
    CollateralVault vault;
    FeeToken fee;
    ReentrantToken re;
    MockERC20 plain;

    address admin = address(0xad11);
    address alice = address(0xa11c);
    bytes32 pos = keccak256("pos");
    uint256 constant AMOUNT = 1_000e18;

    function setUp() public {
        vault = new CollateralVault(admin);
        fee = new FeeToken();
        re = new ReentrantToken();
        plain = new MockERC20("USDM", "USDM", 18);
        vm.startPrank(admin);
        vault.admitAsset(address(fee));
        vault.admitAsset(address(re));
        vault.admitAsset(address(plain));
        vm.stopPrank();
        fee.mint(alice, AMOUNT);
        re.mint(alice, AMOUNT);
        plain.mint(alice, AMOUNT);
    }

    function test_FeeOnTransferTokenIsRefused() public {
        vm.startPrank(alice);
        fee.approve(address(vault), AMOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(CollateralVault.CollateralUnsupportedToken.selector, AMOUNT, AMOUNT - AMOUNT / 100)
        );
        vault.lock(pos, address(fee), alice, AMOUNT);
        vm.stopPrank();

        // nothing recorded, nothing moved
        (, address owner, uint256 amt) = vault.positionOf(pos);
        assertEq(owner, address(0));
        assertEq(amt, 0);
        assertEq(fee.balanceOf(address(vault)), 0);
        assertEq(fee.balanceOf(alice), AMOUNT);
    }

    function test_ReentrantLockOfSamePositionIsBlocked() public {
        re.arm(vault, pos);
        vm.startPrank(alice);
        re.approve(address(vault), AMOUNT);
        vault.lock(pos, address(re), alice, AMOUNT);
        vm.stopPrank();

        // the nested lock saw the position already recorded (effects ran first)
        assertEq(re.reentryError(), abi.encodeWithSelector(CollateralVault.CollateralPositionLocked.selector, pos));
        (address t, address owner, uint256 amt) = vault.positionOf(pos);
        assertEq(t, address(re));
        assertEq(owner, alice);
        assertEq(amt, AMOUNT);
        assertEq(re.balanceOf(address(vault)), AMOUNT);
    }

    function testFuzz_PlainTokenLockMatchesBalance(uint256 amount) public {
        amount = bound(amount, 1, AMOUNT);
        vm.startPrank(alice);
        plain.approve(address(vault), amount);
        vault.lock(pos, address(plain), alice, amount);
        vm.stopPrank();
        assertEq(vault.value(pos), amount);
        assertEq(plain.balanceOf(address(vault)), amount);
    }
}
