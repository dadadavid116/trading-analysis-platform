"""
routers/liquidations.py — API endpoints for liquidation events.

Endpoints:
    GET /api/liquidations/recent — most recent liquidation events
    GET /api/liquidations/stats  — rolling window aggregates (5m / 15m / 1H)
"""

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.liquidation import Liquidation
from app.schemas.liquidation import LiquidationSchema

router = APIRouter(prefix="/liquidations", tags=["liquidations"])


@router.get("/recent", response_model=List[LiquidationSchema])
async def get_recent_liquidations(
    limit: int = Query(20, ge=1, le=100, description="Number of events to return"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent N liquidation events for BTC, newest first."""
    result = await db.execute(
        select(Liquidation)
        .where(Liquidation.symbol == "BTCUSDT")
        .order_by(desc(Liquidation.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/stats")
async def get_liquidation_stats(db: AsyncSession = Depends(get_db)):
    """
    Rolling window aggregates for BTC liquidations.

    Returns count, total USD value, and buy/sell breakdown for the last
    5 minutes, 15 minutes, and 1 hour.
    """
    now = datetime.now(timezone.utc)
    windows = {"5m": 5, "15m": 15, "1h": 60}
    stats: dict = {}

    for label, minutes in windows.items():
        since = now - timedelta(minutes=minutes)

        rows = await db.execute(
            select(Liquidation.side, Liquidation.price, Liquidation.quantity)
            .where(
                and_(
                    Liquidation.symbol == "BTCUSDT",
                    Liquidation.timestamp >= since,
                )
            )
        )
        events = rows.all()

        total_count = len(events)
        buy_count   = sum(1 for e in events if e.side == "buy")
        sell_count  = total_count - buy_count
        total_usd   = sum(float(e.price) * float(e.quantity) for e in events)
        buy_usd     = sum(float(e.price) * float(e.quantity) for e in events if e.side == "buy")
        sell_usd    = total_usd - buy_usd

        stats[label] = {
            "count":      total_count,
            "buy_count":  buy_count,
            "sell_count": sell_count,
            "total_usd":  round(total_usd, 0),
            "buy_usd":    round(buy_usd, 0),
            "sell_usd":   round(sell_usd, 0),
        }

    return {"symbol": "BTCUSDT", "windows": stats}
