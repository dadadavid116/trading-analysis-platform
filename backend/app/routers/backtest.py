"""
routers/backtest.py — Backtest and replay endpoints (Phase 90).

POST /api/backtest/run      — run signal backtest
GET  /api/backtest/replay   — OHLCV candles from a signal's creation time
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.backtest_service import run_backtest, replay_candles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/backtest", tags=["backtest"])


class BacktestParams(BaseModel):
    symbol:       Optional[str]   = None
    direction:    Optional[str]   = None
    since:        Optional[str]   = None   # ISO datetime string
    until:        Optional[str]   = None
    risk_pct:     float           = Field(1.0, gt=0, le=100)
    start_equity: float           = Field(10_000.0, gt=0)


@router.post("/run")
async def run_backtest_endpoint(body: BacktestParams, db: AsyncSession = Depends(get_db)):
    since_dt = datetime.fromisoformat(body.since).replace(tzinfo=timezone.utc) if body.since else None
    until_dt = datetime.fromisoformat(body.until).replace(tzinfo=timezone.utc) if body.until else None
    return await run_backtest(
        db,
        symbol       = body.symbol,
        direction    = body.direction,
        since        = since_dt,
        until        = until_dt,
        risk_pct     = body.risk_pct,
        start_equity = body.start_equity,
    )


@router.get("/replay")
async def replay_endpoint(
    symbol:     str,
    since:      str,
    limit:      int = Query(300, ge=10, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Return OHLCV candles from `since` (ISO string) for chart replay."""
    since_dt = datetime.fromisoformat(since).replace(tzinfo=timezone.utc)
    rows = await replay_candles(db, symbol=symbol.upper(), since=since_dt, limit=limit)
    return {"symbol": symbol.upper(), "since": since, "candles": rows}
