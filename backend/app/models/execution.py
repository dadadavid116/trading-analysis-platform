from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from app.database import Base


class ExecutionProposal(Base):
    __tablename__ = "execution_proposals"

    id           = Column(Integer, primary_key=True)
    signal_id    = Column(Integer, ForeignKey("signals.id",        ondelete="SET NULL"), nullable=True)
    symbol       = Column(String(20),  nullable=False)
    direction    = Column(String(10),  nullable=False)
    timeframe    = Column(String(10),  nullable=False, default="15m")
    entry_price  = Column(Float,       nullable=False)
    stop_loss    = Column(Float,       nullable=True)
    tp1          = Column(Float,       nullable=True)
    tp2          = Column(Float,       nullable=True)
    tp3          = Column(Float,       nullable=True)
    size_usd     = Column(Float,       nullable=False)
    risk_usd     = Column(Float,       nullable=True)
    risk_pct     = Column(Float,       nullable=True)
    risk_verdict = Column(String(20),  nullable=False, default="approved")
    risk_reasons = Column(Text,        nullable=True)   # JSON array stored as text
    risk_warnings= Column(Text,        nullable=True)
    status       = Column(String(20),  nullable=False, default="pending")
    order_id     = Column(Integer, ForeignKey("orders.id",         ondelete="SET NULL"), nullable=True)
    position_id  = Column(Integer, ForeignKey("open_positions.id", ondelete="SET NULL"), nullable=True)
    created_at   = Column(DateTime(timezone=True), nullable=False)
    reviewed_at  = Column(DateTime(timezone=True), nullable=True)
    notes        = Column(Text, nullable=True)
