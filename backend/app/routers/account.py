"""
routers/account.py — Account state API (Phase 86 + 88).

GET  /api/account/state                  — current equity, exposure, open positions
GET  /api/account/config                 — risk parameter configuration
POST /api/account/config                 — update starting capital + risk params
GET  /api/account/snapshots              — equity history (last N snapshots)
GET  /api/account/equity-curve           — snapshots for equity curve chart
GET  /api/account/trade-stats            — win/loss counts, PnL by period
GET  /api/account/positions              — list positions (status filter)
POST /api/account/positions              — open a paper position
POST /api/account/positions/{id}/close   — close a position
POST /api/account/positions/{id}/cancel  — cancel without PnL
GET  /api/account/orders                 — list paper orders
POST /api/account/orders                 — create a paper order
POST /api/account/orders/{id}/fill       — fill an order (creates position)
POST /api/account/orders/{id}/cancel     — cancel a pending order
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.account import AccountSnapshot, OpenPosition
from app.services.account_state import (
    get_account_state, get_config, update_config,
    open_position, close_position, cancel_position, take_snapshot,
)
from app.services.order_service import (
    create_order, fill_order, cancel_order, list_orders,
)

router = APIRouter(prefix="/account", tags=["account"])


# ── State ──────────────────────────────────────────────────────────────────────

@router.get("/state")
async def account_state(db: AsyncSession = Depends(get_db)):
    """Full account state: equity, exposure, risk limits, open positions."""
    return await get_account_state(db)


# ── Config ─────────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_account_config(db: AsyncSession = Depends(get_db)):
    cfg = await get_config(db)
    return {
        "starting_capital":       cfg.starting_capital,
        "currency":               cfg.currency,
        "max_risk_per_trade_pct": cfg.max_risk_per_trade_pct,
        "max_open_risk_pct":      cfg.max_open_risk_pct,
        "daily_loss_limit_pct":   cfg.daily_loss_limit_pct,
        "updated_at":             cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


class ConfigBody(BaseModel):
    starting_capital:       Optional[float] = None
    max_risk_per_trade_pct: Optional[float] = None
    max_open_risk_pct:      Optional[float] = None
    daily_loss_limit_pct:   Optional[float] = None


@router.post("/config")
async def set_account_config(body: ConfigBody, db: AsyncSession = Depends(get_db)):
    """Update any subset of account configuration fields."""
    if body.starting_capital is not None and body.starting_capital <= 0:
        raise HTTPException(status_code=422, detail="starting_capital must be positive.")
    for field in ("max_risk_per_trade_pct", "max_open_risk_pct", "daily_loss_limit_pct"):
        v = getattr(body, field)
        if v is not None and not (0 < v <= 100):
            raise HTTPException(status_code=422, detail=f"{field} must be between 0 and 100.")

    cfg = await update_config(
        db,
        starting_capital       = body.starting_capital,
        max_risk_per_trade_pct = body.max_risk_per_trade_pct,
        max_open_risk_pct      = body.max_open_risk_pct,
        daily_loss_limit_pct   = body.daily_loss_limit_pct,
    )
    return {
        "starting_capital":       cfg.starting_capital,
        "currency":               cfg.currency,
        "max_risk_per_trade_pct": cfg.max_risk_per_trade_pct,
        "max_open_risk_pct":      cfg.max_open_risk_pct,
        "daily_loss_limit_pct":   cfg.daily_loss_limit_pct,
        "updated_at":             cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


# ── Snapshots ──────────────────────────────────────────────────────────────────

@router.get("/snapshots")
async def get_snapshots(
    limit: int = Query(48, ge=1, le=200),
    db:    AsyncSession = Depends(get_db),
):
    """Return the last N equity snapshots, newest first."""
    result = await db.execute(
        select(AccountSnapshot)
        .order_by(desc(AccountSnapshot.timestamp))
        .limit(limit)
    )
    snaps = result.scalars().all()
    return [
        {
            "id":                  s.id,
            "timestamp":           s.timestamp.isoformat(),
            "equity":              s.equity,
            "starting_capital":    s.starting_capital,
            "realized_pnl":        s.realized_pnl,
            "open_position_count": s.open_position_count,
            "open_risk_usd":       s.open_risk_usd,
            "trigger":             s.trigger,
        }
        for s in snaps
    ]


# ── Positions ──────────────────────────────────────────────────────────────────

@router.get("/positions")
async def list_positions(
    status: Optional[str] = Query(None, description="open | closed | cancelled"),
    limit:  int           = Query(50, ge=1, le=200),
    db:     AsyncSession  = Depends(get_db),
):
    """List positions filtered by status."""
    q = select(OpenPosition).order_by(desc(OpenPosition.opened_at)).limit(limit)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        q = q.where(OpenPosition.status.in_(statuses))
    result = await db.execute(q)
    return [_pos_out(p) for p in result.scalars().all()]


class OpenPositionBody(BaseModel):
    symbol:      str
    direction:   str            # long | short
    entry_price: float
    size_usd:    float
    stop_loss:   Optional[float] = None
    tp1:         Optional[float] = None
    tp2:         Optional[float] = None
    tp3:         Optional[float] = None
    signal_id:   Optional[int]   = None
    notes:       Optional[str]   = None


@router.post("/positions")
async def create_position(body: OpenPositionBody, db: AsyncSession = Depends(get_db)):
    """Open a new paper position."""
    if body.direction not in ("long", "short"):
        raise HTTPException(status_code=422, detail="direction must be 'long' or 'short'.")
    if body.size_usd <= 0:
        raise HTTPException(status_code=422, detail="size_usd must be positive.")
    pos = await open_position(
        db, body.symbol, body.direction, body.entry_price, body.size_usd,
        body.stop_loss, body.tp1, body.tp2, body.tp3, body.signal_id, body.notes,
    )
    return _pos_out(pos)


class CloseBody(BaseModel):
    close_price: float
    notes:       Optional[str] = None


@router.post("/positions/{position_id}/close")
async def close_pos(position_id: int, body: CloseBody, db: AsyncSession = Depends(get_db)):
    try:
        pos = await close_position(db, position_id, body.close_price, body.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _pos_out(pos)


@router.post("/positions/{position_id}/cancel")
async def cancel_pos(position_id: int, db: AsyncSession = Depends(get_db)):
    try:
        pos = await cancel_position(db, position_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _pos_out(pos)


@router.post("/snapshots/take")
async def manual_snapshot(db: AsyncSession = Depends(get_db)):
    """Manually record an equity snapshot."""
    snap = await take_snapshot(db, trigger="manual")
    return {"id": snap.id, "timestamp": snap.timestamp.isoformat(), "equity": snap.equity}


# ── Equity Curve ────────────────────────────────────────────────────────────────

@router.get("/equity-curve")
async def equity_curve(
    limit: int = Query(200, ge=1, le=500),
    db:    AsyncSession = Depends(get_db),
):
    """Return oldest-first snapshots for an equity curve chart."""
    result = await db.execute(
        select(AccountSnapshot)
        .order_by(desc(AccountSnapshot.timestamp))
        .limit(limit)
    )
    snaps = list(reversed(result.scalars().all()))
    return [
        {
            "timestamp":        s.timestamp.isoformat(),
            "equity":           s.equity,
            "realized_pnl":     s.realized_pnl,
            "open_risk_usd":    s.open_risk_usd,
            "trigger":          s.trigger,
        }
        for s in snaps
    ]


# ── Trade Stats ─────────────────────────────────────────────────────────────────

@router.get("/trade-stats")
async def trade_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate win/loss stats from closed positions."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    result = await db.execute(
        select(OpenPosition)
        .where(OpenPosition.status == "closed", OpenPosition.realized_pnl.isnot(None))
    )
    closed = result.scalars().all()

    def _stats(positions):
        wins   = [p.realized_pnl for p in positions if (p.realized_pnl or 0) > 0]
        losses = [p.realized_pnl for p in positions if (p.realized_pnl or 0) < 0]
        total  = len(positions)
        pnl    = sum(p.realized_pnl or 0 for p in positions)
        avg_win  = sum(wins)   / len(wins)   if wins   else 0.0
        avg_loss = sum(losses) / len(losses) if losses else 0.0
        win_rate = len(wins) / total * 100 if total else 0.0
        expectancy = (win_rate / 100 * avg_win) + ((1 - win_rate / 100) * avg_loss) if total else 0.0
        return {
            "total":      total,
            "wins":       len(wins),
            "losses":     len(losses),
            "win_rate":   round(win_rate, 1),
            "total_pnl":  round(pnl, 2),
            "avg_win":    round(avg_win, 2),
            "avg_loss":   round(avg_loss, 2),
            "expectancy": round(expectancy, 2),
        }

    def _filter_by_date(positions, since: datetime):
        return [p for p in positions if p.closed_at and p.closed_at >= since]

    return {
        "all_time": _stats(closed),
        "today":    _stats(_filter_by_date(closed, today_start)),
        "month":    _stats(_filter_by_date(closed, month_start)),
    }


# ── Orders ──────────────────────────────────────────────────────────────────────

@router.get("/orders")
async def get_orders(
    status: Optional[str] = Query(None),
    symbol: Optional[str] = Query(None),
    limit:  int           = Query(50, ge=1, le=200),
    db:     AsyncSession  = Depends(get_db),
):
    return await list_orders(db, status=status, symbol=symbol, limit=limit)


class OrderBody(BaseModel):
    symbol:          str
    direction:       str
    size_usd:        float = Field(..., gt=0)
    requested_price: Optional[float] = None
    stop_loss:       Optional[float] = None
    tp1:             Optional[float] = None
    tp2:             Optional[float] = None
    tp3:             Optional[float] = None
    order_type:      str = "market"
    signal_id:       Optional[int]  = None
    notes:           Optional[str]  = None


@router.post("/orders")
async def create_order_endpoint(body: OrderBody, db: AsyncSession = Depends(get_db)):
    if body.direction not in ("long", "short"):
        raise HTTPException(status_code=422, detail="direction must be 'long' or 'short'.")
    order = await create_order(
        db, body.symbol, body.direction, body.size_usd,
        body.requested_price, body.stop_loss, body.tp1, body.tp2, body.tp3,
        body.order_type, body.signal_id, body.notes,
    )
    from app.services.order_service import _order_dict
    return _order_dict(order)


class FillBody(BaseModel):
    fill_price: float = Field(..., gt=0)
    notes:      Optional[str] = None


@router.post("/orders/{order_id}/fill")
async def fill_order_endpoint(order_id: int, body: FillBody, db: AsyncSession = Depends(get_db)):
    try:
        order = await fill_order(db, order_id, body.fill_price, body.notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    from app.services.order_service import _order_dict
    return _order_dict(order)


@router.post("/orders/{order_id}/cancel")
async def cancel_order_endpoint(order_id: int, db: AsyncSession = Depends(get_db)):
    try:
        order = await cancel_order(db, order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    from app.services.order_service import _order_dict
    return _order_dict(order)


# ── Helper ─────────────────────────────────────────────────────────────────────

def _pos_out(p: OpenPosition) -> dict:
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
