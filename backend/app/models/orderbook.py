"""
models/orderbook.py — SQLAlchemy ORM model for order book snapshots.

Maps to the `orderbook_snapshots` table created by scripts/init_db.sql.
bids and asks are stored as JSONB arrays of [price, quantity] pairs,
ordered from best price inward (bids descending, asks ascending).

Example:
    bids = [[83849.0, 1.23], [83848.0, 0.88], ...]
    asks = [[83850.0, 0.99], [83851.0, 1.44], ...]
"""

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class OrderBookSnapshot(Base):
    __tablename__ = "orderbook_snapshots"

    id        = Column(Integer, primary_key=True)
    symbol    = Column(String(20), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    bids      = Column(JSONB, nullable=False)
    asks      = Column(JSONB, nullable=False)
