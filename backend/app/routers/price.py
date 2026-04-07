"""
routers/price.py — API endpoints for BTC price data.

Endpoints:
    GET /api/price/latest    — most recent candle
    GET /api/price/history   — paginated candle history (newest first)
    GET /api/price/klines    — OHLCV candles for a given interval from Binance
"""

from typing import List, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.price import PriceCandle
from app.schemas.price import PriceCandleSchema

router = APIRouter(prefix="/price", tags=["price"])

# Valid Binance kline intervals accepted by this endpoint.
VALID_INTERVALS = {"3m", "5m", "15m", "1h", "4h", "1d", "1M"}

BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines"


@router.get("/latest", response_model=PriceCandleSchema)
async def get_latest_price(db: AsyncSession = Depends(get_db)):
    """Return the single most recent price candle for BTC."""
    result = await db.execute(
        select(PriceCandle)
        .where(PriceCandle.symbol == "BTCUSDT")
        .order_by(desc(PriceCandle.timestamp))
        .limit(1)
    )
    candle = result.scalar_one_or_none()
    if candle is None:
        raise HTTPException(status_code=404, detail="No price data found")
    return candle


@router.get("/history", response_model=List[PriceCandleSchema])
async def get_price_history(
    limit: int = Query(60, ge=1, le=500, description="Number of candles to return"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent N price candles for BTC, newest first."""
    result = await db.execute(
        select(PriceCandle)
        .where(PriceCandle.symbol == "BTCUSDT")
        .order_by(desc(PriceCandle.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/klines")
async def get_klines(
    interval: str = Query("5m", description="Candle interval: 3m, 5m, 15m, 1h, 4h, 1d, 1M"),
    limit: int = Query(100, ge=1, le=500, description="Number of candles to return"),
):
    """
    Fetch OHLCV candlestick data from Binance for any supported interval.

    Returns a list of candle objects:
        { time, open, high, low, close, volume }
    where time is a Unix timestamp in seconds (UTC).
    """
    if interval not in VALID_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval '{interval}'. Must be one of: {', '.join(sorted(VALID_INTERVALS))}",
        )

    params = {"symbol": "BTCUSDT", "interval": interval, "limit": limit}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(BINANCE_KLINES_URL, params=params)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Binance API error: {exc}") from exc

    # Binance returns arrays: [open_time, open, high, low, close, volume, ...]
    raw = resp.json()
    candles = [
        {
            "time": row[0] // 1000,   # ms → seconds for lightweight-charts
            "open":  float(row[1]),
            "high":  float(row[2]),
            "low":   float(row[3]),
            "close": float(row[4]),
            "volume": float(row[5]),
        }
        for row in raw
    ]
    return candles
