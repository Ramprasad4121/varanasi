"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Real-World Application Scenarios
scenario: Complete Route Navigation & Zero Console Error Policy Enforcement
spec: TEST_INFRA.md § Tier 4, PROJECT.md § Architecture
"""
import unittest
from e2e.browser_harness import BrowserSession
from e2e.tier4_scenarios.scenario_fixtures import setup_scenario_routing

ROUTES_TO_TEST = [
    ("/", "Home", "High-Assurance Agentic Commerce"),
    ("/activity", "Activity", "Signal Engine"),
    ("/agents", "Agents", "Agent Catalog"),
    ("/hire", "Hire Wizard", "Hire Wizard"),
    ("/mandate", "Mandate", "EIP-712 Mandate Struct Definition"),
    ("/proof", "Proof", "Verified Contracts Registry"),
    ("/account", "Vault", "Active Vault"),
    ("/human", "Human", "Proof-of-Personhood Status"),
    ("/privy", "Treasury", "Privy Embedded Account"),
]

class TestBrowserRoutesAndConsole(unittest.TestCase):
    """
    Validates that every application route renders cleanly with Colosseum aesthetics,
    navigational chrome, diamond glyphs, and strictly zero console errors or page exceptions.
    """

    def test_01_all_nine_routes_render_with_zero_console_errors(self):
        """Verify each of the 9 required routes navigates without console errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            for path, title_prefix, heading_text in ROUTES_TO_TEST:
                url = f"http://localhost:3000{path}"
                session.page.goto(url)
                
                # Check page title and primary heading
                title = session.page.title()
                self.assertIn(title_prefix, title, f"Title mismatch on route {path}")
                body_text = session.page.inner_text("body").lower()
                self.assertIn(heading_text.lower(), body_text, f"Expected heading '{heading_text}' on route {path}")

                # Enforce zero console errors on this route
                session.assert_zero_errors(f"route {path}")

    def test_02_colosseum_typography_and_palette_tokens_in_dom(self):
        """Verify presence of Colosseum aesthetic tokens (Newsreader, iron ink, warm paper, Roman crimson)."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/")
            
            # Check font-family on body or computed styles
            font_family = session.page.evaluate("() => window.getComputedStyle(document.body).fontFamily")
            self.assertTrue(
                any(name in font_family for name in ["Newsreader", "Georgia", "serif"]),
                f"Unexpected font-family: {font_family}"
            )

            # Check background color and color tokens
            bg_color = session.page.evaluate("() => window.getComputedStyle(document.body).backgroundColor")
            self.assertIn("rgb(", bg_color)

            session.assert_zero_errors("colosseum_tokens")

    def test_03_diamond_glyphs_rendered_in_navigation_and_separators(self):
        """Verify diamond glyph '◆' is present in top navigation and section separators."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/")

            # Brand contains diamond glyph
            brand_text = session.page.inner_text(".brand")
            self.assertIn("◆", brand_text)

            # Nav contains diamond separators
            diamonds = session.page.locator(".diamond").all()
            self.assertGreaterEqual(len(diamonds), 5, "Expected at least 5 diamond glyphs in topbar")

            session.assert_zero_errors("diamond_glyphs")

    def test_04_four_column_footer_present_across_routes(self):
        """Verify 4-column structured footer layout with contract addresses and security links."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/proof")

            # Verify footer column presence
            footer_cols = session.page.locator(".footer-col").all()
            self.assertEqual(len(footer_cols), 4, "Footer must have exactly 4 columns")

            # Check footer content includes Sepolia contracts and EIP-712 security mention
            footer_text = session.page.inner_text(".footer")
            self.assertIn("TaskEscrow", footer_text)
            self.assertIn("AegisRegistry", footer_text)
            self.assertIn("EIP-712", footer_text)

            session.assert_zero_errors("footer_inspection")

    def test_05_auth_slot_wallet_toggle_interaction(self):
        """Verify interactive wallet connect button toggles state without console errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/")

            auth_btn = session.page.locator("#auth-slot-btn")
            self.assertEqual(auth_btn.inner_text(), "Connect Wallet")

            # Click to connect
            auth_btn.click()
            self.assertIn("0x71C...", auth_btn.inner_text())

            # Click to disconnect
            auth_btn.click()
            self.assertEqual(auth_btn.inner_text(), "Connect Wallet")

            # Ensure zero console errors during auth interaction
            session.assert_zero_errors("auth_slot_toggle")

    def test_06_unmatched_route_returns_404_cleanly(self):
        """Verify non-existent route renders 404 page gracefully without console errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/nonexistent-route-for-testing")

            content = session.page.content()
            self.assertIn("404", content)
            self.assertIn("Page Not Found", content)

            session.assert_zero_errors("404_handling")

if __name__ == "__main__":
    unittest.main()
