"""
author: Varanasi E2E Test Suite
tier: Tier 2 - Boundary & Corner Cases
scope: Agent Automation & Freelancer Decision Boundaries
spec: agent/src/workers/freelancer.ts, agent/src/workers/analyst.ts
"""
import unittest
import re

AGENT_ENS_RE = re.compile(r"^[a-zA-Z0-9_-]+\.aegis\.eth$")
EVM_ADDR_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")

def decide_freelancer_action(state: int, now_sec: int, expiry: int) -> str:
    """
    Port of agent/src/workers/freelancer.ts line 58-75:
    state 2 (Validated) -> released
    state 1 (Funded) + expired -> refunded
    state 1 (Funded) + not expired -> pending
    other -> pending
    """
    if state == 2:
        return "released"
    elif state == 1:
        return "refunded" if now_sec >= expiry else "pending"
    return "pending"

def compute_risk_band(score: int) -> str:
    if score >= 700:
        return "LOW"
    elif score >= 400:
        return "MEDIUM"
    return "HIGH"

class TestAgentBoundaries(unittest.TestCase):
    """
    Validates boundary conditions in Agent identity, address validation,
    risk band calculations, and Freelancer settlement triggers.
    """

    def test_01_agent_ens_name_boundaries(self):
        """Test valid and invalid aegis.eth subdomains."""
        valid_agents = ["sentinel-1.aegis.eth", "alpha_trader.aegis.eth", "risk0.aegis.eth"]
        invalid_agents = [
            "sentinel-1.eth",          # Missing .aegis
            "sentinel-1.aegis.com",    # Wrong TLD
            "sentinel!@#.aegis.eth",   # Invalid chars
            "",                        # Empty
        ]
        for name in valid_agents:
            self.assertIsNotNone(AGENT_ENS_RE.match(name), f"Expected valid ENS name: {name}")
        for name in invalid_agents:
            self.assertIsNone(AGENT_ENS_RE.match(name), f"Expected invalid ENS name: {name}")

    def test_02_evm_address_boundaries(self):
        """Test EVM hex address boundary validation."""
        valid = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"
        invalid_short = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f564"  # 39 chars
        invalid_no_prefix = "88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"
        invalid_chars = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f56ZZ"
        self.assertIsNotNone(EVM_ADDR_RE.match(valid))
        self.assertIsNone(EVM_ADDR_RE.match(invalid_short))
        self.assertIsNone(EVM_ADDR_RE.match(invalid_no_prefix))
        self.assertIsNone(EVM_ADDR_RE.match(invalid_chars))

    def test_03_risk_score_band_boundaries(self):
        """Test risk band threshold boundaries at 0, 399, 400, 699, 700, 1000."""
        self.assertEqual(compute_risk_band(0), "HIGH")
        self.assertEqual(compute_risk_band(399), "HIGH")
        self.assertEqual(compute_risk_band(400), "MEDIUM")
        self.assertEqual(compute_risk_band(699), "MEDIUM")
        self.assertEqual(compute_risk_band(700), "LOW")
        self.assertEqual(compute_risk_band(1000), "LOW")

    def test_04_freelancer_action_state_2_validated(self):
        """Verify Freelancer worker immediately triggers 'released' when task.state == 2."""
        action = decide_freelancer_action(state=2, now_sec=1700000000, expiry=1700100000)
        self.assertEqual(action, "released")

    def test_05_freelancer_action_expired_state_1(self):
        """Verify Freelancer worker triggers 'refunded' when task.state == 1 and now >= expiry."""
        now = 1700100000
        action = decide_freelancer_action(state=1, now_sec=now, expiry=now)
        self.assertEqual(action, "refunded")

        action_after = decide_freelancer_action(state=1, now_sec=now + 10, expiry=now)
        self.assertEqual(action_after, "refunded")

    def test_06_freelancer_action_unexpired_state_1_is_pending(self):
        """Verify Freelancer worker stays 'pending' when task.state == 1 and not yet expired."""
        now = 1700000000
        action = decide_freelancer_action(state=1, now_sec=now, expiry=now + 3600)
        self.assertEqual(action, "pending")

if __name__ == "__main__":
    unittest.main()
