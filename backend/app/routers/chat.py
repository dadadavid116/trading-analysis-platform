"""
routers/chat.py — AI chatbot endpoint supporting Claude and ChatGPT.

Endpoints:
    POST /api/chat — send a message, get a reply with optional tool execution

Supported models (body.model field):
    "claude"  — Anthropic Claude Sonnet, full tool use
    "openai"  — OpenAI GPT-4o, full tool use

Both models share the same market context and tool implementations:
    get_current_price   — fetch the latest BTC price from the DB
    create_price_alert  — create a price_above or price_below alert
    list_alerts         — list all existing alerts
    delete_alert        — delete an alert by ID

Tool calls are executed server-side; the final reply is returned to the frontend.
"""

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

import anthropic
import openai as openai_lib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.alert import Alert
from app.models.price import PriceCandle
from app.models.liquidation import Liquidation
from app.services.chat_history import add_message, get_or_create_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

CLAUDE_MODEL = "claude-sonnet-4-6"
OPENAI_MODEL = "gpt-4o"


# ── Request / response schemas ─────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str      # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    model: str = "claude"        # "claude" | "openai"
    session_id: Optional[int] = None   # omit on first message; backend creates a session


class ChatResponse(BaseModel):
    reply:      str
    session_id: int   # returned on every response so the frontend can track the session


# ── Tool definitions — Anthropic format ───────────────────────────────────────

CLAUDE_TOOLS = [
    {
        "name": "get_current_price",
        "description": "Get the latest BTC/USDT price and recent candle data from the database.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "create_price_alert",
        "description": (
            "Create a price alert for BTC/USDT. "
            "Use condition_type='price_above' to alert when BTC goes above a price, "
            "or 'price_below' to alert when BTC drops below a price."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "A short label for the alert, e.g. 'BTC above 70k'",
                },
                "condition_type": {
                    "type": "string",
                    "enum": ["price_above", "price_below"],
                    "description": "Whether to trigger when price goes above or below the threshold.",
                },
                "threshold": {
                    "type": "number",
                    "description": "The price level in USD that triggers the alert.",
                },
                "trigger_mode": {
                    "type": "string",
                    "enum": ["once", "rearm"],
                    "description": (
                        "'once' — fires once and stays triggered. "
                        "'rearm' — resets automatically and can fire again."
                    ),
                },
            },
            "required": ["name", "condition_type", "threshold"],
        },
    },
    {
        "name": "list_alerts",
        "description": "List all existing price alerts in the system.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "delete_alert",
        "description": "Delete a price alert by its ID. Use list_alerts first if you don't know the ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "alert_id": {
                    "type": "integer",
                    "description": "The numeric ID of the alert to delete.",
                },
            },
            "required": ["alert_id"],
        },
    },
]

# ── Tool definitions — OpenAI function-calling format ─────────────────────────

OPENAI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_price",
            "description": "Get the latest BTC/USDT price and recent candle data.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_price_alert",
            "description": (
                "Create a price alert for BTC/USDT. "
                "Use condition_type='price_above' to alert when BTC goes above a price, "
                "or 'price_below' when it drops below."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Short label for the alert, e.g. 'BTC above 70k'",
                    },
                    "condition_type": {
                        "type": "string",
                        "enum": ["price_above", "price_below"],
                    },
                    "threshold": {
                        "type": "number",
                        "description": "Price level in USD",
                    },
                    "trigger_mode": {
                        "type": "string",
                        "enum": ["once", "rearm"],
                    },
                },
                "required": ["name", "condition_type", "threshold"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_alerts",
            "description": "List all existing price alerts in the system.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_alert",
            "description": "Delete a price alert by ID. Use list_alerts first to find the ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "alert_id": {
                        "type": "integer",
                        "description": "Numeric ID of the alert to delete.",
                    },
                },
                "required": ["alert_id"],
            },
        },
    },
]


# ── Market context helper ──────────────────────────────────────────────────────

async def _get_market_context(db: AsyncSession) -> str:
    """Build a short market context string to include in the system prompt."""
    r = await db.execute(
        select(PriceCandle)
        .where(PriceCandle.symbol == "BTCUSDT")
        .order_by(desc(PriceCandle.timestamp))
        .limit(1)
    )
    candle = r.scalar_one_or_none()

    r = await db.execute(
        select(Liquidation)
        .where(Liquidation.symbol == "BTCUSDT")
        .order_by(desc(Liquidation.timestamp))
        .limit(3)
    )
    liquidations = list(r.scalars().all())

    lines = ["Current BTC/USDT market snapshot:"]
    if candle:
        lines.append(
            f"  Price: ${candle.close:,.2f}  |  Open: ${candle.open:,.2f}  "
            f"|  High: ${candle.high:,.2f}  |  Low: ${candle.low:,.2f}  "
            f"|  Volume: {candle.volume:.4f} BTC  "
            f"|  Candle time: {candle.timestamp.strftime('%H:%M UTC')}"
        )
    else:
        lines.append("  Price: no data available yet.")

    if liquidations:
        liq_parts = [
            f"{liq.side.upper()} ${liq.price:,.2f} qty={liq.quantity:.3f}"
            for liq in liquidations
        ]
        lines.append(f"  Recent liquidations: {' | '.join(liq_parts)}")

    return "\n".join(lines)


# ── Tool execution (shared by both models) ────────────────────────────────────

async def _execute_tool(tool_name: str, tool_input: dict, db: AsyncSession) -> str:
    """Execute a tool call and return the result as a string."""

    if tool_name == "get_current_price":
        r = await db.execute(
            select(PriceCandle)
            .where(PriceCandle.symbol == "BTCUSDT")
            .order_by(desc(PriceCandle.timestamp))
            .limit(1)
        )
        candle = r.scalar_one_or_none()
        if candle is None:
            return "No price data available yet."
        return (
            f"BTC/USDT latest price: ${candle.close:,.2f}  "
            f"(open=${candle.open:,.2f}, high=${candle.high:,.2f}, "
            f"low=${candle.low:,.2f}, volume={candle.volume:.4f} BTC, "
            f"candle time={candle.timestamp.strftime('%Y-%m-%d %H:%M UTC')})"
        )

    elif tool_name == "create_price_alert":
        name           = tool_input.get("name", "Alert")
        condition_type = tool_input["condition_type"]
        threshold      = float(tool_input["threshold"])
        trigger_mode   = tool_input.get("trigger_mode", "once")

        if condition_type not in ("price_above", "price_below"):
            return f"Error: invalid condition_type '{condition_type}'."
        if threshold <= 0:
            return "Error: threshold must be greater than zero."
        if trigger_mode not in ("once", "rearm"):
            trigger_mode = "once"

        alert = Alert(
            name=name,
            symbol="BTCUSDT",
            condition_type=condition_type,
            threshold=threshold,
            trigger_mode=trigger_mode,
            created_at=datetime.now(tz=timezone.utc),
        )
        db.add(alert)
        await db.commit()
        await db.refresh(alert)
        return (
            f"Alert created (ID {alert.id}): '{alert.name}' — "
            f"{alert.condition_type.replace('_', ' ')} ${alert.threshold:,.2f}, "
            f"trigger_mode={alert.trigger_mode}."
        )

    elif tool_name == "list_alerts":
        r = await db.execute(select(Alert).order_by(Alert.created_at.desc()))
        alerts = list(r.scalars().all())
        if not alerts:
            return "No alerts exist yet."
        lines = [f"Found {len(alerts)} alert(s):"]
        for a in alerts:
            status = "triggered" if a.triggered_at else "active"
            lines.append(
                f"  ID {a.id}: '{a.name}' — "
                f"{a.condition_type.replace('_', ' ')} ${a.threshold:,.2f} "
                f"[{status}] trigger_mode={a.trigger_mode}"
            )
        return "\n".join(lines)

    elif tool_name == "delete_alert":
        alert_id = int(tool_input["alert_id"])
        r = await db.execute(select(Alert).where(Alert.id == alert_id))
        alert = r.scalar_one_or_none()
        if alert is None:
            return f"Alert ID {alert_id} not found."
        await db.delete(alert)
        await db.commit()
        return f"Alert ID {alert_id} ('{alert.name}') deleted."

    else:
        return f"Unknown tool: {tool_name}"


# ── Claude agentic loop ────────────────────────────────────────────────────────

async def _reply_via_claude(
    message: str,
    history: List[ChatMessage],
    system_prompt: str,
    db: AsyncSession,
) -> str:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    for _ in range(5):
        try:
            response = await client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                system=system_prompt,
                tools=CLAUDE_TOOLS,
                messages=messages,
            )
        except Exception as exc:
            logger.error("Claude API error: %s", exc)
            raise HTTPException(status_code=502, detail=f"Claude API error: {exc}")

        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            return "\n\n".join(text_blocks).strip()

        if response.stop_reason == "tool_use":
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = await _execute_tool(block.name, block.input, db)
                    logger.info("Claude tool %s → %s", block.name, result)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })
            messages.append({"role": "user", "content": tool_results})
            continue

        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        return "\n\n".join(text_blocks).strip() or "No response."

    return "Sorry, I got into a loop. Please try again."


# ── OpenAI agentic loop ───────────────────────────────────────────────────────

async def _reply_via_openai(
    message: str,
    history: List[ChatMessage],
    system_prompt: str,
    db: AsyncSession,
) -> str:
    client = openai_lib.AsyncOpenAI(api_key=settings.openai_api_key)

    messages: list = [{"role": "system", "content": system_prompt}]
    for m in history:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": message})

    for _ in range(5):
        try:
            response = await client.chat.completions.create(
                model=OPENAI_MODEL,
                max_tokens=1024,
                messages=messages,
                tools=OPENAI_TOOLS,
                tool_choice="auto",
            )
        except Exception as exc:
            logger.error("OpenAI API error: %s", exc)
            raise HTTPException(status_code=502, detail=f"OpenAI API error: {exc}")

        choice = response.choices[0]

        if choice.finish_reason == "stop":
            return (choice.message.content or "").strip()

        if choice.finish_reason == "tool_calls":
            # Append the assistant message (with tool_calls) in dict form.
            tool_calls = choice.message.tool_calls or []
            messages.append({
                "role": "assistant",
                "content": choice.message.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ],
            })

            # Execute each tool and append its result.
            for tc in tool_calls:
                args = json.loads(tc.function.arguments)
                result = await _execute_tool(tc.function.name, args, db)
                logger.info("OpenAI tool %s → %s", tc.function.name, result)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        return (choice.message.content or "").strip() or "No response."

    return "Sorry, I got into a loop. Please try again."


# ── Main chat endpoint ─────────────────────────────────────────────────────────

@router.post("/", response_model=ChatResponse)
async def chat(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Process a user chat message using Claude or ChatGPT with tool use.

    Routes to the appropriate model based on body.model ("claude" | "openai").
    Both models share market context and tool implementations.
    """
    market_context = await _get_market_context(db)
    system_prompt = (
        "You are a helpful AI assistant for a BTC/USDT trading dashboard. "
        "You have access to live market data and can manage price alerts on behalf of the user. "
        "Be concise, friendly, and accurate. When creating or managing alerts, always confirm "
        "the details back to the user after the tool executes.\n\n"
        + market_context
    )

    if body.model == "openai":
        if not settings.openai_api_key:
            raise HTTPException(
                status_code=503,
                detail="OPENAI_API_KEY is not configured. Add it to your .env file.",
            )
        reply = await _reply_via_openai(body.message, body.history, system_prompt, db)
    else:
        # Default to Claude for any unrecognised model value.
        if not settings.anthropic_api_key:
            raise HTTPException(
                status_code=503,
                detail="ANTHROPIC_API_KEY is not configured. Add it to your .env file.",
            )
        reply = await _reply_via_claude(body.message, body.history, system_prompt, db)

    # Persist the exchange to the chat history DB.
    session = await get_or_create_session(
        db,
        platform="web",
        model=body.model,
        session_id=body.session_id,
        first_message=body.message,
    )
    await add_message(db, session.id, "user",      body.message)
    await add_message(db, session.id, "assistant", reply)

    return ChatResponse(reply=reply, session_id=session.id)
