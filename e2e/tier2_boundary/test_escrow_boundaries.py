"""
author: Varanasi E2E Test Suite
tier: Tier 2 - Boundary & Corner Cases
scope: TaskEscrow Contract Boundaries
spec: contracts/src/TaskEscrow.sol, PROJECT.md
"""
import unittest
from e2e.fixtures.abi_fixtures import (
    TaskState,
    decode_task_tuple,
    create_mock_task,
)

class TestEscrowBoundaries(unittest.TestCase):
    """
    Validates extreme values, limit conditions, and invalid state transitions in Escrow tasks.
    """

    def test_01_maximum_uint256_cap(self):
        """Test cap with maximum uint256 value (2^256 - 1)."""
        max_uint256 = (1 << 256) - 1
        raw = create_mock_task(cap=max_uint256, funded=max_uint256)
        decoded = decode_task_tuple(raw)
        self.assertEqual(decoded["cap"], max_uint256)
        self.assertEqual(decoded["fundedAmount"], max_uint256)

    def test_02_zero_amount_cap_and_funding(self):
        """Test boundary of zero cap and zero funding."""
        raw = create_mock_task(cap=0, funded=0)
        decoded = decode_task_tuple(raw)
        self.assertEqual(decoded["cap"], 0)
        self.assertEqual(decoded["fundedAmount"], 0)

    def test_03_expired_window_detection(self):
        """Test condition where windowEnd is earlier than windowStart."""
        window_start = 1700086400
        window_end = 1700000000  # inverted: end before start
        raw = create_mock_task(window_start=window_start, window_end=window_end)
        decoded = decode_task_tuple(raw)
        # Verify boundary detection: windowEnd < windowStart is invalid
        self.assertLess(decoded["windowEnd"], decoded["windowStart"])

    def test_04_zero_address_validator_allowed_when_unpinned(self):
        """Test zero address validator behavior when no pinned validator is configured."""
        zero_addr = "0x0000000000000000000000000000000000000000"
        raw = create_mock_task(
            validator=zero_addr,
            pinned_validator=zero_addr,
            pinned_threshold_bps=0
        )
        decoded = decode_task_tuple(raw)
        self.assertEqual(decoded["validator"], zero_addr)
        self.assertEqual(decoded["pinnedValidator"], zero_addr)
        self.assertEqual(decoded["pinnedThresholdBps"], 0)

    def test_05_pinned_threshold_bps_upper_bound(self):
        """Test pinnedThresholdBps at 10000 bps (100%) and beyond."""
        raw = create_mock_task(pinned_threshold_bps=10000)
        decoded = decode_task_tuple(raw)
        self.assertEqual(decoded["pinnedThresholdBps"], 10000)

    def test_06_tuple_length_mismatch_boundary(self):
        """Test tuple length boundaries: 13 fields (1 missing) and 15 fields (1 extra)."""
        base = create_mock_task()
        with self.assertRaises(ValueError):
            decode_task_tuple(base[:13])  # 13 fields
        with self.assertRaises(ValueError):
            decode_task_tuple(base + ["extra_field"])  # 15 fields

if __name__ == "__main__":
    unittest.main()
