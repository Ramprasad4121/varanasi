"""
author: Varanasi E2E Test Suite
tier: Tier 1 - Feature Coverage
feature: F2 - Backend & Agent Port Alignment (4021)
spec: service/src/server.ts, agent/src/pay.ts, agent/src/doctor.ts, PROJECT.md § Feature Inventory
"""
import unittest
import os
import re

class TestF2PortAlignment(unittest.TestCase):
    """
    Validates port 4021 alignment across Backend Service, Agent configuration, and Doctor diagnostics.
    """

    @classmethod
    def setUpClass(cls):
        cls.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))

    def test_01_service_server_defaults_to_port_4021(self):
        """Verify service/src/server.ts defaults PORT to 4021."""
        server_path = os.path.join(self.root_dir, "service/src/server.ts")
        self.assertTrue(os.path.exists(server_path), "service/src/server.ts does not exist")
        with open(server_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("4021", content, "Default port 4021 not found in service/src/server.ts")
        match = re.search(r"parseInt\(\s*process\.env\.PORT\s*\?\?\s*['\"]4021['\"]", content)
        self.assertIsNotNone(match, "PORT fallback is not set to '4021' in server.ts")

    def test_02_agent_pay_fallback_url_uses_port_4021(self):
        """Verify agent/src/pay.ts uses port 4021 and not legacy port 3001."""
        pay_path = os.path.join(self.root_dir, "agent/src/pay.ts")
        if os.path.exists(pay_path):
            with open(pay_path, "r", encoding="utf-8") as f:
                content = f.read()
            # Must not contain legacy 3001 fallback
            legacy_found = re.search(r"http://localhost:3001", content)
            self.assertIsNone(legacy_found, "agent/src/pay.ts still contains legacy port 3001!")
            self.assertIn("4021", content, "agent/src/pay.ts must reference port 4021")

    def test_03_agent_doctor_checks_port_4021(self):
        """Verify agent/src/doctor.ts targets port 4021 for health probe."""
        doctor_path = os.path.join(self.root_dir, "agent/src/doctor.ts")
        if os.path.exists(doctor_path):
            with open(doctor_path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertNotIn("localhost:3001", content, "agent/src/doctor.ts still references port 3001")
            self.assertIn("4021", content, "agent/src/doctor.ts should reference port 4021")

    def test_04_env_examples_specify_port_4021(self):
        """Verify .env.example files document port 4021."""
        service_env = os.path.join(self.root_dir, "service/.env.example")
        if os.path.exists(service_env):
            with open(service_env, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertIn("4021", content, "service/.env.example must specify port 4021")

    def test_05_health_endpoint_contract_format(self):
        """Verify specification of GET /health response payload."""
        expected_fields = ["status", "service", "network", "port", "paidRoutes", "receiptsServed"]
        mock_response = {
            "status": "ok",
            "service": "aegis-signal",
            "network": "hedera:testnet",
            "port": 4021,
            "paidRoutes": ["/v1/signal", "/v1/score"],
            "receiptsServed": 0,
        }
        for field in expected_fields:
            self.assertIn(field, mock_response, f"Missing field '{field}' in health response contract")
        self.assertEqual(mock_response["port"], 4021)
        self.assertEqual(mock_response["service"], "aegis-signal")

    def test_06_run_sh_script_monitors_port_4021(self):
        """Verify run.sh script probes port 4021 for signal service readiness."""
        run_sh = os.path.join(self.root_dir, "run.sh")
        self.assertTrue(os.path.exists(run_sh), "run.sh does not exist")
        with open(run_sh, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("4021", content, "run.sh does not reference port 4021")
        self.assertIn("http://localhost:4021/health", content, "run.sh should probe http://localhost:4021/health")

if __name__ == "__main__":
    unittest.main()
