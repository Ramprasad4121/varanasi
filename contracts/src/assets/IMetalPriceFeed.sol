// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IMetalPriceFeed: rupee price of 1 g of fine metal (gold, silver, platinum), for DISPLAY only.
/// @notice The issuer never uses this price to mint, burn or redeem. It only lets
///         an app show "your 9.950 g of silver is worth Rs X" with an "as of" time.
interface IMetalPriceFeed {
    /// @return paisePerGram price of 1 gram of fine metal in paise (Rs 1 = 100 paise)
    /// @return updatedAt unix time of the quote
    function pricePaisePerGram() external view returns (uint256 paisePerGram, uint256 updatedAt);
}
