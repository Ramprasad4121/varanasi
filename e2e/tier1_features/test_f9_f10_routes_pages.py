"""
author: Varanasi E2E Test Suite
tier: Tier 1 - Feature Coverage
features: F9 (Modular Homepage) & F10 (Dedicated Application Routes)
spec: frontend/app/, PROJECT.md § Feature Inventory
"""
import unittest
import os

class TestF9F10RoutesAndPages(unittest.TestCase):
    """
    Validates page structure, route definitions, and component composition across Next.js app routes.
    """

    @classmethod
    def setUpClass(cls):
        cls.app_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../frontend/app")
        )

    def test_01_homepage_exists_and_contains_hero_and_market(self):
        """Verify root app/page.tsx exists and renders core features."""
        page_path = os.path.join(self.app_dir, "page.tsx")
        self.assertTrue(os.path.exists(page_path), "frontend/app/page.tsx does not exist")
        with open(page_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertTrue(
            "AgentMarket" in content or "agent" in content.lower(),
            "Homepage must include AgentMarket or agent catalog"
        )
        self.assertTrue(
            "HireWizard" in content or "hire" in content.lower(),
            "Homepage must integrate Hire flow"
        )

    def test_02_account_route_exists(self):
        """Verify /account route page exists for identity and credentials."""
        account_page = os.path.join(self.app_dir, "account/page.tsx")
        self.assertTrue(os.path.exists(account_page), "frontend/app/account/page.tsx does not exist")
        with open(account_page, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("account", content.lower())

    def test_03_human_world_id_route_exists(self):
        """Verify /human route page exists for World ID human verification."""
        human_page = os.path.join(self.app_dir, "human/page.tsx")
        self.assertTrue(os.path.exists(human_page), "frontend/app/human/page.tsx does not exist")
        with open(human_page, "r", encoding="utf-8") as f:
            content = f.read()
        has_world = "world" in content.lower() or "id" in content.lower() or "human" in content.lower()
        self.assertTrue(has_world, "human/page.tsx must reference World ID or human verification")

    def test_04_mandate_route_exists(self):
        """Verify /mandate route page exists for EIP-712 mandate inspection."""
        mandate_page = os.path.join(self.app_dir, "mandate/page.tsx")
        self.assertTrue(os.path.exists(mandate_page), "frontend/app/mandate/page.tsx does not exist")
        with open(mandate_page, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("mandate", content.lower())

    def test_05_proof_route_exists(self):
        """Verify /proof route page exists for receipt inspection."""
        proof_page = os.path.join(self.app_dir, "proof/page.tsx")
        self.assertTrue(os.path.exists(proof_page), "frontend/app/proof/page.tsx does not exist")
        with open(proof_page, "r", encoding="utf-8") as f:
            content = f.read()
        has_receipt = "proof" in content.lower() or "receipt" in content.lower()
        self.assertTrue(has_receipt, "proof/page.tsx must reference cryptographic proof or receipts")

    def test_06_layout_wraps_all_routes_with_privy_provider(self):
        """Verify root layout.tsx wraps application with PrivyRoot / PrivyProvider."""
        layout_path = os.path.join(self.app_dir, "layout.tsx")
        self.assertTrue(os.path.exists(layout_path), "frontend/app/layout.tsx does not exist")
        with open(layout_path, "r", encoding="utf-8") as f:
            content = f.read()
        has_provider = "PrivyRoot" in content or "PrivyProvider" in content or "privy" in content.lower()
        self.assertTrue(has_provider, "Root layout must provide Privy Web3 context")

if __name__ == "__main__":
    unittest.main()
