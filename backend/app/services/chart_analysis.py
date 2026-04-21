"""
services/chart_analysis.py — Claude-powered chart analysis.

Fetches the last 50 candles from Binance, sends them to Claude, and returns
structured key levels (support, resistance, entry, stop loss, take profit).
"""

import json
import httpx
import anthropic
from app.config import settings

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"


async def fetch_klines(interval: str, limit: int = 50) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            BINANCE_KLINES_URL,
            params={"symbol": "BTCUSDT", "interval": interval, "limit": limit},
            timeout=10,
        )
        resp.raise_for_status()
    return [
        {
            "time":   r[0] // 1000,
            "open":   float(r[1]),
            "high":   float(r[2]),
            "low":    float(r[3]),
            "close":  float(r[4]),
            "volume": float(r[5]),
        }
        for r in resp.json()
    ]


async def analyze_chart(interval: str = "1h") -> dict:
    """Return Claude's structured analysis of the current BTC chart."""
    candles = await fetch_klines(interval, limit=50)
    if not candles:
        raise ValueError("No candle data returned from Binance.")

    current_price = candles[-1]["close"]

    candle_text = "\n".join(
        f"  O:{c['open']:.0f} H:{c['high']:.0f} L:{c['low']:.0f} C:{c['close']:.0f}"
        for c in candles[-30:]
    )

    prompt = f"""You are a professional crypto technical analyst. Analyze the BTC/USDT chart below.

Timeframe: {interval}
Current price: ${current_price:,.0f}
Last 30 candles (Open / High / Low / Close):
{candle_text}

Identify key price levels based on structure, recent highs/lows, and momentum.

Reply with ONLY valid JSON — no markdown, no extra text:
{{
  "trend": "bullish" or "bearish" or "sideways",
  "support_levels": [price1, price2],
  "resistance_levels": [price1, price2],
  "entry_zone": {{"low": price, "high": price}},
  "stop_loss": price,
  "take_profit": [price1, price2],
  "reasoning": "2-3 sentences explaining the structure and key levels"
}}

Constraints:
- support_levels: 2 prices strictly BELOW ${current_price:,.0f}
- resistance_levels: 2 prices strictly ABOVE ${current_price:,.0f}
- entry_zone: a tight range near the nearest support
- stop_loss: below the lower support level
- take_profit: at or above the resistance levels
- All prices must be round numbers near actual chart structure"""

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if Claude wraps the JSON
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw

    data = json.loads(raw)
    data["timeframe"]     = interval
    data["current_price"] = current_price
    return data
