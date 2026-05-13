"""
models/event_log.py — Platform event log for the Operator Console.

Every significant platform action writes a row here:
  service     — which subsystem produced the event ("analysis", "alert", "system", ...)
  event_type  — machine-readable category ("chart_analysis", "alert_triggered", ...)
  symbol      — optional; set when the event is symbol-specific
  message     — human-readable one-liner shown in the terminal UI
  detail      — optional JSON blob for structured extra data
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class EventLog(Base):
    __tablename__ = "event_log"

    id         = Column(Integer, primary_key=True)
    timestamp  = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    service    = Column(String(30),  nullable=False)
    event_type = Column(String(50),  nullable=False)
    symbol     = Column(String(20))
    message    = Column(Text,        nullable=False)
    detail     = Column(JSONB)
