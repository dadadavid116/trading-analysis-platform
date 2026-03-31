"""
run.py — Entry point for the analysis worker service.

Generates an AI market summary on startup (after a short delay), then
repeats on a configurable schedule.

Usage:
    python -m analysis.run

This is the CMD used by the `analysis` Docker Compose service.
The interval is controlled by ANALYSIS_INTERVAL_MINUTES in .env (default: 10).
"""

import asyncio
import logging

from analysis.claude_client import generate_and_store
from app.config import settings
from app.database import engine, Base

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

# Short startup delay so the collectors have time to ingest their first data
# before the first analysis attempt.
STARTUP_DELAY_SECONDS = 30


async def _ensure_tables() -> None:
    """Create the analysis_summaries table if it does not exist yet.

    Normally the api service creates all tables on startup, but if the analysis
    worker starts before the api is ready we create them here as a fallback.
    """
    import app.models.analysis  # noqa: F401 — registers model with Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Table check complete.")


async def main() -> None:
    await _ensure_tables()

    interval = settings.analysis_interval_minutes
    logger.info(
        "Analysis worker starting. Interval: %d min. First run in %d s...",
        interval,
        STARTUP_DELAY_SECONDS,
    )
    await asyncio.sleep(STARTUP_DELAY_SECONDS)

    while True:
        await generate_and_store()
        logger.info("Next analysis in %d minutes.", interval)
        await asyncio.sleep(interval * 60)


if __name__ == "__main__":
    asyncio.run(main())
