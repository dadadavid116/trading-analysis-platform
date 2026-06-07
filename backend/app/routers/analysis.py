"""
routers/analysis.py — API endpoints for AI-generated market analysis.

Endpoints:
    GET  /api/analysis/latest         — most recent scheduled summary for BTC
    GET  /api/analysis/history        — last N scheduled summaries for BTC
    POST /api/analysis/chart          — on-demand Claude chart analysis
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
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
        raise HTTPException(status_code=404, detail="No analysis available yet.")
    return summary


@router.get("/history", response_model=List[AnalysisSummarySchema])
async def get_analysis_history(
    limit: int = Query(5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Return the last N AI-generated market summaries for BTC, newest first."""
    result = await db.execute(
        select(AnalysisSummary)
        .where(AnalysisSummary.symbol == "BTCUSDT")
        .order_by(desc(AnalysisSummary.generated_at))
        .limit(limit)
    )
    return result.scalars().all()


# ── On-demand Claude chart analysis ──────────────────────────────────────────

class ChartAnalysisRequest(BaseModel):
    timeframe:         str       = "1h"
    user_bias:         str       = ""
    active_indicators: List[str] = ["rsi", "macd", "ema", "price_levels"]
    symbol:            str       = "BTCUSDT"
    trader_style:      str       = "swing"   # scalp | swing | position
    risk_per_trade:    float     = 1.0       # % of account
    target_rr:         float     = 2.0       # minimum R:R


@router.post("/chart")
async def chart_analysis(body: ChartAnalysisRequest):
    """
    Fetch the last 50 candles from OKX for the given symbol, compute the requested
    technical indicators, and ask Claude to produce a direction-aware trade setup.

    active_indicators controls which computed values are injected into the prompt.
    Supported values: rsi, macd, ema, bollinger, price_levels
    Trader profile (style/risk/rr) is injected into the prompt to shape setup sizing.
    """
    try:
        from app.services.chart_analysis import analyze_chart
        from app.services.event_logger import log_event
        result = await analyze_chart(
            body.timeframe, body.user_bias, body.active_indicators, body.symbol,
            body.trader_style, body.risk_per_trade, body.target_rr,
        )
        sym = body.symbol
        await log_event(
            service    = "analysis",
            event_type = "chart_analysis",
            message    = (
                f"Chart analysis: {sym} {body.timeframe.upper()} — "
                f"{result.get('trend', '?')} {result.get('direction', '?')}"
            ),
            symbol = sym,
            detail = {
                "symbol":     sym,
                "timeframe":  body.timeframe,
                "trend":      result.get("trend"),
                "direction":  result.get("direction"),
                "bias":       body.user_bias or "auto",
            },
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
