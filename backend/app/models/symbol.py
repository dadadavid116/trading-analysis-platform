"""
models/symbol.py — Symbol registry for tracked trading instruments.

Each row represents one tracked perpetual swap contract. The registry drives
which symbols are collected, analyzed, and displayed in the dashboard.
"""

from sqlalchemy import Boolean, Column, Integer, String
from app.database import Base


class TrackedSymbol(Base):
    __tablename__ = "tracked_symbols"

    id                = Column(Integer, primary_key=True)
    symbol            = Column(String(20), nullable=False, unique=True)  # canonical: BTCUSDT
    okx_instrument_id = Column(String(30))                               # OKX: BTC-USDT-SWAP
    binance_symbol    = Column(String(20))                               # Binance: BTCUSDT
    display_name      = Column(String(10), nullable=False)               # short label: BTC
    is_active         = Column(Boolean, nullable=False, default=True)
    sort_order        = Column(Integer, nullable=False, default=0)
