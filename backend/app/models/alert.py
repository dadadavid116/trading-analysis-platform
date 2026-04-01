"""
models/alert.py — SQLAlchemy model for the alerts table.

Each row represents one alert rule.

trigger_mode controls what happens after the alert fires:
  once  — alert fires once; triggered_at stays set and the alert is not re-evaluated
  rearm — triggered_at is cleared when the condition is no longer met,
          allowing the alert to fire again the next time the threshold is crossed
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
    # once  = trigger once and stay triggered
    # rearm = reset when condition clears, allowing it to fire again
    trigger_mode   = Column(String(10), nullable=False, default="once")
    is_active      = Column(Boolean, nullable=False, default=True)
    # NULL while the alert is pending; set to the trigger time when it fires.
    # For rearm alerts, this is cleared when the condition is no longer met.
    triggered_at   = Column(DateTime(timezone=True), nullable=True)
    created_at     = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(tz=timezone.utc),
    )
