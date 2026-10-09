// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC2771Context} from "openzeppelin-contracts/contracts/metatx/ERC2771Context.sol";
import {Context} from "openzeppelin-contracts/contracts/utils/Context.sol";

/// @title GoldToken (vGOLD): fungible claim on bank-held fine gold.
/// @author Ramprasad
/// @notice 1 vGOLD (1e18 units) = 1 gram of fine gold held by a partner bank.
///         1 milligram = 1e15 units. Only the bound issuer (BankGoldIssuer) can
///         mint or burn; transfers are plain ERC20 and are never paused, so a
///         dispute can never freeze or burn a holder's balance.
///         Gasless: users sign, a relayer pays gas. Transfers work through the
///         trusted ERC-2771 forwarder, and approvals through EIP-2612 permit.
/// @dev Demo token for local and test networks. Not a regulated product.
contract GoldToken is ERC20, ERC20Permit, ERC2771Context {
    error GoldTokenOnlyIssuer(address caller);
    error GoldTokenIssuerAlreadySet();
    error GoldTokenOnlyDeployer(address caller);
    error GoldTokenZeroAddress();

    event IssuerBound(address indexed issuer);

    /// @notice Token units per milligram of fine gold (18 decimals per gram).
    uint256 public constant UNITS_PER_MILLIGRAM = 1e15;

    address public immutable deployer;
    address public issuer;

    /// @param forwarder Trusted ERC-2771 forwarder for gasless transfers (address(0) = none).
    constructor(address forwarder)
        ERC20("Varanasi Gold", "vGOLD")
        ERC20Permit("Varanasi Gold")
        ERC2771Context(forwarder)
    {
        deployer = msg.sender;
    }

    /// @notice Balance in milligrams of fine gold (app friendly: 9950 = 9.950 g).
    function milligramsOf(address account) external view returns (uint256) {
        return balanceOf(account) / UNITS_PER_MILLIGRAM;
    }

    /// @notice One-time binding of the issuer. Irreversible.
    function bindIssuer(address issuer_) external {
        if (msg.sender != deployer) revert GoldTokenOnlyDeployer(msg.sender);
        if (issuer != address(0)) revert GoldTokenIssuerAlreadySet();
        if (issuer_ == address(0)) revert GoldTokenZeroAddress();
        issuer = issuer_;
        emit IssuerBound(issuer_);
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert GoldTokenOnlyIssuer(msg.sender);
        _;
    }

    function mint(address to, uint256 units) external onlyIssuer {
        _mint(to, units);
    }

    function burn(address from, uint256 units) external onlyIssuer {
        _burn(from, units);
    }

    // --- ERC-2771 plumbing (sender = the user who signed, not the relayer) ---
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
