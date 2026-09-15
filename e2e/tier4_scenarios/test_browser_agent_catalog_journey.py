"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Real-World Application Scenarios
scenario: Agent Catalog Discovery, Filtering & Card Interaction
spec: TEST_INFRA.md § Tier 4, frontend/app/agents/page.tsx
"""
import unittest
from e2e.browser_harness import BrowserSession
from e2e.tier4_scenarios.scenario_fixtures import setup_scenario_routing

class TestBrowserAgentCatalogJourney(unittest.TestCase):
    def test_01_live_roster_shows_fifteen_agents(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")
            bench = session.page.locator("#agent-bench")
            self.assertTrue(bench.is_visible())
            cards = session.page.locator(".agent-card").all()
            self.assertGreaterEqual(len(cards), 15, "Expected 15 live agent cards")
            self.assertIn("Scout", session.page.inner_text("body"))
            self.assertIn("Dispatcher", session.page.inner_text("body"))
            session.assert_zero_errors("roster_inspection")

    def test_02_dynamic_search_filtering(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")
            session.page.fill("#agent-search", "analyst")
            visible = [c for c in session.page.locator(".agent-card").all() if c.is_visible()]
            self.assertEqual(len(visible), 1)
            self.assertIn("Analyst", visible[0].inner_text())
            session.page.fill("#agent-search", "")
            visible = [c for c in session.page.locator(".agent-card").all() if c.is_visible()]
            self.assertGreaterEqual(len(visible), 15)
            session.assert_zero_errors("agent_search_filtering")

    def test_03_specialty_filter_chips(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")
            session.page.click("button:has-text('risk')")
            visible = [c for c in session.page.locator(".agent-card").all() if c.is_visible()]
            self.assertGreaterEqual(len(visible), 1)
            for c in visible:
                self.assertIn("risk", c.inner_text().lower())
            session.assert_zero_errors("specialty_filtering")

    def test_04_agent_card_hire_navigation(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/agents")
            first = session.page.locator(".agent-card").first
            self.assertIn(".aegis.eth", first.inner_text())
            hire = first.locator("a:has-text('Hire')")
            href = hire.get_attribute("href") or ""
            self.assertIn("/hire?agent=", href)
            session.assert_zero_errors("agent_card_inspection")

if __name__ == "__main__":
    unittest.main()
