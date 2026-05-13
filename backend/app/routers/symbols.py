"""
routers/symbols.py — Symbol registry and relative strength endpoints.

Endpoints:
    GET /api/symbols/                  — list active tracked symbols
    GET /api/symbols/relative-strength — 24H % change for all active symbols (OKX)
"""

from typing import List

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.symbol import TrackedSymbol

router = APIRouter(prefix="/symbols", tags=["symbols"])

OKX_TICKER_URL = "https://www.okx.com/api/v5/market/ticker"


class SymbolInfo(BaseModel):
    symbol:            str
    okx_instrument_id: str | None
    binance_symbol:    str | None
    display_name:      str
    is_active:         bool
    sort_order:        int

    class Config:
        from_attributes = True


class RelativeStrengthEntry(BaseModel):
    symbol:         str
    display_name:   str
    last_price:     float
    open_24h:       float
    change_pct_24h: float


@router.get("/", response_model=List[SymbolInfo])
async def list_symbols(db: AsyncSession = Depends(get_db)):
    """Return all active tracked symbols, sorted by sort_order."""
    result = await db.execute(
        select(TrackedSymbol)
        .where(TrackedSymbol.is_active == True)  # noqa: E712
        .order_by(TrackedSymbol.sort_order)
    )
    return result.scalars().all()


@router.get("/relative-strength", response_model=List[RelativeStrengthEntry])
async def relative_strength(db: AsyncSession = Depends(get_db)):
    """Fetch 24H percentage change for each active symbol from OKX tickers."""
    result = await db.execute(
        select(TrackedSymbol)
        .where(
            TrackedSymbol.is_active == True,        # noqa: E712
            TrackedSymbol.okx_instrument_id.isnot(None),
        )
        .order_by(TrackedSymbol.sort_order)
    )
    symbols = result.scalars().all()

    entries: list[RelativeStrengthEntry] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for sym in symbols:
            try:
                resp = await client.get(OKX_TICKER_URL, params={"instId": sym.okx_instrument_id})
                resp.raise_for_status()
                data = resp.json()["data"][0]
                last    = float(data["last"])
                open24h = float(data["open24h"])
                change  = round(((last - open24h) / open24h * 100) if open24h else 0.0, 2)
                entries.append(RelativeStrengthEntry(
                    symbol         = sym.symbol,
                    display_name   = sym.display_name,
                    last_price     = last,
                    open_24h       = open24h,
                    change_pct_24h = change,
                ))
            except Exception:
                pass  # skip symbols whose ticker fetch fails

    return entries
