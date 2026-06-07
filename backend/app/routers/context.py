"""
routers/context.py — Context Scoring Engine endpoints (Phase 82).

GET /api/context/score   — current unified Context Score (15-min cache)
GET /api/context/history — scoring history from factor_scores table
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.database import get_db
from app.services.context_scorer import compute_context_snapshot

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
