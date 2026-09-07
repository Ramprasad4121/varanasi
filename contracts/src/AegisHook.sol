// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/types/PoolOperation.sol";

import {AegisRegistry} from "./AegisRegistry.sol";
import {RiskGuard} from "./RiskGuard.sol";

/// @title AegisHook — Uniswap v4 `beforeSwap` risk gate for varanasi agents
/// @author Ramprasad
/// @notice A From-Scratch Uniswap v4 hook (ETHOnline 2026, Uniswap $3k track).
///         Any pool initialized with this hook only lets authorized low-risk
///         agents swap: `beforeSwap` reverts unless the swap's agent (tx.origin)
///         (1) holds a live `*.aegis.eth` identity in AegisRegistry,
///         (2) has a fresh (unexpired) attested risk score, and
///         (3) scores within the pool's cap (or the default cap).
/// @dev BaseHook-style: implements `IHooks` directly against real v4-core
///      interfaces and self-validates its permission bits in the constructor
///      (`Hooks.validateHookPermissions`), exactly like the canonical BaseHook.
///      This contract takes NO fee delta and overrides NO pool fee:
///      it returns `(beforeSwap.selector, ZERO_DELTA, 0)` on success.
///      Only `beforeSwap` is enabled, so the deployed address MUST satisfy
///      `uint160(addr) & 0x3FFF == 0x0080` (BEFORE_SWAP_FLAG). Deploy via
///      CREATE2 with a mined salt — see contracts/script/DeployHook.s.sol
///      and contracts/UNISWAP.md ("hook-mining step").
/// @dev Demo trust model (explicit): risk scores are written by owner/operators
///      via `setAgentRisk` (stand-in for the offchain varanasi reasoning engine +
///      premium-signal pipeline). The swap's agent is attributed to `tx.origin`
///      — correct when the agent EOA drives the swap tx through a router, but
///      a production build should use signed attestations / ERC-8004 identity
///      instead of tx.origin. See UNISWAP.md "Production hardening".
contract AegisHook is IHooks {
    using PoolIdLibrary for PoolKey;

    // ── Immutable wiring ──────────────────────────────────────────────

    /// @notice The PoolManager this hook serves. Only it may call the hooks.
    IPoolManager public immutable poolManager;

    // ── Mutable wiring + policy ───────────────────────────────────────

    /// @notice Live RiskGuard — single source of truth for identity + threshold.
    RiskGuard public riskGuard;
    /// @notice Hook admin (deployer). Manages operators, caps, wiring.
    address public owner;
    /// @notice Risk-engine writers allowed to call `setAgentRisk`.
    mapping(address => bool) public operators;

    /// @notice Basis-points denominator: scores and caps are 0–10_000.
    uint256 public constant MAX_BPS = 10_000;
    /// @notice Fallback cap for pools with no per-pool cap set.
    uint256 public defaultMaxAllowedBps;

    /// @notice Attested risk score for an agent wallet + expiry timestamp.
    /// @dev scoreBps is 0-10_000; deadline is a block.timestamp expiry.
    struct Attestation {
        uint64 scoreBps;
        uint64 deadline;
    }

    /// @notice agent => latest attested risk score (written by owner/operator).
    mapping(address => Attestation) public agentRisk;
    /// @notice poolId => per-pool cap. Ignored unless `poolCapSet[poolId]`.
    mapping(PoolId => uint256) public poolMaxAllowedBps;
    /// @notice poolId => whether a per-pool cap overrides the default.
    mapping(PoolId => bool) public poolCapSet;

    // ── Events ────────────────────────────────────────────────────────

    /// @notice Emitted when an agent risk attestation is written or refreshed.
    event AgentRiskSet(address indexed agent, uint64 scoreBps, uint64 deadline, address indexed setter);
    /// @notice Emitted when a per-pool cap is set or overwritten.
    event PoolCapSet(PoolId indexed poolId, uint256 maxAllowedBps, address indexed setter);
    /// @notice Emitted when a per-pool cap is cleared (falls back to default).
    event PoolCapCleared(PoolId indexed poolId, address indexed setter);
    /// @notice Emitted when the fallback default cap is updated.
    event DefaultCapSet(uint256 maxAllowedBps, address indexed setter);
    /// @notice Emitted when a risk-engine writer is granted or revoked.
    event OperatorSet(address indexed operator, bool allowed, address indexed setter);
    /// @notice Emitted when the bound RiskGuard is repointed.
    event RiskGuardUpdated(address indexed riskGuard, address indexed setter);
    /// @notice Emitted when hook admin rights are transferred.
    event OwnershipTransferred(address indexed next, address indexed prev);
    /// @notice Emitted when a swap passes the identity + risk gate.
    event SwapAuthorized(address indexed agent, PoolId indexed poolId, uint256 scoreBps, uint256 maxAllowedBps);

    // ── Errors ────────────────────────────────────────────────────────

    /// @notice Caller is not the bound PoolManager.
    error NotPoolManager(address caller);
    /// @notice No attestation exists, or it expired (stale risk data).
    error StaleAttestation(address agent);
    /// @notice Caller is not the hook owner.
    error NotOwner(address caller);
    /// @notice Caller is neither owner nor an authorized operator.
    error NotOperator(address caller);
    /// @notice Address argument is zero.
    error ZeroAddress();
    /// @notice Risk score exceeds 10_000 bps.
    error BadScore(uint256 scoreBps);
    /// @notice Deadline is not in the future.
    error BadDeadline(uint64 deadline);
    /// @notice Cap exceeds 10_000 bps.
    error BadCap(uint256 maxAllowedBps);
    /// @notice A non-swap hook entrypoint was called (never happens: bits unset).
    error WrongHookFunction();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != owner && !operators[msg.sender]) revert NotOperator(msg.sender);
        _;
    }

    /// @notice Deploy a beforeSwap-only hook; validates address permission bits.
    /// @param _poolManager Bound PoolManager (Sepolia: 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543).
    /// @param _riskGuard Live RiskGuard (Sepolia: 0xc35861C4dbE63A9C8cFEfd32C671998151c217cA).
    /// @param _defaultMaxAllowedBps Fallback per-swap cap in bps (e.g. 5_000 = 50%).
    /// @param _owner Hook admin (pass the deployer EOA; required because a
    ///        CREATE2-factory deployment would otherwise leave `msg.sender` as
    ///        the factory contract, owned by no one).
    /// @dev Reverts `Hooks.HookAddressNotValid` unless the deployment address
    ///      carries exactly the beforeSwap permission bit (mine the CREATE2 salt).
    constructor(IPoolManager _poolManager, RiskGuard _riskGuard, uint256 _defaultMaxAllowedBps, address _owner) {
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
        if (address(_poolManager) == address(0) || address(_riskGuard) == address(0)) revert ZeroAddress();
        if (_owner == address(0)) revert ZeroAddress();
        if (_defaultMaxAllowedBps > MAX_BPS) revert BadCap(_defaultMaxAllowedBps);
        poolManager = _poolManager;
        riskGuard = _riskGuard;
        owner = _owner;
        defaultMaxAllowedBps = _defaultMaxAllowedBps;
        emit DefaultCapSet(_defaultMaxAllowedBps, msg.sender);
    }

    // ── Hook permissions (beforeSwap only) ────────────────────────────

    /// @notice Declares the hook's permission bits. Only `beforeSwap` is set,
    ///         so the deployed address must equal `...0080` in its low 14 bits.
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ── Core gate ─────────────────────────────────────────────────────

    /// @notice Gate every swap through varanasi identity + attested risk.
    /// @param key Pool key of the swap being gated.
    /// @return selector beforeSwap selector on success.
    /// @return delta Zero delta (hook takes no fees).
    /// @return fee Zero fee override.
    /// @dev Attribute the swap to `tx.origin` (the agent EOA driving the tx).
    ///      Reverts `RiskGuard.UnauthorizedAgent` (no live `*.aegis.eth`
    ///      identity), `StaleAttestation` (no fresh score), or
    ///      `RiskGuard.RiskTooHigh` (score over pool/default cap).
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata, bytes calldata)
        external
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (msg.sender != address(poolManager)) revert NotPoolManager(msg.sender);
        address agent = tx.origin;
        if (!riskGuard.registry().isAuthorized(agent)) revert RiskGuard.UnauthorizedAgent(agent);
        Attestation memory a = agentRisk[agent];
        if (a.deadline == 0 || block.timestamp > a.deadline) revert StaleAttestation(agent);
        PoolId poolId = key.toId();
        uint256 cap = poolCapSet[poolId] ? poolMaxAllowedBps[poolId] : defaultMaxAllowedBps;
        // Single source of truth: live RiskGuard re-checks identity + threshold.
        riskGuard.authorize(agent, a.scoreBps, cap);
        emit SwapAuthorized(agent, poolId, a.scoreBps, cap);
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    // ── Risk attestation writes (owner/operator) ──────────────────────

    /// @notice Attest (or refresh) an agent's risk score until `deadline`.
    /// @param agent Agent wallet to attest.
    /// @param scoreBps Risk score in bps (must be <= 10_000).
    /// @param deadline Expiry timestamp (must be in the future).
    /// @dev Demo stand-in for the offchain reasoning engine. Production:
    ///      replace with EIP-712 signed attestations verified onchain.
    function setAgentRisk(address agent, uint256 scoreBps, uint64 deadline) external onlyOperator {
        if (agent == address(0)) revert ZeroAddress();
        if (scoreBps > MAX_BPS) revert BadScore(scoreBps);
        if (deadline <= block.timestamp) revert BadDeadline(deadline);
        agentRisk[agent] = Attestation(uint64(scoreBps), deadline);
        emit AgentRiskSet(agent, uint64(scoreBps), deadline, msg.sender);
    }

    // ── Policy admin (owner) ──────────────────────────────────────────

    /// @notice Set (or overwrite) the per-pool cap for `key`'s pool.
    /// @param key Pool key whose pool cap is set.
    /// @param maxAllowedBps New per-pool cap in bps (must be <= 10_000).
    function setPoolCap(PoolKey calldata key, uint256 maxAllowedBps) external onlyOwner {
        if (maxAllowedBps > MAX_BPS) revert BadCap(maxAllowedBps);
        PoolId poolId = key.toId();
        poolMaxAllowedBps[poolId] = maxAllowedBps;
        poolCapSet[poolId] = true;
        emit PoolCapSet(poolId, maxAllowedBps, msg.sender);
    }

    /// @notice Clear a per-pool cap so the pool falls back to the default cap.
    /// @param key Pool key whose per-pool cap is cleared.
    function clearPoolCap(PoolKey calldata key) external onlyOwner {
        PoolId poolId = key.toId();
        poolCapSet[poolId] = false;
        emit PoolCapCleared(poolId, msg.sender);
    }

    /// @notice Set the fallback cap for pools without a per-pool cap.
    /// @param maxAllowedBps New default cap in bps (must be <= 10_000).
    function setDefaultMaxAllowedBps(uint256 maxAllowedBps) external onlyOwner {
        if (maxAllowedBps > MAX_BPS) revert BadCap(maxAllowedBps);
        defaultMaxAllowedBps = maxAllowedBps;
        emit DefaultCapSet(maxAllowedBps, msg.sender);
    }

    /// @notice Repoint at a new RiskGuard (e.g. after a guard upgrade).
    /// @param _riskGuard New RiskGuard contract.
    function setRiskGuard(RiskGuard _riskGuard) external onlyOwner {
        if (address(_riskGuard) == address(0)) revert ZeroAddress();
        riskGuard = _riskGuard;
        emit RiskGuardUpdated(address(_riskGuard), msg.sender);
    }

    /// @notice Grant/revoke risk-engine writer rights.
    /// @param operator Writer address to update.
    /// @param allowed True to grant, false to revoke.
    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorSet(operator, allowed, msg.sender);
    }

    /// @notice Hand admin rights to `next` (e.g. a multisig post-deploy).
    /// @param next New owner address (must be non-zero).
    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = next;
        emit OwnershipTransferred(next, prev);
    }

    // ── Views ─────────────────────────────────────────────────────────

    /// @notice Effective cap for `key`'s pool (per-pool cap or default).
    /// @param key Pool key to query.
    /// @return cap Effective cap in bps.
    function effectiveCap(PoolKey calldata key) external view returns (uint256) {
        PoolId poolId = key.toId();
        return poolCapSet[poolId] ? poolMaxAllowedBps[poolId] : defaultMaxAllowedBps;
    }

    /// @notice Live registry behind the bound RiskGuard.
    /// @return registry AegisRegistry used for identity checks.
    function registry() external view returns (AegisRegistry) {
        return riskGuard.registry();
    }

    // ── Unused IHooks entrypoints (unreachable: permission bits unset) ─

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        override
        returns (bytes4, int128)
    {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert WrongHookFunction();
    }

    /// @notice Unused hook entrypoint: always reverts (only beforeSwap is enabled).
    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert WrongHookFunction();
    }
}
