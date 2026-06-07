"""
routers/diagnostics.py — Model diagnostics and factor attribution (Phase 92).

GET /api/diagnostics/factor-ic          — score vs outcome correlations
GET /api/diagnostics/regime-heatmap     — win rate by (regime × month)
GET /api/diagnostics/score-quartiles    — performance by context-score quartile
GET /api/diagnostics/trade-attribution  — per-trade score breakdown
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.diagnostics_service import (
    factor_ic, regime_heatmap, score_quartile_stats, trade_attribution,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@router.get("/factor-ic")
async def factor_ic_endpoint(db: AsyncSession = Depends(get_db)):
    return await factor_ic(db)


@router.get("/regime-heatmap")
async def regime_heatmap_endpoint(db: AsyncSession = Depends(get_db)):
    return await regime_heatmap(db)


@router.get("/score-quartiles")
async def score_quartiles_endpoint(db: AsyncSession = Depends(get_db)):
    return await score_quartile_stats(db)


@router.get("/trade-attribution")
async def trade_attribution_endpoint(
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    return await trade_attribution(db, limit=limit)
