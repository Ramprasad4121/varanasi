"""
author: Varanasi E2E Test Suite
fixtures: Self-contained mock service server for reliable offline/test execution.
Simulates Express service (:4021) and mock frontend responses when testing in isolation.
"""
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional, Dict, Any

class VaranasiMockHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "http://localhost:3000")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-402-Payment, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        self._send_cors_headers()
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = {
                "status": "ok",
                "service": "aegis-signal",
                "network": "hedera:testnet",
                "receiver": "0.0.123456",
                "port": 4021,
                "paidRoutes": ["/v1/signal", "/v1/score"],
                "receiptsServed": 4,
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        elif self.path == "/402-info":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = {
                "facilitator": "https://x402.org/facilitator",
                "routes": {
                    "/v1/signal": {"scheme": "exact", "usd": 0.01},
                    "/v1/score": {"scheme": "exact", "usd": 0.001},
                },
                "howToPay": "Sign Hedera TransferTransaction",
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        elif self.path == "/v1/receipts":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
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
            self.wfile.write(json.dumps(payload).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        post_body = self.rfile.read(content_len) if content_len > 0 else b"{}"
        
        self._send_cors_headers()
        payment_header = self.headers.get("X-402-Payment")
        
        if self.path in ("/v1/signal", "/v1/score"):
            if not payment_header:
                self.send_response(402)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "Payment Required",
                    "accepts": {
                        "scheme": "exact",
                        "payTo": "0.0.123456",
                        "amount": 1000000,
                    }
                }).encode("utf-8"))
                return
            
            try:
                data = json.loads(post_body.decode("utf-8"))
            except Exception:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "invalid JSON"}).encode("utf-8"))
                return
            
            symbol = data.get("symbol", "ETH/USDC")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            if self.path == "/v1/signal":
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
            self.wfile.write(json.dumps(res).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Suppress noisy standard HTTP logs during tests
        return

class MockServerContext:
    def __init__(self, port: int = 4021):
        self.port = port
        self.server: Optional[HTTPServer] = None
        self.thread: Optional[threading.Thread] = None

    def start(self):
        try:
            self.server = HTTPServer(("127.0.0.1", self.port), VaranasiMockHandler)
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()
            return True
        except OSError:
            # Port already in use (e.g. real service running)
            return False

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None
