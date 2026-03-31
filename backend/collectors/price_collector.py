"""
price_collector.py — Live BTC/USDT 1-minute candle collector.

Connects to the Binance kline WebSocket stream and writes a new row to
price_candles each time a 1-minute candle closes.

Stream: wss://stream.binance.com:9443/ws/btcusdt@kline_1m

A new row is inserted once per minute (on candle close).
Open/in-progress candles are ignored so the table stays clean.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets

from app.database import AsyncSessionLocal
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)

STREAM_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"


async def run() -> None:
    """Connect to the Binance kline stream and store closed candles."""
    logger.info("Price collector starting...")
    while True:
        try:
            async with websockets.connect(STREAM_URL) as ws:
                logger.info("Price collector: connected to Binance kline stream.")
                async for raw in ws:
                    msg = json.loads(raw)
                    kline = msg["k"]

                    # kline["x"] is True only when the candle has closed.
                    # Skip updates for the still-open candle — we only want finals.
                    if not kline["x"]:
                        continue

                    candle = PriceCandle(
                        symbol=kline["s"],
                        timestamp=datetime.fromtimestamp(
                            kline["t"] / 1000, tz=timezone.utc
                        ),
                        open=float(kline["o"]),
                        high=float(kline["h"]),
                        low=float(kline["l"]),
                        close=float(kline["c"]),
                        volume=float(kline["v"]),
                    )
                    async with AsyncSessionLocal() as session:
                        session.add(candle)
                        await session.commit()

                    logger.info(
                        "Candle stored: %s  close=%.2f  volume=%.4f",
                        candle.symbol,
                        candle.close,
                        candle.volume,
                    )

        except Exception as exc:
            logger.error("Price collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
