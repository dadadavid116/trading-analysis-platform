"""
routers/chat.py — AI chatbot endpoint with Claude tool use.

Endpoints:
    POST /api/chat — send a message, get a reply with optional tool execution

Claude can call these tools during a conversation:
    get_current_price   — fetch the latest BTC price from the DB
    create_price_alert  — create a price_above or price_below alert
    list_alerts         — list all existing alerts
    delete_alert        — delete an alert by ID

Tool calls are executed server-side; the final reply is returned to the frontend.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.alert import Alert
from app.models.price import PriceCandle
from app.models.liquidation import Liquidation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

# Use Sonnet for the chatbot — smarter than Haiku, good at tool use.
CHAT_MODEL = "claude-sonnet-4-6"

# ── Request / response schemas ─────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str      # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    model: str = "claude"   # reserved for future multi-model support


class ChatResponse(BaseModel):
    reply: str


# ── Tool definitions (sent to Claude) ─────────────────────────────────────────

TOOLS = [
    {
        "name": "get_current_price",
        "description": "Get the latest BTC/USDT price and recent candle data from the database.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
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
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
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


# ── Tool execution ─────────────────────────────────────────────────────────────

async def _execute_tool(tool_name: str, tool_input: dict, db: AsyncSession) -> str:
    """Execute a tool call from Claude and return the result as a string."""

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
            status = "active" if a.is_active else "triggered"
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


# ── Main chat endpoint ─────────────────────────────────────────────────────────

@router.post("/", response_model=ChatResponse)
async def chat(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Process a user chat message using Claude with tool use.

    Accepts a message and conversation history. Fetches live market context,
    calls Claude, executes any tool calls, and returns the final reply.
    """
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to your .env file.",
        )

    # Build system prompt with live market context.
    market_context = await _get_market_context(db)
    system_prompt = (
        "You are a helpful AI assistant for a BTC/USDT trading dashboard. "
        "You have access to live market data and can manage price alerts on behalf of the user. "
        "Be concise, friendly, and accurate. When creating or managing alerts, always confirm "
        "the details back to the user after the tool executes.\n\n"
        + market_context
    )

    # Build message list for the API call.
    messages = [
        {"role": m.role, "content": m.content}
        for m in body.history
    ]
    messages.append({"role": "user", "content": body.message})

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Agentic loop: keep calling Claude until it stops using tools.
    max_iterations = 5  # safety cap
    for _ in range(max_iterations):
        try:
            response = await client.messages.create(
                model=CHAT_MODEL,
                max_tokens=1024,
                system=system_prompt,
                tools=TOOLS,
                messages=messages,
            )
        except Exception as exc:
            logger.error("Claude API call failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"Claude API error: {exc}")

        # If Claude is done (no tool calls), return the text reply.
        if response.stop_reason == "end_turn":
            text_blocks = [b.text for b in response.content if hasattr(b, "text")]
            return ChatResponse(reply="\n\n".join(text_blocks).strip())

        # If Claude wants to use tools, execute each one and feed results back.
        if response.stop_reason == "tool_use":
            # Append Claude's response (which contains tool_use blocks) to messages.
            messages.append({"role": "assistant", "content": response.content})

            # Execute every tool call and collect results.
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result_text = await _execute_tool(block.name, block.input, db)
                    logger.info("Tool %s executed: %s", block.name, result_text)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })

            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason — return whatever text we have.
        text_blocks = [b.text for b in response.content if hasattr(b, "text")]
        return ChatResponse(reply="\n\n".join(text_blocks).strip() or "No response.")

    return ChatResponse(reply="Sorry, I got into a loop. Please try again.")
