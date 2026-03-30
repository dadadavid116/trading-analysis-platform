"""
collectors package — PLACEHOLDER

This package will contain long-running async data collection workers
that stream live market data from exchange APIs (Binance WebSocket).

Planned files (Phase 5 — Live collectors):
    base.py                  — Shared base class for all collectors [Later]
    price_collector.py       — Streams 1-minute OHLCV candles
    liquidation_collector.py — Streams liquidation events
    orderbook_collector.py   — Captures order-book snapshots

Collectors run as standalone async processes, not as part of the
HTTP server. They are started via a separate Docker Compose service.

Nothing is implemented here yet.
"""
