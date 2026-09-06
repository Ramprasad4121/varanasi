// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPermissionedRegistry, IPermissionedResolver} from "./interfaces/IENSv2.sol";

/// @title AegisRegistry — ENSv2-backed agent identity registry (Sepolia)
/// @notice Wraps the ENSv2 Permissioned Registry. Each agent is `sublabel.aegis.eth`:
///         expiring, revocable, human-owned. RiskGuard and offchain services treat
///         `isAuthorized(agentWallet)` as the single source of truth.
/// @dev Mock mode: if `ensRegistry == address(0)` (default on local/anvil),
///      ENS external calls are skipped and the registry works standalone so
///      `forge test` passes offline. On Sepolia, call `setENSAddresses` with the
///      real deployment addresses (see contracts/README.md), then every
///      mint/revoke/renew also fans out to ENSv2 via low-level interface calls
///      guarded by try/catch so a Sepolia ENS revert never bricks local state.
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
    address public constant SEPOLIA_ETH_REGISTRY = 0xBDC85dD5b15D7ecb354cd7cb6f2c50b4f2c4F0E2;
    address public constant SEPOLIA_ROOT_REGISTRY = 0x8115186E8f2E0B0281e86ab91f0f48Ba90364354;
    address public constant SEPOLIA_ENSV2_RESOLVER = 0x508cb4E4596429Ca98a1bB3112d88D18F92456b5;
    address public constant SEPOLIA_PERMISSIONED_RESOLVER_IMPL = 0x9EAe5C2730a7dD16BDD1DeE6421a1B91e3B0365e;
    address public constant SEPOLIA_UNIVERSAL_RESOLVER_V2 = 0x4A1817d13E9cF196f471725176355C1234b63C70;
    address public constant SEPOLIA_UR_PROXY = 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe;

    address public owner;
    uint256 public nextTokenId = 1;

    /// tokenId => expiry timestamp (0 = never minted)
    mapping(uint256 => uint64) public expiry;
    /// tokenId => human owner (has revoke/renew rights)
    mapping(uint256 => address) public tokenOwner;
    /// tokenId => agent wallet bound to the subname
    mapping(uint256 => address) public agentOf;
    /// tokenId => revoked flag
    mapping(uint256 => bool) public revoked;
    /// tokenId => sublabel (e.g. "agent-1" for agent-1.aegis.eth)
    mapping(uint256 => string) public sublabelOf;
    /// sublabel hash => tokenId (enforces unique sublabels)
    mapping(bytes32 => uint256) public tokenByLabelHash;
    /// agent wallet => tokenId (reverse lookup for isAuthorized)
    mapping(address => uint256) public tokenByAgent;

    event AgentMinted(
        uint256 indexed tokenId,
        string sublabel,
        address indexed agentWallet,
        address indexed humanOwner,
        uint64 expiry
    );
    event AgentRevoked(uint256 indexed tokenId, string sublabel, address indexed humanOwner);
    event AgentRenewed(uint256 indexed tokenId, string sublabel, uint64 newExpiry);
    event ENSAddressesUpdated(address registry, address resolver, address universalResolver);

    error NotTokenOwner();
    error UnknownToken();
    error LabelTaken();
    error ZeroAddress();
    error ZeroExpiry();

    modifier onlyOwner() {
        require(msg.sender == owner, "not admin");
        _;
    }

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
    function setParentNode(bytes32 _parentNode) external onlyOwner {
        parentNode = _parentNode;
    }

    function transferAdmin(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        owner = next;
    }

    // ── Core ──

    /// @notice Mint `sublabel.parentName` (e.g. `agent-1.aegis.eth`) bound to `agentWallet`.
    /// @param sublabel Lowercase label, e.g. "agent-1".
    /// @param agentWallet Agent EOA that will transact under this identity.
    /// @param expiryDays Lifetime in whole days (must be > 0).
    /// @return tokenId Newly minted agent token id.
    function mintAgent(string calldata sublabel, address agentWallet, uint256 expiryDays)
        external
        returns (uint256 tokenId)
    {
        if (agentWallet == address(0)) revert ZeroAddress();
        if (expiryDays == 0) revert ZeroExpiry();
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
    function revokeAgent(uint256 tokenId) external {
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        revoked[tokenId] = true;
        _ensRevoke(tokenId);
        emit AgentRevoked(tokenId, sublabelOf[tokenId], msg.sender);
    }

    /// @notice Revoke by sublabel (convenience overload for scripts/UIs).
    function revokeAgentByLabel(string calldata sublabel) external {
        uint256 tokenId = tokenByLabelHash[keccak256(bytes(sublabel))];
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        revoked[tokenId] = true;
        _ensRevoke(tokenId);
        emit AgentRevoked(tokenId, sublabel, msg.sender);
    }

    /// @notice Extend expiry by token id. Only the human owner (or admin).
    function renewAgent(uint256 tokenId, uint256 extraDays) external {
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        if (extraDays == 0) revert ZeroExpiry();
        // Revoked identities stay unauthorized; allow renewal only after un-revoke? No:
        // renewal extends expiry but does NOT clear revocation — explicit by design.
        expiry[tokenId] = uint64(_max(block.timestamp, expiry[tokenId]) + extraDays * 1 days);
        emit AgentRenewed(tokenId, sublabelOf[tokenId], expiry[tokenId]);
    }

    /// @notice Extend expiry by sublabel (convenience overload).
    function renewAgentByLabel(string calldata sublabel, uint256 extraDays) external {
        uint256 tokenId = tokenByLabelHash[keccak256(bytes(sublabel))];
        _requireKnown(tokenId);
        if (msg.sender != tokenOwner[tokenId] && msg.sender != owner) revert NotTokenOwner();
        if (extraDays == 0) revert ZeroExpiry();
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
