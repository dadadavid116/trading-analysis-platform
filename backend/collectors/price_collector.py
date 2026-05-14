"""
price_collector.py — Multi-symbol live price collector via OKX REST polling.

Polls the OKX candles REST endpoint every 10 s for BTC/ETH/SOL USDT-SWAP.
Switching from WebSocket to REST eliminates the silent-hang failure mode where
the server keeps the WS connection open but stops sending frames, causing the
collector to block indefinitely without triggering the reconnect logic.

The same OKX endpoint is used by /api/price/klines so its reachability from
this VPS is already proven.
"""

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.dialects.postgresql import insert

from app.database import AsyncSessionLocal
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)

OKX_CANDLES_URL = "https://www.okx.com/api/v5/market/candles"

INSTRUMENTS: dict[str, str] = {
    "BTC-USDT-SWAP": "BTCUSDT",
    "ETH-USDT-SWAP": "ETHUSDT",
    "SOL-USDT-SWAP": "SOLUSDT",
}

POLL_INTERVAL = 10  # seconds between polls


async def _upsert(canonical: str, candle: list) -> None:
    # Store close time (open_ts + 60 s) to keep MAX(timestamp) ≤ 70 s old.
    ts = datetime.fromtimestamp((int(candle[0]) + 60_000) / 1000, tz=timezone.utc)
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


async def _poll_one(client: httpx.AsyncClient, inst_id: str, canonical: str) -> None:
    try:
        resp = await client.get(
            OKX_CANDLES_URL,
            params={"instId": inst_id, "bar": "1m", "limit": "2"},
            timeout=8.0,
        )
        resp.raise_for_status()
        for candle in resp.json().get("data", []):
            await _upsert(canonical, candle)
    except Exception as exc:
        logger.error("Price poll error [%s]: %s", inst_id, exc)


async def run() -> None:
    logger.info(
        "Price collector starting (OKX REST polling every %d s, symbols=%s)...",
        POLL_INTERVAL,
        list(INSTRUMENTS.values()),
    )
    while True:
        try:
            async with httpx.AsyncClient() as client:
                await asyncio.gather(*[
                    _poll_one(client, inst_id, canonical)
                    for inst_id, canonical in INSTRUMENTS.items()
                ])
        except Exception as exc:
            logger.error("Price collector outer error: %s", exc)
        await asyncio.sleep(POLL_INTERVAL)
