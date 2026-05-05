"""
schemas/derivatives.py — Pydantic response schemas for derivatives endpoints.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class FundingRateSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol:       str
    timestamp:    datetime
    funding_rate: float
    mark_price:   Optional[float]
    index_price:  Optional[float]
    premium_pct:  float            # (mark - index) / index × 100, computed on read
    sentiment:    str              # "bullish" | "bearish" | "neutral"


class OpenInterestSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    symbol:      str
    timestamp:   datetime
    oi_value:    float
    delta_1h:    Optional[float]   # % change vs ~1 h ago
    delta_4h:    Optional[float]   # % change vs ~4 h ago
    trend:       str               # "expanding" | "contracting" | "stable"


class LSRatioEntry(BaseModel):
    long_pct:  float
    short_pct: float
    updated_at: datetime


class LSRatioSchema(BaseModel):
    symbol:         str
    top_account:    Optional[LSRatioEntry]
    global_account: Optional[LSRatioEntry]
