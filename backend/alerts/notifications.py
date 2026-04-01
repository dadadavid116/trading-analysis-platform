"""
alerts/notifications.py — Send notifications when an alert triggers.

Always logs the trigger to the alerts worker output.
Also sends a Telegram message if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
are set in .env (Phase 10).

If Telegram credentials are missing or the send fails, the error is logged
and the alert trigger is still recorded in the database.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def notify(alert_name: str, condition: str, message: str) -> None:
    """Log an alert trigger and send a Telegram message if configured."""
    logger.warning(
        "ALERT TRIGGERED: [%s] %s — %s",
        alert_name,
        condition,
        message,
    )

    token   = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    if not token or not chat_id:
        return

    text = f"\U0001f6a8 Alert: {alert_name}\n{message}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
            resp.raise_for_status()
    except Exception as exc:
        logger.error("Failed to send Telegram notification: %s", exc)
