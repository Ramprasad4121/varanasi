// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Context} from "openzeppelin-contracts/contracts/utils/Context.sol";
import {ERC2771Context} from "openzeppelin-contracts/contracts/metatx/ERC2771Context.sol";
import {CollateralVault} from "../collateral/CollateralVault.sol";

/// @title GaslessCollateralVault: CollateralVault that accepts relayed calls.
/// @author Ramprasad
/// @notice Same rules as CollateralVault. A person pledges gold through the
///         VaranasiForwarder, so `lockedBy` records the person who signed, not the
///         relayer. `release` still checks msg.sender (resolvers are contracts).
contract GaslessCollateralVault is CollateralVault, ERC2771Context {
    constructor(address admin, address forwarder) CollateralVault(admin) ERC2771Context(forwarder) {}

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}
