"""
claude_client.py — AI-assisted market analysis worker.

Reads the latest BTC market data from the database, calls the Claude API,
and stores the generated summary in the analysis_summaries table.

Called on a schedule by run.py. The interval is set via ANALYSIS_INTERVAL_MINUTES
in your .env file (default: 10 minutes).
"""

import logging
from datetime import datetime, timezone

import anthropic
from sqlalchemy import select, desc

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.analysis import AnalysisSummary
from app.models.liquidation import Liquidation
from app.models.orderbook import OrderBookSnapshot
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)

# Model used for analysis. Haiku is fast and cost-efficient for short summaries.
CLAUDE_MODEL = "claude-haiku-4-5-20251001"


async def _fetch_market_context() -> dict:
    """Read the latest price candle, recent liquidations, and order book from the DB."""
    async with AsyncSessionLocal() as session:
        # Latest closed candle
        r = await session.execute(
            select(PriceCandle)
            .where(PriceCandle.symbol == "BTCUSDT")
            .order_by(desc(PriceCandle.timestamp))
            .limit(1)
        )
        candle = r.scalar_one_or_none()

        # 5 most recent liquidation events
        r = await session.execute(
            select(Liquidation)
            .where(Liquidation.symbol == "BTCUSDT")
            .order_by(desc(Liquidation.timestamp))
            .limit(5)
        )
        liquidations = list(r.scalars().all())

        # Latest order book snapshot
        r = await session.execute(
            select(OrderBookSnapshot)
            .where(OrderBookSnapshot.symbol == "BTCUSDT")
            .order_by(desc(OrderBookSnapshot.timestamp))
            .limit(1)
        )
        snapshot = r.scalar_one_or_none()

    return {"candle": candle, "liquidations": liquidations, "snapshot": snapshot}


def _build_prompt(ctx: dict) -> str:
    """Build the prompt for Claude using current market data."""
    candle = ctx["candle"]
    liquidations = ctx["liquidations"]
    snapshot = ctx["snapshot"]

    lines = [
        "You are a concise crypto market analyst. Based on the current BTC/USDT market data "
        "snapshot below, write a 3–4 sentence market summary. Be factual and highlight any notable patterns.",
        "",
    ]

    if candle:
        lines.append(
            f"Latest 1m candle (close time {candle.timestamp.strftime('%H:%M UTC')}): "
            f"close=${candle.close:,.2f}  open=${candle.open:,.2f}  "
            f"high=${candle.high:,.2f}  low=${candle.low:,.2f}  "
            f"volume={candle.volume:.4f} BTC"
        )
    else:
        lines.append("Latest price: no data available yet.")

    if liquidations:
        liq_parts = [
            f"{liq.side.upper()} ${liq.price:,.2f} {liq.quantity:.3f} BTC"
            for liq in liquidations
        ]
        lines.append(f"Recent liquidations (newest first): {' | '.join(liq_parts)}")
    else:
        lines.append("Recent liquidations: none recorded.")

    if snapshot and snapshot.bids and snapshot.asks:
        best_bid = snapshot.bids[0]
        best_ask = snapshot.asks[0]
        spread = float(best_ask[0]) - float(best_bid[0])
        lines.append(
            f"Order book: best bid=${float(best_bid[0]):,.2f} ({float(best_bid[1]):.4f} BTC)  "
            f"best ask=${float(best_ask[0]):,.2f} ({float(best_ask[1]):.4f} BTC)  "
            f"spread=${spread:.2f}"
        )
    else:
        lines.append("Order book: no snapshot available yet.")

    return "\n".join(lines)


async def generate_and_store() -> None:
    """
    Fetch market data, call Claude, and store the result.

    Skips silently if:
    - ANTHROPIC_API_KEY is not set
    - No market data is in the DB yet
    - The Claude API call fails (logs the error, does not crash the worker)
    """
    if not settings.anthropic_api_key:
        logger.warning(
            "ANTHROPIC_API_KEY is not set in .env — skipping analysis. "
            "Add your key to .env to enable the analysis panel."
        )
        return

    ctx = await _fetch_market_context()

    if ctx["candle"] is None:
        logger.info("No price data in DB yet — skipping analysis until data arrives.")
        return

    prompt = _build_prompt(ctx)

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        summary_text = message.content[0].text.strip()
    except Exception as exc:
        logger.error("Claude API call failed: %s", exc)
        return

    summary = AnalysisSummary(
        symbol="BTCUSDT",
        generated_at=datetime.now(tz=timezone.utc),
        summary_text=summary_text,
        model_used=CLAUDE_MODEL,
    )
    async with AsyncSessionLocal() as session:
        session.add(summary)
        await session.commit()

    logger.info(
        "Analysis summary stored. model=%s  length=%d chars",
        CLAUDE_MODEL,
        len(summary_text),
    )
