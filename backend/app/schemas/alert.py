"""
schemas/alert.py — Pydantic schemas for the alerts endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AlertCreate(BaseModel):
    """Body for POST /api/alerts/ — create a new alert rule."""

    name:           str
    symbol:         str = "BTCUSDT"
    condition_type: str   # price_above | price_below | liquidation_spike
    threshold:      float
    window_minutes: Optional[int] = None  # required for liquidation_spike


class AlertSchema(BaseModel):
    """Response schema for a single alert."""

    model_config = ConfigDict(from_attributes=True)

    id:             int
    name:           str
    symbol:         str
    condition_type: str
    threshold:      float
    window_minutes: Optional[int]
    is_active:      bool
    triggered_at:   Optional[datetime]
    created_at:     datetime
