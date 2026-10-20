// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IGoldPriceFeed} from "./IGoldPriceFeed.sol";

/// @title MockGoldPriceFeed: owner-posted rupee gold price for local demos and tests.
/// @dev Replace with a signed bank/IBJA quote or an oracle before any real use.
contract MockGoldPriceFeed is IGoldPriceFeed, Ownable {
    uint256 internal _paise;
    uint256 internal _at;

    event PricePosted(uint256 paisePerGram, uint256 at);

    constructor(address admin, uint256 paisePerGram) Ownable(admin) {
        _paise = paisePerGram;
        _at = block.timestamp;
    }

    function post(uint256 paisePerGram) external onlyOwner {
        _paise = paisePerGram;
        _at = block.timestamp;
        emit PricePosted(paisePerGram, block.timestamp);
    }

    function pricePaisePerGram() external view returns (uint256, uint256) {
        return (_paise, _at);
    }
}
