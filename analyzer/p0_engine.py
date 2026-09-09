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
        viability_label = "❌ NO TRADE – TP Tertutup Fee"
    elif not is_fee_viable:
        if not is_tp_dist_ok:
            viability_status = "NO_TRADE_TP_TOO_CLOSE"
            viability_label = f"❌ NO TRADE – TP Terlalu Dekat ({tp_friction_mult:.1f}× friction, min {_MIN_TP_FRICTION_MULT}×)"
        else:
            viability_status = "NO_TRADE_FEE_UNVIABLE"
            viability_label = f"⚠️ FEE UNVIABLE – Net R:R {net_rr:.2f} (min {_MIN_NET_RR})"
    elif net_rr >= 2.0:
        viability_status = "VIABLE_STRONG"
        viability_label = f"✅ VIABLE – Net R:R {net_rr:.2f} (Kuat)"
    else:
        viability_status = "VIABLE"
        viability_label = f"✅ VIABLE – Net R:R {net_rr:.2f}"

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
        status_label = "🚨 BTC DUMP RISK – Long Altcoin di-VETO"
    elif cond1_ema and not cond1_return:
        # Di bawah EMA tapi belum speed yang cukup → warning ringan
        status = "CAUTION"
        status_label = "⚠️ BTC di Bawah EMA20 – Waspadai"
    elif btc_return_5m < -0.003:
        # Koreksi sedang tapi belum trigger veto
        status = "CAUTION"
        status_label = f"⚠️ BTC Koreksi ({btc_return_5m*100:.2f}%) – Hati-hati"
    else:
        status = "SAFE"
        status_label = "✅ BTC Stabil – Long Altcoin Diizinkan"

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
            "status_label": "🔵 BTC: Data tidak tersedia",
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
        "friction": {
            "cost_detail": friction,
            "tp1": net_rr_tp1,
            "tp2": net_rr_tp2,
        },
        "btc_gatekeeper": btc_pulse,
    }
