"""
routers/journal.py — Trade journal: save AI setups, track outcomes automatically.

POST /api/journal          — save a trade setup
GET  /api/journal          — list all entries with auto-computed outcomes
DELETE /api/journal/{id}   — remove a journal entry

Outcome logic (checked on-the-fly against price_candles):
  After the setup's created_at timestamp, scan subsequent 1m candles and check
  whether the high/low of any candle has touched SL, TP1, TP2, or TP3.
  The FIRST level touched wins.  If nothing touched within 24 hours → expired.
  If it's been <24 h and nothing hit → pending.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.journal import JournalEntry
from app.models.price import PriceCandle

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


@router.delete("/{entry_id}", status_code=204)
async def delete_journal_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    """Remove a journal entry."""
    result = await db.execute(select(JournalEntry).where(JournalEntry.id == entry_id))
    entry  = result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    await db.delete(entry)
    await db.commit()
