"""
services/levels.py — Key support & resistance level detection.

Algorithm:
  1. Aggregate 1m candles into 1H bars (last N bars of history).
  2. Find pivot highs and lows using a rolling window.
  3. Cluster nearby pivots within a tolerance band.
  4. Return the strongest levels above (resistance) and below (support)
     the current price, sorted by proximity.

Used by:
  - GET /api/price/levels  (price.py)
  - _key_level_signal()     (scanner.py)
"""

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.price import PriceCandle


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _aggregate_1h(symbol: str, db: AsyncSession, n_bars: int) -> list[dict]:
    """Aggregate stored 1-minute candles into 1-hour OHLC bars."""
    result = await db.execute(
        select(
            PriceCandle.high, PriceCandle.low,
            PriceCandle.close, PriceCandle.timestamp,
        )
        .where(PriceCandle.symbol == symbol)
        .order_by(desc(PriceCandle.timestamp))
        .limit(60 * (n_bars + 2))
    )
    rows = list(reversed(result.all()))

    buckets: dict = {}
    for row in rows:
        ts = row.timestamp.replace(minute=0, second=0, microsecond=0)
        if ts not in buckets:
            buckets[ts] = {"ts": ts, "high": float(row.high), "low": float(row.low), "close": float(row.close)}
        else:
            buckets[ts]["high"]  = max(buckets[ts]["high"],  float(row.high))
            buckets[ts]["low"]   = min(buckets[ts]["low"],   float(row.low))
            buckets[ts]["close"] = float(row.close)

    bars = sorted(buckets.values(), key=lambda x: x["ts"])
    if len(bars) > 1:
        bars = bars[:-1]   # drop the current incomplete bar
    return bars[-n_bars:]


def _find_pivots(bars: list[dict], window: int = 3) -> tuple[list[float], list[float]]:
    """Return (pivot_highs, pivot_lows) — local extremes over a rolling window."""
    highs, lows = [], []
    for i in range(window, len(bars) - window):
        segment = bars[i - window: i + window + 1]
        if bars[i]["high"] >= max(b["high"] for b in segment):
            highs.append(bars[i]["high"])
        if bars[i]["low"]  <= min(b["low"]  for b in segment):
            lows.append(bars[i]["low"])
    return highs, lows


def _cluster(prices: list[float], tolerance_pct: float = 0.5) -> list[dict]:
    """
    Group nearby price pivots into clusters.
    Returns clusters with ≥2 touches, sorted by touch count descending.
    """
    clusters: list[dict] = []
    for price in sorted(prices):
        matched = False
        for c in clusters:
            if abs(price - c["price"]) / c["price"] * 100 <= tolerance_pct:
                c["price"]   = (c["price"] * c["touches"] + price) / (c["touches"] + 1)
                c["touches"] += 1
                matched = True
                break
        if not matched:
            clusters.append({"price": price, "touches": 1})

    return sorted(
        [c for c in clusters if c["touches"] >= 2],
        key=lambda x: x["touches"],
        reverse=True,
    )


# ── Public API ────────────────────────────────────────────────────────────────

async def find_sr_levels(
    symbol: str,
    db: AsyncSession,
    lookback: int = 120,       # 1H bars to look back (~5 days)
    pivot_window: int = 3,     # bars each side to confirm a pivot
    tolerance_pct: float = 0.5,
    max_levels: int = 5,
) -> dict:
    """
    Detect support and resistance levels for a symbol.

    Returns:
        {
          "support":       [{"price": float, "touches": int, "pct_from_price": float}, ...],
          "resistance":    [{"price": float, "touches": int, "pct_from_price": float}, ...],
          "current_price": float | None,
        }
    Levels are sorted by proximity to the current price (closest first).
    """
    bars = await _aggregate_1h(symbol, db, lookback)
    if not bars:
        return {"support": [], "resistance": [], "current_price": None}

    current = bars[-1]["close"]
    pivot_highs, pivot_lows = _find_pivots(bars, pivot_window)

    raw_resistance = _cluster([p for p in pivot_highs if p > current], tolerance_pct)
    raw_support    = _cluster([p for p in pivot_lows  if p < current], tolerance_pct)

    def enrich(levels: list[dict]) -> list[dict]:
        return [
            {
                "price":          round(lv["price"], 2),
                "touches":        lv["touches"],
                "pct_from_price": round((lv["price"] - current) / current * 100, 2),
            }
            for lv in levels
        ]

    resistance = sorted(enrich(raw_resistance), key=lambda x: x["price"])[:max_levels]
    support    = sorted(enrich(raw_support),    key=lambda x: x["price"], reverse=True)[:max_levels]

    return {"support": support, "resistance": resistance, "current_price": round(current, 2)}
