"""
schemas/price.py — Pydantic response schemas for price endpoints.

These define the exact shape of the JSON the API returns.
They are separate from the ORM models so the API shape can evolve
independently of the database schema.
"""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class PriceCandleSchema(BaseModel):
    # Allow Pydantic to read values from SQLAlchemy ORM model attributes.
    model_config = ConfigDict(from_attributes=True)

    id:        int
    symbol:    str
    timestamp: datetime
    open:      float
    high:      float
    low:       float
    close:     float
    volume:    float
