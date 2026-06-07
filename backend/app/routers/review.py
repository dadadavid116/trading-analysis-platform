"""
routers/review.py — Review & Research endpoints (Phase 91).

GET /api/review/daily          — today's P&L + AI coaching note
GET /api/review/regime-stats   — performance breakdown by market regime
GET /api/review/rule-adherence — risk-rule compliance score
GET /api/review/setup-stats    — performance by timeframe + direction
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.review_service import (
    daily_review, regime_stats, rule_adherence, setup_type_stats,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/review", tags=["review"])


@router.get("/daily")
async def daily_review_endpoint(db: AsyncSession = Depends(get_db)):
    return await daily_review(db)


@router.get("/regime-stats")
async def regime_stats_endpoint(db: AsyncSession = Depends(get_db)):
    return await regime_stats(db)


@router.get("/rule-adherence")
async def rule_adherence_endpoint(db: AsyncSession = Depends(get_db)):
    return await rule_adherence(db)


@router.get("/setup-stats")
async def setup_stats_endpoint(db: AsyncSession = Depends(get_db)):
    return await setup_type_stats(db)
