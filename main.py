import os
import time
import asyncio
import logging
from typing import Optional
from pydantic import BaseModel
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
)

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


async def send_discord_alert(message: str = "", embed: dict | None = None, custom_url: str | None = None) -> bool:
    """
    Kirim pesan / embed ke Discord channel via Webhook.
    Menggunakan custom_url jika diberikan, atau fallback ke DISCORD_WEBHOOK_URL.
    """
    webhook_url = (custom_url or "").strip() or os.getenv("DISCORD_WEBHOOK_URL", DISCORD_WEBHOOK_URL)
    if not webhook_url or "discord.com/api/webhooks" not in webhook_url or "xxx/yyy" in webhook_url:
        return False
    try:
        payload = {}
        if message:
            payload["content"] = message
        if embed:
            payload["embeds"] = [embed]
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                webhook_url,
                json=payload,
            )
            return resp.status_code in (200, 204)
    except Exception as exc:
        logger.warning("Discord webhook error: %s", exc)
        return False


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
# Discord Signal & Webhook Endpoints
# ---------------------------------------------------------------------------

class SignalAlertRequest(BaseModel):
    symbol: str
    interval: str
    signal_type: str  # BUY, SELL, CLOSE
    price: float
    time: Optional[int] = None
    rsi: Optional[float] = None
    stoch_k: Optional[float] = None
    stoch_d: Optional[float] = None
    ema9: Optional[float] = None
    ema21: Optional[float] = None
    ema50: Optional[float] = None
    webhook_url: Optional[str] = None


class DiscordTestRequest(BaseModel):
    webhook_url: Optional[str] = None


@app.get("/api/discord/status")
async def get_discord_status(url: Optional[str] = None):
    """Cek apakah Discord Webhook aktif (dari parameter query atau dari .env)."""
    webhook_url = (url or "").strip() or os.getenv("DISCORD_WEBHOOK_URL", DISCORD_WEBHOOK_URL)
    is_configured = bool(webhook_url and "discord.com/api/webhooks" in webhook_url and "xxx/yyy" not in webhook_url)
    return {
        "configured": is_configured,
        "masked_url": webhook_url[:35] + "..." if is_configured else ""
    }


@app.post("/api/discord/signal")
async def post_discord_signal(req: SignalAlertRequest):
    """Kirim notifikasi sinyal scalper secara realtime ke Discord channel user."""
    webhook_url = (req.webhook_url or "").strip() or os.getenv("DISCORD_WEBHOOK_URL", DISCORD_WEBHOOK_URL)
    if not webhook_url or "xxx/yyy" in webhook_url or "discord.com/api/webhooks" not in webhook_url:
        return {"success": False, "message": "Discord Webhook URL belum diisi atau tidak valid"}

    is_buy = req.signal_type == "BUY"
    is_sell = req.signal_type == "SELL"

    title_emoji = "🟢" if is_buy else ("🔴" if is_sell else "🟡")
    color = 0x10B981 if is_buy else (0xF43F5E if is_sell else 0xEAB308)
    action_text = "BUY (Long Entry)" if is_buy else ("SELL (Short Entry)" if is_sell else "CLOSE (Take Profit / Exit)")

    fields = [
        {"name": "🪙 Pair", "value": f"**{req.symbol}**", "inline": True},
        {"name": "⏱️ Timeframe", "value": f"`{req.interval}`", "inline": True},
        {"name": "💰 Harga Eksekusi", "value": f"`${req.price:,.4f}`", "inline": True},
    ]

    ind_lines = []
    if req.rsi is not None:
        ind_lines.append(f"• **RSI (14)**: `{req.rsi:.1f}`")
    if req.stoch_k is not None and req.stoch_d is not None:
        ind_lines.append(f"• **Stoch RSI**: %K `{req.stoch_k:.1f}` | %D `{req.stoch_d:.1f}`")
    if req.ema9 is not None and req.ema21 is not None:
        ema_rel = ">" if req.ema9 >= req.ema21 else "<"
        ind_lines.append(f"• **EMA 9 vs 21**: `{req.ema9:,.2f}` {ema_rel} `{req.ema21:,.2f}`")
    if req.ema50 is not None:
        ind_lines.append(f"• **EMA 50 (Macro)**: `{req.ema50:,.2f}`")

    if ind_lines:
        fields.append({"name": "📊 Indikator Konfluensi", "value": "\n".join(ind_lines), "inline": False})

    # Waktu sinyal
    waktu_str = time.strftime("%d/%m/%Y, %H:%M:%S WIB", time.localtime())
    embed = {
        "title": f"{title_emoji} KriptoYoi Scalper: {req.signal_type}",
        "description": f"Sinyal **{action_text}** terpicu pada candlestick chart secara real-time.",
        "color": color,
        "fields": fields,
        "footer": {"text": f"KriptoYoi Scalper Alert • {waktu_str}"},
    }

    ok = await send_discord_alert(embed=embed, custom_url=webhook_url)
    return {"success": ok, "message": "Terkirim ke Discord" if ok else "Gagal kirim ke Discord"}


class RadarSetupAlertRequest(BaseModel):
    symbol: str
    interval: str
    setup_name: str
    direction: str  # LONG or SHORT
    quality: str    # STRONG, VERY_STRONG, MODERATE
    score: int
    score_label: Optional[str] = None
    entry_zone: Optional[list[float]] = None
    conditions_met: Optional[list[str]] = None
    price: Optional[float] = None
    webhook_url: Optional[str] = None


@app.post("/api/discord/radar-alert")
async def post_discord_radar_alert(req: RadarSetupAlertRequest):
    """Kirim notifikasi radar setup AI (sinyal yang sama dengan notifikasi bunyi chime) ke Discord."""
    webhook_url = (req.webhook_url or "").strip() or os.getenv("DISCORD_WEBHOOK_URL", DISCORD_WEBHOOK_URL)
    if not webhook_url or "xxx/yyy" in webhook_url or "discord.com/api/webhooks" not in webhook_url:
        return {"success": False, "message": "Discord Webhook URL belum diisi atau tidak valid"}

    is_long = req.direction.upper() == "LONG"
    title_emoji = "🔔 🟢" if is_long else "🔔 🔴"
    color = 0x10B981 if is_long else 0xF43F5E

    fields = [
        {"name": "🪙 Pair & TF", "value": f"**{req.symbol}** (`{req.interval}`)", "inline": True},
        {"name": "🎯 Arah Setup", "value": f"**{'LONG (Beli)' if is_long else 'SHORT (Jual)'}**", "inline": True},
        {"name": "📈 Skor AI", "value": f"`{req.score}/100` ({req.quality})", "inline": True},
    ]

    if req.price:
        fields.append({"name": "💰 Harga Saat Ini", "value": f"`${req.price:,.4f}`", "inline": True})

    if req.entry_zone and len(req.entry_zone) == 2:
        fields.append({
            "name": "🎯 Area Rekomendasi Entry",
            "value": f"`${req.entry_zone[0]:,.4f}` - `${req.entry_zone[1]:,.4f}`",
            "inline": True
        })

    if req.conditions_met:
        cond_str = "\n".join([f"✅ {c}" for c in req.conditions_met])
        fields.append({"name": "📋 Syarat Konfirmasi Terpenuhi", "value": cond_str, "inline": False})

    waktu_str = time.strftime("%d/%m/%Y, %H:%M:%S WIB", time.localtime())
    embed = {
        "title": f"{title_emoji} Radar Setup Terdeteksi: {req.setup_name}",
        "description": f"🔔 **Notifikasi Bunyi Radar:** Terdeteksi setup trading berkualitas tinggi (**{req.quality}**) dengan probabilitas kuat.",
        "color": color,
        "fields": fields,
        "footer": {"text": f"KriptoYoi AI Radar Alert • {waktu_str}"},
    }

    ok = await send_discord_alert(embed=embed, custom_url=webhook_url)
    return {"success": ok, "message": "Terkirim ke Discord" if ok else "Gagal kirim ke Discord"}


@app.post("/api/discord/test")
async def test_discord(req: Optional[DiscordTestRequest] = None):
    """Test koneksi Discord webhook (menggunakan URL dari request atau dari .env)."""
    custom_url = req.webhook_url if req else None
    webhook_url = (custom_url or "").strip() or os.getenv("DISCORD_WEBHOOK_URL", DISCORD_WEBHOOK_URL)
    if not webhook_url or "xxx/yyy" in webhook_url or "discord.com/api/webhooks" not in webhook_url:
        return {
            "success": False,
            "message": "Discord Webhook URL belum diisi atau tidak valid.",
        }
    embed = {
        "title": "✅ KriptoYoi Scalper — Discord Webhook Terhubung!",
        "description": "Notifikasi sinyal scalping realtime (BUY / SELL / CLOSE) akan otomatis dikirim ke channel ini saat web dibuka.",
        "color": 0x10B981,
        "fields": [
            {"name": "Status", "value": "🟢 Online & Realtime Ready", "inline": True},
            {"name": "Sumber Sinyal", "value": "Candlestick Chart WebSocket", "inline": True},
        ],
        "footer": {"text": "KriptoYoi Realtime Trading Engine"},
    }
    ok = await send_discord_alert(embed=embed, custom_url=webhook_url)
    return {"success": ok, "message": "OK" if ok else "Gagal - periksa apakah Webhook URL benar"}


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
