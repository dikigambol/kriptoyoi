import os
import time
import asyncio
import logging
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import httpx

# Load environment variables
load_dotenv()

logger = logging.getLogger("kriptoyoi")

API_KEY = os.getenv("apikey_tokocrypto", "")
BASE_REST_URL = "https://www.tokocrypto.site"
BASE_WS_URL = "wss://stream-cloud.tokocrypto.site"

app = FastAPI(title="KriptoYoi - Tokocrypto Realtime Chart")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache for symbols
symbols_cache = {
    "data": [],
    "last_updated": 0
}

# ---------------------------------------------------------------------------
# BTC Pulse Cache — diperbarui background setiap 30 detik
# Menyimpan candles BTCUSDT 5M & 1M + hasil analyze_btc_pulse() terkini
# ---------------------------------------------------------------------------
btc_pulse_cache: dict = {
    "last_updated": 0,
    "candles_5m": [],
    "candles_1m": [],
    "pulse": None,          # hasil analyze_btc_pulse()
    "error": None,
}
BTC_PULSE_TTL = 30          # detik — refresh interval background task
BTC_PULSE_CANDLE_LIMIT = 60 # jumlah candle yang di-fetch per timeframe

def get_headers():
    headers = {
        "User-Agent": "KriptoYoi/1.0",
        "Accept": "application/json",
    }
    if API_KEY:
        headers["X-MBX-APIKEY"] = API_KEY
    return headers


async def _fetch_btc_klines(client: httpx.AsyncClient, interval: str, limit: int) -> list:
    """Fetch raw BTCUSDT klines dan format ke dict candle."""
    try:
        resp = await client.get(
            f"{BASE_REST_URL}/api/v3/klines",
            params={"symbol": "BTCUSDT", "interval": interval, "limit": limit},
            headers=get_headers(),
        )
        if resp.status_code == 200:
            return [
                {
                    "time":   int(item[0]) // 1000,
                    "open":   float(item[1]),
                    "high":   float(item[2]),
                    "low":    float(item[3]),
                    "close":  float(item[4]),
                    "volume": float(item[5]),
                }
                for item in resp.json()
            ]
    except Exception as exc:
        logger.warning("Gagal fetch BTC klines %s: %s", interval, exc)
    return []


async def refresh_btc_pulse_cache() -> None:
    """
    Fetch candles BTCUSDT 5M & 1M, jalankan analyze_btc_pulse(),
    simpan hasilnya ke btc_pulse_cache.
    """
    from analyzer.p0_engine import analyze_btc_pulse
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            c5m, c1m = await asyncio.gather(
                _fetch_btc_klines(client, "5m", BTC_PULSE_CANDLE_LIMIT),
                _fetch_btc_klines(client, "1m", BTC_PULSE_CANDLE_LIMIT),
            )
        if c5m:
            pulse = analyze_btc_pulse(c5m, c1m if c1m else None)
            btc_pulse_cache.update({
                "last_updated": time.time(),
                "candles_5m":   c5m,
                "candles_1m":   c1m,
                "pulse":        pulse,
                "error":        None,
            })
    except Exception as exc:
        logger.warning("BTC pulse refresh error: %s", exc)
        btc_pulse_cache["error"] = str(exc)


async def _btc_pulse_background_loop() -> None:
    """Loop background yang memperbarui BTC pulse setiap BTC_PULSE_TTL detik."""
    while True:
        await refresh_btc_pulse_cache()
        await asyncio.sleep(BTC_PULSE_TTL)


@app.on_event("startup")
async def startup_event():
    """Jalankan background BTC pulse monitor saat server start."""
    asyncio.create_task(_btc_pulse_background_loop())


@app.get("/api/config")
async def get_config():
    return {
        "appName": "KriptoYoi",
        "hasApiKey": bool(API_KEY),
        "wsBaseUrl": BASE_WS_URL,
        "restBaseUrl": BASE_REST_URL,
        "defaultSymbol": "BTCUSDT",
        "defaultInterval": "1m",
        "intervals": ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"],
    }


@app.get("/api/symbols")
async def get_symbols():
    """Fetch all active trading pairs from Tokocrypto (1300+ coins), cached for 3 minutes."""
    now = time.time()
    if symbols_cache["data"] and (now - symbols_cache["last_updated"] < 180):
        return symbols_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            # Fetch exchangeInfo (authoritative active TRADING list) and ticker24hr in parallel
            req_ex = client.get(f"{BASE_REST_URL}/api/v3/exchangeInfo", headers=get_headers())
            req_ticker = client.get(f"{BASE_REST_URL}/api/v3/ticker/24hr", headers=get_headers())
            resp_ex, resp_ticker = await asyncio.gather(req_ex, req_ticker)

            ticker_map = {}
            if resp_ticker.status_code == 200:
                for t in resp_ticker.json():
                    ticker_map[t.get("symbol")] = t

            symbols_list = []
            if resp_ex.status_code == 200:
                ex_data = resp_ex.json()
                for s in ex_data.get("symbols", []):
                    if s.get("status") == "TRADING":
                        sym = s.get("symbol", "")
                        t = ticker_map.get(sym, {})
                        symbols_list.append({
                            "symbol": sym,
                            "baseAsset": s.get("baseAsset", ""),
                            "quoteAsset": s.get("quoteAsset", ""),
                            "lastPrice": float(t.get("lastPrice", 0) or 0),
                            "priceChangePercent": float(t.get("priceChangePercent", 0) or 0),
                            "quoteVolume": float(t.get("quoteVolume", 0) or 0),
                            "volume": float(t.get("volume", 0) or 0),
                            "highPrice": float(t.get("highPrice", 0) or 0),
                            "lowPrice": float(t.get("lowPrice", 0) or 0),
                            "openPrice": float(t.get("openPrice", 0) or 0),
                        })

            if not symbols_list and resp_ticker.status_code == 200:
                # Fallback to ticker list if exchangeInfo had issues
                for t in resp_ticker.json():
                    sym = t.get("symbol", "")
                    symbols_list.append({
                        "symbol": sym,
                        "baseAsset": sym[:-4] if sym.endswith("USDT") or sym.endswith("BIDR") else sym[:-3],
                        "quoteAsset": "USDT" if sym.endswith("USDT") else ("BIDR" if sym.endswith("BIDR") else "IDR"),
                        "lastPrice": float(t.get("lastPrice", 0) or 0),
                        "priceChangePercent": float(t.get("priceChangePercent", 0) or 0),
                        "quoteVolume": float(t.get("quoteVolume", 0) or 0),
                        "volume": float(t.get("volume", 0) or 0),
                        "highPrice": float(t.get("highPrice", 0) or 0),
                        "lowPrice": float(t.get("lowPrice", 0) or 0),
                        "openPrice": float(t.get("openPrice", 0) or 0),
                    })

            # Sort by volume descending
            symbols_list.sort(key=lambda x: x["quoteVolume"], reverse=True)
            symbols_cache["data"] = symbols_list
            symbols_cache["last_updated"] = now
            return symbols_list
    except Exception as e:
        if symbols_cache["data"]:
            return symbols_cache["data"]
        # Fallback default pairs
        fallback = [
            {"symbol": "BTCUSDT", "baseAsset": "BTC", "quoteAsset": "USDT", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 1000000},
            {"symbol": "ETHUSDT", "baseAsset": "ETH", "quoteAsset": "USDT", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 900000},
            {"symbol": "SOLUSDT", "baseAsset": "SOL", "quoteAsset": "USDT", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 800000},
            {"symbol": "BNBUSDT", "baseAsset": "BNB", "quoteAsset": "USDT", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 700000},
            {"symbol": "XRPUSDT", "baseAsset": "XRP", "quoteAsset": "USDT", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 600000},
            {"symbol": "BTCBIDR", "baseAsset": "BTC", "quoteAsset": "BIDR", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 500000},
            {"symbol": "ETHBIDR", "baseAsset": "ETH", "quoteAsset": "BIDR", "lastPrice": 0, "priceChangePercent": 0, "quoteVolume": 400000},
        ]
        return fallback


@app.get("/api/ticker24hr")
async def get_ticker24hr(symbol: str = Query("BTCUSDT", description="Trading pair symbol")):
    """Fetch 24hr ticker statistics for a symbol."""
    clean_symbol = symbol.upper().replace("_", "")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{BASE_REST_URL}/api/v3/ticker/24hr", params={"symbol": clean_symbol}, headers=get_headers())
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {}


@app.get("/api/btc-pulse")
async def get_btc_pulse(force_refresh: bool = Query(False, description="Paksa refresh cache sekarang")):
    """
    Kembalikan status BTC Market Gatekeeper terkini.

    Response mencakup:
    - dump_risk / veto_active : apakah veto Long altcoin aktif
    - status / status_label   : SAFE | CAUTION | DUMP_RISK
    - btc_price, btc_return_5m, btc_ema20, btc_atr_ratio
    - reasons                 : daftar alasan veto (jika aktif)
    - cache_age_sec           : usia cache dalam detik
    """
    if force_refresh or not btc_pulse_cache["pulse"]:
        await refresh_btc_pulse_cache()

    pulse = btc_pulse_cache.get("pulse")
    if not pulse:
        # Fallback bila data belum tersedia sama sekali
        return {
            "dump_risk": False,
            "veto_active": False,
            "status": "NO_DATA",
            "status_label": "🔵 BTC: Data belum tersedia",
            "btc_price": 0.0,
            "btc_return_5m": 0.0,
            "btc_ema20": None,
            "btc_atr_ratio": 0.0,
            "reasons": [],
            "btc_1m_return": 0.0,
            "cache_age_sec": None,
        }

    age = round(time.time() - btc_pulse_cache["last_updated"], 1)
    return {**pulse, "cache_age_sec": age}


@app.get("/api/klines")
async def get_klines(
    symbol: str = Query("BTCUSDT", description="Trading pair symbol"),
    interval: str = Query("1m", description="Candle interval (e.g. 1m, 5m, 1h, 1d)"),
    limit: int = Query(300, ge=1, le=1000, description="Number of candles")
):
    """Fetch historical klines/candlestick bars formatted for TradingView Lightweight Charts."""
    clean_symbol = symbol.upper().replace("_", "")
    params = {
        "symbol": clean_symbol,
        "interval": interval,
        "limit": limit
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BASE_REST_URL}/api/v3/klines", params=params, headers=get_headers())
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=f"Tokocrypto API error: {resp.text}")
            
            raw_klines = resp.json()
            # Tokocrypto klines format:
            # [
            #   [open_time, open, high, low, close, volume, close_time, quote_volume, trades, taker_buy_base, taker_buy_quote, ignore]
            # ]
            formatted_candles = []
            formatted_volumes = []
            
            for item in raw_klines:
                open_time_sec = int(item[0]) // 1000
                o = float(item[1])
                h = float(item[2])
                l = float(item[3])
                c = float(item[4])
                vol = float(item[5])
                
                formatted_candles.append({
                    "time": open_time_sec,
                    "open": o,
                    "high": h,
                    "low": l,
                    "close": c
                })
                
                color = "rgba(16, 185, 129, 0.45)" if c >= o else "rgba(239, 68, 68, 0.45)"
                formatted_volumes.append({
                    "time": open_time_sec,
                    "value": vol,
                    "color": color
                })
                
            return {
                "symbol": clean_symbol,
                "interval": interval,
                "candles": formatted_candles,
                "volumes": formatted_volumes
            }
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Network error connecting to Tokocrypto: {str(e)}")


from analyzer.p0_engine import (
    run_full_p0_analysis,
    create_trade_state,
    advance_trade_state,
    get_trade_state_label,
    calculate_signal_ttl,
)

# ---------------------------------------------------------------------------
# Trade Lifecycle State Machine Store
# In-memory store — key = trade["id"]
# ---------------------------------------------------------------------------
trade_store: dict[str, dict] = {}
TRADE_STORE_MAX = 50   # maks trade aktif/historis di memori

# ---------------------------------------------------------------------------
# Telegram Bot Notifier (Roadmap Addendum §8)
# Konfigurasi via env: TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Discord Webhook Notifier (pengganti Telegram)
# Konfigurasi via env: DISCORD_WEBHOOK_URL
# Cara setup: Server Settings → Integrations → Webhooks → New Webhook → Copy URL
# ---------------------------------------------------------------------------
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")


async def send_discord_alert(message: str) -> bool:
    """
    Kirim pesan ke Discord channel via Webhook.
    Mengembalikan True jika berhasil, False jika gagal atau tidak dikonfigurasi.
    Discord Webhook tidak perlu bot account — cukup URL webhook dari channel settings.
    """
    if not DISCORD_WEBHOOK_URL:
        return False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                DISCORD_WEBHOOK_URL,
                json={"content": message},
            )
            # Discord mengembalikan 204 No Content saat sukses
            return resp.status_code in (200, 204)
    except Exception as exc:
        logger.warning("Discord webhook error: %s", exc)
        return False


def build_discord_message(trade: dict, analysis: dict) -> str:
    """
    Format pesan Discord (plain text + emoji, tanpa HTML tag).
    Discord mendukung markdown: **bold**, `code`, dll.
    """
    sym   = trade.get("symbol", "")
    setup = trade.get("setup_type", "").replace("_", " ").title()
    score = trade.get("signal_score", 0)
    state = get_trade_state_label(trade.get("state", ""))
    entry = trade.get("entry_price", 0)
    sl    = trade.get("sl_price", 0)
    tp1   = trade.get("tp1_price", 0)
    tp2   = trade.get("tp2_price", 0)

    friction = (analysis or {}).get("friction", {})
    tp1_data = friction.get("tp1", {})
    net_rr   = tp1_data.get("net_rr", 0)
    rr_str   = f"1 : {net_rr:.2f}" if net_rr > 0 else "N/A"

    mtf_score = (analysis or {}).get("mtf", {}).get("score_ratio", "--")
    mtf_bias  = (analysis or {}).get("mtf", {}).get("confluence_summary", "--")
    regime    = (analysis or {}).get("regime", {}).get("regime_label", "--")

    def fp(v: float) -> str:
        if v == 0: return "--"
        if v >= 1000: return f"{v:,.2f}"
        if v >= 1:    return f"{v:.4f}"
        return f"{v:.6f}"

    lines = [
        f"⚡ **KRIPTOYOI SCALP ALERT: {sym}**",
        f"",
        f"📋 Setup: **{setup}** | Score: **{score}/100**",
        f"📌 Status: {state}",
        f"",
        f"🎯 Entry   : `{fp(entry)}`",
        f"🛑 SL      : `{fp(sl)}`",
        f"✅ TP1     : `{fp(tp1)}`",
        f"🚀 TP2     : `{fp(tp2)}`",
        f"",
        f"💰 Net R:R : **{rr_str}**",
        f"📊 MTF     : {mtf_score} | {mtf_bias}",
        f"🌐 Regime  : {regime}",
    ]
    return "\n".join(lines)

# Cache for P0 analysis (TTL 8 seconds per symbol+interval)
p0_cache: dict[str, dict] = {}

async def fetch_timeframe_klines(client: httpx.AsyncClient, symbol: str, interval: str, limit: int = 120):
    """Fetch and format candles for a specific timeframe."""
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    try:
        resp = await client.get(f"{BASE_REST_URL}/api/v3/klines", params=params, headers=get_headers())
        if resp.status_code == 200:
            raw = resp.json()
            candles = []
            for item in raw:
                candles.append({
                    "time": int(item[0]) // 1000,
                    "open": float(item[1]),
                    "high": float(item[2]),
                    "low": float(item[3]),
                    "close": float(item[4]),
                    "volume": float(item[5])
                })
            return interval, candles
    except Exception:
        pass
    return interval, []


@app.get("/api/analysis/p0")
async def get_p0_analysis(
    symbol: str = Query("BTCUSDT", description="Trading pair symbol"),
    interval: str = Query("1m", description="Active chart timeframe"),
    bnb_discount: bool = Query(False, description="Gunakan diskon fee BNB (fee 0.075% vs 0.10%)")
):
    """
    Get Stage P0 Quantitative Scalping Analysis:
    - Market Structure (Fractal Swing H/L, BOS, CHoCH, Trend Direction)
    - Dynamic Support & Resistance Levels
    - Volatility Engine (ATR 14 + Classification)
    - Relative Volume (RVOL 20-SMA + Spike detection)
    - Momentum Engine (EMA 9, 21, 50 Alignment & Slopes)
    - Multi-Timeframe (MTF) Confluence Matrix (1H, 15M, 5M, 1M)
    """
    clean_symbol = symbol.upper().replace("_", "")
    cache_key = f"{clean_symbol}_{interval}"
    now = time.time()

    # Check cache (8-second TTL)
    if cache_key in p0_cache:
        cached = p0_cache[cache_key]
        if now - cached["cached_at"] < 8:
            return cached["data"]

    timeframes = ["1h", "15m", "5m", "1m"]
    # If active interval is something else (like 3m, 30m, 4h), include it too
    all_tfs = list(set(timeframes + [interval]))

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = [fetch_timeframe_klines(client, clean_symbol, tf, limit=120) for tf in all_tfs]
            results = await asyncio.gather(*tasks)

            tf_candles = {tf: candles for tf, candles in results if candles}

            if not tf_candles or (interval not in tf_candles and "1m" not in tf_candles):
                raise HTTPException(status_code=502, detail="Failed to fetch candlestick data for analysis")

            analysis = run_full_p0_analysis(
                clean_symbol,
                tf_candles,
                active_interval=interval,
                use_bnb_discount=bnb_discount,
                btc_5m_candles=btc_pulse_cache.get("candles_5m") or None,
                btc_1m_candles=btc_pulse_cache.get("candles_1m") or None,
            )

            p0_cache[cache_key] = {
                "cached_at": now,
                "data": analysis
            }
            return analysis
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis calculation error: {str(e)}")


@app.get("/api/ticker24h")
async def get_ticker_24h(symbol: str = Query("BTCUSDT")):
    """Get 24h ticker summary for a specific symbol."""
    clean_symbol = symbol.upper().replace("_", "")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(f"{BASE_REST_URL}/api/v3/ticker/24hr", params={"symbol": clean_symbol}, headers=get_headers())
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch 24h ticker")
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Trade Lifecycle State Machine Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/trade/open")
async def open_trade(
    symbol:       str   = Query(...,   description="Simbol pair, contoh: SOLUSDT"),
    interval:     str   = Query("1m",  description="Timeframe sinyal"),
    entry_price:  float = Query(...,   description="Harga entry"),
    tp1_price:    float = Query(...,   description="Target TP1"),
    tp2_price:    float = Query(...,   description="Target TP2"),
    sl_price:     float = Query(...,   description="Stop Loss"),
    signal_score: int   = Query(0,     description="Skor sinyal 0–100"),
    setup_type:   str   = Query("UNKNOWN", description="Tipe setup"),
    notify:       bool  = Query(True,  description="Kirim alert Telegram"),
):
    """
    Daftarkan setup scalping baru ke State Machine dalam state DETECTED.
    Opsional kirim notifikasi Telegram.
    """
    clean = symbol.upper().replace("_", "")
    trade = create_trade_state(
        symbol=clean,
        interval=interval,
        entry_price=entry_price,
        tp1_price=tp1_price,
        tp2_price=tp2_price,
        sl_price=sl_price,
        signal_score=signal_score,
        setup_type=setup_type,
    )

    # Simpan ke store (FIFO pruning jika melebihi maks)
    trade_store[trade["id"]] = trade
    if len(trade_store) > TRADE_STORE_MAX:
        oldest = next(iter(trade_store))
        trade_store.pop(oldest)

    # Telegram alert
    if notify:
        # Ambil analisis P0 terkini dari cache untuk enrichment pesan
        cache_key = f"{clean}_{interval}"
        analysis_data = p0_cache.get(cache_key, {}).get("data")
        msg = build_discord_message(trade, analysis_data)
        asyncio.create_task(send_discord_alert(msg))

    return {"trade_id": trade["id"], "state": trade["state"], "trade": trade}


@app.post("/api/trade/update")
async def update_trade(
    trade_id:           str   = Query(..., description="ID trade dari /api/trade/open"),
    current_price:      float = Query(..., description="Harga pasar terkini"),
    invalidation_price: float = Query(None, description="Level invalidasi struktur"),
    notify:             bool  = Query(True, description="Kirim alert Telegram saat state berubah"),
):
    """
    Update state trade berdasarkan harga terkini (tick oleh tick atau setiap candle).
    Dipanggil otomatis oleh frontend via WebSocket candle update, atau manual.
    """
    trade = trade_store.get(trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail=f"Trade {trade_id} tidak ditemukan")

    prev_state = trade["state"]
    import time as _t
    updated = advance_trade_state(
        trade=trade,
        current_price=current_price,
        current_ts=int(_t.time()),
        invalidation_price=invalidation_price,
    )
    trade_store[trade_id] = updated
    new_state = updated["state"]

    # Kirim Telegram saat ada transisi state penting
    if notify and new_state != prev_state:
        important = {"ACTIVE", "TP1_HIT", "BREAKEVEN_ACTIVE", "TP2_HIT", "STOPPED_OUT", "STOPPED_BE", "EXPIRED", "INVALIDATED"}
        if new_state in important:
            cache_key = f"{updated['symbol']}_{updated['interval']}"
            analysis_data = p0_cache.get(cache_key, {}).get("data")
            msg = build_discord_message(updated, analysis_data)
            asyncio.create_task(send_discord_alert(msg))

    return {
        "trade_id": trade_id,
        "prev_state": prev_state,
        "new_state": new_state,
        "state_label": get_trade_state_label(new_state),
        "trade": updated,
        "state_changed": new_state != prev_state,
    }


@app.get("/api/trade/list")
async def list_trades(
    symbol:      str  = Query(None,    description="Filter by symbol"),
    active_only: bool = Query(False,   description="Hanya trade yang masih aktif"),
):
    """Daftar semua trade di state machine store."""
    terminal = {"TP2_HIT", "STOPPED_BE", "STOPPED_OUT", "EXPIRED", "INVALIDATED"}
    trades = list(trade_store.values())

    if symbol:
        trades = [t for t in trades if t["symbol"] == symbol.upper().replace("_", "")]
    if active_only:
        trades = [t for t in trades if t["state"] not in terminal]

    trades.sort(key=lambda t: t.get("detected_at", 0), reverse=True)
    return {
        "count": len(trades),
        "trades": trades,
    }


@app.delete("/api/trade/{trade_id}")
async def delete_trade(trade_id: str):
    """Hapus trade dari store (cleanup manual)."""
    if trade_id not in trade_store:
        raise HTTPException(status_code=404, detail="Trade tidak ditemukan")
    trade_store.pop(trade_id)
    return {"deleted": trade_id}


# ---------------------------------------------------------------------------
# Telegram Test Endpoint
# ---------------------------------------------------------------------------

@app.post("/api/discord/test")
async def test_discord():
    """Test koneksi Discord webhook dengan mengirim pesan singkat."""
    if not DISCORD_WEBHOOK_URL:
        return {
            "success": False,
            "message": "DISCORD_WEBHOOK_URL belum dikonfigurasi di .env",
        }
    ok = await send_discord_alert(
        "✅ **KriptoYoi** — Discord webhook terhubung!\n\n"
        "Notifikasi sinyal scalping akan muncul di sini."
    )
    return {"success": ok, "message": "OK" if ok else "Gagal — periksa webhook URL"}


# Ensure static directory exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def read_index():
    index_file = os.path.join("static", "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "KriptoYoi API is running. UI index.html will be available shortly."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
