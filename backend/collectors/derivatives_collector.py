"""
collectors/derivatives_collector.py — REST polling for Binance Futures derivatives data.

Three independent polling loops, each with its own retry/reconnect logic:

  funding_rate_loop   — polls /fapi/v1/premiumIndex every 30 min
  open_interest_loop  — polls /fapi/v1/openInterest every 5 min
  ls_ratio_loop       — polls /futures/data/topLongShortAccountRatio
                        and globalLongShortAccountRatio every 15 min

All endpoints are public (no API key required).
"""

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.database import AsyncSessionLocal
from app.models.derivatives import FundingRate, OpenInterest, LSRatio

logger = logging.getLogger(__name__)

FAPI_BASE = "https://fapi.binance.com"


async def funding_rate_loop() -> None:
    logger.info("Funding rate collector starting...")
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{FAPI_BASE}/fapi/v1/premiumIndex",
                    params={"symbol": "BTCUSDT"},
                )
                resp.raise_for_status()
                data = resp.json()

            async with AsyncSessionLocal() as session:
                session.add(FundingRate(
                    symbol       = "BTCUSDT",
                    timestamp    = datetime.now(timezone.utc),
                    funding_rate = float(data["lastFundingRate"]),
                    mark_price   = float(data["markPrice"]),
                    index_price  = float(data["indexPrice"]),
                    exchange     = "binance",
                ))
                await session.commit()

            logger.info(
                "Funding rate: %+.6f%%, mark=%.2f, index=%.2f",
                float(data["lastFundingRate"]) * 100,
                float(data["markPrice"]),
                float(data["indexPrice"]),
            )
            await asyncio.sleep(30 * 60)

        except Exception as exc:
            logger.error("Funding rate collector error: %s — retrying in 60 s.", exc)
            await asyncio.sleep(60)


async def open_interest_loop() -> None:
    logger.info("Open interest collector starting...")
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{FAPI_BASE}/fapi/v1/openInterest",
                    params={"symbol": "BTCUSDT"},
                )
                resp.raise_for_status()
                data = resp.json()

            ts = datetime.fromtimestamp(int(data["time"]) / 1000, tz=timezone.utc)
            oi = float(data["openInterest"])

            async with AsyncSessionLocal() as session:
                session.add(OpenInterest(
                    symbol    = "BTCUSDT",
                    timestamp = ts,
                    oi_value  = oi,
                    exchange  = "binance",
                ))
                await session.commit()

            logger.info("Open interest: %.2f BTC", oi)
            await asyncio.sleep(5 * 60)

        except Exception as exc:
            logger.error("Open interest collector error: %s — retrying in 30 s.", exc)
            await asyncio.sleep(30)


async def ls_ratio_loop() -> None:
    logger.info("L/S ratio collector starting...")
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                top_resp = await client.get(
                    f"{FAPI_BASE}/futures/data/topLongShortAccountRatio",
                    params={"symbol": "BTCUSDT", "period": "5m", "limit": 1},
                )
                top_resp.raise_for_status()

                global_resp = await client.get(
                    f"{FAPI_BASE}/futures/data/globalLongShortAccountRatio",
                    params={"symbol": "BTCUSDT", "period": "5m", "limit": 1},
                )
                global_resp.raise_for_status()

            rows = []
            for raw, ratio_type in [
                (top_resp.json(),    "top_account"),
                (global_resp.json(), "global_account"),
            ]:
                if raw:
                    d = raw[0]
                    rows.append(LSRatio(
                        symbol      = "BTCUSDT",
                        timestamp   = datetime.fromtimestamp(int(d["timestamp"]) / 1000, tz=timezone.utc),
                        long_ratio  = float(d["longAccount"]),
                        short_ratio = float(d["shortAccount"]),
                        ratio_type  = ratio_type,
                        exchange    = "binance",
                    ))

            if rows:
                async with AsyncSessionLocal() as session:
                    session.add_all(rows)
                    await session.commit()

            if rows:
                logger.info(
                    "L/S ratios — top: long=%.1f%%, global: long=%.1f%%",
                    float(top_resp.json()[0]["longAccount"]) * 100,
                    float(global_resp.json()[0]["longAccount"]) * 100,
                )

            await asyncio.sleep(15 * 60)

        except Exception as exc:
            logger.error("L/S ratio collector error: %s — retrying in 60 s.", exc)
            await asyncio.sleep(60)


async def run() -> None:
    """Run all three derivatives collectors concurrently."""
    await asyncio.gather(
        funding_rate_loop(),
        open_interest_loop(),
        ls_ratio_loop(),
    )
