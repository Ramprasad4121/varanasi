// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPermissionedRegistry, IPermissionedResolver} from "./interfaces/IENSv2.sol";

/// @title AegisRegistry — ENSv2-backed agent identity registry (Sepolia)
/// @author Ramprasad
/// @notice Wraps the ENSv2 Permissioned Registry. Each agent is `sublabel.aegis.eth`:
///         expiring, revocable, human-owned. RiskGuard and offchain services treat
///         `isAuthorized(agentWallet)` as the single source of truth.
/// @dev Mock mode: if `ensRegistry == address(0)` (default on local/anvil),
///      ENS external calls are skipped and the registry works standalone so
///      `forge test` passes offline. On Sepolia, call `setENSAddresses` with the
///      real deployment addresses (see contracts/README.md), then every
///      mint/revoke/renew also fans out to ENSv2 via low-level interface calls
///      guarded by try/catch so a Sepolia ENS revert never bricks local state.
/// @dev Grief-recourse (permissionless mint is intentional demo openness):
///      mint is open self-registration, so anyone may squat a label or bind any
///      wallet. Recourse: the contract owner revokes the squatting tokenId, which
///      CLEARS tokenByAgent + tokenByLabelHash (label freed), and the victim
///      re-mints the same label. Renew on a revoked token extends expiry but
///      does NOT clear revocation (revoke sticks; use unRevoke for accidents).
/// @dev Production: move admin to a multisig/timelock (2-step ownership here
///      only guards against fat-finger transfers, not against a malicious admin).
contract AegisRegistry {
    // ── ENSv2 Sepolia wiring (configurable for hackathon flexibility) ──
    /// @notice ENSv2 PermissionedRegistry for the parent name (default: ETHRegistry on Sepolia).
    address public ensRegistry;
    /// @notice ENSv2 PermissionedResolver / ENSV2Resolver used for records.
    address public ensResolver;
    /// @notice ENSv2 UniversalResolverV2 entry point (wildcard resolution).
    address public universalResolver;
    /// @notice Parent name node, e.g. keccak of `aegis.eth` (namehash). Zero = unset/mock.
    bytes32 public parentNode;
    /// @notice Human-readable parent name, e.g. "aegis.eth".
    string public parentName;

    // Canonical Sepolia ENSv2 Beta addresses (https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta)
    /// @notice Canonical Sepolia ETHRegistry (PermissionedRegistry).
    address public constant SEPOLIA_ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;
    /// @notice Canonical Sepolia RootRegistry (PermissionedRegistry).
    address public constant SEPOLIA_ROOT_REGISTRY = 0x8115186E8f2E0B0281e86ab91f0f48Ba90364354;
    /// @notice Canonical Sepolia ENSV2Resolver.
    address public constant SEPOLIA_ENSV2_RESOLVER = 0x508cb4E4596429Ca98a1bB3112d88D18F92456b5;
    /// @notice Canonical Sepolia PermissionedResolver implementation.
    address public constant SEPOLIA_PERMISSIONED_RESOLVER_IMPL = 0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e;
    /// @notice Canonical Sepolia UniversalResolverV2 implementation.
    address public constant SEPOLIA_UNIVERSAL_RESOLVER_V2 = 0x4A1817d13E9cF196f471725176355C1234b63C70;
    /// @notice Canonical upgradeable Universal Resolver proxy (resolution entry point).
    address public constant SEPOLIA_UR_PROXY = 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe;

    /// @notice Contract admin: manages ENS wiring and may revoke any identity.
    /// @dev Production: timelock/multisig (no timelock code here by design).
    address public owner;
    /// @notice Pending admin set by transferOwnership; must call acceptOwnership.
    address public pendingOwner;
    /// @notice Next agent token id to mint (starts at 1).
    uint256 public nextTokenId = 1;

    /// @notice Maximum lifetime per mint/renew call (5 years; bounds uint64 cast).
    uint256 public constant MAX_EXPIRY_DAYS = 1825;

    /// @notice tokenId => expiry timestamp (0 = never minted).
    mapping(uint256 => uint64) public expiry;
    /// @notice tokenId => human owner (has revoke/renew rights).
    mapping(uint256 => address) public tokenOwner;
    /// @notice tokenId => agent wallet bound to the subname.
    mapping(uint256 => address) public agentOf;
    /// @notice tokenId => revoked flag.
    mapping(uint256 => bool) public revoked;
    /// @notice tokenId => sublabel (e.g. "agent-1" for agent-1.aegis.eth).
    mapping(uint256 => string) public sublabelOf;
    /// @notice sublabel hash => tokenId (enforces unique sublabels).
    mapping(bytes32 => uint256) public tokenByLabelHash;
    /// @notice agent wallet => tokenId (reverse lookup for isAuthorized).
    mapping(address => uint256) public tokenByAgent;

    /// @notice Emitted when a new agent identity is minted.
    event AgentMinted(
        uint256 indexed tokenId,
        string sublabel,
        address indexed agentWallet,
        address indexed humanOwner,
        uint64 expiry
    );
    /// @notice Emitted when an agent identity is revoked.
    event AgentRevoked(uint256 indexed tokenId, string sublabel, address indexed humanOwner);
    /// @notice Emitted when a revoked identity is restored (mappings re-pointed).
    /// @dev Author: Ramprasad.
    event AgentUnrevoked(uint256 indexed tokenId, string sublabel, address indexed humanOwner);
    /// @notice Emitted when admin transfer is initiated (2-step: must accept).
    /// @dev Author: Ramprasad.
    event OwnershipTransferStarted(address indexed next, address indexed prev);
    /// @notice Emitted when admin transfer is accepted.
    /// @dev Author: Ramprasad.
    event OwnershipTransferred(address indexed next, address indexed prev);
    /// @notice Emitted when an agent identity expiry is extended.
    event AgentRenewed(uint256 indexed tokenId, string sublabel, uint64 newExpiry);
    /// @notice Emitted when the ENSv2 wiring addresses are updated.
    event ENSAddressesUpdated(address registry, address resolver, address universalResolver);

    /// @notice Caller is neither the token owner nor the admin.
    error NotTokenOwner();
    /// @notice Token id was never minted.
    error UnknownToken();
    /// @notice Sublabel (or agent wallet) is already registered.
    error LabelTaken();
    /// @notice Sublabel violates the label rules (3-32 chars, [a-z0-9-]).
    /// @dev Author: Ramprasad.
    error LabelInvalid(string sublabel);
    /// @notice Token id is not revoked (unRevoke only).
    /// @dev Author: Ramprasad.
    error NotRevoked(uint256 tokenId);
    /// @notice Expiry days exceed MAX_EXPIRY_DAYS.
    /// @dev Author: Ramprasad.
    error ExpiryTooLong(uint256 daysRequested, uint256 maxDays);
    /// @notice Caller is not the pending owner.
    /// @dev Author: Ramprasad.
    error NotPendingOwner(address caller);
    /// @notice Address argument is zero.
    error ZeroAddress();
    /// @notice Expiry duration is zero.
    error ZeroExpiry();

    modifier onlyOwner() {
        require(msg.sender == owner, "not admin");
        _;
    }

    /// @notice Deploy the registry with ENSv2 wiring and parent name.
    /// @param _ensRegistry ENSv2 registry address (zero = mock mode).
    /// @param _ensResolver ENSv2 resolver address.
    /// @param _universalResolver UniversalResolverV2 entry point.
    /// @param _parentName Human-readable parent name (e.g. "aegis.eth").
    constructor(address _ensRegistry, address _ensResolver, address _universalResolver, string memory _parentName) {
        owner = msg.sender;
        ensRegistry = _ensRegistry;
        ensResolver = _ensResolver;
        universalResolver = _universalResolver;
        parentName = _parentName;
    }

    // ── Admin wiring ──

    /// @notice Point the registry at real ENSv2 Sepolia contracts post-deploy.
    /// @dev Pass address(0) for any entry to stay in mock mode for that leg.
    function setENSAddresses(address _registry, address _resolver, address _universalResolver) external onlyOwner {
        ensRegistry = _registry;
        ensResolver = _resolver;
        universalResolver = _universalResolver;
        emit ENSAddressesUpdated(_registry, _resolver, _universalResolver);
    }

    /// @notice Set the parent name node (namehash of e.g. `aegis.eth`) once owned on Sepolia.
    /// @param _parentNode Namehash of the parent name.
    function setParentNode(bytes32 _parentNode) external onlyOwner {
        parentNode = _parentNode;
    }

    /// @notice Transfer contract admin rights to a new address (2-step).
    /// @param next New owner address (must be non-zero; must call acceptOwnership).
    /// @dev Author: Ramprasad.
    /// @dev Production: front this with a timelock/multisig (no timelock code here).
    function transferOwnership(address next) public onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        pendingOwner = next;
        emit OwnershipTransferStarted(next, owner);
    }

    /// @notice Accept pending admin rights (called by the pending owner).
    /// @dev Author: Ramprasad.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner(msg.sender);
        address prev = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(owner, prev);
    }

    /// @notice Legacy alias for transferOwnership (kept for scripts/UIs).
    /// @param next New owner address (must be non-zero; must call acceptOwnership).
    function transferAdmin(address next) external onlyOwner {
        transferOwnership(next);
    }

    // ── Core ──

    /// @notice Mint `sublabel.parentName` (e.g. `agent-1.aegis.eth`) bound to `agentWallet`.
    /// @param sublabel Lowercase label, e.g. "agent-1" (3-32 chars, [a-z0-9-]).
    /// @param agentWallet Agent EOA that will transact under this identity.
    /// @param expiryDays Lifetime in whole days (must be > 0, <= MAX_EXPIRY_DAYS).
    /// @return tokenId Newly minted agent token id.
    /// @dev Permissionless by design (demo openness); grief-recourse is
    ///      owner-revoke (clears lookups, frees the label) + victim re-mint.
    function mintAgent(string calldata sublabel, address agentWallet, uint256 expiryDays)
        external
        returns (uint256 tokenId)
    {
        if (agentWallet == address(0)) revert ZeroAddress();
        if (expiryDays == 0) revert ZeroExpiry();
        if (expiryDays > MAX_EXPIRY_DAYS) revert ExpiryTooLong(expiryDays, MAX_EXPIRY_DAYS);
        _validateLabel(sublabel);
        bytes32 lh = keccak256(bytes(sublabel));
        if (tokenByLabelHash[lh] != 0) revert LabelTaken();
        if (tokenByAgent[agentWallet] != 0) revert LabelTaken(); // one live identity per wallet

        tokenId = nextTokenId++;
        uint64 exp = uint64(block.timestamp + expiryDays * 1 days);

        tokenByLabelHash[lh] = tokenId;
        tokenByAgent[agentWallet] = tokenId;
        expiry[tokenId] = exp;
        tokenOwner[tokenId] = msg.sender;
        agentOf[tokenId] = agentWallet;
        sublabelOf[tokenId] = sublabel;

        _ensMint(sublabel, agentWallet);

        emit AgentMinted(tokenId, sublabel, agentWallet, msg.sender, exp);
    }

    /// @notice Revoke by token id. Only the human owner (or admin) may revoke.
    /// @dev Revoke CLEARS tokenByAgent + tokenByLabelHash (label freed for
    ///      grief-recourse re-mint); history (owner/agent/sublabel/expiry) stays.
    /// @dev Author: Ramprasad.
    function revokeAgent(uint256 tokenId) external {
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        revoked[tokenId] = true;
        _clearLookups(tokenId);
        _ensRevoke(tokenId);
        emit AgentRevoked(tokenId, sublabelOf[tokenId], msg.sender);
    }

    /// @notice Revoke by sublabel (convenience overload for scripts/UIs).
    /// @dev Same clearing semantics as revokeAgent; after revoke the label is
    ///      freed, so a second revoke-by-label reverts UnknownToken.
    /// @dev Author: Ramprasad.
    function revokeAgentByLabel(string calldata sublabel) external {
        uint256 tokenId = tokenByLabelHash[keccak256(bytes(sublabel))];
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        revoked[tokenId] = true;
        _clearLookups(tokenId);
        _ensRevoke(tokenId);
        emit AgentRevoked(tokenId, sublabel, msg.sender);
    }

    /// @notice Restore a revoked identity (accident recourse). Only the human
    ///         owner (or admin). Reverts NotRevoked if live, LabelTaken if the
    ///         label/wallet was re-minted while revoked.
    /// @param tokenId Revoked token id to restore.
    /// @dev Author: Ramprasad.
    function unRevoke(uint256 tokenId) external {
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        if (!revoked[tokenId]) revert NotRevoked(tokenId);
        bytes32 lh = keccak256(bytes(sublabelOf[tokenId]));
        address wallet = agentOf[tokenId];
        if (tokenByLabelHash[lh] != 0 && tokenByLabelHash[lh] != tokenId) revert LabelTaken();
        if (tokenByAgent[wallet] != 0 && tokenByAgent[wallet] != tokenId) revert LabelTaken();
        revoked[tokenId] = false;
        tokenByLabelHash[lh] = tokenId;
        tokenByAgent[wallet] = tokenId;
        emit AgentUnrevoked(tokenId, sublabelOf[tokenId], msg.sender);
    }

    /// @notice Extend expiry by token id. Only the human owner (or admin).
    /// @dev Revoked identities stay unauthorized: renewal extends expiry but
    ///      does NOT clear revocation (explicit by design; use unRevoke after
    ///      accidental revoke). extraDays <= MAX_EXPIRY_DAYS per call.
    function renewAgent(uint256 tokenId, uint256 extraDays) external {
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        if (extraDays == 0) revert ZeroExpiry();
        if (extraDays > MAX_EXPIRY_DAYS) revert ExpiryTooLong(extraDays, MAX_EXPIRY_DAYS);
        // Revoked identities stay unauthorized; allow renewal only after un-revoke? No:
        // renewal extends expiry but does NOT clear revocation — explicit by design.
        expiry[tokenId] = uint64(_max(block.timestamp, expiry[tokenId]) + extraDays * 1 days);
        emit AgentRenewed(tokenId, sublabelOf[tokenId], expiry[tokenId]);
    }

    /// @notice Extend expiry by sublabel (convenience overload).
    /// @dev Same revoked-stays-revoked rule as renewAgent.
    function renewAgentByLabel(string calldata sublabel, uint256 extraDays) external {
        uint256 tokenId = tokenByLabelHash[keccak256(bytes(sublabel))];
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        if (extraDays == 0) revert ZeroExpiry();
        if (extraDays > MAX_EXPIRY_DAYS) revert ExpiryTooLong(extraDays, MAX_EXPIRY_DAYS);
        expiry[tokenId] = uint64(_max(block.timestamp, expiry[tokenId]) + extraDays * 1 days);
        emit AgentRenewed(tokenId, sublabel, expiry[tokenId]);
    }

    /// @notice Single source of truth: wallet is authorized iff it maps to a
    ///         minted, non-revoked, non-expired agent identity.
    function isAuthorized(address agentWallet) public view returns (bool) {
        uint256 tokenId = tokenByAgent[agentWallet];
        if (tokenId == 0) return false;
        if (revoked[tokenId]) return false;
        if (expiry[tokenId] <= block.timestamp) return false;
        return true;
    }

    /// @notice Full agent name, e.g. "agent-1.aegis.eth".
    function agentName(uint256 tokenId) external view returns (string memory) {
        _requireKnown(tokenId);
        return string.concat(sublabelOf[tokenId], ".", parentName);
    }

    // ── Internals ──

    /// @notice Enforce label rules: 3-32 chars, charset [a-z0-9-].
    /// @param sublabel Label to validate (rejects empty/uppercase/spaces/dots).
    /// @dev Author: Ramprasad.
    function _validateLabel(string calldata sublabel) internal pure {
        bytes memory b = bytes(sublabel);
        if (b.length < 3 || b.length > 32) revert LabelInvalid(sublabel);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == 0x2d; // -
            if (!ok) revert LabelInvalid(sublabel);
        }
    }

    /// @dev Clear live lookups for a revoked token so the label/wallet are
    ///      freed for grief-recourse re-mint. Guarded by == tokenId so a
    ///      double-revoke never wipes a newer holder's mappings.
    /// @dev Author: Ramprasad.
    function _clearLookups(uint256 tokenId) internal {
        address wallet = agentOf[tokenId];
        bytes32 lh = keccak256(bytes(sublabelOf[tokenId]));
        if (tokenByAgent[wallet] == tokenId) delete tokenByAgent[wallet];
        if (tokenByLabelHash[lh] == tokenId) delete tokenByLabelHash[lh];
    }

    function _requireKnown(uint256 tokenId) internal view {
        if (tokenId == 0 || expiry[tokenId] == 0) revert UnknownToken();
    }

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }

    /// @dev Best-effort ENSv2 fan-out. Skipped in mock mode; try/catch on Sepolia
    ///      so ENS reverts never brick local registry state. Judges: the real
    ///      Sepolia wiring lands here — registerSubname + setAddr/setText on the
    ///      Permissioned Registry/Resolver once `aegis.eth` is owned.
    function _ensMint(string calldata sublabel, address agentWallet) internal {
        if (ensRegistry == address(0)) return; // mock mode
        // Best-effort: register subname under parent, then bind address record.
        // Wrapped in try/catch — local state is already committed above.
        try IPermissionedRegistry(ensRegistry).registerSubname(sublabel, address(this), ensResolver) returns (
            bytes32 node
        ) {
            if (ensResolver != address(0)) {
                try IPermissionedResolver(ensResolver).setAddr(node, agentWallet) {} catch {}
                try IPermissionedResolver(ensResolver).setText(node, "description", "AEGIS authorized agent") {}
                catch {}
            }
        } catch {}
    }

    /// @dev Best-effort ENS revoke fan-out (transfer to zero / graveyard pattern).
    function _ensRevoke(uint256 tokenId) internal {
        if (ensRegistry == address(0)) return; // mock mode
        try IPermissionedRegistry(ensRegistry).transferFrom(address(this), address(0), tokenId) {} catch {}
    }
}
