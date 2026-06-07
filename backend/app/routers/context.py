"""
routers/context.py — Context Scoring Engine endpoints (Phase 82 + 83).

GET /api/context/score      — unified Context Score (15-min cache)
GET /api/context/history    — scoring history from factor_scores table
GET /api/context/events     — upcoming economic events (FOMC/CPI/NFP)
GET /api/context/ai-summary — AI market context narrative (30-min cache)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.services.context_scorer import compute_context_snapshot
from app.services.context_ai import upcoming_events, get_context_ai_summary

router = APIRouter()


@router.get("/context/score")
async def get_context_score(
    symbol: str = "BTCUSDT",
    db: AsyncSession = Depends(get_db),
):
    snap = await compute_context_snapshot(db, symbol)
    return {
        "computed_at":       snap.computed_at.isoformat(),
        "symbol":            snap.symbol,
        "context_score":     snap.context_score,
        "regime":            snap.regime,
        "trade_environment": snap.trade_environment,
        "consensus":         snap.consensus,
        "confidence":        snap.confidence,
        "crypto_score":      snap.crypto_score,
        "macro_score":       snap.macro_score,
        "weights":           {"crypto": 0.60, "macro": 0.40},
        "weights_version":   snap.weights_version,
    }


@router.get("/context/history")
async def get_context_history(
    symbol: str = "BTCUSDT",
    limit: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        text("""
            SELECT computed_at, context_score, crypto_score, macro_score, regime
            FROM factor_scores
            WHERE symbol = :sym
            ORDER BY computed_at DESC
            LIMIT :lim
        """),
        {"sym": symbol, "lim": limit},
    )).fetchall()
    return [
        {
            "computed_at":   r.computed_at.isoformat(),
            "context_score": r.context_score,
            "crypto_score":  r.crypto_score,
            "macro_score":   r.macro_score,
            "regime":        r.regime,
        }
        for r in rows
    ]


@router.get("/context/events")
async def get_context_events(count: int = Query(default=6, ge=2, le=12)):
    """Return upcoming high-impact economic events (FOMC / CPI / NFP)."""
    return upcoming_events(count)


@router.get("/context/ai-summary")
async def get_context_ai_summary_endpoint(
    symbol: str = "BTCUSDT",
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """AI market context narrative via Claude Haiku. 30-min cache; pass refresh=true to bypass."""
    summary, generated_at = await get_context_ai_summary(db, symbol, refresh)
    return {
        "symbol":       symbol,
        "summary":      summary,
        "generated_at": generated_at.isoformat(),
    }
