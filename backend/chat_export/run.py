"""
chat_export/run.py — Nightly chat history export worker.

Runs as a separate Docker service. At 00:00 UTC each day it:
  1. Exports yesterday's chat sessions to Markdown files.
  2. Deletes sessions older than CHAT_HISTORY_RETENTION_DAYS (default 60).

Export folder structure (bind-mounted volume):
  chat_history/
    Claude/        2026-04-09 Daily Log (Auto-Saved).md
    ChatGPT/       2026-04-09 Daily Log (Auto-Saved).md
    Grok/          2026-04-09 Daily Log (Auto-Saved).md
    Telegram/      2026-04-09 Daily Log (Auto-Saved).md

Usage:
    python -m chat_export.run
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.config import settings
from app.database import AsyncSessionLocal, engine, Base
from app.services.chat_history import export_day, prune_old_sessions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

CHAT_HISTORY_DIR = Path("/app/chat_history")

# Create the four chatbot subfolders on startup so they're always present.
_SUBFOLDERS = ["Claude", "ChatGPT", "Grok", "Telegram"]


def _seconds_until_midnight() -> float:
    """Return seconds from now until the next 00:00:00 UTC."""
    now     = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return (tomorrow - now).total_seconds()


async def _ensure_tables() -> None:
    import app.models.chat  # noqa: F401 — registers model with Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Table check complete.")


def _ensure_folders() -> None:
    for name in _SUBFOLDERS:
        (CHAT_HISTORY_DIR / name).mkdir(parents=True, exist_ok=True)
    logger.info("Chat history folders ready at %s", CHAT_HISTORY_DIR)


async def _run_export() -> None:
    yesterday = date.today() - timedelta(days=1)
    retention = settings.chat_history_retention_days
    logger.info("Running nightly export for %s (retention: %d days).", yesterday, retention)

    async with AsyncSessionLocal() as db:
        exported = await export_day(db, yesterday, CHAT_HISTORY_DIR)
        pruned   = await prune_old_sessions(db, retention)

    logger.info("Export complete — %d session(s) exported, %d pruned.", exported, pruned)


async def main() -> None:
    await _ensure_tables()
    _ensure_folders()

    logger.info("Chat export worker started. Waiting for next midnight UTC.")

    while True:
        wait = _seconds_until_midnight()
        logger.info("Next export in %.0f seconds (%.1f hours).", wait, wait / 3600)
        await asyncio.sleep(wait)
        await _run_export()


if __name__ == "__main__":
    asyncio.run(main())
