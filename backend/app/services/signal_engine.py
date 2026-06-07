"""
services/signal_engine.py — Persisted signal lifecycle engine (Phase 85).

Creates signals from scanner output, manages status transitions, checks price
conditions against active signals, and expires stale candidates.

Signal lifecycle:
  candidate  → pending user review (auto-created by scanner worker)
  active     → manually activated by user
  hit_tp     → price reached TP1 while active
  hit_sl     → price reached stop-loss while active
  invalidated → manually invalidated (user action)
  expired    → still candidate after EXPIRE_AFTER hours
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.signal import Signal, SignalEvent

logger = logging.getLogger(__name__)

EXPIRE_AFTER_HOURS = 24   # candidate signals expire after this


# ── Context snapshot helper ───────────────────────────────────────────────────

async def _latest_context(db: AsyncSession, symbol: str) -> dict:
    """Return the latest factor_scores row for the symbol, or empty dict."""
    try:
        from sqlalchemy import text
        result = await db.execute(
            text("""
                SELECT context_score, crypto_score, macro_score, regime
                FROM factor_scores
                WHERE symbol = :sym
                ORDER BY computed_at DESC
                LIMIT 1
            """),
            {"sym": symbol},
        )
        row = result.one_or_none()
        if row:
            return {
                "context_score": float(row[0]) if row[0] is not None else None,
                "crypto_score":  float(row[1]) if row[1] is not None else None,
                "macro_score":   float(row[2]) if row[2] is not None else None,
                "regime":        row[3],
            }
    except Exception:
        pass
    return {}


# ── Price level helper ────────────────────────────────────────────────────────

def _compute_price_levels(current_price: float, direction: str) -> dict:
    """Compute basic entry/SL/TP levels from current price for a v1 candidate."""
    p = current_price
    if direction == "long":
        entry_low  = round(p * 0.9990, 2)
        entry_high = round(p * 1.0010, 2)
        stop_loss  = round(p * 0.9840, 2)   # -1.6%
        tp1        = round(p * 1.0200, 2)   # +2.0%
        tp2        = round(p * 1.0350, 2)   # +3.5%
        tp3        = round(p * 1.0500, 2)   # +5.0%
    else:
        entry_low  = round(p * 0.9990, 2)
        entry_high = round(p * 1.0010, 2)
        stop_loss  = round(p * 1.0160, 2)   # +1.6%
        tp1        = round(p * 0.9800, 2)   # -2.0%
        tp2        = round(p * 0.9650, 2)   # -3.5%
        tp3        = round(p * 0.9500, 2)   # -5.0%

    entry_mid = (entry_low + entry_high) / 2
    sl_dist   = abs(entry_mid - stop_loss)
    tp1_dist  = abs(entry_mid - tp1)
    rr        = round(tp1_dist / sl_dist, 1) if sl_dist > 0 else 0.0

    return {
        "entry_low":   entry_low,
        "entry_high":  entry_high,
        "stop_loss":   stop_loss,
        "tp1": tp1, "tp2": tp2, "tp3": tp3,
        "risk_reward": rr,
    }


# ── Create ─────────────────────────────────────────────────────────────────────

async def create_signal(
    db: AsyncSession,
    symbol: str,
    direction: str,           # 'long' | 'short'
    scanner_score: float,
    signal_count: int,
    current_price: float,
    signal_labels: list[str],
    timeframe: str = "15m",
    source: str = "scanner_auto",
    notes: Optional[str] = None,
) -> Signal:
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=EXPIRE_AFTER_HOURS)

    levels = _compute_price_levels(current_price, direction)
    ctx    = await _latest_context(db, symbol)

    sig = Signal(
        symbol        = symbol,
        timeframe     = timeframe,
        direction     = direction,
        status        = "candidate",
        source        = source,
        scanner_score = round(scanner_score, 3),
        signal_count  = signal_count,
        context_score = ctx.get("context_score"),
        crypto_score  = ctx.get("crypto_score"),
        macro_score   = ctx.get("macro_score"),
        regime        = ctx.get("regime"),
        entry_low     = levels["entry_low"],
        entry_high    = levels["entry_high"],
        stop_loss     = levels["stop_loss"],
        tp1           = levels["tp1"],
        tp2           = levels["tp2"],
        tp3           = levels["tp3"],
        risk_reward   = levels["risk_reward"],
        signal_labels = signal_labels,
        created_at    = now,
        expires_at    = expires_at,
        notes         = notes,
    )
    db.add(sig)
    await db.flush()

    db.add(SignalEvent(
        signal_id  = sig.id,
        event_type = "created",
        price_at   = current_price,
        timestamp  = now,
        notes      = f"Auto-created · composite {scanner_score:+.3f} · {signal_count} signals",
    ))
    await db.commit()
    logger.info("Signal created: %s %s %s id=%d", symbol, direction.upper(), timeframe, sig.id)
    return sig


# ── Activate ───────────────────────────────────────────────────────────────────

async def activate_signal(
    db: AsyncSession,
    signal_id: int,
    price: Optional[float] = None,
) -> Signal:
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Signal)
        .where(Signal.id == signal_id)
        .values(status="active", activated_at=now)
    )
    db.add(SignalEvent(
        signal_id  = signal_id,
        event_type = "activated",
        price_at   = price,
        timestamp  = now,
    ))
    await db.commit()
    result = await db.execute(select(Signal).where(Signal.id == signal_id))
    return result.scalar_one()


# ── Invalidate ─────────────────────────────────────────────────────────────────

async def invalidate_signal(
    db: AsyncSession,
    signal_id: int,
    price: Optional[float] = None,
    notes: Optional[str] = None,
) -> Signal:
    now = datetime.now(timezone.utc)
    await db.execute(
        update(Signal)
        .where(Signal.id == signal_id)
        .values(status="invalidated", closed_at=now, close_reason="invalidated")
    )
    db.add(SignalEvent(
        signal_id  = signal_id,
        event_type = "invalidated",
        price_at   = price,
        timestamp  = now,
        notes      = notes,
    ))
    await db.commit()
    result = await db.execute(select(Signal).where(Signal.id == signal_id))
    return result.scalar_one()


# ── Price checks on active signals ─────────────────────────────────────────────

async def check_signal_prices(db: AsyncSession, symbol: str, current_price: float) -> int:
    """
    For all active signals on the given symbol, check if price hit TP1 or SL.
    Returns the number of signals transitioned.
    """
    result = await db.execute(
        select(Signal)
        .where(Signal.symbol == symbol, Signal.status == "active")
    )
    active = result.scalars().all()
    closed = 0
    now = datetime.now(timezone.utc)

    for sig in active:
        hit_event = None
        new_status = None
        close_reason = None

        if sig.direction == "long":
            if sig.tp1 and current_price >= sig.tp1:
                hit_event, new_status, close_reason = "tp_hit", "hit_tp", "tp"
            elif sig.stop_loss and current_price <= sig.stop_loss:
                hit_event, new_status, close_reason = "sl_hit", "hit_sl", "sl"
        else:  # short
            if sig.tp1 and current_price <= sig.tp1:
                hit_event, new_status, close_reason = "tp_hit", "hit_tp", "tp"
            elif sig.stop_loss and current_price >= sig.stop_loss:
                hit_event, new_status, close_reason = "sl_hit", "hit_sl", "sl"

        if hit_event:
            await db.execute(
                update(Signal)
                .where(Signal.id == sig.id)
                .values(status=new_status, closed_at=now, close_reason=close_reason)
            )
            db.add(SignalEvent(
                signal_id  = sig.id,
                event_type = hit_event,
                price_at   = current_price,
                timestamp  = now,
            ))
            closed += 1

    if closed:
        await db.commit()
    return closed


# ── Expire stale candidates ────────────────────────────────────────────────────

async def expire_old_candidates(db: AsyncSession) -> int:
    """Mark candidate signals past their expires_at as expired."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Signal)
        .where(Signal.status == "candidate", Signal.expires_at <= now)
    )
    stale = result.scalars().all()

    for sig in stale:
        await db.execute(
            update(Signal)
            .where(Signal.id == sig.id)
            .values(status="expired", closed_at=now, close_reason="expired")
        )
        db.add(SignalEvent(
            signal_id  = sig.id,
            event_type = "expired",
            timestamp  = now,
        ))

    if stale:
        await db.commit()
    return len(stale)
