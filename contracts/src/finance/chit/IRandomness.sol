// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IRandomness: pluggable randomness source for ChitFund draws.
/// @author Ramprasad
/// @dev Request then read pattern so an async source (Chainlink VRF v2.5) can
///      drop in: `requestRandomness` asks for a word bound to `key`, the source
///      fulfills later, and `randomnessOf` returns it once ready. A VRF adapter
///      maps `key` to its requestId and stores the word in its fulfill callback.
interface IRandomness {
    /// @notice Ask for one random word bound to `key` (one request per key).
    function requestRandomness(bytes32 key) external;

    /// @notice The word for `key`, once the source has fulfilled it.
    function randomnessOf(bytes32 key) external view returns (bool ready, uint256 value);
}
