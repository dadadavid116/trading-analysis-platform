"""
routers/risk.py — Risk engine endpoints (Phase 87).

  POST /api/risk/assess         — assess a proposed trade
  GET  /api/risk/summary        — current risk status (kill switch + exposure)
  POST /api/risk/kill-switch    — enable / disable kill switch
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.risk_engine import assess_trade, get_risk_summary
from app.services.account_state import set_kill_switch

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/risk", tags=["risk"])


class AssessRequest(BaseModel):
    entry_price:       float = Field(..., gt=0)
    stop_loss:         float = Field(..., gt=0)
    size_usd:          Optional[float] = Field(None, gt=0)
    override_risk_pct: Optional[float] = Field(None, gt=0, le=100)


class KillSwitchRequest(BaseModel):
    active: bool


@router.post("/assess")
async def assess_trade_endpoint(
    body: AssessRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await assess_trade(
        db,
        entry_price       = body.entry_price,
        stop_loss         = body.stop_loss,
        size_usd          = body.size_usd,
        override_risk_pct = body.override_risk_pct,
    )
    return result.to_dict()


@router.get("/summary")
async def risk_summary_endpoint(db: AsyncSession = Depends(get_db)):
    return await get_risk_summary(db)


@router.post("/kill-switch")
async def kill_switch_endpoint(
    body: KillSwitchRequest,
    db: AsyncSession = Depends(get_db),
):
    new_state = await set_kill_switch(db, body.active)
    action = "activated" if new_state else "deactivated"
    logger.warning("Kill switch %s via API", action)
    return {"kill_switch_active": new_state, "message": f"Kill switch {action}."}
