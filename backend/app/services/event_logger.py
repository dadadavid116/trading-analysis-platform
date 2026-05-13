"""
services/event_logger.py — Fire-and-forget helper for writing to event_log.

Usage:
    from app.services.event_logger import log_event
    await log_event("analysis", "chart_analysis", "Chart analysis: BTCUSDT 5m — bullish long", symbol="BTCUSDT")

Errors are swallowed so event logging never crashes the caller.
"""

import logging
from typing import Any

from app.database import AsyncSessionLocal
from app.models.event_log import EventLog

logger = logging.getLogger(__name__)


async def log_event(
    service:    str,
    event_type: str,
    message:    str,
    symbol:     str | None       = None,
    detail:     dict[str, Any] | None = None,
) -> None:
    try:
        async with AsyncSessionLocal() as session:
            session.add(EventLog(
                service    = service,
                event_type = event_type,
                message    = message,
                symbol     = symbol,
                detail     = detail,
            ))
            await session.commit()
    except Exception as exc:
        logger.warning("event_logger: failed to write event: %s", exc)
