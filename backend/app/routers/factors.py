"""
routers/factors.py — Crypto factor scoring endpoints (Phase 79).

GET  /api/factors/snapshot?symbol=BTCUSDT
     Compute fresh factor scores + regime for the given symbol.
     Results are saved to factor_observations + regime_snapshots.

GET  /api/factors/regime-history?symbol=BTCUSDT&limit=48
     Recent regime snapshots (newest first) for historical context.
"""

from datetime import timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.factor import RegimeSnapshot
from app.services.factor_scorer import compute_snapshot

router = APIRouter(prefix="/factors", tags=["factors"])


@router.get("/snapshot")
async def get_factor_snapshot(
    symbol: str = "BTCUSDT",
    db: AsyncSession = Depends(get_db),
):
    """
    Compute all crypto factor scores for the given symbol and return the
    regime snapshot. Results are saved to the DB on each call.
    """
    return await compute_snapshot(symbol, db)


@router.get("/regime-history")
async def get_regime_history(
    symbol: str = "BTCUSDT",
    limit: int = 48,
    db: AsyncSession = Depends(get_db),
):
    """Return recent regime snapshots for the symbol, newest first."""
    result = await db.execute(
        select(RegimeSnapshot)
        .where(RegimeSnapshot.symbol == symbol)
        .order_by(desc(RegimeSnapshot.computed_at))
        .limit(min(limit, 200))
    )
    rows = result.scalars().all()
    return [
        {
            "computed_at":          r.computed_at.isoformat() if r.computed_at.tzinfo else r.computed_at.replace(tzinfo=timezone.utc).isoformat(),
            "crypto_score":         r.crypto_score,
            "regime":               r.regime,
            "trade_environment":    r.trade_environment,
            "primary_driver":       r.primary_driver,
            "derivatives_pressure": r.derivatives_pressure,
            "liquidity_pressure":   r.liquidity_pressure,
        }
        for r in rows
    ]
