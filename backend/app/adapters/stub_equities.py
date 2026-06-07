"""
adapters/stub_equities.py — Stub equity adapter (Phase 94).

Placeholder implementations for the equity/stock vertical.  All methods raise
AdapterNotImplemented so the platform fails clearly rather than silently if
equity symbols are requested before the vertical is built.

When Phase 97+ introduces stock execution, replace these stubs with concrete
implementations (e.g. Alpaca, IBKR, Polygon.io) that satisfy the same interfaces.
"""

from __future__ import annotations

from typing import Optional

from app.adapters.base import (
    AdapterNotImplemented, AssetClass,
    DerivativesAdapter, ExecutionAdapter, FundingInfo, LiquidationEvent,
    MarketDataAdapter, OHLCVBar, PriceTick,
)

_NOT_READY = (
    "Equity adapter not yet implemented. "
    "Stocks/options are a future vertical — see Phase 97+ in the roadmap."
)


class StubEquityMarketDataAdapter(MarketDataAdapter):
    """Placeholder for future equity market data (Polygon.io / yfinance / IBKR)."""
    asset_class = AssetClass.EQUITY
    source      = "stub_equity"
    symbols: list[str] = []    # no symbols served yet

    async def get_latest_price(self, symbol: str) -> Optional[PriceTick]:
        raise AdapterNotImplemented(_NOT_READY)

    async def get_candles(self, symbol: str, interval: str = "1d", limit: int = 100) -> list[OHLCVBar]:
        raise AdapterNotImplemented(_NOT_READY)


class StubEquityDerivativesAdapter(DerivativesAdapter):
    """Placeholder for future options / equity derivatives data."""
    asset_class = AssetClass.EQUITY
    source      = "stub_equity"

    async def get_funding_rate(self, symbol: str) -> Optional[FundingInfo]:
        raise AdapterNotImplemented(_NOT_READY)

    async def get_open_interest(self, symbol: str) -> Optional[float]:
        raise AdapterNotImplemented(_NOT_READY)

    async def get_recent_liquidations(self, symbol: str, limit: int = 20) -> list[LiquidationEvent]:
        raise AdapterNotImplemented(_NOT_READY)


class StubPaperExecutionAdapter(ExecutionAdapter):
    """
    Minimal paper execution adapter satisfying the ExecutionAdapter interface.
    Used for the current paper-trading flow until a live venue adapter is built.
    """
    asset_class = AssetClass.CRYPTO
    source      = "paper"
    is_paper    = True

    async def place_order(
        self, symbol: str, direction: str, size_usd: float,
        order_type: str = "market",
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> dict:
        return {
            "source":    "paper",
            "symbol":    symbol,
            "direction": direction,
            "size_usd":  size_usd,
            "status":    "simulated",
            "note":      "Paper order — not sent to any exchange.",
        }

    async def cancel_order(self, order_id: str) -> bool:
        return True  # paper orders always cancel cleanly

    async def get_open_orders(self, symbol: Optional[str] = None) -> list[dict]:
        return []  # paper orders are tracked in the DB, not here

    async def safety_checks(self) -> list[str]:
        return []  # paper trading has no venue-level safety gates
