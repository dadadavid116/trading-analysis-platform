"""
price_collector.py — Multi-symbol live price collector via OKX WebSocket.

Primary source: OKX perpetual swap contracts (BTC/ETH/SOL USDT-SWAP).
Subscribes to the candle1m channel and upserts on every tick so the DB
stays within ~1 second of the live OKX price.

OKX candle1m data format:
  [ts_ms, open, high, low, close, vol_contracts, vol_ccy, vol_ccy_quote, confirm]
  confirm == "1" means the candle has closed; "0" means it is still live.

The upsert key is (symbol, timestamp) matching the unique index created on startup.
OKX sends a plain-text "ping" every 30 s — we reply "pong" to keep the connection.
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

OKX_WS_URL  = "wss://ws.okx.com:8443/ws/v5/public"
INSTRUMENTS = ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP"]
SYMBOL_MAP  = {
    "BTC-USDT-SWAP": "BTCUSDT",
    "ETH-USDT-SWAP": "ETHUSDT",
    "SOL-USDT-SWAP": "SOLUSDT",
}

_SUBSCRIBE = json.dumps({
    "op": "subscribe",
    "args": [{"channel": "candle1m", "instId": inst} for inst in INSTRUMENTS],
})


async def run() -> None:
    logger.info("Price collector starting (OKX multi-symbol, instruments=%s)...", INSTRUMENTS)
    while True:
        try:
            async with websockets.connect(OKX_WS_URL) as ws:
                await ws.send(_SUBSCRIBE)
                logger.info("Price collector: subscribed to OKX candle1m.")

                async for raw in ws:
                    # OKX keepalive — reply to avoid server-side disconnect
                    if raw == "ping":
                        await ws.send("pong")
                        continue

                    msg = json.loads(raw)

                    # Skip subscription confirm / error events
                    if "event" in msg:
                        continue

                    inst_id   = msg.get("arg", {}).get("instId", "")
                    canonical = SYMBOL_MAP.get(inst_id)
                    data      = msg.get("data", [])
                    if not canonical or not data:
                        continue

                    for candle in data:
                        # [ts_ms, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
                        ts        = datetime.fromtimestamp(int(candle[0]) / 1000, tz=timezone.utc)
                        is_closed = candle[8] == "1"

                        stmt = (
                            insert(PriceCandle)
                            .values(
                                symbol    = canonical,
                                timestamp = ts,
                                open      = float(candle[1]),
                                high      = float(candle[2]),
                                low       = float(candle[3]),
                                close     = float(candle[4]),
                                volume    = float(candle[5]),
                            )
                            .on_conflict_do_update(
                                index_elements=["symbol", "timestamp"],
                                set_={
                                    "open":   float(candle[1]),
                                    "high":   float(candle[2]),
                                    "low":    float(candle[3]),
                                    "close":  float(candle[4]),
                                    "volume": float(candle[5]),
                                },
                            )
                        )

                        async with AsyncSessionLocal() as session:
                            await session.execute(stmt)
                            await session.commit()

                        if is_closed:
                            logger.info(
                                "Candle closed: %s  close=%.4f  vol=%.2f",
                                canonical, float(candle[4]), float(candle[5]),
                            )

        except Exception as exc:
            logger.error("Price collector error: %s — reconnecting in 5 s.", exc)
            await asyncio.sleep(5)
