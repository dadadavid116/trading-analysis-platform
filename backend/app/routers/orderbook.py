"""
routers/orderbook.py — API endpoints for order book snapshots.

Endpoints:
    GET /api/orderbook/snapshot — latest order book snapshot
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.orderbook import OrderBookSnapshot
from app.schemas.orderbook import OrderBookSnapshotSchema

router = APIRouter(prefix="/orderbook", tags=["orderbook"])


@router.get("/snapshot", response_model=OrderBookSnapshotSchema)
async def get_orderbook_snapshot(db: AsyncSession = Depends(get_db)):
    """Return the most recent order book snapshot for BTC."""
    result = await db.execute(
        select(OrderBookSnapshot)
        .where(OrderBookSnapshot.symbol == "BTCUSDT")
        .order_by(desc(OrderBookSnapshot.timestamp))
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No order book snapshot found")
    return snapshot
