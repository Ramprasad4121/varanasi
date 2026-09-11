// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {GoldRegistry} from "./GoldRegistry.sol";

/// @title GoldAttestor — accountable verification + custodian whitelist.
/// @author Ramprasad
/// @dev Holds the custodian registry (who may custody gold) and the allowlist of
///      authorized verifier identities. An attestation succeeds only when the caller
///      is an allowed attestor AND the declaring custodian is whitelisted.
contract GoldAttestor is Ownable {
    error AttestorNotAllowed(address caller);
    error CustodianUnknown(bytes32 custodianId);

    event AttestorAllowlisted(address indexed attestor);
    event AttestorRatelimited(address indexed attestor);
    event CustodianAdded(bytes32 indexed custodianId, string name);
    event CustodianRemoved(bytes32 indexed custodianId);
    event AttestationLogged(
        bytes32 indexed assetId,
        address indexed attestor,
        bytes32 indexed custodianId,
        string custodianName,
        uint256 weightGrams,
        uint256 purityBps
    );

    GoldRegistry public immutable registry;

    mapping(address => bool) public attestorAllowed;
    address[] public attestors;

    mapping(bytes32 => string) public custodianNames;
    mapping(bytes32 => bool) public custodianActive;
    bytes32[] public custodianIds;

    /// @param admin Owner (allowlist + custodian management).
    /// @param goldRegistry Source-of-truth registry.
    constructor(address admin, address goldRegistry) Ownable(admin) {
        registry = GoldRegistry(goldRegistry);
    }

    modifier onlyAllowedAttestor() {
        if (!attestorAllowed[msg.sender]) revert AttestorNotAllowed(msg.sender);
        _;
    }

    // --- Attestor allowlist (owner governs) ---

    function allowAttestor(address attestor) external onlyOwner {
        if (attestorAllowed[attestor]) return;
        attestorAllowed[attestor] = true;
        attestors.push(attestor);
        emit AttestorAllowlisted(attestor);
    }

    function ratelimitAttestor(address attestor) external onlyOwner {
        if (!attestorAllowed[attestor]) return;
        attestorAllowed[attestor] = false;
        for (uint256 i; i < attestors.length; ++i) {
            if (attestors[i] == attestor) {
                attestors[i] = attestors[attestors.length - 1];
                attestors.pop();
                break;
            }
        }
        emit AttestorRatelimited(attestor);
    }

    // --- Custodian whitelist (owner governs) ---

    function addCustodian(bytes32 custodianId, string calldata name) external onlyOwner {
        if (custodianActive[custodianId]) return;
        custodianActive[custodianId] = true;
        custodianNames[custodianId] = name;
        custodianIds.push(custodianId);
        emit CustodianAdded(custodianId, name);
    }

    function removeCustodian(bytes32 custodianId) external onlyOwner {
        if (!custodianActive[custodianId]) return;
        custodianActive[custodianId] = false;
        delete custodianNames[custodianId];
        for (uint256 i; i < custodianIds.length; ++i) {
            if (custodianIds[i] == custodianId) {
                custodianIds[i] = custodianIds[custodianIds.length - 1];
                custodianIds.pop();
                break;
            }
        }
        emit CustodianRemoved(custodianId);
    }

    // --- Attestation (any allowlisted attestor may verify) ---

    /// @notice Verify a gold position, forwarding to the GoldRegistry.
    /// @dev The custodian must be active in the whitelist; its name is stored
    ///      verbatim on the position for human readability.
    function attest(
        bytes32 assetId,
        uint256 weightGrams,
        uint256 purityBps,
        string calldata custodianName,
        address owner,
        bytes32 custodianId
    ) external onlyAllowedAttestor {
        if (!custodianActive[custodianId]) revert CustodianUnknown(custodianId);
        registry.verifyAsset(assetId, weightGrams, purityBps, custodianName, owner);
        emit AttestationLogged(assetId, msg.sender, custodianId, custodianName, weightGrams, purityBps);
    }

    /// @notice Revoke a previously verified/minted position.
    function revoke(bytes32 assetId) external onlyAllowedAttestor {
        registry.revokeAsset(assetId);
    }
}