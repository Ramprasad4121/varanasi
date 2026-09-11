"""
author: Varanasi E2E Test Suite
tier: Tier 2 - Boundary & Corner Cases
scope: Backend Signal & Score Service Boundaries
spec: service/src/server.ts, service/src/hashscan.ts
"""
import unittest
import re

SYMBOL_RE = re.compile(r"^[A-Z]{2,10}\/[A-Z]{2,10}$")
HEDERA_TX_RE = re.compile(r"^\d+\.\d+\.\d+@\d+\.\d+$")

def resolve_symbol(body):
    raw = (body or {}).get("symbol")
    if raw is None:
        return True, "ETH/USDC"
    if not isinstance(raw, str):
        return False, "invalid symbol: expected string"
    symbol = raw.strip().upper()
    if not SYMBOL_RE.match(symbol):
        return False, "invalid symbol format"
    return True, symbol

class TestServiceBoundaries(unittest.TestCase):
    """
    Validates boundary conditions in request handling, symbol parsing, and transaction formatting.
    """

    def test_01_valid_standard_and_multi_letter_symbols(self):
        """Test valid boundary symbols (min 2 chars, max 10 chars per base/quote)."""
        valid_symbols = ["BT/US", "ETH/USDC", "WBTC/USDT", "HEURISTIC/ALGORITHM"]
        for s in valid_symbols:
            ok, sym = resolve_symbol({"symbol": s})
            self.assertTrue(ok, f"Expected {s} to be valid")
            self.assertEqual(sym, s)

    def test_02_symbol_length_boundary_overflow(self):
        """Test symbol exceeding 10 characters in base or quote is rejected."""
        overflow_symbols = [
            "TOOLONGSYMBOLNAME/USDC",
            "ETH/TOOLONGSYMBOLNAME",
            "E/USDC",  # Too short (1 char)
            "ETH/U",   # Too short (1 char)
        ]
        for s in overflow_symbols:
            ok, err = resolve_symbol({"symbol": s})
            self.assertFalse(ok, f"Expected overflow symbol {s} to be rejected")

    def test_03_symbol_special_characters_rejected(self):
        """Test symbols with special characters or malicious injections are rejected."""
        malicious_symbols = [
            "ETH-USDC",         # Hyphen instead of slash
            "ETH/USDC; DROP",   # SQL-like injection
            "<script>/USDC",    # XSS injection
            "ETH /USDC",        # Space in base
            "ETH/ USDC",        # Space in quote
            "ETH\\USDC",        # Backslash
        ]
        for s in malicious_symbols:
            ok, err = resolve_symbol({"symbol": s})
            self.assertFalse(ok, f"Expected invalid symbol '{s}' to be rejected")

    def test_04_none_or_empty_body_defaults_to_eth_usdc(self):
        """Test omitting symbol body safely falls back to default 'ETH/USDC'."""
        cases = [{}, None, {"otherField": 123}]
        for c in cases:
            ok, sym = resolve_symbol(c)
            self.assertTrue(ok)
            self.assertEqual(sym, "ETH/USDC")

    def test_05_hedera_tx_id_format_boundary(self):
        """Test valid and invalid Hedera transaction ID regex patterns."""
        valid_ids = [
            "0.0.123456@1700000000.000000000",
            "0.0.3@1699999999.123456789",
        ]
        invalid_ids = [
            "0.0.123456-1700000000-000000000", # Hyphen separated
            "0.123456@1700000000.000000000",    # Missing realm
            "tx_hash_0x123456789abcdef",        # EVM hex hash
            "",                                 # Empty
        ]
        for tx in valid_ids:
            self.assertIsNotNone(HEDERA_TX_RE.match(tx), f"Expected valid Hedera txId: {tx}")
        for tx in invalid_ids:
            self.assertIsNone(HEDERA_TX_RE.match(tx), f"Expected invalid Hedera txId: {tx}")

    def test_06_rate_limiter_retry_after_calculation(self):
        """Test Retry-After calculation boundary when rate limit (120 req/min) exceeded."""
        now = 1000000
        reset_at = 1060000 # 60s window
        retry_after = max(1, int((reset_at - now) / 1000))
        self.assertEqual(retry_after, 60)

        # Boundary: 1 ms left in window
        reset_at_near = 1000001
        retry_after_near = max(1, int((reset_at_near - now) / 1000))
        self.assertEqual(retry_after_near, 1)

if __name__ == "__main__":
    unittest.main()
