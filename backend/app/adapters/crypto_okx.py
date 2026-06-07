"""
adapters/crypto_okx.py — OKX perpetual-swap adapter (Phase 94).

MarketDataAdapter backed by the `price_candles` DB table, which is populated
continuously by the OKX price collector service.  No direct exchange API
calls are made here — the collector owns that responsibility.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, desc

from app.adapters.base import (
    AssetClass, MarketDataAdapter, OHLCVBar, PriceTick,
)
from app.database import AsyncSessionLocal
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)

_SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]


class OKXCryptoMarketDataAdapter(MarketDataAdapter):
    """
    Market data adapter for OKX perpetual swaps.
    Reads from price_candles (written by the collector service).
    """
    asset_class = AssetClass.CRYPTO
    source      = "okx_perp"
    symbols     = _SUPPORTED_SYMBOLS

    async def get_latest_price(self, symbol: str) -> Optional[PriceTick]:
        async with AsyncSessionLocal() as db:
            r = await db.execute(
                select(PriceCandle)
                .where(PriceCandle.symbol == symbol)
                .order_by(desc(PriceCandle.timestamp))
                .limit(1)
            )
            row = r.scalar_one_or_none()
        if row is None:
            return None
        return PriceTick(
            symbol    = row.symbol,
            close     = float(row.close),
            open      = float(row.open),
            high      = float(row.high),
            low       = float(row.low),
            volume    = float(row.volume),
            timestamp = row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=timezone.utc),
            source    = self.source,
        )

    async def get_candles(
        self,
        symbol:   str,
        interval: str = "1m",
        limit:    int = 100,
    ) -> list[OHLCVBar]:
        # The DB stores 1-min candles only; other intervals are not yet supported.
        if interval != "1m":
            logger.debug("OKXAdapter: interval '%s' not stored — returning 1m candles.", interval)

        async with AsyncSessionLocal() as db:
            r = await db.execute(
                select(PriceCandle)
                .where(PriceCandle.symbol == symbol)
                .order_by(desc(PriceCandle.timestamp))
                .limit(limit)
            )
            rows = list(r.scalars().all())

        rows.reverse()  # oldest first
        return [
            OHLCVBar(
                timestamp = row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=timezone.utc),
                open      = float(row.open),
                high      = float(row.high),
                low       = float(row.low),
                close     = float(row.close),
                volume    = float(row.volume),
            )
            for row in rows
        ]
