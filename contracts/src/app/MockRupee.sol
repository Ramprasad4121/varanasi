// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Context} from "openzeppelin-contracts/contracts/utils/Context.sol";
import {ERC2771Context} from "openzeppelin-contracts/contracts/metatx/ERC2771Context.sol";

/// @title MockRupee: DEMO ONLY stand-in for rupee money in the people app.
/// @author Ramprasad
/// @notice 1 unit = 1 paisa (2 decimals). In a real launch chit money moves through
///         a regulated rail (bank account, UPI escrow or an RBI approved rupee
///         token); this mock only lets the local demo show chit payments. Owner
///         mints demo balances. ERC-2771 aware so a member approves the chit
///         without paying gas.
contract MockRupee is ERC20, Ownable, ERC2771Context {
    constructor(address admin, address forwarder)
        ERC20("Mock Rupee (demo)", "mINR")
        Ownable(admin)
        ERC2771Context(forwarder)
    {}

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address to, uint256 paise) external onlyOwner {
        _mint(to, paise);
    }

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
