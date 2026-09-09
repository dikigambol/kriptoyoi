"""
KriptoYoi Scalping Analyzer - P0 Quantitative Analysis Engine
Module: analyzer.p0_engine

Implements:
1. Market Structure Engine (Fractal Swing H/L, HH/HL/LH/LL, BOS, CHoCH, Trend Direction & Strength)
2. Support & Resistance Engine (Dynamic Cluster Levels, Touches, Distance)
3. Volatility Engine (ATR 14, Low/Normal/High/Extreme Classification)
4. Volume Engine (RVOL 20-SMA, Volume Spike Detection)
5. Momentum Engine (EMA 9, 21, 50 Alignment & Momentum Slopes)
6. Multi-Timeframe (MTF) Confluence Engine (1H, 15M, 5M, 1M Matrix)
7. Friction Cost Engine (Tokocrypto Fee + PPh + PPN + Slippage, Net R:R Validation)
8. BTC Market Gatekeeper (Korelasi Makro – veto sinyal Long altcoin saat BTC dump)
9. Market Regime Engine (CHOP Index + ADX + EMA alignment → TRENDING/RANGING/BREAKOUT)
10. Liquidity Sweep Detection (Wick sweep + rejection close §4.2)
11. Setup Detection Engine (Breakout, Breakout Retest, Liquidity Sweep, Trend Pullback)
12. Signal Scoring Engine (Weighted 0–100 multi-factor score §14)
13. Signal TTL / Expiration (5-candle 1M, 6-candle 5M §4.4)
"""

from typing import List, Dict, Any, Optional, Tuple
import math


# ---------------------------------------------------------------------------
# Friction Cost Engine (Bagian 2 – Roadmap Addendum)
# Biaya transaksi Tokocrypto Spot + pajak kripto Indonesia (PMK 68/2022)
# ---------------------------------------------------------------------------

# Komponen biaya per sisi (buy atau sell), dalam desimal (bukan persen)
_FEE_RATE       = 0.0010   # Trading fee 0.10% (tanpa diskon BNB)
_PPH_RATE       = 0.0010   # PPh Final 0.10%
_PPN_RATE       = 0.0011   # PPN 0.11%
_SLIPPAGE_MID   = 0.00075  # Slippage estimasi tengah 0.075% per sisi

# Biaya per sisi = fee + PPh + PPN + slippage
_COST_ONE_SIDE  = _FEE_RATE + _PPH_RATE + _PPN_RATE + _SLIPPAGE_MID   # ≈ 0.3575%
# Round-trip (buka + tutup posisi)
_COST_ROUNDTRIP = _COST_ONE_SIDE * 2                                    # ≈ 0.715% → masuk range 0.35-0.45% tanpa slippage, ~0.715% dgn slippage

# Aturan filter Net R:R
_MIN_NET_RR     = 1.2   # Jika Net R:R < 1.2 → NO TRADE (FEE_UNVIABLE)
_MIN_TP_FRICTION_MULT = 2.5  # TP1 minimal ≥ 2.5× total friction round-trip


def calculate_friction_cost(entry_price: float, use_bnb_discount: bool = False) -> Dict[str, Any]:
    """
    Hitung biaya transaksi round-trip Tokocrypto Spot (PMK 68/2022).

    Komponen per sisi:
    - Trading Fee : 0.10% (atau 0.075% dengan diskon BNB)
    - PPh Final   : 0.10%
    - PPN         : 0.11%
    - Slippage    : ~0.075% (estimasi tengah untuk koin likuiditas menengah)

    Args:
        entry_price: Harga entry posisi (dalam quote currency)
        use_bnb_discount: True jika menggunakan diskon BNB (fee jadi 0.075%)

    Returns:
        Dict berisi biaya absolut dan persentase untuk setiap komponen.
    """
    fee_rate = 0.00075 if use_bnb_discount else _FEE_RATE

    # Biaya per sisi dalam persen (desimal)
    cost_one_side = fee_rate + _PPH_RATE + _PPN_RATE + _SLIPPAGE_MID
    cost_roundtrip = cost_one_side * 2

    # Nilai absolut berdasarkan entry price
    friction_abs = entry_price * cost_roundtrip
    friction_one_abs = entry_price * cost_one_side

    return {
        "fee_rate_pct": round(fee_rate * 100, 3),
        "pph_pct": round(_PPH_RATE * 100, 3),
        "ppn_pct": round(_PPN_RATE * 100, 3),
        "slippage_pct": round(_SLIPPAGE_MID * 100, 3),
        "cost_one_side_pct": round(cost_one_side * 100, 4),
        "cost_roundtrip_pct": round(cost_roundtrip * 100, 4),
        "friction_abs": round(friction_abs, 8),
        "friction_one_abs": round(friction_one_abs, 8),
        "use_bnb_discount": use_bnb_discount,
    }


def calculate_net_rr(
    entry_price: float,
    tp_price: float,
    sl_price: float,
    use_bnb_discount: bool = False
) -> Dict[str, Any]:
    """
    Hitung Net Risk-to-Reward (Net R:R) setelah dikurangi friction cost.

    Formula (Roadmap Addendum §2.2):
        Net Profit Target = (TP Price - Entry Price) - Total Friction (abs)
        Net Stop Loss     = (Entry Price - SL Price) + Total Friction (abs)
        Net R:R           = Net Profit Target / Net Stop Loss

    Filter:
        - Net R:R < 1.2             → NO TRADE (FEE_UNVIABLE)
        - TP distance < 2.5× friction → NO TRADE (FEE_UNVIABLE)

    Args:
        entry_price: Harga entry
        tp_price: Target harga take profit
        sl_price: Harga stop loss
        use_bnb_discount: Gunakan diskon BNB untuk fee

    Returns:
        Dict berisi semua nilai net R:R dan status viabilitas.
    """
    friction = calculate_friction_cost(entry_price, use_bnb_discount)
    friction_abs = friction["friction_abs"]
    friction_rt_pct = friction["cost_roundtrip_pct"]

    gross_profit = tp_price - entry_price
    gross_loss = entry_price - sl_price

    net_profit = gross_profit - friction_abs
    net_loss = gross_loss + friction_abs

    # Jaga dari division-by-zero
    net_rr = round(net_profit / net_loss, 3) if net_loss > 0 else 0.0

    # TP distance sebagai kelipatan friction round-trip
    tp_dist_pct = (gross_profit / entry_price) * 100.0 if entry_price > 0 else 0.0
    tp_friction_mult = tp_dist_pct / friction_rt_pct if friction_rt_pct > 0 else 0.0

    # Viabilitas setup — toleransi kecil untuk floating point
    is_tp_dist_ok = tp_friction_mult >= (_MIN_TP_FRICTION_MULT - 0.01)
    is_fee_viable = (net_rr >= _MIN_NET_RR) and is_tp_dist_ok

    if net_profit <= 0:
        viability_status = "NO_TRADE_NEGATIVE_NET_PROFIT"
        viability_label = "NO TRADE – TP Tertutup Fee"
    elif not is_fee_viable:
        if not is_tp_dist_ok:
            viability_status = "NO_TRADE_TP_TOO_CLOSE"
            viability_label = f"NO TRADE – TP Terlalu Dekat ({tp_friction_mult:.1f}× friction, min {_MIN_TP_FRICTION_MULT}×)"
        else:
            viability_status = "NO_TRADE_FEE_UNVIABLE"
            viability_label = f"FEE UNVIABLE – Net R:R {net_rr:.2f} (min {_MIN_NET_RR})"
    elif net_rr >= 2.0:
        viability_status = "VIABLE_STRONG"
        viability_label = f"VIABLE – Net R:R {net_rr:.2f} (Kuat)"
    else:
        viability_status = "VIABLE"
        viability_label = f"VIABLE – Net R:R {net_rr:.2f}"

    return {
        "entry": round(entry_price, 8),
        "tp": round(tp_price, 8),
        "sl": round(sl_price, 8),
        "gross_profit": round(gross_profit, 8),
        "gross_loss": round(gross_loss, 8),
        "gross_rr": round(gross_profit / gross_loss, 3) if gross_loss > 0 else 0.0,
        "friction_abs": friction_abs,
        "friction_rt_pct": friction_rt_pct,
        "net_profit": round(net_profit, 8),
        "net_loss": round(net_loss, 8),
        "net_rr": net_rr,
        "tp_dist_pct": round(tp_dist_pct, 4),
        "tp_friction_mult": round(tp_friction_mult, 2),
        "min_tp_friction_mult": _MIN_TP_FRICTION_MULT,
        "min_net_rr": _MIN_NET_RR,
        "is_fee_viable": is_fee_viable,
        "viability_status": viability_status,
        "viability_label": viability_label,
        "friction_detail": friction,
    }


def calculate_ema(series: List[float], period: int) -> List[Optional[float]]:
    """Calculate Exponential Moving Average (EMA) for a series."""
    if len(series) < period:
        return [None] * len(series)

    k = 2.0 / (period + 1.0)
    ema_list: List[Optional[float]] = [None] * len(series)

    # Initial SMA
    sma = sum(series[:period]) / period
    ema_list[period - 1] = sma

    for i in range(period, len(series)):
        prev_ema = ema_list[i - 1]
        if prev_ema is not None:
            ema_list[i] = (series[i] * k) + (prev_ema * (1.0 - k))

    return ema_list


def calculate_atr(candles: List[Dict[str, Any]], period: int = 14) -> Dict[str, Any]:
    """
    Calculate Average True Range (ATR-14) and classify volatility.
    Candles structure: [{open, high, low, close, volume, time}, ...]
    """
    if len(candles) < period + 1:
        return {
            "atr": 0.0,
            "atr_pct": 0.0,
            "classification": "NORMAL",
            "description": "Insufficient data"
        }

    tr_list: List[float] = []
    for i in range(1, len(candles)):
        h = float(candles[i]["high"])
        l = float(candles[i]["low"])
        prev_c = float(candles[i - 1]["close"])
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        tr_list.append(tr)

    # Simple RMA/SMA for ATR
    atr_values: List[float] = []
    first_atr = sum(tr_list[:period]) / period
    atr_values.append(first_atr)

    for i in range(period, len(tr_list)):
        current_atr = ((atr_values[-1] * (period - 1)) + tr_list[i]) / period
        atr_values.append(current_atr)

    latest_atr = atr_values[-1]
    current_price = float(candles[-1]["close"])
    atr_pct = (latest_atr / current_price * 100.0) if current_price > 0 else 0.0

    # ATR historical percentile baseline for classification
    pct_baseline = [
        (v / float(candles[i + period]["close"]) * 100.0)
        for i, v in enumerate(atr_values)
        if float(candles[i + period]["close"]) > 0
    ]
    mean_pct = sum(pct_baseline) / len(pct_baseline) if pct_baseline else atr_pct

    ratio = atr_pct / mean_pct if mean_pct > 0 else 1.0
    if ratio < 0.70:
        classification = "LOW"
    elif ratio <= 1.35:
        classification = "NORMAL"
    elif ratio <= 2.20:
        classification = "HIGH"
    else:
        classification = "EXTREME"

    return {
        "atr": round(latest_atr, 6),
        "atr_pct": round(atr_pct, 3),
        "mean_atr_pct": round(mean_pct, 3),
        "ratio": round(ratio, 2),
        "classification": classification
    }


def calculate_rvol(candles: List[Dict[str, Any]], period: int = 20) -> Dict[str, Any]:
    """
    Calculate Relative Volume (RVOL) against 20-period volume SMA.
    """
    if len(candles) < period + 1:
        return {
            "rvol": 1.0,
            "is_spike": False,
            "classification": "NORMAL",
            "current_vol": 0.0,
            "avg_vol": 0.0
        }

    volumes = [float(c.get("volume", 0)) for c in candles]
    current_vol = volumes[-1]
    prev_20_vols = volumes[-period - 1:-1]
    avg_vol = sum(prev_20_vols) / len(prev_20_vols) if prev_20_vols else current_vol

    rvol = (current_vol / avg_vol) if avg_vol > 0 else 1.0
    rvol_val = round(rvol, 2)

    is_spike = rvol_val >= 2.0
    if rvol_val < 0.8:
        classification = "LOW"
    elif rvol_val <= 1.5:
        classification = "NORMAL"
    elif rvol_val <= 2.5:
        classification = "HIGH"
    else:
        classification = "CLIMACTIC_SPIKE"

    return {
        "rvol": rvol_val,
        "is_spike": is_spike,
        "classification": classification,
        "current_vol": round(current_vol, 4),
        "avg_vol": round(avg_vol, 4)
    }


def detect_swing_points(candles: List[Dict[str, Any]], n: int = 2) -> Dict[str, List[Dict[str, Any]]]:
    """
    Detect fractal Swing Highs and Swing Lows using symmetric N-bar lookahead/lookback.
    Returns list of swing points with index, time, price, and type.
    """
    swing_highs: List[Dict[str, Any]] = []
    swing_lows: List[Dict[str, Any]] = []

    total = len(candles)
    if total < (2 * n + 1):
        return {"highs": [], "lows": []}

    for i in range(n, total - n):
        curr_h = float(candles[i]["high"])
        curr_l = float(candles[i]["low"])
        time_sec = candles[i].get("time", 0)

        # Check Swing High
        is_high = True
        for k in range(1, n + 1):
            if float(candles[i - k]["high"]) >= curr_h or float(candles[i + k]["high"]) > curr_h:
                is_high = False
                break
        if is_high:
            swing_highs.append({
                "index": i,
                "time": time_sec,
                "price": curr_h,
                "type": "SWING_HIGH"
            })

        # Check Swing Low
        is_low = True
        for k in range(1, n + 1):
            if float(candles[i - k]["low"]) <= curr_l or float(candles[i + k]["low"]) < curr_l:
                is_low = False
                break
        if is_low:
            swing_lows.append({
                "index": i,
                "time": time_sec,
                "price": curr_l,
                "type": "SWING_LOW"
            })

    return {"highs": swing_highs, "lows": swing_lows}


def analyze_market_structure(candles: List[Dict[str, Any]], n: int = 2) -> Dict[str, Any]:
    """
    Analyze Price Action Market Structure:
    - Sequence of Swing Highs (HH vs LH) and Swing Lows (HL vs LL)
    - Break of Structure (BOS)
    - Change of Character (CHoCH)
    - Current Structure Trend (BULLISH, BEARISH, RANGE)
    """
    if len(candles) < 20:
        return {
            "trend": "NEUTRAL",
            "structure_strength": 50,
            "last_bos": None,
            "last_choch": None,
            "swing_highs": [],
            "swing_lows": [],
            "current_swing": None
        }

    swings = detect_swing_points(candles, n=n)
    highs = swings["highs"]
    lows = swings["lows"]

    # Combine into chronological sequence
    all_swings = sorted(highs + lows, key=lambda s: s["index"])

    if len(highs) < 2 or len(lows) < 2:
        return {
            "trend": "RANGE",
            "structure_strength": 50,
            "last_bos": None,
            "last_choch": None,
            "swing_highs": highs[-3:],
            "swing_lows": lows[-3:],
            "current_swing": None
        }

    # Evaluate HH / HL / LH / LL tags
    tagged_highs = []
    for idx, h in enumerate(highs):
        tag = "H"
        if idx > 0:
            tag = "HH" if h["price"] > highs[idx - 1]["price"] else "LH"
        tagged_highs.append({**h, "tag": tag})

    tagged_lows = []
    for idx, l in enumerate(lows):
        tag = "L"
        if idx > 0:
            tag = "HL" if l["price"] > lows[idx - 1]["price"] else "LL"
        tagged_lows.append({**l, "tag": tag})

    # Detect BOS and CHoCH on the most recent candles
    last_h = tagged_highs[-1]
    prev_h = tagged_highs[-2]
    last_l = tagged_lows[-1]
    prev_l = tagged_lows[-2]

    current_price = float(candles[-1]["close"])
    current_high = float(candles[-1]["high"])
    current_low = float(candles[-1]["low"])

    last_bos = None
    last_choch = None

    # Determine trend based on latest 2 highs and 2 lows
    is_bullish_struct = (last_h["tag"] == "HH" and last_l["tag"] == "HL")
    is_bearish_struct = (last_h["tag"] == "LH" and last_l["tag"] == "LL")

    # Check for Break of Structure (BOS) in the recent 10 candles
    recent_candles = candles[-10:]
    for c in reversed(recent_candles):
        c_close = float(c["close"])
        c_time = c.get("time", 0)

        # Bullish BOS: candle closed above previous swing high
        if c_close > last_h["price"]:
            last_bos = {
                "type": "BULLISH_BOS",
                "broken_level": last_h["price"],
                "time": c_time,
                "label": "Bullish BOS (Break of High)"
            }
            break
        # Bearish BOS: candle closed below previous swing low
        elif c_close < last_l["price"]:
            last_bos = {
                "type": "BEARISH_BOS",
                "broken_level": last_l["price"],
                "time": c_time,
                "label": "Bearish BOS (Break of Low)"
            }
            break

    # Check for Change of Character (CHoCH)
    # E.g., in a previously bearish trend (LH/LL), price breaks ABOVE the last lower high
    if last_h["tag"] == "LH" and current_price > last_h["price"]:
        last_choch = {
            "type": "BULLISH_CHOCH",
            "reversal_level": last_h["price"],
            "label": "Bullish CHoCH (Trend Reversal Up)"
        }
    elif last_l["tag"] == "HL" and current_price < last_l["price"]:
        last_choch = {
            "type": "BEARISH_CHOCH",
            "reversal_level": last_l["price"],
            "label": "Bearish CHoCH (Trend Reversal Down)"
        }

    # Final structure trend determination
    if is_bullish_struct or (last_choch and last_choch["type"] == "BULLISH_CHOCH"):
        trend = "BULLISH"
        strength = 80 if last_bos and last_bos["type"] == "BULLISH_BOS" else 65
    elif is_bearish_struct or (last_choch and last_choch["type"] == "BEARISH_CHOCH"):
        trend = "BEARISH"
        strength = 80 if last_bos and last_bos["type"] == "BEARISH_BOS" else 65
    else:
        trend = "RANGE"
        strength = 45

    return {
        "trend": trend,
        "structure_strength": strength,
        "last_bos": last_bos,
        "last_choch": last_choch,
        "recent_high": last_h,
        "recent_low": last_l,
        "tagged_highs": tagged_highs[-3:],
        "tagged_lows": tagged_lows[-3:]
    }


def calculate_ema_engine(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate EMA 9, 21, and 50.
    Evaluate alignment (Bullish Stack, Bearish Stack, Neutral) and slope.
    """
    closes = [float(c["close"]) for c in candles]
    ema9_series = calculate_ema(closes, 9)
    ema21_series = calculate_ema(closes, 21)
    ema50_series = calculate_ema(closes, 50)

    e9 = ema9_series[-1]
    e21 = ema21_series[-1]
    e50 = ema50_series[-1]

    if e9 is None or e21 is None or e50 is None:
        return {
            "ema9": e9,
            "ema21": e21,
            "ema50": e50,
            "alignment": "INSUFFICIENT_DATA",
            "is_bullish_stack": False,
            "is_bearish_stack": False,
            "slope_pct": 0.0
        }

    # Alignment evaluation
    is_bullish_stack = (e9 > e21 > e50)
    is_bearish_stack = (e9 < e21 < e50)

    if is_bullish_stack:
        alignment = "BULLISH_ALIGNED"
    elif is_bearish_stack:
        alignment = "BEARISH_ALIGNED"
    elif e9 > e21:
        alignment = "SHORT_TERM_BULLISH"
    elif e9 < e21:
        alignment = "SHORT_TERM_BEARISH"
    else:
        alignment = "FLAT"

    # Slope of EMA 9 over last 3 candles
    slope_pct = 0.0
    if len(ema9_series) >= 4 and ema9_series[-4] is not None:
        prev_e9 = ema9_series[-4]
        if prev_e9 > 0:
            slope_pct = round(((e9 - prev_e9) / prev_e9) * 100.0, 3)

    return {
        "ema9": round(e9, 6),
        "ema21": round(e21, 6),
        "ema50": round(e50, 6),
        "alignment": alignment,
        "is_bullish_stack": is_bullish_stack,
        "is_bearish_stack": is_bearish_stack,
        "slope_pct": slope_pct
    }


def calculate_support_resistance(
    candles: List[Dict[str, Any]],
    current_price: float,
    atr: float
) -> Dict[str, Any]:
    """
    Cluster swing highs and lows into dynamic Support and Resistance levels.
    Calculate distance (%) and number of touches.
    """
    swings = detect_swing_points(candles, n=2)
    highs = [h["price"] for h in swings["highs"]]
    lows = [l["price"] for l in swings["lows"]]

    # Cluster tolerance (0.35 * ATR)
    tolerance = max(atr * 0.35, current_price * 0.001)

    # Support levels: below current price
    sup_candidates = [p for p in lows if p < current_price]
    # Resistance levels: above current price
    res_candidates = [p for p in highs if p > current_price]

    def cluster_points(points: List[float], reverse: bool = False) -> List[Dict[str, Any]]:
        sorted_pts = sorted(points, reverse=reverse)
        clusters: List[Dict[str, Any]] = []

        for p in sorted_pts:
            matched = False
            for cl in clusters:
                if abs(cl["price"] - p) <= tolerance:
                    cl["touches"] += 1
                    # Recalculate average price in cluster
                    cl["price"] = (cl["price"] + p) / 2.0
                    matched = True
                    break
            if not matched:
                clusters.append({"price": p, "touches": 1})

        # Calculate distance and format
        for cl in clusters:
            dist_pct = abs((cl["price"] - current_price) / current_price * 100.0)
            cl["dist_pct"] = round(dist_pct, 2)
            cl["price"] = round(cl["price"], 6)

        return clusters

    supports = cluster_points(sup_candidates, reverse=True)
    resistances = cluster_points(res_candidates, reverse=False)

    # Nearest S/R
    nearest_support = supports[0] if supports else {
        "price": round(current_price - (1.5 * atr), 6),
        "touches": 1,
        "dist_pct": round((1.5 * atr / current_price) * 100.0, 2)
    }
    nearest_resistance = resistances[0] if resistances else {
        "price": round(current_price + (1.5 * atr), 6),
        "touches": 1,
        "dist_pct": round((1.5 * atr / current_price) * 100.0, 2)
    }

    return {
        "nearest_support": nearest_support,
        "nearest_resistance": nearest_resistance,
        "key_supports": supports[:3],
        "key_resistances": resistances[:3]
    }


def analyze_mtf_confluence(
    tf_data: Dict[str, List[Dict[str, Any]]]
) -> Dict[str, Any]:
    """
    Evaluate Multi-Timeframe (MTF) Confluence across:
    - 1H (Macro trend)
    - 15M (Primary structure)
    - 5M (Scalping structure)
    - 1M (Entry structure)

    Returns status per timeframe and aggregate MTF score (e.g., 4/4 BULLISH, WAIT, etc.).
    """
    tf_order = ["1h", "15m", "5m", "1m"]
    tf_results: Dict[str, Any] = {}
    bullish_count = 0
    bearish_count = 0

    for tf in tf_order:
        candles = tf_data.get(tf, [])
        if not candles or len(candles) < 20:
            tf_results[tf] = {
                "trend": "UNKNOWN",
                "bias": "NEUTRAL",
                "ema_align": "UNKNOWN"
            }
            continue

        struct = analyze_market_structure(candles, n=2 if tf in ["1m", "5m"] else 3)
        ema_info = calculate_ema_engine(candles)

        # Composite bias for timeframe
        if struct["trend"] == "BULLISH" or ema_info["is_bullish_stack"]:
            bias = "BULLISH"
            bullish_count += 1
        elif struct["trend"] == "BEARISH" or ema_info["is_bearish_stack"]:
            bias = "BEARISH"
            bearish_count += 1
        else:
            bias = "RANGE"

        tf_results[tf] = {
            "bias": bias,
            "structure_trend": struct["trend"],
            "ema_alignment": ema_info["alignment"],
            "last_bos": struct["last_bos"]["type"] if struct["last_bos"] else None
        }

    # Determine aggregate confluence
    if bullish_count >= 3:
        if tf_results.get("1m", {}).get("bias") == "BEARISH":
            confluence_summary = f"{bullish_count}/4 BULLISH (1M PULLBACK DIP)"
            actionable_bias = "LONG_ON_PULLBACK"
        else:
            confluence_summary = f"{bullish_count}/4 STRONG BULLISH"
            actionable_bias = "LONG_STRONG"
    elif bearish_count >= 3:
        if tf_results.get("1m", {}).get("bias") == "BULLISH":
            confluence_summary = f"{bearish_count}/4 BEARISH (1M BOUNCE EXHAUSTION)"
            actionable_bias = "SHORT_OR_EXIT_ON_PUMP"
        else:
            confluence_summary = f"{bearish_count}/4 STRONG BEARISH"
            actionable_bias = "SHORT_OR_EXIT"
    else:
        confluence_summary = f"MIXED ({bullish_count} Bull / {bearish_count} Bear)"
        actionable_bias = "WAIT_CHOPPY"

    return {
        "timeframes": tf_results,
        "bullish_count": bullish_count,
        "bearish_count": bearish_count,
        "score_ratio": f"{max(bullish_count, bearish_count)}/4",
        "confluence_summary": confluence_summary,
        "actionable_bias": actionable_bias
    }




# ---------------------------------------------------------------------------
# BTC Market Gatekeeper (Bagian 5 – Roadmap Addendum)
# Mencegah sinyal Long altcoin palsu saat Bitcoin mengalami flash dump.
# ---------------------------------------------------------------------------

# Threshold veto kondisi BTC Dump Risk
_BTC_EMA_PERIOD     = 20       # EMA 20 untuk BTC 5M
_BTC_RETURN_VETO    = -0.006   # 5M Return < -0.6%  → dump risk
_BTC_ATR_RATIO_VETO = 2.5      # ATR Ratio > 2.5 dengan arah bearish impulsif


def analyze_btc_pulse(
    btc_5m_candles: List[Dict[str, Any]],
    btc_1m_candles: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Evaluasi kondisi makro Bitcoin untuk menentukan apakah aman membuka Long altcoin.

    Kondisi BTC Dump Risk (Veto) terpenuhi bila SALAH SATU dari:
    1. BTC 5M Close < BTC EMA 20  DAN  BTC 5M Return < -0.6% dalam 1-2 candle terakhir
    2. BTC ATR Ratio > 2.5 dengan arah bearish impulsif (close < open secara konsisten)

    Args:
        btc_5m_candles: Klines BTCUSDT interval 5M (minimal 30 bar)
        btc_1m_candles: Klines BTCUSDT interval 1M (opsional, untuk konfirmasi intrabar)

    Returns:
        Dict berisi status dump risk, alasan, dan metrik BTC terkini.
    """
    if not btc_5m_candles or len(btc_5m_candles) < 22:
        return {
            "dump_risk": False,
            "veto_active": False,
            "status": "INSUFFICIENT_DATA",
            "status_label": "⏳ Data BTC tidak cukup",
            "btc_price": 0.0,
            "btc_return_5m": 0.0,
            "btc_ema20": None,
            "btc_atr_ratio": 0.0,
            "reasons": [],
        }

    # --- Hitung EMA 20 dari close 5M ---
    closes_5m = [float(c["close"]) for c in btc_5m_candles]
    ema20_series = calculate_ema(closes_5m, _BTC_EMA_PERIOD)

    btc_close = closes_5m[-1]
    btc_ema20 = ema20_series[-1]

    # --- Hitung return 5M untuk 2 candle terakhir ---
    # Return candle ke-1 (paling baru)
    prev_close_1 = closes_5m[-2] if len(closes_5m) >= 2 else btc_close
    btc_return_c1 = (btc_close - prev_close_1) / prev_close_1 if prev_close_1 > 0 else 0.0

    # Return candle ke-2
    prev_close_2 = closes_5m[-3] if len(closes_5m) >= 3 else prev_close_1
    btc_return_c2 = (prev_close_1 - prev_close_2) / prev_close_2 if prev_close_2 > 0 else 0.0

    # Pakai return lebih negatif (worst of last 2 candles)
    btc_return_5m = min(btc_return_c1, btc_return_c2)

    # --- Hitung ATR 5M dan rasionya ---
    atr_result = calculate_atr(btc_5m_candles, period=14)
    btc_atr_ratio = atr_result.get("ratio", 1.0)

    # Arah bearish impulsif: 2 dari 3 candle terakhir close < open
    recent_3 = btc_5m_candles[-3:]
    bearish_bars = sum(1 for c in recent_3 if float(c["close"]) < float(c["open"]))
    is_bearish_impulsive = bearish_bars >= 2

    # --- Konfirmasi 1M jika tersedia ---
    btc_1m_below_ema = False
    btc_1m_return = 0.0
    if btc_1m_candles and len(btc_1m_candles) >= 22:
        closes_1m = [float(c["close"]) for c in btc_1m_candles]
        ema20_1m = calculate_ema(closes_1m, _BTC_EMA_PERIOD)
        btc_1m_close = closes_1m[-1]
        btc_1m_ema20 = ema20_1m[-1]
        prev_1m = closes_1m[-2] if len(closes_1m) >= 2 else btc_1m_close
        btc_1m_return = (btc_1m_close - prev_1m) / prev_1m if prev_1m > 0 else 0.0
        btc_1m_below_ema = (btc_1m_ema20 is not None) and (btc_1m_close < btc_1m_ema20)

    # --- Evaluasi kondisi veto ---
    reasons: List[str] = []
    veto_active = False

    # Kondisi 1: 5M Close < EMA20 + Return < -0.6%
    cond1_ema = (btc_ema20 is not None) and (btc_close < btc_ema20)
    cond1_return = btc_return_5m < _BTC_RETURN_VETO
    if cond1_ema and cond1_return:
        veto_active = True
        reasons.append(
            f"BTC 5M Close ({btc_close:,.2f}) < EMA20 ({btc_ema20:,.2f}) "
            f"dan return {btc_return_5m*100:.2f}% < {_BTC_RETURN_VETO*100:.1f}%"
        )

    # Kondisi 2: ATR Ratio > 2.5 + bearish impulsif
    if btc_atr_ratio > _BTC_ATR_RATIO_VETO and is_bearish_impulsive:
        veto_active = True
        reasons.append(
            f"BTC ATR Ratio {btc_atr_ratio:.2f}x (> {_BTC_ATR_RATIO_VETO}x) "
            f"dengan {bearish_bars}/3 candle bearish impulsif"
        )

    # Kondisi 3 (konfirmasi tambahan dari 1M): jika veto sudah aktif dan 1M juga di bawah EMA
    if veto_active and btc_1m_below_ema and btc_1m_return < -0.003:
        reasons.append(
            f"Konfirmasi 1M: close di bawah EMA20, return {btc_1m_return*100:.2f}%"
        )

    # Tetapkan status label
    if veto_active:
        status = "DUMP_RISK"
        status_label = "BTC DUMP RISK – Long Altcoin di-VETO"
    elif cond1_ema and not cond1_return:
        # Di bawah EMA tapi belum speed yang cukup → warning ringan
        status = "CAUTION"
        status_label = "BTC di Bawah EMA20 – Waspadai"
    elif btc_return_5m < -0.003:
        # Koreksi sedang tapi belum trigger veto
        status = "CAUTION"
        status_label = f"BTC Koreksi ({btc_return_5m*100:.2f}%) – Hati-hati"
    else:
        status = "SAFE"
        status_label = "BTC Stabil – Long Altcoin Diizinkan"

    return {
        "dump_risk": veto_active,
        "veto_active": veto_active,
        "status": status,
        "status_label": status_label,
        "btc_price": round(btc_close, 2),
        "btc_return_5m": round(btc_return_5m * 100, 3),   # dalam persen
        "btc_ema20": round(btc_ema20, 2) if btc_ema20 else None,
        "btc_atr_ratio": round(btc_atr_ratio, 2),
        "btc_above_ema20": not cond1_ema,
        "is_bearish_impulsive": is_bearish_impulsive,
        "reasons": reasons,
        "btc_1m_return": round(btc_1m_return * 100, 3),
    }


# ---------------------------------------------------------------------------
# 9. Market Regime Engine (Spec §9)
# Kombinasi CHOP Index + ADX + EMA alignment → klasifikasi market regime
# ---------------------------------------------------------------------------

def calculate_chop_index(candles: List[Dict[str, Any]], period: int = 14) -> float:
    """
    Choppiness Index: 100 × log10(ATR_sum(N) / (HighestHigh − LowestLow)) / log10(N)

    Interpretasi:
      CHOP > 61.8  → Market CHOPPY / ranging
      CHOP < 38.2  → Market TRENDING
      38.2–61.8    → Transisi / tidak jelas
    """
    if len(candles) < period + 1:
        return 50.0  # nilai netral

    window = candles[-period:]

    # Sum of ATR (True Range) untuk setiap bar dalam window
    tr_sum = 0.0
    for i in range(1, len(window)):
        h = float(window[i]["high"])
        l = float(window[i]["low"])
        pc = float(window[i - 1]["close"])
        tr_sum += max(h - l, abs(h - pc), abs(l - pc))

    # Highest High dan Lowest Low dalam window
    highest = max(float(c["high"]) for c in window)
    lowest  = min(float(c["low"])  for c in window)
    hl_range = highest - lowest

    if hl_range <= 0 or tr_sum <= 0:
        return 50.0

    chop = 100.0 * math.log10(tr_sum / hl_range) / math.log10(period)
    return round(min(max(chop, 0.0), 100.0), 2)


def calculate_adx(candles: List[Dict[str, Any]], period: int = 14) -> Dict[str, Any]:
    """
    Average Directional Index (ADX) dengan +DI dan -DI (Wilder's method).

    Interpretasi ADX:
      ADX < 20    → No trend (RANGING)
      20–25       → Weak trend
      25–40       → Strong trend
      > 40        → Very strong / potentially overextended
    """
    if len(candles) < period * 2 + 1:
        return {"adx": 20.0, "plus_di": 0.0, "minus_di": 0.0, "trend_strength": "WEAK"}

    tr_list: List[float]   = []
    plus_dm_list: List[float]  = []
    minus_dm_list: List[float] = []

    for i in range(1, len(candles)):
        h  = float(candles[i]["high"])
        l  = float(candles[i]["low"])
        ph = float(candles[i - 1]["high"])
        pl = float(candles[i - 1]["low"])
        pc = float(candles[i - 1]["close"])

        tr = max(h - l, abs(h - pc), abs(l - pc))
        tr_list.append(tr)

        up_move   = h - ph
        down_move = pl - l
        plus_dm  = up_move   if (up_move   > down_move and up_move   > 0) else 0.0
        minus_dm = down_move if (down_move > up_move   and down_move > 0) else 0.0
        plus_dm_list.append(plus_dm)
        minus_dm_list.append(minus_dm)

    def wilder_smooth(data: List[float], p: int) -> List[float]:
        result = [sum(data[:p])]
        for i in range(p, len(data)):
            result.append(result[-1] - result[-1] / p + data[i])
        return result

    smooth_tr  = wilder_smooth(tr_list, period)
    smooth_pdm = wilder_smooth(plus_dm_list, period)
    smooth_mdm = wilder_smooth(minus_dm_list, period)

    dx_list: List[float] = []
    plus_di_list: List[float]  = []
    minus_di_list: List[float] = []

    for i in range(len(smooth_tr)):
        if smooth_tr[i] == 0:
            continue
        pdi = 100.0 * smooth_pdm[i] / smooth_tr[i]
        mdi = 100.0 * smooth_mdm[i] / smooth_tr[i]
        plus_di_list.append(pdi)
        minus_di_list.append(mdi)
        dsum = pdi + mdi
        dx = 100.0 * abs(pdi - mdi) / dsum if dsum > 0 else 0.0
        dx_list.append(dx)

    if len(dx_list) < period:
        return {"adx": 20.0, "plus_di": 0.0, "minus_di": 0.0, "trend_strength": "WEAK"}

    # ADX = Wilder smoothing of DX
    adx_val = sum(dx_list[-period:]) / period
    plus_di  = plus_di_list[-1]  if plus_di_list  else 0.0
    minus_di = minus_di_list[-1] if minus_di_list else 0.0

    if adx_val >= 40:
        trend_strength = "VERY_STRONG"
    elif adx_val >= 25:
        trend_strength = "STRONG"
    elif adx_val >= 20:
        trend_strength = "MODERATE"
    else:
        trend_strength = "WEAK"

    return {
        "adx":            round(adx_val, 2),
        "plus_di":        round(plus_di, 2),
        "minus_di":       round(minus_di, 2),
        "trend_strength": trend_strength,
    }


def analyze_market_regime(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Tentukan Market Regime menggunakan CHOP Index + ADX + EMA alignment.

    Regimes:
      TRENDING_UP   – trending naik (ADX kuat, CHOP rendah, EMA bullish)
      TRENDING_DOWN – trending turun
      RANGING       – sideways / choppy (CHOP tinggi, ADX lemah)
      BREAKOUT      – baru keluar dari range (CHOP turun tiba-tiba + volume spike)
      HIGH_VOL      – volatilitas ekstrem
      LOW_VOL       – sangat sepi
    """
    if len(candles) < 30:
        return {
            "regime": "RANGING",
            "regime_label": "Insufficient Data",
            "chop": 50.0,
            "adx": 20.0,
            "plus_di": 0.0,
            "minus_di": 0.0,
            "trend_direction": "NEUTRAL",
            "scalp_filter": "WAIT",
        }

    chop = calculate_chop_index(candles, period=14)
    adx_data = calculate_adx(candles, period=14)
    adx  = adx_data["adx"]
    pdi  = adx_data["plus_di"]
    mdi  = adx_data["minus_di"]

    ema_data = calculate_ema_engine(candles)
    atr_data = calculate_atr(candles, period=14)
    atr_class = atr_data.get("classification", "NORMAL")

    # Arah trend berdasarkan +DI vs -DI dan EMA alignment
    if pdi > mdi and ema_data.get("is_bullish_stack"):
        trend_direction = "UP"
    elif mdi > pdi and ema_data.get("is_bearish_stack"):
        trend_direction = "DOWN"
    elif pdi > mdi:
        trend_direction = "UP"
    elif mdi > pdi:
        trend_direction = "DOWN"
    else:
        trend_direction = "NEUTRAL"

    # Klasifikasi regime
    is_trending = adx >= 25 and chop < 55
    is_choppy   = chop >= 61.8 or adx < 20

    if atr_class == "EXTREME":
        regime = "HIGH_VOL"
        regime_label = "High Volatility"
        scalp_filter  = "CAUTION"
    elif atr_class == "LOW" and chop > 55:
        regime = "LOW_VOL"
        regime_label = "Low Volatility"
        scalp_filter  = "WAIT"
    elif is_trending and trend_direction == "UP":
        regime = "TRENDING_UP"
        regime_label = "Trending Up"
        scalp_filter  = "LONG_PREFERRED"
    elif is_trending and trend_direction == "DOWN":
        regime = "TRENDING_DOWN"
        regime_label = "Trending Down"
        scalp_filter  = "EXIT_OR_SHORT"
    elif is_choppy:
        regime = "RANGING"
        regime_label = "Ranging"
        scalp_filter  = "WAIT"
    else:
        # Transisi / ambiguous
        regime = "RANGING"
        regime_label = "Transisi"
        scalp_filter  = "WAIT"

    return {
        "regime":           regime,
        "regime_label":     regime_label,
        "chop":             chop,
        "adx":              adx,
        "plus_di":          pdi,
        "minus_di":         mdi,
        "trend_direction":  trend_direction,
        "trend_strength":   adx_data["trend_strength"],
        "scalp_filter":     scalp_filter,
    }


# ---------------------------------------------------------------------------
# 10. Liquidity Sweep Detection (Spec §11, Roadmap Addendum §4.2)
# ---------------------------------------------------------------------------

def detect_liquidity_sweeps(
    candles: List[Dict[str, Any]],
    swing_highs: List[Dict[str, Any]],
    swing_lows: List[Dict[str, Any]],
    lookback: int = 10,
) -> List[Dict[str, Any]]:
    """
    Deteksi Liquidity Sweep (stop hunt / fakeout) berdasarkan:
    - Wick menembus level Swing High/Low
    - Body Close tetap di dalam range sebelumnya
    - Diikuti rejection (close berlawanan arah) dalam 1-2 candle

    Roadmap Addendum §4.2:
      Bullish Sweep: High > Prev Swing High, tetapi Close <= Prev Swing High
    """
    sweeps: List[Dict[str, Any]] = []
    if not candles or not (swing_highs or swing_lows):
        return sweeps

    recent = candles[-lookback:]

    for i, candle in enumerate(recent):
        c_high  = float(candle["high"])
        c_low   = float(candle["low"])
        c_close = float(candle["close"])
        c_open  = float(candle["open"])
        c_time  = candle.get("time", 0)

        # --- Bearish Sweep of Highs (Wick ke atas, rejection) ---
        for sh in swing_highs[-5:]:
            sh_price = sh["price"]
            if c_high > sh_price and c_close <= sh_price:
                # Rejection konfirmasi: badan candle bearish
                is_rejection = c_close < c_open
                sweeps.append({
                    "type":           "BEARISH_SWEEP_OF_HIGH",
                    "swept_level":    round(sh_price, 6),
                    "sweep_high":     round(c_high, 6),
                    "close":          round(c_close, 6),
                    "time":           c_time,
                    "confirmed":      is_rejection,
                    "label":          f"Sweep of High ({sh_price:.4f})",
                })

        # --- Bullish Sweep of Lows (Wick ke bawah, rejection) ---
        for sl in swing_lows[-5:]:
            sl_price = sl["price"]
            if c_low < sl_price and c_close >= sl_price:
                # Rejection konfirmasi: badan candle bullish
                is_rejection = c_close > c_open
                sweeps.append({
                    "type":           "BULLISH_SWEEP_OF_LOW",
                    "swept_level":    round(sl_price, 6),
                    "sweep_low":      round(c_low, 6),
                    "close":          round(c_close, 6),
                    "time":           c_time,
                    "confirmed":      is_rejection,
                    "label":          f"Sweep of Low ({sl_price:.4f})",
                })

    # Kembalikan hanya yang terbaru (maks 3 sweep)
    return sweeps[-3:] if sweeps else []


# ---------------------------------------------------------------------------
# 11. Setup Detection Engine (Spec §13)
# 4 tipe setup scalping: Breakout, Breakout Retest, Liquidity Sweep, Trend Pullback
# ---------------------------------------------------------------------------

def detect_scalping_setups(
    candles: List[Dict[str, Any]],
    structure: Dict[str, Any],
    sr: Dict[str, Any],
    volume: Dict[str, Any],
    momentum: Dict[str, Any],
    regime: Dict[str, Any],
    sweeps: List[Dict[str, Any]],
    atr: float,
    current_price: float,
) -> List[Dict[str, Any]]:
    """
    Deteksi setup scalping berdasarkan kombinasi sinyal.

    Setup yang terdeteksi:
    1. TREND_PULLBACK  – trend jelas + pullback ke support/EMA
    2. BREAKOUT        – harga break resistance + volume tinggi
    3. BREAKOUT_RETEST – setelah breakout, harga kembali test level lama
    4. LIQUIDITY_SWEEP – sweep + rejection kuat (bullish reversal)

    Setiap setup memiliki:
    - entry_zone: [low, high]
    - invalidation: level yang membatalkan setup
    - setup_quality: WEAK / MODERATE / STRONG
    - conditions_met: list alasan
    """
    setups: List[Dict[str, Any]] = []
    if not candles or len(candles) < 15:
        return setups

    ema9  = momentum.get("ema9")
    ema21 = momentum.get("ema21")
    ema50 = momentum.get("ema50")
    trend = structure.get("trend", "RANGE")
    rvol  = volume.get("rvol", 1.0)
    regime_name = regime.get("regime", "RANGING")
    nearest_sup = sr.get("nearest_support", {}).get("price")
    nearest_res = sr.get("nearest_resistance", {}).get("price")

    # --- 1. TREND PULLBACK ---
    # Kondisi: trend jelas + harga dekat EMA 9/21 atau support + momentum mulai recovery
    if trend == "BULLISH" and regime_name in ("TRENDING_UP", "RANGING"):
        conditions: List[str] = []
        quality_score = 0

        # Harga dekat EMA21 (pullback zone)
        ema21_dist_pct = abs(current_price - ema21) / ema21 * 100 if ema21 else 999
        if ema21_dist_pct < 0.5:
            conditions.append(f"Harga dekat EMA21 ({ema21_dist_pct:.2f}%)")
            quality_score += 2
        elif nearest_sup and abs(current_price - nearest_sup) / current_price * 100 < 0.8:
            conditions.append("Harga dekat Support terdekat")
            quality_score += 2

        # EMA bullish stack
        if momentum.get("is_bullish_stack"):
            conditions.append("EMA 9 > 21 > 50 (Bullish Stack)")
            quality_score += 2

        # Volume normal/tinggi
        if rvol >= 0.8:
            conditions.append(f"RVOL {rvol}x (cukup)")
            quality_score += 1

        # BOS konfirmasi
        if structure.get("last_bos") and structure["last_bos"].get("type") == "BULLISH_BOS":
            conditions.append("Bullish BOS terkonfirmasi")
            quality_score += 2

        if len(conditions) >= 2:
            entry_low  = current_price - 0.2 * atr
            entry_high = current_price + 0.1 * atr
            quality = "STRONG" if quality_score >= 6 else ("MODERATE" if quality_score >= 4 else "WEAK")
            setups.append({
                "type":           "TREND_PULLBACK",
                "direction":      "LONG",
                "label":          "Trend Pullback (Long)",
                "quality":        quality,
                "quality_score":  quality_score,
                "entry_zone":     [round(entry_low, 6), round(entry_high, 6)],
                "invalidation":   round(current_price - 1.5 * atr, 6),
                "conditions_met": conditions,
            })

    # --- 2. BREAKOUT ---
    # Kondisi: harga baru break resistance + RVOL tinggi + momentum bullish
    if nearest_res and trend in ("BULLISH", "RANGE"):
        conditions = []
        quality_score = 0
        dist_to_res_pct = (nearest_res - current_price) / current_price * 100

        # Harga sangat dekat dengan resistance (dalam 0.3%)
        if 0 < dist_to_res_pct < 0.3:
            conditions.append(f"Harga {dist_to_res_pct:.2f}% dari resistance {nearest_res:.4f}")
            quality_score += 3

        # Volume konfirmasi
        if rvol >= 1.5:
            conditions.append(f"RVOL {rvol}x (breakout confirmation)")
            quality_score += 3
        elif rvol >= 1.0:
            conditions.append(f"RVOL {rvol}x (moderate)")
            quality_score += 1

        # Momentum bullish
        if momentum.get("is_bullish_stack") or momentum.get("alignment") in ("BULLISH_ALIGNED", "SHORT_TERM_BULLISH"):
            conditions.append("Momentum EMA bullish")
            quality_score += 2

        # Slope EMA positif
        slope = momentum.get("slope_pct", 0)
        if slope > 0.01:
            conditions.append(f"EMA9 slope naik +{slope:.3f}%")
            quality_score += 1

        if len(conditions) >= 2:
            entry_low  = nearest_res * 0.9997
            entry_high = nearest_res * 1.003
            quality = "STRONG" if quality_score >= 7 else ("MODERATE" if quality_score >= 4 else "WEAK")
            setups.append({
                "type":           "BREAKOUT",
                "direction":      "LONG",
                "label":          "Breakout (Long)",
                "quality":        quality,
                "quality_score":  quality_score,
                "entry_zone":     [round(entry_low, 6), round(entry_high, 6)],
                "invalidation":   round(nearest_res - 1.0 * atr, 6),
                "conditions_met": conditions,
            })

    # --- 3. BREAKOUT RETEST ---
    # Kondisi: setelah BOS bullish, harga kembali ke level yang di-break
    if (structure.get("last_bos")
            and structure["last_bos"].get("type") == "BULLISH_BOS"):
        broken_level = structure["last_bos"].get("broken_level", 0)
        if broken_level > 0:
            dist_to_broken = (current_price - broken_level) / current_price * 100
            conditions = []
            quality_score = 0

            # Harga kembali mendekati level BOS yang di-break (dalam 0.5%)
            if 0 <= dist_to_broken < 0.5:
                conditions.append(f"Retest level BOS {broken_level:.4f} ({dist_to_broken:.2f}%)")
                quality_score += 3

            if momentum.get("is_bullish_stack"):
                conditions.append("EMA Bullish Stack")
                quality_score += 2

            if rvol >= 0.8:
                conditions.append(f"RVOL {rvol}x")
                quality_score += 1

            if len(conditions) >= 2:
                entry_low  = broken_level * 0.999
                entry_high = broken_level * 1.002
                quality = "STRONG" if quality_score >= 5 else ("MODERATE" if quality_score >= 3 else "WEAK")
                setups.append({
                    "type":           "BREAKOUT_RETEST",
                    "direction":      "LONG",
                    "label":          "Breakout Retest (Long)",
                    "quality":        quality,
                    "quality_score":  quality_score,
                    "entry_zone":     [round(entry_low, 6), round(entry_high, 6)],
                    "invalidation":   round(broken_level - 0.5 * atr, 6),
                    "conditions_met": conditions,
                })

    # --- 4. LIQUIDITY SWEEP ---
    # Kondisi: ada sweep + rejection konfirmasi + volume
    confirmed_sweeps = [s for s in sweeps if s.get("confirmed") and s["type"] == "BULLISH_SWEEP_OF_LOW"]
    if confirmed_sweeps:
        latest_sweep = confirmed_sweeps[-1]
        conditions = [latest_sweep["label"], "Rejection candle terkonfirmasi"]
        quality_score = 4

        if rvol >= 1.2:
            conditions.append(f"RVOL {rvol}x (konfirmasi volume)")
            quality_score += 2

        if structure.get("last_choch") and structure["last_choch"].get("type") == "BULLISH_CHOCH":
            conditions.append("Bullish CHoCH — reversal terkonfirmasi")
            quality_score += 2

        swept_level = latest_sweep.get("swept_level", current_price)
        entry_low  = swept_level * 0.999
        entry_high = current_price + 0.15 * atr
        quality = "STRONG" if quality_score >= 7 else ("MODERATE" if quality_score >= 5 else "WEAK")
        setups.append({
            "type":           "LIQUIDITY_SWEEP",
            "direction":      "LONG",
            "label":          "Liquidity Sweep Reversal (Long)",
            "quality":        quality,
            "quality_score":  quality_score,
            "entry_zone":     [round(entry_low, 6), round(entry_high, 6)],
            "invalidation":   round(latest_sweep.get("sweep_low", swept_level) - 0.3 * atr, 6),
            "conditions_met": conditions,
        })

    # Urutkan berdasarkan quality_score tertinggi
    setups.sort(key=lambda s: s.get("quality_score", 0), reverse=True)
    return setups[:3]  # maks 3 setup terbaik


# ---------------------------------------------------------------------------
# 12. Signal Scoring Engine (Spec §14)
# Weighted 0–100 score dari 7 komponen
# ---------------------------------------------------------------------------

# Bobot komponen (total = 100)
_SCORE_WEIGHTS = {
    "market_structure": 25,
    "mtf_alignment":    15,
    "price_action":     20,
    "volume":           15,
    "momentum":         10,
    "order_flow":        5,  # disederhanakan karena tidak ada order book
    "volatility":        5,
    "regime":            5,
}

def calculate_signal_score(
    structure: Dict[str, Any],
    mtf: Dict[str, Any],
    volume: Dict[str, Any],
    momentum: Dict[str, Any],
    regime: Dict[str, Any],
    candles: List[Dict[str, Any]],
    setups: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Hitung Signal Score 0–100 berdasarkan bobot Spec §14.

    Kategori:
      0–39    NO TRADE
      40–59   WEAK
      60–74   WATCH
      75–89   STRONG
      90–100  VERY STRONG
    """
    breakdown: Dict[str, Any] = {}

    # 1. Market Structure (max 25)
    struct_trend = structure.get("trend", "RANGE")
    struct_strength = structure.get("structure_strength", 50)
    has_bos   = structure.get("last_bos") is not None
    has_choch = structure.get("last_choch") is not None

    if struct_trend == "BULLISH":
        s_struct = 18 if not has_bos else 22
        s_struct += 3 if has_choch else 0
    elif struct_trend == "BEARISH":
        s_struct = 8
    else:
        s_struct = 10
    s_struct = min(s_struct, 25)
    breakdown["market_structure"] = s_struct

    # 2. MTF Alignment (max 15)
    bullish_count = mtf.get("bullish_count", 0)
    bearish_count = mtf.get("bearish_count", 0)
    dominant = max(bullish_count, bearish_count)
    s_mtf = round((dominant / 4.0) * 15)
    breakdown["mtf_alignment"] = s_mtf

    # 3. Price Action (max 20) — kualitas candle + BOS + setup detection
    s_pa = 8  # baseline
    if setups:
        best_setup = setups[0]
        qs = best_setup.get("quality_score", 0)
        s_pa = min(8 + qs, 20)
    breakdown["price_action"] = s_pa

    # 4. Volume (max 15)
    rvol = volume.get("rvol", 1.0)
    rvol_cls = volume.get("classification", "NORMAL")
    if rvol >= 2.5:
        s_vol = 10      # climactic — waspadai exhaustion
    elif rvol >= 1.5:
        s_vol = 15
    elif rvol >= 0.8:
        s_vol = 10
    else:
        s_vol = 3       # low volume — hindari breakout
    breakdown["volume"] = s_vol

    # 5. Momentum (max 10)
    is_bull_stack = momentum.get("is_bullish_stack", False)
    is_bear_stack = momentum.get("is_bearish_stack", False)
    slope = momentum.get("slope_pct", 0)
    if is_bull_stack:
        s_mom = 10 if slope > 0 else 7
    elif not is_bear_stack:
        s_mom = 5
    else:
        s_mom = 2
    breakdown["momentum"] = s_mom

    # 6. Order Flow / Tape (max 5) — gunakan rvol sebagai proxy karena tidak ada order book
    s_flow = 3 if rvol >= 1.0 else 1
    breakdown["order_flow"] = s_flow

    # 7. Volatility (max 5)
    regime_name = regime.get("regime", "RANGING")
    if regime_name in ("TRENDING_UP", "TRENDING_DOWN"):
        s_vol_regime = 5
    elif regime_name == "RANGING":
        s_vol_regime = 3
    else:
        s_vol_regime = 1
    breakdown["volatility"] = s_vol_regime

    # 8. Regime bonus (max 5)
    scalp_filter = regime.get("scalp_filter", "WAIT")
    if scalp_filter == "LONG_PREFERRED":
        s_regime = 5
    elif scalp_filter == "CAUTION":
        s_regime = 2
    elif scalp_filter == "WAIT":
        s_regime = 0
    else:
        s_regime = 3
    breakdown["regime"] = s_regime

    total = sum(breakdown.values())
    total = min(max(total, 0), 100)

    if total >= 90:
        category = "VERY_STRONG"
        category_label = "VERY STRONG"
    elif total >= 75:
        category = "STRONG"
        category_label = "STRONG"
    elif total >= 60:
        category = "WATCH"
        category_label = "WATCH"
    elif total >= 40:
        category = "WEAK"
        category_label = "WEAK"
    else:
        category = "NO_TRADE"
        category_label = "NO TRADE"

    return {
        "score":           total,
        "category":        category,
        "category_label":  category_label,
        "breakdown":       breakdown,
        "weights":         _SCORE_WEIGHTS,
    }


# ---------------------------------------------------------------------------
# 13. Signal TTL / Expiration (Roadmap Addendum §4.4)
# ---------------------------------------------------------------------------

# Batas candle sebelum sinyal kadaluwarsa
_TTL_CANDLES: Dict[str, int] = {
    "1m": 5,   # 5 menit
    "3m": 4,
    "5m": 6,   # 30 menit
    "15m": 4,
    "30m": 3,
    "1h": 3,
}

def calculate_signal_ttl(
    interval: str,
    candle_time: int,      # Unix timestamp candle saat sinyal terdeteksi
    current_time: int,     # Unix timestamp sekarang
) -> Dict[str, Any]:
    """
    Hitung sisa TTL sinyal (dalam candle dan detik).

    Return:
      candles_elapsed   : candle yang sudah berlalu sejak sinyal
      candles_remaining : sisa candle sebelum expired
      is_expired        : True jika melewati batas TTL
      ttl_status        : ACTIVE / EXPIRING_SOON / EXPIRED
    """
    interval_sec_map = {
        "1m": 60, "3m": 180, "5m": 300, "15m": 900,
        "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
    }
    candle_sec = interval_sec_map.get(interval, 60)
    max_candles = _TTL_CANDLES.get(interval, 5)

    elapsed_sec    = max(current_time - candle_time, 0)
    candles_elapsed   = elapsed_sec // candle_sec
    candles_remaining = max(max_candles - candles_elapsed, 0)
    is_expired     = candles_elapsed >= max_candles

    if is_expired:
        ttl_status = "EXPIRED"
    elif candles_remaining <= 1:
        ttl_status = "EXPIRING_SOON"
    else:
        ttl_status = "ACTIVE"

    return {
        "interval":           interval,
        "max_candles":        max_candles,
        "candles_elapsed":    int(candles_elapsed),
        "candles_remaining":  int(candles_remaining),
        "seconds_remaining":  int(candles_remaining * candle_sec),
        "is_expired":         is_expired,
        "ttl_status":         ttl_status,
    }


def run_full_p0_analysis(
    symbol: str,
    tf_candles: Dict[str, List[Dict[str, Any]]],
    active_interval: str = "1m",
    use_bnb_discount: bool = False,
    btc_5m_candles: Optional[List[Dict[str, Any]]] = None,
    btc_1m_candles: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Run complete P0 Analysis pipeline combining all engines:
    - MTF Matrix
    - Active Timeframe Structure (BOS, CHoCH, Swings)
    - Support & Resistance
    - Volatility (ATR-14)
    - Volume (RVOL-20)
    - Momentum (EMA 9, 21, 50)
    - Market Regime (CHOP + ADX)
    - Liquidity Sweep Detection
    - Setup Detection Engine (Breakout, Retest, Sweep, Pullback)
    - Signal Scoring (0–100)
    - Signal TTL / Expiration
    - Friction Cost Engine + Net R:R Validation (Roadmap Addendum §2)
    - BTC Market Gatekeeper — veto Long altcoin saat dump risk (Roadmap Addendum §5)
    """
    # Active candles for primary chart timeframe
    candles = tf_candles.get(active_interval) or tf_candles.get("1m", [])
    if not candles:
        return {"error": "No candlestick data provided"}

    current_price = float(candles[-1]["close"])

    # 1. Volatility
    volatility = calculate_atr(candles, period=14)
    atr = volatility["atr"] if volatility["atr"] > 0 else (current_price * 0.005)

    # 2. Volume
    volume = calculate_rvol(candles, period=20)

    # 3. Market Structure
    structure = analyze_market_structure(candles, n=2)

    # 4. Momentum & EMA Alignment
    momentum = calculate_ema_engine(candles)

    # 5. S/R Engine
    sr = calculate_support_resistance(candles, current_price, atr)

    # 6. MTF Confluence
    mtf = analyze_mtf_confluence(tf_candles)

    # 9. Market Regime Engine
    regime = analyze_market_regime(candles)

    # 10. Liquidity Sweep Detection
    swings = detect_swing_points(candles, n=2)
    sweeps = detect_liquidity_sweeps(
        candles,
        swing_highs=swings["highs"],
        swing_lows=swings["lows"],
    )

    # 11. Setup Detection Engine
    setups = detect_scalping_setups(
        candles=candles,
        structure=structure,
        sr=sr,
        volume=volume,
        momentum=momentum,
        regime=regime,
        sweeps=sweeps,
        atr=atr,
        current_price=current_price,
    )

    # 12. Signal Scoring Engine
    signal_score = calculate_signal_score(
        structure=structure,
        mtf=mtf,
        volume=volume,
        momentum=momentum,
        regime=regime,
        candles=candles,
        setups=setups,
    )

    # 13. Signal TTL
    import time as _time
    current_ts = int(_time.time())
    signal_ttl = calculate_signal_ttl(active_interval, current_ts, current_ts)

    # 7. Friction Cost Engine + Net R:R Calculation (Roadmap Addendum §2)
    #
    # Strategi penetapan TP/SL berbasis ATR dan S/R terdekat:
    # - TP1: Resistance terdekat ATAU Entry + 2.0 × ATR (mana yang lebih dekat)
    # - SL : Support terdekat ATAU Entry - 1.5 × ATR (mana yang lebih dekat ke entry)
    # - TP2: Entry + 3.5 × ATR (target lanjutan jika TP1 tercapai)
    #
    # ATR digunakan sebagai basis agar TP/SL proporsional terhadap volatilitas aktual.

    friction = calculate_friction_cost(current_price, use_bnb_discount)
    friction_rt_pct = friction["cost_roundtrip_pct"] / 100.0  # konversi ke desimal

    # TP1: resistance terdekat atau fallback ke 2.0× ATR
    nearest_res_price = sr["nearest_resistance"]["price"] if sr.get("nearest_resistance") else None
    tp1_atr = current_price + (2.0 * atr)
    if nearest_res_price and nearest_res_price > current_price:
        tp1_price = min(nearest_res_price, tp1_atr)
    else:
        tp1_price = tp1_atr

    # Pastikan TP1 memenuhi persyaratan minimum: ≥ 2.5× friction round-trip
    min_tp_dist = current_price * friction_rt_pct * _MIN_TP_FRICTION_MULT
    if (tp1_price - current_price) < min_tp_dist:
        tp1_price = current_price + min_tp_dist

    # TP2: kelipatan 3.5× ATR atau resistance berikutnya
    tp2_price = current_price + (3.5 * atr)
    key_res = sr.get("key_resistances", [])
    if len(key_res) >= 2:
        tp2_price = max(tp2_price, key_res[1]["price"])

    # SL: support terdekat atau fallback ke 1.5× ATR
    nearest_sup_price = sr["nearest_support"]["price"] if sr.get("nearest_support") else None
    sl_atr = current_price - (1.5 * atr)
    if nearest_sup_price and nearest_sup_price < current_price:
        sl_price = max(nearest_sup_price, sl_atr)
    else:
        sl_price = sl_atr

    # Net R:R untuk TP1 (setup scalping utama)
    net_rr_tp1 = calculate_net_rr(current_price, tp1_price, sl_price, use_bnb_discount)

    # Net R:R untuk TP2 (target lanjutan)
    net_rr_tp2 = calculate_net_rr(current_price, tp2_price, sl_price, use_bnb_discount)

    # 8. BTC Market Gatekeeper (Roadmap Addendum §5)
    # Jika simbol adalah BTCUSDT sendiri, gunakan candles aktif untuk pulse check
    # (tidak perlu data eksternal — BTC sedang dianalisis langsung).
    # Jika altcoin: gunakan btc_5m_candles & btc_1m_candles yang di-pass dari luar.
    is_btc_pair = symbol.upper() in ("BTCUSDT", "BTCBIDR", "BTCUSDC")

    if is_btc_pair:
        # Analisis BTC pair itu sendiri — pakai candles aktif sebagai 5M proxy
        btc_pulse = analyze_btc_pulse(
            btc_5m_candles=tf_candles.get("5m", candles),
            btc_1m_candles=tf_candles.get("1m"),
        )
    elif btc_5m_candles:
        btc_pulse = analyze_btc_pulse(
            btc_5m_candles=btc_5m_candles,
            btc_1m_candles=btc_1m_candles,
        )
    else:
        # Tidak ada data BTC — kembalikan status aman agar tidak memblokir sinyal
        btc_pulse = {
            "dump_risk": False,
            "veto_active": False,
            "status": "NO_DATA",
            "status_label": "BTC: Data tidak tersedia",
            "btc_price": 0.0,
            "btc_return_5m": 0.0,
            "btc_ema20": None,
            "btc_atr_ratio": 0.0,
            "reasons": [],
            "btc_1m_return": 0.0,
        }

    # Terapkan veto pada actionable_bias MTF jika BTC dump risk aktif
    # dan simbol bukan BTC sendiri
    if btc_pulse["veto_active"] and not is_btc_pair:
        original_bias = mtf.get("actionable_bias", "")
        if original_bias in ("LONG_STRONG", "LONG_ON_PULLBACK"):
            mtf = {**mtf,
                "actionable_bias": "WAIT_BTC_DUMP_RISK",
                "confluence_summary": mtf.get("confluence_summary", "") + " [VETO: BTC DUMP RISK]",
                "btc_veto_applied": True,
                "original_bias": original_bias,
            }

    return {
        "symbol": symbol.upper(),
        "interval": active_interval,
        "current_price": current_price,
        "timestamp": candles[-1].get("time", 0),
        "volatility": volatility,
        "volume": volume,
        "structure": structure,
        "momentum": momentum,
        "support_resistance": sr,
        "mtf": mtf,
        "regime": regime,
        "sweeps": sweeps,
        "setups": setups,
        "signal_score": signal_score,
        "signal_ttl": signal_ttl,
        "friction": {
            "cost_detail": friction,
            "tp1": net_rr_tp1,
            "tp2": net_rr_tp2,
        },
        "btc_gatekeeper": btc_pulse,
    }


# ---------------------------------------------------------------------------
# Trade Lifecycle State Machine (Roadmap Addendum §6)
# State: DETECTED → PENDING_ENTRY → ACTIVE → TP1_HIT → BREAKEVEN_ACTIVE →
#        TP2_HIT | STOPPED_BE | STOPPED_OUT | EXPIRED | INVALIDATED
# ---------------------------------------------------------------------------

# State yang valid
TRADE_STATES = frozenset([
    "DETECTED", "PENDING_ENTRY", "ACTIVE",
    "TP1_HIT", "BREAKEVEN_ACTIVE",
    "TP2_HIT", "STOPPED_BE", "STOPPED_OUT",
    "EXPIRED", "INVALIDATED",
])

# Buffer fee untuk breakeven SL setelah TP1 (Entry + buffer ini)
_BE_BUFFER_PCT = 0.0035   # 0.35% di atas entry = cover fee round-trip


def create_trade_state(
    symbol: str,
    interval: str,
    entry_price: float,
    tp1_price: float,
    tp2_price: float,
    sl_price: float,
    signal_score: int,
    setup_type: str = "UNKNOWN",
    timestamp: int = 0,
) -> Dict[str, Any]:
    """
    Buat objek state trade baru dalam status DETECTED.

    Args:
        symbol:        Simbol pair (contoh: BTCUSDT)
        interval:      Timeframe sinyal (1m, 5m, dst)
        entry_price:   Harga entry yang direkomendasikan
        tp1_price:     Target profit 1 (partial 50%)
        tp2_price:     Target profit 2 (full exit)
        sl_price:      Stop loss awal
        signal_score:  Skor 0–100 dari scoring engine
        setup_type:    Tipe setup (TREND_PULLBACK, BREAKOUT, dst)
        timestamp:     Unix timestamp saat sinyal terdeteksi

    Returns:
        Dict state trade dengan semua field lifecycle
    """
    import time as _t
    ts = timestamp or int(_t.time())

    return {
        "id":             f"{symbol}_{interval}_{ts}",
        "symbol":         symbol.upper(),
        "interval":       interval,
        "state":          "DETECTED",
        "setup_type":     setup_type,
        "signal_score":   signal_score,

        # Harga-harga kunci
        "entry_price":    round(entry_price, 8),
        "tp1_price":      round(tp1_price, 8),
        "tp2_price":      round(tp2_price, 8),
        "sl_price":       round(sl_price, 8),
        "sl_initial":     round(sl_price, 8),     # SL awal — tidak berubah
        "breakeven_sl":   round(entry_price * (1 + _BE_BUFFER_PCT), 8),

        # Tracking
        "partial_filled": False,   # True setelah TP1 hit (50% dieksekusi)
        "pnl_partial_pct": 0.0,    # PnL % dari bagian yang sudah ditutup
        "triggered_at":   None,    # Timestamp saat masuk ACTIVE
        "tp1_hit_at":     None,
        "closed_at":      None,
        "close_reason":   None,

        # TTL
        "detected_at":    ts,
        "ttl_interval":   interval,
        "ttl_max_candles": _TTL_CANDLES.get(interval, 5),

        # History state (untuk audit)
        "state_history": [
            {"state": "DETECTED", "ts": ts}
        ],
    }


def advance_trade_state(
    trade: Dict[str, Any],
    current_price: float,
    current_ts: int,
    invalidation_price: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Evaluasi dan transisi state trade berdasarkan harga terkini.

    State transitions:
      DETECTED        → PENDING_ENTRY (jika harga < 0.15% dari entry)
                      → EXPIRED (melewati TTL)
                      → INVALIDATED (harga tembus invalidation sebelum entry)
      PENDING_ENTRY   → ACTIVE (harga masuk entry zone)
                      → EXPIRED (TTL habis)
                      → INVALIDATED
      ACTIVE          → TP1_HIT (harga ≥ tp1)
                      → STOPPED_OUT (harga ≤ sl)
      TP1_HIT         → BREAKEVEN_ACTIVE (otomatis — SL naik ke breakeven)
      BREAKEVEN_ACTIVE→ TP2_HIT (harga ≥ tp2)
                      → STOPPED_BE (harga ≤ breakeven_sl)

    Returns:
        Trade dict yang sudah diupdate
    """
    import time as _t
    trade = dict(trade)   # shallow copy agar tidak mutasi in-place
    state = trade["state"]

    # State terminal — tidak ada transisi lagi
    if state in ("TP2_HIT", "STOPPED_BE", "STOPPED_OUT", "EXPIRED", "INVALIDATED"):
        return trade

    def _push_state(new_state: str) -> None:
        trade["state"] = new_state
        trade["state_history"] = trade.get("state_history", []) + [
            {"state": new_state, "ts": current_ts}
        ]

    entry    = trade["entry_price"]
    tp1      = trade["tp1_price"]
    tp2      = trade["tp2_price"]
    sl       = trade["sl_price"]
    be_sl    = trade["breakeven_sl"]
    detected = trade["detected_at"]

    # --- Cek TTL (berlaku untuk DETECTED dan PENDING_ENTRY) ---
    if state in ("DETECTED", "PENDING_ENTRY"):
        ttl = calculate_signal_ttl(
            trade["ttl_interval"],
            detected,
            current_ts,
        )
        if ttl["is_expired"]:
            _push_state("EXPIRED")
            trade["closed_at"] = current_ts
            trade["close_reason"] = "TTL_EXPIRED"
            return trade

    # --- Cek invalidation (struktur patah sebelum entry) ---
    if invalidation_price and state in ("DETECTED", "PENDING_ENTRY"):
        if current_price <= invalidation_price:
            _push_state("INVALIDATED")
            trade["closed_at"] = current_ts
            trade["close_reason"] = "STRUCTURE_INVALIDATED"
            return trade

    # --- DETECTED → PENDING_ENTRY ---
    if state == "DETECTED":
        dist_pct = abs(current_price - entry) / entry * 100
        if dist_pct <= 0.15:
            _push_state("PENDING_ENTRY")
        return trade

    # --- PENDING_ENTRY → ACTIVE ---
    if state == "PENDING_ENTRY":
        if current_price >= entry * 0.9995:  # toleransi 0.05% slippage
            _push_state("ACTIVE")
            trade["triggered_at"] = current_ts
        return trade

    # --- ACTIVE: cek TP1 atau SL ---
    if state == "ACTIVE":
        if current_price >= tp1:
            _push_state("TP1_HIT")
            trade["tp1_hit_at"] = current_ts
            trade["partial_filled"] = True
            # Hitung PnL dari 50% posisi yang ditutup di TP1
            trade["pnl_partial_pct"] = round((tp1 - entry) / entry * 100, 3)
            # Otomatis transisi ke BREAKEVEN_ACTIVE
            _push_state("BREAKEVEN_ACTIVE")
            # SL dinaikkan ke breakeven (entry + buffer fee)
            trade["sl_price"] = be_sl
        elif current_price <= sl:
            _push_state("STOPPED_OUT")
            trade["closed_at"] = current_ts
            trade["close_reason"] = "SL_HIT"
        return trade

    # --- BREAKEVEN_ACTIVE: cek TP2 atau BE stop ---
    if state == "BREAKEVEN_ACTIVE":
        if current_price >= tp2:
            _push_state("TP2_HIT")
            trade["closed_at"] = current_ts
            trade["close_reason"] = "TP2_REACHED"
        elif current_price <= be_sl:
            _push_state("STOPPED_BE")
            trade["closed_at"] = current_ts
            trade["close_reason"] = "BREAKEVEN_STOP"
        return trade

    return trade


def get_trade_state_label(state: str) -> str:
    """Kembalikan label human-readable untuk ditampilkan di UI."""
    labels = {
        "DETECTED":          "Setup Terdeteksi",
        "PENDING_ENTRY":     "Menunggu Entry (<0.15%)",
        "ACTIVE":            "AKTIF – Posisi Terbuka",
        "TP1_HIT":           "TP1 Tercapai – 50% Profit",
        "BREAKEVEN_ACTIVE":  "Breakeven Aktif – Risk-Free",
        "TP2_HIT":           "TP2 Tercapai – Full Exit",
        "STOPPED_BE":        "Stopped Breakeven (Risk-Free)",
        "STOPPED_OUT":       "Stop Loss Terkena",
        "EXPIRED":           "Signal Kedaluwarsa (TTL)",
        "INVALIDATED":       "Struktur Invalid – Dibatalkan",
    }
    return labels.get(state, state)
