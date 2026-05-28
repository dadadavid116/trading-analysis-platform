"""
routers/journal.py — Trade journal: save AI setups, track outcomes automatically.

POST /api/journal          — save a trade setup
GET  /api/journal          — list all entries with auto-computed outcomes
GET  /api/journal/stats    — aggregated performance statistics
DELETE /api/journal/{id}   — remove a journal entry

Outcome logic (checked on-the-fly against price_candles):
  After the setup's created_at timestamp, scan subsequent 1m candles and check
  whether the high/low of any candle has touched SL, TP1, TP2, or TP3.
  The FIRST level touched wins.  If nothing touched within 24 hours → expired.
  If it's been <24 h and nothing hit → pending.
"""

import json
import logging
from datetime import datetime, timedelta, timezone

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.journal import JournalEntry
from app.models.price import PriceCandle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/journal", tags=["journal"])

OUTCOME_WINDOW_H = 24   # hours before a pending setup becomes "expired"


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class SaveSetupRequest(BaseModel):
    symbol:      str
    bias:        str
    entry_low:   float
    entry_high:  float
    stop_loss:   float
    take_profit: list[float]   # exactly 3 items
    risk_reward: float
    reasoning:   str
    key_risks:   str
    scanner_bias: str = "neutral"


class JournalEntryOut(BaseModel):
    id:          int
    created_at:  str
    symbol:      str
    bias:        str
    entry_low:   float
    entry_high:  float
    stop_loss:   float
    take_profit1: float
    take_profit2: float
    take_profit3: float
    risk_reward: float
    reasoning:   str
    key_risks:   str
    scanner_bias: str | None
    outcome:     str   # "pending" | "tp1" | "tp2" | "tp3" | "sl" | "expired"

    class Config:
        from_attributes = True


# ── Outcome checker ────────────────────────────────────────────────────────────

async def _compute_outcome(entry: JournalEntry, db: AsyncSession) -> str:
    """
    Walk forward through 1-minute candles after the setup was saved.
    Return the first level touched, or "expired"/"pending".
    """
    now        = datetime.now(timezone.utc)
    deadline   = entry.created_at + timedelta(hours=OUTCOME_WINDOW_H)
    scan_until = min(now, deadline)

    result = await db.execute(
        select(PriceCandle.high, PriceCandle.low, PriceCandle.timestamp)
        .where(
            PriceCandle.symbol == entry.symbol,
            PriceCandle.timestamp > entry.created_at,
            PriceCandle.timestamp <= scan_until,
        )
        .order_by(PriceCandle.timestamp)
    )
    candles = result.all()

    sl  = entry.stop_loss
    tp1 = entry.take_profit1
    tp2 = entry.take_profit2
    tp3 = entry.take_profit3
    is_long = entry.bias == "long"

    for candle in candles:
        high = float(candle.high)
        low  = float(candle.low)

        if is_long:
            # SL below, TPs above
            if low  <= sl:  return "sl"
            if high >= tp3: return "tp3"
            if high >= tp2: return "tp2"
            if high >= tp1: return "tp1"
        else:
            # SL above, TPs below
            if high >= sl:  return "sl"
            if low  <= tp3: return "tp3"
            if low  <= tp2: return "tp2"
            if low  <= tp1: return "tp1"

    return "expired" if now >= deadline else "pending"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def save_journal_entry(body: SaveSetupRequest, db: AsyncSession = Depends(get_db)):
    """Save a trade setup to the journal."""
    if len(body.take_profit) != 3:
        raise HTTPException(status_code=422, detail="take_profit must have exactly 3 values.")

    entry = JournalEntry(
        symbol       = body.symbol.upper(),
        bias         = body.bias,
        entry_low    = body.entry_low,
        entry_high   = body.entry_high,
        stop_loss    = body.stop_loss,
        take_profit1 = body.take_profit[0],
        take_profit2 = body.take_profit[1],
        take_profit3 = body.take_profit[2],
        risk_reward  = body.risk_reward,
        reasoning    = body.reasoning,
        key_risks    = body.key_risks,
        scanner_bias = body.scanner_bias,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    try:
        from app.services.event_logger import log_event
        await log_event(
            service    = "analysis",
            event_type = "journal_save",
            message    = f"Journal: saved {entry.symbol} {entry.bias.upper()} setup (id={entry.id})",
            symbol     = entry.symbol,
            detail     = {"id": entry.id, "bias": entry.bias, "rr": entry.risk_reward},
        )
    except Exception:
        pass

    return {"id": entry.id}


@router.get("", response_model=list[JournalEntryOut])
async def list_journal_entries(db: AsyncSession = Depends(get_db)):
    """Return all journal entries newest-first, with outcomes computed on the fly."""
    result  = await db.execute(
        select(JournalEntry).order_by(desc(JournalEntry.created_at))
    )
    entries = result.scalars().all()

    out = []
    for e in entries:
        outcome = await _compute_outcome(e, db)
        out.append(JournalEntryOut(
            id           = e.id,
            created_at   = e.created_at.isoformat(),
            symbol       = e.symbol,
            bias         = e.bias,
            entry_low    = e.entry_low,
            entry_high   = e.entry_high,
            stop_loss    = e.stop_loss,
            take_profit1 = e.take_profit1,
            take_profit2 = e.take_profit2,
            take_profit3 = e.take_profit3,
            risk_reward  = e.risk_reward,
            reasoning    = e.reasoning,
            key_risks    = e.key_risks,
            scanner_bias = e.scanner_bias,
            outcome      = outcome,
        ))
    return out


@router.get("/stats")
async def journal_performance_stats(db: AsyncSession = Depends(get_db)):
    """
    Compute aggregated performance statistics across all journal entries.

    Returns win rate, expectancy, per-symbol and per-bias breakdowns, outcome
    distribution, and the current win/loss streak (from newest entry backwards).
    """
    result  = await db.execute(select(JournalEntry).order_by(desc(JournalEntry.created_at)))
    entries = result.scalars().all()

    if not entries:
        return {
            "total": 0, "closed": 0, "pending": 0, "expired": 0,
            "wins": 0, "losses": 0,
            "win_rate": None, "avg_rr": None, "expectancy": None,
            "by_outcome": {"tp1": 0, "tp2": 0, "tp3": 0, "sl": 0, "expired": 0, "pending": 0},
            "by_symbol":  {},
            "by_bias":    {"long": {"wins": 0, "losses": 0}, "short": {"wins": 0, "losses": 0}},
            "streak":     0,
        }

    # Compute all outcomes in one pass (newest → oldest, matching entries order)
    outcomes: list[str] = [await _compute_outcome(e, db) for e in entries]

    by_outcome: dict[str, int] = {"tp1": 0, "tp2": 0, "tp3": 0, "sl": 0, "expired": 0, "pending": 0}
    by_symbol:  dict[str, dict[str, int]] = {}
    by_bias:    dict[str, dict[str, int]] = {
        "long":  {"wins": 0, "losses": 0},
        "short": {"wins": 0, "losses": 0},
    }
    rr_wins: list[float] = []

    for entry, outcome in zip(entries, outcomes):
        by_outcome[outcome] = by_outcome.get(outcome, 0) + 1

        sym = entry.symbol
        if sym not in by_symbol:
            by_symbol[sym] = {"wins": 0, "losses": 0}

        if outcome in ("tp1", "tp2", "tp3"):
            by_symbol[sym]["wins"] += 1
            by_bias[entry.bias]["wins"] += 1
            rr_wins.append(entry.risk_reward)
        elif outcome == "sl":
            by_symbol[sym]["losses"] += 1
            by_bias[entry.bias]["losses"] += 1

    closed  = sum(by_outcome[k] for k in ("tp1", "tp2", "tp3", "sl"))
    wins    = by_outcome["tp1"] + by_outcome["tp2"] + by_outcome["tp3"]
    losses  = by_outcome["sl"]

    win_rate   = round(wins / closed, 3)   if closed > 0           else None
    avg_rr     = round(sum(rr_wins) / len(rr_wins), 2) if rr_wins  else None
    expectancy = (
        round(win_rate * avg_rr - (1 - win_rate), 3)
        if win_rate is not None and avg_rr is not None
        else None
    )

    # Streak: walk newest→oldest counting consecutive same-direction outcomes
    streak = 0
    for outcome in outcomes:
        if outcome in ("tp1", "tp2", "tp3"):
            if streak < 0: break
            streak += 1
        elif outcome == "sl":
            if streak > 0: break
            streak -= 1
        else:
            break  # pending / expired resets streak count

    return {
        "total":      len(entries),
        "closed":     closed,
        "pending":    by_outcome["pending"],
        "expired":    by_outcome["expired"],
        "wins":       wins,
        "losses":     losses,
        "win_rate":   win_rate,
        "avg_rr":     avg_rr,
        "expectancy": expectancy,
        "by_outcome": by_outcome,
        "by_symbol":  by_symbol,
        "by_bias":    by_bias,
        "streak":     streak,
    }


@router.post("/insights")
async def journal_insights(db: AsyncSession = Depends(get_db)):
    """
    Ask Claude to analyze the trade journal and return structured improvement feedback.

    Returns: { summary, patterns, biases, suggestions }
    """
    result  = await db.execute(select(JournalEntry).order_by(desc(JournalEntry.created_at)))
    entries = result.scalars().all()

    if not entries:
        raise HTTPException(status_code=400, detail="No journal entries to analyze.")

    outcomes = [await _compute_outcome(e, db) for e in entries]

    # Summary stats
    wins    = sum(1 for o in outcomes if o in ("tp1", "tp2", "tp3"))
    losses  = sum(1 for o in outcomes if o == "sl")
    closed  = wins + losses
    wr_text = f"{wins/closed*100:.1f}%" if closed > 0 else "N/A"

    # Most recent 20 non-pending trades as text rows
    trade_rows = []
    for e, o in zip(entries, outcomes):
        if o == "pending" or len(trade_rows) >= 20:
            continue
        date = e.created_at.strftime("%Y-%m-%d")
        sym  = e.symbol.replace("USDT", "")
        reasoning_short = (e.reasoning or "")[:80].replace("\n", " ")
        trade_rows.append(
            f"- {date} {sym} {e.bias.upper()} → {o.upper()} "
            f"(R/R {e.risk_reward:.1f}x) | {reasoning_short}"
        )

    trades_text = "\n".join(trade_rows) if trade_rows else "No closed trades yet."

    prompt = (
        f"You are analyzing a crypto trader's journal. Be concise and specific.\n\n"
        f"Stats: {closed} closed trades · {wins}W / {losses}L · win rate {wr_text}\n\n"
        f"Recent trades:\n{trades_text}\n\n"
        "Respond with valid JSON only, no markdown fences:\n"
        '{"summary":"2-3 sentence assessment",'
        '"patterns":["pattern 1","pattern 2","pattern 3"],'
        '"biases":["bias 1","bias 2"],'
        '"suggestions":["suggestion 1","suggestion 2","suggestion 3"]}'
    )

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        msg    = await client.messages.create(
            model      = "claude-haiku-4-5-20251001",
            max_tokens = 600,
            messages   = [{"role": "user", "content": prompt}],
        )
        raw  = msg.content[0].text.strip()
        # Strip markdown fences if model adds them
        if raw.startswith("```"):
            parts = raw.split("```")
            raw   = parts[1].lstrip("json").strip() if len(parts) > 1 else raw
        return json.loads(raw)
    except Exception as exc:
        logger.error("Journal insights error: %s", exc)
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {exc}")


@router.delete("/{entry_id}", status_code=204)
async def delete_journal_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a journal entry."""
    result = await db.execute(select(JournalEntry).where(JournalEntry.id == entry_id))
    entry  = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    await db.delete(entry)
    await db.commit()
