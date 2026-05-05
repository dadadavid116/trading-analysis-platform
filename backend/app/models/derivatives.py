"""
models/derivatives.py — ORM models for crypto derivatives context data.

Three tables, each holding REST-poll snapshots:

  funding_rates  — Binance Futures funding rate + mark/index price (every 30 min)
  open_interest  — Binance Futures total open interest in BTC (every 5 min)
  ls_ratios      — Top-trader and global long/short account ratios (every 15 min)
"""

from sqlalchemy import Column, Integer, String, Numeric, DateTime
from app.database import Base


class FundingRate(Base):
    __tablename__ = "funding_rates"

    id           = Column(Integer, primary_key=True)
    symbol       = Column(String(20), nullable=False)
    timestamp    = Column(DateTime(timezone=True), nullable=False)
    funding_rate = Column(Numeric(18, 8), nullable=False)   # last settled rate (e.g. 0.00010000 = 0.01%)
    mark_price   = Column(Numeric(18, 2), nullable=True)
    index_price  = Column(Numeric(18, 2), nullable=True)
    exchange     = Column(String(50), nullable=False, default="binance")


class OpenInterest(Base):
    __tablename__ = "open_interest"

    id        = Column(Integer, primary_key=True)
    symbol    = Column(String(20), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False)
    oi_value  = Column(Numeric(24, 4), nullable=False)   # in BTC contracts
    exchange  = Column(String(50), nullable=False, default="binance")


class LSRatio(Base):
    __tablename__ = "ls_ratios"

    id          = Column(Integer, primary_key=True)
    symbol      = Column(String(20), nullable=False)
    timestamp   = Column(DateTime(timezone=True), nullable=False)
    long_ratio  = Column(Numeric(10, 6), nullable=False)   # e.g. 0.612300
    short_ratio = Column(Numeric(10, 6), nullable=False)   # e.g. 0.387700
    ratio_type  = Column(String(30), nullable=False)        # 'top_account' | 'global_account'
    exchange    = Column(String(50), nullable=False, default="binance")
