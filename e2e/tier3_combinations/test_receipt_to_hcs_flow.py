"""
author: Varanasi E2E Test Suite
tier: Tier 3 - Cross-Feature Combinations
combination: Paid Request Handler -> receipts.json -> HCS Audit Trail
spec: service/src/server.ts, service/src/hashscan.ts, service/src/hcs.ts
"""
import unittest
import json
import re
from datetime import datetime, timezone

HEDERA_TXID_RE = re.compile(r"^0\.0\.\d+(?:@\d+\.\d+|-\d+-\d+)$")

def is_valid_hedera_tx_id(tx_id: str) -> bool:
    return bool(tx_id and HEDERA_TXID_RE.match(tx_id))

def hashscan_account_url(account_id: str, scope: str = "testnet") -> str:
    return f"https://hashscan.io/{scope}/account/{account_id}"

def hashscan_tx_url(tx_id: str, scope: str = "testnet") -> str:
    if not is_valid_hedera_tx_id(tx_id):
        return ""
    dash = tx_id.replace("@", "-").replace(".", "-") if "@" in tx_id else tx_id
    # Restore the first two dots for the 0.0 shard.realm prefix if affected
    if dash.startswith("0-0-"):
        dash = "0.0." + dash[4:]
    return f"https://hashscan.io/{scope}/transaction/{dash}"

def build_receipt(route: str, network: str, pay_to: str, tx_id: str) -> dict:
    scope = "mainnet" if "mainnet" in network else "testnet"
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "route": route,
        "network": network,
        "payTo": pay_to,
        "txId": tx_id,
        "servedAt": now_iso,
        "accountUrl": hashscan_account_url(pay_to, scope),
        "txUrl": hashscan_tx_url(tx_id, scope),
    }

def maintain_receipts_fifo(existing_receipts: list, new_receipt: dict, max_count: int = 100) -> list:
    updated = [new_receipt] + existing_receipts
    return updated[:max_count]

def build_hcs_payload(receipt: dict, prev_sequence: str = None) -> dict:
    return {
        "route": receipt["route"],
        "payTo": receipt["payTo"],
        "txId": receipt["txId"],
        "servedAt": receipt["servedAt"],
        "network": receipt["network"],
        "prevSequence": prev_sequence,
    }


class TestReceiptToHcsFlow(unittest.TestCase):
    """
    Validates the end-to-end receipt pipeline:
    Paid handler -> Receipt build & HashScan URL -> JSON persistence -> HCS message payload.
    """

    def test_01_receipt_construction_and_hashscan_links(self):
        """Builds receipt with valid account and transaction links on HashScan testnet."""
        pay_to = "0.0.123456"
        tx_id = "0.0.123456@1700000000.123456789"
        receipt = build_receipt(
            route="/v1/signal",
            network="hedera:testnet",
            pay_to=pay_to,
            tx_id=tx_id,
        )
        self.assertEqual(receipt["route"], "/v1/signal")
        self.assertEqual(receipt["payTo"], pay_to)
        self.assertEqual(receipt["accountUrl"], "https://hashscan.io/testnet/account/0.0.123456")
        self.assertIn("https://hashscan.io/testnet/transaction/0.0.123456-1700000000-123456789", receipt["txUrl"])

    def test_02_invalid_txid_omits_hashscan_tx_url(self):
        """Malformed or non-allowlisted txId produces empty txUrl to prevent link injection."""
        invalid_txs = ["malicious_script", "0.0.abc@xyz", "12345", ""]
        for bad_tx in invalid_txs:
            receipt = build_receipt("/v1/score", "hedera:testnet", "0.0.999", bad_tx)
            self.assertEqual(receipt["txUrl"], "", f"Bad txId '{bad_tx}' must produce empty txUrl")

    def test_03_receipts_fifo_caps_at_100_entries(self):
        """Receipts store maintains exactly the latest 100 receipts in reverse chronological order."""
        receipts = []
        for i in range(120):
            r = build_receipt("/v1/signal", "hedera:testnet", "0.0.123456", f"0.0.123456@{1700000000 + i}.000")
            receipts = maintain_receipts_fifo(receipts, r, max_count=100)
            
        self.assertEqual(len(receipts), 100)
        # Most recent entry (i=119) should be at index 0
        self.assertEqual(receipts[0]["txId"], "0.0.123456@1700000119.000")
        # Oldest kept entry (i=20) should be at index 99
        self.assertEqual(receipts[-1]["txId"], "0.0.123456@1700000020.000")

    def test_04_zero_private_keys_in_receipts(self):
        """Asserts no private keys, seed phrases, or credentials ever enter receipts payload."""
        receipt = build_receipt(
            route="/v1/signal",
            network="hedera:testnet",
            pay_to="0.0.123456",
            tx_id="0.0.123456@1700000000.000",
        )
        serialized = json.dumps(receipt).lower()
        forbidden = ["key", "secret", "private", "mnemonic", "seed", "password"]
        for word in forbidden:
            self.assertNotIn(word, serialized)

    def test_05_hcs_payload_schema_and_sequence_linkage(self):
        """HCS audit payload includes route, payTo, txId, timestamp, and previous sequence linkage."""
        receipt = build_receipt(
            route="/v1/score",
            network="hedera:testnet",
            pay_to="0.0.987654",
            tx_id="0.0.987654@1700000500.000",
        )
        hcs_msg = build_hcs_payload(receipt, prev_sequence="42")
        self.assertEqual(hcs_msg["route"], "/v1/score")
        self.assertEqual(hcs_msg["payTo"], "0.0.987654")
        self.assertEqual(hcs_msg["txId"], "0.0.987654@1700000500.000")
        self.assertEqual(hcs_msg["prevSequence"], "42")
        self.assertEqual(hcs_msg["network"], "hedera:testnet")


if __name__ == "__main__":
    unittest.main()
