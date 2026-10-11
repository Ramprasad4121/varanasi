// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {AgenticCommerce} from "./AgenticCommerce.sol";

/// @title RiskGuardEvaluator: contract evaluator for ERC-8183 AgenticCommerce jobs.
/// @author Ramprasad
/// @notice Settles a job only on an EIP-712 verdict signed by an allowlisted Varanasi verifier.
///         The verdict is bound to (jobId, deliverableHash) and the deliverableHash must equal the
///         deliverable the provider actually submitted on-chain. A job settles at most once: a
///         second verdict (same or opposite) for the same job always reverts, so a FAIL can never
///         be re-rolled into a PASS. Settlement is permissionless to relay: the signature, not
///         msg.sender, carries the authority.
/// @dev Trust model: the signer set is trusted to have run the PoC honestly. The contract proves
///      who signed and what they signed over, not that the PoC is in scope or how severe it is.
///      Cross-chain / cross-deployment replay is blocked by the EIP-712 domain (chainId +
///      verifyingContract) and by this evaluator being bound to one immutable AgenticCommerce.
contract RiskGuardEvaluator is EIP712 {
    /// @dev keccak256("Verdict(uint256 jobId,bytes32 deliverableHash,bool pass,bytes32 logsHash)")
    bytes32 public constant VERDICT_TYPEHASH =
        keccak256("Verdict(uint256 jobId,bytes32 deliverableHash,bool pass,bytes32 logsHash)");

    struct Settlement {
        bool settled;
        bool pass;
        address signer;
        bytes32 deliverableHash;
        bytes32 logsHash;
    }

    AgenticCommerce public immutable commerce;
    address public owner;
    address public pendingOwner;
    mapping(address => bool) public isSigner;
    mapping(uint256 => Settlement) internal _settlements;

    event SignerSet(address indexed signer, bool allowed);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event VerdictSettled(
        uint256 indexed jobId, bool pass, address indexed signer, bytes32 deliverableHash, bytes32 logsHash
    );

    error NotOwner();
    error BadParam();
    error NotEvaluatorForJob();
    error JobNotSubmitted(AgenticCommerce.Status got);
    error DeliverableMismatch(bytes32 onchain, bytes32 signed);
    error UnknownSigner(address recovered);
    error AlreadySettled(uint256 jobId);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(AgenticCommerce commerce_, address owner_, address[] memory signers)
        EIP712("Varanasi RiskGuardEvaluator", "1")
    {
        if (address(commerce_) == address(0) || owner_ == address(0)) revert BadParam();
        commerce = commerce_;
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
        for (uint256 i; i < signers.length; ++i) {
            if (signers[i] == address(0)) revert BadParam();
            isSigner[signers[i]] = true;
            emit SignerSet(signers[i], true);
        }
    }

    // ----------------------------------------------------------------- admin

    function setSigner(address signer, bool allowed) external onlyOwner {
        if (signer == address(0)) revert BadParam();
        isSigner[signer] = allowed;
        emit SignerSet(signer, allowed);
    }

    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ----------------------------------------------------------------- views

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function verdictDigest(uint256 jobId, bytes32 deliverableHash, bool pass, bytes32 logsHash)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(VERDICT_TYPEHASH, jobId, deliverableHash, pass, logsHash)));
    }

    function settlementOf(uint256 jobId) external view returns (Settlement memory) {
        return _settlements[jobId];
    }

    // ----------------------------------------------------------------- settle

    /// @notice Relay a signed verdict. PASS calls complete (provider paid), FAIL calls reject (client refunded).
    /// @dev The ERC-8183 `reason` is set to logsHash so the on-chain JobCompleted/JobRejected event points at the run logs.
    function settle(uint256 jobId, bytes32 deliverableHash, bool pass, bytes32 logsHash, bytes calldata signature)
        external
    {
        Settlement storage s = _settlements[jobId];
        if (s.settled) revert AlreadySettled(jobId);

        AgenticCommerce.Job memory j = commerce.getJob(jobId);
        if (j.evaluator != address(this)) revert NotEvaluatorForJob();
        if (j.status != AgenticCommerce.Status.Submitted) revert JobNotSubmitted(j.status);
        if (j.deliverable != deliverableHash) revert DeliverableMismatch(j.deliverable, deliverableHash);

        (address recovered, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(verdictDigest(jobId, deliverableHash, pass, logsHash), signature);
        if (err != ECDSA.RecoverError.NoError || !isSigner[recovered]) revert UnknownSigner(recovered);

        // effects before the external settle call (CEI); AgenticCommerce is nonReentrant on settle paths
        s.settled = true;
        s.pass = pass;
        s.signer = recovered;
        s.deliverableHash = deliverableHash;
        s.logsHash = logsHash;
        emit VerdictSettled(jobId, pass, recovered, deliverableHash, logsHash);

        if (pass) commerce.complete(jobId, logsHash, "");
        else commerce.reject(jobId, logsHash, "");
    }
}
