"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Real-World Application Scenarios
scenario: Agent Catalog Discovery, Filtering & Card Interaction
spec: TEST_INFRA.md § Tier 4, frontend/components/AgentMarket.tsx
"""
import unittest
from e2e.browser_harness import BrowserSession
from e2e.tier4_scenarios.scenario_fixtures import setup_scenario_routing

class TestBrowserAgentCatalogJourney(unittest.TestCase):
    """
    Validates agent market discovery, bench seat inspection, dynamic filtering,
    risk band controls, card actions, and AegisRegistry onchain kill switch triggers.
    Enforces strict zero console error policy throughout.
    """

    def test_01_bench_seats_status_and_archetypes_display(self):
        """Verify the bench displays worker archetypes and status counts."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")

            # Bench presence and header
            bench = session.page.locator("#agent-bench")
            self.assertTrue(bench.is_visible())
            status_text = session.page.inner_text("#bench-status")
            self.assertIn("waiting", status_text)
            self.assertIn("on the job", status_text)

            # Inspect Scout seat
            scout_seat = session.page.locator("#seat-scout")
            self.assertIn("Scout", scout_seat.inner_text())
            self.assertIn("on the job", scout_seat.inner_text().lower())

            # Inspect Analyst seat with Hire CTA
            analyst_seat = session.page.locator("#seat-analyst")
            self.assertIn("Analyst", analyst_seat.inner_text())
            self.assertIn("Hire Analyst", analyst_seat.inner_text())

            session.assert_zero_errors("bench_inspection")

    def test_02_dynamic_search_filtering_by_sublabel(self):
        """Verify typing in search input dynamically filters visible agent cards."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")

            cards = session.page.locator(".agent-card").all()
            self.assertGreaterEqual(len(cards), 3, "Expected at least 3 initial agent cards")

            # Filter for 'sentinel'
            session.page.fill("#agent-search", "sentinel")
            visible_cards = [c for c in cards if c.is_visible()]
            self.assertEqual(len(visible_cards), 1)
            self.assertIn("sentinel-1", visible_cards[0].inner_text())

            # Filter for 'analyst'
            session.page.fill("#agent-search", "analyst")
            visible_cards = [c for c in cards if c.is_visible()]
            self.assertEqual(len(visible_cards), 1)
            self.assertIn("analyst-1", visible_cards[0].inner_text())

            # Clear search
            session.page.fill("#agent-search", "")
            visible_cards = [c for c in cards if c.is_visible()]
            self.assertGreaterEqual(len(visible_cards), 3)

            session.assert_zero_errors("agent_search_filtering")

    def test_03_risk_band_category_filter_buttons(self):
        """Verify clicking risk band buttons isolates LOW vs MEDIUM risk agents."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")

            cards = session.page.locator(".agent-card").all()

            # Filter LOW risk
            session.page.click("#filter-low")
            visible_cards = [c for c in cards if c.is_visible()]
            self.assertEqual(len(visible_cards), 2)
            for c in visible_cards:
                self.assertIn("LOW", c.inner_text())

            # Filter MEDIUM risk
            session.page.click("#filter-medium")
            visible_cards = [c for c in cards if c.is_visible()]
            self.assertEqual(len(visible_cards), 1)
            self.assertIn("analyst-1", visible_cards[0].inner_text())
            self.assertIn("MEDIUM", visible_cards[0].inner_text())

            # Reset to ALL
            session.page.click("#filter-all")
            visible_cards = [c for c in cards if c.is_visible()]
            self.assertGreaterEqual(len(visible_cards), 3)

            session.assert_zero_errors("risk_band_filtering")

    def test_04_agent_card_inspection_and_hire_navigation(self):
        """Verify agent card fields and hire link navigation."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")

            first_card = session.page.locator(".agent-card").first
            card_text = first_card.inner_text()

            # Check ENSv2 subname, wallet, role, and badge
            self.assertIn(".aegis.eth", card_text)
            self.assertIn("Wallet: 0x", card_text)
            self.assertIn("Role:", card_text)
            self.assertIn("AUTHORIZED", card_text)

            # Click Hire button on card -> Navigates to /hire
            hire_link = first_card.locator("a:has-text('Hire')")
            self.assertIn("/hire?agent=", hire_link.get_attribute("href") or "")

            session.assert_zero_errors("agent_card_inspection")

    def test_05_revoke_kill_switch_interaction(self):
        """Verify clicking revoke triggers kill-switch handling without errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")

            # Handle browser alert dialog automatically
            session.page.on("dialog", lambda d: d.accept())

            # Click revoke on sentinel-1
            first_card = session.page.locator(".agent-card").first
            revoke_btn = first_card.locator("button:has-text('Revoke')")
            revoke_btn.click()

            # Verify console output logged revocation initiation
            logged_texts = [entry["text"] for entry in session.console_logs]
            self.assertTrue(
                any("kill-switch" in msg.lower() or "revok" in msg.lower() for msg in logged_texts),
                f"Revocation not recorded in console logs: {logged_texts}"
            )

            session.assert_zero_errors("revoke_kill_switch")

if __name__ == "__main__":
    unittest.main()
