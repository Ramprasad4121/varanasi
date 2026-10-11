// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC2771Forwarder} from "openzeppelin-contracts/contracts/metatx/ERC2771Forwarder.sol";

/// @title VaranasiForwarder: the gasless relay for the people app.
/// @author Ramprasad
/// @notice Plain OpenZeppelin ERC2771Forwarder under a fixed EIP-712 name. A member
///         signs a request; any relayer submits it and pays gas. The forwarder checks
///         the member's signature, nonce and deadline, so a relayer can delay a
///         request but never change it or act for someone else.
contract VaranasiForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("Varanasi Relayer") {}
}
