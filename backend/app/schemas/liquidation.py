"""
schemas/liquidation.py — Pydantic response schema for liquidation endpoints.
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class LiquidationSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:        int
    symbol:    str
    timestamp: datetime
    side:      str
    price:     float
    quantity:  float
    exchange:  str
