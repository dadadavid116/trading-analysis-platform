"""
price_collector.py — Live BTC/USDT price collector with real-time upserts.

Connects to the Binance kline WebSocket stream and upserts the current candle
on EVERY tick — not just on candle close. This keeps the DB within ~250 ms
of the live Binance price at all times.

The upsert uses ON CONFLICT (symbol, timestamp) DO UPDATE, so:
  - Each tick within a 1-minute window overwrites the same row with the latest
    open, high, low, close, and volume values.
  - When the candle closes (kline["x"] == True), the final definitive values
    are written and the row becomes a permanent closed candle.
  - The next tick starts a new row at the next candle's timestamp.

Stream: wss://stream.binance.com:9443/ws/btcusdt@kline_1m
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets
from sqlalchemy.dialects.postgresql import insert

from app.database import AsyncSessionLocal
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)

STREAM_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"


async def run() -> None:
    """Connect to the Binance kline stream and upsert every tick."""
    logger.info("Price collector starting (live-tick mode)...")
    while True:
        try:
            async with websockets.connect(STREAM_URL) as ws:
                logger.info("Price collector: connected to Binance kline stream.")
                async for raw in ws:
                    msg = json.loads(raw)
                    kline = msg["k"]

                    # kline["T"] is the candle close time — constant for all
                    # ticks within the same 1-minute candle, so it's our upsert key.
                    ts = datetime.fromtimestamp(kline["T"] / 1000, tz=timezone.utc)

                    stmt = (
                        insert(PriceCandle)
                        .values(
                            symbol    = kline["s"],
                            timestamp = ts,
                            open      = float(kline["o"]),
                            high      = float(kline["h"]),
                            low       = float(kline["l"]),
                            close     = float(kline["c"]),
                            volume    = float(kline["v"]),
                        )
                        .on_conflict_do_update(
                            # Matches the unique index created on startup.
                            index_elements=["symbol", "timestamp"],
                            set_={
                                "open":   float(kline["o"]),
                                "high":   float(kline["h"]),
                                "low":    float(kline["l"]),
                                "close":  float(kline["c"]),
                                "volume": float(kline["v"]),
                            },
                        )
                    )

                    async with AsyncSessionLocal() as session:
                        await session.execute(stmt)
                        await session.commit()

                    if kline["x"]:
                        # Log only on candle close to avoid log spam.
                        logger.info(
                            "Candle closed: %s  close=%.2f  volume=%.4f",
                            kline["s"],
                            float(kline["c"]),
                            float(kline["v"]),
                        )

        except Exception as exc:
            logger.error("Price collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
