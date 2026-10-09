// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IACPHook} from "./interfaces/IACPHook.sol";

/// @title AgenticCommerce — ERC-8183 (Draft, Feb 2026) job escrow, built to the spec signatures.
/// @author Ramprasad
/// @notice Varanasi's 8183 surface. The evaluator slot is where Varanasi's neutral verifier
///         (RiskGuard / PoC runner) plugs in; the hook slot is where the human EIP-712 mandate
///         gate plugs in. One ERC-20 per contract. Platform fee only on Completed, never on refund.
contract AgenticCommerce is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Open, Funded, Submitted, Completed, Rejected, Expired }

    struct Job {
        address client;
        address provider;
        address evaluator;
        address hook;
        uint256 budget;
        uint256 expiredAt;
        Status status;
        bytes32 deliverable;
        string description;
    }

    uint256 public constant MAX_FEE_BPS = 1_000; // 10% hard cap
    IERC20 public immutable token;
    address public immutable treasury;
    uint256 public immutable platformFeeBps;
    uint256 public jobCount;
    mapping(uint256 => Job) internal _jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook);
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

    error BadParam();
    error WrongStatus(Status got);
    error NotAuthorized();
    error BudgetMismatch(uint256 budget, uint256 expected);
    error NotExpired();
    error Expired_();

    constructor(IERC20 token_, address treasury_, uint256 platformFeeBps_) {
        if (address(token_) == address(0) || platformFeeBps_ > MAX_FEE_BPS) revert BadParam();
        if (platformFeeBps_ > 0 && treasury_ == address(0)) revert BadParam();
        token = token_;
        treasury = treasury_;
        platformFeeBps = platformFeeBps_;
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    function _before(Job storage j, uint256 jobId, bytes4 sel, bytes memory data) internal {
        if (j.hook != address(0)) IACPHook(j.hook).beforeAction(jobId, sel, data);
    }

    function _after(Job storage j, uint256 jobId, bytes4 sel, bytes memory data) internal {
        if (j.hook != address(0)) IACPHook(j.hook).afterAction(jobId, sel, data);
    }

    function _job(uint256 jobId) internal view returns (Job storage j) {
        j = _jobs[jobId];
        if (j.client == address(0)) revert BadParam();
    }

    function createJob(address provider, address evaluator, uint256 expiredAt, string calldata description, address hook)
        external
        returns (uint256 jobId)
    {
        if (evaluator == address(0) || expiredAt <= block.timestamp) revert BadParam();
        jobId = ++jobCount;
        Job storage j = _jobs[jobId];
        j.client = msg.sender;
        j.provider = provider;
        j.evaluator = evaluator;
        j.hook = hook;
        j.expiredAt = expiredAt;
        j.description = description;
        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, hook);
    }

    function setProvider(uint256 jobId, address provider, bytes calldata optParams) external {
        Job storage j = _job(jobId);
        if (msg.sender != j.client) revert NotAuthorized();
        if (j.status != Status.Open) revert WrongStatus(j.status);
        if (j.provider != address(0) || provider == address(0)) revert BadParam();
        bytes memory data = abi.encode(provider, optParams);
        _before(j, jobId, this.setProvider.selector, data);
        j.provider = provider;
        emit ProviderSet(jobId, provider);
        _after(j, jobId, this.setProvider.selector, data);
    }

    function setBudget(uint256 jobId, uint256 amount, bytes calldata optParams) external {
        Job storage j = _job(jobId);
        if (msg.sender != j.client && msg.sender != j.provider) revert NotAuthorized();
        if (j.status != Status.Open) revert WrongStatus(j.status);
        bytes memory data = abi.encode(amount, optParams);
        _before(j, jobId, this.setBudget.selector, data);
        j.budget = amount;
        emit BudgetSet(jobId, amount);
        _after(j, jobId, this.setBudget.selector, data);
    }

    function fund(uint256 jobId, uint256 expectedBudget, bytes calldata optParams) external nonReentrant {
        Job storage j = _job(jobId);
        if (msg.sender != j.client) revert NotAuthorized();
        if (j.status != Status.Open) revert WrongStatus(j.status);
        if (block.timestamp >= j.expiredAt) revert Expired_();
        if (j.budget == 0 || j.provider == address(0)) revert BadParam();
        if (j.budget != expectedBudget) revert BudgetMismatch(j.budget, expectedBudget);
        _before(j, jobId, this.fund.selector, optParams);
        j.status = Status.Funded;
        uint256 pre = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), j.budget);
        // fee-on-transfer tokens unsupported: escrow must hold the exact budget
        if (token.balanceOf(address(this)) - pre != j.budget) revert BadParam();
        emit JobFunded(jobId, msg.sender, j.budget);
        _after(j, jobId, this.fund.selector, optParams);
    }

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external {
        Job storage j = _job(jobId);
        if (msg.sender != j.provider) revert NotAuthorized();
        if (j.status != Status.Funded) revert WrongStatus(j.status);
        if (block.timestamp >= j.expiredAt) revert Expired_();
        bytes memory data = abi.encode(deliverable, optParams);
        _before(j, jobId, this.submit.selector, data);
        j.status = Status.Submitted;
        j.deliverable = deliverable;
        emit JobSubmitted(jobId, msg.sender, deliverable);
        _after(j, jobId, this.submit.selector, data);
    }

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage j = _job(jobId);
        if (msg.sender != j.evaluator) revert NotAuthorized();
        if (j.status != Status.Submitted) revert WrongStatus(j.status);
        bytes memory data = abi.encode(reason, optParams);
        _before(j, jobId, this.complete.selector, data);
        j.status = Status.Completed;
        uint256 fee = (j.budget * platformFeeBps) / 10_000;
        uint256 payout = j.budget - fee;
        emit JobCompleted(jobId, msg.sender, reason);
        if (fee > 0) token.safeTransfer(treasury, fee);
        token.safeTransfer(j.provider, payout);
        emit PaymentReleased(jobId, j.provider, payout);
        _after(j, jobId, this.complete.selector, data);
    }

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage j = _job(jobId);
        Status s = j.status;
        if (s == Status.Open) {
            if (msg.sender != j.client) revert NotAuthorized();
        } else if (s == Status.Funded || s == Status.Submitted) {
            if (msg.sender != j.evaluator) revert NotAuthorized();
        } else {
            revert WrongStatus(s);
        }
        bytes memory data = abi.encode(reason, optParams);
        _before(j, jobId, this.reject.selector, data);
        j.status = Status.Rejected;
        emit JobRejected(jobId, msg.sender, reason);
        if (s != Status.Open) {
            token.safeTransfer(j.client, j.budget);
            emit Refunded(jobId, j.client, j.budget);
        }
        _after(j, jobId, this.reject.selector, data);
    }

    /// @notice Anyone, after expiry. Never hooked, so a bad hook can never trap funds.
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage j = _job(jobId);
        if (j.status != Status.Funded && j.status != Status.Submitted) revert WrongStatus(j.status);
        if (block.timestamp < j.expiredAt) revert NotExpired();
        j.status = Status.Expired;
        emit JobExpired(jobId);
        token.safeTransfer(j.client, j.budget);
        emit Refunded(jobId, j.client, j.budget);
    }
}
