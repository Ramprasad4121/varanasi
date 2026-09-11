"""
author: Varanasi E2E Test Suite
tier: Tier 1 - Feature Coverage
features: F11 (Web3 & API Engine Preservation) & F12 (Secondary Pages Polishing)
spec: frontend/components/HireWizard.tsx, e2e/fixtures/eip712_fixtures.py, PROJECT.md
"""
import unittest
import os
from e2e.fixtures.abi_fixtures import TASK_ESCROW_ADDRESS, MOCK_ERC20_ADDRESS
from e2e.fixtures.eip712_fixtures import MANDATE_DOMAIN, build_mandate_message, validate_mandate_structure

class TestF11F12Web3AndSecondaryPages(unittest.TestCase):
    """
    Validates preservation of Web3 contract calls, EIP-712 mandate signing, and secondary page integrity.
    """

    @classmethod
    def setUpClass(cls):
        cls.frontend_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../frontend")
        )

    def test_01_sepolia_chain_id_configured_consistently(self):
        """Verify chain ID 11155111 is used across EIP-712 and Web3 client calls."""
        self.assertEqual(MANDATE_DOMAIN["chainId"], 11155111)
        mandate = build_mandate_message(chain_id=11155111)
        self.assertEqual(mandate["chainId"], 11155111)

    def test_02_task_escrow_address_consistent(self):
        """Verify TaskEscrow contract address matches deployed Sepolia instance."""
        expected = "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24"
        self.assertEqual(TASK_ESCROW_ADDRESS, expected)
        self.assertEqual(MANDATE_DOMAIN["verifyingContract"], expected)

    def test_03_eip712_mandate_validation_logic(self):
        """Verify mandate schema validation succeeds for well-formed mandate."""
        valid_mandate = build_mandate_message(
            cap=50_000_000,
            window_start=1700000000,
            window_end=1700086400,
            expiry=1700172800,
            nonce=1,
            chain_id=11155111,
        )
        # Should not raise
        validate_mandate_structure(valid_mandate)

    def test_04_hire_wizard_preserves_viem_contract_interactions(self):
        """Verify HireWizard.tsx contains real Viem writeContract / readContract calls."""
        hire_path = os.path.join(self.frontend_dir, "components/HireWizard.tsx")
        self.assertTrue(os.path.exists(hire_path), "HireWizard.tsx does not exist")
        with open(hire_path, "r", encoding="utf-8") as f:
            content = f.read()
        has_viem_read = "readContract" in content or "publicClient" in content
        has_viem_write = "writeContract" in content or "walletClient" in content or "deposit" in content.lower()
        self.assertTrue(has_viem_read, "HireWizard must preserve Viem contract read calls")
        self.assertTrue(has_viem_write, "HireWizard must preserve Viem contract deposit / write calls")

    def test_05_treasury_page_exists(self):
        """Verify treasury page (/privy or app/privy/treasury.tsx) exists."""
        privy_dir = os.path.join(self.frontend_dir, "app/privy")
        has_treasury = os.path.exists(privy_dir)
        self.assertTrue(has_treasury, "frontend/app/privy directory must exist for Treasury")

    def test_06_mock_erc20_token_address_matches_spec(self):
        """Verify demo settlement currency (vUSD) address matches deployed Sepolia instance."""
        expected = "0x6169A84cD7430042fb697c2cC131F663212E8b30"
        self.assertEqual(MOCK_ERC20_ADDRESS, expected)

if __name__ == "__main__":
    unittest.main()
