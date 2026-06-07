"""
services/account_state.py — Account state ledger service (Phase 86).

Provides the account primitives the risk engine (Phase 87) reads:
  - starting_capital and risk parameter configuration
  - current equity (starting + sum of realized PnL from closed positions)
  - open exposure (total USD at risk across all open positions)
  - open position CRUD

Equity formula:
  current_equity = starting_capital + realized_pnl_total
  open_risk_usd  = sum(|entry - stop_loss| / entry * size_usd) for open positions
  open_risk_pct  = open_risk_usd / current_equity * 100
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import AccountConfig, AccountSnapshot, OpenPosition

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_ID = 1


# ── Config ─────────────────────────────────────────────────────────────────────

async def get_config(db: AsyncSession) -> AccountConfig:
    """Return account config; seeds default row if missing."""
    result = await db.execute(select(AccountConfig).where(AccountConfig.id == _DEFAULT_CONFIG_ID))
    cfg = result.scalar_one_or_none()
    if cfg is None:
        cfg = AccountConfig(
            id                     = _DEFAULT_CONFIG_ID,
            starting_capital       = 10_000.0,
            currency               = "USD",
            max_risk_per_trade_pct = 2.0,
            max_open_risk_pct      = 10.0,
            daily_loss_limit_pct   = 5.0,
            updated_at             = datetime.now(timezone.utc),
        )
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


async def update_config(
    db: AsyncSession,
    starting_capital:       Optional[float] = None,
    max_risk_per_trade_pct: Optional[float] = None,
    max_open_risk_pct:      Optional[float] = None,
    daily_loss_limit_pct:   Optional[float] = None,
) -> AccountConfig:
    cfg = await get_config(db)
    if starting_capital       is not None: cfg.starting_capital       = starting_capital
    if max_risk_per_trade_pct is not None: cfg.max_risk_per_trade_pct = max_risk_per_trade_pct
    if max_open_risk_pct      is not None: cfg.max_open_risk_pct      = max_open_risk_pct
    if daily_loss_limit_pct   is not None: cfg.daily_loss_limit_pct   = daily_loss_limit_pct
    cfg.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(cfg)
    return cfg


# ── Equity calculation ─────────────────────────────────────────────────────────

async def _realized_pnl_total(db: AsyncSession) -> float:
    """Sum of realized_pnl from all closed positions."""
    result = await db.execute(
        select(func.coalesce(func.sum(OpenPosition.realized_pnl), 0.0))
        .where(OpenPosition.status == "closed", OpenPosition.realized_pnl.isnot(None))
    )
    return float(result.scalar())


async def _compute_open_risk(positions: list[OpenPosition]) -> float:
    """Total USD at risk: |entry - stop| / entry * size_usd per open position."""
    total = 0.0
    for p in positions:
        if p.stop_loss and p.entry_price and p.size_usd:
            risk_pct = abs(p.entry_price - p.stop_loss) / p.entry_price
            total += risk_pct * p.size_usd
    return round(total, 2)


# ── Account state ──────────────────────────────────────────────────────────────

async def get_account_state(db: AsyncSession) -> dict:
    """
    Return the full account state dict consumed by the risk engine and UI.
    """
    cfg = await get_config(db)

    realized_pnl = await _realized_pnl_total(db)
    current_equity = cfg.starting_capital + realized_pnl

    # Open positions
    result = await db.execute(
        select(OpenPosition)
        .where(OpenPosition.status == "open")
        .order_by(OpenPosition.opened_at.desc())
    )
    open_pos = result.scalars().all()

    open_risk_usd = await _compute_open_risk(list(open_pos))
    open_risk_pct = (open_risk_usd / current_equity * 100) if current_equity > 0 else 0.0

    max_risk_usd = round(current_equity * cfg.max_risk_per_trade_pct / 100, 2)

    return {
        "starting_capital":       cfg.starting_capital,
        "currency":               cfg.currency,
        "current_equity":         round(current_equity, 2),
        "realized_pnl":           round(realized_pnl, 2),
        "open_count":             len(open_pos),
        "open_risk_usd":          open_risk_usd,
        "open_risk_pct":          round(open_risk_pct, 2),
        "max_risk_per_trade_pct": cfg.max_risk_per_trade_pct,
        "max_risk_per_trade_usd": max_risk_usd,
        "max_open_risk_pct":      cfg.max_open_risk_pct,
        "daily_loss_limit_pct":   cfg.daily_loss_limit_pct,
        "positions": [_pos_dict(p) for p in open_pos],
    }


def _pos_dict(p: OpenPosition) -> dict:
    return {
        "id":           p.id,
        "symbol":       p.symbol,
        "direction":    p.direction,
        "entry_price":  p.entry_price,
        "size_usd":     p.size_usd,
        "stop_loss":    p.stop_loss,
        "tp1":          p.tp1,
        "tp2":          p.tp2,
        "tp3":          p.tp3,
        "signal_id":    p.signal_id,
        "status":       p.status,
        "opened_at":    p.opened_at.isoformat() if p.opened_at else None,
        "closed_at":    p.closed_at.isoformat() if p.closed_at else None,
        "close_price":  p.close_price,
        "realized_pnl": p.realized_pnl,
        "notes":        p.notes,
    }


# ── Snapshot ───────────────────────────────────────────────────────────────────

async def take_snapshot(db: AsyncSession, trigger: str = "manual") -> AccountSnapshot:
    state = await get_account_state(db)
    snap = AccountSnapshot(
        timestamp           = datetime.now(timezone.utc),
        equity              = state["current_equity"],
        starting_capital    = state["starting_capital"],
        realized_pnl        = state["realized_pnl"],
        open_position_count = state["open_count"],
        open_risk_usd       = state["open_risk_usd"],
        trigger             = trigger,
    )
    db.add(snap)
    await db.commit()
    return snap


# ── Position management ────────────────────────────────────────────────────────

async def open_position(
    db:          AsyncSession,
    symbol:      str,
    direction:   str,           # long | short
    entry_price: float,
    size_usd:    float,
    stop_loss:   Optional[float] = None,
    tp1:         Optional[float] = None,
    tp2:         Optional[float] = None,
    tp3:         Optional[float] = None,
    signal_id:   Optional[int]   = None,
    notes:       Optional[str]   = None,
) -> OpenPosition:
    pos = OpenPosition(
        symbol      = symbol.upper(),
        direction   = direction,
        entry_price = entry_price,
        size_usd    = size_usd,
        stop_loss   = stop_loss,
        tp1         = tp1,
        tp2         = tp2,
        tp3         = tp3,
        signal_id   = signal_id,
        status      = "open",
        opened_at   = datetime.now(timezone.utc),
        notes       = notes,
    )
    db.add(pos)
    await db.commit()
    await db.refresh(pos)
    await take_snapshot(db, trigger="position_open")
    logger.info("Position opened: %s %s %s size=$%.0f", symbol, direction.upper(), pos.id, size_usd)
    return pos


async def close_position(
    db:          AsyncSession,
    position_id: int,
    close_price: float,
    notes:       Optional[str] = None,
) -> OpenPosition:
    result = await db.execute(select(OpenPosition).where(OpenPosition.id == position_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise ValueError(f"Position {position_id} not found.")
    if pos.status != "open":
        raise ValueError(f"Position {position_id} is not open (status: {pos.status}).")

    # Compute realized PnL
    entry = pos.entry_price
    if entry and entry > 0:
        price_chg = (close_price - entry) / entry
        if pos.direction == "short":
            price_chg = -price_chg
        realized = round(price_chg * pos.size_usd, 2)
    else:
        realized = 0.0

    pos.status       = "closed"
    pos.closed_at    = datetime.now(timezone.utc)
    pos.close_price  = close_price
    pos.realized_pnl = realized
    if notes:
        pos.notes = notes

    await db.commit()
    await db.refresh(pos)
    await take_snapshot(db, trigger="position_close")
    logger.info("Position closed: id=%d realized_pnl=%.2f", position_id, realized)
    return pos


async def cancel_position(db: AsyncSession, position_id: int) -> OpenPosition:
    result = await db.execute(select(OpenPosition).where(OpenPosition.id == position_id))
    pos = result.scalar_one_or_none()
    if not pos:
        raise ValueError(f"Position {position_id} not found.")
    pos.status    = "cancelled"
    pos.closed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(pos)
    return pos
