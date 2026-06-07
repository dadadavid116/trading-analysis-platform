"""
models/account.py — ORM models for account state foundation (Phase 86).

  account_config    — single-row capital + risk parameter configuration
  account_snapshots — periodic equity snapshots for history / equity curve
  open_positions    — open paper positions (exposure base for risk engine)
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean
from app.database import Base


class AccountConfig(Base):
    __tablename__ = "account_config"

    id                     = Column(Integer, primary_key=True)
    starting_capital       = Column(Float, nullable=False, default=10000.0)
    currency               = Column(String(10), nullable=False, default="USD")
    max_risk_per_trade_pct = Column(Float, nullable=False, default=2.0)
    max_open_risk_pct      = Column(Float, nullable=False, default=10.0)
    daily_loss_limit_pct   = Column(Float, nullable=False, default=5.0)
    kill_switch_active     = Column(Boolean, nullable=False, default=False)
    live_mode_enabled      = Column(Boolean, nullable=False, default=False)
    updated_at             = Column(DateTime(timezone=True), nullable=False)


class AccountSnapshot(Base):
    __tablename__ = "account_snapshots"

    id                  = Column(Integer, primary_key=True)
    timestamp           = Column(DateTime(timezone=True), nullable=False)
    equity              = Column(Float, nullable=False)
    starting_capital    = Column(Float, nullable=False)
    realized_pnl        = Column(Float, nullable=False, default=0.0)
    open_position_count = Column(Integer, nullable=False, default=0)
    open_risk_usd       = Column(Float, nullable=False, default=0.0)
    trigger             = Column(String(30), nullable=True)


class OpenPosition(Base):
    __tablename__ = "open_positions"

    id           = Column(Integer, primary_key=True)
    symbol       = Column(String(20), nullable=False)
    direction    = Column(String(10), nullable=False)    # long | short
    entry_price  = Column(Float, nullable=False)
    size_usd     = Column(Float, nullable=False)         # notional in USD
    stop_loss    = Column(Float, nullable=True)
    tp1          = Column(Float, nullable=True)
    tp2          = Column(Float, nullable=True)
    tp3          = Column(Float, nullable=True)
    signal_id    = Column(Integer, ForeignKey("signals.id", ondelete="SET NULL"), nullable=True)
    status       = Column(String(20), nullable=False, default="open")  # open | closed | cancelled
    opened_at    = Column(DateTime(timezone=True), nullable=False)
    closed_at    = Column(DateTime(timezone=True), nullable=True)
    close_price  = Column(Float, nullable=True)
    realized_pnl = Column(Float, nullable=True)
    notes        = Column(Text, nullable=True)
