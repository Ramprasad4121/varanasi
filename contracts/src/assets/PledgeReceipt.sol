// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC721} from "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "openzeppelin-contracts/contracts/utils/cryptography/SignatureChecker.sol";

/// @title PledgeReceipt: bank-attested receipt for one unique valuable under a bank lien.
/// @author Ramprasad
/// @notice A car, a two wheeler, a land document or a jewellery set is NOT split into
///         tradeable pieces. The bank inspects and appraises it, keeps its lien
///         (hypothecation on the RC for a vehicle, deposit of title deeds for land,
///         custody for jewellery) and signs an EIP-712 attestation. This contract
///         mints ONE non-fungible receipt that says: this bank holds a lien on this
///         item, appraised at this many rupees, valid until this re-appraisal date.
///
///         Rules the chain enforces:
///         - only a registered bank signer can create a receipt, each attestation once;
///         - the receipt cannot move between people unless the bank approves that exact
///           move (approveTransfer, one shot) or it goes into / out of a contract the
///           governance trusts to enforce the lien (loan book, bank asset desk);
///         - the bank can freeze a receipt (dispute, police case, court order);
///         - a frozen receipt or one past its re-appraisal date is worth 0 as collateral;
///         - collateral value is the appraisal minus a haircut set per asset class.
/// @dev No personal data on chain. assetIdHash is keccak256 of the RC number, VIN,
///      survey number or hallmark id plus a bank salt; detailsHash points to the bank's
///      own file. Amounts are in paise (Rs 1 = 100 paise).
contract PledgeReceipt is ERC721, Ownable, EIP712 {
    // ------------------------------------------------------------------ errors
    error PledgeUnknownBank(bytes32 bankId);
    error PledgeBankExists(bytes32 bankId);
    error PledgeZeroAddress();
    error PledgeZeroValue();
    error PledgeBadClass(uint8 assetClass);
    error PledgeBadDates();
    error PledgeExpired(uint256 expiry);
    error PledgeNonceUsed(bytes32 bankId, uint256 nonce);
    error PledgeRefUsed(bytes32 receiptRef);
    error PledgeBadSignature();
    error PledgeNotBankOperator(bytes32 bankId, address caller);
    error PledgeFrozen(uint256 tokenId);
    error PledgeTransferNotApproved(uint256 tokenId, address to);
    error PledgeNotLienMover(address caller);
    error PledgeHeldByLienMover(uint256 tokenId);
    error PledgeBadHaircut(uint256 bps);

    // ------------------------------------------------------------------ events
    event BankAdded(bytes32 indexed bankId, string name, address signer, address operator);
    event BankSignerSet(bytes32 indexed bankId, address signer);
    event BankOperatorSet(bytes32 indexed bankId, address operator);
    event LienMoverSet(address indexed mover, bool allowed);
    event HaircutSet(uint8 indexed assetClass, uint256 bps);
    event ReceiptIssued(
        uint256 indexed tokenId,
        bytes32 indexed bankId,
        address indexed holder,
        uint8 assetClass,
        bytes32 assetIdHash,
        uint256 appraisedPaise,
        uint64 reappraiseBy
    );
    event Reappraised(uint256 indexed tokenId, uint256 appraisedPaise, uint64 appraisedAt, uint64 reappraiseBy);
    event TransferApproved(uint256 indexed tokenId, address indexed to);
    event Frozen(uint256 indexed tokenId, bytes32 reason);
    event Unfrozen(uint256 indexed tokenId);
    event Released(uint256 indexed tokenId, bytes32 releaseRef);

    // ------------------------------------------------------------------ types
    /// @notice Asset classes. Haircut and loan to value differ per class.
    uint8 public constant CLASS_CAR = 0;
    uint8 public constant CLASS_TWO_WHEELER = 1;
    uint8 public constant CLASS_LAND_DOCUMENT = 2;
    uint8 public constant CLASS_JEWELLERY = 3;
    uint8 public constant CLASS_OTHER = 4;
    uint8 public constant CLASS_COUNT = 5;

    /// @notice What a bank signs after inspecting and appraising an item.
    struct PledgeAttestation {
        bytes32 bankId;
        address holder; // who receives the receipt (the owner of the item, or the bank itself for repossessed stock)
        bytes32 receiptRef; // bank's internal pledge number, hashed; single use
        uint8 assetClass;
        bytes32 assetIdHash; // keccak256(RC / VIN / survey no / hallmark id + bank salt)
        bytes32 detailsHash; // hash of the bank's appraisal file
        uint256 appraisedPaise;
        uint64 appraisedAt;
        uint64 reappraiseBy; // after this the receipt is worth 0 as collateral
        uint256 nonce;
        uint256 expiry;
    }

    struct Receipt {
        bytes32 bankId;
        uint8 assetClass;
        bool frozen;
        uint64 appraisedAt;
        uint64 reappraiseBy;
        bytes32 assetIdHash;
        bytes32 detailsHash;
        uint256 appraisedPaise;
    }

    struct Bank {
        string name;
        address signer;
        address operator;
        bool exists;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "PledgeAttestation(bytes32 bankId,address holder,bytes32 receiptRef,uint8 assetClass,bytes32 assetIdHash,bytes32 detailsHash,uint256 appraisedPaise,uint64 appraisedAt,uint64 reappraiseBy,uint256 nonce,uint256 expiry)"
    );
    uint256 public constant BPS = 10_000;

    // ------------------------------------------------------------------ storage
    mapping(bytes32 => Bank) internal _banks;
    mapping(bytes32 => mapping(uint256 => bool)) public nonceUsed;
    mapping(bytes32 => bool) public receiptRefUsed;
    mapping(uint256 => Receipt) internal _receipts;
    /// @notice One-shot bank approval: the only address this receipt may move to next.
    mapping(uint256 => address) public approvedTo;
    /// @notice Contracts trusted to hold receipts and enforce the lien (loan book, asset desk).
    mapping(address => bool) public lienMover;
    /// @notice Haircut per asset class, in basis points of the appraisal.
    uint256[5] public haircutBps;
    uint256 public receiptCount;

    constructor(address admin)
        ERC721("Varanasi Pledge Receipt", "vPLEDGE")
        Ownable(admin)
        EIP712("Varanasi Pledge", "1")
    {
        // conservative defaults; governance tunes them per bank policy
        haircutBps[CLASS_CAR] = 3000; // cars lose value fast
        haircutBps[CLASS_TWO_WHEELER] = 4000;
        haircutBps[CLASS_LAND_DOCUMENT] = 2500; // title risk
        haircutBps[CLASS_JEWELLERY] = 1500; // making charges and stones are not lendable value
        haircutBps[CLASS_OTHER] = 5000;
    }

    // ------------------------------------------------------------------ governance
    function addBank(bytes32 bankId, string calldata name, address signer, address operator) external onlyOwner {
        if (_banks[bankId].exists) revert PledgeBankExists(bankId);
        if (signer == address(0) || operator == address(0)) revert PledgeZeroAddress();
        _banks[bankId] = Bank({name: name, signer: signer, operator: operator, exists: true});
        emit BankAdded(bankId, name, signer, operator);
    }

    function setBankSigner(bytes32 bankId, address signer) external onlyOwner {
        if (signer == address(0)) revert PledgeZeroAddress();
        _bank(bankId).signer = signer;
        emit BankSignerSet(bankId, signer);
    }

    function setBankOperator(bytes32 bankId, address operator) external onlyOwner {
        if (operator == address(0)) revert PledgeZeroAddress();
        _bank(bankId).operator = operator;
        emit BankOperatorSet(bankId, operator);
    }

    function setLienMover(address mover, bool allowed) external onlyOwner {
        if (mover == address(0)) revert PledgeZeroAddress();
        lienMover[mover] = allowed;
        emit LienMoverSet(mover, allowed);
    }

    function setHaircut(uint8 assetClass, uint256 bps) external onlyOwner {
        if (assetClass >= CLASS_COUNT) revert PledgeBadClass(assetClass);
        if (bps >= BPS) revert PledgeBadHaircut(bps);
        haircutBps[assetClass] = bps;
        emit HaircutSet(assetClass, bps);
    }

    // ------------------------------------------------------------------ issue
    /// @notice Mint a receipt from a bank-signed attestation. Anyone may relay.
    function issue(PledgeAttestation calldata a, bytes calldata signature) external returns (uint256 tokenId) {
        Bank storage b = _bank(a.bankId);
        if (a.holder == address(0)) revert PledgeZeroAddress();
        if (a.appraisedPaise == 0) revert PledgeZeroValue();
        if (a.assetClass >= CLASS_COUNT) revert PledgeBadClass(a.assetClass);
        if (a.appraisedAt > block.timestamp || a.reappraiseBy <= block.timestamp) revert PledgeBadDates();
        if (block.timestamp > a.expiry) revert PledgeExpired(a.expiry);
        if (nonceUsed[a.bankId][a.nonce]) revert PledgeNonceUsed(a.bankId, a.nonce);
        if (receiptRefUsed[a.receiptRef]) revert PledgeRefUsed(a.receiptRef);
        if (!SignatureChecker.isValidSignatureNow(b.signer, hashAttestation(a), signature)) {
            revert PledgeBadSignature();
        }

        nonceUsed[a.bankId][a.nonce] = true;
        receiptRefUsed[a.receiptRef] = true;
        tokenId = ++receiptCount;
        _receipts[tokenId] = Receipt({
            bankId: a.bankId,
            assetClass: a.assetClass,
            frozen: false,
            appraisedAt: a.appraisedAt,
            reappraiseBy: a.reappraiseBy,
            assetIdHash: a.assetIdHash,
            detailsHash: a.detailsHash,
            appraisedPaise: a.appraisedPaise
        });
        _mint(a.holder, tokenId);
        emit ReceiptIssued(tokenId, a.bankId, a.holder, a.assetClass, a.assetIdHash, a.appraisedPaise, a.reappraiseBy);
    }

    // ------------------------------------------------------------------ bank actions
    modifier onlyReceiptBank(uint256 tokenId) {
        bytes32 bankId = _receiptOf(tokenId).bankId;
        if (msg.sender != _banks[bankId].operator) revert PledgeNotBankOperator(bankId, msg.sender);
        _;
    }

    /// @notice Bank re-attests the value after a fresh inspection.
    function reappraise(uint256 tokenId, uint256 appraisedPaise, uint64 reappraiseBy)
        external
        onlyReceiptBank(tokenId)
    {
        _reappraise(tokenId, appraisedPaise, reappraiseBy);
    }

    /// @notice Bank approves exactly one next holder (sale through the bank).
    function approveTransfer(uint256 tokenId, address to) external onlyReceiptBank(tokenId) {
        approvedTo[tokenId] = to;
        emit TransferApproved(tokenId, to);
    }

    function freeze(uint256 tokenId, bytes32 reason) external onlyReceiptBank(tokenId) {
        _receipts[tokenId].frozen = true;
        emit Frozen(tokenId, reason);
    }

    function unfreeze(uint256 tokenId) external onlyReceiptBank(tokenId) {
        _receipts[tokenId].frozen = false;
        emit Unfrozen(tokenId);
    }

    /// @notice Lien cleared and item handed back: the bank burns the receipt.
    ///         Not possible while a loan book or the asset desk holds it.
    function release(uint256 tokenId, bytes32 releaseRef) external onlyReceiptBank(tokenId) {
        if (lienMover[_ownerOf(tokenId)]) revert PledgeHeldByLienMover(tokenId);
        delete approvedTo[tokenId];
        _burn(tokenId);
        emit Released(tokenId, releaseRef);
    }

    /// @notice A trusted lien mover (the asset desk at auction settlement) records
    ///         the bank's fresh appraisal. Only for a receipt it currently holds.
    function moverReappraise(uint256 tokenId, uint256 appraisedPaise, uint64 reappraiseBy) external {
        if (!lienMover[msg.sender]) revert PledgeNotLienMover(msg.sender);
        if (_ownerOf(tokenId) != msg.sender) revert PledgeNotLienMover(msg.sender);
        _reappraise(tokenId, appraisedPaise, reappraiseBy);
    }

    function _reappraise(uint256 tokenId, uint256 appraisedPaise, uint64 reappraiseBy) internal {
        if (appraisedPaise == 0) revert PledgeZeroValue();
        if (reappraiseBy <= block.timestamp) revert PledgeBadDates();
        Receipt storage r = _receipts[tokenId];
        r.appraisedPaise = appraisedPaise;
        r.appraisedAt = uint64(block.timestamp);
        r.reappraiseBy = reappraiseBy;
        emit Reappraised(tokenId, appraisedPaise, uint64(block.timestamp), reappraiseBy);
    }

    // ------------------------------------------------------------------ transfer gate
    /// @dev Every move between two holders must be bank approved or go through a
    ///      trusted lien mover. Mint and burn are handled by issue and release.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            Receipt storage r = _receipts[tokenId];
            // a mover must itself drive the move, so nobody can push a receipt into
            // (or pull one out of) the loan book or the desk behind its back
            bool moverOut = lienMover[from] && msg.sender == from;
            bool viaMover = moverOut || (lienMover[to] && msg.sender == to);
            bool bankOk = approvedTo[tokenId] == to;
            if (r.frozen && !moverOut) revert PledgeFrozen(tokenId);
            if (!viaMover && !bankOk) revert PledgeTransferNotApproved(tokenId, to);
            if (bankOk) delete approvedTo[tokenId];
        }
        return super._update(to, tokenId, auth);
    }

    // ------------------------------------------------------------------ views
    /// @notice Lendable value: appraisal minus the class haircut. 0 when frozen
    ///         or past the re-appraisal date.
    function collateralValuePaise(uint256 tokenId) public view returns (uint256) {
        Receipt storage r = _receiptOf(tokenId);
        if (r.frozen || block.timestamp > r.reappraiseBy) return 0;
        return (r.appraisedPaise * (BPS - haircutBps[r.assetClass])) / BPS;
    }

    function receiptOf(uint256 tokenId) external view returns (Receipt memory) {
        return _receiptOf(tokenId);
    }

    function bankOf(bytes32 bankId) external view returns (Bank memory) {
        return _bank(bankId);
    }

    function bankOperatorOf(uint256 tokenId) external view returns (address) {
        return _banks[_receiptOf(tokenId).bankId].operator;
    }

    function hashAttestation(PledgeAttestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.bankId,
                    a.holder,
                    a.receiptRef,
                    a.assetClass,
                    a.assetIdHash,
                    a.detailsHash,
                    a.appraisedPaise,
                    a.appraisedAt,
                    a.reappraiseBy,
                    a.nonce,
                    a.expiry
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------------ internals
    function _bank(bytes32 bankId) internal view returns (Bank storage b) {
        b = _banks[bankId];
        if (!b.exists) revert PledgeUnknownBank(bankId);
    }

    function _receiptOf(uint256 tokenId) internal view returns (Receipt storage r) {
        _requireOwned(tokenId);
        r = _receipts[tokenId];
    }
}
