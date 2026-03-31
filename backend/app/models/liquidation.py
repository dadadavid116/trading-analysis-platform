"""
models/liquidation.py — SQLAlchemy ORM model for liquidation events.

Maps to the `liquidations` table created by scripts/init_db.sql.
Each row is one forced-liquidation event on a futures exchange.
side is either 'buy' (long liquidated) or 'sell' (short liquidated).
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime
from app.database import Base


class Liquidation(Base):
    __tablename__ = "liquidations"

    id        = Column(Integer, primary_key=True)
    symbol    = Column(String(20), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    side      = Column(String(4), nullable=False)   # 'buy' or 'sell'
    price     = Column(Numeric(18, 2), nullable=False)
    quantity  = Column(Numeric(18, 8), nullable=False)
    exchange  = Column(String(50), nullable=False)
