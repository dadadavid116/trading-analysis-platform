"""
routers/liquidations.py — API endpoints for liquidation events.

Endpoints:
    GET /api/liquidations/recent — most recent liquidation events
"""

from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
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
