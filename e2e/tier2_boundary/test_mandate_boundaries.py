"""
author: Varanasi E2E Test Suite
tier: Tier 2 - Boundary & Corner Cases
scope: EIP-712 Mandate Struct Boundaries
spec: e2e/fixtures/eip712_fixtures.py, contracts/src/TaskEscrow.sol
"""
import unittest
from e2e.fixtures.eip712_fixtures import build_mandate_message, validate_mandate_structure

class TestMandateBoundaries(unittest.TestCase):
    """
    Validates boundary conditions, timestamp rules, and schema constraints for EIP-712 Mandates.
    """

    def test_01_window_end_equal_to_start_rejected(self):
        """Test mandate with windowEnd == windowStart is rejected."""
        mandate = build_mandate_message(window_start=1700000000, window_end=1700000000)
        with self.assertRaises(ValueError) as ctx:
            validate_mandate_structure(mandate)
        self.assertIn("windowEnd must be strictly greater than windowStart", str(ctx.exception))

    def test_02_window_end_before_start_rejected(self):
        """Test mandate with windowEnd < windowStart is rejected."""
        mandate = build_mandate_message(window_start=1700000000, window_end=1699999999)
        with self.assertRaises(ValueError):
            validate_mandate_structure(mandate)

    def test_03_expiry_before_window_end_rejected(self):
        """Test mandate with expiry < windowEnd is rejected."""
        mandate = build_mandate_message(
            window_start=1700000000,
            window_end=1700086400,
            expiry=1700086399  # 1 second before windowEnd
        )
        with self.assertRaises(ValueError) as ctx:
            validate_mandate_structure(mandate)
        self.assertIn("expiry must be greater than or equal to windowEnd", str(ctx.exception))

    def test_04_wrong_chain_id_rejected(self):
        """Test mandate targeting wrong chain ID (e.g. 1 for Ethereum Mainnet or 8453 for Base) is rejected."""
        for bad_chain in [1, 8453, 42161, 31337]:
            mandate = build_mandate_message(chain_id=bad_chain)
            with self.assertRaises(ValueError) as ctx:
                validate_mandate_structure(mandate)
            self.assertIn("Invalid chainId", str(ctx.exception))

    def test_05_missing_fields_raise_key_error(self):
        """Test removing any required field raises KeyError."""
        base = build_mandate_message()
        for field in ["agent", "merchant", "token", "cap", "nonce", "chainId"]:
            incomplete = dict(base)
            del incomplete[field]
            with self.assertRaises(KeyError) as ctx:
                validate_mandate_structure(incomplete)
            self.assertIn(field, str(ctx.exception))

    def test_06_minimum_valid_window_duration(self):
        """Test minimum valid window duration (1 second window, expiry == windowEnd)."""
        mandate = build_mandate_message(
            window_start=1700000000,
            window_end=1700000001,
            expiry=1700000001,
        )
        # Should validate without error
        validate_mandate_structure(mandate)
        self.assertEqual(mandate["windowEnd"] - mandate["windowStart"], 1)

if __name__ == "__main__":
    unittest.main()
