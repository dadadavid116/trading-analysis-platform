"""
schemas/orderbook.py — Pydantic response schema for order book endpoints.

bids and asks are lists of [price, quantity] pairs.
This matches the shape the frontend expects: [number, number][]
"""

from datetime import datetime
from typing import List
from pydantic import BaseModel, ConfigDict


class OrderBookSnapshotSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:        int
    symbol:    str
    timestamp: datetime
    bids:      List[List[float]]
    asks:      List[List[float]]
