import os
import time
import asyncio
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import httpx

# Load environment variables
load_dotenv()

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

def get_headers():
    headers = {
        "User-Agent": "KriptoYoi/1.0",
        "Accept": "application/json",
    }
    if API_KEY:
        headers["X-MBX-APIKEY"] = API_KEY
    return headers


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
