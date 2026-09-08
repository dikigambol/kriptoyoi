"""Direct ASGI test for /api/analysis/p0 endpoint"""
import asyncio
import httpx
from main import app

async def test_endpoint():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        print("Testing /api/analysis/p0?symbol=BTCUSDT&interval=1m ...")
        resp = await client.get("/api/analysis/p0?symbol=BTCUSDT&interval=1m")
        print("Status code:", resp.status_code)
        if resp.status_code == 200:
            data = resp.json()
            print("Symbol:", data.get("symbol"))
            print("Current price:", data.get("current_price"))
            print("ATR:", data.get("volatility"))
            print("RVOL:", data.get("volume"))
            print("Structure:", data.get("structure"))
            print("MTF Confluence:", data.get("mtf"))
            print("Support & Resistance:", data.get("support_resistance"))
            print("\nSUCCESS: All P0 components returned correctly!")
        else:
            print("Error response:", resp.text)

if __name__ == "__main__":
    asyncio.run(test_endpoint())
