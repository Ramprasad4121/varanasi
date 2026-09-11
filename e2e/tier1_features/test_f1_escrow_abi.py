"""
author: Varanasi E2E Test Suite
tier: Tier 1 - Feature Coverage
feature: F1 - TaskEscrow 14-field ABI Synchronization
spec: contracts/src/TaskEscrow.sol, contracts/out/TaskEscrow.sol/TaskEscrow.json, PROJECT.md § Interface Contracts
"""
import unittest
import json
import os
from e2e.fixtures.abi_fixtures import (
    TASK_TUPLE_FIELDS,
    TaskState,
    decode_task_tuple,
    create_mock_task,
)

class TestF1EscrowABISynchronization(unittest.TestCase):
    """
    Validates the 14-field Task struct in TaskEscrow.sol:
    Index 0..10: standard parameters
    Index 11: pinnedThresholdBps (uint256)
    Index 12: pinnedValidator (address)
    Index 13: state (uint8)
    """

    @classmethod
    def setUpClass(cls):
        cls.artifact_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../contracts/out/TaskEscrow.sol/TaskEscrow.json")
        )

    def test_01_compiled_artifact_defines_14_outputs(self):
        """Authoritative Check: Verify compiled Solidity artifact has 14 outputs for tasks(bytes32)."""
        if os.path.exists(self.artifact_path):
            with open(self.artifact_path, "r", encoding="utf-8") as f:
                artifact = json.load(f)
            tasks_abi = next((item for item in artifact.get("abi", []) if item.get("name") == "tasks"), None)
            self.assertIsNotNone(tasks_abi, "Function 'tasks(bytes32)' not found in TaskEscrow ABI")
            outputs = tasks_abi.get("outputs", [])
            self.assertEqual(len(outputs), 14, f"Expected 14 outputs in tasks() ABI, found {len(outputs)}")
        else:
            self.skipTest(f"Artifact not found at {self.artifact_path}, testing specification directly")

    def test_02_field_sequence_and_types_match_solidity_struct(self):
        """Verify the exact field ordering and types match the Solidity Task struct."""
        expected_names = [field[0] for field in TASK_TUPLE_FIELDS]
        expected_types = [field[1] for field in TASK_TUPLE_FIELDS]
        self.assertEqual(len(TASK_TUPLE_FIELDS), 14)
        self.assertEqual(expected_names[11], "pinnedThresholdBps")
        self.assertEqual(expected_names[12], "pinnedValidator")
        self.assertEqual(expected_names[13], "state")
        self.assertEqual(expected_types[11], "uint256")
        self.assertEqual(expected_types[12], "address")
        self.assertEqual(expected_types[13], "uint8")

    def test_03_state_mapped_to_index_13(self):
        """Verify decoder extracts state from index 13 and not index 11."""
        # Index 11 is pinnedThresholdBps (5000), Index 13 is State (TaskState.VALIDATED = 2)
        raw_tuple = create_mock_task(
            pinned_threshold_bps=5000,
            state=TaskState.VALIDATED
        )
        decoded = decode_task_tuple(raw_tuple)
        self.assertEqual(decoded["pinnedThresholdBps"], 5000)
        self.assertEqual(decoded["state"], 2)
        self.assertEqual(decoded["stateLabel"], "validated")
        self.assertNotEqual(decoded["state"], 5000, "State must not be confused with pinnedThresholdBps")

    def test_04_all_state_enums_decoded_accurately(self):
        """Verify all 6 state enum values (0 to 5) map to their canonical labels."""
        states = [
            (TaskState.NONE, "none"),
            (TaskState.FUNDED, "funded"),
            (TaskState.VALIDATED, "validated"),
            (TaskState.RELEASED, "released"),
            (TaskState.REFUNDED, "refunded"),
            (TaskState.CANCELLED, "cancelled"),
        ]
        for val, label in states:
            raw = create_mock_task(state=val)
            decoded = decode_task_tuple(raw)
            self.assertEqual(decoded["state"], val)
            self.assertEqual(decoded["stateLabel"], label)

    def test_05_legacy_12_field_tuple_rejected(self):
        """Verify that passing an outdated 12-field tuple raises ValueError."""
        legacy_tuple = [
            "0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
            "0x3333333333333333333333333333333333333333",
            "0x6169A84cD7430042fb697c2cC131F663212E8b30",
            100_000_000,
            100_000_000,
            1700000000,
            1700086400,
            1700172800,
            8500,
            "0x4444444444444444444444444444444444444444",
            1, # Legacy index 11 was state
        ]
        with self.assertRaises(ValueError) as ctx:
            decode_task_tuple(legacy_tuple)
        self.assertIn("expected 14 outputs", str(ctx.exception))

    def test_06_realistic_escrow_task_payload_integrity(self):
        """Verify full round-trip decoding of realistic escrow task parameters."""
        raw = create_mock_task(
            payer="0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
            agent="0x1Db3439a222C519ab447111477F30922889e4726",
            merchant="0x0000000000000000000000000000000000000000",
            token="0x6169A84cD7430042fb697c2cC131F663212E8b30",
            cap=50_000_000, # 50 vUSD
            funded=50_000_000,
            score_bps=9200, # 92%
            pinned_threshold_bps=8000,
            pinned_validator="0x668c01aE564D51baFF0029D361c20c534d738400",
            state=TaskState.FUNDED,
        )
        res = decode_task_tuple(raw)
        self.assertEqual(res["payer"], "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B")
        self.assertEqual(res["cap"], 50_000_000)
        self.assertEqual(res["scoreBps"], 9200)
        self.assertEqual(res["pinnedThresholdBps"], 8000)
        self.assertEqual(res["pinnedValidator"], "0x668c01aE564D51baFF0029D361c20c534d738400")
        self.assertEqual(res["state"], TaskState.FUNDED)

if __name__ == "__main__":
    unittest.main()
