"""
models/price.py — SQLAlchemy ORM model for price candles.

Maps to the `price_candles` table created by scripts/init_db.sql.
Each row is one 1-minute OHLCV candle for a trading symbol.
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime
from app.database import Base


class PriceCandle(Base):
    __tablename__ = "price_candles"

    id        = Column(Integer, primary_key=True)
    symbol    = Column(String(20), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    open      = Column(Numeric(18, 2), nullable=False)
    high      = Column(Numeric(18, 2), nullable=False)
    low       = Column(Numeric(18, 2), nullable=False)
    close     = Column(Numeric(18, 2), nullable=False)
    volume    = Column(Numeric(24, 8), nullable=False)
