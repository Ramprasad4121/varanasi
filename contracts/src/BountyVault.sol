// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {AgenticCommerce} from "./AgenticCommerce.sol";
import {IACPHook} from "./interfaces/IACPHook.sol";

/// @title BountyVault — PoC-gated bug bounty vault on ERC-8183.
/// @author Ramprasad
/// @notice A protocol (sponsor) funds a bounty pot and commits, per payout tier, the hash of an
///         invariant checker plus the payout for breaking it. A hunter posts a bond and opens a
///         claim on one tier; the vault opens and funds an ERC-8183 job (client = this vault,
///         provider = hunter, evaluator = the Varanasi RiskGuardEvaluator, hook = this vault).
///         The hunter submits keccak256(PoC) on AgenticCommerce. When the evaluator completes the
///         job, AgenticCommerce pays the hunter the tier and this vault (as hook) credits the bond
///         back (hunter pulls it with withdrawCredit) and closes the tier. When it rejects, the
///         tier money comes back to the pot and the bond is slashed into the pot. If nobody rules
///         before expiry, anyone can refund the job and the hunter gets the bond back (a verifier
///         outage is not the hunter's fault).
/// @dev One open claim per tier at a time and each tier pays once (first valid PoC wins), so the
///      same bug is never paid twice. A bogus claim can hold a tier until claimWindow passes, at
///      the cost of its bond. The vault proves an exploit runs against a committed invariant;
///      it does not judge scope or severity beyond the tier the sponsor attached to that invariant.
contract BountyVault is IACPHook, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Tier {
        bytes32 invariantHash; // keccak256 of the invariant checker source the verifier must run
        uint256 payout; // gross payout (AgenticCommerce takes its platform fee from this)
        bool paid; // tier closed after one valid PoC
        uint256 activeClaim; // claimId currently holding the tier, 0 if none
    }

    struct Bounty {
        address sponsor;
        address target; // contract under test (same chain in v1)
        uint64 deadline; // no new claims after this; sponsor can withdraw after it with no open claims
        uint64 claimWindow; // seconds a claim has to be judged (ERC-8183 job expiry)
        uint256 bond; // hunter bond per claim, in `token`
        uint256 available; // pot not reserved by an open claim
        uint256 openClaims;
        Tier[] tiers;
    }

    enum ClaimStatus { None, Open, Paid, Slashed, Refunded }

    struct Claim {
        uint256 bountyId;
        uint256 tierId;
        address hunter;
        uint64 forkBlock; // block the PoC is pinned to
        uint256 jobId;
        uint256 bond;
        ClaimStatus status;
    }

    AgenticCommerce public immutable commerce;
    IERC20 public immutable token;
    address public immutable evaluator;

    uint256 public bountyCount;
    uint256 public claimCount;
    mapping(uint256 => Bounty) internal _bounties;
    mapping(uint256 => Claim) public claims;
    mapping(uint256 => uint256) public claimOfJob; // ERC-8183 jobId => claimId
    /// @notice Returned bonds, pulled by the hunter (a blocked transfer can never jam settlement).
    mapping(address => uint256) public credit;

    event BountyCreated(uint256 indexed bountyId, address indexed sponsor, address target, uint256 pot, uint256 bond, uint64 deadline);
    event TierCommitted(uint256 indexed bountyId, uint256 indexed tierId, bytes32 invariantHash, uint256 payout);
    event BountyToppedUp(uint256 indexed bountyId, uint256 amount);
    event ClaimOpened(uint256 indexed claimId, uint256 indexed bountyId, uint256 indexed tierId, address hunter, uint256 jobId, uint64 forkBlock);
    event ClaimPaid(uint256 indexed claimId, address indexed hunter, uint256 bondReturned);
    event ClaimSlashed(uint256 indexed claimId, address indexed hunter, uint256 bondSlashed);
    event ClaimRefunded(uint256 indexed claimId, address indexed hunter, uint256 bondReturned);
    event SponsorWithdrew(uint256 indexed bountyId, uint256 amount);
    event CreditWithdrawn(address indexed who, uint256 amount);

    error BadParam();
    error NotSponsor();
    error NotCommerce();
    error BountyClosed();
    error TierUnavailable();
    error InsufficientPot(uint256 available, uint256 needed);
    error ClaimNotOpen();
    error JobNotExpired();
    error StillActive();

    constructor(AgenticCommerce commerce_, address evaluator_) {
        if (address(commerce_) == address(0) || evaluator_ == address(0)) revert BadParam();
        commerce = commerce_;
        token = commerce_.token();
        evaluator = evaluator_;
        // the vault is the ERC-8183 client; commerce pulls each tier budget from here on fund
        token.forceApprove(address(commerce_), type(uint256).max);
    }

    // ------------------------------------------------------------------ views

    function bountyInfo(uint256 bountyId)
        external
        view
        returns (
            address sponsor,
            address target,
            uint64 deadline,
            uint64 claimWindow,
            uint256 bond,
            uint256 available,
            uint256 openClaims,
            uint256 tierCount
        )
    {
        Bounty storage b = _bounties[bountyId];
        return (b.sponsor, b.target, b.deadline, b.claimWindow, b.bond, b.available, b.openClaims, b.tiers.length);
    }

    function tierOf(uint256 bountyId, uint256 tierId) external view returns (Tier memory) {
        return _bounties[bountyId].tiers[tierId];
    }

    // ---------------------------------------------------------------- sponsor

    /// @notice Fund a bounty pot and commit invariant hashes + payout tiers. The pot must cover the
    ///         largest tier so the first valid PoC can always be paid.
    function createBounty(
        address target,
        uint256 pot,
        uint256 bond,
        uint64 deadline,
        uint64 claimWindow,
        bytes32[] calldata invariantHashes,
        uint256[] calldata payouts
    ) external nonReentrant returns (uint256 bountyId) {
        uint256 n = invariantHashes.length;
        if (target == address(0) || n == 0 || n != payouts.length || bond == 0) revert BadParam();
        if (deadline <= block.timestamp || claimWindow == 0 || claimWindow > 30 days) revert BadParam();
        bountyId = ++bountyCount;
        Bounty storage b = _bounties[bountyId];
        b.sponsor = msg.sender;
        b.target = target;
        b.deadline = deadline;
        b.claimWindow = claimWindow;
        b.bond = bond;
        uint256 maxPayout;
        for (uint256 i; i < n; ++i) {
            if (invariantHashes[i] == bytes32(0) || payouts[i] == 0) revert BadParam();
            b.tiers.push(Tier({invariantHash: invariantHashes[i], payout: payouts[i], paid: false, activeClaim: 0}));
            if (payouts[i] > maxPayout) maxPayout = payouts[i];
            emit TierCommitted(bountyId, i, invariantHashes[i], payouts[i]);
        }
        if (pot < maxPayout) revert InsufficientPot(pot, maxPayout);
        _pull(msg.sender, pot);
        b.available = pot;
        emit BountyCreated(bountyId, msg.sender, target, pot, bond, deadline);
    }

    function topUp(uint256 bountyId, uint256 amount) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (amount == 0) revert BadParam();
        _pull(msg.sender, amount);
        b.available += amount;
        emit BountyToppedUp(bountyId, amount);
    }

    /// @notice After the deadline and with no open claims, the sponsor takes back what is left
    ///         (unpaid pot plus any slashed bonds).
    function withdrawRemaining(uint256 bountyId) external nonReentrant {
        Bounty storage b = _bounty(bountyId);
        if (msg.sender != b.sponsor) revert NotSponsor();
        if (block.timestamp <= b.deadline || b.openClaims != 0) revert StillActive();
        uint256 amt = b.available;
        b.available = 0;
        token.safeTransfer(b.sponsor, amt);
        emit SponsorWithdrew(bountyId, amt);
    }

    // ----------------------------------------------------------------- hunter

    /// @notice Post the bond and open an ERC-8183 job for one tier. Then call
    ///         commerce.submit(jobId, keccak256(pocBytes), "") from the same address.
    function openClaim(uint256 bountyId, uint256 tierId, uint64 forkBlock)
        external
        nonReentrant
        returns (uint256 claimId, uint256 jobId)
    {
        Bounty storage b = _bounty(bountyId);
        if (block.timestamp >= b.deadline) revert BountyClosed();
        if (tierId >= b.tiers.length) revert BadParam();
        if (forkBlock == 0) revert BadParam(); // block on the target's chain (same chain in v1)
        Tier storage t = b.tiers[tierId];
        if (t.paid || t.activeClaim != 0) revert TierUnavailable();
        if (b.available < t.payout) revert InsufficientPot(b.available, t.payout);

        _pull(msg.sender, b.bond);
        b.available -= t.payout;
        b.openClaims += 1;
        claimId = ++claimCount;
        t.activeClaim = claimId;

        jobId = commerce.createJob(
            msg.sender,
            evaluator,
            block.timestamp + b.claimWindow,
            _desc(bountyId, tierId, forkBlock, t.invariantHash),
            address(this)
        );
        claims[claimId] = Claim({
            bountyId: bountyId,
            tierId: tierId,
            hunter: msg.sender,
            forkBlock: forkBlock,
            jobId: jobId,
            bond: b.bond,
            status: ClaimStatus.Open
        });
        claimOfJob[jobId] = claimId;
        // funded in the same tx: the job is never Open where the provider could call setBudget
        commerce.setBudget(jobId, t.payout, "");
        commerce.fund(jobId, t.payout, "");
        emit ClaimOpened(claimId, bountyId, tierId, msg.sender, jobId, forkBlock);
    }

    /// @notice If the evaluator never ruled and the job expired, refund it and credit the bond back.
    ///         Permissionless. Works whether or not someone already called commerce.claimRefund.
    function reclaimExpired(uint256 claimId) external nonReentrant {
        Claim storage c = claims[claimId];
        if (c.status != ClaimStatus.Open) revert ClaimNotOpen();
        AgenticCommerce.Job memory j = commerce.getJob(c.jobId);
        if (j.status == AgenticCommerce.Status.Funded || j.status == AgenticCommerce.Status.Submitted) {
            if (block.timestamp < j.expiredAt) revert JobNotExpired();
            commerce.claimRefund(c.jobId); // tier budget back to this vault (unhooked)
        } else if (j.status != AgenticCommerce.Status.Expired) {
            revert ClaimNotOpen();
        }
        Bounty storage b = _bounties[c.bountyId];
        c.status = ClaimStatus.Refunded;
        b.available += b.tiers[c.tierId].payout;
        _release(b, c.tierId);
        credit[c.hunter] += c.bond;
        emit ClaimRefunded(claimId, c.hunter, c.bond);
    }

    /// @notice Withdraw returned bonds.
    function withdrawCredit() external nonReentrant {
        uint256 amt = credit[msg.sender];
        if (amt == 0) revert BadParam();
        credit[msg.sender] = 0;
        token.safeTransfer(msg.sender, amt);
        emit CreditWithdrawn(msg.sender, amt);
    }

    // ------------------------------------------------------------ ERC-8183 hook

    function beforeAction(uint256, bytes4, bytes calldata) external view {
        if (msg.sender != address(commerce)) revert NotCommerce();
    }

    /// @dev Settlement bookkeeping. complete => bond credited back, tier closed. reject => budget
    ///      already refunded to this vault by commerce; return it to the pot and slash the bond into
    ///      the pot. Not nonReentrant on purpose: it runs inside openClaim (setBudget/fund hooks) and
    ///      inside commerce's own nonReentrant settle; it only moves internal accounting.
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata) external {
        if (msg.sender != address(commerce)) revert NotCommerce();
        uint256 claimId = claimOfJob[jobId];
        if (claimId == 0) return; // not a vault job
        Claim storage c = claims[claimId];
        if (c.status != ClaimStatus.Open) return;
        Bounty storage b = _bounties[c.bountyId];

        if (selector == AgenticCommerce.complete.selector) {
            c.status = ClaimStatus.Paid;
            b.tiers[c.tierId].paid = true;
            _release(b, c.tierId);
            credit[c.hunter] += c.bond;
            emit ClaimPaid(claimId, c.hunter, c.bond);
        } else if (selector == AgenticCommerce.reject.selector) {
            c.status = ClaimStatus.Slashed;
            b.available += b.tiers[c.tierId].payout + c.bond;
            _release(b, c.tierId);
            emit ClaimSlashed(claimId, c.hunter, c.bond);
        }
    }

    // --------------------------------------------------------------- internal

    function _bounty(uint256 bountyId) internal view returns (Bounty storage b) {
        b = _bounties[bountyId];
        if (b.sponsor == address(0)) revert BadParam();
    }

    function _release(Bounty storage b, uint256 tierId) internal {
        b.tiers[tierId].activeClaim = 0;
        b.openClaims -= 1;
    }

    function _pull(address from, uint256 amount) internal {
        uint256 pre = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - pre != amount) revert BadParam(); // no fee-on-transfer
    }

    function _desc(uint256 bountyId, uint256 tierId, uint64 forkBlock, bytes32 invariantHash)
        internal
        view
        returns (string memory)
    {
        return string.concat(
            "varanasi-bounty:v1:vault=",
            _hex(abi.encodePacked(address(this))),
            ":bounty=",
            _dec(bountyId),
            ":tier=",
            _dec(tierId),
            ":forkBlock=",
            _dec(forkBlock),
            ":invariant=",
            _hex(abi.encodePacked(invariantHash))
        );
    }

    function _dec(uint256 v) internal pure returns (string memory s) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 x = v; x != 0; x /= 10) ++len;
        bytes memory out = new bytes(len);
        for (; v != 0; v /= 10) out[--len] = bytes1(uint8(48 + (v % 10)));
        s = string(out);
    }

    function _hex(bytes memory data) internal pure returns (string memory) {
        bytes16 sym = "0123456789abcdef";
        bytes memory out = new bytes(2 + data.length * 2);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i; i < data.length; ++i) {
            out[2 + i * 2] = sym[uint8(data[i]) >> 4];
            out[3 + i * 2] = sym[uint8(data[i]) & 0x0f];
        }
        return string(out);
    }
}
