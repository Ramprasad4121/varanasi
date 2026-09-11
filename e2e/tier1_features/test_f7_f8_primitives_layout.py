"""
author: Varanasi E2E Test Suite
tier: Tier 1 - Feature Coverage
features: F7 (Colosseum Design Primitives) & F8 (SiteShell Navigation & Root Layout)
spec: frontend/components/, frontend/app/layout.tsx, grok-workspace
"""
import unittest
import os
import re

class TestF7F8PrimitivesAndLayout(unittest.TestCase):
    """
    Validates Colosseum UI primitives (Diamond glyphs, Badges, SiteShell navigation)
    and root layout integrity.
    """

    @classmethod
    def setUpClass(cls):
        cls.frontend_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../frontend")
        )

    def test_01_diamond_glyph_presence(self):
        """Verify the divider primitive (Diamond component / Flame mark) is used in the UI shell."""
        sep_path = os.path.join(self.frontend_dir, "components/SectionSep.tsx")
        diamond_path = os.path.join(self.frontend_dir, "components/Diamond.tsx")
        flame_path = os.path.join(self.frontend_dir, "components/Flame.tsx")
        found = False
        if os.path.exists(sep_path):
            with open(sep_path, "r", encoding="utf-8") as f:
                c = f.read()
                if "Flame" in c or "Diamond" in c:
                    found = True
        if not found and os.path.exists(diamond_path):
            with open(diamond_path, "r", encoding="utf-8") as f:
                if "Diamond" in f.read():
                    found = True
        if not found and os.path.exists(flame_path):
            with open(flame_path, "r", encoding="utf-8") as f:
                if "Flame" in f.read():
                    found = True
        self.assertTrue(found, "Divider primitive (Diamond/Flame) must be present in UI components")

    def test_02_privy_auth_slot_in_layout_or_header(self):
        """Verify Privy authentication button or slot is integrated into header navigation."""
        layout_path = os.path.join(self.frontend_dir, "app/layout.tsx")
        auth_slot_path = os.path.join(self.frontend_dir, "components/AuthSlot.tsx")
        self.assertTrue(os.path.exists(layout_path) or os.path.exists(auth_slot_path))
        with open(layout_path, "r", encoding="utf-8") as f:
            layout_content = f.read()
        has_auth = "AuthSlot" in layout_content or "privy" in layout_content.lower() or "login" in layout_content.lower() or "connect" in layout_content.lower()
        self.assertTrue(has_auth, "Layout must integrate Privy authentication or connect wallet button")

    def test_03_navigation_links_structure(self):
        """Verify navigation bar includes links to primary sections."""
        layout_path = os.path.join(self.frontend_dir, "app/layout.tsx")
        page_path = os.path.join(self.frontend_dir, "app/page.tsx")
        combined = ""
        for p in (layout_path, page_path):
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    combined += f.read()
        # Look for primary navigation destinations
        has_nav_targets = any(dest in combined for dest in ["/activity", "/agents", "/hire", "mandate", "proof", "human"])
        self.assertTrue(has_nav_targets, "Navigation bar must expose core Varanasi feature routes")

    def test_04_agent_market_primitive_exists(self):
        """Verify AgentMarket component exists and handles agent display."""
        market_path = os.path.join(self.frontend_dir, "components/AgentMarket.tsx")
        self.assertTrue(os.path.exists(market_path), "components/AgentMarket.tsx must exist")
        with open(market_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("agent", content.lower())
        self.assertIn("score", content.lower())

    def test_05_pool_intel_and_signal_panel_primitives_exist(self):
        """Verify PoolIntel and SignalPanel components exist."""
        pool_intel = os.path.join(self.frontend_dir, "components/PoolIntel.tsx")
        signal_panel = os.path.join(self.frontend_dir, "components/SignalPanel.tsx")
        self.assertTrue(os.path.exists(pool_intel), "components/PoolIntel.tsx must exist")
        self.assertTrue(os.path.exists(signal_panel), "components/SignalPanel.tsx must exist")

    def test_06_hire_wizard_step_primitive_exists(self):
        """Verify HireWizard component is structured with multi-step hire workflow."""
        wizard_path = os.path.join(self.frontend_dir, "components/HireWizard.tsx")
        self.assertTrue(os.path.exists(wizard_path), "components/HireWizard.tsx must exist")
        with open(wizard_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("step", content.lower())
        self.assertIn("mandate", content.lower())
        self.assertIn("deposit", content.lower())

if __name__ == "__main__":
    unittest.main()
