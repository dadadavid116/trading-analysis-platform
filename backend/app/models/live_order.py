"""models/live_order.py — ORM model for real exchange orders (Phase 97)."""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey

from app.database import Base


class LiveOrder(Base):
    __tablename__ = "live_orders"

    id           = Column(Integer, primary_key=True)
    symbol       = Column(String(20), nullable=False)
    direction    = Column(String(10), nullable=False)   # long | short
    order_type   = Column(String(20), nullable=False, default="limit")
    size_usd     = Column(Float, nullable=False)
    entry_price  = Column(Float, nullable=True)
    stop_loss    = Column(Float, nullable=True)
    tp1          = Column(Float, nullable=True)
    okx_order_id = Column(String(64), nullable=True)
    okx_status   = Column(String(20), nullable=True)   # live | filled | cancelled | failed
    signal_id    = Column(Integer, ForeignKey("signals.id", ondelete="SET NULL"), nullable=True)
    proposal_id  = Column(Integer, nullable=True)
    created_at   = Column(DateTime(timezone=True), nullable=False)
    filled_at    = Column(DateTime(timezone=True), nullable=True)
    fill_price   = Column(Float, nullable=True)
    error_msg    = Column(Text, nullable=True)
    notes        = Column(Text, nullable=True)
