"""
workers/journal_worker.py — Background journal outcome notifier.

Periodically checks journal entries that have not yet been announced as closed.
When a setup closes (hits the stop loss, a take-profit, or expires after 24h),
it logs a `trade_closed` event and sends a Telegram message — exactly once per
entry — then records `notified_outcome` on the row so it never re-fires.

First-pass backfill
-------------------
On the very first cycle after startup, any already-closed entries are marked as
notified *silently* (no event, no Telegram). This prevents a notification flood
for historical trades the moment the feature is deployed. Trades that close
during normal operation (after that first pass) are announced normally.

Started automatically by the FastAPI lifespan in main.py.
Status is readable via GET /api/journal/notifier-status.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.journal import JournalEntry
from app.routers.journal import _compute_outcome
from app.services.event_logger import log_event

logger = logging.getLogger(__name__)

# ── Tunable constants ─────────────────────────────────────────────────────────

CHECK_INTERVAL  = 2 * 60   # seconds between outcome checks
CLOSED_OUTCOMES = {"tp1", "tp2", "tp3", "sl", "expired"}

# ── Module-level state (read by the status endpoint) ──────────────────────────

last_check_at:       datetime | None = None
notifications_sent:  int             = 0
_initialized:        bool            = False   # False until the first pass completes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_telegram(entry: JournalEntry, outcome: str) -> str:
    labels  = {"BTCUSDT": "BTC/USDT", "ETHUSDT": "ETH/USDT", "SOLUSDT": "SOL/USDT"}
    display = labels.get(entry.symbol, entry.symbol)
    bias    = entry.bias.upper()

    if outcome == "sl":
        emoji, head = "\U0001f534", "Stop loss hit"          # red circle
    elif outcome == "expired":
        emoji, head = "⏱️", "Expired (24h, no level hit)"  # stopwatch
    else:
        emoji, head = "\U0001f7e2", f"{outcome.upper()} reached"     # green circle

    return f"{emoji} Journal: {display} {bias} setup — {head} (R/R {entry.risk_reward:.1f}x)"


# ── Core check ────────────────────────────────────────────────────────────────

async def _run_once() -> None:
    global last_check_at, notifications_sent, _initialized

    now          = datetime.now(timezone.utc)
    last_check_at = now

    # Capture (and flip) the first-pass flag up front so a mid-cycle error can't
    # leave us stuck silently backfilling forever.
    first_pass   = not _initialized
    _initialized = True

    token       = settings.telegram_bot_token
    chat_id     = settings.telegram_chat_id
    telegram_ok = bool(token and chat_id)

    async with AsyncSessionLocal() as db:
        result  = await db.execute(
            select(JournalEntry).where(JournalEntry.notified_outcome.is_(None))
        )
        entries = list(result.scalars().all())

        for entry in entries:
            try:
                outcome = await _compute_outcome(entry, db)
            except Exception as exc:
                logger.warning("Journal worker: outcome check failed for id=%d: %s", entry.id, exc)
                continue

            if outcome not in CLOSED_OUTCOMES:
                continue   # still pending — leave notified_outcome NULL

            # Record the close so this entry is never processed again.
            entry.notified_outcome = outcome
            await db.commit()

            # On the first pass, backfill silently to avoid deploy-time spam.
            if first_pass:
                continue

            await log_event(
                service    = "journal",
                event_type = "trade_closed",
                message    = f"Trade closed: {entry.symbol} {entry.bias.upper()} setup -> {outcome.upper()}",
                symbol     = entry.symbol,
                detail     = {"id": entry.id, "outcome": outcome, "rr": entry.risk_reward},
            )

            if not telegram_ok:
                logger.info("Journal close for id=%d (%s) — Telegram not configured.", entry.id, outcome)
                notifications_sent += 1
                continue

            text = _format_telegram(entry, outcome)
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"https://api.telegram.org/bot{token}/sendMessage",
                        json={"chat_id": chat_id, "text": text},
                    )
                    resp.raise_for_status()
                notifications_sent += 1
                logger.info("Journal close notification sent for id=%d (%s).", entry.id, outcome)
            except Exception as exc:
                logger.error("Journal Telegram send failed for id=%d: %s", entry.id, exc)


# ── Worker loop ───────────────────────────────────────────────────────────────

async def run_journal_worker() -> None:
    """
    Infinite background loop. Started once from the FastAPI lifespan.
    Waits 45 s on startup so collectors have time to begin populating prices.
    """
    logger.info("Journal outcome notifier worker started (interval=%ds).", CHECK_INTERVAL)
    await asyncio.sleep(45)

    while True:
        try:
            await _run_once()
        except Exception as exc:
            logger.error("Journal worker cycle error: %s", exc)
        await asyncio.sleep(CHECK_INTERVAL)
