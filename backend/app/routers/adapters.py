"""
routers/adapters.py — Adapter registry introspection endpoint (Phase 94).

GET /api/adapters/status  — list all registered adapters + readiness
GET /api/adapters/ping    — quick check: fetch latest BTC price via the OKX adapter
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.adapters.registry import adapter_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/adapters", tags=["adapters"])


@router.get("/status")
async def adapters_status():
    """Return the current adapter registry — which venues are wired and ready."""
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "adapters":   adapter_registry.status(),
    }


@router.get("/ping")
async def adapters_ping():
    """
    Fetch the latest BTC price through the OKX adapter as a liveness check.
    Returns the tick if the adapter and DB are healthy.
    """
    try:
        adapter = adapter_registry.market_data("BTCUSDT")
        tick    = await adapter.get_latest_price("BTCUSDT")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"OKX adapter error: {exc}")

    if tick is None:
        return {"ok": False, "reason": "No price data in DB yet — collector may be starting up."}

    return {
        "ok":        True,
        "symbol":    tick.symbol,
        "close":     tick.close,
        "timestamp": tick.timestamp.isoformat(),
        "source":    tick.source,
    }
