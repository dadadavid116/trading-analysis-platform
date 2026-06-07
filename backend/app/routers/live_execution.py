"""routers/live_execution.py — Live execution gate endpoints (Phase 97).

GET  /api/live/gate             — gate check status (all requirements)
POST /api/live/enable           — enable live mode (requires confirmation phrase + all gates)
POST /api/live/disable          — disable live mode immediately
GET  /api/live/test             — verify OKX API keys (read-only ping)
GET  /api/live/orders           — list live orders
POST /api/live/orders           — place a live order (requires live mode + risk check)
POST /api/live/orders/{id}/cancel — cancel a live order via OKX
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.live_execution import (
    check_live_gate, enable_live_mode, disable_live_mode,
    verify_okx_keys, place_live_order, cancel_live_order, list_live_orders,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/live", tags=["live-execution"])

CONFIRMATION_PHRASE = "ENABLE LIVE TRADING"


class EnableBody(BaseModel):
    confirmation: str


class LiveOrderBody(BaseModel):
    symbol:      str   = "BTCUSDT"
    direction:   str   = "long"
    size_usd:    float = Field(gt=0)
    entry_price: Optional[float] = Field(None, gt=0)
    stop_loss:   Optional[float] = Field(None, gt=0)
    tp1:         Optional[float] = Field(None, gt=0)
    order_type:  str   = "limit"
    signal_id:   Optional[int]   = None
    proposal_id: Optional[int]   = None
    notes:       Optional[str]   = None


@router.get("/gate")
async def get_gate_status(db: AsyncSession = Depends(get_db)):
    """Return all gate check results for live mode eligibility."""
    return await check_live_gate(db)


@router.post("/enable")
async def enable_live(body: EnableBody, db: AsyncSession = Depends(get_db)):
    """Enable live trading mode. Requires all gate checks to pass and the
    exact confirmation phrase 'ENABLE LIVE TRADING' in the request body."""
    if body.confirmation.strip() != CONFIRMATION_PHRASE:
        raise HTTPException(
            status_code=422,
            detail=f"Confirmation phrase must be exactly: {CONFIRMATION_PHRASE}",
        )
    try:
        return await enable_live_mode(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/disable")
async def disable_live(db: AsyncSession = Depends(get_db)):
    """Disable live trading mode immediately."""
    return await disable_live_mode(db)


@router.get("/test")
async def test_okx_keys():
    """Verify OKX API keys by calling a read-only account endpoint."""
    return await verify_okx_keys()


@router.get("/orders")
async def get_live_orders(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List recent live orders."""
    return await list_live_orders(db, limit=limit)


@router.post("/orders")
async def create_live_order(body: LiveOrderBody, db: AsyncSession = Depends(get_db)):
    """Place a live order via OKX API. Live mode must be enabled and all risk
    checks must pass. Every order requires explicit submission from the UI."""
    try:
        return await place_live_order(
            db,
            symbol      = body.symbol,
            direction   = body.direction,
            size_usd    = body.size_usd,
            entry_price = body.entry_price,
            stop_loss   = body.stop_loss,
            tp1         = body.tp1,
            order_type  = body.order_type,
            signal_id   = body.signal_id,
            proposal_id = body.proposal_id,
            notes       = body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/orders/{order_id}/cancel")
async def cancel_order_endpoint(order_id: int, db: AsyncSession = Depends(get_db)):
    """Cancel a live order via OKX API."""
    try:
        return await cancel_live_order(db, order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
