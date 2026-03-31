"""
run_all.py — Entry point that starts all three collectors concurrently.

Each collector runs its own infinite reconnect loop, so if one stream
drops the others keep running independently.

Usage (from the repo root or from within the backend container):
    python -m collectors.run_all

This module is used as the CMD override for the `collector` Docker Compose service.
"""

import asyncio
import logging

from collectors.liquidation_collector import run as run_liquidations
from collectors.orderbook_collector import run as run_orderbook
from collectors.price_collector import run as run_price

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Starting all collectors...")
    # Run all three collectors concurrently.
    # asyncio.gather keeps them all alive — if one reconnects the others are unaffected.
    await asyncio.gather(
        run_price(),
        run_liquidations(),
        run_orderbook(),
    )


if __name__ == "__main__":
    asyncio.run(main())
