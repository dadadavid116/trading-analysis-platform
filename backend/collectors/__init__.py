"""
collectors — Live market data collection workers.

    price_collector.py       — Streams 1-minute OHLCV candles from Binance
    liquidation_collector.py — Streams liquidation events from Binance Futures
    orderbook_collector.py   — Captures BTC order book snapshots from Binance
    run_all.py               — Entry point: runs all three collectors concurrently

Start via Docker Compose (collector service) or directly:
    python -m collectors.run_all
"""
