"""
models/factor.py — ORM models for crypto factor scoring (Phase 79).

  factor_observations — per-factor normalized score rows (48h retention)
  regime_snapshots    — composite regime classification per compute cycle
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from app.database import Base


class FactorObservation(Base):
    __tablename__ = "factor_observations"

    id               = Column(Integer, primary_key=True)
    computed_at      = Column(DateTime(timezone=True), nullable=False)
    symbol           = Column(String(20), nullable=True)   # None for market-wide factors
    factor_name      = Column(String(50), nullable=False)
    raw_value        = Column(Float, nullable=True)
    normalized_score = Column(Float, nullable=False)       # -1.0 to +1.0
    direction        = Column(String(10), nullable=False)  # "bullish"|"bearish"|"neutral"
    confidence       = Column(Float, nullable=False)       # 0.0 to 1.0
    source           = Column(String(30), nullable=False)  # "okx"|"binance"|"coingecko"|"alternative_me"


class RegimeSnapshot(Base):
    __tablename__ = "regime_snapshots"

    id                   = Column(Integer, primary_key=True)
    computed_at          = Column(DateTime(timezone=True), nullable=False)
    symbol               = Column(String(20), nullable=True)
    crypto_score         = Column(Float, nullable=False)    # -100 to +100
    regime               = Column(String(30), nullable=False)  # "risk_on"|"neutral"|"fragile"|"risk_off"|"crowded_long"|"crowded_short"
    trade_environment    = Column(String(20), nullable=False)  # "Favorable"|"Caution"|"Avoid"
    primary_driver       = Column(String(30), nullable=False)  # "Derivatives"|"Liquidity"|"Sentiment"|"Momentum"
    derivatives_pressure = Column(Float, nullable=True)    # -1.0 to +1.0
    liquidity_pressure   = Column(Float, nullable=True)    # -1.0 to +1.0
    detail               = Column(JSON, nullable=True)     # per-factor score breakdown
