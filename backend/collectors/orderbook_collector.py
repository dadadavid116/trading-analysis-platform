"""
orderbook_collector.py — Multi-symbol order book collector via OKX WebSocket.

Subscribes to the books5 channel (top 5 depth levels) for BTC/ETH/SOL
USDT-SWAP perpetuals and stores a throttled snapshot for each symbol.

OKX books5 data format (snapshot on every update, ~100 ms for futures):
  {"arg": {"channel": "books5", "instId": "BTC-USDT-SWAP"},
   "data": [{"bids": [["price", "sz", "0", "n"], ...],
             "asks": [...], "ts": "..."}]}

Each bid/ask entry is [price, size, deprecated_field, order_count].
We store only [price, size] to match the existing schema.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone

import websockets
from sqlalchemy import delete

from app.database import AsyncSessionLocal
from app.models.orderbook import OrderBookSnapshot

logger = logging.getLogger(__name__)

OKX_WS_URL   = "wss://ws.okx.com:8443/ws/v5/public"
INSTRUMENTS  = ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP"]
SYMBOL_MAP   = {
    "BTC-USDT-SWAP": "BTCUSDT",
    "ETH-USDT-SWAP": "ETHUSDT",
    "SOL-USDT-SWAP": "SOLUSDT",
}

_SUBSCRIBE = json.dumps({
    "op": "subscribe",
    "args": [{"channel": "books5", "instId": inst} for inst in INSTRUMENTS],
})

WRITE_INTERVAL   = 5.0   # minimum seconds between stored snapshots per symbol
PRUNE_KEEP_HOURS = 24


async def run() -> None:
    logger.info("Order book collector starting (OKX multi-symbol mode)...")
    # Per-symbol throttle timestamps
    last_write: dict[str, float] = {sym: 0.0 for sym in SYMBOL_MAP.values()}

    while True:
        try:
            async with websockets.connect(OKX_WS_URL) as ws:
                await ws.send(_SUBSCRIBE)
                logger.info("Order book collector: subscribed to OKX books5.")

                async for raw in ws:
                    if raw == "ping":
                        await ws.send("pong")
                        continue

                    msg = json.loads(raw)
                    if "event" in msg:
                        continue

                    inst_id   = msg.get("arg", {}).get("instId", "")
                    canonical = SYMBOL_MAP.get(inst_id)
                    data      = msg.get("data", [])
                    if not canonical or not data:
                        continue

                    now = time.monotonic()
                    if now - last_write[canonical] < WRITE_INTERVAL:
                        continue
                    last_write[canonical] = now

                    book = data[0]
                    bids = [[float(b[0]), float(b[1])] for b in book.get("bids", [])]
                    asks = [[float(a[0]), float(a[1])] for a in book.get("asks", [])]

                    cutoff   = datetime.now(tz=timezone.utc) - timedelta(hours=PRUNE_KEEP_HOURS)
                    snapshot = OrderBookSnapshot(
                        symbol    = canonical,
                        timestamp = datetime.now(tz=timezone.utc),
                        bids      = bids,
                        asks      = asks,
                    )
                    async with AsyncSessionLocal() as session:
                        session.add(snapshot)
                        await session.execute(
                            delete(OrderBookSnapshot).where(
                                OrderBookSnapshot.timestamp < cutoff,
                                OrderBookSnapshot.symbol == canonical,
                            )
                        )
                        await session.commit()

                    logger.info("Order book snapshot stored: %s", canonical)

        except Exception as exc:
            logger.error("Order book collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
