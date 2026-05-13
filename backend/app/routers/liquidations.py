"""
routers/liquidations.py — API endpoints for liquidation events.

Endpoints:
    GET /api/liquidations/recent  — most recent liquidation events
    GET /api/liquidations/stats   — rolling window aggregates (5m / 15m / 1H)
    GET /api/liquidations/heatmap — price×time grid of liquidation USD values
"""

import math
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.liquidation import Liquidation
from app.schemas.liquidation import LiquidationSchema

router = APIRouter(prefix="/liquidations", tags=["liquidations"])


@router.get("/recent", response_model=List[LiquidationSchema])
async def get_recent_liquidations(
    limit: int  = Query(20, ge=1, le=100, description="Number of events to return"),
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent N liquidation events for the given symbol, newest first."""
    result = await db.execute(
        select(Liquidation)
        .where(Liquidation.symbol == symbol.upper())
        .order_by(desc(Liquidation.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/stats")
async def get_liquidation_stats(
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Rolling window aggregates for liquidations.

    Returns count, total USD value, and buy/sell breakdown for the last
    5 minutes, 15 minutes, and 1 hour.
    """
    sym = symbol.upper()
    now = datetime.now(timezone.utc)
    windows = {"5m": 5, "15m": 15, "1h": 60}
    stats: dict = {}

    for label, minutes in windows.items():
        since = now - timedelta(minutes=minutes)

        rows = await db.execute(
            select(Liquidation.side, Liquidation.price, Liquidation.quantity)
            .where(
                and_(
                    Liquidation.symbol == sym,
                    Liquidation.timestamp >= since,
                )
            )
        )
        events = rows.all()

        total_count = len(events)
        buy_count   = sum(1 for e in events if e.side == "buy")
        sell_count  = total_count - buy_count
        total_usd   = sum(float(e.price) * float(e.quantity) for e in events)
        buy_usd     = sum(float(e.price) * float(e.quantity) for e in events if e.side == "buy")
        sell_usd    = total_usd - buy_usd

        stats[label] = {
            "count":      total_count,
            "buy_count":  buy_count,
            "sell_count": sell_count,
            "total_usd":  round(total_usd, 0),
            "buy_usd":    round(buy_usd, 0),
            "sell_usd":   round(sell_usd, 0),
        }

    return {"symbol": sym, "windows": stats}


@router.get("/heatmap")
async def liquidation_heatmap(
    symbol:     str = Query("BTCUSDT"),
    hours:      int = Query(24, ge=1, le=168, description="Lookback window in hours"),
    price_bins: int = Query(40, ge=10, le=80,  description="Number of price buckets"),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a 2-D price × time grid of liquidation USD values.

    Each cell carries buy_usd (shorts liquidated) and sell_usd (longs liquidated).
    time_bin index 0 = oldest, price_bin index 0 = lowest price.
    """
    sym    = symbol.upper()
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)

    result = await db.execute(
        select(Liquidation.price, Liquidation.quantity, Liquidation.side, Liquidation.timestamp)
        .where(Liquidation.symbol == sym)
        .where(Liquidation.timestamp >= cutoff)
        .order_by(Liquidation.timestamp)
    )
    rows = result.all()

    if not rows:
        return {
            "symbol": sym, "hours": hours,
            "price_min": 0.0, "price_max": 0.0,
            "price_bin_size": 0.0, "price_bins": price_bins,
            "time_bins": 0, "time_bin_minutes": 30,
            "time_start": cutoff.isoformat(), "time_end": now.isoformat(),
            "cells": [],
        }

    prices = [float(r.price) for r in rows]
    price_min_raw, price_max_raw = min(prices), max(prices)

    # At least 1% padding on each side, minimum $100
    span    = max(price_max_raw - price_min_raw, 1.0)
    padding = max(span * 0.01, 100.0)
    price_min = max(0.0, price_min_raw - padding)
    price_max = price_max_raw + padding
    price_range    = price_max - price_min
    price_bin_size = price_range / price_bins

    # Adaptive time resolution
    if hours <= 6:
        time_bin_minutes = 15
    elif hours <= 24:
        time_bin_minutes = 30
    elif hours <= 72:
        time_bin_minutes = 60
    else:
        time_bin_minutes = 120

    time_bins = math.ceil(hours * 60 / time_bin_minutes)

    # Accumulate USD per (price_idx, time_idx) cell
    grid: dict[tuple[int, int], list[float]] = {}
    for row in rows:
        price = float(row.price)
        usd   = price * float(row.quantity)
        pi    = min(int((price - price_min) / price_bin_size), price_bins - 1)

        ts = row.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        elapsed_min = (ts - cutoff).total_seconds() / 60
        if elapsed_min < 0:
            continue
        ti = min(int(elapsed_min / time_bin_minutes), time_bins - 1)

        key = (pi, ti)
        if key not in grid:
            grid[key] = [0.0, 0.0]  # [buy_usd, sell_usd]
        if row.side == "buy":
            grid[key][0] += usd   # buy order → short liquidated
        else:
            grid[key][1] += usd   # sell order → long liquidated

    cells = [
        {"pi": pi, "ti": ti, "buy_usd": round(v[0]), "sell_usd": round(v[1])}
        for (pi, ti), v in grid.items()
    ]

    return {
        "symbol": sym, "hours": hours,
        "price_min": price_min, "price_max": price_max,
        "price_bin_size": price_bin_size, "price_bins": price_bins,
        "time_bins": time_bins, "time_bin_minutes": time_bin_minutes,
        "time_start": cutoff.isoformat(), "time_end": now.isoformat(),
        "cells": cells,
    }
