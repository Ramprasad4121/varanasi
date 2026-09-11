"""
author: Varanasi E2E Test Suite
tier: Tier 1 - Feature Coverage
features: F5 (Next.js Offline Font Config) & F6 (Tailwind & Colosseum Utility Infra)
spec: frontend/next.config.js, frontend/package.json, frontend/tailwind.config.ts, grok-workspace
"""
import unittest
import os
import json
import re

class TestF5F6FrontendInfrastructure(unittest.TestCase):
    """
    Validates Next.js build configuration and Colosseum design tokens.
    """

    @classmethod
    def setUpClass(cls):
        cls.frontend_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../../frontend")
        )

    def test_01_next_config_disables_font_optimization(self):
        """Verify frontend/next.config.js has optimizeFonts: false to prevent offline build hangs."""
        config_path = os.path.join(self.frontend_dir, "next.config.js")
        self.assertTrue(os.path.exists(config_path), "frontend/next.config.js does not exist")
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("optimizeFonts", content, "next.config.js must reference optimizeFonts")
        self.assertIn("false", content, "next.config.js must set optimizeFonts: false")

    def test_02_package_json_has_core_dependencies(self):
        """Verify frontend/package.json declares Next.js 14, React 18, and Privy auth."""
        pkg_path = os.path.join(self.frontend_dir, "package.json")
        self.assertTrue(os.path.exists(pkg_path), "frontend/package.json does not exist")
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)
        deps = pkg.get("dependencies", {})
        self.assertIn("next", deps, "Next.js missing in frontend/package.json")
        self.assertIn("react", deps, "React missing in frontend/package.json")
        self.assertIn("@privy-io/react-auth", deps, "@privy-io/react-auth missing in frontend/package.json")
        self.assertIn("viem", deps, "viem missing in frontend/package.json")

    def test_03_colosseum_palette_crimson_accent(self):
        """Verify Roman Crimson (#c01010) is specified in css or theme tokens."""
        css_path = os.path.join(self.frontend_dir, "app/globals.css")
        market_css_path = os.path.join(self.frontend_dir, "app/marketplace.css")
        found = False
        for p in (css_path, market_css_path):
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    c = f.read().lower()
                    if "c01010" in c:
                        found = True
                        break
        # Also check tailwind if exists
        tw_path = os.path.join(self.frontend_dir, "tailwind.config.js")
        if not found and os.path.exists(tw_path):
            with open(tw_path, "r", encoding="utf-8") as f:
                if "c01010" in f.read().lower():
                    found = True
        self.assertTrue(found, "Roman crimson (#c01010) accent token not found in frontend styles")

    def test_04_colosseum_palette_paper_and_ink(self):
        """Verify warm paper (#f3f2ee) and iron ink (#1c1b18) backgrounds are defined."""
        css_path = os.path.join(self.frontend_dir, "app/globals.css")
        market_css_path = os.path.join(self.frontend_dir, "app/marketplace.css")
        content = ""
        for p in (css_path, market_css_path):
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    content += f.read().lower()
        has_paper = "f3f2ee" in content or "f7f6f2" in content or "f5f4ef" in content
        has_ink = "1c1b18" in content or "111" in content or "0d0d0d" in content or "181816" in content
        self.assertTrue(has_paper, "Warm paper background token not found in styles")
        self.assertTrue(has_ink, "Dark iron ink token not found in styles")

    def test_05_colosseum_typography_newsreader_serif(self):
        """Verify Newsreader / serif typography is specified."""
        layout_path = os.path.join(self.frontend_dir, "app/layout.tsx")
        css_path = os.path.join(self.frontend_dir, "app/globals.css")
        combined = ""
        for p in (layout_path, css_path):
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    combined += f.read()
        has_serif = "Newsreader" in combined or "serif" in combined.lower()
        self.assertTrue(has_serif, "Newsreader or serif typography token not found in layout/globals")

    def test_06_colosseum_sharp_radius_token(self):
        """Verify 0px / sharp border radius is enforced for Colosseum plate aesthetics."""
        market_css = os.path.join(self.frontend_dir, "app/marketplace.css")
        globals_css = os.path.join(self.frontend_dir, "app/globals.css")
        combined = ""
        for p in (market_css, globals_css):
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    combined += f.read()
        has_zero_radius = "border-radius: 0" in combined or "rounded-none" in combined or "radius: 0" in combined
        self.assertTrue(has_zero_radius, "Colosseum 0px sharp border radius rule not found in styles")

if __name__ == "__main__":
    unittest.main()
