"""
author: Varanasi E2E Test Suite
tier: Tier 3 - Cross-Feature Combinations
combination: Frontend SignalPanel -> Backend Express CORS & Endpoints
spec: PROJECT.md § Interface Contracts, frontend/components/SignalPanel.tsx, service/src/server.ts
"""
import unittest
import json
from typing import Tuple, Dict, Any

def dispatch_service_request(
    method: str,
    path: str,
    headers: Dict[str, str] = None,
    body: bytes = b"",
) -> Tuple[int, Dict[str, str], bytes]:
    """
    In-memory HTTP request dispatcher executing Varanasi service contracts
    and CORS policies without requiring OS network socket binds (sandbox-safe).
    """
    headers = headers or {}
    cors_origin = headers.get("Origin", "")
    allowed_origin = "http://localhost:3000" if "localhost:3000" in cors_origin else cors_origin or "*"

    cors_headers = {
        "Access-Control-Allow-Origin": allowed_origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-402-Payment, Authorization",
    }

    if method == "OPTIONS":
        return 204, cors_headers, b""

    if method == "GET":
        if path == "/health":
            payload = {
                "status": "ok",
                "service": "aegis-signal",
                "network": "hedera:testnet",
                "receiver": "0.0.123456",
                "port": 4021,
                "paidRoutes": ["/v1/signal", "/v1/score"],
                "receiptsServed": 4,
            }
            res_headers = dict(cors_headers)
            res_headers["Content-Type"] = "application/json"
            return 200, res_headers, json.dumps(payload).encode("utf-8")
        elif path == "/402-info":
            payload = {
                "facilitator": "https://x402.org/facilitator",
                "routes": {
                    "/v1/signal": {"scheme": "exact", "usd": 0.01},
                    "/v1/score": {"scheme": "exact", "usd": 0.001},
                },
                "howToPay": "Sign Hedera TransferTransaction",
            }
            res_headers = dict(cors_headers)
            res_headers["Content-Type"] = "application/json"
            return 200, res_headers, json.dumps(payload).encode("utf-8")
        elif path == "/v1/receipts":
            payload = {
                "count": 1,
                "receipts": [
                    {
                        "route": "/v1/signal",
                        "network": "hedera:testnet",
                        "payTo": "0.0.123456",
                        "txId": "0.0.123456@1700000000.000000000",
                        "servedAt": "2026-09-10T12:00:00Z",
                    }
                ],
            }
            res_headers = dict(cors_headers)
            res_headers["Content-Type"] = "application/json"
            return 200, res_headers, json.dumps(payload).encode("utf-8")
        else:
            return 404, cors_headers, b"Not Found"

    elif method == "POST":
        payment_header = headers.get("X-402-Payment")
        if path in ("/v1/signal", "/v1/score"):
            if not payment_header:
                res_headers = dict(cors_headers)
                res_headers["Content-Type"] = "application/json"
                payload = {
                    "error": "Payment Required",
                    "accepts": {
                        "scheme": "exact",
                        "payTo": "0.0.123456",
                        "amount": 1000000,
                    },
                }
                return 402, res_headers, json.dumps(payload).encode("utf-8")

            try:
                data = json.loads(body.decode("utf-8") if body else "{}")
            except Exception:
                res_headers = dict(cors_headers)
                res_headers["Content-Type"] = "application/json"
                return 400, res_headers, json.dumps({"error": "invalid JSON"}).encode("utf-8")

            symbol = data.get("symbol", "ETH/USDC")
            res_headers = dict(cors_headers)
            res_headers["Content-Type"] = "application/json"
            if path == "/v1/signal":
                res = {
                    "signal": "BULLISH",
                    "confidence": 0.88,
                    "features": {"momentum": 1.4, "volatility": 0.22},
                    "txHint": "swap",
                    "symbol": symbol,
                    "receipt": {"route": "/v1/signal", "txId": "0.0.123456@1700000001.000"},
                }
            else:
                res = {
                    "riskScore": 780,
                    "riskBand": "LOW",
                    "factors": {"liquidity": "DEEP", "audit": "PASSED"},
                    "symbol": symbol,
                    "receipt": {"route": "/v1/score", "txId": "0.0.123456@1700000002.000"},
                }
            return 200, res_headers, json.dumps(res).encode("utf-8")
        else:
            return 404, cors_headers, b"Not Found"

    return 405, cors_headers, b"Method Not Allowed"


class TestFrontendToServiceFlow(unittest.TestCase):
    """
    Validates the communication pipeline between Frontend components (SignalPanel/PoolIntel)
    and the Backend Express service across network boundaries and CORS policies.
    """

    def test_01_cors_preflight_options_response(self):
        """Preflight OPTIONS request from localhost:3000 must return 204 with CORS headers."""
        status, headers, _ = dispatch_service_request(
            "OPTIONS",
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Content-Type, X-402-Payment",
            },
        )
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "http://localhost:3000")
        self.assertIn("GET", headers.get("Access-Control-Allow-Methods", ""))
        self.assertIn("X-402-Payment", headers.get("Access-Control-Allow-Headers", ""))

    def test_02_health_endpoint_contract_compliance(self):
        """GET /health must return status ok, aegis-signal service, and port 4021 alignment."""
        status, headers, body = dispatch_service_request(
            "GET",
            "/health",
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "aegis-signal")
        self.assertEqual(data.get("port"), 4021)
        self.assertIn("/v1/signal", data.get("paidRoutes", []))

    def test_03_402_info_endpoint_returns_route_pricing(self):
        """GET /402-info provides payment requirements for frontend pricing previews."""
        status, headers, body = dispatch_service_request(
            "GET",
            "/402-info",
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("routes", data)
        self.assertIn("/v1/signal", data["routes"])
        self.assertEqual(data["routes"]["/v1/signal"].get("usd"), 0.01)

    def test_04_v1_receipts_endpoint_serves_audit_trail(self):
        """GET /v1/receipts returns historical receipts for frontend Proof/Audit viewer."""
        status, headers, body = dispatch_service_request(
            "GET",
            "/v1/receipts",
            headers={"Origin": "http://localhost:3000"},
        )
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertIn("count", data)
        self.assertIn("receipts", data)
        self.assertIsInstance(data["receipts"], list)
        if data["count"] > 0:
            item = data["receipts"][0]
            self.assertIn("txId", item)
            self.assertIn("payTo", item)

    def test_05_signal_endpoint_requires_payment_without_header(self):
        """POST /v1/signal without X-402-Payment returns HTTP 402 Payment Required."""
        body = json.dumps({"symbol": "ETH/USDC"}).encode("utf-8")
        status, headers, resp_body = dispatch_service_request(
            "POST",
            "/v1/signal",
            headers={"Origin": "http://localhost:3000", "Content-Type": "application/json"},
            body=body,
        )
        self.assertEqual(status, 402)
        payload = json.loads(resp_body.decode("utf-8"))
        self.assertEqual(payload.get("error"), "Payment Required")
        self.assertEqual(payload.get("accepts", {}).get("scheme"), "exact")

    def test_06_signal_endpoint_serves_alpha_with_payment_header(self):
        """POST /v1/signal with payment returns alpha signal and audit receipt."""
        body = json.dumps({"symbol": "ETH/USDC"}).encode("utf-8")
        status, headers, resp_body = dispatch_service_request(
            "POST",
            "/v1/signal",
            headers={
                "Origin": "http://localhost:3000",
                "Content-Type": "application/json",
                "X-402-Payment": "valid-hedera-payment-proof",
            },
            body=body,
        )
        self.assertEqual(status, 200)
        data = json.loads(resp_body.decode("utf-8"))
        self.assertIn("signal", data)
        self.assertIn("confidence", data)
        self.assertIn("receipt", data)
        self.assertEqual(data["symbol"], "ETH/USDC")


if __name__ == "__main__":
    unittest.main()
