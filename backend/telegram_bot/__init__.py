"""
telegram_bot package — Telegram bot service (Phase 10).

Provides:
  - /start    — welcome message
  - /help     — list of available commands
  - /status   — platform data freshness summary
  - /price    — latest BTC price candle
  - /analysis — latest Claude-generated market summary
  - /alerts   — configured alert rules and their current state

Alert notifications are sent here when an alert fires (see alerts/notifications.py).

Entry point:
    python -m telegram_bot.run

Requires TELEGRAM_BOT_TOKEN in .env (from @BotFather).
TELEGRAM_CHAT_ID is used for alert notification routing.
If the token is missing, the service logs a warning and waits — no crash.

Uses long polling (getUpdates). Webhook mode is intentionally deferred.

What is deferred to later phases:
  - Telegram Mini App
  - Webhook mode
  - Richer control commands (alert creation, config changes from Telegram)
  - Multi-agent routing
"""
