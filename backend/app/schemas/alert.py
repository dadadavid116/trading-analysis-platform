"""
schemas/alert.py — Pydantic schemas for the alerts endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# ── Constants ─────────────────────────────────────────────────────────────────

VALID_CONDITION_TYPES = {"price_above", "price_below", "liquidation_spike"}
VALID_TRIGGER_MODES   = {"once", "rearm"}


# ── Request schema ────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    """Body for POST /api/alerts/ — create a new alert rule.

    condition_type:
        price_above       — fires when latest BTC close > threshold
        price_below       — fires when latest BTC close < threshold
        liquidation_spike — fires when event count in window_minutes > threshold

    trigger_mode:
        once  — triggers once, then stays triggered until the alert is deleted
        rearm — resets automatically once the condition is no longer met,
                so it can trigger again the next time the threshold is crossed
    """

    name:           str
    symbol:         str = "BTCUSDT"
    condition_type: str
    threshold:      float
    window_minutes: Optional[int] = None   # required for liquidation_spike
    trigger_mode:   str = "once"

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v

    @field_validator("condition_type")
    @classmethod
    def condition_type_must_be_valid(cls, v: str) -> str:
        if v not in VALID_CONDITION_TYPES:
            raise ValueError(
                f"condition_type must be one of: {', '.join(sorted(VALID_CONDITION_TYPES))}"
            )
        return v

    @field_validator("threshold")
    @classmethod
    def threshold_must_be_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("threshold must be greater than zero")
        return v

    @field_validator("trigger_mode")
    @classmethod
    def trigger_mode_must_be_valid(cls, v: str) -> str:
        if v not in VALID_TRIGGER_MODES:
            raise ValueError(
                f"trigger_mode must be one of: {', '.join(sorted(VALID_TRIGGER_MODES))}"
            )
        return v

    @model_validator(mode="after")
    def window_required_for_spike(self) -> "AlertCreate":
        if self.condition_type == "liquidation_spike":
            if self.window_minutes is None or self.window_minutes <= 0:
                raise ValueError(
                    "window_minutes is required and must be > 0 for liquidation_spike"
                )
        return self


# ── Response schema ───────────────────────────────────────────────────────────

class AlertSchema(BaseModel):
    """Response schema for a single alert."""

    model_config = ConfigDict(from_attributes=True)

    id:             int
    name:           str
    symbol:         str
    condition_type: str
    threshold:      float
    window_minutes: Optional[int]
    trigger_mode:   str
    is_active:      bool
    triggered_at:   Optional[datetime]
    created_at:     datetime
