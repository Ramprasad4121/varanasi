// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IRandomness} from "./IRandomness.sol";

/// @title MockRandomness: test and demo stand in for Chainlink VRF.
/// @author Ramprasad
/// @dev The deployer plays the VRF coordinator and fulfills requests by hand.
///      Never use outside tests and local demos.
contract MockRandomness is IRandomness {
    error NotCoordinator();
    error AlreadyRequested(bytes32 key);
    error NotRequested(bytes32 key);
    error AlreadyFulfilled(bytes32 key);

    event RandomnessRequested(bytes32 indexed key, address indexed requester);
    event RandomnessFulfilled(bytes32 indexed key, uint256 value);

    address public immutable coordinator;
    mapping(bytes32 => bool) public requested;
    mapping(bytes32 => bool) public fulfilled;
    mapping(bytes32 => uint256) private _value;

    constructor() {
        coordinator = msg.sender;
    }

    function requestRandomness(bytes32 key) external {
        if (requested[key]) revert AlreadyRequested(key);
        requested[key] = true;
        emit RandomnessRequested(key, msg.sender);
    }

    function fulfill(bytes32 key, uint256 value) external {
        if (msg.sender != coordinator) revert NotCoordinator();
        if (!requested[key]) revert NotRequested(key);
        if (fulfilled[key]) revert AlreadyFulfilled(key);
        fulfilled[key] = true;
        _value[key] = value;
        emit RandomnessFulfilled(key, value);
    }

    function randomnessOf(bytes32 key) external view returns (bool ready, uint256 value) {
        return (fulfilled[key], _value[key]);
    }
}
