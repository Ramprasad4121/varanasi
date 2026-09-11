"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Real-World Application Scenarios
scenario: Mandate Terms Inspector & EIP-712 Typed Data Verification
spec: TEST_INFRA.md § Tier 4, contracts/src/TaskEscrow.sol, PROJECT.md
"""
import unittest
from e2e.browser_harness import BrowserSession
from e2e.tier4_scenarios.scenario_fixtures import setup_scenario_routing

REQUIRED_MANDATE_FIELDS = [
    ("agent", "address"),
    ("merchant", "address"),
    ("token", "address"),
    ("cap", "uint256"),
    ("windowStart", "uint64"),
    ("windowEnd", "uint64"),
    ("expiry", "uint64"),
    ("nonce", "uint256"),
    ("chainId", "uint256"),
]

class TestBrowserMandateInspectorJourney(unittest.TestCase):
    """
    Validates the mandate architecture inspector, EIP-712 typed structured data fields,
    domain separator verification, and non-custodial security invariants in the browser.
    """

    def test_01_mandate_four_step_architecture_rendered_in_order(self):
        """Verify the 4 architectural steps (Hire, Work, Settle, Kill switch) are displayed."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/mandate")

            body_text = session.page.inner_text("body").lower()
            self.assertIn("hire", body_text)
            self.assertIn("work", body_text)
            self.assertIn("settle", body_text)
            self.assertIn("kill switch", body_text)

            session.assert_zero_errors("mandate_steps_inspection")

    def test_02_mandate_struct_nine_fields_table_verification(self):
        """Verify the exact 9 fields of the Mandate EIP-712 struct with their types."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/mandate")

            table = session.page.locator("#mandate-fields-table")
            self.assertTrue(table.is_visible())
            table_text = table.inner_text()

            for field_name, field_type in REQUIRED_MANDATE_FIELDS:
                self.assertIn(field_name, table_text, f"Missing field {field_name} in mandate table")
                self.assertIn(field_type, table_text, f"Missing type {field_type} for field {field_name}")

            session.assert_zero_errors("mandate_fields_table")

    def test_03_eip712_domain_separator_inspector_interaction(self):
        """Verify interactive domain separator check calculates valid status."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/mandate")

            inspector = session.page.locator("#eip712-inspector")
            self.assertTrue(inspector.is_visible())
            self.assertIn("0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24", inspector.inner_text())

            # Click verify domain separator
            btn = inspector.locator("button:has-text('Verify Domain Separator')")
            btn.click()

            # Verify outcome
            result = session.page.locator("#inspector-result")
            self.assertIn("VALID", result.inner_text())
            self.assertIn("TaskEscrow", result.inner_text())

            session.assert_zero_errors("domain_separator_inspector")

    def test_04_mandate_non_custodial_security_invariants(self):
        """Verify documented non-custodial invariants (no standing keys, anti-replay nonces)."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/mandate")

            body_text = session.page.inner_text("body").lower()
            self.assertIn("never holds your keys", body_text)
            self.assertIn("replay is cryptographically impossible", body_text)
            self.assertIn("11155111", body_text)

            session.assert_zero_errors("security_invariants")

    def test_05_interactive_console_logging_and_zero_errors(self):
        """Verify that inspection actions log diagnostics cleanly without console errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/mandate")

            session.page.click("button:has-text('Verify Domain Separator')")

            logged_texts = [entry["text"] for entry in session.console_logs]
            self.assertTrue(
                any("Domain Separator" in msg for msg in logged_texts),
                "Expected verification log in console"
            )

            session.assert_zero_errors("mandate_console_inspection")

if __name__ == "__main__":
    unittest.main()
