"""
liquidation_collector.py — Multi-symbol liquidation collector via Binance Futures.

Uses the Binance Futures combined stream to receive forced-liquidation events
for BTC, ETH, and SOL USDT perpetual futures simultaneously.

Combined stream URL:
  wss://fstream.binance.com/stream?streams=btcusdt@forceOrder/ethusdt@forceOrder/solusdt@forceOrder

Each message is wrapped by the combined stream multiplexer:
  {"stream": "btcusdt@forceOrder", "data": {"e": "forceOrder", "o": {...}}}
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets

from app.database import AsyncSessionLocal
from app.models.liquidation import Liquidation

logger = logging.getLogger(__name__)

_SYMBOLS   = ["btcusdt", "ethusdt", "solusdt"]
STREAM_URL = "wss://fstream.binance.com/stream?streams=" + "/".join(
    f"{s}@forceOrder" for s in _SYMBOLS
)


async def run() -> None:
    logger.info("Liquidation collector starting (multi-symbol: %s)...", _SYMBOLS)
    while True:
        try:
            async with websockets.connect(STREAM_URL) as ws:
                logger.info("Liquidation collector: connected to Binance combined forceOrder stream.")
                async for raw in ws:
                    msg   = json.loads(raw)
                    # Combined stream wraps each payload under "data"
                    order = msg.get("data", {}).get("o") or msg.get("o")
                    if not order:
                        continue

                    liq = Liquidation(
                        symbol    = order["s"],
                        timestamp = datetime.fromtimestamp(order["T"] / 1000, tz=timezone.utc),
                        side      = order["S"].lower(),
                        price     = float(order["p"]),
                        quantity  = float(order["q"]),
                        exchange  = "binance",
                    )
                    async with AsyncSessionLocal() as session:
                        session.add(liq)
                        await session.commit()

                    logger.info(
                        "Liquidation: %s  side=%s  price=%.4f  qty=%.4f",
                        liq.symbol, liq.side, liq.price, liq.quantity,
                    )

        except Exception as exc:
            logger.error("Liquidation collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
