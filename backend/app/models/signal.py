"""
models/signal.py — ORM models for persisted scanner signals (Phase 85).

  signals       — persisted signal objects with full lifecycle tracking
  signal_events — audit trail of all lifecycle transitions
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class Signal(Base):
    __tablename__ = "signals"

    id            = Column(Integer, primary_key=True)
    symbol        = Column(String(20), nullable=False)
    timeframe     = Column(String(10), nullable=False, default="15m")
    direction     = Column(String(10), nullable=False)        # long | short
    status        = Column(String(20), nullable=False, default="candidate")
    source        = Column(String(30), nullable=False, default="scanner_auto")
    scanner_score = Column(Float, nullable=True)              # composite from scanner
    signal_count  = Column(Integer, default=0)
    context_score = Column(Float, nullable=True)              # snapshot at creation
    crypto_score  = Column(Float, nullable=True)
    macro_score   = Column(Float, nullable=True)
    regime        = Column(String(30), nullable=True)
    entry_low     = Column(Float, nullable=True)
    entry_high    = Column(Float, nullable=True)
    stop_loss     = Column(Float, nullable=True)
    tp1           = Column(Float, nullable=True)
    tp2           = Column(Float, nullable=True)
    tp3           = Column(Float, nullable=True)
    risk_reward   = Column(Float, nullable=True)
    signal_labels = Column(JSONB, default=list)               # scanner labels at creation
    created_at    = Column(DateTime(timezone=True), nullable=False)
    activated_at  = Column(DateTime(timezone=True), nullable=True)
    closed_at     = Column(DateTime(timezone=True), nullable=True)
    expires_at    = Column(DateTime(timezone=True), nullable=True)
    close_reason  = Column(String(30), nullable=True)         # tp | sl | expired | invalidated
    notes         = Column(Text, nullable=True)


class SignalEvent(Base):
    __tablename__ = "signal_events"

    id         = Column(Integer, primary_key=True)
    signal_id  = Column(Integer, ForeignKey("signals.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(30), nullable=False)
    price_at   = Column(Float, nullable=True)
    timestamp  = Column(DateTime(timezone=True), nullable=False)
    notes      = Column(Text, nullable=True)
