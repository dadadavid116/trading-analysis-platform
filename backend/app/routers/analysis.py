"""
routers/analysis.py — API endpoint for AI-generated market summaries.

Endpoints:
    GET /api/analysis/latest — most recent summary for BTC
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import AnalysisSummary
from app.schemas.analysis import AnalysisSummarySchema

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/latest", response_model=AnalysisSummarySchema)
async def get_latest_analysis(db: AsyncSession = Depends(get_db)):
    """Return the most recent AI-generated market summary for BTC."""
    result = await db.execute(
        select(AnalysisSummary)
        .where(AnalysisSummary.symbol == "BTCUSDT")
        .order_by(desc(AnalysisSummary.generated_at))
        .limit(1)
    )
    summary = result.scalar_one_or_none()
    if summary is None:
        raise HTTPException(
            status_code=404,
            detail="No analysis available yet. The analysis worker generates summaries on a schedule — check back shortly.",
        )
    return summary
