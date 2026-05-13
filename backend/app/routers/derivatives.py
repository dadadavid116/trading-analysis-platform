"""
routers/derivatives.py — API endpoints for crypto derivatives context data.

Endpoints:
    GET /api/derivatives/funding   — latest funding rate + mark/index price
    GET /api/derivatives/oi        — latest open interest + 1H/4H deltas
    GET /api/derivatives/ls-ratio  — latest top-trader and global long/short ratios
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.derivatives import FundingRate, OpenInterest, LSRatio
from app.schemas.derivatives import FundingRateSchema, OpenInterestSchema, LSRatioSchema, LSRatioEntry

router = APIRouter(prefix="/derivatives", tags=["derivatives"])


@router.get("/funding", response_model=FundingRateSchema)
async def get_funding_rate(
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent funding rate snapshot for the given symbol."""
    sym    = symbol.upper()
    result = await db.execute(
        select(FundingRate)
        .where(FundingRate.symbol == sym)
        .order_by(desc(FundingRate.timestamp))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No funding rate data yet — collector may still be starting.")

    mark        = float(row.mark_price)  if row.mark_price  else None
    index       = float(row.index_price) if row.index_price else None
    premium_pct = ((mark - index) / index * 100) if mark and index and index != 0 else 0.0
    rate        = float(row.funding_rate)
    sentiment   = "bearish" if rate > 0.0001 else "bullish" if rate < -0.0001 else "neutral"

    return FundingRateSchema(
        symbol       = row.symbol,
        timestamp    = row.timestamp,
        funding_rate = rate,
        mark_price   = mark,
        index_price  = index,
        premium_pct  = round(premium_pct, 6),
        sentiment    = sentiment,
    )


@router.get("/oi", response_model=OpenInterestSchema)
async def get_open_interest(
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent open interest snapshot with 1H and 4H deltas."""
    sym = symbol.upper()
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(OpenInterest)
        .where(OpenInterest.symbol == sym)
        .order_by(desc(OpenInterest.timestamp))
        .limit(1)
    )
    latest = result.scalar_one_or_none()
    if latest is None:
        raise HTTPException(status_code=404, detail="No open interest data yet — collector may still be starting.")

    latest_val = float(latest.oi_value)

    async def delta_vs(minutes: int) -> float | None:
        since = now - timedelta(minutes=minutes + 5)
        until = now - timedelta(minutes=minutes - 5)
        res = await db.execute(
            select(OpenInterest)
            .where(
                OpenInterest.symbol == sym,
                OpenInterest.timestamp >= since,
                OpenInterest.timestamp <= until,
            )
            .order_by(OpenInterest.timestamp)
            .limit(1)
        )
        ref = res.scalar_one_or_none()
        if ref is None:
            return None
        ref_val = float(ref.oi_value)
        return round((latest_val - ref_val) / ref_val * 100, 3) if ref_val else None

    delta_1h = await delta_vs(60)
    delta_4h = await delta_vs(240)

    primary_delta = delta_1h if delta_1h is not None else delta_4h
    if primary_delta is None:
        trend = "stable"
    elif primary_delta > 0.5:
        trend = "expanding"
    elif primary_delta < -0.5:
        trend = "contracting"
    else:
        trend = "stable"

    return OpenInterestSchema(
        symbol    = latest.symbol,
        timestamp = latest.timestamp,
        oi_value  = latest_val,
        delta_1h  = delta_1h,
        delta_4h  = delta_4h,
        trend     = trend,
    )


@router.get("/ls-ratio", response_model=LSRatioSchema)
async def get_ls_ratio(
    symbol: str = Query("BTCUSDT", description="Symbol (BTCUSDT, ETHUSDT, SOLUSDT)"),
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent top-trader and global long/short ratios."""
    sym = symbol.upper()

    async def latest_for(ratio_type: str) -> LSRatioEntry | None:
        res = await db.execute(
            select(LSRatio)
            .where(LSRatio.symbol == sym, LSRatio.ratio_type == ratio_type)
            .order_by(desc(LSRatio.timestamp))
            .limit(1)
        )
        row = res.scalar_one_or_none()
        if row is None:
            return None
        return LSRatioEntry(
            long_pct   = round(float(row.long_ratio) * 100, 2),
            short_pct  = round(float(row.short_ratio) * 100, 2),
            updated_at = row.timestamp,
        )

    top     = await latest_for("top_account")
    global_ = await latest_for("global_account")

    return LSRatioSchema(
        symbol         = sym,
        top_account    = top,
        global_account = global_,
    )
