"""
orderbook_collector.py — Live BTC/USDT order book snapshot collector.

Connects to the Binance partial depth stream (top 20 levels) and writes a
new snapshot row to orderbook_snapshots at most once every WRITE_INTERVAL
seconds. This prevents flooding the database with thousands of rows per hour.

Stream: wss://stream.binance.com:9443/ws/btcusdt@depth20

Binance pushes a full top-20 depth update roughly every second.
We store one snapshot every WRITE_INTERVAL seconds — the API always
returns the most recent row, so the frontend always sees fresh data.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import websockets

from app.database import AsyncSessionLocal
from app.models.orderbook import OrderBookSnapshot

logger = logging.getLogger(__name__)

STREAM_URL = "wss://stream.binance.com:9443/ws/btcusdt@depth20"

# Write a new snapshot at most once every N seconds.
# The stream updates ~every second; we do not need to store every frame.
WRITE_INTERVAL = 5.0


async def run() -> None:
    """Connect to the Binance depth20 stream and store throttled snapshots."""
    logger.info("Order book collector starting...")
    last_write: float = 0.0

    while True:
        try:
            async with websockets.connect(STREAM_URL) as ws:
                logger.info("Order book collector: connected to Binance depth20 stream.")
                async for raw in ws:
                    now = time.monotonic()
                    if now - last_write < WRITE_INTERVAL:
                        continue  # too soon — skip this frame
                    last_write = now

                    msg = json.loads(raw)

                    # Binance returns prices and quantities as strings — convert to float
                    # so the stored format matches the List[List[float]] schema.
                    bids = [[float(p), float(q)] for p, q in msg["bids"]]
                    asks = [[float(p), float(q)] for p, q in msg["asks"]]

                    snapshot = OrderBookSnapshot(
                        symbol="BTCUSDT",
                        timestamp=datetime.now(tz=timezone.utc),
                        bids=bids,
                        asks=asks,
                    )
                    async with AsyncSessionLocal() as session:
                        session.add(snapshot)
                        await session.commit()

                    logger.info("Order book snapshot stored.")

        except Exception as exc:
            logger.error("Order book collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
