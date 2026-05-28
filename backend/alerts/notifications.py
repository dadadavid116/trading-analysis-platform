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


async def notify(
    alert_name: str,
    condition:  str,
    message:    str,
    webhook_url: str | None = None,
) -> None:
    """Log an alert trigger, send Telegram (if configured), and fire any webhook."""
    logger.warning(
        "ALERT TRIGGERED: [%s] %s — %s",
        alert_name,
        condition,
        message,
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        # ── Telegram ──────────────────────────────────────────────────────────
        token   = settings.telegram_bot_token
        chat_id = settings.telegram_chat_id
        if token and chat_id:
            tg_text = f"\U0001f6a8 Alert: {alert_name}\n{message}"
            try:
                resp = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": tg_text},
                )
                resp.raise_for_status()
            except Exception as exc:
                logger.error("Failed to send Telegram notification: %s", exc)

        # ── Custom webhook ────────────────────────────────────────────────────
        if webhook_url:
            payload = {
                "alert_name": alert_name,
                "condition":  condition,
                "message":    message,
            }
            try:
                resp = await client.post(webhook_url, json=payload)
                resp.raise_for_status()
                logger.info("Webhook delivered to %s (HTTP %d)", webhook_url, resp.status_code)
            except Exception as exc:
                logger.error("Failed to deliver webhook to %s: %s", webhook_url, exc)
