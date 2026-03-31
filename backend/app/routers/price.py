"""
routers/price.py — API endpoints for BTC price data.

Endpoints:
    GET /api/price/latest    — most recent candle
    GET /api/price/history   — paginated candle history (newest first)
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.price import PriceCandle
from app.schemas.price import PriceCandleSchema

router = APIRouter(prefix="/price", tags=["price"])


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
