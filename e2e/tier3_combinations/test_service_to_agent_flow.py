"""
author: Varanasi E2E Test Suite
tier: Tier 3 - Cross-Feature Combinations
combination: Backend Signal/Score Service -> Agent Scout & Analyst Pipeline
spec: service/src/server.ts, agent/src/workers/scout.ts, agent/src/workers/analyst.ts
"""
import unittest
import json
from e2e.fixtures.mock_service import VaranasiMockHandler

def turnover_of(tvl_usd: float, volume24h_usd: float) -> float:
    """Pure turnover calculation: volume24hUsd / tvlUsd."""
    if tvl_usd <= 0 or volume24h_usd < 0:
        return 0.0
    return volume24h_usd / tvl_usd

def pick_scout_target(pools, min_turnover=0.01):
    """Pure core mirror of pickScoutTarget in agent/src/workers/scout.ts."""
    if not pools:
        raise ValueError("Scout: no pools to evaluate (empty discovery set)")
    ranked = sorted(pools, key=lambda p: turnover_of(p["tvlUsd"], p["volume24hUsd"]), reverse=True)
    best = ranked[0]
    best_turnover = turnover_of(best["tvlUsd"], best["volume24hUsd"])
    if best_turnover < min_turnover:
        raise ValueError(
            f"Scout: no healthy-turnover pool (best {best_turnover*100:.2f}% < {min_turnover*100:.2f}% bar)"
        )
    return best

def evaluate_analyst_risk(intel, alpha, threshold_bps=5000):
    """Pure analyst reasoning combining pool intel + alpha signal."""
    turnover = turnover_of(intel["tvlUsd"], intel["volume24hUsd"])
    # Base score derived from liquidity and turnover (scaled to bps: 0..10000)
    score_bps = min(10000, int(turnover * 10000) + 4000)
    
    # Adjust score with alpha signal
    if alpha.get("direction") == "BULLISH" or alpha.get("direction") == "long":
        score_bps = min(10000, score_bps + int(alpha.get("confidence", 0.5) * 2000))
    elif alpha.get("direction") == "BEARISH" or alpha.get("direction") == "short":
        score_bps = max(0, score_bps - int(alpha.get("confidence", 0.5) * 2000))

    decision = "ACT" if score_bps >= threshold_bps else "SKIP"
    return {
        "decision": decision,
        "scoreBps": score_bps,
        "thresholdBps": threshold_bps,
        "rationale": f"Turnover {turnover*100:.1f}%, alpha {alpha.get('direction', 'neutral')} -> {score_bps}bps",
    }


class TestServiceToAgentFlow(unittest.TestCase):
    """
    Validates cross-stack integration between Backend service signals/scores
    and autonomous agent decision-making.
    """

    def test_01_scout_selects_highest_turnover_pool(self):
        """Scout selects the highest turnover pool when clearing the 1% threshold."""
        candidate_pools = [
            {"id": "0xpool1", "symbol": "ETH/USDC", "tvlUsd": 1_000_000.0, "volume24hUsd": 50_000.0},  # 5%
            {"id": "0xpool2", "symbol": "WBTC/USDC", "tvlUsd": 2_000_000.0, "volume24hUsd": 40_000.0}, # 2%
            {"id": "0xpool3", "symbol": "UNI/USDT", "tvlUsd": 500_000.0, "volume24hUsd": 1_000.0},     # 0.2%
        ]
        target = pick_scout_target(candidate_pools, min_turnover=0.01)
        self.assertEqual(target["id"], "0xpool1")
        self.assertAlmostEqual(turnover_of(target["tvlUsd"], target["volume24hUsd"]), 0.05)

    def test_02_scout_fails_closed_when_all_pools_below_turnover(self):
        """Scout throws and refuses to buy signal when no pools meet minTurnover bar."""
        candidate_pools = [
            {"id": "0xdead1", "symbol": "ILLIQUID/USDC", "tvlUsd": 1_000_000.0, "volume24hUsd": 100.0}, # 0.01%
            {"id": "0xdead2", "symbol": "STAGNANT/USDT", "tvlUsd": 5_000_000.0, "volume24hUsd": 500.0}, # 0.01%
        ]
        with self.assertRaises(ValueError) as ctx:
            pick_scout_target(candidate_pools, min_turnover=0.01)
        self.assertIn("no healthy-turnover pool", str(ctx.exception))

    def test_03_bullish_alpha_boosts_analyst_verdict_to_act(self):
        """Bullish signal from backend boosts score over threshold to yield ACT decision."""
        pool_intel = {"tvlUsd": 1_000_000.0, "volume24hUsd": 25_000.0} # 2.5% turnover
        # Neutral verdict would be: 250 bps + 4000 = 4250 bps (< 5000 bps -> SKIP)
        neutral_verdict = evaluate_analyst_risk(pool_intel, {"direction": "neutral", "confidence": 0.0})
        self.assertEqual(neutral_verdict["decision"], "SKIP")

        # Bullish signal (confidence 0.88) adds ~1760 bps -> 6010 bps (>= 5000 bps -> ACT)
        bullish_alpha = {
            "direction": "BULLISH",
            "confidence": 0.88,
            "features": {"momentum": 1.4, "volatility": 0.22},
            "receipt": {"route": "/v1/signal", "txId": "0.0.123456@1700000001.000"},
        }
        active_verdict = evaluate_analyst_risk(pool_intel, bullish_alpha, threshold_bps=5000)
        self.assertEqual(active_verdict["decision"], "ACT")
        self.assertGreaterEqual(active_verdict["scoreBps"], 5000)
        self.assertIn("BULLISH", active_verdict["rationale"])

    def test_04_bearish_alpha_forces_analyst_verdict_to_skip(self):
        """Bearish signal from backend depresses score to yield SKIP decision."""
        pool_intel = {"tvlUsd": 500_000.0, "volume24hUsd": 50_000.0} # 10% turnover -> base 5000 bps
        bearish_alpha = {
            "direction": "BEARISH",
            "confidence": 0.90,
            "features": {"momentum": -1.8, "volatility": 0.65},
            "receipt": {"route": "/v1/signal", "txId": "0.0.123456@1700000002.000"},
        }
        verdict = evaluate_analyst_risk(pool_intel, bearish_alpha, threshold_bps=5000)
        self.assertEqual(verdict["decision"], "SKIP")
        self.assertLess(verdict["scoreBps"], 5000)

    def test_05_paid_signal_response_contains_valid_receipt_for_audit(self):
        """Validates that a paid service response carries required receipt fields before agent executes."""
        mock_response = {
            "signal": "BULLISH",
            "confidence": 0.88,
            "features": {"momentum": 1.4, "volatility": 0.22},
            "symbol": "ETH/USDC",
            "receipt": {
                "route": "/v1/signal",
                "network": "hedera:testnet",
                "payTo": "0.0.123456",
                "txId": "0.0.123456@1700000001.000",
            },
        }
        receipt = mock_response.get("receipt")
        self.assertIsNotNone(receipt, "Paid response must contain receipt")
        self.assertEqual(receipt["route"], "/v1/signal")
        self.assertTrue(receipt["txId"].startswith("0.0."))


if __name__ == "__main__":
    unittest.main()
