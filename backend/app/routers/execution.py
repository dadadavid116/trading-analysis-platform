"""
routers/execution.py — Paper execution adapter endpoints (Phase 89).

POST /api/execution/proposals              — create proposal (from signal or manual levels)
GET  /api/execution/proposals              — list proposals (status filter)
GET  /api/execution/proposals/{id}         — single proposal detail
POST /api/execution/proposals/{id}/approve — approve → order + position
POST /api/execution/proposals/{id}/reject  — reject proposal
POST /api/execution/check                  — run SL/TP tracker against latest prices
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.execution import ExecutionProposal
from app.services.paper_execution import (
    create_proposal, approve_proposal, reject_proposal,
    list_proposals, check_sl_tp, _prop_dict,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/execution", tags=["execution"])


class ProposalBody(BaseModel):
    signal_id:   Optional[int]   = None
    symbol:      Optional[str]   = None
    direction:   Optional[str]   = None
    entry_price: Optional[float] = Field(None, gt=0)
    stop_loss:   Optional[float] = Field(None, gt=0)
    tp1:         Optional[float] = Field(None, gt=0)
    tp2:         Optional[float] = Field(None, gt=0)
    tp3:         Optional[float] = Field(None, gt=0)
    timeframe:   str = "15m"
    notes:       Optional[str] = None


class RejectBody(BaseModel):
    notes: Optional[str] = None


@router.post("/proposals")
async def create_proposal_endpoint(body: ProposalBody, db: AsyncSession = Depends(get_db)):
    try:
        prop = await create_proposal(
            db,
            signal_id   = body.signal_id,
            symbol      = body.symbol,
            direction   = body.direction,
            entry_price = body.entry_price,
            stop_loss   = body.stop_loss,
            tp1         = body.tp1,
            tp2         = body.tp2,
            tp3         = body.tp3,
            timeframe   = body.timeframe,
            notes       = body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _prop_dict(prop)


@router.get("/proposals")
async def get_proposals(
    status: Optional[str] = Query(None, description="pending,approved,rejected"),
    limit:  int           = Query(50, ge=1, le=200),
    db:     AsyncSession  = Depends(get_db),
):
    return await list_proposals(db, status=status, limit=limit)


@router.get("/proposals/{proposal_id}")
async def get_proposal(proposal_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ExecutionProposal).where(ExecutionProposal.id == proposal_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Proposal not found.")
    return _prop_dict(prop)


@router.post("/proposals/{proposal_id}/approve")
async def approve_proposal_endpoint(proposal_id: int, db: AsyncSession = Depends(get_db)):
    try:
        prop = await approve_proposal(db, proposal_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _prop_dict(prop)


@router.post("/proposals/{proposal_id}/reject")
async def reject_proposal_endpoint(
    proposal_id: int,
    body: RejectBody = RejectBody(),
    db: AsyncSession = Depends(get_db),
):
    try:
        prop = await reject_proposal(db, proposal_id, notes=body.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _prop_dict(prop)


@router.post("/check")
async def sl_tp_check(db: AsyncSession = Depends(get_db)):
    """Run SL/TP tracker against latest DB prices. Returns list of triggered closes."""
    triggered = await check_sl_tp(db)
    return {"checked": True, "triggered": triggered, "count": len(triggered)}
