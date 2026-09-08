"""Unit test for analyzer.p0_engine"""
import unittest
from analyzer.p0_engine import (
    calculate_ema,
    calculate_atr,
    calculate_rvol,
    detect_swing_points,
    analyze_market_structure,
    calculate_ema_engine,
    calculate_support_resistance,
    analyze_mtf_confluence,
    run_full_p0_analysis
)

class TestP0Engine(unittest.TestCase):
    def setUp(self):
        # Generate 50 synthetic upward trending candles
        self.candles = []
        base = 100.0
        for i in range(50):
            o = base + i * 0.5
            h = o + 0.8
            l = o - 0.3
            c = o + 0.4
            v = 1000.0 + (i * 20.0)
            self.candles.append({
                "time": 1700000000 + (i * 60),
                "open": o,
                "high": h,
                "low": l,
                "close": c,
                "volume": v
            })

    def test_atr(self):
        atr_res = calculate_atr(self.candles, 14)
        self.assertIn("atr", atr_res)
        self.assertIn("classification", atr_res)
        self.assertGreater(atr_res["atr"], 0)

    def test_rvol(self):
        rvol_res = calculate_rvol(self.candles, 20)
        self.assertIn("rvol", rvol_res)
        self.assertIn("is_spike", rvol_res)
        self.assertGreater(rvol_res["rvol"], 0)

    def test_ema_engine(self):
        ema_res = calculate_ema_engine(self.candles)
        self.assertIn("alignment", ema_res)
        self.assertTrue(ema_res["is_bullish_stack"])

    def test_market_structure(self):
        struct = analyze_market_structure(self.candles, n=2)
        self.assertIn("trend", struct)
        self.assertIn("structure_strength", struct)

    def test_mtf(self):
        tf_data = {
            "1h": self.candles,
            "15m": self.candles,
            "5m": self.candles,
            "1m": self.candles,
        }
        mtf = analyze_mtf_confluence(tf_data)
        self.assertIn("confluence_summary", mtf)
        self.assertEqual(mtf["bullish_count"], 4)

    def test_full_analysis(self):
        tf_data = {
            "1h": self.candles,
            "15m": self.candles,
            "5m": self.candles,
            "1m": self.candles,
        }
        res = run_full_p0_analysis("BTCUSDT", tf_data, "1m")
        self.assertEqual(res["symbol"], "BTCUSDT")
        self.assertIn("volatility", res)
        self.assertIn("mtf", res)
        self.assertIn("support_resistance", res)

if __name__ == "__main__":
    unittest.main()
