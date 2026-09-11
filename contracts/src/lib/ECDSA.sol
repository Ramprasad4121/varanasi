// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ECDSA — strict 65-byte secp256k1 recovery for EIP-712 digests
/// @author Ramprasad
/// @notice Enforces the full canonical-signature surface: length == 65,
///         v ∈ {27,28}, s ≤ secp256k1n/2 (EIP-2 malleability), and rejects the
///         zero address that `ecrecover` returns on invalid input. Equivalent
///         acceptance set to OpenZeppelin's `ECDSA.tryRecover` (without the
///         hint bytes — callers here only branch on valid/invalid).
library ECDSA {
    /// @dev Half the secp256k1 curve order (EIP-2 s-bound).
    uint256 private constant _HALF_CURVE_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    /// @notice Recover the signer of `digest` from a 65-byte r‖s‖v signature.
    /// @dev Never reverts: returns (address(0), false) for any malformed input,
    ///      letting callers keep their own domain errors (e.g. `BadSig`).
    ///      Acceptance set == OZ tryRecover: length 65, v ∈ {27,28}, low-s,
    ///      non-zero recovery.
    /// @param digest 32-byte EIP-712 digest to verify.
    /// @param sig Calldata signature (65 bytes: 32 r, 32 s, 1 v).
    /// @return signer Recovered address (zero when invalid).
    /// @return valid True when the signature is canonical and recovers non-zero.
    function tryRecover(bytes32 digest, bytes calldata sig) internal pure returns (address signer, bool valid) {
        if (sig.length != 65) return (address(0), false);

        bytes32 r;
        bytes32 s;
        uint8 v;
        /// @solidity memory-safe-assembly
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }

        if (uint256(s) > _HALF_CURVE_ORDER) return (address(0), false);
        if (v != 27 && v != 28) return (address(0), false);

        signer = ecrecover(digest, v, r, s);
        valid = signer != address(0);
    }
}
