"""
health.py — Service health endpoint.

GET /api/health/services

Returns the last-seen timestamp and status for each live-data collector:
  price        — price_candles table
  liquidations — liquidations table
  orderbook    — orderbook_snapshots table

Status thresholds (based on seconds since last row):
  ok     < 120 s
  stale  120–600 s
  dead   > 600 s  (or no rows at all)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter(prefix="/health", tags=["health"])

_TABLES = {
    "price":        "price_candles",
    "liquidations": "liquidations",
    "orderbook":    "orderbook_snapshots",
}

_OK_THRESHOLD    = 120   # seconds
_STALE_THRESHOLD = 600   # seconds


def _status(last_seen: datetime | None) -> str:
    if last_seen is None:
        return "dead"
    age = (datetime.now(timezone.utc) - last_seen).total_seconds()
    if age < _OK_THRESHOLD:
        return "ok"
    if age < _STALE_THRESHOLD:
        return "stale"
    return "dead"


@router.get("/services")
async def service_health(db: AsyncSession = Depends(get_db)):
    services = {}
    for name, table in _TABLES.items():
        row = await db.execute(text(f"SELECT MAX(timestamp) FROM {table}"))
        last_seen: datetime | None = row.scalar_one_or_none()
        services[name] = {
            "last_seen": last_seen.isoformat() if last_seen else None,
            "status":    _status(last_seen),
        }
    return {"services": services}
