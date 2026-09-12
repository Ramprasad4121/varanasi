// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "../lib/ERC20.sol";
import {GoldRegistry} from "./GoldRegistry.sol";

/// @title GoldToken — tokenized custody claims over verified gold positions.
/// @author Ramprasad
/// @dev GRAMS_SCALE token units = 1 gram of gold. A verified position can be
///      minted exactly once (registry marks it MINTED, replay protection) and
///      the corresponding units burn on redemption (registry marks REDEEMED).
///      This is a demo token on a test network: it represents a claim to a
///      physical/simulated gold deposit, not a regulated financial product.
contract GoldToken is ERC20 {
    error GoldOnlyPositionOwner(bytes32 assetId, address caller, address owner);
    error GoldPositionNotVerified(bytes32 assetId);
    error GoldPositionNotMinted(bytes32 assetId);
    error GoldInsufficientBalance(bytes32 assetId, uint256 required, uint256 have);

    event GoldMinted(bytes32 indexed assetId, uint256 grams, address indexed claimer);
    event GoldRedeemed(bytes32 indexed assetId, uint256 grams, address indexed redeemer);

    uint256 public constant GRAMS_SCALE = 1e18; // token decimals == grams scale

    GoldRegistry public immutable registry;
    bytes32[] public mintedAssetIds;

    mapping(bytes32 => uint256) public mintedGramsOf;

    /// @param goldRegistry Source-of-truth registry that guards mint/redeem.
    constructor(address goldRegistry) ERC20("Varanasi Gold", "vGOLD") {
        registry = GoldRegistry(goldRegistry);
    }

    /// @notice Mint the tokenized claim for a VERIFIED position. Only the
    ///         position owner may claim; one mint per assetId (replay protection).
    function mint(bytes32 assetId) external {
        GoldRegistry.GoldPosition memory pos = registry.positionOf(assetId);
        if (pos.status != GoldRegistry.Status.VERIFIED) revert GoldPositionNotVerified(assetId);
        if (mintedGramsOf[assetId] != 0) revert GoldPositionNotVerified(assetId); // already minted
        if (pos.owner != msg.sender) revert GoldOnlyPositionOwner(assetId, msg.sender, pos.owner);

        uint256 grams = pos.weightGrams;
        uint256 units = grams * GRAMS_SCALE;

        registry.markMinted(assetId);
        mintedGramsOf[assetId] = grams;
        mintedAssetIds.push(assetId);
        _mint(msg.sender, units);

        emit GoldMinted(assetId, grams, msg.sender);
    }

    /// @notice Redeem: burn the claim units and mark the position REDEEMED.
    ///         Only the position owner may redeem their own claim.
    function redeem(bytes32 assetId) external {
        GoldRegistry.GoldPosition memory pos = registry.positionOf(assetId);
        if (pos.status != GoldRegistry.Status.MINTED) revert GoldPositionNotMinted(assetId);
        uint256 grams = mintedGramsOf[assetId];
        if (grams == 0) revert GoldPositionNotMinted(assetId);
        if (pos.owner != msg.sender) revert GoldOnlyPositionOwner(assetId, msg.sender, pos.owner);

        uint256 units = grams * GRAMS_SCALE;
        if (balanceOf(msg.sender) < units) {
            revert GoldInsufficientBalance(assetId, units, balanceOf(msg.sender));
        }
        delete mintedGramsOf[assetId];

        registry.markRedeemed(assetId);
        _burn(msg.sender, units);

        emit GoldRedeemed(assetId, grams, msg.sender);
    }

    /// @notice Number of distinct assetIds ever minted.
    function mintedCount() external view returns (uint256) {
        return mintedAssetIds.length;
    }
}