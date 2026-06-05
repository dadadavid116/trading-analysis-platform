"""
services/symbol_registry.py — Load active symbols from the tracked_symbols table.

Provides two helpers used by collectors, the scanner, and routers:
  load_okx_symbol_map()        {okx_instrument_id: canonical_symbol}
  load_active_canonical()      [canonical_symbol, ...]

Both functions include a fallback to hardcoded defaults so collectors can
start even if the DB is temporarily unavailable.
"""

import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.symbol import TrackedSymbol

logger = logging.getLogger(__name__)

_FALLBACK_OKX_MAP: dict[str, str] = {
    "BTC-USDT-SWAP": "BTCUSDT",
    "ETH-USDT-SWAP": "ETHUSDT",
    "SOL-USDT-SWAP": "SOLUSDT",
}
_FALLBACK_CANONICAL = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]


async def load_okx_symbol_map(retries: int = 6, delay: float = 5.0) -> dict[str, str]:
    """Return {okx_instrument_id: canonical_symbol} for all active symbols."""
    for attempt in range(retries):
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(TrackedSymbol)
                    .where(
                        TrackedSymbol.is_active == True,           # noqa: E712
                        TrackedSymbol.okx_instrument_id.isnot(None),
                    )
                    .order_by(TrackedSymbol.sort_order)
                )
                rows = result.scalars().all()
                if rows:
                    return {r.okx_instrument_id: r.symbol for r in rows}
        except Exception as exc:
            logger.warning("Symbol registry load attempt %d/%d failed: %s", attempt + 1, retries, exc)
            if attempt < retries - 1:
                await asyncio.sleep(delay)

    logger.warning("Symbol registry: using hardcoded fallback (DB unavailable).")
    return _FALLBACK_OKX_MAP.copy()


async def load_active_canonical(retries: int = 6, delay: float = 5.0) -> list[str]:
    """Return [canonical_symbol, ...] for all active symbols in sort order."""
    for attempt in range(retries):
        try:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(TrackedSymbol)
                    .where(TrackedSymbol.is_active == True)  # noqa: E712
                    .order_by(TrackedSymbol.sort_order)
                )
                rows = result.scalars().all()
                if rows:
                    return [r.symbol for r in rows]
        except Exception as exc:
            logger.warning("Symbol registry load attempt %d/%d failed: %s", attempt + 1, retries, exc)
            if attempt < retries - 1:
                await asyncio.sleep(delay)

    logger.warning("Symbol registry: using hardcoded fallback (DB unavailable).")
    return _FALLBACK_CANONICAL.copy()
