"""
routers/analysis.py — API endpoints for AI-generated market analysis.

Endpoints:
    GET  /api/analysis/latest — most recent scheduled summary for BTC
    POST /api/analysis/chart  — on-demand Claude chart analysis (Phase 23)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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


# ── Phase 23: on-demand Claude chart analysis ─────────────────────────────────

class ChartAnalysisRequest(BaseModel):
    timeframe: str = "1h"


@router.post("/chart")
async def chart_analysis(body: ChartAnalysisRequest):
    """
    Fetch the last 50 BTC candles from Binance and ask Claude to identify
    support/resistance levels, an entry zone, stop loss, and take profit targets.
    Returns structured JSON that the frontend draws as price lines on the chart.
    """
    try:
        from app.services.chart_analysis import analyze_chart
        return await analyze_chart(body.timeframe)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
