// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IENSv2 — minimal ENSv2 (Sepolia beta) integration surface for AEGIS
/// @notice Real ENSv2 Sepolia integration point. Full ABIs + deployment addresses:
///         https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta
///         Source: https://github.com/ensdomains/contracts-v2 (contracts/src/registry/PermissionedRegistry.sol,
///         contracts/src/resolver/PermissionedResolver.sol, contracts/src/universalResolver/UniversalResolverV2.sol)
/// @dev AegisRegistry talks to ENSv2 only through these interfaces so the
///      Sepolia addresses can be wired post-deploy via `setENSAddresses`.
///      All external ENS calls are wrapped in try/catch (or skipped when the
///      address is unset) so the contract is deployable standalone and tests
///      pass offline in mock mode.

/// @notice Subset of ENSv2 PermissionedRegistry used by AegisRegistry.
/// @dev Real contract: PermissionedRegistry.sol in ensdomains/contracts-v2.
///      Canonical Sepolia deployments:
///      - ETHRegistry (PermissionedRegistry): 0xbdc85DD5B15D7ecB354CD7cB6f2C50B4F2C4f0e2
///      - RootRegistry (PermissionedRegistry): 0x8115186E8F2E0b0281E86Ab91f0f48Ba90364354
interface IPermissionedRegistry {
    /// @notice Register a subname under an already-owned parent name.
    /// @dev Signature simplified for the hackathon wrapper. The real
    ///      PermissionedRegistry exposes richer registrar flows (see
    ///      ETHRegistrar 0xa88553f454b77203b0d036a05C894d555EAaa2Cc and
    ///      BatchRegistrar 0x8b16d15F3e51074d0e06f3cF4a0053f7CB92a7FB).
    ///      Wire the exact calldata once `aegis.eth` is owned on Sepolia.
    function registerSubname(string calldata label, address owner, address resolver) external returns (bytes32 node);

    /// @notice Point a name node at a subregistry (UserRegistry) deployment.
    /// @dev Real flow: deploy a UserRegistry clone (impl:
    ///      0x624a25d67B59d587752ebeC8DDED8827DAE52050) for `aegis.eth`,
    ///      then call setSubregistry on the parent ETHRegistry.
    function setSubregistry(bytes32 node, address subregistry) external;

    /// @notice Set the resolver contract responsible for a name node.
    function setResolver(bytes32 node, address resolver) external;

    /// @notice Transfer / burn a name (used for revoke: transfer to 0 or graveyard).
    /// @dev Sepolia Graveyard: 0xF83Fe2658f702a072F3c7B0dC4A0AB8c7B044750.
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// @notice Subset of ENSv2 PermissionedResolver used by AegisRegistry.
/// @dev Real contracts on Sepolia:
///      - PermissionedResolverImpl: 0x9eaE5c2730A7DD16bDd1deE6421A1B91e3B0365e
///      - ENSV2Resolver: 0x508cb4e4596429Ca98a1BB3112d88D18f92456B5
interface IPermissionedResolver {
    /// @notice Set the ETH address record for a name node (agent wallet binding).
    function setAddr(bytes32 node, address addr) external;

    /// @notice Set a text record (used for e.g. `description`, `avatar`).
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

/// @notice Subset of ENSv2 UniversalResolverV2 (wildcard resolution entry point).
/// @dev Sepolia:
///      - UniversalResolverV2 impl: 0x4a1817D13E9cF196F471725176355C1234b63C70
///      - UpgradableUniversalResolverProxy (canonical entry): 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe
interface IUniversalResolverV2 {
    /// @notice Resolve an ENSv2 name (e.g. `agent.aegis.eth`) to its bound address.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}
