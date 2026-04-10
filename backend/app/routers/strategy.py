"""
routers/strategy.py — Strategy validation pipeline.

Endpoint:
    POST /api/strategy/validate

Flow:
    1. OpenAI validates the description and extracts structured parameters as JSON
    2. If invalid: return { valid: false, reason: "..." }
    3. If valid: Claude writes a plain-English summary for the user
    4. Return { valid: true, ...params, summary: "..." }
"""

import json
import logging

import anthropic
import openai as openai_lib
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/strategy", tags=["strategy"])

OPENAI_MODEL = "gpt-4o"
CLAUDE_MODEL = "claude-sonnet-4-6"

# ── Schemas ────────────────────────────────────────────────────────────────────

class StrategyRequest(BaseModel):
    description: str


class StrategyResult(BaseModel):
    valid: bool
    reason: str = ""            # why it failed (when valid=False)
    name: str = ""
    entry_condition: str = ""
    exit_condition: str = ""
    timeframe: str = ""
    stop_loss: str = ""
    take_profit: str = ""
    summary: str = ""           # Claude's plain-English summary (when valid=True)


# ── OpenAI validation prompt ───────────────────────────────────────────────────

_OPENAI_PROMPT = """You are a professional trading strategy analyst for crypto markets.

The user will describe a trading strategy idea. Your job is to:
1. Determine if it is a valid, specific, and actionable trading strategy
2. If valid, extract the key parameters

A valid strategy must have at minimum:
- A clear, specific entry condition (not vague like "when price goes up")
- A clear exit condition
- A recognisable timeframe

Respond ONLY with a single JSON object — no explanation, no markdown — in exactly this format:
{
  "valid": true,
  "reason": "",
  "name": "Short strategy name (3-5 words)",
  "entry_condition": "Specific entry trigger",
  "exit_condition": "Specific exit trigger",
  "timeframe": "e.g. 5m, 1h, 4h, 1d",
  "stop_loss": "Stop loss rule or level (or 'Not specified')",
  "take_profit": "Take profit rule or level (or 'Not specified')"
}

If the strategy is invalid or too vague, respond with:
{
  "valid": false,
  "reason": "Brief explanation of why it is not a valid strategy",
  "name": "", "entry_condition": "", "exit_condition": "",
  "timeframe": "", "stop_loss": "", "take_profit": ""
}"""


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.post("/validate", response_model=StrategyResult)
async def validate_strategy(body: StrategyRequest):
    """
    Validate a trading strategy description.

    Step 1 — OpenAI extracts and validates strategy parameters as JSON.
    Step 2 — Claude writes a plain-English summary for the user (valid only).
    """
    if not body.description.strip():
        raise HTTPException(status_code=422, detail="Strategy description cannot be empty.")

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured. Add it to your .env file.",
        )
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to your .env file.",
        )

    # ── Step 1: OpenAI validates and extracts parameters ──────────────────────
    openai_client = openai_lib.AsyncOpenAI(api_key=settings.openai_api_key)
    try:
        openai_resp = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            max_tokens=512,
            temperature=0,      # deterministic — we want reliable JSON
            messages=[
                {"role": "system", "content": _OPENAI_PROMPT},
                {"role": "user",   "content": body.description},
            ],
        )
    except Exception as exc:
        logger.error("OpenAI strategy validation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {exc}")

    raw = (openai_resp.choices[0].message.content or "").strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("OpenAI returned non-JSON: %s", raw)
        raise HTTPException(
            status_code=502,
            detail="OpenAI returned an unexpected response. Please try again.",
        )

    # If OpenAI says invalid, return early — no need to call Claude.
    if not parsed.get("valid"):
        return StrategyResult(
            valid=False,
            reason=parsed.get("reason", "Strategy could not be validated."),
        )

    # ── Step 2: Claude writes a plain-English summary ─────────────────────────
    claude_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    summary_prompt = (
        "You are a helpful trading assistant. A user submitted a trading strategy that has "
        "been validated and structured by an analyst. Write a clear, friendly 3-4 sentence "
        "plain-English summary of the strategy. Focus on what it does and when it trades. "
        "End with exactly this sentence: "
        "'Would you like to approve this strategy and set a price alert based on it?'\n\n"
        f"Validated strategy parameters:\n{json.dumps(parsed, indent=2)}"
    )
    try:
        claude_resp = await claude_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": summary_prompt}],
        )
        summary = claude_resp.content[0].text.strip()
    except Exception as exc:
        logger.error("Claude summary step failed: %s", exc)
        summary = "Strategy validated successfully."

    return StrategyResult(
        valid=True,
        name=parsed.get("name", ""),
        entry_condition=parsed.get("entry_condition", ""),
        exit_condition=parsed.get("exit_condition", ""),
        timeframe=parsed.get("timeframe", ""),
        stop_loss=parsed.get("stop_loss", "Not specified"),
        take_profit=parsed.get("take_profit", "Not specified"),
        summary=summary,
    )
