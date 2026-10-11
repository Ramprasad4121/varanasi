// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {PledgeReceipt} from "./PledgeReceipt.sol";

/// @title PledgeLoan: borrow rupees from the lien-holding bank against a pledge receipt.
/// @author Ramprasad
/// @notice Same shape as the gold loan (lock, borrow, repay, or the bank takes the
///         collateral after the due date), with rules for unique items:
///         - the lender is always the bank that holds the lien on the item;
///         - the loan can be at most collateralValue * LTV for the asset class,
///           where collateralValue already has the class haircut taken off;
///         - the due date must fall before the item's re-appraisal date, so no loan
///           ever outlives the appraisal that sized it;
///         - a frozen receipt or one past re-appraisal cannot back a new loan.
///         Each bank funds its own lending pot; the contract never mixes pots.
/// @dev Demo money is MockRupee (1 unit = 1 paisa). No interest in the demo; a real
///      launch adds a bank-set rate. Solvency: the rupee balance of this contract
///      always equals the sum of all banks' free pots.
contract PledgeLoan is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error LoanZeroAmount();
    error LoanNotBank(bytes32 bankId, address caller);
    error LoanTooLarge(uint256 requested, uint256 maxPaise);
    error LoanBadTerm(uint64 dueAt, uint64 reappraiseBy);
    error LoanNoLiquidity(bytes32 bankId, uint256 requested, uint256 available);
    error LoanNotOpen(uint256 loanId);
    error LoanNotBorrower(uint256 loanId, address caller);
    error LoanNotDue(uint256 loanId, uint64 dueAt);
    error LoanBadLtv(uint256 bps);

    event Funded(bytes32 indexed bankId, address indexed by, uint256 paise);
    event Withdrawn(bytes32 indexed bankId, address indexed to, uint256 paise);
    event Borrowed(
        uint256 indexed loanId, uint256 indexed tokenId, address indexed borrower, uint256 paise, uint64 dueAt
    );
    event Repaid(uint256 indexed loanId, address indexed borrower, uint256 paise);
    event Defaulted(uint256 indexed loanId, uint256 indexed tokenId, address indexed bankOperator);
    event LtvSet(uint8 indexed assetClass, uint256 bps);

    enum Status {
        NONE,
        OPEN,
        REPAID,
        DEFAULTED
    }

    struct Loan {
        uint256 tokenId;
        bytes32 bankId;
        address borrower;
        uint256 principalPaise;
        uint64 openedAt;
        uint64 dueAt;
        Status status;
    }

    uint256 public constant BPS = 10_000;

    PledgeReceipt public immutable receipts;
    IERC20 public immutable rupee;

    /// @notice Free lending pot per bank, in paise.
    mapping(bytes32 => uint256) public liquidityOf;
    /// @notice Loan to value per asset class, on top of the haircut.
    uint256[5] public ltvBps;
    mapping(uint256 => Loan) public loans;
    uint256 public loanCount;
    uint256 public totalLiquidity;
    uint256 public totalOutstanding;

    constructor(address admin, address receipts_, address rupee_) Ownable(admin) {
        receipts = PledgeReceipt(receipts_);
        rupee = IERC20(rupee_);
        ltvBps[0] = 6000; // car
        ltvBps[1] = 5000; // two wheeler
        ltvBps[2] = 6000; // land document
        ltvBps[3] = 7500; // jewellery set (gold loans follow the RBI LTV table)
        ltvBps[4] = 4000; // other
    }

    function setLtv(uint8 assetClass, uint256 bps) external onlyOwner {
        if (assetClass >= 5 || bps > 9000) revert LoanBadLtv(bps);
        ltvBps[assetClass] = bps;
        emit LtvSet(assetClass, bps);
    }

    // ------------------------------------------------------------------ bank pot
    function fund(bytes32 bankId, uint256 paise) external nonReentrant {
        _onlyBank(bankId);
        if (paise == 0) revert LoanZeroAmount();
        liquidityOf[bankId] += paise;
        totalLiquidity += paise;
        rupee.safeTransferFrom(msg.sender, address(this), paise);
        emit Funded(bankId, msg.sender, paise);
    }

    function withdraw(bytes32 bankId, uint256 paise) external nonReentrant {
        _onlyBank(bankId);
        uint256 free = liquidityOf[bankId];
        if (paise > free) revert LoanNoLiquidity(bankId, paise, free);
        liquidityOf[bankId] = free - paise;
        totalLiquidity -= paise;
        rupee.safeTransfer(msg.sender, paise);
        emit Withdrawn(bankId, msg.sender, paise);
    }

    // ------------------------------------------------------------------ borrower
    /// @notice Most a holder can borrow against a receipt right now.
    function maxBorrowPaise(uint256 tokenId) public view returns (uint256) {
        PledgeReceipt.Receipt memory r = receipts.receiptOf(tokenId);
        return (receipts.collateralValuePaise(tokenId) * ltvBps[r.assetClass]) / BPS;
    }

    /// @notice Lock the receipt here (approve this contract first) and receive rupees.
    function borrow(uint256 tokenId, uint256 paise, uint64 dueAt) external nonReentrant returns (uint256 loanId) {
        if (paise == 0) revert LoanZeroAmount();
        PledgeReceipt.Receipt memory r = receipts.receiptOf(tokenId);
        if (dueAt <= block.timestamp || dueAt > r.reappraiseBy) revert LoanBadTerm(dueAt, r.reappraiseBy);
        uint256 maxPaise = maxBorrowPaise(tokenId); // 0 if frozen or stale
        if (paise > maxPaise) revert LoanTooLarge(paise, maxPaise);
        uint256 free = liquidityOf[r.bankId];
        if (paise > free) revert LoanNoLiquidity(r.bankId, paise, free);

        liquidityOf[r.bankId] = free - paise;
        totalLiquidity -= paise;
        totalOutstanding += paise;
        loanId = ++loanCount;
        loans[loanId] = Loan({
            tokenId: tokenId,
            bankId: r.bankId,
            borrower: msg.sender,
            principalPaise: paise,
            openedAt: uint64(block.timestamp),
            dueAt: dueAt,
            status: Status.OPEN
        });
        receipts.transferFrom(msg.sender, address(this), tokenId); // reverts unless caller owns or is approved
        rupee.safeTransfer(msg.sender, paise);
        emit Borrowed(loanId, tokenId, msg.sender, paise, dueAt);
    }

    /// @notice Pay back in full; the receipt comes back to the borrower.
    function repay(uint256 loanId) external nonReentrant {
        Loan storage l = _open(loanId);
        if (msg.sender != l.borrower) revert LoanNotBorrower(loanId, msg.sender);
        uint256 amt = l.principalPaise;
        l.status = Status.REPAID;
        totalOutstanding -= amt;
        liquidityOf[l.bankId] += amt;
        totalLiquidity += amt;
        rupee.safeTransferFrom(msg.sender, address(this), amt);
        receipts.transferFrom(address(this), l.borrower, l.tokenId);
        emit Repaid(loanId, l.borrower, amt);
    }

    /// @notice After the due date the lien-holding bank takes the receipt (next step:
    ///         the legal notice and, if unpaid, an auction on the bank asset desk).
    function claimDefault(uint256 loanId) external nonReentrant {
        Loan storage l = _open(loanId);
        _onlyBank(l.bankId);
        if (block.timestamp <= l.dueAt) revert LoanNotDue(loanId, l.dueAt);
        l.status = Status.DEFAULTED;
        totalOutstanding -= l.principalPaise; // written off the book; recovered via the desk
        receipts.transferFrom(address(this), msg.sender, l.tokenId);
        emit Defaulted(loanId, l.tokenId, msg.sender);
    }

    // ------------------------------------------------------------------ internals
    function _onlyBank(bytes32 bankId) internal view {
        address op = receipts.bankOf(bankId).operator; // reverts for an unknown bank
        if (msg.sender != op) revert LoanNotBank(bankId, msg.sender);
    }

    function _open(uint256 loanId) internal view returns (Loan storage l) {
        l = loans[loanId];
        if (l.status != Status.OPEN) revert LoanNotOpen(loanId);
    }
}
