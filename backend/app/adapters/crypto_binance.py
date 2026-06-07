"""
adapters/crypto_binance.py — Binance futures derivatives adapter (Phase 94).

DerivativesAdapter backed by the `funding_rates`, `open_interest`, and
`liquidations` DB tables, populated by the Binance futures collector service.
"""

from __future__ import annotations

import logging
from datetime import timezone
from typing import Optional

from sqlalchemy import select, desc

from app.adapters.base import (
    AssetClass, DerivativesAdapter, FundingInfo, LiquidationEvent,
)
from app.database import AsyncSessionLocal
from app.models.derivatives import FundingRate, OpenInterest
from app.models.liquidation import Liquidation

logger = logging.getLogger(__name__)


class BinanceCryptoDerivativesAdapter(DerivativesAdapter):
    """
    Derivatives adapter backed by the Binance futures collector.
    Reads from `funding_rates`, `open_interest`, and `liquidations` tables.
    """
    asset_class = AssetClass.CRYPTO
    source      = "binance_futures"

    async def get_funding_rate(self, symbol: str) -> Optional[FundingInfo]:
        async with AsyncSessionLocal() as db:
            r = await db.execute(
                select(FundingRate)
                .where(FundingRate.symbol == symbol)
                .order_by(desc(FundingRate.timestamp))
                .limit(1)
            )
            row = r.scalar_one_or_none()
        if row is None:
            return None
        rate = float(row.funding_rate)
        return FundingInfo(
            symbol       = symbol,
            rate         = rate,
            annualized   = round(rate * 3 * 365 * 100, 2),
            next_funding = None,
            source       = self.source,
        )

    async def get_open_interest(self, symbol: str) -> Optional[float]:
        async with AsyncSessionLocal() as db:
            r = await db.execute(
                select(OpenInterest)
                .where(OpenInterest.symbol == symbol)
                .order_by(desc(OpenInterest.timestamp))
                .limit(1)
            )
            row = r.scalar_one_or_none()
        if row is None:
            return None
        return float(row.oi_value)

    async def get_recent_liquidations(
        self, symbol: str, limit: int = 20
    ) -> list[LiquidationEvent]:
        async with AsyncSessionLocal() as db:
            r = await db.execute(
                select(Liquidation)
                .where(Liquidation.symbol == symbol)
                .order_by(desc(Liquidation.timestamp))
                .limit(limit)
            )
            rows = list(r.scalars().all())
        return [
            LiquidationEvent(
                symbol    = row.symbol,
                side      = row.side,
                price     = float(row.price),
                quantity  = float(row.quantity),
                timestamp = row.timestamp if row.timestamp.tzinfo else row.timestamp.replace(tzinfo=timezone.utc),
                source    = self.source,
            )
            for row in rows
        ]
