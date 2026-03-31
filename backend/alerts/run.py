"""
run.py — Entry point for the alerts evaluation service.

Runs the alert evaluator on a configurable interval.

Usage:
    python -m alerts.run

This is the CMD used by the `alerts` Docker Compose service.
The interval is controlled by ALERT_EVALUATION_INTERVAL_MINUTES in .env (default: 1).
"""

import asyncio
import logging

from alerts.evaluator import evaluate_all
from app.config import settings
from app.database import engine, Base

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


async def _ensure_tables() -> None:
    """Create the alerts table if it does not exist yet.

    Normally the api service creates all tables on startup, but if the alerts
    worker starts before the api is ready we create them here as a fallback.
    """
    import app.models.alert  # noqa: F401 — registers model with Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Table check complete.")


async def main() -> None:
    await _ensure_tables()

    interval = settings.alert_evaluation_interval_minutes
    logger.info(
        "Alerts worker starting. Evaluating every %d minute(s).",
        interval,
    )

    while True:
        await evaluate_all()
        await asyncio.sleep(interval * 60)


if __name__ == "__main__":
    asyncio.run(main())
