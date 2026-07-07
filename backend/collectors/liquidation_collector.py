"""
liquidation_collector.py — Multi-symbol liquidation collector via Bybit WebSocket.

Subscribes to Bybit's public `liquidation.<SYMBOL>` topics for each tracked symbol
(BTCUSDT, ETHUSDT, SOLUSDT).  Bybit uses standard port 443, which is accessible
from most VPS providers.

Bybit message format:
  {
    "topic": "liquidation.BTCUSDT",
    "ts":    1715161395596,
    "type":  "snapshot",
    "data": {
      "symbol":      "BTCUSDT",
      "side":        "Sell",        # "Sell" = long liq'd, "Buy" = short liq'd
      "size":        "0.001",       # quantity in base currency
      "price":       "61017.00",    # liquidation / bankruptcy price
      "updatedTime": 1715161395589  # event timestamp in ms
    }
  }

Bybit sends a JSON heartbeat {"op":"ping"} every 20 s — we reply {"op":"pong"}.
A 35 s receive timeout detects silent hangs and forces a reconnect.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets

from app.database import AsyncSessionLocal
from app.models.liquidation import Liquidation
from app.services.symbol_registry import load_active_canonical

logger = logging.getLogger(__name__)

BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/linear"


async def _store(symbol: str, side: str, price: float, qty: float, ts_ms: int) -> None:
    liq = Liquidation(
        symbol    = symbol,
        timestamp = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc),
        side      = side,
        price     = price,
        quantity  = qty,
        exchange  = "bybit",
    )
    async with AsyncSessionLocal() as session:
        session.add(liq)
        await session.commit()
    logger.info("Liquidation: %s  side=%s  price=%.2f  qty=%.4f", symbol, side, price, qty)


async def run() -> None:
    symbols = await load_active_canonical()
    # Bybit topic names match canonical symbols directly (BTCUSDT, ETHUSDT, SOLUSDT)
    sub_args      = [f"liquidation.{sym}" for sym in symbols]
    subscribe_msg = json.dumps({"op": "subscribe", "args": sub_args})
    symbols_set   = set(symbols)

    logger.info(
        "Liquidation collector starting (Bybit WebSocket, topics=%s)...",
        sub_args,
    )

    while True:
        try:
            async with websockets.connect(BYBIT_WS_URL) as ws:
                await ws.send(subscribe_msg)
                logger.info("Liquidation collector: subscribed to Bybit %s.", sub_args)

                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=35.0)
                    except asyncio.TimeoutError:
                        # Send a keepalive ping; Bybit disconnects after ~30 s of silence
                        logger.debug("Liquidation WS: timeout — sending keepalive ping.")
                        await ws.send(json.dumps({"op": "ping"}))
                        continue

                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    # Respond to server heartbeat pings
                    if msg.get("op") == "ping":
                        await ws.send(json.dumps({"op": "pong"}))
                        continue

                    # Ignore pong echoes, subscribe acks, and other control messages
                    if "topic" not in msg:
                        logger.debug("Liquidation WS control message: %s", msg)
                        continue

                    topic = msg.get("topic", "")
                    if not topic.startswith("liquidation."):
                        continue

                    data   = msg.get("data", {})
                    symbol = data.get("symbol", "")
                    if symbol not in symbols_set:
                        continue

                    side_raw = data.get("side", "")
                    # Bybit convention: "Sell" order closed a long position (bearish liq)
                    #                   "Buy"  order closed a short position (bullish liq)
                    side  = "sell" if side_raw == "Sell" else "buy"
                    price = float(data.get("price", 0))
                    qty   = float(data.get("size",  0))
                    ts_ms = int(data.get("updatedTime", 0)) or int(msg.get("ts", 0))

                    if price <= 0 or qty <= 0:
                        continue

                    try:
                        await _store(symbol, side, price, qty, ts_ms)
                    except Exception as exc:
                        logger.error("Error storing liquidation: %s", exc)

        except Exception as exc:
            logger.error("Liquidation collector error: %s — reconnecting in 5 s.", exc)

        await asyncio.sleep(5)
