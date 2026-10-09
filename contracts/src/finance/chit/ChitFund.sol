// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IRandomness} from "./IRandomness.sol";

/// @title ChitFund: on-chain chit fund (ROSCA) with draw and auction modes.
/// @author Ramprasad
/// @notice N members pay a fixed contribution C every round for N rounds. Each
///         round one member who has not won yet takes the pot, so every member
///         wins exactly once (unless excluded for default). Rules, numbers and the
///         trust model are in docs/CHIT.md.
/// @dev Design points:
///      - Pull payments only. settle() makes no token transfer, so a blacklisted
///        or reverting member can never block a round.
///      - Winner security is "escrow backed liability": the prize is credited to
///        the winner's escrow, and the part of escrow above the winner's remaining
///        contributions ((N - paidCount) x C) is withdrawable. Posting collateral
///        first (anyone may post for a member) frees the whole prize at once.
///        Each paid round releases C more. A winner who skips a round is slashed
///        C from escrow, so the group is always paid.
///      - The foreman deploys the fund and picks the members. After that the
///        foreman has exactly two powers: cancel before start (no funds exist
///        then) and withdraw the capped commission. No pause, no sweep, no admin.
///      - Amounts are token base units, so any ERC20 decimals work (2, 6, 18).
///        Fee on transfer tokens are rejected by a balance check.
contract ChitFund is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Mode {
        FIXED_ORDER,
        DRAW,
        AUCTION
    }

    struct Params {
        address token;
        uint256 contribution; // C, token base units
        Mode mode;
        uint64 payWindow; // on time payment window from round start
        uint64 gracePeriod; // late window after payWindow (late fee applies)
        uint64 revealWindow; // seed / bid reveal window after grace
        uint16 commissionBps; // foreman commission cap, <= 500 (5% of pot)
        uint16 maxDiscountBps; // auction: max discount a bid may take, < 10000
        uint16 lateFeeBps; // late fee as bps of C, paid into the round pot
        uint16 forfeitBps; // share of an excluded member's payments kept by the group
        uint256 revealBond; // draw: bond per seed commit, forfeited if not revealed
        address randomness; // optional IRandomness (Chainlink VRF adapter); 0 = members only
        uint64 vrfTimeout; // fallback delay if the randomness source never answers
    }

    struct MemberState {
        bool won;
        bool excluded;
        uint32 wonRound;
        uint32 paidCount;
        uint32 defaults;
        uint32 missedReveals;
    }

    struct RoundResult {
        address winner; // 0 for a settlement round (no eligible member left)
        uint256 pot; // contributions collected (incl. slashed)
        uint256 payout; // credited to winner escrow
        uint256 commission; // foreman
        uint256 dividendEach; // per other paying member
        uint256 dust; // rounding remainder, credited to the winner
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_COMMISSION_BPS = 500;
    uint256 public constant MIN_MEMBERS = 2;
    uint256 public constant MAX_MEMBERS = 50;

    error ZeroAddress();
    error ZeroAmount();
    error BadMembers();
    error BadParams();
    error NotMember(address who);
    error NotForeman(address who);
    error NotStarted();
    error AlreadyStarted();
    error AlreadyEnrolled(address who);
    error FundClosed();
    error WrongMode();
    error Excluded(address who);
    error AlreadyPaid(address who, uint256 round);
    error PaymentClosed(uint256 round);
    error CommitClosed(uint256 round);
    error AlreadyCommitted(address who, uint256 round);
    error NotRevealWindow(uint256 round);
    error BadReveal(address who);
    error AlreadyRevealed(address who);
    error NotEligible(address who);
    error BidOutOfRange(uint256 bid, uint256 min, uint256 max);
    error RoundOpen(uint256 round, uint256 settleAt);
    error RandomnessPending(uint256 round);
    error RandomnessAlreadyRequested(uint256 round);
    error NoRandomnessSource();
    error UnsupportedToken(uint256 expected, uint256 received);
    error NothingToWithdraw();

    event Enrolled(address indexed member, uint256 enrolled);
    event Started(uint256 startTime);
    event Cancelled();
    event Contributed(address indexed member, uint256 indexed round, uint256 amount, uint256 lateFee);
    event CollateralPosted(address indexed member, address indexed from, uint256 amount);
    event SeedCommitted(address indexed member, uint256 indexed round);
    event SeedRevealed(address indexed member, uint256 indexed round);
    event RevealMissed(address indexed member, uint256 indexed round, uint256 bondForfeited);
    event BidCommitted(address indexed member, uint256 indexed round);
    event BidRevealed(address indexed member, uint256 indexed round, uint256 bid);
    event RandomnessRequested(uint256 indexed round, bytes32 key);
    event Slashed(address indexed member, uint256 indexed round, uint256 taken, uint256 shortfall, uint256 penalty);
    event MemberExcluded(address indexed member, uint256 indexed round);
    event RoundSettled(
        uint256 indexed round,
        address indexed winner,
        uint256 pot,
        uint256 payout,
        uint256 commission,
        uint256 dividendEach,
        uint256 dust
    );
    event SettlementRound(uint256 indexed round, uint256 reserved);
    event ExcludedRefund(address indexed member, uint256 amount);
    event Finalized(uint256 reserveDistributed);
    event Withdrawn(address indexed to, uint256 amount);

    // --- immutable terms ---
    address public immutable foreman;
    IERC20 public immutable token;
    uint256 public immutable contribution;
    Mode public immutable mode;
    uint64 public immutable payWindow;
    uint64 public immutable gracePeriod;
    uint64 public immutable revealWindow;
    uint16 public immutable commissionBps;
    uint16 public immutable maxDiscountBps;
    uint16 public immutable lateFeeBps;
    uint16 public immutable forfeitBps;
    uint256 public immutable revealBond;
    IRandomness public immutable randomness;
    uint64 public immutable vrfTimeout;

    // --- membership ---
    address[] internal _members;
    mapping(address => bool) public isMember;
    mapping(address => bool) public enrolled;
    uint256 public enrolledCount;
    mapping(address => MemberState) public stateOf;

    // --- lifecycle ---
    bool public started;
    bool public cancelled;
    bool public finalized;
    uint256 public round;
    uint256 public roundStart;
    uint256 public excludedCount;

    // --- balances owed by the contract ---
    mapping(address => uint256) public escrow; // prize + posted collateral
    mapping(address => uint256) public credit; // dividends, bond returns, refunds
    mapping(address => uint256) public received; // prize + dividends + dust, for end of fund fairness
    uint256 public foremanCredit;
    uint256 public roundCollected;
    uint256 public roundExtras; // late fees, penalties, forfeited bonds
    uint256 public bondsHeld;
    uint256 public settlementReserve;

    // --- per round selection state ---
    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => mapping(address => bytes32)) public commitment;
    mapping(uint256 => mapping(address => bool)) public revealed;
    uint256 public seedXor;
    uint256 public reveals;
    address public bestBidder;
    uint256 public bestBid;
    uint256 public bestBidTies; // members sharing bestBid
    uint256 public bidEntropy; // xor of revealed bid salts, breaks ties by lot
    mapping(uint256 => mapping(address => uint256)) public revealedBid;
    uint256 public vrfRequestedAt;

    mapping(uint256 => RoundResult) internal _results;

    constructor(Params memory p, address[] memory members_) {
        if (p.token == address(0)) revert ZeroAddress();
        if (p.contribution == 0) revert ZeroAmount();
        uint256 n = members_.length;
        if (n < MIN_MEMBERS || n > MAX_MEMBERS) revert BadMembers();
        if (p.commissionBps > MAX_COMMISSION_BPS) revert BadParams();
        if (p.maxDiscountBps >= BPS || p.lateFeeBps > BPS || p.forfeitBps > BPS) revert BadParams();
        if (p.payWindow == 0) revert BadParams();
        if (p.mode != Mode.FIXED_ORDER && p.revealWindow == 0) revert BadParams();
        if (p.randomness != address(0) && (p.mode != Mode.DRAW || p.vrfTimeout == 0)) revert BadParams();
        // A fixed order or draw chit has no discount, so no commission source.
        if (p.mode != Mode.AUCTION && p.commissionBps != 0) revert BadParams();

        for (uint256 i; i < n; ++i) {
            address m = members_[i];
            if (m == address(0) || m == msg.sender || isMember[m]) revert BadMembers();
            isMember[m] = true;
            _members.push(m);
        }

        foreman = msg.sender;
        token = IERC20(p.token);
        contribution = p.contribution;
        mode = p.mode;
        payWindow = p.payWindow;
        gracePeriod = p.gracePeriod;
        revealWindow = p.revealWindow;
        commissionBps = p.commissionBps;
        maxDiscountBps = p.maxDiscountBps;
        lateFeeBps = p.lateFeeBps;
        forfeitBps = p.forfeitBps;
        revealBond = p.revealBond;
        randomness = IRandomness(p.randomness);
        vrfTimeout = p.vrfTimeout;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function members() external view returns (address[] memory) {
        return _members;
    }

    function memberCount() public view returns (uint256) {
        return _members.length;
    }

    function payDeadline() public view returns (uint256) {
        return roundStart + payWindow;
    }

    function graceEnd() public view returns (uint256) {
        return roundStart + payWindow + gracePeriod;
    }

    function revealEnd() public view returns (uint256) {
        return roundStart + payWindow + gracePeriod + revealWindow;
    }

    function result(uint256 r) external view returns (RoundResult memory) {
        return _results[r];
    }

    /// @notice Contributions a winner still owes, which escrow must cover.
    function liability(address m) public view returns (uint256) {
        MemberState storage s = stateOf[m];
        if (!s.won || finalized) return 0;
        return (_members.length - s.paidCount) * contribution;
    }

    /// @notice Escrow above the member's liability: withdrawable now.
    function escrowFree(address m) public view returns (uint256) {
        uint256 e = escrow[m];
        uint256 l = liability(m);
        return e > l ? e - l : 0;
    }

    /// @notice Everything the contract owes. Equals the token balance
    ///         (conservation invariant, checked in tests).
    function totalOwed() external view returns (uint256 total) {
        uint256 n = _members.length;
        for (uint256 i; i < n; ++i) {
            total += escrow[_members[i]] + credit[_members[i]];
        }
        total += foremanCredit + roundCollected + roundExtras + bondsHeld + settlementReserve;
    }

    /// @notice The pot this round will hold once winners in arrears are slashed.
    function expectedPot() public view returns (uint256) {
        uint256 r = round;
        uint256 n = _members.length;
        uint256 count;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (paid[r][m] || stateOf[m].won) ++count;
        }
        return count * contribution;
    }

    function randomnessKey(uint256 r) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), r));
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    /// @notice Members opt in. The fund starts when every member enrolled.
    function enroll() external {
        if (cancelled) revert FundClosed();
        if (started) revert AlreadyStarted();
        if (!isMember[msg.sender]) revert NotMember(msg.sender);
        if (enrolled[msg.sender]) revert AlreadyEnrolled(msg.sender);
        enrolled[msg.sender] = true;
        uint256 c = ++enrolledCount;
        emit Enrolled(msg.sender, c);
        if (c == _members.length) {
            started = true;
            round = 1;
            roundStart = block.timestamp;
            emit Started(block.timestamp);
        }
    }

    /// @notice Foreman may cancel only before start, when the fund holds nothing.
    function cancel() external {
        if (msg.sender != foreman) revert NotForeman(msg.sender);
        if (started) revert AlreadyStarted();
        if (cancelled) revert FundClosed();
        cancelled = true;
        emit Cancelled();
    }

    // ------------------------------------------------------------------
    // Payments
    // ------------------------------------------------------------------

    /// @notice Pay this round's contribution. Late (after payWindow, inside the
    ///         grace period) adds lateFeeBps of C, which joins the round pot.
    function contribute() external nonReentrant {
        _requireLive();
        MemberState storage s = _activeMember(msg.sender);
        uint256 r = round;
        if (paid[r][msg.sender]) revert AlreadyPaid(msg.sender, r);
        if (block.timestamp >= graceEnd()) revert PaymentClosed(r);
        uint256 fee = block.timestamp >= payDeadline() ? (contribution * lateFeeBps) / BPS : 0;
        paid[r][msg.sender] = true;
        s.paidCount += 1;
        roundCollected += contribution;
        roundExtras += fee;
        _pull(msg.sender, contribution + fee);
        emit Contributed(msg.sender, r, contribution, fee);
    }

    /// @notice Post collateral into a member's escrow. Anyone may post for a
    ///         member (a guarantor), only the member can ever withdraw it.
    function postCollateral(address member, uint256 amount) external nonReentrant {
        _requireLive();
        if (!isMember[member]) revert NotMember(member);
        if (amount == 0) revert ZeroAmount();
        escrow[member] += amount;
        _pull(msg.sender, amount);
        emit CollateralPosted(member, msg.sender, amount);
    }

    /// @notice Withdraw credit plus escrow above liability.
    function withdraw() external nonReentrant returns (uint256 amount) {
        uint256 c = credit[msg.sender];
        uint256 free = escrowFree(msg.sender);
        amount = c + free;
        if (amount == 0) revert NothingToWithdraw();
        credit[msg.sender] = 0;
        escrow[msg.sender] -= free;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Foreman takes accrued commission. Nothing else is reachable.
    function withdrawCommission() external nonReentrant returns (uint256 amount) {
        if (msg.sender != foreman) revert NotForeman(msg.sender);
        amount = foremanCredit;
        if (amount == 0) revert NothingToWithdraw();
        foremanCredit = 0;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Draw: member commit reveal (+ optional VRF)
    // ------------------------------------------------------------------

    /// @notice Commit hash = keccak256(abi.encode(fund, round, member, seed, salt)).
    function commitSeed(bytes32 h) external nonReentrant {
        if (mode != Mode.DRAW) revert WrongMode();
        _requireLive();
        _activeMember(msg.sender);
        uint256 r = round;
        if (block.timestamp >= graceEnd()) revert CommitClosed(r);
        if (h == bytes32(0)) revert BadReveal(msg.sender);
        if (commitment[r][msg.sender] != bytes32(0)) revert AlreadyCommitted(msg.sender, r);
        commitment[r][msg.sender] = h;
        if (revealBond != 0) {
            bondsHeld += revealBond;
            _pull(msg.sender, revealBond);
        }
        emit SeedCommitted(msg.sender, r);
    }

    function revealSeed(uint256 seed, bytes32 salt) external {
        if (mode != Mode.DRAW) revert WrongMode();
        _requireLive();
        uint256 r = round;
        _requireRevealWindow(r);
        if (revealed[r][msg.sender]) revert AlreadyRevealed(msg.sender);
        bytes32 h = commitment[r][msg.sender];
        if (h == bytes32(0) || h != keccak256(abi.encode(address(this), r, msg.sender, seed, salt))) {
            revert BadReveal(msg.sender);
        }
        revealed[r][msg.sender] = true;
        seedXor ^= seed;
        reveals += 1;
        if (revealBond != 0) {
            bondsHeld -= revealBond;
            credit[msg.sender] += revealBond;
        }
        emit SeedRevealed(msg.sender, r);
    }

    /// @notice Ask the external source for this round's word, after reveals close,
    ///         so member seeds are fixed before the VRF word is known.
    function requestRandomness() external nonReentrant {
        if (address(randomness) == address(0)) revert NoRandomnessSource();
        _requireLive();
        uint256 r = round;
        if (block.timestamp < revealEnd()) revert RoundOpen(r, revealEnd());
        if (vrfRequestedAt != 0) revert RandomnessAlreadyRequested(r);
        vrfRequestedAt = block.timestamp;
        bytes32 key = randomnessKey(r);
        randomness.requestRandomness(key);
        emit RandomnessRequested(r, key);
    }

    // ------------------------------------------------------------------
    // Auction: sealed commit reveal reverse auction
    // ------------------------------------------------------------------

    /// @notice Commit hash = keccak256(abi.encode(fund, round, member, bid, salt)).
    ///         The bid is the amount the member accepts instead of the pot.
    function commitBid(bytes32 h) external {
        if (mode != Mode.AUCTION) revert WrongMode();
        _requireLive();
        MemberState storage s = _activeMember(msg.sender);
        if (s.won) revert NotEligible(msg.sender);
        uint256 r = round;
        if (block.timestamp >= graceEnd()) revert CommitClosed(r);
        if (h == bytes32(0)) revert BadReveal(msg.sender);
        if (commitment[r][msg.sender] != bytes32(0)) revert AlreadyCommitted(msg.sender, r);
        commitment[r][msg.sender] = h;
        emit BidCommitted(msg.sender, r);
    }

    function revealBid(uint256 bid, bytes32 salt) external {
        if (mode != Mode.AUCTION) revert WrongMode();
        _requireLive();
        uint256 r = round;
        _requireRevealWindow(r);
        if (revealed[r][msg.sender]) revert AlreadyRevealed(msg.sender);
        bytes32 h = commitment[r][msg.sender];
        if (h == bytes32(0) || h != keccak256(abi.encode(address(this), r, msg.sender, bid, salt))) {
            revert BadReveal(msg.sender);
        }
        MemberState storage s = stateOf[msg.sender];
        if (!paid[r][msg.sender] || s.won || s.excluded) revert NotEligible(msg.sender);
        uint256 pot = expectedPot();
        uint256 minBid = (pot * (BPS - maxDiscountBps) + BPS - 1) / BPS; // round up
        if (bid > pot || bid < minBid) revert BidOutOfRange(bid, minBid, pot);
        // Winning must leave escrow covering the remaining contributions.
        if (escrow[msg.sender] + bid < (_members.length - s.paidCount) * contribution) {
            revert NotEligible(msg.sender);
        }
        revealed[r][msg.sender] = true;
        revealedBid[r][msg.sender] = bid;
        bidEntropy ^= uint256(salt);
        // Lowest bid wins. Equal lowest bids are settled by lot at settle()
        // (Chit Funds Act 1982 s.6(4)), seeded by every revealed salt.
        if (bestBidder == address(0) || bid < bestBid) {
            bestBidder = msg.sender;
            bestBid = bid;
            bestBidTies = 1;
        } else if (bid == bestBid) {
            bestBidTies += 1;
        }
        emit BidRevealed(msg.sender, r, bid);
    }

    // ------------------------------------------------------------------
    // Settlement (anyone, after the reveal window)
    // ------------------------------------------------------------------

    function settle() external nonReentrant {
        _requireLive();
        uint256 r = round;
        if (block.timestamp < revealEnd()) revert RoundOpen(r, revealEnd());

        _processDefaults(r);

        (address winner, uint256 eligibleCount) = _pickWinner(r);
        RoundResult memory res;
        res.pot = roundCollected;

        if (eligibleCount == 0) {
            // Every remaining member already won: this round funds refunds to
            // excluded members at the end (see _distributeReserve).
            uint256 reserved = roundCollected + roundExtras;
            settlementReserve += reserved;
            emit SettlementRound(r, reserved);
        } else {
            res.winner = winner;
            res.payout = res.pot;
            uint256 pool = roundExtras;
            if (mode == Mode.AUCTION && bestBidder != address(0) && eligibleCount > 1) {
                uint256 bid = bestBid < res.pot ? bestBid : res.pot;
                uint256 discount = res.pot - bid;
                uint256 cap = (res.pot * commissionBps) / BPS;
                res.commission = discount < cap ? discount : cap;
                res.payout = bid;
                pool += discount - res.commission;
            }
            (res.dividendEach, res.dust) = _payDividends(r, winner, pool);
            MemberState storage w = stateOf[winner];
            w.won = true;
            w.wonRound = uint32(r);
            escrow[winner] += res.payout;
            received[winner] += res.payout;
            foremanCredit += res.commission;
            emit RoundSettled(r, winner, res.pot, res.payout, res.commission, res.dividendEach, res.dust);
        }
        _results[r] = res;

        roundCollected = 0;
        roundExtras = 0;
        seedXor = 0;
        reveals = 0;
        bestBidder = address(0);
        bestBid = 0;
        bestBidTies = 0;
        bidEntropy = 0;
        vrfRequestedAt = 0;

        if (r == _members.length) {
            finalized = true;
            uint256 distributed = _distributeReserve();
            emit Finalized(distributed);
        } else {
            round = r + 1;
            roundStart = block.timestamp;
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _processDefaults(uint256 r) private {
        uint256 n = _members.length;
        uint256 c = contribution;
        bool draw = mode == Mode.DRAW;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            MemberState storage s = stateOf[m];
            if (!paid[r][m]) {
                if (s.won) {
                    // Winner in arrears: escrow pays the contribution.
                    uint256 e = escrow[m];
                    uint256 take = e < c ? e : c;
                    escrow[m] = e - take;
                    paid[r][m] = true;
                    s.paidCount += 1;
                    s.defaults += 1;
                    roundCollected += take;
                    uint256 penalty = (c * lateFeeBps) / BPS;
                    uint256 free = escrowFree(m);
                    if (penalty > free) penalty = free;
                    escrow[m] -= penalty;
                    roundExtras += penalty;
                    emit Slashed(m, r, take, c - take, penalty);
                } else if (!s.excluded) {
                    // Non winner in default: excluded from all future wins.
                    s.excluded = true;
                    s.defaults += 1;
                    excludedCount += 1;
                    emit MemberExcluded(m, r);
                }
            }
            if (draw && commitment[r][m] != bytes32(0) && !revealed[r][m]) {
                s.missedReveals += 1;
                uint256 bond = revealBond;
                if (bond != 0) {
                    bondsHeld -= bond;
                    roundExtras += bond;
                }
                emit RevealMissed(m, r, bond);
            }
        }
    }

    function _eligible(uint256 r, address m) private view returns (bool) {
        MemberState storage s = stateOf[m];
        return paid[r][m] && !s.won && !s.excluded;
    }

    function _pickWinner(uint256 r) private view returns (address winner, uint256 eligibleCount) {
        uint256 n = _members.length;
        address first;
        for (uint256 i; i < n; ++i) {
            if (_eligible(r, _members[i])) {
                if (eligibleCount == 0) first = _members[i];
                ++eligibleCount;
            }
        }
        if (eligibleCount <= 1) return (first, eligibleCount);
        if (mode == Mode.FIXED_ORDER) return (first, eligibleCount);
        if (mode == Mode.AUCTION) {
            // No bids: first eligible member in the published order wins the
            // full pot, no discount and no commission (documented rule).
            if (bestBidder == address(0)) return (first, eligibleCount);
            if (bestBidTies <= 1) return (bestBidder, eligibleCount);
            return (_tieByLot(r), eligibleCount);
        }
        return (_drawWinner(r), eligibleCount);
    }

    function _drawWinner(uint256 r) private view returns (address) {
        uint256 seed = _seed(r);
        uint256 n = _members.length;
        // Candidates: eligible members who did not skip a reveal they committed.
        uint256 k;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (_eligible(r, m) && !_skippedReveal(r, m)) ++k;
        }
        bool strict = k != 0;
        if (!strict) {
            for (uint256 i; i < n; ++i) {
                if (_eligible(r, _members[i])) ++k;
            }
        }
        uint256 pick = seed % k;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (_eligible(r, m) && (!strict || !_skippedReveal(r, m))) {
                if (pick == 0) return m;
                --pick;
            }
        }
        revert NotEligible(address(0)); // unreachable
    }

    function _tieByLot(uint256 r) private view returns (address) {
        uint256 pick = uint256(keccak256(abi.encode(bidEntropy, address(this), r))) % bestBidTies;
        uint256 n = _members.length;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (revealed[r][m] && revealedBid[r][m] == bestBid) {
                if (pick == 0) return m;
                --pick;
            }
        }
        return bestBidder; // unreachable
    }

    function _skippedReveal(uint256 r, address m) private view returns (bool) {
        return commitment[r][m] != bytes32(0) && !revealed[r][m];
    }

    function _seed(uint256 r) private view returns (uint256) {
        uint256 fallbackSeed = reveals != 0
            ? uint256(keccak256(abi.encode(seedXor, address(this), r)))
            : uint256(keccak256(abi.encode(block.prevrandao, address(this), r)));
        if (address(randomness) == address(0)) return fallbackSeed;
        if (vrfRequestedAt == 0) revert RandomnessPending(r);
        (bool ready, uint256 v) = randomness.randomnessOf(randomnessKey(r));
        if (ready) return uint256(keccak256(abi.encode(v, seedXor)));
        if (block.timestamp < vrfRequestedAt + vrfTimeout) revert RandomnessPending(r);
        return fallbackSeed;
    }

    /// @dev Splits `pool` equally among members who paid this round, other than
    ///      the winner. Rounding dust goes to the winner. Nothing is lost.
    function _payDividends(uint256 r, address winner, uint256 pool) private returns (uint256 each, uint256 dust) {
        if (pool == 0) return (0, 0);
        uint256 n = _members.length;
        uint256 k;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (m != winner && paid[r][m]) ++k;
        }
        if (k == 0) {
            credit[winner] += pool;
            received[winner] += pool;
            return (0, pool);
        }
        each = pool / k;
        dust = pool - each * k;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (m != winner && paid[r][m]) {
                credit[m] += each;
                received[m] += each;
            }
        }
        if (dust != 0) {
            credit[winner] += dust;
            received[winner] += dust;
        }
    }

    /// @dev End of fund, three steps, nothing lost:
    ///      1. excluded members get back what they paid minus forfeitBps (pro rata
    ///         if the reserve is short);
    ///      2. other members are made whole: anyone who paid in more than they
    ///         received (pots shrank after a default) gets the gap (pro rata if short);
    ///      3. anything left is split equally among non excluded members, dust to
    ///         the first of them.
    function _distributeReserve() private returns (uint256 total) {
        total = settlementReserve;
        if (total == 0) return 0;
        settlementReserve = 0;
        uint256 n = _members.length;
        uint256 claims;
        for (uint256 i; i < n; ++i) {
            MemberState storage s = stateOf[_members[i]];
            if (s.excluded) claims += (s.paidCount * contribution * (BPS - forfeitBps)) / BPS;
        }
        uint256 paidOut;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            MemberState storage s = stateOf[m];
            if (!s.excluded) continue;
            uint256 claim = (s.paidCount * contribution * (BPS - forfeitBps)) / BPS;
            uint256 amt = claims <= total ? claim : (claim * total) / claims;
            if (amt != 0) {
                credit[m] += amt;
                paidOut += amt;
                emit ExcludedRefund(m, amt);
            }
        }
        uint256 rest = total - paidOut;
        if (rest == 0) return total;
        rest -= _makeWhole(rest);
        if (rest == 0) return total;
        uint256 active = n - excludedCount;
        if (active == 0) {
            credit[_members[0]] += rest;
            return total;
        }
        uint256 share = rest / active;
        address firstActive;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (stateOf[m].excluded) continue;
            if (firstActive == address(0)) firstActive = m;
            credit[m] += share;
        }
        credit[firstActive] += rest - share * active;
    }

    function _deficit(address m) private view returns (uint256) {
        uint256 paidIn = stateOf[m].paidCount * contribution;
        uint256 got = received[m];
        return paidIn > got ? paidIn - got : 0;
    }

    function _makeWhole(uint256 budget) private returns (uint256 spent) {
        uint256 n = _members.length;
        uint256 deficits;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (!stateOf[m].excluded) deficits += _deficit(m);
        }
        if (deficits == 0) return 0;
        for (uint256 i; i < n; ++i) {
            address m = _members[i];
            if (stateOf[m].excluded) continue;
            uint256 d = _deficit(m);
            uint256 amt = deficits <= budget ? d : (d * budget) / deficits;
            if (amt != 0) {
                credit[m] += amt;
                received[m] += amt;
                spent += amt;
            }
        }
    }

    function _requireLive() private view {
        if (!started) revert NotStarted();
        if (finalized || cancelled) revert FundClosed();
    }

    function _activeMember(address m) private view returns (MemberState storage s) {
        if (!isMember[m]) revert NotMember(m);
        s = stateOf[m];
        if (s.excluded) revert Excluded(m);
    }

    function _requireRevealWindow(uint256 r) private view {
        uint256 t = block.timestamp;
        if (t < graceEnd() || t >= revealEnd()) revert NotRevealWindow(r);
    }

    function _pull(address from, uint256 amount) private {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        uint256 got = token.balanceOf(address(this)) - before;
        if (got != amount) revert UnsupportedToken(amount, got);
    }
}
