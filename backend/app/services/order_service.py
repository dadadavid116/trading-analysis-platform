"""
services/order_service.py — Paper order lifecycle (Phase 88).

status flow: pending → filled | cancelled | rejected
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderEvent
from app.services.account_state import open_position

logger = logging.getLogger(__name__)


def _order_dict(o: Order) -> dict:
    return {
        "id":              o.id,
        "signal_id":       o.signal_id,
        "position_id":     o.position_id,
        "symbol":          o.symbol,
        "direction":       o.direction,
        "order_type":      o.order_type,
        "status":          o.status,
        "requested_price": o.requested_price,
        "filled_price":    o.filled_price,
        "size_usd":        o.size_usd,
        "stop_loss":       o.stop_loss,
        "tp1":             o.tp1,
        "tp2":             o.tp2,
        "tp3":             o.tp3,
        "created_at":      o.created_at.isoformat() if o.created_at else None,
        "filled_at":       o.filled_at.isoformat()  if o.filled_at  else None,
        "cancelled_at":    o.cancelled_at.isoformat() if o.cancelled_at else None,
        "notes":           o.notes,
    }


async def create_order(
    db:              AsyncSession,
    symbol:          str,
    direction:       str,
    size_usd:        float,
    requested_price: Optional[float] = None,
    stop_loss:       Optional[float] = None,
    tp1:             Optional[float] = None,
    tp2:             Optional[float] = None,
    tp3:             Optional[float] = None,
    order_type:      str = "market",
    signal_id:       Optional[int]   = None,
    notes:           Optional[str]   = None,
) -> Order:
    order = Order(
        symbol          = symbol.upper(),
        direction       = direction,
        order_type      = order_type,
        status          = "pending",
        requested_price = requested_price,
        size_usd        = size_usd,
        stop_loss       = stop_loss,
        tp1             = tp1,
        tp2             = tp2,
        tp3             = tp3,
        signal_id       = signal_id,
        created_at      = datetime.now(timezone.utc),
        notes           = notes,
    )
    db.add(order)
    await db.flush()

    evt = OrderEvent(
        order_id   = order.id,
        event_type = "created",
        price      = requested_price,
        timestamp  = datetime.now(timezone.utc),
    )
    db.add(evt)
    await db.commit()
    await db.refresh(order)
    logger.info("Order created: id=%d %s %s $%.0f", order.id, symbol, direction, size_usd)
    return order


async def fill_order(
    db:          AsyncSession,
    order_id:    int,
    fill_price:  float,
    notes:       Optional[str] = None,
) -> Order:
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise ValueError(f"Order {order_id} not found.")
    if order.status != "pending":
        raise ValueError(f"Order {order_id} is not pending (status: {order.status}).")

    # Open a position from the filled order
    pos = await open_position(
        db,
        symbol      = order.symbol,
        direction   = order.direction,
        entry_price = fill_price,
        size_usd    = order.size_usd,
        stop_loss   = order.stop_loss,
        tp1         = order.tp1,
        tp2         = order.tp2,
        tp3         = order.tp3,
        signal_id   = order.signal_id,
        notes       = notes or order.notes,
    )

    order.status      = "filled"
    order.filled_price = fill_price
    order.filled_at   = datetime.now(timezone.utc)
    order.position_id = pos.id

    evt = OrderEvent(
        order_id   = order.id,
        event_type = "filled",
        price      = fill_price,
        timestamp  = datetime.now(timezone.utc),
        notes      = notes,
    )
    db.add(evt)
    await db.commit()
    await db.refresh(order)
    logger.info("Order filled: id=%d fill=%.4f position_id=%d", order_id, fill_price, pos.id)
    return order


async def cancel_order(
    db:       AsyncSession,
    order_id: int,
    notes:    Optional[str] = None,
) -> Order:
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise ValueError(f"Order {order_id} not found.")
    if order.status != "pending":
        raise ValueError(f"Order {order_id} is not pending (status: {order.status}).")

    order.status       = "cancelled"
    order.cancelled_at = datetime.now(timezone.utc)

    evt = OrderEvent(
        order_id   = order.id,
        event_type = "cancelled",
        timestamp  = datetime.now(timezone.utc),
        notes      = notes,
    )
    db.add(evt)
    await db.commit()
    await db.refresh(order)
    return order


async def list_orders(
    db:     AsyncSession,
    status: Optional[str] = None,
    symbol: Optional[str] = None,
    limit:  int = 50,
) -> list[dict]:
    q = select(Order).order_by(desc(Order.created_at)).limit(limit)
    if status:
        statuses = [s.strip() for s in status.split(",")]
        q = q.where(Order.status.in_(statuses))
    if symbol:
        q = q.where(Order.symbol == symbol.upper())
    result = await db.execute(q)
    return [_order_dict(o) for o in result.scalars().all()]
