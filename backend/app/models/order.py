from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    id              = Column(Integer, primary_key=True)
    signal_id       = Column(Integer, ForeignKey("signals.id",        ondelete="SET NULL"), nullable=True)
    position_id     = Column(Integer, ForeignKey("open_positions.id", ondelete="SET NULL"), nullable=True)
    symbol          = Column(String(20),  nullable=False)
    direction       = Column(String(10),  nullable=False)
    order_type      = Column(String(20),  nullable=False, default="market")
    status          = Column(String(20),  nullable=False, default="pending")
    requested_price = Column(Float,       nullable=True)
    filled_price    = Column(Float,       nullable=True)
    size_usd        = Column(Float,       nullable=False)
    stop_loss       = Column(Float,       nullable=True)
    tp1             = Column(Float,       nullable=True)
    tp2             = Column(Float,       nullable=True)
    tp3             = Column(Float,       nullable=True)
    created_at      = Column(DateTime(timezone=True), nullable=False)
    filled_at       = Column(DateTime(timezone=True), nullable=True)
    cancelled_at    = Column(DateTime(timezone=True), nullable=True)
    notes           = Column(Text,        nullable=True)


class OrderEvent(Base):
    __tablename__ = "order_events"

    id         = Column(Integer, primary_key=True)
    order_id   = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(30), nullable=False)
    price      = Column(Float, nullable=True)
    timestamp  = Column(DateTime(timezone=True), nullable=False)
    notes      = Column(Text, nullable=True)
