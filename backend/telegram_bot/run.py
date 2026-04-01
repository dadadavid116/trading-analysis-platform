"""
run.py — Entry point for the Telegram bot service.

Starts the bot using long polling (getUpdates).
No public webhook URL is required — this works for both local development
and VPS deployment behind Caddy.

Usage:
    python -m telegram_bot.run

This is the CMD used by the `telegram` Docker Compose service.
Set TELEGRAM_BOT_TOKEN in .env to enable the bot.

If TELEGRAM_BOT_TOKEN is not set, the service waits and logs a warning every
hour. Restart after setting the token to activate the bot.
"""

import asyncio
import logging

from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  [%(levelname)s]  %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)


async def _wait_for_token() -> None:
    """Log a periodic reminder and wait — the container stays alive."""
    logger.warning(
        "TELEGRAM_BOT_TOKEN is not set. "
        "The Telegram bot is inactive. "
        "Set TELEGRAM_BOT_TOKEN in .env and restart the telegram service to enable it."
    )
    while True:
        await asyncio.sleep(3600)
        logger.info(
            "Telegram bot is still waiting for TELEGRAM_BOT_TOKEN to be configured."
        )


def main() -> None:
    if not settings.telegram_bot_token:
        asyncio.run(_wait_for_token())
        return

    from telegram_bot.bot import build_application

    logger.info("Starting Telegram bot (long polling mode)...")
    app = build_application()
    # run_polling manages its own event loop — no asyncio.run() needed.
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
