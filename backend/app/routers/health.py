"""
health.py — Service health endpoint.

GET /api/health/services

Returns the last-seen timestamp and status for each live-data collector.
Each service has its own ok/dead thresholds matched to its update frequency:

  price        — OKX candle close time; updates every ~60 s
  liquidations — event-driven; calm markets can have long gaps
  orderbook    — OKX books5; updates every 5 s
  funding      — REST poll every 30 min
  oi           — REST poll every 5 min
  ls_ratio     — REST poll every 15 min
"""

from datetime import datetime, timezone
from typing import Tuple

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter(prefix="/health", tags=["health"])

_TABLES = {
    "price":        "price_candles",
    "liquidations": "liquidations",
    "orderbook":    "orderbook_snapshots",
    "funding":      "funding_rates",
    "oi":           "open_interest",
    "ls_ratio":     "ls_ratios",
}

# Per-service (ok_threshold_s, dead_threshold_s).
# ok      → age < ok_threshold
# stale   → ok_threshold ≤ age < dead_threshold
# dead    → age ≥ dead_threshold  (or no rows at all)
_THRESHOLDS: dict[str, Tuple[int, int]] = {
    "price":        (120,   600),    # candle every ~60 s; ok < 2 min
    "liquidations": (3600,  86400),  # event-driven; ok < 1 H, dead > 24 H
    "orderbook":    (120,   600),    # snapshot every 5 s; ok < 2 min
    "funding":      (2400,  14400),  # poll every 30 min; ok < 40 min, dead > 4 H
    "oi":           (600,   3600),   # poll every 5 min;  ok < 10 min, dead > 1 H
    "ls_ratio":     (1200,  14400),  # poll every 15 min; ok < 20 min, dead > 4 H
}


def _status(last_seen: datetime | None, ok_s: int, dead_s: int) -> str:
    if last_seen is None:
        return "dead"
    # abs() guards against the close-time being slightly in the future (OKX convention)
    age = abs((datetime.now(timezone.utc) - last_seen).total_seconds())
    if age < ok_s:
        return "ok"
    if age < dead_s:
        return "stale"
    return "dead"


@router.get("/services")
async def service_health(db: AsyncSession = Depends(get_db)):
    services = {}
    for name, table in _TABLES.items():
        row = await db.execute(text(f"SELECT MAX(timestamp) FROM {table}"))
        last_seen: datetime | None = row.scalar_one_or_none()
        ok_s, dead_s = _THRESHOLDS.get(name, (120, 600))
        services[name] = {
            "last_seen": last_seen.isoformat() if last_seen else None,
            "status":    _status(last_seen, ok_s, dead_s),
        }
    return {"services": services}
