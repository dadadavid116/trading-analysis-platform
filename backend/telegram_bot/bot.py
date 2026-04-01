"""
telegram_bot/bot.py — Command handlers and Application setup.

Access restriction:
    All commands are restricted to the chat whose ID matches TELEGRAM_CHAT_ID
    in .env. Messages from any other chat are silently ignored.
    If TELEGRAM_CHAT_ID is not configured, all commands are blocked and a
    warning is logged. This prevents unauthorized access to platform data.

Each command handler reads from the existing database using the same
AsyncSessionLocal pattern used by the analysis and alerts workers.
No second data system is built — the bot is a read-only (and limited-write)
view into the platform's current state.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, desc, func
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.alert import Alert
from app.models.analysis import AnalysisSummary
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)


# ── Access restriction ─────────────────────────────────────────────────────────

def _is_authorized(update: Update) -> bool:
    """Return True if the message came from the configured TELEGRAM_CHAT_ID.

    Unauthorized chats receive no reply — the bot stays invisible to them.
    The attempt is logged at WARNING level so operators can spot
    misconfiguration or unsolicited messages without any platform data
    (prices, keys, etc.) appearing in the log.

    If TELEGRAM_CHAT_ID is not set, all commands are blocked and a warning
    is logged on each attempt.
    """
    chat_id = settings.telegram_chat_id
    if not chat_id:
        logger.warning(
            "TELEGRAM_CHAT_ID is not set — all bot commands are blocked. "
            "Set TELEGRAM_CHAT_ID in .env to enable command handling."
        )
        return False
    authorized = str(update.effective_chat.id) == chat_id.strip()
    if not authorized:
        logger.warning(
            "Unauthorized command attempt from chat %s — ignored.",
            update.effective_chat.id,
        )
    return authorized


# ── Helpers ────────────────────────────────────────────────────────────────────

def _age_str(dt: datetime) -> str:
    """Return a human-readable age string like '5s ago' or '12m ago'."""
    now = datetime.now(tz=timezone.utc)
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    seconds = int((now - aware).total_seconds())
    if seconds < 60:
        return f"{seconds}s ago"
    if seconds < 3600:
        return f"{seconds // 60}m ago"
    return f"{seconds // 3600}h ago"


# ── Command handlers ───────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update):
        return
    await update.message.reply_text(
        "Trading Analysis Platform\n\n"
        "I show live BTC data and alert status from your platform.\n\n"
        "Use /help to see available commands."
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update):
        return
    await update.message.reply_text(
        "Commands:\n\n"
        "/price              \u2014 latest BTC price candle\n"
        "/analysis           \u2014 latest AI market summary\n"
        "/alerts             \u2014 configured alerts and their status\n"
        "/delete_alert <id>  \u2014 delete an alert by ID\n"
        "/status             \u2014 platform data freshness overview\n"
        "/help               \u2014 this message"
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Brief platform summary — data freshness check."""
    if not _is_authorized(update):
        return

    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle)
            .where(PriceCandle.symbol == "BTCUSDT")
            .order_by(desc(PriceCandle.timestamp))
            .limit(1)
        )
        candle = r.scalar_one_or_none()

        r = await session.execute(
            select(AnalysisSummary)
            .where(AnalysisSummary.symbol == "BTCUSDT")
            .order_by(desc(AnalysisSummary.generated_at))
            .limit(1)
        )
        analysis = r.scalar_one_or_none()

        r = await session.execute(
            select(func.count()).select_from(Alert).where(Alert.is_active == True)  # noqa: E712
        )
        alert_count = r.scalar_one()

        r = await session.execute(
            select(func.count())
            .select_from(Alert)
            .where(Alert.is_active == True)   # noqa: E712
            .where(Alert.triggered_at != None)  # noqa: E711
        )
        triggered_count = r.scalar_one()

    price_line = (
        f"Price:    ${float(candle.close):>12,.2f}  ({_age_str(candle.timestamp)})"
        if candle else "Price:    no data yet"
    )
    analysis_line = (
        f"Analysis: available  ({_age_str(analysis.generated_at)})"
        if analysis else "Analysis: not yet generated"
    )
    alerts_line = f"Alerts:   {alert_count} active, {triggered_count} triggered"

    await update.message.reply_text(
        "Platform status\n\n"
        f"{price_line}\n"
        f"{analysis_line}\n"
        f"{alerts_line}"
    )


async def cmd_price(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Latest BTC price candle."""
    if not _is_authorized(update):
        return

    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle)
            .where(PriceCandle.symbol == "BTCUSDT")
            .order_by(desc(PriceCandle.timestamp))
            .limit(1)
        )
        candle = r.scalar_one_or_none()

    if candle is None:
        await update.message.reply_text("No price data available yet.")
        return

    ts = candle.timestamp.strftime("%H:%M UTC")
    await update.message.reply_text(
        f"BTC/USDT \u2014 {ts}\n\n"
        f"Close:  ${float(candle.close):>12,.2f}\n"
        f"Open:   ${float(candle.open):>12,.2f}\n"
        f"High:   ${float(candle.high):>12,.2f}\n"
        f"Low:    ${float(candle.low):>12,.2f}\n"
        f"Volume: {float(candle.volume):>12,.4f} BTC"
    )


async def cmd_analysis(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Latest AI-generated market summary."""
    if not _is_authorized(update):
        return

    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(AnalysisSummary)
            .where(AnalysisSummary.symbol == "BTCUSDT")
            .order_by(desc(AnalysisSummary.generated_at))
            .limit(1)
        )
        summary = r.scalar_one_or_none()

    if summary is None:
        await update.message.reply_text(
            "No analysis available yet.\n"
            "The analysis worker runs every 10 minutes \u2014 check back shortly."
        )
        return

    ts = summary.generated_at.strftime("%H:%M UTC")
    await update.message.reply_text(
        f"AI Analysis \u2014 {ts}\n\n"
        f"{summary.summary_text}\n\n"
        f"Model: {summary.model_used}"
    )


async def cmd_alerts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """List configured alerts and their current trigger state (with IDs)."""
    if not _is_authorized(update):
        return

    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(Alert)
            .where(Alert.is_active == True)  # noqa: E712
            .order_by(Alert.id)
        )
        alerts = list(r.scalars().all())

    if not alerts:
        await update.message.reply_text("No alerts configured.")
        return

    lines = [f"Alerts ({len(alerts)} active):\n"]
    for a in alerts:
        if a.condition_type == "liquidation_spike":
            threshold_str = f"{a.threshold:.0f} events / {a.window_minutes}min"
        else:
            threshold_str = f"${float(a.threshold):,.0f}"

        if a.triggered_at:
            state = f"TRIGGERED {a.triggered_at.strftime('%H:%M')}"
        else:
            state = "watching"

        lines.append(
            f"\u2022 [#{a.id}] {a.name}: {a.condition_type} {threshold_str} "
            f"[{state}] ({a.trigger_mode})"
        )

    lines.append("\nTo delete: /delete_alert <id>")
    await update.message.reply_text("\n".join(lines))


async def cmd_delete_alert(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Delete an alert by ID. Usage: /delete_alert <id>"""
    if not _is_authorized(update):
        return

    if not context.args or len(context.args) != 1:
        await update.message.reply_text(
            "Usage: /delete_alert <id>\n\n"
            "Use /alerts to see alert IDs."
        )
        return

    try:
        alert_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text(
            "Invalid ID — must be a number.\n"
            "Use /alerts to see alert IDs."
        )
        return

    async with AsyncSessionLocal() as session:
        r = await session.execute(select(Alert).where(Alert.id == alert_id))
        alert = r.scalar_one_or_none()
        if alert is None:
            await update.message.reply_text(f"Alert #{alert_id} not found.")
            return
        name = alert.name
        await session.delete(alert)
        await session.commit()

    logger.info("Alert #%d (%s) deleted via Telegram bot.", alert_id, name)
    await update.message.reply_text(f"Alert #{alert_id} ({name}) deleted.")


# ── Application builder ────────────────────────────────────────────────────────

def build_application() -> Application:
    """Build and return the configured Telegram Application."""
    token = settings.telegram_bot_token
    if not token:
        raise ValueError(
            "TELEGRAM_BOT_TOKEN is not set. "
            "Get a token from @BotFather and set it in .env."
        )

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start",         cmd_start))
    app.add_handler(CommandHandler("help",          cmd_help))
    app.add_handler(CommandHandler("status",        cmd_status))
    app.add_handler(CommandHandler("price",         cmd_price))
    app.add_handler(CommandHandler("analysis",      cmd_analysis))
    app.add_handler(CommandHandler("alerts",        cmd_alerts))
    app.add_handler(CommandHandler("delete_alert",  cmd_delete_alert))
    return app
