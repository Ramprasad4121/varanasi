// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @notice What AssetRegistry reads from an issuer. BankGoldIssuer and
///         BankMetalIssuer both expose exactly this shape.
interface IMetalIssuerView {
    function token() external view returns (address);
    function paused() external view returns (bool);
    function proofOfReserve()
        external
        view
        returns (
            uint256 supplyMilli,
            uint256 attestedMilli,
            uint256 pendingMilli,
            uint256 disputedMilli,
            bool fullyBacked
        );
}

/// @notice The bound issuer of a metal token (GoldToken and MetalToken both expose it).
interface IIssuedToken {
    function issuer() external view returns (address);
}

/// @title AssetRegistry: the list of bank-backed metals the app offers.
/// @author Ramprasad
/// @notice One entry per fungible metal: gold (existing BankGoldIssuer + GoldToken),
///         silver and platinum (BankMetalIssuer + MetalToken each). Every entry is a
///         separate token with its own reserve, so one metal's problem never touches
///         another. Unique valuables (vehicles, land papers, jewellery sets) are NOT
///         here: they are pledge receipts (PledgeReceipt), never fungible tokens.
/// @dev Registration checks that token and issuer are bound to each other, so a
///      wrong pair can never be listed. Delisting only hides a metal from new
///      deposits in the app; it never touches balances.
contract AssetRegistry is Ownable {
    error AssetExists(bytes32 code);
    error AssetUnknown(bytes32 code);
    error AssetZeroAddress();
    error AssetNotBound(address token, address issuer);

    event MetalListed(bytes32 indexed code, string name, address token, address issuer);
    event MetalActiveSet(bytes32 indexed code, bool active);

    struct Metal {
        string name; // "Gold", "Silver", "Platinum"
        address token; // ERC-20, 1e18 units = 1 g fine metal
        address issuer; // bank attested mint, redeem, proof of reserve
        bool active; // offered for new deposits in the app
        bool exists;
    }

    /// @notice One metal's reserve, app friendly. All amounts in milligrams.
    struct MetalReserveView {
        bytes32 code;
        string name;
        address token;
        uint256 supplyMilli;
        uint256 attestedMilli;
        uint256 pendingMilli;
        uint256 disputedMilli;
        bool fullyBacked;
        bool paused;
        bool active;
    }

    mapping(bytes32 => Metal) internal _metals;
    bytes32[] public codes;

    constructor(address admin) Ownable(admin) {}

    /// @notice List a metal. `code` is a short id, e.g. "XAU", "XAG", "XPT".
    function listMetal(bytes32 code, string calldata name, address token, address issuer) external onlyOwner {
        if (_metals[code].exists) revert AssetExists(code);
        if (token == address(0) || issuer == address(0)) revert AssetZeroAddress();
        if (IMetalIssuerView(issuer).token() != token || IIssuedToken(token).issuer() != issuer) {
            revert AssetNotBound(token, issuer);
        }
        _metals[code] = Metal({name: name, token: token, issuer: issuer, active: true, exists: true});
        codes.push(code);
        emit MetalListed(code, name, token, issuer);
    }

    function setActive(bytes32 code, bool active) external onlyOwner {
        _metal(code).active = active;
        emit MetalActiveSet(code, active);
    }

    function metalOf(bytes32 code) external view returns (Metal memory) {
        return _metal(code);
    }

    function metalCount() external view returns (uint256) {
        return codes.length;
    }

    /// @notice Proof of reserve for one metal.
    function reserveOf(bytes32 code) public view returns (MetalReserveView memory v) {
        Metal storage m = _metal(code);
        IMetalIssuerView issuer = IMetalIssuerView(m.issuer);
        v.code = code;
        v.name = m.name;
        v.token = m.token;
        (v.supplyMilli, v.attestedMilli, v.pendingMilli, v.disputedMilli, v.fullyBacked) = issuer.proofOfReserve();
        v.paused = issuer.paused();
        v.active = m.active;
    }

    /// @notice Proof of reserve for every listed metal, one call for the app.
    function allReserves() external view returns (MetalReserveView[] memory list) {
        uint256 n = codes.length;
        list = new MetalReserveView[](n);
        for (uint256 i; i < n; ++i) {
            list[i] = reserveOf(codes[i]);
        }
    }

    function _metal(bytes32 code) internal view returns (Metal storage m) {
        m = _metals[code];
        if (!m.exists) revert AssetUnknown(code);
    }
}
