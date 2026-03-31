"""
alerts/notifications.py — Send notifications when an alert triggers.

Currently logs a warning message only.
[Later] Add Telegram integration using ALERT_TELEGRAM_TOKEN and
ALERT_TELEGRAM_CHAT_ID from the environment.
"""

import logging

logger = logging.getLogger(__name__)


async def notify(alert_name: str, condition: str, message: str) -> None:
    """Log an alert trigger. Replace or extend this to send real notifications."""
    logger.warning(
        "ALERT TRIGGERED: [%s] %s — %s",
        alert_name,
        condition,
        message,
    )
    # [Later] Telegram:
    # token   = settings.alert_telegram_token
    # chat_id = settings.alert_telegram_chat_id
    # if token and chat_id:
    #     async with httpx.AsyncClient() as client:
    #         await client.post(
    #             f"https://api.telegram.org/bot{token}/sendMessage",
    #             json={"chat_id": chat_id, "text": f"🚨 {alert_name}: {message}"},
    #         )
