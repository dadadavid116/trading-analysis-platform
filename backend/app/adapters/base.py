"""
adapters/base.py — Abstract base classes and shared dataclasses (Phase 94).

All concrete adapters inherit from these ABCs.  The platform core depends only
on the interfaces here, never on a specific exchange or data provider.

Asset classes:
    crypto   — spot / perpetual swaps (OKX, Binance) — current live class
    equity   — stocks / ETFs (future vertical, stub only)
    options  — options chains (future vertical, stub only)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class AssetClass(str, Enum):
    CRYPTO  = "crypto"
    EQUITY  = "equity"
    OPTIONS = "options"


class AdapterNotImplemented(NotImplementedError):
    """Raised by stub adapters for asset classes not yet supported."""


# ── Shared data transfer objects ───────────────────────────────────────────────

@dataclass
class PriceTick:
    symbol:    str
    close:     float
    open:      float
    high:      float
    low:       float
    volume:    float
    timestamp: datetime
    source:    str


@dataclass
class OHLCVBar:
    timestamp: datetime
    open:      float
    high:      float
    low:       float
    close:     float
    volume:    float


@dataclass
class FundingInfo:
    symbol:       str
    rate:         float            # e.g. 0.0001 = 0.01%
    annualized:   float            # rate * 3 * 365 * 100  (%)
    next_funding: Optional[datetime]
    source:       str


@dataclass
class LiquidationEvent:
    symbol:    str
    side:      str                 # "long" | "short"
    price:     float
    quantity:  float
    timestamp: datetime
    source:    str


# ── Abstract base adapters ─────────────────────────────────────────────────────

class MarketDataAdapter(ABC):
    """
    Provides price and OHLCV candle data for a set of symbols.
    Concrete implementations read from the platform DB (backed by collectors)
    or make direct exchange API calls for on-demand use.
    """
    asset_class: AssetClass = AssetClass.CRYPTO
    source:      str        = "unknown"
    symbols:     list[str]  = field(default_factory=list)

    @abstractmethod
    async def get_latest_price(self, symbol: str) -> Optional[PriceTick]:
        """Return the most recent price tick for the given symbol."""

    @abstractmethod
    async def get_candles(
        self,
        symbol:   str,
        interval: str = "1m",
        limit:    int = 100,
    ) -> list[OHLCVBar]:
        """Return up to `limit` OHLCV bars, most-recent-last."""

    def supports(self, symbol: str) -> bool:
        """True if this adapter can serve the given symbol."""
        return symbol in self.symbols or not self.symbols


class DerivativesAdapter(ABC):
    """
    Provides perpetual-swap / futures derivative data.
    """
    asset_class: AssetClass = AssetClass.CRYPTO
    source:      str        = "unknown"

    @abstractmethod
    async def get_funding_rate(self, symbol: str) -> Optional[FundingInfo]:
        """Return the latest funding rate for the given perp symbol."""

    @abstractmethod
    async def get_open_interest(self, symbol: str) -> Optional[float]:
        """Return latest open interest in USD for the given perp symbol."""

    @abstractmethod
    async def get_recent_liquidations(
        self, symbol: str, limit: int = 20
    ) -> list[LiquidationEvent]:
        """Return recent liquidation events for the given symbol."""


class NewsAdapter(ABC):
    """
    Provides news headlines and catalyst data.
    """
    source: str = "unknown"

    @abstractmethod
    async def get_headlines(
        self,
        symbol: Optional[str] = None,
        limit:  int = 20,
    ) -> list[dict]:
        """
        Return recent news headlines.
        Each dict has at minimum: title, url, published_at, source.
        """


class ExecutionAdapter(ABC):
    """
    Execution venue interface — currently paper-only.
    Live implementations for OKX / Binance will satisfy this interface in Phase 97.
    All live implementations must implement safety_checks() which blocks trading
    unless explicit pre-conditions are met.
    """
    asset_class: AssetClass = AssetClass.CRYPTO
    source:      str        = "unknown"
    is_paper:    bool       = True    # False only for live venue adapters (Phase 97+)

    @abstractmethod
    async def place_order(
        self,
        symbol:    str,
        direction: str,       # "long" | "short"
        size_usd:  float,
        order_type: str = "market",
        stop_loss:  Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> dict:
        """Submit an order. Returns a venue order dict."""

    @abstractmethod
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel an open order. Returns True if cancelled."""

    @abstractmethod
    async def get_open_orders(self, symbol: Optional[str] = None) -> list[dict]:
        """Return all open orders, optionally filtered by symbol."""

    @abstractmethod
    async def safety_checks(self) -> list[str]:
        """
        Run pre-execution safety checks.
        Returns a list of blocking issues (empty = safe to trade).
        """
