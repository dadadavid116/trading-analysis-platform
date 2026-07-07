"""
telegram_bot/bot.py — Full-featured Telegram interface for the trading platform.

Commands registered with BotFather (set_my_commands in post_init):
    /start     — welcome + persistent reply keyboard
    /help      — full command reference
    /price     — live price for active symbol
    /signals   — current scanner / persisted signals
    /risk      — account risk summary + kill-switch toggle
    /positions — open paper positions
    /context   — factor score + market regime
    /market    — AI market commentary (renamed from /analysis)
    /history   — recent closed trades
    /setalert  — create a price alert
    /alerts    — list active alerts
    /symbol    — switch active symbol (BTC / ETH / SOL)
    /strategy  — validate a trading strategy (OpenAI → Claude)
    /model     — show / switch AI model
    /clear     — clear conversation history

Persistent reply keyboard shortcuts:
    Row 1: 📊 Price | 📡 Signals | ⚡ Risk | 💼 Positions
    Row 2: 🌐 Market | 🧭 Context | 🔔 Alerts | 📜 History
    Row 3: 🪙 BTC | 🔷 ETH | 🟣 SOL

Free text → AI chat (Claude by default).
/analysis kept as a back-compat alias for /market.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

import anthropic
import openai as openai_lib
from sqlalchemy import select, desc, func, text as sa_text
from telegram import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
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
from app.models.account import AccountConfig, OpenPosition
from app.models.alert import Alert
from app.models.analysis import AnalysisSummary
from app.models.liquidation import Liquidation
from app.models.price import PriceCandle
from app.models.signal import Signal
from app.services.chat_history import add_message, get_or_create_session

logger = logging.getLogger(__name__)

_pending_strategies: dict[str, dict] = {}

CLAUDE_MODEL = "claude-sonnet-4-6"
OPENAI_MODEL = "gpt-4o"
MAX_HISTORY_TURNS = 12

_SYMBOL_MAP = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
    "SOL": "SOLUSDT",
    "BTCUSDT": "BTCUSDT",
    "ETHUSDT": "ETHUSDT",
    "SOLUSDT": "SOLUSDT",
}

# ── Persistent reply keyboard ──────────────────────────────────────────────────

MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [
        ["📊 Price", "📡 Signals", "⚡ Risk", "💼 Positions"],
        ["🌐 Market", "🧭 Context", "🔔 Alerts", "📜 History"],
        ["🪙 BTC",    "🔷 ETH",    "🟣 SOL"],
    ],
    resize_keyboard=True,
    is_persistent=True,
)

# Map keyboard button text → handler name
_KEYBOARD_ROUTES: dict[str, str] = {
    "📊 price":    "price",
    "📡 signals":  "signals",
    "⚡ risk":     "risk",
    "💼 positions":"positions",
    "🌐 market":   "market",
    "🧭 context":  "context",
    "🔔 alerts":   "alerts",
    "📜 history":  "history",
    "🪙 btc":      "symbol_btc",
    "🔷 eth":      "symbol_eth",
    "🟣 sol":      "symbol_sol",
}

# BotFather command list
_BOT_COMMANDS = [
    BotCommand("start",     "Welcome & show keyboard"),
    BotCommand("help",      "Full command reference"),
    BotCommand("price",     "Live price for active symbol"),
    BotCommand("signals",   "Current scanner signals"),
    BotCommand("risk",      "Account & risk summary"),
    BotCommand("positions", "Open positions"),
    BotCommand("context",   "Factor score & market regime"),
    BotCommand("market",    "AI market commentary"),
    BotCommand("history",   "Recent closed trades"),
    BotCommand("setalert",  "Set a price alert"),
    BotCommand("alerts",    "List active alerts"),
    BotCommand("symbol",    "Switch symbol (BTC / ETH / SOL)"),
    BotCommand("strategy",  "Validate a trading strategy"),
    BotCommand("model",     "Show / switch AI model"),
    BotCommand("clear",     "Clear conversation history"),
]


# ── Access restriction ─────────────────────────────────────────────────────────

def _is_authorized(update: Update) -> bool:
    chat_id = settings.telegram_chat_id
    if not chat_id:
        logger.warning("TELEGRAM_CHAT_ID not set — bot blocked.")
        return False
    ok = str(update.effective_chat.id) == chat_id.strip()
    if not ok:
        logger.warning("Unauthorized attempt from chat %s.", update.effective_chat.id)
    return ok


# ── Helpers ────────────────────────────────────────────────────────────────────

def _age_str(dt: datetime) -> str:
    now = datetime.now(tz=timezone.utc)
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    secs = int((now - aware).total_seconds())
    if secs < 60:   return f"{secs}s ago"
    if secs < 3600: return f"{secs // 60}m ago"
    return f"{secs // 3600}h ago"


def _current_model(context: ContextTypes.DEFAULT_TYPE) -> str:
    return context.chat_data.get("model", "claude")  # type: ignore[attr-defined]


def _active_symbol(context: ContextTypes.DEFAULT_TYPE) -> str:
    return context.chat_data.get("symbol", "BTCUSDT")  # type: ignore[attr-defined]


def _sym_label(symbol: str) -> str:
    return symbol.replace("USDT", "")


async def _get_market_context(symbol: str = "BTCUSDT") -> str:
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle).where(PriceCandle.symbol == symbol)
            .order_by(desc(PriceCandle.timestamp)).limit(1)
        )
        candle = r.scalar_one_or_none()
        r = await session.execute(
            select(Liquidation).where(Liquidation.symbol == symbol)
            .order_by(desc(Liquidation.timestamp)).limit(3)
        )
        liquidations = list(r.scalars().all())

    lines = [f"Current {symbol} market snapshot:"]
    if candle:
        lines.append(
            f"  Price: ${float(candle.close):,.2f}  |  High: ${float(candle.high):,.2f}"
            f"  |  Low: ${float(candle.low):,.2f}  |  Vol: {float(candle.volume):.4f}"
            f"  |  {candle.timestamp.strftime('%H:%M UTC')}"
        )
    else:
        lines.append("  Price: no data available yet.")
    if liquidations:
        parts = [f"{l.side.upper()} ${float(l.price):,.0f}" for l in liquidations]
        lines.append(f"  Recent liquidations: {' | '.join(parts)}")
    return "\n".join(lines)


# ── Data fetchers ──────────────────────────────────────────────────────────────

async def _fetch_signals(limit: int = 5) -> list[Signal]:
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            select(Signal)
            .where(Signal.status.in_(["candidate", "active"]))
            .order_by(desc(Signal.created_at))
            .limit(limit)
        )
        return list(r.scalars().all())


async def _fetch_open_positions(limit: int = 10) -> list[OpenPosition]:
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            select(OpenPosition)
            .where(OpenPosition.status == "open")
            .order_by(desc(OpenPosition.opened_at))
            .limit(limit)
        )
        return list(r.scalars().all())


async def _fetch_closed_trades(limit: int = 5) -> list[OpenPosition]:
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            select(OpenPosition)
            .where(OpenPosition.status == "closed")
            .order_by(desc(OpenPosition.closed_at))
            .limit(limit)
        )
        return list(r.scalars().all())


async def _fetch_account_summary() -> dict:
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(AccountConfig).where(AccountConfig.id == 1))
        cfg = r.scalar_one_or_none()

        r2 = await db.execute(
            select(
                func.sum(OpenPosition.realized_pnl).label("total_pnl"),
                func.count().label("total_closed"),
            ).where(OpenPosition.status == "closed")
        )
        row = r2.one()
        realized_pnl = float(row.total_pnl or 0)

        r3 = await db.execute(
            select(OpenPosition).where(OpenPosition.status == "open")
        )
        open_positions = list(r3.scalars().all())

        starting = float(cfg.starting_capital) if cfg else 10_000.0
        equity   = starting + realized_pnl

        open_risk_usd = 0.0
        for p in open_positions:
            if p.stop_loss:
                sl_dist = abs(p.entry_price - p.stop_loss) / p.entry_price
                open_risk_usd += sl_dist * p.size_usd

        open_risk_pct = (open_risk_usd / equity * 100) if equity > 0 else 0.0

        return {
            "starting_capital":       starting,
            "equity":                 equity,
            "realized_pnl":           realized_pnl,
            "open_count":             len(open_positions),
            "open_risk_usd":          open_risk_usd,
            "open_risk_pct":          open_risk_pct,
            "max_risk_per_trade_pct": float(cfg.max_risk_per_trade_pct) if cfg else 2.0,
            "max_open_risk_pct":      float(cfg.max_open_risk_pct)      if cfg else 10.0,
            "daily_loss_limit_pct":   float(cfg.daily_loss_limit_pct)   if cfg else 5.0,
            "kill_switch_active":     bool(cfg.kill_switch_active)       if cfg else False,
        }


async def _fetch_context_score() -> dict | None:
    async with AsyncSessionLocal() as db:
        r = await db.execute(sa_text("""
            SELECT context_score, crypto_score, macro_score, regime, computed_at
            FROM factor_scores
            ORDER BY computed_at DESC LIMIT 1
        """))
        row = r.fetchone()
        if not row:
            return None
        return {
            "context_score": row.context_score,
            "crypto_score":  row.crypto_score,
            "macro_score":   row.macro_score,
            "regime":        row.regime,
            "computed_at":   row.computed_at,
        }


async def _toggle_kill_switch(active: bool) -> bool:
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(AccountConfig).where(AccountConfig.id == 1))
        cfg = r.scalar_one_or_none()
        if cfg is None:
            return False
        cfg.kill_switch_active = active
        cfg.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return True


# ── Tool definitions ───────────────────────────────────────────────────────────

_CLAUDE_TOOLS = [
    {
        "name": "get_current_price",
        "description": "Get the latest live price from the database for a given symbol.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string", "description": "e.g. BTCUSDT"}},
            "required": [],
        },
    },
    {
        "name": "create_price_alert",
        "description": "Create a price alert. condition_type: 'price_above' or 'price_below'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":           {"type": "string"},
                "condition_type": {"type": "string", "enum": ["price_above", "price_below"]},
                "threshold":      {"type": "number"},
                "trigger_mode":   {"type": "string", "enum": ["once", "rearm"]},
                "symbol":         {"type": "string", "description": "e.g. BTCUSDT"},
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
    {"type": "function", "function": {"name": "get_current_price",  "description": "Get latest live price.",     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": []}}},
    {"type": "function", "function": {"name": "create_price_alert", "description": "Create a price alert.",      "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "condition_type": {"type": "string", "enum": ["price_above", "price_below"]}, "threshold": {"type": "number"}, "trigger_mode": {"type": "string", "enum": ["once", "rearm"]}, "symbol": {"type": "string"}}, "required": ["name", "condition_type", "threshold"]}}},
    {"type": "function", "function": {"name": "list_alerts",        "description": "List all price alerts.",     "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "delete_alert",       "description": "Delete alert by ID.",        "parameters": {"type": "object", "properties": {"alert_id": {"type": "integer"}}, "required": ["alert_id"]}}},
]


# ── Tool execution ─────────────────────────────────────────────────────────────

async def _execute_tool(tool_name: str, tool_input: dict) -> str:
    async with AsyncSessionLocal() as session:
        if tool_name == "get_current_price":
            symbol = tool_input.get("symbol", "BTCUSDT")
            r = await session.execute(
                select(PriceCandle).where(PriceCandle.symbol == symbol)
                .order_by(desc(PriceCandle.timestamp)).limit(1)
            )
            c = r.scalar_one_or_none()
            if c is None:
                return f"No price data for {symbol}."
            return (
                f"{symbol}: ${float(c.close):,.2f} "
                f"(H={float(c.high):,.2f} L={float(c.low):,.2f} "
                f"V={float(c.volume):.4f} @ {c.timestamp.strftime('%H:%M UTC')})"
            )

        elif tool_name == "create_price_alert":
            name           = tool_input.get("name", "Alert")
            condition_type = tool_input["condition_type"]
            threshold      = float(tool_input["threshold"])
            trigger_mode   = tool_input.get("trigger_mode", "once")
            symbol         = tool_input.get("symbol", "BTCUSDT")
            if condition_type not in ("price_above", "price_below"):
                return f"Invalid condition_type '{condition_type}'."
            if threshold <= 0:
                return "Threshold must be > 0."
            if trigger_mode not in ("once", "rearm"):
                trigger_mode = "once"
            alert = Alert(
                name=name, symbol=symbol,
                condition_type=condition_type, threshold=threshold,
                trigger_mode=trigger_mode,
                created_at=datetime.now(tz=timezone.utc),
            )
            session.add(alert)
            await session.commit()
            await session.refresh(alert)
            return (
                f"Alert created (ID {alert.id}): '{alert.name}' — "
                f"{condition_type.replace('_', ' ')} ${threshold:,.2f} [{trigger_mode}] on {symbol}"
            )

        elif tool_name == "list_alerts":
            r = await session.execute(select(Alert).order_by(Alert.created_at.desc()))
            alerts = list(r.scalars().all())
            if not alerts:
                return "No alerts exist."
            lines = [f"Found {len(alerts)} alert(s):"]
            for a in alerts:
                status = "triggered" if a.triggered_at else "active"
                lines.append(f"  ID {a.id}: '{a.name}' {a.condition_type.replace('_',' ')} ${float(a.threshold):,.2f} [{status}]")
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
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
            messages.append({"role": "user", "content": results})
            continue
        return "\n\n".join(b.text for b in resp.content if hasattr(b, "text")).strip() or "No response."
    return "Sorry, got stuck. Please try again."


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
                args   = json.loads(tc.function.arguments)
                result = await _execute_tool(tc.function.name, args)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            continue
        return (choice.message.content or "").strip() or "No response."
    return "Sorry, got stuck. Please try again."


async def _ai_reply(message: str, context: ContextTypes.DEFAULT_TYPE) -> str:
    model  = _current_model(context)
    symbol = _active_symbol(context)

    market_ctx    = await _get_market_context(symbol)
    system_prompt = (
        f"You are a helpful trading assistant for the Trading Analysis Platform, responding via Telegram. "
        f"Be concise. You have live market data and can manage price alerts. "
        f"Active symbol: {symbol}. "
        "State timeframe explicitly when discussing market analysis (default to 1H).\n\n"
        + market_ctx
    )

    history: list = context.chat_data.get("history", [])  # type: ignore[attr-defined]
    history.append({"role": "user", "content": message})

    if model == "openai" and settings.openai_api_key:
        reply = await _reply_via_openai(history, system_prompt)
    else:
        if not settings.anthropic_api_key:
            return "ANTHROPIC_API_KEY is not configured."
        reply = await _reply_via_claude(history, system_prompt)

    try:
        async with AsyncSessionLocal() as db:
            session = await get_or_create_session(
                db, platform="telegram", model=model,
                session_id=context.chat_data.get("session_id"),
                first_message=message,
            )
            context.chat_data["session_id"] = session.id  # type: ignore[index]
            await add_message(db, session.id, "user",      message)
            await add_message(db, session.id, "assistant", reply)
    except Exception as exc:
        logger.warning("Could not persist chat message: %s", exc)

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
        "Use the keyboard below for quick access, or type any command.\n"
        "Free text → AI chat (Claude by default).\n\n"
        "Active symbol: " + _sym_label(_active_symbol(context)),
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    model = "Claude" if _current_model(context) == "claude" else "ChatGPT"
    await update.message.reply_text(
        f"Commands  (AI: {model}  Symbol: {_sym_label(_active_symbol(context))})\n\n"
        "─ Market ─\n"
        "/price              — live price\n"
        "/signals            — scanner signals\n"
        "/context            — factor score + regime\n"
        "/market             — AI market commentary\n\n"
        "─ Account ─\n"
        "/risk               — risk summary + kill switch\n"
        "/positions          — open paper positions\n"
        "/history            — recent closed trades\n\n"
        "─ Alerts ─\n"
        "/alerts             — list active alerts\n"
        "/setalert above <p> — price-above alert\n"
        "/setalert below <p> — price-below alert\n\n"
        "─ Settings ─\n"
        "/symbol BTC|ETH|SOL — switch active symbol\n"
        "/model              — show / switch AI model\n"
        "/claude /chatgpt    — quick model switch\n"
        "/clear              — clear conversation history\n\n"
        "─ Strategy ─\n"
        "/strategy <text>    — validate a trading strategy\n",
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_symbol(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    arg = (context.args[0].upper() if context.args else "").strip()
    sym = _SYMBOL_MAP.get(arg)
    if not sym:
        cur = _sym_label(_active_symbol(context))
        await update.message.reply_text(
            f"Active symbol: {cur}\n\nUsage: /symbol BTC | ETH | SOL",
            reply_markup=MAIN_KEYBOARD,
        )
        return
    context.chat_data["symbol"] = sym  # type: ignore[index]
    await update.message.reply_text(
        f"Active symbol set to {_sym_label(sym)}. All market commands will now use {sym}.",
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_price(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    symbol = _active_symbol(context)
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle).where(PriceCandle.symbol == symbol)
            .order_by(desc(PriceCandle.timestamp)).limit(1)
        )
        candle = r.scalar_one_or_none()
    if candle is None:
        await update.message.reply_text(f"No price data for {symbol} yet.", reply_markup=MAIN_KEYBOARD)
        return
    age = _age_str(candle.timestamp)
    await update.message.reply_text(
        f"{_sym_label(symbol)}/USDT  —  {candle.timestamp.strftime('%H:%M UTC')}  ({age})\n\n"
        f"Close:  ${float(candle.close):>12,.2f}\n"
        f"Open:   ${float(candle.open):>12,.2f}\n"
        f"High:   ${float(candle.high):>12,.2f}\n"
        f"Low:    ${float(candle.low):>12,.2f}\n"
        f"Volume: {float(candle.volume):>12,.4f}",
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_signals(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    signals = await _fetch_signals(limit=6)
    if not signals:
        await update.message.reply_text(
            "No active or candidate signals right now.\n"
            "The scanner runs every 30 seconds — check back shortly.",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    lines = [f"Scanner Signals ({len(signals)} recent)\n"]
    for s in signals:
        dir_arrow = "▲" if s.direction == "long" else "▼"
        status_tag = "ACTIVE" if s.status == "active" else "candidate"
        score_str  = f"  ctx={s.context_score:.0f}" if s.context_score else ""
        regime_str = f"  {s.regime.replace('_',' ')}" if s.regime else ""
        entry_str  = ""
        if s.entry_low and s.entry_high:
            entry_str = f"\n   Entry ${s.entry_low:,.2f}–${s.entry_high:,.2f}"
        elif s.entry_low:
            entry_str = f"\n   Entry ${s.entry_low:,.2f}"
        sl_str = f"  SL ${s.stop_loss:,.2f}" if s.stop_loss else ""
        tp_str = f"  TP ${s.tp1:,.2f}" if s.tp1 else ""
        lines.append(
            f"{dir_arrow} [{status_tag}] {s.symbol} {s.timeframe}{score_str}{regime_str}"
            f"{entry_str}{sl_str}{tp_str}\n"
        )
    lines.append("To act on a signal, use the web dashboard → Account › Execution.")
    await update.message.reply_text("\n".join(lines), reply_markup=MAIN_KEYBOARD)


async def cmd_risk(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    acc = await _fetch_account_summary()

    ks_active = acc["kill_switch_active"]
    ks_label  = "🛑 ACTIVE — trading BLOCKED" if ks_active else "✅ off — trading enabled"
    ks_btn    = "🟢 Disable Kill Switch" if ks_active else "🔴 Enable Kill Switch"
    ks_cb     = "ks:off" if ks_active else "ks:on"

    pnl_sign  = "+" if acc["realized_pnl"] >= 0 else ""
    risk_warn = " ⚠" if acc["open_risk_pct"] > acc["max_open_risk_pct"] else ""

    text = (
        "Risk & Account Summary\n\n"
        f"Equity:      ${acc['equity']:>10,.2f}\n"
        f"P&L:         {pnl_sign}${acc['realized_pnl']:>9,.2f}\n"
        f"Open pos:    {acc['open_count']} position(s)\n"
        f"Open risk:   {acc['open_risk_pct']:.1f}% / {acc['max_open_risk_pct']:.0f}% max{risk_warn}\n"
        f"Risk/trade:  {acc['max_risk_per_trade_pct']:.1f}%\n"
        f"Daily limit: {acc['daily_loss_limit_pct']:.1f}%\n\n"
        f"Kill switch: {ks_label}"
    )
    keyboard = InlineKeyboardMarkup([[InlineKeyboardButton(ks_btn, callback_data=ks_cb)]])
    await update.message.reply_text(text, reply_markup=keyboard)
    # Re-send the persistent keyboard on next interaction via a follow-up
    await update.message.reply_text("↑ Tap the button above to toggle the kill switch.", reply_markup=MAIN_KEYBOARD)


async def cmd_positions(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    positions = await _fetch_open_positions()
    if not positions:
        await update.message.reply_text("No open positions.", reply_markup=MAIN_KEYBOARD)
        return

    lines = [f"Open Positions ({len(positions)})\n"]
    for p in positions:
        dir_arrow = "▲" if p.direction == "long" else "▼"
        sl_str = f"  SL ${p.stop_loss:,.2f}" if p.stop_loss else ""
        tp_str = f"  TP ${p.tp1:,.2f}" if p.tp1 else ""
        age    = _age_str(p.opened_at)
        lines.append(
            f"{dir_arrow} {p.symbol}  ${p.size_usd:,.0f}\n"
            f"   Entry ${p.entry_price:,.2f}{sl_str}{tp_str}\n"
            f"   Opened {age}"
        )
    lines.append("\nClose positions via the web dashboard → Account.")
    await update.message.reply_text("\n\n".join(lines), reply_markup=MAIN_KEYBOARD)


async def cmd_context(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    score = await _fetch_context_score()
    if not score:
        await update.message.reply_text(
            "No context score data yet.\n"
            "The factor scorer runs every 5 minutes — check back shortly.",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    ctx   = score["context_score"]
    crypt = score["crypto_score"]
    macro = score["macro_score"]
    regime = (score["regime"] or "unknown").replace("_", " ").title()
    age    = _age_str(score["computed_at"]) if score["computed_at"] else "unknown"

    bias = "▲ Long bias" if ctx > 20 else "▼ Short bias" if ctx < -20 else "─ Neutral"

    await update.message.reply_text(
        f"Market Context  ({age})\n\n"
        f"Context Score:  {ctx:+.1f}  {bias}\n"
        f"Crypto Score:   {crypt:+.1f}\n"
        f"Macro Score:    {macro:+.1f}\n\n"
        f"Regime:  {regime}\n\n"
        "Full breakdown → Context Desk on the web.",
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_market(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """AI market commentary for the active symbol."""
    if not _is_authorized(update): return
    symbol = _active_symbol(context)
    await update.message.reply_text(f"Generating {_sym_label(symbol)} market commentary…")
    await update.message.chat.send_action(ChatAction.TYPING)

    model      = _current_model(context)
    market_ctx = await _get_market_context(symbol)
    score      = await _fetch_context_score()
    score_line = f"Context Score: {score['context_score']:+.1f}  Regime: {score['regime']}" if score else ""

    system_prompt = (
        f"You are a professional crypto market analyst. Write a concise {_sym_label(symbol)}/USDT "
        "market analysis based on current data. Cover price action, key levels, "
        "and overall bias. Under 180 words. Plain text — no markdown.\n\n"
        + market_ctx + ("\n\n" + score_line if score_line else "")
    )
    prompt = f"Give me a concise {_sym_label(symbol)}/USDT market analysis based on current data."

    try:
        if model == "openai" and settings.openai_api_key:
            reply = await _reply_via_openai([{"role": "user", "content": prompt}], system_prompt)
        else:
            if not settings.anthropic_api_key:
                await update.message.reply_text("ANTHROPIC_API_KEY not configured.", reply_markup=MAIN_KEYBOARD)
                return
            reply = await _reply_via_claude([{"role": "user", "content": prompt}], system_prompt)
        model_label = "ChatGPT" if model == "openai" else "Claude"
        await update.message.reply_text(
            f"Market ({_sym_label(symbol)}) — {model_label}\n\n{reply}",
            reply_markup=MAIN_KEYBOARD,
        )
    except anthropic.AuthenticationError as exc:
        logger.error("Anthropic auth error in /market: %s", exc)
        await update.message.reply_text(
            "Claude API key is missing or invalid.\n\n"
            "Fix: update ANTHROPIC_API_KEY in .env on the VPS, then run:\n"
            "bash deploy.sh\n\n"
            "(Both the api and telegram containers must be recreated.)",
            reply_markup=MAIN_KEYBOARD,
        )
    except Exception as exc:
        logger.error("Market analysis failed: %s", exc)
        await update.message.reply_text("Analysis failed. Please try again later.", reply_markup=MAIN_KEYBOARD)


async def cmd_history(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    trades = await _fetch_closed_trades(limit=7)
    if not trades:
        await update.message.reply_text("No closed trades yet.", reply_markup=MAIN_KEYBOARD)
        return

    total_pnl = sum(float(t.realized_pnl or 0) for t in trades)
    wins       = sum(1 for t in trades if (t.realized_pnl or 0) > 0)
    sign       = "+" if total_pnl >= 0 else ""
    lines      = [f"Recent Closed Trades ({len(trades)})  WR {wins}/{len(trades)}\n"]
    for t in trades:
        pnl  = float(t.realized_pnl or 0)
        icon = "✅" if pnl > 0 else "❌"
        pnl_str = f"{'+' if pnl >= 0 else ''}${pnl:.2f}"
        age  = _age_str(t.closed_at) if t.closed_at else "?"
        lines.append(f"{icon} {t.symbol} {t.direction.upper()}  {pnl_str}  ({age})")

    lines.append(f"\nTotal P&L: {sign}${total_pnl:.2f}")
    await update.message.reply_text("\n".join(lines), reply_markup=MAIN_KEYBOARD)


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    symbol = _active_symbol(context)
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle).where(PriceCandle.symbol == symbol)
            .order_by(desc(PriceCandle.timestamp)).limit(1)
        )
        candle = r.scalar_one_or_none()
        r = await session.execute(
            select(AnalysisSummary).where(AnalysisSummary.symbol == symbol)
            .order_by(desc(AnalysisSummary.generated_at)).limit(1)
        )
        analysis = r.scalar_one_or_none()
        r = await session.execute(
            select(func.count()).select_from(Alert).where(Alert.is_active == True)  # noqa: E712
        )
        alert_count = r.scalar_one()

    price_line    = f"Price ({_sym_label(symbol)}): ${float(candle.close):,.2f}  ({_age_str(candle.timestamp)})" if candle else f"Price ({_sym_label(symbol)}): no data"
    analysis_line = f"Analysis:  ({_age_str(analysis.generated_at)})" if analysis else "Analysis:  not yet generated"
    model_label   = "Claude" if _current_model(context) == "claude" else "ChatGPT"

    await update.message.reply_text(
        "Platform Status\n\n"
        f"{price_line}\n"
        f"{analysis_line}\n"
        f"Alerts:   {alert_count} active\n"
        f"AI model: {model_label}",
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_alerts(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(Alert).where(Alert.is_active == True).order_by(Alert.id)  # noqa: E712
        )
        alerts = list(r.scalars().all())
    if not alerts:
        await update.message.reply_text(
            "No alerts configured.\n\nUse /setalert or ask the AI to create one.",
            reply_markup=MAIN_KEYBOARD,
        )
        return
    lines = [f"Active alerts ({len(alerts)}):\n"]
    for a in alerts:
        thr_str = f"${float(a.threshold):,.0f}"
        state   = f"TRIGGERED {a.triggered_at.strftime('%H:%M')}" if a.triggered_at else "watching"
        lines.append(f"• [#{a.id}] {a.name}\n  {a.condition_type.replace('_',' ')} {thr_str} on {a.symbol} — {state}")
    lines.append("\nDelete: /delete_alert <id>")
    await update.message.reply_text("\n".join(lines), reply_markup=MAIN_KEYBOARD)


async def cmd_delete_alert(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    if not context.args:
        await update.message.reply_text("Usage: /delete_alert <id>", reply_markup=MAIN_KEYBOARD)
        return
    try:
        alert_id = int(context.args[0])
    except ValueError:
        await update.message.reply_text("ID must be a number.", reply_markup=MAIN_KEYBOARD)
        return
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(Alert).where(Alert.id == alert_id))
        alert = r.scalar_one_or_none()
        if alert is None:
            await update.message.reply_text(f"Alert #{alert_id} not found.", reply_markup=MAIN_KEYBOARD)
            return
        name = alert.name
        await session.delete(alert)
        await session.commit()
    await update.message.reply_text(f"Alert #{alert_id} ({name}) deleted.", reply_markup=MAIN_KEYBOARD)


async def cmd_setalert(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    args = context.args or []
    if len(args) != 2:
        await update.message.reply_text(
            "Usage:\n  /setalert above <price>\n  /setalert below <price>",
            reply_markup=MAIN_KEYBOARD,
        )
        return
    direction = args[0].lower()
    if direction not in ("above", "below"):
        await update.message.reply_text("Direction must be 'above' or 'below'.", reply_markup=MAIN_KEYBOARD)
        return
    try:
        price = float(args[1].replace(",", ""))
        if price <= 0: raise ValueError
    except ValueError:
        await update.message.reply_text("Price must be a positive number.", reply_markup=MAIN_KEYBOARD)
        return

    symbol         = _active_symbol(context)
    condition_type = "price_above" if direction == "above" else "price_below"
    name           = f"{_sym_label(symbol)} {direction} ${price:,.0f}"
    async with AsyncSessionLocal() as session:
        alert = Alert(
            name=name, symbol=symbol,
            condition_type=condition_type, threshold=price,
            trigger_mode="once",
            created_at=datetime.now(tz=timezone.utc),
        )
        session.add(alert)
        await session.commit()
        await session.refresh(alert)

    arrow = "↑" if direction == "above" else "↓"
    await update.message.reply_text(
        f"{arrow} Alert set (#{alert.id})\n\n"
        f"{name}\nMode: once\n\nYou'll be notified when it triggers.",
        reply_markup=MAIN_KEYBOARD,
    )


async def cmd_strategy(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    args_text = " ".join(context.args or []).strip()
    if not args_text:
        await update.message.reply_text(
            "Usage: /strategy <description>\n\n"
            "Example: /strategy Buy BTC when RSI < 30 on 4H, sell when RSI > 50. SL 5% below entry.",
            reply_markup=MAIN_KEYBOARD,
        )
        return
    if not settings.openai_api_key:
        await update.message.reply_text("OPENAI_API_KEY not configured.", reply_markup=MAIN_KEYBOARD)
        return

    await update.message.reply_text("Validating strategy…")
    await update.message.chat.send_action(ChatAction.TYPING)

    openai_client = openai_lib.AsyncOpenAI(api_key=settings.openai_api_key)
    _STRATEGY_PROMPT = (
        "You are a trading strategy analyst. Determine if the user's description is a valid, specific, "
        "actionable trading strategy. Respond ONLY with JSON:\n"
        '{"valid": true/false, "reason": "", "name": "", "entry_condition": "", '
        '"exit_condition": "", "timeframe": "", "stop_loss": "", "take_profit": ""}'
    )
    try:
        resp   = await openai_client.chat.completions.create(
            model=OPENAI_MODEL, max_tokens=400, temperature=0,
            messages=[{"role": "system", "content": _STRATEGY_PROMPT}, {"role": "user", "content": args_text}],
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        await update.message.reply_text(f"OpenAI error: {exc}", reply_markup=MAIN_KEYBOARD)
        return

    if not parsed.get("valid"):
        await update.message.reply_text(
            "Invalid Strategy\n\n"
            + parsed.get("reason", "Describe entry/exit conditions more specifically."),
            reply_markup=MAIN_KEYBOARD,
        )
        return

    summary = "Strategy validated."
    if settings.anthropic_api_key:
        try:
            cc = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            cr = await cc.messages.create(
                model=CLAUDE_MODEL, max_tokens=200,
                messages=[{"role": "user", "content": (
                    "Write a 2-sentence plain-English summary of this trading strategy for Telegram. "
                    "Be concise.\n\n" + json.dumps(parsed)
                )}],
            )
            summary = cr.content[0].text.strip()
        except Exception:
            pass

    card = (
        "Strategy Validated\n"
        f"{parsed.get('name', 'Strategy')}\n\n"
        f"{summary}\n\n"
        f"Entry:   {parsed.get('entry_condition', '—')}\n"
        f"Exit:    {parsed.get('exit_condition', '—')}\n"
        f"TF:      {parsed.get('timeframe', '—')}\n"
        f"SL:      {parsed.get('stop_loss', '—')}\n"
        f"TP:      {parsed.get('take_profit', '—')}"
    )
    await update.message.reply_text(card)

    # Auto-create price alerts based on strategy + current market conditions.
    if not settings.anthropic_api_key:
        await update.message.reply_text(
            "Note: ANTHROPIC_API_KEY not configured — alerts could not be set automatically.",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    await update.message.reply_text("Setting alerts based on current market…")
    await update.message.chat.send_action(ChatAction.TYPING)

    approval_msg = (
        f"A trading strategy has been validated: \"{parsed.get('name')}\". "
        f"Entry: {parsed.get('entry_condition')}. Exit: {parsed.get('exit_condition')}. "
        f"Timeframe: {parsed.get('timeframe')}. TP: {parsed.get('take_profit')}. "
        f"SL: {parsed.get('stop_loss')}. "
        "Based on current market prices, create appropriate price alerts for this strategy now. "
        "Include entry invalidation, stop loss, and take profit levels."
    )
    try:
        market_ctx    = await _get_market_context()
        system_prompt = (
            "You are a trading assistant on Telegram. Be concise. "
            "Create price alerts using your tools based on current market conditions.\n\n"
            + market_ctx
        )
        reply = await _reply_via_claude([{"role": "user", "content": approval_msg}], system_prompt)
        await update.message.reply_text(reply, reply_markup=MAIN_KEYBOARD)
    except anthropic.AuthenticationError as exc:
        logger.error("Anthropic auth error in strategy auto-alert: %s", exc)
        await update.message.reply_text(
            "Claude API key is invalid — could not set alerts.\n"
            "Fix: update ANTHROPIC_API_KEY in .env and run bash deploy.sh.",
            reply_markup=MAIN_KEYBOARD,
        )
    except Exception as exc:
        logger.error("Strategy auto-alert error: %s", exc)
        await update.message.reply_text(
            "Could not create alerts. Please try again.", reply_markup=MAIN_KEYBOARD,
        )


async def cmd_model(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    args = context.args or []
    if not args:
        cur = "Claude Sonnet" if _current_model(context) == "claude" else "ChatGPT"
        await update.message.reply_text(
            f"Current AI model: {cur}\n\nSwitch: /model claude | /model chatgpt",
            reply_markup=MAIN_KEYBOARD,
        )
        return
    choice = args[0].lower()
    if choice in ("claude", "anthropic"):
        context.chat_data["model"] = "claude"  # type: ignore[index]
        await update.message.reply_text("Switched to Claude Sonnet.", reply_markup=MAIN_KEYBOARD)
    elif choice in ("chatgpt", "openai", "gpt"):
        if not settings.openai_api_key:
            await update.message.reply_text("OPENAI_API_KEY not configured.", reply_markup=MAIN_KEYBOARD)
            return
        context.chat_data["model"] = "openai"  # type: ignore[index]
        await update.message.reply_text("Switched to ChatGPT (GPT-4o).", reply_markup=MAIN_KEYBOARD)
    else:
        await update.message.reply_text("Unknown model. Use 'claude' or 'chatgpt'.", reply_markup=MAIN_KEYBOARD)


async def cmd_claude(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    context.chat_data["model"] = "claude"  # type: ignore[index]
    await update.message.reply_text("Switched to Claude Sonnet.", reply_markup=MAIN_KEYBOARD)


async def cmd_chatgpt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    if not settings.openai_api_key:
        await update.message.reply_text("OPENAI_API_KEY not configured.", reply_markup=MAIN_KEYBOARD)
        return
    context.chat_data["model"] = "openai"  # type: ignore[index]
    await update.message.reply_text("Switched to ChatGPT (GPT-4o).", reply_markup=MAIN_KEYBOARD)


async def cmd_clear(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    context.chat_data["history"]    = []    # type: ignore[index]
    context.chat_data["session_id"] = None  # type: ignore[index]
    await update.message.reply_text("Conversation history cleared.", reply_markup=MAIN_KEYBOARD)


# ── Free-text + keyboard button handler ───────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_authorized(update): return
    if not update.message or not update.message.text: return

    text  = update.message.text.strip()
    route = _KEYBOARD_ROUTES.get(text.lower())

    if route == "symbol_btc":
        context.chat_data["symbol"] = "BTCUSDT"  # type: ignore[index]
        await update.message.reply_text("Active symbol: BTC", reply_markup=MAIN_KEYBOARD)
        return
    if route == "symbol_eth":
        context.chat_data["symbol"] = "ETHUSDT"  # type: ignore[index]
        await update.message.reply_text("Active symbol: ETH", reply_markup=MAIN_KEYBOARD)
        return
    if route == "symbol_sol":
        context.chat_data["symbol"] = "SOLUSDT"  # type: ignore[index]
        await update.message.reply_text("Active symbol: SOL", reply_markup=MAIN_KEYBOARD)
        return

    if route == "price":     await cmd_price(update, context);     return
    if route == "signals":   await cmd_signals(update, context);   return
    if route == "risk":      await cmd_risk(update, context);      return
    if route == "positions": await cmd_positions(update, context); return
    if route == "market":    await cmd_market(update, context);    return
    if route == "context":   await cmd_context(update, context);   return
    if route == "alerts":    await cmd_alerts(update, context);    return
    if route == "history":   await cmd_history(update, context);   return

    # AI chat
    await update.message.chat.send_action(ChatAction.TYPING)
    try:
        reply = await _ai_reply(text, context)
    except anthropic.AuthenticationError as exc:
        logger.error("Anthropic auth error in AI chat: %s", exc)
        reply = (
            "Claude API key is missing or invalid.\n\n"
            "Fix: update ANTHROPIC_API_KEY in .env on the VPS, then run:\n"
            "bash deploy.sh"
        )
    except Exception as exc:
        logger.error("AI chat error: %s", exc)
        reply = "AI service error. Please try again later."

    if len(reply) <= 4096:
        await update.message.reply_text(reply, reply_markup=MAIN_KEYBOARD)
    else:
        chunks = [reply[i:i+4096] for i in range(0, len(reply), 4096)]
        for i, chunk in enumerate(chunks):
            await update.message.reply_text(chunk, reply_markup=MAIN_KEYBOARD if i == len(chunks) - 1 else None)


# ── Inline button callbacks ────────────────────────────────────────────────────

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    if not query.data: return

    # Kill switch toggle
    if query.data in ("ks:on", "ks:off"):
        active = query.data == "ks:on"
        ok = await _toggle_kill_switch(active)
        if ok:
            state = "ENABLED — trading blocked" if active else "DISABLED — trading enabled"
            await query.edit_message_text(f"Kill switch {state}.\n\nCheck /risk to see the full summary.")
        else:
            await query.edit_message_text("Could not update kill switch — account config not found.")
        return

    # Strategy approve/dismiss
    parts = query.data.split(":", 1)
    if len(parts) != 2:
        return
    action, sid = parts
    strategy = _pending_strategies.pop(sid, None)

    if action == "dismiss" or strategy is None:
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(
            "Strategy dismissed." if action == "dismiss" else "Strategy session expired — resubmit.",
            reply_markup=MAIN_KEYBOARD,
        )
        return

    if action == "approve":
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("Strategy approved — asking Claude to set alerts…")
        await query.message.chat.send_action(ChatAction.TYPING)

        approval_msg = (
            f"I've approved this strategy: \"{strategy.get('name')}\". "
            f"Entry: {strategy.get('entry_condition')}. Exit: {strategy.get('exit_condition')}. "
            f"TF: {strategy.get('timeframe')}. TP: {strategy.get('take_profit')}. "
            f"SL: {strategy.get('stop_loss')}. "
            "Please create appropriate price alerts."
        )
        try:
            market_ctx    = await _get_market_context()
            system_prompt = (
                "You are a trading assistant on Telegram. Be concise. "
                "Create price alerts using your tools.\n\n" + market_ctx
            )
            reply = await _reply_via_claude([{"role": "user", "content": approval_msg}], system_prompt)
            await query.message.reply_text(reply, reply_markup=MAIN_KEYBOARD)
        except anthropic.AuthenticationError as exc:
            logger.error("Anthropic auth error in strategy approval: %s", exc)
            await query.message.reply_text(
                "Claude API key is invalid — cannot create alerts.\n"
                "Fix: update ANTHROPIC_API_KEY in .env and run bash deploy.sh.",
                reply_markup=MAIN_KEYBOARD,
            )
        except Exception as exc:
            logger.error("Strategy approval error: %s", exc)
            await query.message.reply_text("Could not create alerts. Please try again.", reply_markup=MAIN_KEYBOARD)


# ── Post-init: register commands with BotFather ────────────────────────────────

async def _post_init(application: Application) -> None:
    try:
        await application.bot.set_my_commands(_BOT_COMMANDS)
        logger.info("BotFather command menu registered (%d commands).", len(_BOT_COMMANDS))
    except Exception as exc:
        logger.warning("Could not register bot commands: %s", exc)


# ── Application builder ────────────────────────────────────────────────────────

def build_application() -> Application:
    token = settings.telegram_bot_token
    if not token:
        raise ValueError("TELEGRAM_BOT_TOKEN is not set.")

    app = Application.builder().token(token).post_init(_post_init).build()

    app.add_handler(CommandHandler("start",        cmd_start))
    app.add_handler(CommandHandler("help",         cmd_help))
    app.add_handler(CommandHandler("status",       cmd_status))
    app.add_handler(CommandHandler("price",        cmd_price))
    app.add_handler(CommandHandler("signals",      cmd_signals))
    app.add_handler(CommandHandler("risk",         cmd_risk))
    app.add_handler(CommandHandler("positions",    cmd_positions))
    app.add_handler(CommandHandler("context",      cmd_context))
    app.add_handler(CommandHandler("market",       cmd_market))
    app.add_handler(CommandHandler("analysis",     cmd_market))   # back-compat alias
    app.add_handler(CommandHandler("history",      cmd_history))
    app.add_handler(CommandHandler("alerts",       cmd_alerts))
    app.add_handler(CommandHandler("delete_alert", cmd_delete_alert))
    app.add_handler(CommandHandler("setalert",     cmd_setalert))
    app.add_handler(CommandHandler("symbol",       cmd_symbol))
    app.add_handler(CommandHandler("strategy",     cmd_strategy))
    app.add_handler(CommandHandler("model",        cmd_model))
    app.add_handler(CommandHandler("claude",       cmd_claude))
    app.add_handler(CommandHandler("chatgpt",      cmd_chatgpt))
    app.add_handler(CommandHandler("clear",        cmd_clear))

    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    return app
