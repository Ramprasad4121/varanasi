// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "openzeppelin-contracts/contracts/utils/cryptography/SignatureChecker.sol";
import {GoldToken} from "./GoldToken.sol";
import {GoldRegistry} from "./GoldRegistry.sol";

/// @title BankGoldIssuer: mints vGOLD against bank-signed gold deposit attestations.
/// @author Ramprasad
/// @notice Flow: a user deposits gold at a partner bank, the bank assays it and signs
///         an EIP-712 BankAttestation (certificate id, milligrams of fine gold, purity).
///         Anyone relays it here; the issuer checks the bank signature and mints
///         1 vGOLD per gram of fine gold to the depositor. Any holder can later burn
///         vGOLD into a redemption request that the bank fulfils (gold released) or
///         cancels (tokens re-minted).
/// @dev Trust model: the bank is trusted for custody and assay. The chain enforces:
///      every certificate mints once, only a registered bank signer can create supply,
///      and per bank: liability + pending redemptions == attested grams, so
///      vGOLD totalSupply <= sum of bank-attested outstanding grams at all times.
///      Units: all accounting is in milligrams of fine gold ("Milli").
contract BankGoldIssuer is Ownable, Pausable, ReentrancyGuard, EIP712 {
    // ------------------------------------------------------------------ errors
    error GoldUnknownBank(bytes32 bankId);
    error GoldBankExists(bytes32 bankId);
    error GoldBankPaused(bytes32 bankId);
    error GoldReserveShortfall(bytes32 bankId);
    error GoldZeroAddress();
    error GoldZeroAmount();
    error GoldBadPurity(uint256 purityPermille);
    error GoldAmountTooLarge();
    error GoldExpired(uint256 expiry);
    error GoldNonceUsed(bytes32 bankId, uint256 nonce);
    error GoldBadSignature();
    error GoldNotBankOperator(bytes32 bankId, address caller);
    error GoldExceedsLiability(bytes32 bankId, uint256 requested, uint256 liability);
    error GoldRedemptionNotPending(uint256 id);
    error GoldRedemptionNotTimedOut(uint256 id, uint256 availableAt);
    error GoldNotRedeemer(uint256 id, address caller);
    error GoldDisputeCoverage(bytes32 bankId);
    error GoldWrongBank(bytes32 certificateId, bytes32 bankId);
    error GoldStaleReport(uint256 seq, uint256 lastSeq);
    error GoldReportInFuture(uint256 asOf);

    // ------------------------------------------------------------------ events
    event BankAdded(bytes32 indexed bankId, string name, address signer, address operator);
    event BankSignerSet(bytes32 indexed bankId, address signer);
    event BankOperatorSet(bytes32 indexed bankId, address operator);
    event BankPaused(bytes32 indexed bankId, address by);
    event BankUnpaused(bytes32 indexed bankId);
    event GoldMinted(
        bytes32 indexed bankId, bytes32 indexed certificateId, address indexed user, uint256 fineMilli, uint256 purityPermille
    );
    event AttestationRevoked(bytes32 indexed bankId, bytes32 indexed certificateId);
    event NonceInvalidated(bytes32 indexed bankId, uint256 nonce);
    event RedemptionRequested(
        uint256 indexed id, bytes32 indexed bankId, address indexed holder, uint256 amountMilli, bytes32 deliveryRef
    );
    event RedemptionFulfilled(uint256 indexed id, bytes32 indexed bankId, uint256 amountMilli, bytes32 releaseRef);
    event RedemptionCancelled(uint256 indexed id, bytes32 indexed bankId, uint256 amountMilli, bytes32 reason);
    event CertificateDisputed(bytes32 indexed certificateId, bytes32 indexed bankId, uint256 fineMilli, bytes32 reason);
    event DisputeCleared(bytes32 indexed certificateId, bytes32 indexed bankId);
    event CertificateWrittenOff(bytes32 indexed certificateId, bytes32 indexed bankId, uint256 fineMilli);
    event ReserveReported(bytes32 indexed bankId, uint256 seq, uint256 reservesMilli, uint256 asOf, bool shortfall);

    // ------------------------------------------------------------------ types
    /// @notice What a bank signs after a gold deposit is assayed.
    struct BankAttestation {
        bytes32 bankId; // registered bank (custodian) id
        address user; // depositor who receives vGOLD
        bytes32 certificateId; // bank deposit certificate, single use
        uint256 fineGramsMilli; // milligrams of FINE gold (after assay)
        uint256 purityPermille; // assayed fineness, e.g. 995
        uint256 nonce; // per bank, single use
        uint256 expiry; // unix seconds; attestation unusable after
    }

    /// @notice Periodic bank-signed statement of fine gold held for vGOLD.
    struct ReserveReport {
        bytes32 bankId;
        uint256 reservesMilli;
        uint256 asOf;
        uint256 seq; // strictly increasing per bank
    }

    struct Bank {
        string name;
        address signer; // EOA or ERC-1271 contract (bank HSM / multisig)
        address operator; // submits fulfil / cancel / dispute txs
        bool exists;
        bool paused; // minting halted (dispute or bank request)
        bool reportShortfall; // last signed reserve report < attested
        uint256 attestedMilli; // fine gold bank holds for vGOLD (minted - released - written off)
        uint256 disputedMilli; // subset of attested under dispute
        uint256 liabilityMilli; // vGOLD outstanding attributed to this bank
        uint256 pendingMilli; // burned into redemption, gold not yet released
        uint256 reportedReserveMilli;
        uint256 reportAsOf;
        uint256 reportSeq;
    }

    enum RedemptionStatus {
        NONE,
        PENDING,
        FULFILLED,
        CANCELLED
    }

    struct Redemption {
        bytes32 bankId;
        address holder;
        uint256 amountMilli;
        bytes32 deliveryRef; // off-chain reference: branch, KYC ticket, delivery address hash
        uint64 requestedAt;
        RedemptionStatus status;
    }

    // ------------------------------------------------------------------ constants
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "BankAttestation(bytes32 bankId,address user,bytes32 certificateId,uint256 fineGramsMilli,uint256 purityPermille,uint256 nonce,uint256 expiry)"
    );
    bytes32 public constant RESERVE_TYPEHASH =
        keccak256("ReserveReport(bytes32 bankId,uint256 reservesMilli,uint256 asOf,uint256 seq)");
    uint256 public constant UNITS_PER_MILLIGRAM = 1e15;
    uint256 public constant MAX_MINT_MILLI = 1e12; // 1,000 tonnes per certificate: sanity bound
    uint256 public constant REDEMPTION_TIMEOUT = 30 days;

    // ------------------------------------------------------------------ storage
    GoldToken public immutable token;
    GoldRegistry public immutable registry;

    mapping(bytes32 => Bank) internal _banks;
    bytes32[] public bankIds;
    mapping(bytes32 => mapping(uint256 => bool)) public nonceUsed;
    mapping(uint256 => Redemption) public redemptions;
    uint256 public redemptionCount;

    uint256 public totalAttestedMilli;
    uint256 public totalDisputedMilli;
    uint256 public totalPendingMilli;

    constructor(address admin, address goldToken, address goldRegistry)
        Ownable(admin)
        EIP712("Varanasi Gold", "1")
    {
        if (goldToken == address(0) || goldRegistry == address(0)) revert GoldZeroAddress();
        token = GoldToken(goldToken);
        registry = GoldRegistry(goldRegistry);
    }

    // ------------------------------------------------------------------ modifiers
    modifier onlyOperatorOrOwner(bytes32 bankId) {
        Bank storage b = _bank(bankId);
        if (msg.sender != b.operator && msg.sender != owner()) revert GoldNotBankOperator(bankId, msg.sender);
        _;
    }

    // ------------------------------------------------------------------ governance
    function addBank(bytes32 bankId, string calldata name, address signer, address operator) external onlyOwner {
        if (_banks[bankId].exists) revert GoldBankExists(bankId);
        if (signer == address(0) || operator == address(0)) revert GoldZeroAddress();
        Bank storage b = _banks[bankId];
        b.name = name;
        b.signer = signer;
        b.operator = operator;
        b.exists = true;
        bankIds.push(bankId);
        emit BankAdded(bankId, name, signer, operator);
    }

    /// @notice Rotate a bank's signing key. Unminted attestations by the old key die.
    function setBankSigner(bytes32 bankId, address signer) external onlyOwner {
        if (signer == address(0)) revert GoldZeroAddress();
        _bank(bankId).signer = signer;
        emit BankSignerSet(bankId, signer);
    }

    function setBankOperator(bytes32 bankId, address operator) external onlyOwner {
        if (operator == address(0)) revert GoldZeroAddress();
        _bank(bankId).operator = operator;
        emit BankOperatorSet(bankId, operator);
    }

    /// @notice Global emergency stop: halts minting and new redemption requests.
    ///         Transfers, bank fulfil/cancel and holder reclaim keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Halt minting for one bank. The bank or governance may pause.
    function pauseBank(bytes32 bankId) external onlyOperatorOrOwner(bankId) {
        _banks[bankId].paused = true;
        emit BankPaused(bankId, msg.sender);
    }

    /// @notice Only governance can resume a bank (after a dispute is settled).
    function unpauseBank(bytes32 bankId) external onlyOwner {
        Bank storage b = _bank(bankId);
        b.paused = false;
        emit BankUnpaused(bankId);
    }

    // ------------------------------------------------------------------ mint
    /// @notice Mint vGOLD for a bank-signed deposit attestation. Anyone may relay;
    ///         tokens always go to `a.user`.
    function mint(BankAttestation calldata a, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 units)
    {
        Bank storage b = _bank(a.bankId);
        if (b.paused) revert GoldBankPaused(a.bankId);
        if (b.reportShortfall) revert GoldReserveShortfall(a.bankId);
        if (a.user == address(0)) revert GoldZeroAddress();
        if (a.fineGramsMilli == 0) revert GoldZeroAmount();
        if (a.fineGramsMilli > MAX_MINT_MILLI) revert GoldAmountTooLarge();
        if (a.purityPermille == 0 || a.purityPermille > 1000) revert GoldBadPurity(a.purityPermille);
        if (block.timestamp > a.expiry) revert GoldExpired(a.expiry);
        if (nonceUsed[a.bankId][a.nonce]) revert GoldNonceUsed(a.bankId, a.nonce);
        if (!SignatureChecker.isValidSignatureNow(b.signer, hashAttestation(a), signature)) revert GoldBadSignature();

        nonceUsed[a.bankId][a.nonce] = true;
        // reverts unless the certificate is fresh (NONE): single use forever
        registry.recordMint(
            a.certificateId, a.bankId, a.user, uint64(a.fineGramsMilli), uint16(a.purityPermille)
        );
        b.attestedMilli += a.fineGramsMilli;
        b.liabilityMilli += a.fineGramsMilli;
        totalAttestedMilli += a.fineGramsMilli;

        units = a.fineGramsMilli * UNITS_PER_MILLIGRAM;
        token.mint(a.user, units);
        emit GoldMinted(a.bankId, a.certificateId, a.user, a.fineGramsMilli, a.purityPermille);
    }

    /// @notice Bank cancels a signed attestation that has not been minted yet.
    function revokeAttestation(bytes32 bankId, bytes32 certificateId) external onlyOperatorOrOwner(bankId) {
        registry.recordRevoke(certificateId, bankId);
        emit AttestationRevoked(bankId, certificateId);
    }

    /// @notice Bank burns a nonce so any attestation signed with it is dead.
    function invalidateNonce(bytes32 bankId, uint256 nonce) external onlyOperatorOrOwner(bankId) {
        nonceUsed[bankId][nonce] = true;
        emit NonceInvalidated(bankId, nonce);
    }

    // ------------------------------------------------------------------ redemption
    /// @notice Any holder burns vGOLD into a physical redemption at `bankId`.
    /// @param deliveryRef Off-chain pointer (branch code, KYC ticket hash). Never PII.
    function requestRedemption(bytes32 bankId, uint256 amountMilli, bytes32 deliveryRef)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 id)
    {
        Bank storage b = _bank(bankId);
        if (amountMilli == 0) revert GoldZeroAmount();
        if (amountMilli > b.liabilityMilli) revert GoldExceedsLiability(bankId, amountMilli, b.liabilityMilli);

        token.burn(msg.sender, amountMilli * UNITS_PER_MILLIGRAM); // reverts on low balance
        b.liabilityMilli -= amountMilli;
        b.pendingMilli += amountMilli;
        totalPendingMilli += amountMilli;

        id = ++redemptionCount;
        redemptions[id] = Redemption({
            bankId: bankId,
            holder: msg.sender,
            amountMilli: amountMilli,
            deliveryRef: deliveryRef,
            requestedAt: uint64(block.timestamp),
            status: RedemptionStatus.PENDING
        });
        emit RedemptionRequested(id, bankId, msg.sender, amountMilli, deliveryRef);
    }

    /// @notice Bank confirms it released the gold. Reduces attested reserves.
    function fulfilRedemption(uint256 id, bytes32 releaseRef) external nonReentrant {
        Redemption storage r = _pending(id);
        Bank storage b = _banks[r.bankId];
        if (msg.sender != b.operator) revert GoldNotBankOperator(r.bankId, msg.sender);
        uint256 amt = r.amountMilli;
        // released gold cannot eat into grams that are under dispute
        if (b.attestedMilli - amt < b.disputedMilli) revert GoldDisputeCoverage(r.bankId);

        r.status = RedemptionStatus.FULFILLED;
        b.pendingMilli -= amt;
        b.attestedMilli -= amt;
        totalPendingMilli -= amt;
        totalAttestedMilli -= amt;
        emit RedemptionFulfilled(id, r.bankId, amt, releaseRef);
    }

    /// @notice Bank rejects a request (KYC failed, below bar size...): tokens re-minted.
    function cancelRedemption(uint256 id, bytes32 reason) external nonReentrant {
        Redemption storage r = _pending(id);
        if (msg.sender != _banks[r.bankId].operator) revert GoldNotBankOperator(r.bankId, msg.sender);
        _cancel(id, r, reason);
    }

    /// @notice Holder takes tokens back if the bank ignored the request for 30 days.
    function reclaimRedemption(uint256 id) external nonReentrant {
        Redemption storage r = _pending(id);
        if (msg.sender != r.holder) revert GoldNotRedeemer(id, msg.sender);
        uint256 at = uint256(r.requestedAt) + REDEMPTION_TIMEOUT;
        if (block.timestamp < at) revert GoldRedemptionNotTimedOut(id, at);
        _cancel(id, r, "TIMEOUT");
    }

    function _cancel(uint256 id, Redemption storage r, bytes32 reason) internal {
        Bank storage b = _banks[r.bankId];
        uint256 amt = r.amountMilli;
        r.status = RedemptionStatus.CANCELLED;
        b.pendingMilli -= amt;
        b.liabilityMilli += amt;
        totalPendingMilli -= amt;
        token.mint(r.holder, amt * UNITS_PER_MILLIGRAM);
        emit RedemptionCancelled(id, r.bankId, amt, reason);
    }

    // ------------------------------------------------------------------ disputes
    /// @notice Flag a minted certificate (assay fraud, deposit reversed, court order).
    ///         Pauses minting at that bank. Holder balances are never touched.
    function disputeCertificate(bytes32 certificateId, bytes32 reason) external {
        GoldRegistry.Certificate memory c = registry.certificateOf(certificateId);
        Bank storage b = _bank(c.bankId);
        if (msg.sender != b.operator && msg.sender != owner()) revert GoldNotBankOperator(c.bankId, msg.sender);
        // grams already released through pooled redemptions cannot be disputed
        if (b.attestedMilli - b.disputedMilli < c.fineMilli) revert GoldDisputeCoverage(c.bankId);
        registry.setStatus(certificateId, GoldRegistry.Status.DISPUTED); // must be MINTED
        b.disputedMilli += c.fineMilli;
        totalDisputedMilli += c.fineMilli;
        b.paused = true;
        emit CertificateDisputed(certificateId, c.bankId, c.fineMilli, reason);
        emit BankPaused(c.bankId, msg.sender);
    }

    /// @notice Governance confirms the gold is in custody after all.
    function clearDispute(bytes32 certificateId) external onlyOwner {
        GoldRegistry.Certificate memory c = registry.certificateOf(certificateId);
        registry.setStatus(certificateId, GoldRegistry.Status.MINTED);
        _banks[c.bankId].disputedMilli -= c.fineMilli;
        totalDisputedMilli -= c.fineMilli;
        emit DisputeCleared(certificateId, c.bankId);
    }

    /// @notice Dispute upheld: the bank makes holders whole by burning the same
    ///         amount of vGOLD from its OWN balance (bought back on market), then
    ///         the missing grams leave the reserve. Nobody else's tokens burn.
    function writeOffCertificate(bytes32 certificateId) external nonReentrant {
        GoldRegistry.Certificate memory c = registry.certificateOf(certificateId);
        Bank storage b = _bank(c.bankId);
        if (msg.sender != b.operator) revert GoldNotBankOperator(c.bankId, msg.sender);
        uint256 amt = c.fineMilli;
        if (amt > b.liabilityMilli) revert GoldExceedsLiability(c.bankId, amt, b.liabilityMilli);
        registry.setStatus(certificateId, GoldRegistry.Status.WRITTEN_OFF); // must be DISPUTED
        token.burn(msg.sender, amt * UNITS_PER_MILLIGRAM);
        b.liabilityMilli -= amt;
        b.attestedMilli -= amt;
        b.disputedMilli -= amt;
        totalAttestedMilli -= amt;
        totalDisputedMilli -= amt;
        emit CertificateWrittenOff(certificateId, c.bankId, amt);
    }

    // ------------------------------------------------------------------ proof of reserve
    /// @notice Relay a bank-signed reserve report. A report below what the bank
    ///         owes (liability + pending redemptions) halts minting at that bank
    ///         until a later report covers it.
    function submitReserveReport(ReserveReport calldata r, bytes calldata signature) external {
        Bank storage b = _bank(r.bankId);
        if (r.seq <= b.reportSeq) revert GoldStaleReport(r.seq, b.reportSeq);
        if (r.asOf > block.timestamp) revert GoldReportInFuture(r.asOf);
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RESERVE_TYPEHASH, r.bankId, r.reservesMilli, r.asOf, r.seq)));
        if (!SignatureChecker.isValidSignatureNow(b.signer, digest, signature)) revert GoldBadSignature();
        bool shortfall = r.reservesMilli < b.attestedMilli;
        b.reportSeq = r.seq;
        b.reportedReserveMilli = r.reservesMilli;
        b.reportAsOf = r.asOf;
        b.reportShortfall = shortfall;
        emit ReserveReported(r.bankId, r.seq, r.reservesMilli, r.asOf, shortfall);
    }

    /// @notice Global proof of reserve, all in milligrams of fine gold.
    /// @return supplyMilli vGOLD outstanding (totalSupply / 1e15)
    /// @return attestedMilli fine gold banks attest they hold for vGOLD
    /// @return pendingMilli burned into redemptions, gold not yet released
    /// @return disputedMilli attested grams under dispute
    /// @return fullyBacked supply <= attested - disputed - pending
    function proofOfReserve()
        external
        view
        returns (uint256 supplyMilli, uint256 attestedMilli, uint256 pendingMilli, uint256 disputedMilli, bool fullyBacked)
    {
        supplyMilli = token.totalSupply() / UNITS_PER_MILLIGRAM;
        attestedMilli = totalAttestedMilli;
        pendingMilli = totalPendingMilli;
        disputedMilli = totalDisputedMilli;
        fullyBacked = supplyMilli + pendingMilli + disputedMilli <= attestedMilli;
    }

    function bankOf(bytes32 bankId) external view returns (Bank memory) {
        return _banks[bankId];
    }

    function bankCount() external view returns (uint256) {
        return bankIds.length;
    }

    // ------------------------------------------------------------------ eip-712
    function hashAttestation(BankAttestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    a.bankId,
                    a.user,
                    a.certificateId,
                    a.fineGramsMilli,
                    a.purityPermille,
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
        if (!b.exists) revert GoldUnknownBank(bankId);
    }

    function _pending(uint256 id) internal view returns (Redemption storage r) {
        r = redemptions[id];
        if (r.status != RedemptionStatus.PENDING) revert GoldRedemptionNotPending(id);
    }
}
