// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {ICollateral} from "../collateral/ICollateral.sol";
import {CollateralVault} from "../collateral/CollateralVault.sol";

/// @title LoanAgreement — peer-to-peer loans with optional collateral and
///        scheduled (equal-instalment) repayment.
/// @author Ramprasad
/// @dev Lifecycle: Created -> Funded (lender sends principal) -> Active (borrower
///      draws) -> Repaid (Closed) | Defaulted (foreclosure on the collateral
///      position if present). Principal and interest accrue linearly; repayments
///      are split by proportion. Collateral is locked in the CollateralVault as
///      positionId = loanId, owned by this contract, and released on repayment or
///      foreclosed to the lender on default. This contract must be authorized on
///      the vault (only positions it owns can be released).
contract LoanAgreement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error LoanZeroAmount();
    error LoanZeroAddress();
    error LoanFundedAlready(uint256 loanId);
    error LoanNotActive(uint256 loanId);
    error LoanNotFundable(uint256 loanId);
    error LoanNotBorrower(uint256 loanId, address caller);
    error LoanNotLender(uint256 loanId, address caller);
    error LoanOverpay(uint256 loanId, uint256 due, uint256 paid);
    error LoanBalanceNotDue(uint256 loanId, uint256 dueAt, uint256 now);
    error LoanInterestTooHigh(uint256 bps);

    event LoanCreated(
        uint256 indexed loanId,
        address indexed lender,
        address indexed borrower,
        address token,
        uint256 principal,
        uint256 interestBps,
        uint256 termSeconds,
        address collateralToken,
        bytes32 collateralPositionId
    );
    event LoanFunded(uint256 indexed loanId, address indexed lender, uint256 amount);
    event LoanDrawn(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 principal, uint256 interest);
    event LoanClosed(uint256 indexed loanId);
    event LoanDefaulted(uint256 indexed loanId, uint256 outstanding);
    event LoanCollateralReleased(uint256 indexed loanId, address indexed token, address indexed to);

    struct Loan {
        address lender;
        address borrower;
        IERC20 token;
        address collateralToken;
        bytes32 collateralPositionId;
        bool hasCollateral;
        uint256 principal;
        uint256 interestBps;
        uint256 termSeconds;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 repaidPrincipal;
        uint256 repaidInterest;
        uint8 state; // 0 Created, 1 Funded, 2 Active, 3 Repaid(Closed), 4 Defaulted
    }

    uint256 public constant MAX_INTEREST_BPS = 100_00;

    uint256 public loanCount;
    mapping(uint256 => Loan) public loans;

    ICollateral public immutable vault;

    /// @param collateralVault Collateral position owner (this contract holds its
    ///        own locks there).
    constructor(address collateralVault) {
        vault = ICollateral(collateralVault);
    }

    modifier loanState(uint256 loanId, uint8 state) {
        if (loans[loanId].state != state) revert LoanNotActive(loanId);
        _;
    }

    /// @notice Propose a loan. Lender and borrower may be any addresses; the
    ///         borrower signs up as lender on chain. The lender must have approved
    ///         this contract to pull `principal`.
    function createLoan(
        address lender,
        address borrower,
        address token,
        uint256 principal,
        uint256 interestBps,
        uint256 termSeconds,
        address collateralToken,
        bytes32 collateralPositionId
    ) external returns (uint256 loanId) {
        if (lender == address(0) || borrower == address(0) || token == address(0)) revert LoanZeroAddress();
        if (principal == 0 || termSeconds == 0) revert LoanZeroAmount();
        if (interestBps > MAX_INTEREST_BPS) revert LoanInterestTooHigh(interestBps);
        if (collateralToken == address(0) || collateralPositionId == bytes32(0)) revert LoanZeroAddress();

        // The collateral position must already be locked to THIS contract by the
        // borrower (CollateralVault.lock(positionId, address(this), amount)).
        CollateralVault vaultC = CollateralVault(address(vault));
        (address posToken, , uint256 posAmount) = vaultC.positionOf(collateralPositionId);
        if (posAmount == 0 || posToken == address(0)) revert LoanZeroAddress();
        if (posToken != collateralToken) revert LoanZeroAddress();

        loanId = ++loanCount;
        Loan storage l = loans[loanId];
        l.lender = lender;
        l.borrower = borrower;
        l.token = IERC20(token);
        l.collateralToken = collateralToken;
        l.collateralPositionId = collateralPositionId;
        l.hasCollateral = true;
        l.principal = principal;
        l.interestBps = interestBps;
        l.termSeconds = termSeconds;
        l.createdAt = block.timestamp;

        emit LoanCreated(
            loanId,
            lender,
            borrower,
            token,
            principal,
            interestBps,
            termSeconds,
            collateralToken,
            collateralPositionId
        );
    }

    /// @notice Lender funds the loan: pulls principal. Loan becomes Funded.
    ///         The borrower draws it in `draw`.
    function fundLoan(uint256 loanId) external nonReentrant {
        Loan storage l = loans[loanId];
        if (l.state != 0) revert LoanFundedAlready(loanId);
        l.token.safeTransferFrom(l.lender, address(this), l.principal);
        l.state = 1;
        l.fundedAt = block.timestamp;
        emit LoanFunded(loanId, msg.sender, l.principal);
    }

    /// @notice Borrower draws the principal to spend it (e.g. towards a mandate).
    function drawLoan(uint256 loanId) external nonReentrant loanState(loanId, 1) {
        Loan storage l = loans[loanId];
        if (msg.sender != l.borrower) revert LoanNotBorrower(loanId, msg.sender);
        l.state = 2; // Active
        emit LoanDrawn(loanId, msg.sender, l.principal);
        l.token.safeTransfer(msg.sender, l.principal);
    }

    /// @notice Repay principal + running interest. Fully repaying closes the loan
    ///         and releases the collateral position back to this contract, which
    ///         immediately forwards it to the borrower. Partial repayments reduce
    ///         outstanding principal proportionally.
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage l = loans[loanId];
        if (l.state != 2) revert LoanNotActive(loanId);
        if (amount == 0) revert LoanZeroAmount();

        uint256 owedNow = _totalOwed(l);
        uint256 alreadyRepaid = l.repaidPrincipal + l.repaidInterest;
        uint256 due = owedNow > alreadyRepaid ? owedNow - alreadyRepaid : 0;
        if (amount > due) revert LoanOverpay(loanId, due, amount);

        // Split by the current outstanding proportion (approx. simple interest).
        uint256 principalLeft = l.principal - l.repaidPrincipal;
        uint256 interestLeft = _interestOn(l) - l.repaidInterest;
        if (principalLeft + interestLeft == 0) revert LoanZeroAmount();
        uint256 principalShare = (amount * principalLeft) / (principalLeft + interestLeft);
        uint256 interestShare = amount - principalShare;

        l.repaidPrincipal += principalShare;
        l.repaidInterest += interestShare;
        l.token.safeTransferFrom(msg.sender, address(this), amount);

        emit LoanRepaid(loanId, msg.sender, principalShare, interestShare);

        if ((l.repaidPrincipal + l.repaidInterest) >= owedNow) {
            _close(loanId);
        }
    }

    function _close(uint256 loanId) private {
        Loan storage l = loans[loanId];
        l.state = 3;
        emit LoanClosed(loanId);
        if (l.hasCollateral) {
            address collateralToken = l.collateralToken;
            vault.release(l.collateralPositionId, l.borrower);
            emit LoanCollateralReleased(loanId, collateralToken, l.borrower);
        }
    }

    /// @notice Declare default after term expiry with an outstanding balance.
    ///         Forecloses the collateral position to the lender.
    function declareDefault(uint256 loanId) external nonReentrant {
        Loan storage l = loans[loanId];
        if (l.state != 2) revert LoanNotActive(loanId);
        if (block.timestamp < l.fundedAt + l.termSeconds) {
            revert LoanBalanceNotDue(loanId, l.fundedAt + l.termSeconds, block.timestamp);
        }
        uint256 defaultBalance = _totalOwed(l) - (l.repaidPrincipal + l.repaidInterest);
        if (defaultBalance == 0) revert LoanZeroAmount();

        l.state = 4;
        emit LoanDefaulted(loanId, defaultBalance);
        if (l.hasCollateral) {
            vault.release(l.collateralPositionId, l.lender);
            emit LoanCollateralReleased(loanId, l.collateralToken, l.lender);
        }
    }

    /// @notice Lender withdraws repaid principal + interest that has settled in
    ///         this contract (called after each partial repayment or on close).
    function withdrawRepaid(uint256 loanId) external nonReentrant {
        Loan storage l = loans[loanId];
        if (msg.sender != l.lender) revert LoanNotLender(loanId, msg.sender);
        uint256 repayments = l.repaidPrincipal + l.repaidInterest;
        if (repayments == 0) revert LoanZeroAmount();
        // Track credit ledger via balance accounting: reset repaid counters and pay out.
        l.repaidPrincipal = 0;
        l.repaidInterest = 0;
        l.token.safeTransfer(msg.sender, repayments);
    }

    function _interestOn(Loan storage l) private view returns (uint256) {
        // Pro-rata simple interest over the term.
        uint256 elapsed = block.timestamp - (l.fundedAt == 0 ? l.createdAt : l.fundedAt);
        if (elapsed >= l.termSeconds) return (l.principal * l.interestBps) / 100_00;
        return (l.principal * l.interestBps * elapsed) / (100_00 * l.termSeconds);
    }

    function _totalOwed(Loan storage l) private view returns (uint256) {
        return l.principal + _interestOn(l);
    }

    /// @notice Total amount owed right now (principal + accrued interest).
    function totalOwed(uint256 loanId) external view returns (uint256) {
        return _totalOwed(loans[loanId]);
    }

    /// @notice Numeric loan state (0 Created, 1 Funded, 2 Active, 3 Repaid, 4 Defaulted).
    function stateOf(uint256 loanId) external view returns (uint8) {
        return loans[loanId].state;
    }

    /// @notice Outstanding (unrepaid) balance right now.
    function outstanding(uint256 loanId) external view returns (uint256) {
        Loan storage l = loans[loanId];
        uint256 repaid = l.repaidPrincipal + l.repaidInterest;
        uint256 owed = _totalOwed(l);
        return owed > repaid ? owed - repaid : 0;
    }
}