"""
adapters/registry.py — Adapter registry (Phase 94).

Maps symbols and asset classes to the correct adapter instances.
The registry is the single point of lookup for the rest of the codebase;
callers never instantiate adapters directly.

Usage:
    from app.adapters.registry import adapter_registry

    md  = adapter_registry.market_data("BTCUSDT")    # OKXCryptoMarketDataAdapter
    drv = adapter_registry.derivatives("BTCUSDT")    # BinanceCryptoDerivativesAdapter
    ex  = adapter_registry.execution()               # StubPaperExecutionAdapter

Adding a new asset class or venue:
    1. Implement the relevant ABC in a new file (e.g. adapters/equity_alpaca.py)
    2. Register it in AdapterRegistry.__init__()
    3. Add symbol routing logic to the lookup methods
"""

from __future__ import annotations

import logging
from typing import Optional

from app.adapters.base import (
    AdapterNotImplemented, AssetClass,
    DerivativesAdapter, ExecutionAdapter, MarketDataAdapter,
)
from app.adapters.crypto_okx     import OKXCryptoMarketDataAdapter
from app.adapters.crypto_binance  import BinanceCryptoDerivativesAdapter
from app.adapters.stub_equities   import (
    StubEquityMarketDataAdapter,
    StubPaperExecutionAdapter,
)

logger = logging.getLogger(__name__)

_CRYPTO_SYMBOLS = {"BTCUSDT", "ETHUSDT", "SOLUSDT"}


class AdapterRegistry:
    """
    Central registry of all configured adapters.
    Instantiated once as a module-level singleton.
    """

    def __init__(self) -> None:
        self._crypto_market_data  = OKXCryptoMarketDataAdapter()
        self._crypto_derivatives  = BinanceCryptoDerivativesAdapter()
        self._equity_market_data  = StubEquityMarketDataAdapter()
        self._paper_execution     = StubPaperExecutionAdapter()

    # ── Lookup methods ────────────────────────────────────────────────────────

    def market_data(self, symbol: str) -> MarketDataAdapter:
        """Return the market data adapter for the given symbol."""
        if symbol in _CRYPTO_SYMBOLS:
            return self._crypto_market_data
        # Future: route equity symbols to StubEquityMarketDataAdapter or concrete impl
        logger.warning("AdapterRegistry: no market-data adapter for symbol '%s'.", symbol)
        return self._equity_market_data   # will raise AdapterNotImplemented on use

    def derivatives(self, symbol: str) -> DerivativesAdapter:
        """Return the derivatives adapter for the given symbol."""
        if symbol in _CRYPTO_SYMBOLS:
            return self._crypto_derivatives
        raise AdapterNotImplemented(
            f"No derivatives adapter for '{symbol}'. "
            "Equity derivatives are a future vertical."
        )

    def execution(self, asset_class: AssetClass = AssetClass.CRYPTO) -> ExecutionAdapter:
        """Return the execution adapter for the given asset class."""
        if asset_class == AssetClass.CRYPTO:
            return self._paper_execution
        raise AdapterNotImplemented(
            f"No execution adapter for asset class '{asset_class}'. "
            "Live execution requires Phase 97 implementation."
        )

    # ── Introspection (for /api/adapters/status) ──────────────────────────────

    def status(self) -> list[dict]:
        """Return a registry snapshot for the status endpoint."""
        return [
            {
                "role":        "market_data",
                "asset_class": self._crypto_market_data.asset_class.value,
                "source":      self._crypto_market_data.source,
                "symbols":     list(_CRYPTO_SYMBOLS),
                "ready":       True,
            },
            {
                "role":        "derivatives",
                "asset_class": self._crypto_derivatives.asset_class.value,
                "source":      self._crypto_derivatives.source,
                "symbols":     list(_CRYPTO_SYMBOLS),
                "ready":       True,
            },
            {
                "role":        "execution",
                "asset_class": self._paper_execution.asset_class.value,
                "source":      self._paper_execution.source,
                "is_paper":    self._paper_execution.is_paper,
                "symbols":     list(_CRYPTO_SYMBOLS),
                "ready":       True,
            },
            {
                "role":        "market_data (stub)",
                "asset_class": AssetClass.EQUITY.value,
                "source":      self._equity_market_data.source,
                "symbols":     [],
                "ready":       False,
                "note":        "Equity vertical not yet implemented. See Phase 97+.",
            },
        ]


# Module-level singleton — import this everywhere.
adapter_registry = AdapterRegistry()
