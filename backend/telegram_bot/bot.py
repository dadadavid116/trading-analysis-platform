"""
telegram_bot/bot.py — Full-featured Telegram interface for the trading platform.

This bot is a complete parallel pathway to the web dashboard. Every action
taken here is reflected on the web in real time (shared DB), and vice versa.

Commands:
    /start              — welcome message
    /help               — full command reference
    /price              — live BTC price (same as web PricePanel)
    /status             — platform health and data freshness
    /alerts             — list all active alerts
    /setalert <above|below> <price> — create a price alert directly
    /delete_alert <id>  — delete an alert by ID
    /analysis           — request on-demand AI market analysis
    /strategy <text>    — validate a trading strategy (OpenAI → Claude pipeline)
    /model              — show or switch AI model (claude / chatgpt)
    /claude             — switch to Claude Sonnet
    /chatgpt            — switch to ChatGPT (GPT-4o)
    /clear              — clear conversation history for this chat

Free text (non-command messages):
    Any message that is not a command is sent to the selected AI model as a
    chat message. The AI has full tool use: it can create/delete/list alerts
    and fetch the live price — same as the web ChatPanel.

Sync:
    All alert creation, deletion, and triggers flow through the shared DB.
    An alert set via Telegram appears on the web chart within 15 seconds.
    An alert set via the web appears in /alerts immediately.

Access restriction:
    All commands are restricted to TELEGRAM_CHAT_ID from .env.
    Unrecognised chats are silently ignored.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

import anthropic
import openai as openai_lib
from sqlalchemy import select, desc, func
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Update,
)
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.alert import Alert
from app.models.analysis import AnalysisSummary
from app.models.price import PriceCandle
from app.models.liquidation import Liquidation
from app.services.chat_history import add_message, get_or_create_session

logger = logging.getLogger(__name__)

# Strategies awaiting user approval (approve/dismiss inline buttons).
# Keyed by a UUID set in callback_data; cleaned up after action.
_pending_strategies: dict[str, dict] = {}

CLAUDE_MODEL = "claude-sonnet-4-6"
OPENAI_MODEL = "gpt-4o"

# Max conversation turns to keep in memory per chat (older turns are dropped).
MAX_HISTORY_TURNS = 12


# ── Access restriction ─────────────────────────────────────────────────────────

def _is_authorized(update: Update) -> bool:
    chat_id = settings.telegram_chat_id
    if not chat_id:
        logger.warning("TELEGRAM_CHAT_ID is not set — all bot commands are blocked.")
        return False
    authorized = str(update.effective_chat.id) == chat_id.strip()
    if not authorized:
        logger.warning("Unauthorized attempt from chat %s — ignored.", update.effective_chat.id)
    return authorized


# ── Helpers ────────────────────────────────────────────────────────────────────

def _age_str(dt: datetime) -> str:
    now = datetime.now(tz=timezone.utc)
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    seconds = int((now - aware).total_seconds())
    if seconds < 60:   return f"{seconds}s ago"
    if seconds < 3600: return f"{seconds // 60}m ago"
    return f"{seconds // 3600}h ago"


def _current_model(context: ContextTypes.DEFAULT_TYPE) -> str:
    """Return the model selected for this chat, defaulting to Claude."""
    return context.chat_data.get("model", "claude")  # type: ignore[attr-defined]


async def _get_market_context() -> str:
    """Build a market snapshot string for the AI system prompt."""
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle)
            .where(PriceCandle.symbol == "BTCUSDT")
            .order_by(desc(PriceCandle.timestamp))
            .limit(1)
        )
        candle = r.scalar_one_or_none()

        r = await session.execute(
            select(Liquidation)
            .where(Liquidation.symbol == "BTCUSDT")
            .order_by(desc(Liquidation.timestamp))
            .limit(3)
        )
        liquidations = list(r.scalars().all())

    lines = ["Current BTC/USDT market snapshot:"]
    if candle:
        lines.append(
            f"  Price: ${float(candle.close):,.2f}  |  Open: ${float(candle.open):,.2f}  "
            f"|  High: ${float(candle.high):,.2f}  |  Low: ${float(candle.low):,.2f}  "
            f"|  Volume: {float(candle.volume):.4f} BTC  "
            f"|  As of: {candle.timestamp.strftime('%H:%M UTC')}"
        )
    else:
        lines.append("  Price: no data available yet.")

    if liquidations:
        parts = [f"{l.side.upper()} ${float(l.price):,.2f} qty={float(l.quantity):.3f}" for l in liquidations]
        lines.append(f"  Recent liquidations: {' | '.join(parts)}")

    return "\n".join(lines)


# ── Tool definitions ───────────────────────────────────────────────────────────

_CLAUDE_TOOLS = [
    {
        "name": "get_current_price",
        "description": "Get the latest live BTC/USDT price from the database.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "create_price_alert",
        "description": "Create a BTC price alert. condition_type: 'price_above' or 'price_below'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":           {"type": "string"},
                "condition_type": {"type": "string", "enum": ["price_above", "price_below"]},
                "threshold":      {"type": "number"},
                "trigger_mode":   {"type": "string", "enum": ["once", "rearm"]},
            },
            "required": ["name", "condition_type", "threshold"],
        },
    },
    {
        "name": "list_alerts",
        "description": "List all existing price alerts.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "delete_alert",
        "description": "Delete a price alert by ID.",
        "input_schema": {
            "type": "object",
            "properties": {"alert_id": {"type": "integer"}},
            "required": ["alert_id"],
        },
    },
]

_OPENAI_TOOLS = [
    {"type": "function", "function": {"name": "get_current_price",  "description": "Get latest live BTC/USDT price.", "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "create_price_alert", "description": "Create a BTC price alert.", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "condition_type": {"type": "string", "enum": ["price_above", "price_below"]}, "threshold": {"type": "number"}, "trigger_mode": {"type": "string", "enum": ["once", "rearm"]}}, "required": ["name", "condition_type", "threshold"]}}},
    {"type": "function", "function": {"name": "list_alerts",        "description": "List all price alerts.",          "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "delete_alert",       "description": "Delete a price alert by ID.",     "parameters": {"type": "object", "properties": {"alert_id": {"type": "integer"}}, "required": ["alert_id"]}}},
]


# ── Tool execution (shared by both models) ─────────────────────────────────────

async def _execute_tool(tool_name: str, tool_input: dict) -> str:
    """Execute an AI tool call and return the result as a string."""
    async with AsyncSessionLocal() as session:

        if tool_name == "get_current_price":
            r = await session.execute(
                select(PriceCandle)
                .where(PriceCandle.symbol == "BTCUSDT")
                .order_by(desc(PriceCandle.timestamp))
                .limit(1)
            )
            c = r.scalar_one_or_none()
            if c is None:
                return "No price data available yet."
            return (
                f"BTC/USDT: ${float(c.close):,.2f} "
                f"(open={float(c.open):,.2f}, high={float(c.high):,.2f}, "
                f"low={float(c.low):,.2f}, vol={float(c.volume):.4f}, "
                f"as of {c.timestamp.strftime('%H:%M UTC')})"
            )

        elif tool_name == "create_price_alert":
            name           = tool_input.get("name", "Alert")
            condition_type = tool_input["condition_type"]
            threshold      = float(tool_input["threshold"])
            trigger_mode   = tool_input.get("trigger_mode", "once")
            if condition_type not in ("price_above", "price_below"):
                return f"Invalid condition_type '{condition_type}'."
            if threshold <= 0:
                return "Threshold must be greater than zero."
            if trigger_mode not in ("once", "rearm"):
                trigger_mode = "once"
            alert = Alert(
                name=name, symbol="BTCUSDT",
                condition_type=condition_type, threshold=threshold,
                trigger_mode=trigger_mode,
                created_at=datetime.now(tz=timezone.utc),
            )
            session.add(alert)
            await session.commit()
            await session.refresh(alert)
            return (
                f"Alert created (ID {alert.id}): '{alert.name}' — "
                f"{condition_type.replace('_', ' ')} ${threshold:,.2f} [{trigger_mode}]"
            )

        elif tool_name == "list_alerts":
            r = await session.execute(select(Alert).order_by(Alert.created_at.desc()))
            alerts = list(r.scalars().all())
            if not alerts:
                return "No alerts exist yet."
            lines = [f"Found {len(alerts)} alert(s):"]
            for a in alerts:
                status = "triggered" if a.triggered_at else "active"
                lines.append(
                    f"  ID {a.id}: '{a.name}' — "
                    f"{a.condition_type.replace('_', ' ')} ${float(a.threshold):,.2f} [{status}]"
                )
            return "\n".join(lines)

        elif tool_name == "delete_alert":
            alert_id = int(tool_input["alert_id"])
            r = await session.execute(select(Alert).where(Alert.id == alert_id))
            alert = r.scalar_one_or_none()
            if alert is None:
                return f"Alert ID {alert_id} not found."
            name = alert.name
            await session.delete(alert)
            await session.commit()
            return f"Alert ID {alert_id} ('{name}') deleted."

        else:
            return f"Unknown tool: {tool_name}"


# ── AI reply functions ─────────────────────────────────────────────────────────

async def _reply_via_claude(history: list, system_prompt: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    messages = list(history)

    for _ in range(5):
        resp = await client.messages.create(
            model=CLAUDE_MODEL, max_tokens=1024,
            system=system_prompt, tools=_CLAUDE_TOOLS, messages=messages,
        )
        if resp.stop_reason == "end_turn":
            return "\n\n".join(b.text for b in resp.content if hasattr(b, "text")).strip()

        if resp.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    result = await _execute_tool(block.name, block.input)
                    logger.info("Tool %s → %s", block.name, result)
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
            messages.append({"role": "user", "content": results})
            continue

        return "\n\n".join(b.text for b in resp.content if hasattr(b, "text")).strip() or "No response."

    return "Sorry, I got into a loop. Please try again."


async def _reply_via_openai(history: list, system_prompt: str) -> str:
    client = openai_lib.AsyncOpenAI(api_key=settings.openai_api_key)
    messages: list = [{"role": "system", "content": system_prompt}] + list(history)

    for _ in range(5):
        resp = await client.chat.completions.create(
            model=OPENAI_MODEL, max_tokens=1024,
            messages=messages, tools=_OPENAI_TOOLS, tool_choice="auto",
        )
        choice = resp.choices[0]
        if choice.finish_reason == "stop":
            return (choice.message.content or "").strip()

        if choice.finish_reason == "tool_calls":
            tool_calls = choice.message.tool_calls or []
            messages.append({
                "role": "assistant", "content": choice.message.content,
                "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in tool_calls],
            })
            for tc in tool_calls:
                args = json.loads(tc.function.arguments)
                result = await _execute_tool(tc.function.name, args)
                logger.info("Tool %s → %s", tc.function.name, result)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            continue

        return (choice.message.content or "").strip() or "No response."

    return "Sorry, I got into a loop. Please try again."


async def _ai_reply(message: str, context: ContextTypes.DEFAULT_TYPE) -> str:
    """Route to the selected model and return its reply."""
    model = _current_model(context)

    market_ctx = await _get_market_context()
    system_prompt = (
        "You are a helpful AI assistant for a BTC/USDT trading dashboard, "
        "responding via Telegram. Be concise — Telegram messages should be short and clear. "
        "You have live market data and can manage price alerts for the user. "
        "When creating or managing alerts, always confirm details after the tool executes.\n\n"
        "IMPORTANT: Whenever you perform or discuss any market analysis, always explicitly state "
        "the timeframe you are analysing (e.g. '1H', '4H', '1D'). If the user does not specify "
        "a timeframe, default to 1H and state that assumption clearly in your response.\n\n"
        + market_ctx
    )

    # Build history from chat_data (list of {role, content} dicts).
    history: list = context.chat_data.get("history", [])  # type: ignore[attr-defined]
    history.append({"role": "user", "content": message})

    if model == "openai" and settings.openai_api_key:
        reply = await _reply_via_openai(history, system_prompt)
    else:
        if not settings.anthropic_api_key:
            return "ANTHROPIC_API_KEY is not configured. Add it to .env."
        reply = await _reply_via_claude(history, system_prompt)

    # Persist the exchange to the chat history DB.
    try:
        async with AsyncSessionLocal() as db:
            session = await get_or_create_session(
                db,
                platform="telegram",
                model=model,
                session_id=context.chat_data.get("session_id"),  # type: ignore[attr-defined]
                first_message=message,
            )
            context.chat_data["session_id"] = session.id  # type: ignore[index]
            await add_message(db, session.id, "user",      message)
            await add_message(db, session.id, "assistant", reply)
    except Exception as exc:
        logger.warning("Could not persist chat message: %s", exc)

    # Save updated history (cap at MAX_HISTORY_TURNS pairs).
    history.append({"role": "assistant", "content": reply})
    if len(history) > MAX_HISTORY_TURNS * 2:
        history = history[-(MAX_HISTORY_TURNS * 2):]
    context.chat_data["history"] = history  # type: ignore[index]

    return reply


# ── Command handlers ───────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    await update.message.reply_text(
        "Trading Analysis Platform\n\n"
        "I'm your full-featured trading assistant on Telegram.\n"
        "Everything you can do on the web dashboard, you can do here.\n\n"
        "Just send me any message to chat with the AI,\n"
        "or use /help to see all commands."
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    model = _current_model(context)
    model_label = "Claude" if model == "claude" else "ChatGPT"
    await update.message.reply_text(
        f"Commands  (AI model: {model_label})\n\n"
        "─ Data ─\n"
        "/price                    — live BTC price\n"
        "/status                   — platform health\n"
        "/alerts                   — list active alerts\n\n"
        "─ Alerts ─\n"
        "/setalert above <price>   — set price-above alert\n"
        "/setalert below <price>   — set price-below alert\n"
        "/delete_alert <id>        — delete alert by ID\n\n"
        "─ AI ─\n"
        "/analysis                 — on-demand market analysis\n"
        "/strategy <description>   — validate a trading strategy\n"
        "/model                    — show / switch AI model\n"
        "/claude                   — switch to Claude Sonnet\n"
        "/chatgpt                  — switch to ChatGPT (GPT-4o)\n"
        "/clear                    — clear conversation history\n\n"
        "─ Chat ─\n"
        "Any other message → sent directly to the AI.\n"
        "The AI can create/delete alerts, check the live price,\n"
        "and answer questions about the market."
    )


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(PriceCandle).where(PriceCandle.symbol == "BTCUSDT").order_by(desc(PriceCandle.timestamp)).limit(1))
        candle = r.scalar_one_or_none()
        r = await session.execute(select(AnalysisSummary).where(AnalysisSummary.symbol == "BTCUSDT").order_by(desc(AnalysisSummary.generated_at)).limit(1))
        analysis = r.scalar_one_or_none()
        r = await session.execute(select(func.count()).select_from(Alert).where(Alert.is_active == True))  # noqa: E712
        alert_count = r.scalar_one()
        r = await session.execute(select(func.count()).select_from(Alert).where(Alert.is_active == True).where(Alert.triggered_at != None))  # noqa: E711,E712
        triggered_count = r.scalar_one()

    price_line    = f"Price:    ${float(candle.close):>12,.2f}  ({_age_str(candle.timestamp)})" if candle else "Price:    no data yet"
    analysis_line = f"Analysis: available  ({_age_str(analysis.generated_at)})" if analysis else "Analysis: not generated (use /analysis)"
    model_label   = "Claude" if _current_model(context) == "claude" else "ChatGPT"

    await update.message.reply_text(
        "Platform status\n\n"
        f"{price_line}\n"
        f"{analysis_line}\n"
        f"Alerts:   {alert_count} active, {triggered_count} triggered\n"
        f"AI model: {model_label}"
    )


async def cmd_price(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(PriceCandle).where(PriceCandle.symbol == "BTCUSDT").order_by(desc(PriceCandle.timestamp)).limit(1))
        candle = r.scalar_one_or_none()
    if candle is None:
        await update.message.reply_text("No price data available yet.")
        return
    age = _age_str(candle.timestamp)
    await update.message.reply_text(
        f"BTC/USDT  —  {candle.timestamp.strftime('%H:%M UTC')}  ({age})\n\n"
        f"Close:  ${float(candle.close):>12,.2f}\n"
        f"Open:   ${float(candle.open):>12,.2f}\n"
        f"High:   ${float(candle.high):>12,.2f}\n"
        f"Low:    ${float(candle.low):>12,.2f}\n"
        f"Volume: {float(candle.volume):>12,.4f} BTC"
    )


async def cmd_alerts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(Alert).where(Alert.is_active == True).order_by(Alert.id))  # noqa: E712
        alerts = list(r.scalars().all())
    if not alerts:
        await update.message.reply_text("No alerts configured.\n\nUse /setalert or ask the AI to create one.")
        return
    lines = [f"Active alerts ({len(alerts)}):\n"]
    for a in alerts:
        threshold_str = f"${float(a.threshold):,.0f}" if a.condition_type != "liquidation_spike" else f"{a.threshold:.0f} events/{a.window_minutes}min"
        state = f"TRIGGERED {a.triggered_at.strftime('%H:%M')}" if a.triggered_at else "watching"
        lines.append(f"• [#{a.id}] {a.name}\n  {a.condition_type.replace('_', ' ')} {threshold_str} — {state} ({a.trigger_mode})")
    lines.append("\nTo delete: /delete_alert <id>")
    await update.message.reply_text("\n".join(lines))


async def cmd_delete_alert(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    if not context.args or len(context.args) != 1:
        await update.message.reply_text("Usage: /delete_alert <id>\n\nUse /alerts to see IDs.")
        return
    try:
        alert_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("ID must be a number. Use /alerts to see IDs.")
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
    logger.info("Alert #%d (%s) deleted via Telegram.", alert_id, name)
    await update.message.reply_text(f"Alert #{alert_id} ({name}) deleted.\n\nThe price line on the web chart will disappear within 15 seconds.")


async def cmd_setalert(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Usage: /setalert above 85000  or  /setalert below 80000"""
    if not _is_authorized(update): return
    args = context.args or []
    if len(args) != 2:
        await update.message.reply_text(
            "Usage:\n"
            "  /setalert above <price>\n"
            "  /setalert below <price>\n\n"
            "Example: /setalert above 90000"
        )
        return
    direction = args[0].lower()
    if direction not in ("above", "below"):
        await update.message.reply_text("Direction must be 'above' or 'below'.")
        return
    try:
        price = float(args[1].replace(",", ""))
        if price <= 0: raise ValueError
    except ValueError:
        await update.message.reply_text("Price must be a positive number, e.g. 85000.")
        return

    condition_type = "price_above" if direction == "above" else "price_below"
    name = f"BTC {direction} ${price:,.0f}"
    async with AsyncSessionLocal() as session:
        alert = Alert(
            name=name, symbol="BTCUSDT",
            condition_type=condition_type, threshold=price,
            trigger_mode="once",
            created_at=datetime.now(tz=timezone.utc),
        )
        session.add(alert)
        await session.commit()
        await session.refresh(alert)

    arrow = "↑" if direction == "above" else "↓"
    await update.message.reply_text(
        f"{arrow} Alert set (ID #{alert.id})\n\n"
        f"Name:      {name}\n"
        f"Condition: BTC {direction} ${price:,.2f}\n"
        f"Mode:      once\n\n"
        "You'll get a notification when it triggers.\n"
        "The alert line will appear on the web chart within 15 seconds."
    )


async def cmd_analysis(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Request on-demand AI market analysis."""
    if not _is_authorized(update): return
    await update.message.reply_text("Generating market analysis...")
    await update.message.chat.send_action(ChatAction.TYPING)

    model = _current_model(context)
    market_ctx = await _get_market_context()
    system_prompt = (
        "You are a professional crypto market analyst. "
        "Write a concise BTC/USDT market analysis based on the data provided. "
        "Cover price action, key levels, and any notable signals. "
        "Keep it under 200 words. Use plain text — no markdown.\n\n"
        + market_ctx
    )
    prompt = "Give me a concise BTC/USDT market analysis based on current data."

    try:
        if model == "openai" and settings.openai_api_key:
            reply = await _reply_via_openai([{"role": "user", "content": prompt}], system_prompt)
        else:
            if not settings.anthropic_api_key:
                await update.message.reply_text("ANTHROPIC_API_KEY is not configured.")
                return
            reply = await _reply_via_claude([{"role": "user", "content": prompt}], system_prompt)
        model_label = "ChatGPT" if model == "openai" else "Claude"
        await update.message.reply_text(f"Market Analysis ({model_label})\n\n{reply}")
    except Exception as exc:
        logger.error("Analysis failed: %s", exc)
        await update.message.reply_text(f"Analysis failed: {exc}")


async def cmd_strategy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Validate a trading strategy via OpenAI → Claude pipeline."""
    if not _is_authorized(update): return
    args_text = " ".join(context.args or []).strip()
    if not args_text:
        await update.message.reply_text(
            "Usage: /strategy <description>\n\n"
            "Example:\n"
            "/strategy Buy BTC when RSI drops below 30 on the 4H chart, "
            "sell when RSI crosses back above 50. Stop loss 5% below entry."
        )
        return
    if not settings.openai_api_key:
        await update.message.reply_text("OPENAI_API_KEY is not configured — cannot validate strategies.")
        return

    await update.message.reply_text("Validating strategy with OpenAI...")
    await update.message.chat.send_action(ChatAction.TYPING)

    # Step 1: OpenAI validation
    import openai as openai_lib  # already imported at top, this is just clarity
    openai_client = openai_lib.AsyncOpenAI(api_key=settings.openai_api_key)
    _OPENAI_STRATEGY_PROMPT = (
        "You are a trading strategy analyst. Determine if the user's description is a valid, "
        "specific, actionable trading strategy. Respond ONLY with JSON:\n"
        '{"valid": true/false, "reason": "", "name": "", "entry_condition": "", '
        '"exit_condition": "", "timeframe": "", "stop_loss": "", "take_profit": ""}'
    )
    try:
        resp = await openai_client.chat.completions.create(
            model=OPENAI_MODEL, max_tokens=400, temperature=0,
            messages=[
                {"role": "system", "content": _OPENAI_STRATEGY_PROMPT},
                {"role": "user",   "content": args_text},
            ],
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        await update.message.reply_text(f"OpenAI validation error: {exc}")
        return

    if not parsed.get("valid"):
        await update.message.reply_text(
            "Invalid Strategy\n\n"
            f"{parsed.get('reason', 'Could not validate — try describing entry/exit conditions more specifically.')}"
        )
        return

    # Step 2: Claude writes plain-English summary
    if settings.anthropic_api_key:
        claude_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        try:
            c_resp = await claude_client.messages.create(
                model=CLAUDE_MODEL, max_tokens=250,
                messages=[{"role": "user", "content": (
                    "Write a 2-3 sentence plain-English summary of this trading strategy for a Telegram message. "
                    "Be concise. End with: 'Approve this strategy to set price alerts.'\n\n"
                    f"Strategy: {json.dumps(parsed)}"
                )}],
            )
            summary = c_resp.content[0].text.strip()
        except Exception:
            summary = "Strategy validated successfully."
    else:
        summary = "Strategy validated successfully."

    # Store pending strategy for the approve callback
    strategy_id = str(uuid.uuid4())[:8]
    _pending_strategies[strategy_id] = parsed

    card = (
        "✅ Strategy Validated\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 {parsed.get('name', 'Strategy')}\n\n"
        f"{summary}\n\n"
        f"⚡ Entry:       {parsed.get('entry_condition', '—')}\n"
        f"🚪 Exit:        {parsed.get('exit_condition', '—')}\n"
        f"⏱ Timeframe:  {parsed.get('timeframe', '—')}\n"
        f"🛑 Stop Loss:  {parsed.get('stop_loss', '—')}\n"
        f"🎯 Take Profit: {parsed.get('take_profit', '—')}"
    )
    keyboard = InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Approve & Set Alert", callback_data=f"approve:{strategy_id}"),
        InlineKeyboardButton("❌ Dismiss",             callback_data=f"dismiss:{strategy_id}"),
    ]])
    await update.message.reply_text(card, reply_markup=keyboard)


async def cmd_model(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show or switch AI model. Usage: /model  or  /model claude  or  /model chatgpt"""
    if not _is_authorized(update): return
    args = context.args or []
    if not args:
        current = _current_model(context)
        label = "Claude Sonnet" if current == "claude" else "ChatGPT (GPT-4o)"
        await update.message.reply_text(
            f"Current AI model: {label}\n\n"
            "To switch:\n"
            "  /model claude\n"
            "  /model chatgpt\n"
            "  /claude\n"
            "  /chatgpt"
        )
        return
    choice = args[0].lower()
    if choice in ("claude", "anthropic"):
        context.chat_data["model"] = "claude"  # type: ignore[index]
        await update.message.reply_text("Switched to Claude Sonnet.")
    elif choice in ("chatgpt", "openai", "gpt"):
        if not settings.openai_api_key:
            await update.message.reply_text("OPENAI_API_KEY is not configured — cannot use ChatGPT.")
            return
        context.chat_data["model"] = "openai"  # type: ignore[index]
        await update.message.reply_text("Switched to ChatGPT (GPT-4o).")
    else:
        await update.message.reply_text("Unknown model. Use 'claude' or 'chatgpt'.")


async def cmd_claude(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    context.chat_data["model"] = "claude"  # type: ignore[index]
    await update.message.reply_text("Switched to Claude Sonnet.")


async def cmd_chatgpt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    if not settings.openai_api_key:
        await update.message.reply_text("OPENAI_API_KEY is not configured.")
        return
    context.chat_data["model"] = "openai"  # type: ignore[index]
    await update.message.reply_text("Switched to ChatGPT (GPT-4o).")


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    context.chat_data["history"]    = []   # type: ignore[index]
    context.chat_data["session_id"] = None  # type: ignore[index] — next message starts a fresh session
    await update.message.reply_text("Conversation history cleared.")


# ── Free-text chat handler ─────────────────────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Route any non-command text message to the selected AI model."""
    if not _is_authorized(update): return
    if not update.message or not update.message.text: return

    await update.message.chat.send_action(ChatAction.TYPING)
    try:
        reply = await _ai_reply(update.message.text, context)
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        reply = f"Error: {exc}"

    # Telegram message limit is 4096 chars — split if needed.
    if len(reply) <= 4096:
        await update.message.reply_text(reply)
    else:
        for chunk in [reply[i:i+4096] for i in range(0, len(reply), 4096)]:
            await update.message.reply_text(chunk)


# ── Inline button callback handler ────────────────────────────────────────────

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle approve/dismiss buttons from /strategy."""
    query = update.callback_query
    await query.answer()

    if not query.data: return
    action, strategy_id = query.data.split(":", 1)
    strategy = _pending_strategies.pop(strategy_id, None)

    if action == "dismiss" or strategy is None:
        await query.edit_message_reply_markup(reply_markup=None)
        if action == "dismiss":
            await query.message.reply_text("Strategy dismissed.")
        else:
            await query.message.reply_text("Strategy session expired — please resubmit.")
        return

    if action == "approve":
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("Strategy approved — asking Claude to set alerts...")
        await query.message.chat.send_action(ChatAction.TYPING)

        approval_msg = (
            f"I've approved this trading strategy: \"{strategy.get('name')}\". "
            f"Entry: {strategy.get('entry_condition')}. "
            f"Exit: {strategy.get('exit_condition')}. "
            f"Timeframe: {strategy.get('timeframe')}. "
            f"Take profit: {strategy.get('take_profit')}. "
            f"Stop loss: {strategy.get('stop_loss')}. "
            "Based on these parameters, please suggest and create appropriate price alerts."
        )
        try:
            # Force Claude for strategy approval regardless of selected model
            # (Claude has the best tool use for alert creation)
            market_ctx = await _get_market_context()
            system_prompt = (
                "You are a helpful trading assistant responding via Telegram. "
                "Be concise. You can create price alerts using your tools.\n\n" + market_ctx
            )
            reply = await _reply_via_claude(
                [{"role": "user", "content": approval_msg}], system_prompt
            )
            await query.message.reply_text(reply)
        except Exception as exc:
            await query.message.reply_text(f"Error setting alerts: {exc}")


# ── Application builder ────────────────────────────────────────────────────────

def build_application() -> Application:
    token = settings.telegram_bot_token
    if not token:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set. Get a token from @BotFather.")

    app = Application.builder().token(token).build()

    # Command handlers
    app.add_handler(CommandHandler("start",         cmd_start))
    app.add_handler(CommandHandler("help",          cmd_help))
    app.add_handler(CommandHandler("status",        cmd_status))
    app.add_handler(CommandHandler("price",         cmd_price))
    app.add_handler(CommandHandler("alerts",        cmd_alerts))
    app.add_handler(CommandHandler("delete_alert",  cmd_delete_alert))
    app.add_handler(CommandHandler("setalert",      cmd_setalert))
    app.add_handler(CommandHandler("analysis",      cmd_analysis))
    app.add_handler(CommandHandler("strategy",      cmd_strategy))
    app.add_handler(CommandHandler("model",         cmd_model))
    app.add_handler(CommandHandler("claude",        cmd_claude))
    app.add_handler(CommandHandler("chatgpt",       cmd_chatgpt))
    app.add_handler(CommandHandler("clear",         cmd_clear))

    # Inline button callbacks (strategy approve/dismiss)
    app.add_handler(CallbackQueryHandler(handle_callback))

    # Free-text chat — must be last (catches everything not matched above)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    return app
