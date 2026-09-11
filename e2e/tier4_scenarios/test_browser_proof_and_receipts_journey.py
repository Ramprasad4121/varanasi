"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Real-World Application Scenarios
scenario: Proof, HashScan & Sepolia Receipts Verification Journey
spec: TEST_INFRA.md § Tier 4, frontend/app/proof/page.tsx, PROJECT.md
"""
import unittest
from e2e.browser_harness import BrowserSession
from e2e.tier4_scenarios.scenario_fixtures import setup_scenario_routing

EXPECTED_CONTRACTS = [
    ("TaskEscrow", "0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24"),
    ("AegisRegistry", "0x3913f1E6A0Be93180363aBd01Df7968d494033A8"),
    ("RiskGuard", "0x668c01aE564D51baFF0029D361c20c534d738400"),
]

class TestBrowserProofAndReceiptsJourney(unittest.TestCase):
    """
    Validates the proof and evidence portal, verifying onchain receipt links,
    network filters (Sepolia vs Hedera), contract registry addresses, and zero console errors.
    """

    def test_01_evidence_header_and_receipts_rendered(self):
        """Verify the evidence header and live receipt cards render cleanly."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/proof")

            body_text = session.page.inner_text("body").lower()
            self.assertIn("not screenshots", body_text)
            self.assertIn("sourcify-verified", body_text)

            receipts = session.page.locator(".receipt-item").all()
            self.assertGreaterEqual(len(receipts), 4, "Expected at least 4 live receipts")

            session.assert_zero_errors("evidence_header_and_receipts")

    def test_02_network_filter_buttons_isolate_sepolia_and_hedera(self):
        """Verify receipt category filter buttons correctly isolate Sepolia and Hedera items."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/proof")

            receipts = session.page.locator(".receipt-item").all()

            # Filter Sepolia receipts
            session.page.click("button:has-text('Sepolia')")
            visible_sepolia = [r for r in receipts if r.is_visible()]
            self.assertEqual(len(visible_sepolia), 3)
            for r in visible_sepolia:
                self.assertIn("sepolia", r.inner_text().lower())

            # Filter Hedera receipts
            session.page.click("button:has-text('Hedera')")
            visible_hedera = [r for r in receipts if r.is_visible()]
            self.assertEqual(len(visible_hedera), 1)
            self.assertIn("hedera", visible_hedera[0].inner_text().lower())
            self.assertIn("0.0.7162784", visible_hedera[0].inner_text())

            # Reset to All Receipts
            session.page.click("button:has-text('All Receipts')")
            visible_all = [r for r in receipts if r.is_visible()]
            self.assertEqual(len(visible_all), 4)

            session.assert_zero_errors("network_receipt_filtering")

    def test_03_verified_contracts_registry_display(self):
        """Verify the contracts registry displays accurate verified Sepolia contract addresses."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/proof")

            registry = session.page.locator("#contracts-registry")
            self.assertTrue(registry.is_visible())
            registry_text = registry.inner_text()

            for name, address in EXPECTED_CONTRACTS:
                self.assertIn(name, registry_text, f"Missing contract {name}")
                self.assertIn(address, registry_text, f"Missing address {address} for contract {name}")

            session.assert_zero_errors("contracts_registry_inspection")

    def test_04_explorer_links_target_valid_block_explorers(self):
        """Verify that external links point to Sepolia Etherscan and HashScan."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/proof")

            links = session.page.locator(".receipt-item a").all()
            hrefs = [link.get_attribute("href") for link in links]

            # At least one Sepolia link
            self.assertTrue(
                any(h and "sepolia.etherscan.io/tx/" in h for h in hrefs),
                "Missing Sepolia Etherscan transaction links"
            )
            # At least one HashScan link
            self.assertTrue(
                any(h and "hashscan.io/testnet/transaction/" in h for h in hrefs),
                "Missing HashScan transaction links"
            )

            session.assert_zero_errors("explorer_links_verification")

    def test_05_interactive_receipt_console_logging_and_zero_errors(self):
        """Verify filter interactions trigger clean diagnostics without console errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/proof")

            session.page.click("button:has-text('Hedera')")

            logged_texts = [entry["text"] for entry in session.console_logs]
            self.assertTrue(
                any("Filtered receipts by network: HEDERA" in msg for msg in logged_texts),
                f"Expected receipt filter log in: {logged_texts}"
            )

            session.assert_zero_errors("proof_console_inspection")

if __name__ == "__main__":
    unittest.main()
