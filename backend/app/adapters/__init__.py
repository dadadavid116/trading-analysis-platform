"""
app/adapters — Cross-asset adapter interfaces (Phase 94).

Provides a clean seam between the platform core and external data sources /
execution venues. Crypto is the current live asset class; equities/options
are future verticals that slot in without touching core logic.

Usage:
    from app.adapters.registry import adapter_registry
    adapter = adapter_registry.market_data("BTCUSDT")
    tick = await adapter.get_latest_price("BTCUSDT")
"""

from app.adapters.base import (
    AssetClass,
    PriceTick,
    OHLCVBar,
    FundingInfo,
    LiquidationEvent,
    MarketDataAdapter,
    DerivativesAdapter,
    NewsAdapter,
    ExecutionAdapter,
    AdapterNotImplemented,
)
from app.adapters.registry import adapter_registry

__all__ = [
    "AssetClass",
    "PriceTick",
    "OHLCVBar",
    "FundingInfo",
    "LiquidationEvent",
    "MarketDataAdapter",
    "DerivativesAdapter",
    "NewsAdapter",
    "ExecutionAdapter",
    "AdapterNotImplemented",
    "adapter_registry",
]
