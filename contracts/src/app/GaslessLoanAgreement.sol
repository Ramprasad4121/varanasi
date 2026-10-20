// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Context} from "openzeppelin-contracts/contracts/utils/Context.sol";
import {ERC2771Context} from "openzeppelin-contracts/contracts/metatx/ERC2771Context.sol";
import {LoanAgreement} from "../finance/LoanAgreement.sol";

/// @title GaslessLoanAgreement: LoanAgreement that accepts relayed calls.
/// @author Ramprasad
/// @notice Same rules as LoanAgreement (borrower must be the caller and the one who
///         locked the gold; only the named lender funds). The borrower signs on the
///         phone and the relayer pays the network fee; the forwarder checks the
///         signature, so the relayer cannot borrow, draw or repay for anyone else.
contract GaslessLoanAgreement is LoanAgreement, ERC2771Context {
    constructor(address collateralVault, address forwarder) LoanAgreement(collateralVault) ERC2771Context(forwarder) {}

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
