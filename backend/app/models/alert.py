"""
models/alert.py — SQLAlchemy model for the alerts table.

Each row represents one alert rule. When the condition is met the worker
sets triggered_at; a NULL triggered_at means the alert is still pending.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, Numeric, String

from app.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String(100), nullable=False)
    symbol         = Column(String(20), nullable=False, default="BTCUSDT")
    # Supported values: price_above | price_below | liquidation_spike
    condition_type = Column(String(50), nullable=False)
    # For price_above/price_below: the price level.
    # For liquidation_spike: the event count that must be exceeded.
    threshold      = Column(Numeric(18, 2), nullable=False)
    # Only used for liquidation_spike — how many minutes back to count events.
    window_minutes = Column(Integer, nullable=True)
    is_active      = Column(Boolean, nullable=False, default=True)
    # NULL while the alert is pending; set to the trigger time when it fires.
    triggered_at   = Column(DateTime(timezone=True), nullable=True)
    created_at     = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
