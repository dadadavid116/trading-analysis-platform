"""
routers/signals.py — Persisted signal queue API (Phase 85).

GET  /api/signals/           — list signals (filter by status + symbol)
GET  /api/signals/{id}       — signal detail with event history
POST /api/signals/{id}/activate   — transition candidate → active
POST /api/signals/{id}/invalidate — transition → invalidated
"""

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.signal import Signal, SignalEvent
from app.services.signal_engine import (
    activate_signal, invalidate_signal, expire_old_candidates,
)

router = APIRouter(prefix="/signals", tags=["signals"])


# ── Schema helpers ─────────────────────────────────────────────────────────────

def _sig_to_dict(s: Signal) -> dict:
    return {
        "id":            s.id,
        "symbol":        s.symbol,
        "timeframe":     s.timeframe,
        "direction":     s.direction,
        "status":        s.status,
        "source":        s.source,
        "scanner_score": s.scanner_score,
        "signal_count":  s.signal_count,
        "context_score": s.context_score,
        "crypto_score":  s.crypto_score,
        "macro_score":   s.macro_score,
        "regime":        s.regime,
        "entry_low":     s.entry_low,
        "entry_high":    s.entry_high,
        "stop_loss":     s.stop_loss,
        "tp1":           s.tp1,
        "tp2":           s.tp2,
        "tp3":           s.tp3,
        "risk_reward":   s.risk_reward,
        "signal_labels": s.signal_labels or [],
        "created_at":    s.created_at.isoformat() if s.created_at else None,
        "activated_at":  s.activated_at.isoformat() if s.activated_at else None,
        "closed_at":     s.closed_at.isoformat() if s.closed_at else None,
        "expires_at":    s.expires_at.isoformat() if s.expires_at else None,
        "close_reason":  s.close_reason,
        "notes":         s.notes,
    }


def _evt_to_dict(e: SignalEvent) -> dict:
    return {
        "id":         e.id,
        "signal_id":  e.signal_id,
        "event_type": e.event_type,
        "price_at":   e.price_at,
        "timestamp":  e.timestamp.isoformat() if e.timestamp else None,
        "notes":      e.notes,
    }


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("/")
async def list_signals(
    status: Optional[str] = Query(None, description="Comma-separated status list, e.g. 'candidate,active'"),
    symbol: Optional[str] = Query(None),
    limit:  int           = Query(50, ge=1, le=200),
    db:     AsyncSession  = Depends(get_db),
):
    """List persisted signals. Runs expiry check before returning."""
    await expire_old_candidates(db)

    q = select(Signal).order_by(desc(Signal.created_at)).limit(limit)

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        q = q.where(Signal.status.in_(statuses))

    if symbol:
        q = q.where(Signal.symbol == symbol.upper())

    result = await db.execute(q)
    signals = result.scalars().all()
    return {"signals": [_sig_to_dict(s) for s in signals], "total": len(signals)}


# ── Detail ─────────────────────────────────────────────────────────────────────

@router.get("/{signal_id}")
async def get_signal(signal_id: int, db: AsyncSession = Depends(get_db)):
    """Return a signal and its full event history."""
    result = await db.execute(select(Signal).where(Signal.id == signal_id))
    sig = result.scalar_one_or_none()
    if not sig:
        raise HTTPException(status_code=404, detail=f"Signal {signal_id} not found.")

    evt_result = await db.execute(
        select(SignalEvent)
        .where(SignalEvent.signal_id == signal_id)
        .order_by(SignalEvent.timestamp)
    )
    events = evt_result.scalars().all()

    return {**_sig_to_dict(sig), "events": [_evt_to_dict(e) for e in events]}


# ── Activate ───────────────────────────────────────────────────────────────────

class PriceBody(BaseModel):
    price: Optional[float] = None
    notes: Optional[str]   = None


@router.post("/{signal_id}/activate")
async def activate(signal_id: int, body: PriceBody = PriceBody(), db: AsyncSession = Depends(get_db)):
    """Transition a candidate signal to active."""
    result = await db.execute(select(Signal).where(Signal.id == signal_id))
    sig = result.scalar_one_or_none()
    if not sig:
        raise HTTPException(status_code=404, detail=f"Signal {signal_id} not found.")
    if sig.status not in ("candidate",):
        raise HTTPException(status_code=400, detail=f"Cannot activate signal in status '{sig.status}'.")
    updated = await activate_signal(db, signal_id, price=body.price)
    return _sig_to_dict(updated)


# ── Invalidate ─────────────────────────────────────────────────────────────────

@router.post("/{signal_id}/invalidate")
async def invalidate(signal_id: int, body: PriceBody = PriceBody(), db: AsyncSession = Depends(get_db)):
    """Manually invalidate a candidate or active signal."""
    result = await db.execute(select(Signal).where(Signal.id == signal_id))
    sig = result.scalar_one_or_none()
    if not sig:
        raise HTTPException(status_code=404, detail=f"Signal {signal_id} not found.")
    if sig.status not in ("candidate", "active"):
        raise HTTPException(status_code=400, detail=f"Cannot invalidate signal in status '{sig.status}'.")
    updated = await invalidate_signal(db, signal_id, price=body.price, notes=body.notes)
    return _sig_to_dict(updated)
