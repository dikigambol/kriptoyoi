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
"""

from typing import List, Dict, Any, Optional, Tuple
import math


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


def run_full_p0_analysis(
    symbol: str,
    tf_candles: Dict[str, List[Dict[str, Any]]],
    active_interval: str = "1m"
) -> Dict[str, Any]:
    """
    Run complete P0 Analysis pipeline combining all engines:
    - MTF Matrix
    - Active Timeframe Structure (BOS, CHoCH, Swings)
    - Support & Resistance
    - Volatility (ATR-14)
    - Volume (RVOL-20)
    - Momentum (EMA 9, 21, 50)
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
        "mtf": mtf
    }
