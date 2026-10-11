// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MetalCertificateRegistry: single-use bank metal deposit certificates (one per metal).
/// @author Ramprasad
/// @notice Records every bank deposit certificate that was ever used or cancelled.
///         A certificateId moves NONE -> MINTED or NONE -> REVOKED and can never
///         return to NONE, so a signed attestation can mint at most once.
///         A MINTED certificate can be DISPUTED, then restored to MINTED or
///         WRITTEN_OFF (after the bank has burned the matching tokens).
/// @dev Every state transition is restricted to the bound issuer (audit fix F1/F2:
///      the old markMinted/markRedeemed had no access control).
contract MetalCertificateRegistry {
    error MetalCertificateRegistryOnlyIssuer(address caller);
    error MetalCertificateRegistryOnlyDeployer(address caller);
    error MetalCertificateRegistryIssuerAlreadySet();
    error MetalCertificateRegistryZeroAddress();
    error MetalCertificateRegistryBadTransition(bytes32 certificateId, Status from, Status to);

    enum Status {
        NONE,
        MINTED,
        REVOKED, // cancelled by the bank before any mint
        DISPUTED, // minted, custody under dispute; bank minting paused
        WRITTEN_OFF // dispute upheld; bank burned the matching tokens
    }

    struct Certificate {
        bytes32 bankId;
        address depositor; // who deposited the metal (first token recipient)
        uint64 fineMilli; // milligrams of fine metal
        uint16 purityPermille; // assayed fineness, e.g. 995
        Status status;
        uint64 updatedAt;
    }

    event IssuerBound(address indexed issuer);
    event CertificateStatus(bytes32 indexed certificateId, bytes32 indexed bankId, Status status);

    address public immutable deployer;
    address public issuer;
    mapping(bytes32 => Certificate) internal _certs;

    constructor() {
        deployer = msg.sender;
    }

    function bindIssuer(address issuer_) external {
        if (msg.sender != deployer) revert MetalCertificateRegistryOnlyDeployer(msg.sender);
        if (issuer != address(0)) revert MetalCertificateRegistryIssuerAlreadySet();
        if (issuer_ == address(0)) revert MetalCertificateRegistryZeroAddress();
        issuer = issuer_;
        emit IssuerBound(issuer_);
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert MetalCertificateRegistryOnlyIssuer(msg.sender);
        _;
    }

    /// @notice NONE -> MINTED. Only the issuer, after verifying the bank signature.
    function recordMint(
        bytes32 certificateId,
        bytes32 bankId,
        address depositor,
        uint64 fineMilli,
        uint16 purityPermille
    ) external onlyIssuer {
        Certificate storage c = _certs[certificateId];
        if (c.status != Status.NONE) {
            revert MetalCertificateRegistryBadTransition(certificateId, c.status, Status.MINTED);
        }
        c.bankId = bankId;
        c.depositor = depositor;
        c.fineMilli = fineMilli;
        c.purityPermille = purityPermille;
        c.status = Status.MINTED;
        c.updatedAt = uint64(block.timestamp);
        emit CertificateStatus(certificateId, bankId, Status.MINTED);
    }

    /// @notice NONE -> REVOKED (bank cancels an unused attestation).
    function recordRevoke(bytes32 certificateId, bytes32 bankId) external onlyIssuer {
        Certificate storage c = _certs[certificateId];
        if (c.status != Status.NONE) {
            revert MetalCertificateRegistryBadTransition(certificateId, c.status, Status.REVOKED);
        }
        c.bankId = bankId;
        c.status = Status.REVOKED;
        c.updatedAt = uint64(block.timestamp);
        emit CertificateStatus(certificateId, bankId, Status.REVOKED);
    }

    /// @notice MINTED -> DISPUTED, DISPUTED -> MINTED, DISPUTED -> WRITTEN_OFF.
    function setStatus(bytes32 certificateId, Status to) external onlyIssuer {
        Certificate storage c = _certs[certificateId];
        Status from = c.status;
        bool ok = (from == Status.MINTED && to == Status.DISPUTED)
            || (from == Status.DISPUTED && (to == Status.MINTED || to == Status.WRITTEN_OFF));
        if (!ok) revert MetalCertificateRegistryBadTransition(certificateId, from, to);
        c.status = to;
        c.updatedAt = uint64(block.timestamp);
        emit CertificateStatus(certificateId, c.bankId, to);
    }

    function certificateOf(bytes32 certificateId) external view returns (Certificate memory) {
        return _certs[certificateId];
    }

    function statusOf(bytes32 certificateId) external view returns (Status) {
        return _certs[certificateId].status;
    }
}
