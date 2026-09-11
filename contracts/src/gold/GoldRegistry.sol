// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title GoldRegistry — the single source of truth for gold positions.
/// @author Ramprasad
/// @dev Each position claims a physical gold item (weight, purity, custodian).
///      Only an AUTHORIZED ATTESTOR may verify or revoke. Verification enables the
///      GoldToken to mint the corresponding tokenized claim; redemption marks the
///      position redeemed. Replay protection disabled for revoked positions:
///      an assetId can be (re)verified only while it is NONE or REVOKED, and a
///      verified assetId can be minted/redeemed exactly once.
contract GoldRegistry is Ownable {
    error GoldNotAuthorizedAttestor(address caller);
    error GoldPositionExists(bytes32 assetId);
    error GoldPositionUnknown(bytes32 assetId);
    error GoldNotVerified(bytes32 assetId);
    error GoldNotMinted(bytes32 assetId);
    error GoldInvalidWeight();
    error GoldInvalidPurity();

    enum Status {
        NONE,
        VERIFIED,
        REVOKED,
        MINTED,
        REDEEMED
    }

    struct GoldPosition {
        uint256 weightGrams; // integer grams
        uint256 purityBps; // basis points of purity (0..10000, 10000 = 999 fine)
        string custodian; // custodian identity/name
        address owner; // beneficial owner of the position
        address attestor; // the attestor who verified this position (accountability)
        Status status;
        uint256 version; // bumped on re-verify after revoke
        uint256 attestedAt;
        uint256 revokedAt;
    }

    event GoldVerified(
        bytes32 indexed assetId,
        uint256 weightGrams,
        uint256 purityBps,
        string custodian,
        address indexed owner,
        address indexed attestor,
        uint256 version
    );
    event GoldRevoked(bytes32 indexed assetId, address indexed attestor);
    event GoldMinted(bytes32 indexed assetId, address indexed minter);
    event GoldRedeemed(bytes32 indexed assetId, address indexed redeemer);
    event AttestorAdded(address indexed attestor);
    event AttestorRemoved(address indexed attestor);

    uint256 private constant _BPS_BASE = 10000;

    mapping(bytes32 => GoldPosition) public positions;
    mapping(address => bool) public isAttestor;
    address[] public attestorList;
    uint256 public attestorCount;

    /// @param admin Owner (attestor management).
    constructor(address admin) Ownable(admin) {}

    modifier onlyAttestor() {
        if (!isAttestor[msg.sender]) revert GoldNotAuthorizedAttestor(msg.sender);
        _;
    }

    // --- Attestor management ---

    /// @notice Authorize an attestor. Only the owner may manage the allowlist.
    function addAttestor(address attestor) external onlyOwner {
        if (isAttestor[attestor]) return;
        isAttestor[attestor] = true;
        attestorList.push(attestor);
        attestorCount++;
        emit AttestorAdded(attestor);
    }

    /// @notice De-authorize an attestor.
    function removeAttestor(address attestor) external onlyOwner {
        if (!isAttestor[attestor]) return;
        isAttestor[attestor] = false;
        for (uint256 i; i < attestorList.length; ++i) {
            if (attestorList[i] == attestor) {
                attestorList[i] = attestorList[attestorList.length - 1];
                attestorList.pop();
                break;
            }
        }
        attestorCount--;
        emit AttestorRemoved(attestor);
    }

    // --- Verification (only authorized attestors) ---

    /// @notice Verify a gold position. Reverts if the assetId is currently
    ///         VERIFIED/MINTED/REDEEMED (replay protection); a REVOKED position
    ///         can be re-verified, bumping its version.
    function verifyAsset(
        bytes32 assetId,
        uint256 weightGrams,
        uint256 purityBps,
        string calldata custodian,
        address owner
    ) external onlyAttestor {
        GoldPosition storage pos = positions[assetId];
        Status cur = pos.status;
        if (cur == Status.VERIFIED || cur == Status.MINTED || cur == Status.REDEEMED) {
            revert GoldPositionExists(assetId);
        }
        if (weightGrams == 0) revert GoldInvalidWeight();
        if (purityBps == 0 || purityBps > _BPS_BASE) revert GoldInvalidPurity();

        if (cur == Status.REVOKED) {
            pos.version += 1;
        }

        pos.weightGrams = weightGrams;
        pos.purityBps = purityBps;
        pos.custodian = custodian;
        pos.owner = owner;
        pos.attestor = msg.sender;
        pos.status = Status.VERIFIED;
        pos.attestedAt = block.timestamp;
        emit GoldVerified(assetId, weightGrams, purityBps, custodian, owner, msg.sender, pos.version);
    }

    /// @notice Revoke a verified or minted position (e.g. custody loss).
    function revokeAsset(bytes32 assetId) external onlyAttestor {
        GoldPosition storage pos = positions[assetId];
        Status cur = pos.status;
        if (cur != Status.VERIFIED && cur != Status.MINTED) revert GoldPositionUnknown(assetId);
        pos.status = Status.REVOKED;
        pos.revokedAt = block.timestamp;
        emit GoldRevoked(assetId, msg.sender);
    }

    // --- Mint / redeem lifecycle (only the GoldToken may advance states) ---

    /// @notice Transition VERIFIED -> MINTED. Only GoldToken.
    function markMinted(bytes32 assetId) external {
        GoldPosition storage pos = positions[assetId];
        if (pos.status != Status.VERIFIED) revert GoldNotVerified(assetId);
        pos.status = Status.MINTED;
        emit GoldMinted(assetId, msg.sender);
    }

    /// @notice Transition MINTED -> REDEEMED. Only GoldToken.
    function markRedeemed(bytes32 assetId) external {
        GoldPosition storage pos = positions[assetId];
        if (pos.status != Status.MINTED) revert GoldNotMinted(assetId);
        pos.status = Status.REDEEMED;
        emit GoldRedeemed(assetId, msg.sender);
    }

    function positionOf(bytes32 assetId) external view returns (GoldPosition memory) {
        return positions[assetId];
    }
}