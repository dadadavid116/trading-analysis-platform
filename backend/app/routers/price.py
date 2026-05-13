"""
routers/price.py — API endpoints for price data.

Endpoints:
    GET /api/price/latest    — most recent candle for a symbol
    GET /api/price/history   — paginated candle history (newest first)
    GET /api/price/klines    — OHLCV candles from OKX for a given interval
    GET /api/price/stream    — SSE live-tick stream (optional symbol param)
"""

import asyncio
import json
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.price import PriceCandle
from app.schemas.price import PriceCandleSchema

router = APIRouter(prefix="/price", tags=["price"])

# OKX bar names mapped from Binance-style interval strings
VALID_INTERVALS: dict[str, str] = {
    "3m":  "3m",
    "5m":  "5m",
    "15m": "15m",
    "1h":  "1H",
    "4h":  "4H",
    "1d":  "1D",
    "1M":  "1M",
}

# Allowed canonical symbols (uppercase)
VALID_SYMBOLS = {"BTCUSDT", "ETHUSDT", "SOLUSDT"}

# Canonical → OKX instrument ID
SYMBOL_TO_OKX: dict[str, str] = {
    "BTCUSDT": "BTC-USDT-SWAP",
    "ETHUSDT": "ETH-USDT-SWAP",
    "SOLUSDT": "SOL-USDT-SWAP",
}

OKX_CANDLES_URL = "https://www.okx.com/api/v5/market/candles"


def _resolve_symbol(raw: str) -> str:
    sym = raw.upper()
    if sym not in VALID_SYMBOLS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown symbol '{raw}'. Supported: {', '.join(sorted(VALID_SYMBOLS))}",
        )
    return sym


@router.get("/stream")
async def stream_price(
    symbol: str = Query("BTCUSDT", description="Symbol to stream (BTCUSDT, ETHUSDT, SOLUSDT)"),
):
    """
    Server-Sent Events (SSE) stream for live price.

    Pushes the latest candle from the DB every second. The OKX price collector
    upserts on every tick (~1 s), so this stream is effectively live.
    """
    sym = _resolve_symbol(symbol)

    async def generator():
        while True:
            try:
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(PriceCandle)
                        .where(PriceCandle.symbol == sym)
                        .order_by(desc(PriceCandle.timestamp))
                        .limit(1)
                    )
                    candle = result.scalar_one_or_none()

                if candle:
                    payload = {
                        "id":        candle.id,
                        "symbol":    candle.symbol,
                        "timestamp": candle.timestamp.isoformat(),
                        "open":      float(candle.open),
                        "high":      float(candle.high),
                        "low":       float(candle.low),
                        "close":     float(candle.close),
                        "volume":    float(candle.volume),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
            except asyncio.CancelledError:
                return
            except Exception:
                pass

            await asyncio.sleep(1)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


@router.get("/latest", response_model=PriceCandleSchema)
async def get_latest_price(
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return the single most recent price candle for the given symbol."""
    sym = _resolve_symbol(symbol)
    result = await db.execute(
        select(PriceCandle)
        .where(PriceCandle.symbol == sym)
        .order_by(desc(PriceCandle.timestamp))
        .limit(1)
    )
    candle = result.scalar_one_or_none()
    if candle is None:
        raise HTTPException(status_code=404, detail=f"No price data found for {sym}")
    return candle


@router.get("/history", response_model=List[PriceCandleSchema])
async def get_price_history(
    limit: int  = Query(60, ge=1, le=500, description="Number of candles to return"),
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent N price candles for the given symbol, newest first."""
    sym = _resolve_symbol(symbol)
    result = await db.execute(
        select(PriceCandle)
        .where(PriceCandle.symbol == sym)
        .order_by(desc(PriceCandle.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/klines")
async def get_klines(
    interval: str = Query("5m", description="Candle interval: 3m, 5m, 15m, 1h, 4h, 1d, 1M"),
    limit: int    = Query(100, ge=1, le=500, description="Number of candles to return"),
    symbol: str   = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
):
    """
    Fetch OHLCV candlestick data from OKX for any supported interval and symbol.

    Returns a list of candles oldest-first:
        { time, open, high, low, close, volume }
    where time is a Unix timestamp in seconds (UTC).
    """
    if interval not in VALID_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval '{interval}'. Must be one of: {', '.join(sorted(VALID_INTERVALS))}",
        )
    sym     = _resolve_symbol(symbol)
    okx_bar = VALID_INTERVALS[interval]
    inst_id = SYMBOL_TO_OKX[sym]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                OKX_CANDLES_URL,
                params={"instId": inst_id, "bar": okx_bar, "limit": limit},
            )
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OKX API error: {exc}") from exc

    # OKX returns [ts_ms, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
    # Ordered newest-first — reverse to oldest-first for the chart.
    raw     = resp.json().get("data", [])
    candles = [
        {
            "time":   int(row[0]) // 1000,  # ms → seconds
            "open":   float(row[1]),
            "high":   float(row[2]),
            "low":    float(row[3]),
            "close":  float(row[4]),
            "volume": float(row[5]),
        }
        for row in reversed(raw)
    ]
    return candles
