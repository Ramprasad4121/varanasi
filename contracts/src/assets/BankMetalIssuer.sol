// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "openzeppelin-contracts/contracts/utils/cryptography/SignatureChecker.sol";
import {MetalToken} from "./MetalToken.sol";
import {MetalCertificateRegistry} from "./MetalCertificateRegistry.sol";
import {IMetalPriceFeed} from "./IMetalPriceFeed.sol";
import {ERC2771Context} from "openzeppelin-contracts/contracts/metatx/ERC2771Context.sol";
import {Context} from "openzeppelin-contracts/contracts/utils/Context.sol";

/// @title BankMetalIssuer: mints one metal's token against bank-signed deposit attestations.
/// @notice Generalisation of BankGoldIssuer for silver, platinum and any other fungible
///         precious metal. One issuer per metal: its own token, its own certificate
///         registry, its own EIP-712 domain (so a silver attestation can never mint
///         gold), its own reserve invariant and its own pause switch. Gold keeps its
///         original, already reviewed BankGoldIssuer; AssetRegistry lists both.
/// @author Ramprasad
/// @notice Flow: a user deposits metal at a partner bank, the bank assays it and signs
///         an EIP-712 BankAttestation (certificate id, milligrams of fine metal, purity).
///         Anyone relays it here; the issuer checks the bank signature and mints
///         1 metal tokens per gram of fine metal to the depositor. Any holder can later burn
///         metal tokens into a redemption request that the bank fulfils (metal released) or
///         cancels (tokens re-minted).
/// @dev Trust model: the bank is trusted for custody and assay. The chain enforces:
///      every certificate mints once, only a registered bank signer can create supply,
///      and per bank: liability + pending redemptions == attested grams, so
///      metal tokens totalSupply <= sum of bank-attested outstanding grams at all times.
///      Units: all accounting is in milligrams of fine metal ("Milli"); rupee
///      values are in paise and come from a display-only price feed.
///      Gasless: mint and reserve reports are relayable by anyone; redemption,
///      reclaim and bank actions also work through the trusted ERC-2771 forwarder.
contract BankMetalIssuer is Ownable, Pausable, ReentrancyGuard, EIP712, ERC2771Context {
    // ------------------------------------------------------------------ errors
    error MetalUnknownBank(bytes32 bankId);
    error MetalBankExists(bytes32 bankId);
    error MetalBankPaused(bytes32 bankId);
    error MetalReserveShortfall(bytes32 bankId);
    error MetalZeroAddress();
    error MetalZeroAmount();
    error MetalBadPurity(uint256 purityPermille);
    error MetalAmountTooLarge();
    error MetalExpired(uint256 expiry);
    error MetalNonceUsed(bytes32 bankId, uint256 nonce);
    error MetalBadSignature();
    error MetalNotBankOperator(bytes32 bankId, address caller);
    error MetalExceedsLiability(bytes32 bankId, uint256 requested, uint256 liability);
    error MetalRedemptionNotPending(uint256 id);
    error MetalRedemptionNotTimedOut(uint256 id, uint256 availableAt);
    error MetalNotRedeemer(uint256 id, address caller);
    error MetalDisputeCoverage(bytes32 bankId);
    error MetalWrongBank(bytes32 certificateId, bytes32 bankId);
    error MetalStaleReport(uint256 seq, uint256 lastSeq);
    error MetalReportInFuture(uint256 asOf);
    error MetalBankCapReached(bytes32 bankId, uint256 attestedAfter, uint256 cap);

    // ------------------------------------------------------------------ events
    event BankAdded(bytes32 indexed bankId, string name, address signer, address operator);
    event BankSignerSet(bytes32 indexed bankId, address signer);
    event BankOperatorSet(bytes32 indexed bankId, address operator);
    event BankPaused(bytes32 indexed bankId, address by);
    event BankUnpaused(bytes32 indexed bankId);
    event BankMintCapSet(bytes32 indexed bankId, uint256 capMilli);
    event MetalMinted(
        bytes32 indexed bankId,
        bytes32 indexed certificateId,
        address indexed user,
        uint256 fineMilli,
        uint256 purityPermille
    );
    event AttestationRevoked(bytes32 indexed bankId, bytes32 indexed certificateId);
    event NonceInvalidated(bytes32 indexed bankId, uint256 nonce);
    event RedemptionRequested(
        uint256 indexed id, bytes32 indexed bankId, address indexed holder, uint256 amountMilli, bytes32 deliveryRef
    );
    event RedemptionFulfilled(
        uint256 indexed id, bytes32 indexed bankId, address indexed holder, uint256 amountMilli, bytes32 releaseRef
    );
    event RedemptionCancelled(
        uint256 indexed id, bytes32 indexed bankId, address indexed holder, uint256 amountMilli, bytes32 reason
    );
    event PriceFeedSet(address feed);
    event CertificateDisputed(bytes32 indexed certificateId, bytes32 indexed bankId, uint256 fineMilli, bytes32 reason);
    event DisputeCleared(bytes32 indexed certificateId, bytes32 indexed bankId);
    event CertificateWrittenOff(bytes32 indexed certificateId, bytes32 indexed bankId, uint256 fineMilli);
    event ReserveReported(bytes32 indexed bankId, uint256 seq, uint256 reservesMilli, uint256 asOf, bool shortfall);

    // ------------------------------------------------------------------ types
    /// @notice What a bank signs after a metal deposit is assayed.
    struct BankAttestation {
        bytes32 bankId; // registered bank (custodian) id
        address user; // depositor who receives metal tokens
        bytes32 certificateId; // bank deposit certificate, single use
        uint256 fineGramsMilli; // milligrams of FINE metal (after assay)
        uint256 purityPermille; // assayed fineness, e.g. 995
        uint256 nonce; // per bank, single use
        uint256 expiry; // unix seconds; attestation unusable after
    }

    /// @notice Periodic bank-signed statement of fine metal held for metal tokens.
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
        uint256 attestedMilli; // fine metal bank holds for metal tokens (minted - released - written off)
        uint256 disputedMilli; // subset of attested under dispute
        uint256 liabilityMilli; // metal tokens outstanding attributed to this bank
        uint256 pendingMilli; // burned into redemption, metal not yet released
        uint256 reportedReserveMilli;
        uint256 reportAsOf;
        uint256 reportSeq;
    }

    /// @notice One bank's reserve, in words an app can show as is.
    struct BankReserveView {
        bytes32 bankId;
        string name;
        uint256 metalHeldMilli; // fine metal the bank attests it holds for metal tokens
        uint256 metalOwedToHoldersMilli; // metal tokens in people's wallets for this bank
        uint256 awaitingReleaseMilli; // redemptions burned, metal not yet handed over
        uint256 underDisputeMilli;
        bool fullyBacked; // owed + awaiting + disputed <= held
        bool newDepositsPaused; // dispute, bank request, or short reserve report
        uint256 lastReportMilli; // bank's last signed reserve report
        uint256 lastReportAt;
        uint256 metalHeldValuePaise; // display only, 0 if no price feed
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
    MetalToken public immutable token;
    /// @notice Short code of the metal this issuer handles ("XAG", "XPT").
    bytes32 public immutable metalCode;
    /// @notice Lowest assayed fineness accepted, in parts per thousand.
    uint16 public immutable minPurityPermille;
    MetalCertificateRegistry public immutable registry;

    mapping(bytes32 => Bank) internal _banks;
    bytes32[] public bankIds;
    mapping(bytes32 => mapping(uint256 => bool)) public nonceUsed;
    mapping(uint256 => Redemption) public redemptions;
    uint256 public redemptionCount;

    uint256 public totalAttestedMilli;
    uint256 public totalDisputedMilli;
    uint256 public totalPendingMilli;

    IMetalPriceFeed public priceFeed; // display only
    mapping(address => uint256[]) internal _redemptionsOf;
    /// @notice Most fine metal (mg) each bank may have attested at once. 0 = no cap.
    ///         Bounds the damage of a leaked bank signing key to the cap.
    mapping(bytes32 => uint256) public bankMintCapMilli;

    /// @param forwarder Trusted ERC-2771 forwarder for gasless user actions (address(0) = none).
    /// @param metalCode_ short code of the metal, e.g. "XAG" for silver, "XPT" for platinum
    /// @param domainName_ EIP-712 domain name, unique per metal, e.g. "Varanasi Silver"
    /// @param minPurityPermille_ lowest fineness the bank may attest, e.g. 999 for silver bars
    constructor(
        address admin,
        address metalToken,
        address metalRegistry,
        address forwarder,
        bytes32 metalCode_,
        string memory domainName_,
        uint16 minPurityPermille_
    ) Ownable(admin) EIP712(domainName_, "1") ERC2771Context(forwarder) {
        if (metalToken == address(0) || metalRegistry == address(0)) {
            revert MetalZeroAddress();
        }
        if (minPurityPermille_ == 0 || minPurityPermille_ > 1000) revert MetalBadPurity(minPurityPermille_);
        metalCode = metalCode_;
        minPurityPermille = minPurityPermille_;
        token = MetalToken(metalToken);
        registry = MetalCertificateRegistry(metalRegistry);
    }

    // ------------------------------------------------------------------ modifiers
    modifier onlyOperatorOrOwner(bytes32 bankId) {
        Bank storage b = _bank(bankId);
        if (_msgSender() != b.operator && _msgSender() != owner()) revert MetalNotBankOperator(bankId, _msgSender());
        _;
    }

    // ------------------------------------------------------------------ governance
    function addBank(bytes32 bankId, string calldata name, address signer, address operator) external onlyOwner {
        if (_banks[bankId].exists) revert MetalBankExists(bankId);
        if (signer == address(0) || operator == address(0)) revert MetalZeroAddress();
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
        if (signer == address(0)) revert MetalZeroAddress();
        _bank(bankId).signer = signer;
        emit BankSignerSet(bankId, signer);
    }

    /// @notice Owner sets a bank's attested metal ceiling in fine milligrams (0 = none).
    ///         Lowering it below what is already attested only stops new deposits.
    function setBankMintCap(bytes32 bankId, uint256 capMilli) external onlyOwner {
        _bank(bankId);
        bankMintCapMilli[bankId] = capMilli;
        emit BankMintCapSet(bankId, capMilli);
    }

    function setBankOperator(bytes32 bankId, address operator) external onlyOwner {
        if (operator == address(0)) revert MetalZeroAddress();
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

    /// @notice Set the display-only rupee price feed (address(0) to remove).
    function setPriceFeed(address feed) external onlyOwner {
        priceFeed = IMetalPriceFeed(feed);
        emit PriceFeedSet(feed);
    }

    /// @notice Halt minting for one bank. The bank or governance may pause.
    function pauseBank(bytes32 bankId) external onlyOperatorOrOwner(bankId) {
        _banks[bankId].paused = true;
        emit BankPaused(bankId, _msgSender());
    }

    /// @notice Only governance can resume a bank (after a dispute is settled).
    function unpauseBank(bytes32 bankId) external onlyOwner {
        Bank storage b = _bank(bankId);
        b.paused = false;
        emit BankUnpaused(bankId);
    }

    // ------------------------------------------------------------------ mint
    /// @notice Mint metal tokens for a bank-signed deposit attestation. Anyone may relay;
    ///         tokens always go to `a.user`.
    function mint(BankAttestation calldata a, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 units)
    {
        Bank storage b = _bank(a.bankId);
        if (b.paused) revert MetalBankPaused(a.bankId);
        if (b.reportShortfall) revert MetalReserveShortfall(a.bankId);
        if (a.user == address(0)) revert MetalZeroAddress();
        if (a.fineGramsMilli == 0) revert MetalZeroAmount();
        if (a.fineGramsMilli > MAX_MINT_MILLI) revert MetalAmountTooLarge();
        if (a.purityPermille < minPurityPermille || a.purityPermille > 1000) revert MetalBadPurity(a.purityPermille);
        if (block.timestamp > a.expiry) revert MetalExpired(a.expiry);
        if (nonceUsed[a.bankId][a.nonce]) revert MetalNonceUsed(a.bankId, a.nonce);
        if (!SignatureChecker.isValidSignatureNow(b.signer, hashAttestation(a), signature)) revert MetalBadSignature();

        uint256 cap = bankMintCapMilli[a.bankId];
        if (cap != 0 && b.attestedMilli + a.fineGramsMilli > cap) {
            revert MetalBankCapReached(a.bankId, b.attestedMilli + a.fineGramsMilli, cap);
        }

        nonceUsed[a.bankId][a.nonce] = true;
        // reverts unless the certificate is fresh (NONE): single use forever
        registry.recordMint(a.certificateId, a.bankId, a.user, uint64(a.fineGramsMilli), uint16(a.purityPermille));
        b.attestedMilli += a.fineGramsMilli;
        b.liabilityMilli += a.fineGramsMilli;
        totalAttestedMilli += a.fineGramsMilli;

        units = a.fineGramsMilli * UNITS_PER_MILLIGRAM;
        token.mint(a.user, units);
        emit MetalMinted(a.bankId, a.certificateId, a.user, a.fineGramsMilli, a.purityPermille);
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
    /// @notice Any holder burns metal tokens into a physical redemption at `bankId`.
    /// @param deliveryRef Off-chain pointer (branch code, KYC ticket hash). Never PII.
    function requestRedemption(bytes32 bankId, uint256 amountMilli, bytes32 deliveryRef)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 id)
    {
        Bank storage b = _bank(bankId);
        if (amountMilli == 0) revert MetalZeroAmount();
        if (amountMilli > b.liabilityMilli) revert MetalExceedsLiability(bankId, amountMilli, b.liabilityMilli);

        token.burn(_msgSender(), amountMilli * UNITS_PER_MILLIGRAM); // reverts on low balance
        b.liabilityMilli -= amountMilli;
        b.pendingMilli += amountMilli;
        totalPendingMilli += amountMilli;

        id = ++redemptionCount;
        redemptions[id] = Redemption({
            bankId: bankId,
            holder: _msgSender(),
            amountMilli: amountMilli,
            deliveryRef: deliveryRef,
            requestedAt: uint64(block.timestamp),
            status: RedemptionStatus.PENDING
        });
        _redemptionsOf[_msgSender()].push(id);
        emit RedemptionRequested(id, bankId, _msgSender(), amountMilli, deliveryRef);
    }

    /// @notice Bank confirms it released the metal. Reduces attested reserves.
    function fulfilRedemption(uint256 id, bytes32 releaseRef) external nonReentrant {
        Redemption storage r = _pending(id);
        Bank storage b = _banks[r.bankId];
        if (_msgSender() != b.operator) revert MetalNotBankOperator(r.bankId, _msgSender());
        uint256 amt = r.amountMilli;
        // released metal cannot eat into grams that are under dispute
        if (b.attestedMilli - amt < b.disputedMilli) revert MetalDisputeCoverage(r.bankId);

        r.status = RedemptionStatus.FULFILLED;
        b.pendingMilli -= amt;
        b.attestedMilli -= amt;
        totalPendingMilli -= amt;
        totalAttestedMilli -= amt;
        emit RedemptionFulfilled(id, r.bankId, r.holder, amt, releaseRef);
    }

    /// @notice Bank rejects a request (KYC failed, below bar size...): tokens re-minted.
    function cancelRedemption(uint256 id, bytes32 reason) external nonReentrant {
        Redemption storage r = _pending(id);
        if (_msgSender() != _banks[r.bankId].operator) revert MetalNotBankOperator(r.bankId, _msgSender());
        _cancel(id, r, reason);
    }

    /// @notice Holder takes tokens back if the bank ignored the request for 30 days.
    function reclaimRedemption(uint256 id) external nonReentrant {
        Redemption storage r = _pending(id);
        if (_msgSender() != r.holder) revert MetalNotRedeemer(id, _msgSender());
        uint256 at = uint256(r.requestedAt) + REDEMPTION_TIMEOUT;
        if (block.timestamp < at) revert MetalRedemptionNotTimedOut(id, at);
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
        emit RedemptionCancelled(id, r.bankId, r.holder, amt, reason);
    }

    // ------------------------------------------------------------------ disputes
    /// @notice Flag a minted certificate (assay fraud, deposit reversed, court order).
    ///         Pauses minting at that bank. Holder balances are never touched.
    function disputeCertificate(bytes32 certificateId, bytes32 reason) external {
        MetalCertificateRegistry.Certificate memory c = registry.certificateOf(certificateId);
        Bank storage b = _bank(c.bankId);
        if (_msgSender() != b.operator && _msgSender() != owner()) revert MetalNotBankOperator(c.bankId, _msgSender());
        // grams already released through pooled redemptions cannot be disputed
        if (b.attestedMilli - b.disputedMilli < c.fineMilli) revert MetalDisputeCoverage(c.bankId);
        registry.setStatus(certificateId, MetalCertificateRegistry.Status.DISPUTED); // must be MINTED
        b.disputedMilli += c.fineMilli;
        totalDisputedMilli += c.fineMilli;
        b.paused = true;
        emit CertificateDisputed(certificateId, c.bankId, c.fineMilli, reason);
        emit BankPaused(c.bankId, _msgSender());
    }

    /// @notice Governance confirms the metal is in custody after all.
    function clearDispute(bytes32 certificateId) external onlyOwner {
        MetalCertificateRegistry.Certificate memory c = registry.certificateOf(certificateId);
        registry.setStatus(certificateId, MetalCertificateRegistry.Status.MINTED);
        _banks[c.bankId].disputedMilli -= c.fineMilli;
        totalDisputedMilli -= c.fineMilli;
        emit DisputeCleared(certificateId, c.bankId);
    }

    /// @notice Dispute upheld: the bank makes holders whole by burning the same
    ///         amount of metal tokens from its OWN balance (bought back on market), then
    ///         the missing grams leave the reserve. Nobody else's tokens burn.
    function writeOffCertificate(bytes32 certificateId) external nonReentrant {
        MetalCertificateRegistry.Certificate memory c = registry.certificateOf(certificateId);
        Bank storage b = _bank(c.bankId);
        if (_msgSender() != b.operator) revert MetalNotBankOperator(c.bankId, _msgSender());
        uint256 amt = c.fineMilli;
        if (amt > b.liabilityMilli) revert MetalExceedsLiability(c.bankId, amt, b.liabilityMilli);
        registry.setStatus(certificateId, MetalCertificateRegistry.Status.WRITTEN_OFF); // must be DISPUTED
        token.burn(_msgSender(), amt * UNITS_PER_MILLIGRAM);
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
        if (r.seq <= b.reportSeq) revert MetalStaleReport(r.seq, b.reportSeq);
        if (r.asOf > block.timestamp) revert MetalReportInFuture(r.asOf);
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(RESERVE_TYPEHASH, r.bankId, r.reservesMilli, r.asOf, r.seq)));
        if (!SignatureChecker.isValidSignatureNow(b.signer, digest, signature)) revert MetalBadSignature();
        bool shortfall = r.reservesMilli < b.attestedMilli;
        b.reportSeq = r.seq;
        b.reportedReserveMilli = r.reservesMilli;
        b.reportAsOf = r.asOf;
        b.reportShortfall = shortfall;
        emit ReserveReported(r.bankId, r.seq, r.reservesMilli, r.asOf, shortfall);
    }

    /// @notice Global proof of reserve, all in milligrams of fine metal.
    /// @return supplyMilli metal tokens outstanding (totalSupply / 1e15)
    /// @return attestedMilli fine metal banks attest they hold for metal tokens
    /// @return pendingMilli burned into redemptions, metal not yet released
    /// @return disputedMilli attested grams under dispute
    /// @return fullyBacked supply <= attested - disputed - pending
    function proofOfReserve()
        external
        view
        returns (
            uint256 supplyMilli,
            uint256 attestedMilli,
            uint256 pendingMilli,
            uint256 disputedMilli,
            bool fullyBacked
        )
    {
        supplyMilli = token.totalSupply() / UNITS_PER_MILLIGRAM;
        attestedMilli = totalAttestedMilli;
        pendingMilli = totalPendingMilli;
        disputedMilli = totalDisputedMilli;
        fullyBacked = supplyMilli + pendingMilli + disputedMilli <= attestedMilli;
    }

    // ------------------------------------------------------------------ app views
    /// @notice "My metal": milligrams held and their rupee value (display only).
    /// @return milligrams fine metal in the wallet (9950 = 9.950 g)
    /// @return valuePaise rupee value in paise, 0 if no price feed
    /// @return priceAsOf time of the price used, 0 if no price feed
    function myMetal(address holder) external view returns (uint256 milligrams, uint256 valuePaise, uint256 priceAsOf) {
        milligrams = token.balanceOf(holder) / UNITS_PER_MILLIGRAM;
        (valuePaise, priceAsOf) = _valuePaise(milligrams);
    }

    /// @notice Every redemption a holder ever asked for, newest last, with status.
    function redemptionsOf(address holder) external view returns (uint256[] memory ids, Redemption[] memory list) {
        ids = _redemptionsOf[holder];
        list = new Redemption[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            list[i] = redemptions[ids[i]];
        }
    }

    /// @notice Proof of reserve for one bank, app friendly.
    function bankReserve(bytes32 bankId) public view returns (BankReserveView memory v) {
        Bank storage b = _bank(bankId);
        v.bankId = bankId;
        v.name = b.name;
        v.metalHeldMilli = b.attestedMilli;
        v.metalOwedToHoldersMilli = b.liabilityMilli;
        v.awaitingReleaseMilli = b.pendingMilli;
        v.underDisputeMilli = b.disputedMilli;
        v.fullyBacked = b.liabilityMilli + b.pendingMilli + b.disputedMilli <= b.attestedMilli;
        v.newDepositsPaused = b.paused || b.reportShortfall || paused();
        v.lastReportMilli = b.reportedReserveMilli;
        v.lastReportAt = b.reportAsOf;
        (v.metalHeldValuePaise,) = _valuePaise(b.attestedMilli);
    }

    /// @notice Proof of reserve for every bank (small list; one call for the app).
    function allBankReserves() external view returns (BankReserveView[] memory list) {
        list = new BankReserveView[](bankIds.length);
        for (uint256 i; i < bankIds.length; ++i) {
            list[i] = bankReserve(bankIds[i]);
        }
    }

    function _valuePaise(uint256 milli) internal view returns (uint256 paise, uint256 asOf) {
        if (address(priceFeed) == address(0)) return (0, 0);
        uint256 perGram;
        (perGram, asOf) = priceFeed.pricePaisePerGram();
        paise = (milli * perGram) / 1000;
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
        if (!b.exists) revert MetalUnknownBank(bankId);
    }

    // ERC-2771: the signer of a forwarded request is the sender, not the relayer
    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    function _pending(uint256 id) internal view returns (Redemption storage r) {
        r = redemptions[id];
        if (r.status != RedemptionStatus.PENDING) revert MetalRedemptionNotPending(id);
    }
}
