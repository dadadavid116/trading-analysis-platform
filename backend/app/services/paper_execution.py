"""
services/paper_execution.py — Paper execution adapter (Phase 89).

Flow:
  1. create_proposal()  — pull signal levels, run risk assessment, store proposal (status=pending)
  2. approve_proposal() — user confirms; creates order + fills immediately → position
  3. reject_proposal()  — user dismisses; status=rejected, no order created
  4. check_sl_tp()      — scan open positions vs latest DB price; auto-close on SL/TP hit
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, desc, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution import ExecutionProposal
from app.models.signal import Signal
from app.services.risk_engine import assess_trade
from app.services.order_service import create_order, fill_order
from app.services.account_state import close_position, get_account_state
from app.services.event_logger import log_event

logger = logging.getLogger(__name__)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _prop_dict(p: ExecutionProposal) -> dict:
    return {
        "id":           p.id,
        "signal_id":    p.signal_id,
        "symbol":       p.symbol,
        "direction":    p.direction,
        "timeframe":    p.timeframe,
        "entry_price":  p.entry_price,
        "stop_loss":    p.stop_loss,
        "tp1":          p.tp1,
        "tp2":          p.tp2,
        "tp3":          p.tp3,
        "size_usd":     p.size_usd,
        "risk_usd":     p.risk_usd,
        "risk_pct":     p.risk_pct,
        "risk_verdict": p.risk_verdict,
        "risk_reasons": json.loads(p.risk_reasons)  if p.risk_reasons  else [],
        "risk_warnings":json.loads(p.risk_warnings) if p.risk_warnings else [],
        "status":       p.status,
        "order_id":     p.order_id,
        "position_id":  p.position_id,
        "created_at":   p.created_at.isoformat() if p.created_at  else None,
        "reviewed_at":  p.reviewed_at.isoformat() if p.reviewed_at else None,
        "notes":        p.notes,
    }


async def _latest_price(db: AsyncSession, symbol: str) -> Optional[float]:
    """Fetch the most recent close price for a symbol from price_candles."""
    result = await db.execute(text("""
        SELECT close FROM price_candles
        WHERE symbol = :sym
        ORDER BY open_time DESC LIMIT 1
    """), {"sym": symbol})
    row = result.fetchone()
    return float(row[0]) if row else None


# ── Proposal lifecycle ─────────────────────────────────────────────────────────

async def create_proposal(
    db:            AsyncSession,
    signal_id:     Optional[int] = None,
    symbol:        Optional[str] = None,
    direction:     Optional[str] = None,
    entry_price:   Optional[float] = None,
    stop_loss:     Optional[float] = None,
    tp1:           Optional[float] = None,
    tp2:           Optional[float] = None,
    tp3:           Optional[float] = None,
    timeframe:     str = "15m",
    notes:         Optional[str] = None,
) -> ExecutionProposal:
    """
    Build a proposal from a signal or explicit levels.
    Runs risk assessment to size the position.
    """
    # Pull levels from signal if signal_id provided
    if signal_id is not None:
        result = await db.execute(select(Signal).where(Signal.id == signal_id))
        sig = result.scalar_one_or_none()
        if not sig:
            raise ValueError(f"Signal {signal_id} not found.")
        symbol    = symbol    or sig.symbol
        direction = direction or sig.direction
        timeframe = sig.timeframe or timeframe
        # Use signal mid-entry as the reference price
        if entry_price is None and sig.entry_low and sig.entry_high:
            entry_price = round((sig.entry_low + sig.entry_high) / 2, 6)
        stop_loss = stop_loss or sig.stop_loss
        tp1       = tp1       or sig.tp1
        tp2       = tp2       or sig.tp2
        tp3       = tp3       or sig.tp3

    if not symbol or not direction or not entry_price:
        raise ValueError("symbol, direction, and entry_price are required.")
    if not stop_loss:
        raise ValueError("stop_loss is required for risk sizing.")

    # Run risk assessment to determine position size
    assessment = await assess_trade(db, entry_price=entry_price, stop_loss=stop_loss)

    proposal = ExecutionProposal(
        signal_id    = signal_id,
        symbol       = symbol.upper(),
        direction    = direction,
        timeframe    = timeframe,
        entry_price  = entry_price,
        stop_loss    = stop_loss,
        tp1          = tp1,
        tp2          = tp2,
        tp3          = tp3,
        size_usd     = assessment.suggested_size_usd,
        risk_usd     = assessment.risk_usd,
        risk_pct     = assessment.risk_pct_of_equity,
        risk_verdict = assessment.verdict,
        risk_reasons = json.dumps(assessment.reasons),
        risk_warnings= json.dumps(assessment.warnings),
        status       = "pending",
        created_at   = datetime.now(timezone.utc),
        notes        = notes,
    )
    db.add(proposal)
    await db.commit()
    await db.refresh(proposal)

    await log_event("execution", "proposal_created", f"PROPOSAL created: {symbol} {direction.upper()} ${proposal.size_usd:.0f} verdict={assessment.verdict}", symbol=symbol)
    logger.info("Proposal created: id=%d %s %s size=%.0f verdict=%s", proposal.id, symbol, direction, proposal.size_usd, assessment.verdict)
    return proposal


async def approve_proposal(db: AsyncSession, proposal_id: int) -> ExecutionProposal:
    """
    User approves the proposal. Creates a paper order and immediately fills it.
    Blocked proposals can still be approved (user override with warning).
    """
    result = await db.execute(select(ExecutionProposal).where(ExecutionProposal.id == proposal_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise ValueError(f"Proposal {proposal_id} not found.")
    if prop.status != "pending":
        raise ValueError(f"Proposal {proposal_id} is not pending (status: {prop.status}).")

    # Create and immediately fill a paper order at the entry price
    order = await create_order(
        db,
        symbol          = prop.symbol,
        direction       = prop.direction,
        size_usd        = prop.size_usd,
        requested_price = prop.entry_price,
        stop_loss       = prop.stop_loss,
        tp1             = prop.tp1,
        tp2             = prop.tp2,
        tp3             = prop.tp3,
        signal_id       = prop.signal_id,
        notes           = f"proposal_id={prop.id}",
    )
    filled = await fill_order(db, order.id, fill_price=prop.entry_price, notes=f"paper fill for proposal {prop.id}")

    prop.status      = "approved"
    prop.order_id    = filled.id
    prop.position_id = filled.position_id
    prop.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(prop)

    await log_event("execution", "proposal_approved", f"PROPOSAL approved → POSITION opened: {prop.symbol} {prop.direction.upper()} ${prop.size_usd:.0f} entry={prop.entry_price}", symbol=prop.symbol)
    return prop


async def reject_proposal(db: AsyncSession, proposal_id: int, notes: Optional[str] = None) -> ExecutionProposal:
    result = await db.execute(select(ExecutionProposal).where(ExecutionProposal.id == proposal_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise ValueError(f"Proposal {proposal_id} not found.")
    if prop.status != "pending":
        raise ValueError(f"Proposal {proposal_id} is not pending (status: {prop.status}).")

    prop.status      = "rejected"
    prop.reviewed_at = datetime.now(timezone.utc)
    if notes:
        prop.notes = notes
    await db.commit()
    await db.refresh(prop)
    await log_event("execution", "proposal_rejected", f"PROPOSAL rejected: {prop.symbol} {prop.direction.upper()}", symbol=prop.symbol)
    return prop


async def list_proposals(
    db:     AsyncSession,
    status: Optional[str] = None,
    limit:  int = 50,
) -> list[dict]:
    q = select(ExecutionProposal).order_by(desc(ExecutionProposal.created_at)).limit(limit)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        q = q.where(ExecutionProposal.status.in_(statuses))
    result = await db.execute(q)
    return [_prop_dict(p) for p in result.scalars().all()]


# ── SL / TP tracker ────────────────────────────────────────────────────────────

async def check_sl_tp(db: AsyncSession) -> list[dict]:
    """
    For every open position, fetch the latest DB price and check SL/TP.
    Auto-closes on hit. Returns list of triggered events.
    """
    from app.models.account import OpenPosition
    result = await db.execute(
        select(OpenPosition).where(OpenPosition.status == "open")
    )
    positions = result.scalars().all()

    triggered = []
    for pos in positions:
        price = await _latest_price(db, pos.symbol)
        if price is None:
            continue

        hit_label = None
        close_at  = price

        if pos.direction == "long":
            if pos.stop_loss and price <= pos.stop_loss:
                hit_label = "SL"; close_at = pos.stop_loss
            elif pos.tp3 and price >= pos.tp3:
                hit_label = "TP3"; close_at = pos.tp3
            elif pos.tp2 and price >= pos.tp2:
                hit_label = "TP2"; close_at = pos.tp2
            elif pos.tp1 and price >= pos.tp1:
                hit_label = "TP1"; close_at = pos.tp1
        else:  # short
            if pos.stop_loss and price >= pos.stop_loss:
                hit_label = "SL"; close_at = pos.stop_loss
            elif pos.tp3 and price <= pos.tp3:
                hit_label = "TP3"; close_at = pos.tp3
            elif pos.tp2 and price <= pos.tp2:
                hit_label = "TP2"; close_at = pos.tp2
            elif pos.tp1 and price <= pos.tp1:
                hit_label = "TP1"; close_at = pos.tp1

        if hit_label:
            closed = await close_position(db, pos.id, close_at, notes=f"auto-close: {hit_label} hit at {close_at}")
            msg = f"AUTO-CLOSE {pos.symbol} {pos.direction.upper()} — {hit_label} hit @ {close_at:.4f} PnL={closed.realized_pnl:+.2f}"
            await log_event("execution", "sl_tp_hit", msg, symbol=pos.symbol)
            logger.info(msg)
            triggered.append({
                "position_id": pos.id,
                "symbol":      pos.symbol,
                "direction":   pos.direction,
                "hit":         hit_label,
                "close_price": close_at,
                "realized_pnl": closed.realized_pnl,
            })

    return triggered
