"""
liquidation_collector.py — Live BTC/USDT liquidation event collector.

Connects to the Binance Futures forceOrder stream and writes one row to
liquidations for every forced-liquidation event received.

Stream: wss://fstream.binance.com/ws/btcusdt@forceOrder

Note: liquidations only exist on the futures market, so this stream
comes from fstream.binance.com (futures), not stream.binance.com (spot).
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets

from app.database import AsyncSessionLocal
from app.models.liquidation import Liquidation

logger = logging.getLogger(__name__)

STREAM_URL = "wss://fstream.binance.com/ws/btcusdt@forceOrder"


async def run() -> None:
    """Connect to the Binance forceOrder stream and store each liquidation event."""
    logger.info("Liquidation collector starting...")
    while True:
        try:
            async with websockets.connect(STREAM_URL) as ws:
                logger.info("Liquidation collector: connected to Binance forceOrder stream.")
                async for raw in ws:
                    msg = json.loads(raw)
                    order = msg["o"]

                    liq = Liquidation(
                        symbol=order["s"],
                        timestamp=datetime.fromtimestamp(
                            order["T"] / 1000, tz=timezone.utc
                        ),
                        # Binance returns "BUY" or "SELL" — our schema stores lowercase.
                        side=order["S"].lower(),
                        price=float(order["p"]),
                        quantity=float(order["q"]),
                        exchange="binance",
                    )
                    async with AsyncSessionLocal() as session:
                        session.add(liq)
                        await session.commit()

                    logger.info(
                        "Liquidation stored: %s  side=%s  price=%.2f  qty=%.4f",
                        liq.symbol,
                        liq.side,
                        liq.price,
                        liq.quantity,
                    )

        except Exception as exc:
            logger.error("Liquidation collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
