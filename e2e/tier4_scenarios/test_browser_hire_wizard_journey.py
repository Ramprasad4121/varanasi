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
    """
    Validates the end-to-end interactive journey of the 4-step Hire Wizard:
    Step 1 (Archetype) -> Step 2 (Terms) -> Step 3 (Authorize & Fund) -> Step 4 (Track).
    Enforces strict zero-console-error policy throughout the journey.
    """

    def test_01_step1_archetype_selection_updates_cap_and_selection(self):
        """Step 1: Selecting archetypes updates visual card and cap value."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")

            # Default step is Step 1
            self.assertTrue(session.page.is_visible("#wizard-step-1"))
            self.assertFalse(session.page.is_visible("#wizard-step-2"))

            # Click Analyst archetype card
            session.page.click("#arch-analyst")
            analyst_card = session.page.locator("#arch-analyst")
            self.assertIn("selected", analyst_card.get_attribute("class") or "")

            # Verify cap input in Step 2 was updated to 25
            cap_val = session.page.input_value("#input-cap")
            self.assertEqual(cap_val, "25")

            # Click Freelancer archetype card
            session.page.click("#arch-freelancer")
            freelancer_card = session.page.locator("#arch-freelancer")
            self.assertIn("selected", freelancer_card.get_attribute("class") or "")
            cap_val = session.page.input_value("#input-cap")
            self.assertEqual(cap_val, "50")

            session.assert_zero_errors("wizard_step1_archetype_selection")

    def test_02_step2_configure_mandate_terms_and_navigation(self):
        """Step 2: Enter mandate terms and transition between Step 1 and Step 2."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")

            # Advance from Step 1 to Step 2
            session.page.click("#btn-next-to-terms")
            self.assertFalse(session.page.is_visible("#wizard-step-1"))
            self.assertTrue(session.page.is_visible("#wizard-step-2"))

            # Enter custom spending cap and merchant
            session.page.fill("#input-cap", "75")
            session.page.fill("#input-merchant", "0x1111111111111111111111111111111111111111")
            session.page.fill("#input-window", "7200")
            session.page.fill("#input-expiry", "14400")

            # Verify back button works
            session.page.click("button:has-text('← Back to Archetypes')")
            self.assertTrue(session.page.is_visible("#wizard-step-1"))
            self.assertFalse(session.page.is_visible("#wizard-step-2"))

            # Advance back to Step 2
            session.page.click("#btn-next-to-terms")
            self.assertTrue(session.page.is_visible("#wizard-step-2"))
            self.assertEqual(session.page.input_value("#input-cap"), "75")

            session.assert_zero_errors("wizard_step2_terms_configuration")

    def test_03_step3_eip712_json_inspection_and_funding_execution(self):
        """Step 3: Inspect EIP-712 structured JSON preview and execute authorization & fund."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")

            # Advance to Step 3
            session.page.click("#btn-next-to-terms")
            session.page.click("#btn-lock-terms")
            self.assertTrue(session.page.is_visible("#wizard-step-3"))

            # Inspect EIP-712 JSON preview content (expand details)
            session.page.click("summary:has-text('Inspect EIP-712 Mandate JSON')")
            json_preview = session.page.inner_text("#mandate-json-preview")
            self.assertIn("TaskEscrow", json_preview)
            self.assertIn("11155111", json_preview)
            self.assertIn("0xb5D47feaa1aA4b06C0E0508afCd3864f4C40BD24", json_preview)
            self.assertIn("Mandate", json_preview)

            # Trigger Authorize & Fund
            session.page.click("#btn-authorize-fund")

            # Wait for simulation transition to Step 4
            session.page.wait_for_selector("#wizard-step-4", state="visible")
            self.assertTrue(session.page.is_visible("#wizard-step-4"))

            session.assert_zero_errors("wizard_step3_authorize_and_fund")

    def test_04_step4_live_escrow_task_tracking_and_settlement(self):
        """Step 4: Live task ID tracking and state updates."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")

            # Jump directly to step 4 via tab indicator
            session.page.click("#tab-step-4")
            self.assertTrue(session.page.is_visible("#wizard-step-4"))

            # Check initial task ID value
            task_id = session.page.input_value("#track-task-id")
            self.assertTrue(task_id.startswith("0x"))

            # Refresh tracking state
            session.page.click("#btn-refresh-track")
            badge = session.page.inner_text("#task-state-badge")
            self.assertEqual(badge, "RELEASED")

            # Load demo task button
            session.page.fill("#track-task-id", "")
            session.page.click("button:has-text('Load Example Task')")
            self.assertTrue(session.page.input_value("#track-task-id").startswith("0x03c85"))

            session.assert_zero_errors("wizard_step4_track_task")

    def test_05_complete_end_to_end_hire_wizard_journey(self):
        """Walk through complete unbroken 4-step wizard journey without console errors."""
        with BrowserSession() as session:
            setup_scenario_routing(session.page)
            session.page.goto("http://localhost:3000/hire")

            # 1. Step 1: Pick Scout
            session.page.click("#arch-scout")
            session.page.click("#btn-next-to-terms")

            # 2. Step 2: Lock Terms
            session.page.fill("#input-cap", "15")
            session.page.click("#btn-lock-terms")

            # 3. Step 3: Authorize & Fund
            session.page.click("#btn-authorize-fund")

            # 4. Step 4: Track
            session.page.wait_for_selector("#wizard-step-4", state="visible")
            state_text = session.page.inner_text("#task-state-badge")
            self.assertEqual(state_text, "RELEASED")

            # Strict assertion of zero console errors across the entire multi-step flow
            session.assert_zero_errors("complete_wizard_journey")

if __name__ == "__main__":
    unittest.main()
