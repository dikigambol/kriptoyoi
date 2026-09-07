import os
import time
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
    """Fetch active trading pairs from Tokocrypto, cached for 5 minutes."""
    now = time.time()
    if symbols_cache["data"] and (now - symbols_cache["last_updated"] < 300):
        return symbols_cache["data"]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BASE_REST_URL}/api/v3/ticker/24hr", headers=get_headers())
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch tickers from Tokocrypto")
            
            data = resp.json()
            # Filter popular and active USDT and BIDR / IDR pairs
            filtered = []
            for item in data:
                symbol = item.get("symbol", "")
                if symbol.endswith("USDT") or symbol.endswith("BIDR") or symbol.endswith("IDR"):
                    volume = float(item.get("quoteVolume", 0) or 0)
                    filtered.append({
                        "symbol": symbol,
                        "baseAsset": symbol[:-4] if symbol.endswith("USDT") or symbol.endswith("BIDR") else symbol[:-3],
                        "quoteAsset": "USDT" if symbol.endswith("USDT") else ("BIDR" if symbol.endswith("BIDR") else "IDR"),
                        "lastPrice": float(item.get("lastPrice", 0) or 0),
                        "priceChangePercent": float(item.get("priceChangePercent", 0) or 0),
                        "quoteVolume": volume,
                    })

            # Sort by volume descending
            filtered.sort(key=lambda x: x["quoteVolume"], reverse=True)
            symbols_cache["data"] = filtered
            symbols_cache["last_updated"] = now
            return filtered
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
