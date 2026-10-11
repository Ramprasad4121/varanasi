// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ReentrancyVault: DELIBERATELY VULNERABLE sample target for the Varanasi bounty demo.
/// @notice Do not deploy anywhere but a local anvil. withdraw() sends ETH before zeroing the
///         caller's balance (classic reentrancy), so a contract can drain other depositors.
contract ReentrancyVault {
    mapping(address => uint256) public balances;
    address[] public depositors;
    mapping(address => bool) internal _seen;

    function deposit() external payable {
        require(msg.value > 0, "zero");
        if (!_seen[msg.sender]) {
            _seen[msg.sender] = true;
            depositors.push(msg.sender);
        }
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "empty");
        (bool ok,) = msg.sender.call{value: bal}("");
        require(ok, "send failed");
        balances[msg.sender] = 0; // BUG: state updated after the external call
    }

    function depositorCount() external view returns (uint256) {
        return depositors.length;
    }
}
