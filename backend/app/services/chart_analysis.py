"""
services/chart_analysis.py — Claude-powered chart analysis with indicator context.

Fetches the last 50 candles from Binance, computes the requested technical
indicators from that price data, then sends everything to Claude and returns
a structured trade setup (support, resistance, entry, stop, take-profit).

Supported indicators (computed locally — no extra API calls):
  rsi          RSI(14) — momentum oscillator
  macd         MACD(12,26,9) — trend/momentum
  ema          EMA(20) and EMA(50)
  bollinger    Bollinger Bands(20, 2σ)
  price_levels Always included — support/resistance from candle structure
"""

import json
import httpx
import anthropic
from app.config import settings

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"


# ── Candle fetcher ─────────────────────────────────────────────────────────────

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


# ── Indicator computations ─────────────────────────────────────────────────────

def _ema_series(values: list[float], period: int) -> list[float]:
    """Return the full EMA series for a list of values."""
    if len(values) < period:
        return [values[-1]] * len(values)
    k = 2 / (period + 1)
    ema = sum(values[:period]) / period
    result = [ema]
    for v in values[period:]:
        ema = v * k + ema * (1 - k)
        result.append(ema)
    # Pad the front so length matches input
    return [result[0]] * (len(values) - len(result)) + result


def compute_rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains  = [max(d, 0.0) for d in deltas[-period:]]
    losses = [max(-d, 0.0) for d in deltas[-period:]]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def compute_macd(closes: list[float]) -> dict | None:
    if len(closes) < 35:   # need 26 for MACD + 9 for signal
        return None
    ema12 = _ema_series(closes, 12)
    ema26 = _ema_series(closes, 26)
    macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
    signal_line = _ema_series(macd_line, 9)
    current_macd   = macd_line[-1]
    current_signal = signal_line[-1]
    histogram      = current_macd - current_signal
    return {
        "macd":      round(current_macd, 2),
        "signal":    round(current_signal, 2),
        "histogram": round(histogram, 2),
        "bullish":   histogram > 0,
    }


def compute_ema(closes: list[float]) -> dict:
    ema20 = _ema_series(closes, 20)[-1]
    ema50 = _ema_series(closes, 50)[-1] if len(closes) >= 50 else None
    return {"ema20": round(ema20, 2), "ema50": round(ema50, 2) if ema50 else None}


def compute_bollinger(closes: list[float], period: int = 20) -> dict | None:
    if len(closes) < period:
        return None
    recent = closes[-period:]
    sma    = sum(recent) / period
    std    = (sum((c - sma) ** 2 for c in recent) / period) ** 0.5
    return {
        "upper":  round(sma + 2 * std, 2),
        "middle": round(sma, 2),
        "lower":  round(sma - 2 * std, 2),
    }


# ── Indicator context builder ─────────────────────────────────────────────────

def build_indicator_context(candles: list[dict], active: list[str], price: float) -> str:
    closes = [c["close"] for c in candles]
    lines  = []

    if "rsi" in active:
        rsi = compute_rsi(closes)
        zone = "oversold (<30)" if rsi < 30 else "overbought (>70)" if rsi > 70 else "neutral"
        lines.append(f"  RSI(14): {rsi} — {zone}")

    if "macd" in active:
        macd = compute_macd(closes)
        if macd:
            direction = "bullish momentum (histogram positive)" if macd["bullish"] else "bearish momentum (histogram negative)"
            lines.append(
                f"  MACD(12,26,9): MACD={macd['macd']}, Signal={macd['signal']}, "
                f"Hist={macd['histogram']:+.2f} — {direction}"
            )

    if "ema" in active:
        ema = compute_ema(closes)
        e20 = ema["ema20"]
        pos20 = "above" if price > e20 else "below"
        ema_line = f"  EMA(20): ${e20:,.0f} (price {pos20} = {'bullish' if pos20 == 'above' else 'bearish'})"
        if ema["ema50"]:
            e50 = ema["ema50"]
            pos50 = "above" if price > e50 else "below"
            ema_line += f"  |  EMA(50): ${e50:,.0f} (price {pos50})"
        lines.append(ema_line)

    if "bollinger" in active:
        bb = compute_bollinger(closes)
        if bb:
            pct_b = (price - bb["lower"]) / (bb["upper"] - bb["lower"]) * 100 if bb["upper"] != bb["lower"] else 50
            position = "near upper band (extended)" if pct_b > 80 else "near lower band (oversold)" if pct_b < 20 else "mid-range"
            lines.append(
                f"  Bollinger(20,2σ): Upper=${bb['upper']:,.0f}, Mid=${bb['middle']:,.0f}, "
                f"Lower=${bb['lower']:,.0f} — price {position}"
            )

    if not lines:
        return ""
    return "\nACTIVE INDICATORS:\n" + "\n".join(lines)


# ── Derivatives context (Phase 27) ───────────────────────────────────────────

async def fetch_derivatives_context(active: list[str]) -> str:
    """Fetch latest derivatives data from DB and return a formatted context block."""
    needs = {"oi", "funding_rate", "ls_ratio"}
    if not any(k in active for k in needs):
        return ""

    from sqlalchemy import select, desc
    from app.database import AsyncSessionLocal
    from app.models.derivatives import FundingRate, OpenInterest, LSRatio

    lines = []

    async with AsyncSessionLocal() as session:
        if "funding_rate" in active:
            res = await session.execute(
                select(FundingRate)
                .where(FundingRate.symbol == "BTCUSDT")
                .order_by(desc(FundingRate.timestamp))
                .limit(1)
            )
            fr = res.scalar_one_or_none()
            if fr:
                rate_pct = float(fr.funding_rate) * 100
                sentiment = "bearish — longs pay shorts" if rate_pct > 0.01 else "bullish — shorts pay longs" if rate_pct < -0.01 else "neutral"
                lines.append(f"  Funding Rate: {rate_pct:+.4f}% — {sentiment}")
                if fr.mark_price and fr.index_price:
                    premium = (float(fr.mark_price) - float(fr.index_price)) / float(fr.index_price) * 100
                    lines.append(f"  Mark/Index premium: {premium:+.4f}%")

        if "oi" in active:
            res = await session.execute(
                select(OpenInterest)
                .where(OpenInterest.symbol == "BTCUSDT")
                .order_by(desc(OpenInterest.timestamp))
                .limit(13)
            )
            oi_rows = res.scalars().all()
            if oi_rows:
                latest_oi = float(oi_rows[0].oi_value)
                lines.append(f"  Open Interest: {latest_oi:,.0f} BTC")
                if len(oi_rows) >= 2:
                    prev_oi = float(oi_rows[-1].oi_value)
                    delta   = (latest_oi - prev_oi) / prev_oi * 100 if prev_oi else 0
                    trend   = "expanding (new money entering)" if delta > 0.5 else "contracting (positions closing)" if delta < -0.5 else "stable"
                    lines.append(f"  OI change (~1H): {delta:+.2f}% — {trend}")

        if "ls_ratio" in active:
            res = await session.execute(
                select(LSRatio)
                .where(LSRatio.symbol == "BTCUSDT", LSRatio.ratio_type == "top_account")
                .order_by(desc(LSRatio.timestamp))
                .limit(1)
            )
            ls = res.scalar_one_or_none()
            if ls:
                long_pct  = float(ls.long_ratio) * 100
                short_pct = float(ls.short_ratio) * 100
                skew = "long biased" if long_pct > 55 else "short biased" if short_pct > 55 else "balanced"
                lines.append(f"  Top Trader L/S: Long={long_pct:.1f}% Short={short_pct:.1f}% — {skew}")

    if not lines:
        return ""
    return "\nDERIVATIVES CONTEXT (from DB — Phase 27 collectors):\n" + "\n".join(lines)


# ── Main analysis function ────────────────────────────────────────────────────

async def analyze_chart(
    interval: str = "1h",
    user_bias: str = "",
    active_indicators: list[str] | None = None,
) -> dict:
    """Return Claude's structured trade setup for the current BTC chart."""
    if active_indicators is None:
        active_indicators = ["rsi", "macd", "ema", "price_levels"]

    candles = await fetch_klines(interval, limit=50)
    if not candles:
        raise ValueError("No candle data returned from Binance.")

    current_price = candles[-1]["close"]

    candle_text = "\n".join(
        f"  O:{c['open']:.0f} H:{c['high']:.0f} L:{c['low']:.0f} C:{c['close']:.0f}"
        for c in candles[-30:]
    )

    indicator_context    = build_indicator_context(candles, active_indicators, current_price)
    derivatives_context  = await fetch_derivatives_context(active_indicators)
    bias_line = (
        f"\nUser's market view: {user_bias}\nWeight this perspective in your analysis."
        if user_bias else ""
    )

    prompt = f"""You are a professional crypto technical analyst. Analyze the BTC/USDT chart below.

Timeframe: {interval}
Current price: ${current_price:,.0f}
Last 30 candles (Open / High / Low / Close):
{candle_text}
{indicator_context}
{derivatives_context}
{bias_line}
Determine the trend from price structure, momentum, and the indicator readings above.
Then build a trade setup that matches the trend direction:

- BULLISH → LONG setup:
    entry_zone: tight range near the nearest support below price
    stop_loss: below the lower support level
    take_profit: at or above the resistance levels

- BEARISH → SHORT setup:
    entry_zone: tight range near the nearest resistance above price
    stop_loss: above the upper resistance level
    take_profit: at or below the support levels

- SIDEWAYS: pick the more probable direction from recent momentum and indicator readings.

Reply with ONLY valid JSON — no markdown, no extra text:
{{
  "trend": "bullish" or "bearish" or "sideways",
  "direction": "long" or "short",
  "support_levels": [price1, price2],
  "resistance_levels": [price1, price2],
  "entry_zone": {{"low": price, "high": price}},
  "stop_loss": price,
  "take_profit": [price1, price2],
  "reasoning": "2-3 sentences explaining the trend, key indicator signals, and why this direction"
}}

Constraints:
- support_levels: 2 prices strictly BELOW ${current_price:,.0f}
- resistance_levels: 2 prices strictly ABOVE ${current_price:,.0f}
- All prices must be round numbers near actual chart structure
- direction MUST match the trade setup (long entry below price, short entry above price)
- reasoning must reference any active indicator readings that influenced the decision"""

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw

    data = json.loads(raw)
    data["timeframe"]     = interval
    data["current_price"] = current_price
    return data
