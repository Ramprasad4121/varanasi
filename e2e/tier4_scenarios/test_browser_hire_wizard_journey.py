"""
author: Varanasi E2E Test Suite
tier: Tier 4 - Real-World Application Scenarios
scenario: HireWizard 4-Step Interactive User Journey
spec: TEST_INFRA.md § Tier 4, frontend/components/HireWizard.tsx
"""
import unittest
from e2e.browser_harness import BrowserSession
from e2e.tier4_scenarios.scenario_fixtures import setup_scenario_routing

class TestBrowserHireWizardJourney(unittest.TestCase):
    def test_01_step1_pick_updates_cap_on_terms(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")
            self.assertTrue(session.page.is_visible("#wizard-step-1"))
            session.page.click("#arch-analyst")
            analyst = session.page.locator("#arch-analyst")
            self.assertIn("selected", analyst.get_attribute("class") or "")
            session.page.click("#btn-next-to-terms")
            self.assertTrue(session.page.is_visible("#wizard-step-2"))
            self.assertEqual(session.page.input_value("#input-cap"), "25")
            session.assert_zero_errors("wizard_step1_archetype_selection")

    def test_02_step2_configure_mandate_terms_and_navigation(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")
            session.page.click("#btn-next-to-terms")
            self.assertTrue(session.page.is_visible("#wizard-step-2"))
            session.page.fill("#input-cap", "75")
            session.page.fill("#input-merchant", "0x1111111111111111111111111111111111111111")
            session.page.click("button:has-text('← Back to Archetypes')")
            self.assertTrue(session.page.is_visible("#wizard-step-1"))
            session.page.click("#btn-next-to-terms")
            self.assertEqual(session.page.input_value("#input-cap"), "75")
            session.assert_zero_errors("wizard_step2_terms_configuration")

    def test_03_start_work_panel_present(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")
            self.assertTrue(session.page.is_visible("#start-work"))
            self.assertTrue(session.page.is_visible("#arch-dispatcher"))
            session.assert_zero_errors("start_work_panel")

    def test_04_step4_example_task(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")
            session.page.click("#tab-step-4")
            self.assertTrue(session.page.is_visible("#wizard-step-4"))
            session.page.click("button:has-text('Load Example Task')")
            self.assertTrue(session.page.input_value("#track-task-id").startswith("0x03c85"))
            self.assertEqual(session.page.inner_text("#task-state-badge"), "Released")
            session.assert_zero_errors("wizard_step4_track_task")

    def test_05_complete_pick_to_terms(self):
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")
            session.page.click("#arch-scout")
            session.page.click("#btn-next-to-terms")
            session.page.fill("#input-cap", "15")
            session.page.click("#btn-lock-terms")
            self.assertTrue(session.page.is_visible("#wizard-step-3"))
            session.assert_zero_errors("complete_wizard_journey")

if __name__ == "__main__":
    unittest.main()
