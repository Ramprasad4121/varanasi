// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title EIP712 — minimal, dependency-free EIP-712 typed-domain hashing
/// @author Ramprasad
/// @notice Computes the exact EIP-712 domain separator
///         `EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)`
///         (no `salt` — byte-identical to OpenZeppelin's default domains) and
///         caches it for the deployment chainid/address. If the contract ever
///         resolves on a different chainid (unrealistic; cross-chain mirrors),
///         the separator is recomputed on the fly — same fallback shape OZ uses.
/// @dev Digest = keccak256(0x1901 ‖ domainSeparator ‖ structHash). Producers of
///         mandates (agent CLI, HireWizard) sign with ethers/viem `signTypedData`
///         over domain {name, version, chainId, verifyingContract} — verified
///         equal in the repo's EVM harness (contracts/README.md § Zero-deps).
abstract contract EIP712 {
    /// @notice EIP-712 typehash for the (salt-less) domain.
    bytes32 private constant _TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    bytes32 private immutable _HASHED_NAME;
    bytes32 private immutable _HASHED_VERSION;
    uint256 private immutable _CACHED_CHAIN_ID;
    address private immutable _CACHED_THIS;
    bytes32 private immutable _CACHED_SEPARATOR;

    constructor(string memory name, string memory version) {
        _HASHED_NAME = keccak256(bytes(name));
        _HASHED_VERSION = keccak256(bytes(version));
        _CACHED_CHAIN_ID = block.chainid;
        _CACHED_THIS = address(this);
        _CACHED_SEPARATOR = keccak256(
            abi.encode(_TYPE_HASH, _HASHED_NAME, _HASHED_VERSION, block.chainid, address(this))
        );
    }

    /// @notice Current domain separator (cached fast path; recomputed on chainid change).
    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == _CACHED_CHAIN_ID && address(this) == _CACHED_THIS) {
            return _CACHED_SEPARATOR;
        }
        return keccak256(abi.encode(_TYPE_HASH, _HASHED_NAME, _HASHED_VERSION, block.chainid, address(this)));
    }

    /// @dev EIP-712 envelope hash over a struct hash.
    function _hashTypedDataV4(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }
}
