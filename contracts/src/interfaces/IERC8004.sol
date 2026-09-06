// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IERC8004 — minimal ERC-8004 (Trustless Agents) surface for AEGIS
/// @notice Canonical registry addresses (CREATE2, same cross-chain where deployed):
///         - IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
///         - ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
///         Canonical spec: https://eips.ethereum.org/EIPS/eip-8004
/// @dev Sepolia status (2026-09-06, `cast code` on 3 live RPCs + Etherscan):
///      NOT deployed at either canonical address (0x bytecode / EOA), while
///      mainnet HAS code at both. Always re-check with
///      `cast code <addr> --rpc-url $SEPOLIA_RPC_URL` before sending txs —
///      see agent/ERC8004.md for the full status + register commands.
/// @dev Signatures below are the canonical EIP-8004 ones. `register` has two
///      sibling overloads (`register()` and `register(string, MetadataEntry[])`);
///      some community forks ship a score-based ReputationRegistry instead of
///      the fixed-point one here — re-verify the ABI against the target
///      deployment before wiring (wrong overload = wrong selector = silent miss).
interface IERC8004 {
    /// @notice Mint an agent NFT pointing at a registration JSON file.
    /// @param agentURI URI of the EIP-8004 registration file (IPFS/HTTPS/data:).
    /// @return agentId The minted ERC-721 tokenId = permanent agent id.
    function register(string calldata agentURI) external returns (uint256 agentId);

    /// @notice NFT owner (custody key) of an agentId.
    function ownerOf(uint256 agentId) external view returns (address);

    /// @notice Registration-file URI of an agentId.
    function tokenURI(uint256 agentId) external view returns (string memory);

    /// @notice Post client feedback: signed fixed-point value + optional tags,
    ///         endpoint, and off-chain file (URI + keccak hash for integrity).
    /// @dev valueDecimals MUST be 0-18. Caller MUST NOT be the agent owner or
    ///      an approved operator (no self-rating). All fields except value /
    ///      valueDecimals are OPTIONAL — pass "" / bytes32(0) when unused.
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    /// @notice Aggregate reputation over a client scope.
    /// @dev clientAddresses MUST be non-empty (unscoped reads are Sybil-prone);
    ///      tag1/tag2 are optional filters (pass "" for none).
    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);
}
