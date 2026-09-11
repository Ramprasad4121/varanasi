"""
author: Varanasi E2E Test Suite
tier: Tier 3 - Cross-Feature Combinations
combination: Mandate EIP-712 Struct -> TaskEscrow Contract Validation
spec: contracts/src/TaskEscrow.sol, e2e/fixtures/eip712_fixtures.py, e2e/fixtures/abi_fixtures.py
"""
import unittest
import hashlib
from e2e.fixtures.eip712_fixtures import (
    MANDATE_DOMAIN,
    MANDATE_TYPES,
    build_mandate_message,
    validate_mandate_structure,
)
from e2e.fixtures.abi_fixtures import (
    TASK_ESCROW_ADDRESS,
    TaskState,
    create_mock_task,
    decode_task_tuple,
)

def validate_task_escrow_preconditions(mandate: dict) -> bool:
    """
    Validates onchain preconditions in TaskEscrow.sol fund(Mandate calldata m, bytes calldata sig):
      - m.chainId == block.chainid (11155111)
      - m.cap > 0
      - m.token != address(0)
      - m.agent != address(0)
      - m.windowStart < m.windowEnd
      - m.windowEnd <= m.expiry
    """
    if mandate.get("chainId") != 11155111:
        raise ValueError("Invalid chainId: must be Sepolia (11155111)")
    if mandate.get("cap", 0) <= 0:
        raise ValueError("Cap must be greater than zero")
    if not mandate.get("token") or mandate["token"] == "0x0000000000000000000000000000000000000000":
        raise ValueError("Token cannot be zero address")
    if not mandate.get("agent") or mandate["agent"] == "0x0000000000000000000000000000000000000000":
        raise ValueError("Agent cannot be zero address")
    if mandate.get("windowStart", 0) >= mandate.get("windowEnd", 0):
        raise ValueError("windowStart must be strictly less than windowEnd")
    if mandate.get("windowEnd", 0) > mandate.get("expiry", 0):
        raise ValueError("expiry must be greater than or equal to windowEnd")
    return True


class TestMandateToEscrowFlow(unittest.TestCase):
    """
    Validates compatibility between offchain EIP-712 Mandate message structures
    and onchain TaskEscrow deposit verification rules.
    """

    def test_01_eip712_domain_matches_task_escrow_specification(self):
        """Verifies EIP-712 domain parameters match deployed TaskEscrow deployment on Sepolia."""
        self.assertEqual(MANDATE_DOMAIN["name"], "TaskEscrow")
        self.assertEqual(MANDATE_DOMAIN["version"], "1")
        self.assertEqual(MANDATE_DOMAIN["chainId"], 11155111)
        self.assertEqual(MANDATE_DOMAIN["verifyingContract"].lower(), TASK_ESCROW_ADDRESS.lower())

    def test_02_valid_mandate_satisfies_all_escrow_preconditions(self):
        """Standard valid mandate message passes all TaskEscrow validation gates."""
        mandate = build_mandate_message(
            cap=100_000_000,
            window_start=1700000000,
            window_end=1700086400,
            expiry=1700172800,
        )
        validate_mandate_structure(mandate)
        self.assertTrue(validate_task_escrow_preconditions(mandate))

    def test_03_zero_cap_is_rejected(self):
        """Mandate with zero cap is rejected before funding."""
        mandate = build_mandate_message(cap=0)
        with self.assertRaises(ValueError) as ctx:
            validate_task_escrow_preconditions(mandate)
        self.assertIn("Cap must be greater than zero", str(ctx.exception))

    def test_04_zero_agent_or_token_address_rejected(self):
        """Mandates with address(0) agent or token are rejected."""
        zero_addr = "0x0000000000000000000000000000000000000000"
        m1 = build_mandate_message(agent=zero_addr)
        with self.assertRaises(ValueError) as ctx1:
            validate_task_escrow_preconditions(m1)
        self.assertIn("Agent cannot be zero address", str(ctx1.exception))

        m2 = build_mandate_message(token=zero_addr)
        with self.assertRaises(ValueError) as ctx2:
            validate_task_escrow_preconditions(m2)
        self.assertIn("Token cannot be zero address", str(ctx2.exception))

    def test_05_inverted_window_or_early_expiry_rejected(self):
        """Inverted time window or expiry earlier than windowEnd is rejected."""
        # windowStart >= windowEnd
        m_inverted = build_mandate_message(window_start=1700086400, window_end=1700000000)
        with self.assertRaises(ValueError) as ctx:
            validate_task_escrow_preconditions(m_inverted)
        self.assertIn("windowStart must be strictly less than windowEnd", str(ctx.exception))

        # expiry < windowEnd
        m_early_exp = build_mandate_message(window_start=1700000000, window_end=1700086400, expiry=1700086399)
        with self.assertRaises(ValueError) as ctx2:
            validate_task_escrow_preconditions(m_early_exp)
        self.assertIn("expiry must be greater than or equal to windowEnd", str(ctx2.exception))

    def test_06_funded_task_instantiation_maps_to_14_field_tuple(self):
        """Valid mandate transforms into a funded 14-field onchain Task tuple."""
        mandate = build_mandate_message(cap=50_000_000)
        raw_tuple = create_mock_task(
            agent=mandate["agent"],
            merchant=mandate["merchant"],
            token=mandate["token"],
            cap=mandate["cap"],
            funded=mandate["cap"],
            window_start=mandate["windowStart"],
            window_end=mandate["windowEnd"],
            expiry=mandate["expiry"],
            state=TaskState.FUNDED,
        )
        task = decode_task_tuple(raw_tuple)
        self.assertEqual(task["state"], TaskState.FUNDED)
        self.assertEqual(task["agent"].lower(), mandate["agent"].lower())
        self.assertEqual(task["cap"], 50_000_000)
        self.assertEqual(task["fundedAmount"], 50_000_000)


if __name__ == "__main__":
    unittest.main()
