"""
services/risk_engine.py — Deterministic trade risk assessment (Phase 87).

All checks are synchronous against the current account state snapshot.
No orders are placed here — the engine only decides whether a proposed
trade is permissible and what position size to allocate.

Assessment verdict:
  approved  — all checks pass; proceed
  blocked   — kill switch or hard limit tripped; do not trade
  warning   — risk checks marginal but within limits; trade with caution
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.account_state import get_account_state

logger = logging.getLogger(__name__)


@dataclass
class RiskAssessment:
    verdict: str                            # approved | blocked | warning
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # Computed position sizing
    suggested_size_usd: float = 0.0
    max_allowed_usd: float = 0.0
    risk_usd: float = 0.0                   # $ at risk for suggested size
    risk_pct_of_equity: float = 0.0

    # Context snapshots
    kill_switch_active: bool = False
    current_equity: float = 0.0
    open_risk_usd: float = 0.0
    open_risk_pct: float = 0.0
    max_open_risk_pct: float = 10.0
    max_risk_per_trade_pct: float = 2.0
    daily_loss_limit_pct: float = 5.0

    def to_dict(self) -> dict:
        return {
            "verdict":               self.verdict,
            "reasons":               self.reasons,
            "warnings":              self.warnings,
            "suggested_size_usd":    round(self.suggested_size_usd, 2),
            "max_allowed_usd":       round(self.max_allowed_usd, 2),
            "risk_usd":              round(self.risk_usd, 2),
            "risk_pct_of_equity":    round(self.risk_pct_of_equity, 4),
            "kill_switch_active":    self.kill_switch_active,
            "current_equity":        round(self.current_equity, 2),
            "open_risk_usd":         round(self.open_risk_usd, 2),
            "open_risk_pct":         round(self.open_risk_pct, 2),
            "max_open_risk_pct":     self.max_open_risk_pct,
            "max_risk_per_trade_pct": self.max_risk_per_trade_pct,
            "daily_loss_limit_pct":  self.daily_loss_limit_pct,
        }


async def assess_trade(
    db: AsyncSession,
    entry_price: float,
    stop_loss:   float,
    size_usd:    Optional[float] = None,   # if None, engine computes from risk %
    override_risk_pct: Optional[float] = None,  # overrides account default if provided
) -> RiskAssessment:
    """
    Run full risk gate for a proposed trade.

    Args:
        entry_price: Proposed entry price.
        stop_loss:   Proposed stop-loss price.
        size_usd:    Notional position size to check. If None, engine sizes automatically.
        override_risk_pct: Use this risk % instead of account default (for what-if sizing).
    """
    state = await get_account_state(db)
    a = RiskAssessment(
        kill_switch_active    = state["kill_switch_active"],
        current_equity        = state["current_equity"],
        open_risk_usd         = state["open_risk_usd"],
        open_risk_pct         = state["open_risk_pct"],
        max_open_risk_pct     = state["max_open_risk_pct"],
        max_risk_per_trade_pct = state["max_risk_per_trade_pct"],
        daily_loss_limit_pct  = state["daily_loss_limit_pct"],
    )

    # ── Hard block: kill switch ────────────────────────────────────────────────
    if a.kill_switch_active:
        a.verdict = "blocked"
        a.reasons.append("Kill switch is active — all new trades blocked.")
        return a

    # ── Validate inputs ────────────────────────────────────────────────────────
    if entry_price <= 0 or stop_loss <= 0:
        a.verdict = "blocked"
        a.reasons.append("Invalid entry or stop-loss price (must be > 0).")
        return a

    sl_distance_pct = abs(entry_price - stop_loss) / entry_price
    if sl_distance_pct == 0:
        a.verdict = "blocked"
        a.reasons.append("Entry and stop-loss are the same price.")
        return a

    # ── Position sizing ────────────────────────────────────────────────────────
    risk_pct = override_risk_pct if override_risk_pct is not None else a.max_risk_per_trade_pct
    risk_usd_budget = a.current_equity * risk_pct / 100
    # notional size = risk_budget / sl_distance_pct
    auto_size = round(risk_usd_budget / sl_distance_pct, 2) if sl_distance_pct > 0 else 0.0
    check_size = size_usd if size_usd is not None else auto_size

    a.suggested_size_usd = auto_size
    a.max_allowed_usd    = round(a.current_equity * a.max_risk_per_trade_pct / 100 / sl_distance_pct, 2)
    a.risk_usd           = round(check_size * sl_distance_pct, 2)
    a.risk_pct_of_equity = round(a.risk_usd / a.current_equity * 100, 4) if a.current_equity > 0 else 0.0

    blocked = False

    # ── Hard block: per-trade risk limit ──────────────────────────────────────
    if size_usd is not None:
        actual_risk_pct = a.risk_pct_of_equity
        if actual_risk_pct > a.max_risk_per_trade_pct:
            blocked = True
            a.reasons.append(
                f"Per-trade risk {actual_risk_pct:.2f}% exceeds limit {a.max_risk_per_trade_pct:.1f}%. "
                f"Max size: ${a.max_allowed_usd:,.0f}."
            )

    # ── Hard block: open risk headroom ────────────────────────────────────────
    projected_open_risk_usd = a.open_risk_usd + a.risk_usd
    projected_open_risk_pct = (projected_open_risk_usd / a.current_equity * 100) if a.current_equity > 0 else 0.0
    if projected_open_risk_pct > a.max_open_risk_pct:
        blocked = True
        a.reasons.append(
            f"Projected open risk {projected_open_risk_pct:.1f}% would exceed max {a.max_open_risk_pct:.1f}% "
            f"(current {a.open_risk_pct:.1f}% + trade {a.risk_pct_of_equity:.2f}%)."
        )

    # ── Warning: approaching open risk limit ──────────────────────────────────
    elif projected_open_risk_pct > a.max_open_risk_pct * 0.80:
        a.warnings.append(
            f"Open risk will reach {projected_open_risk_pct:.1f}% after this trade "
            f"({a.max_open_risk_pct:.1f}% limit — 80% threshold crossed)."
        )

    # ── Warning: equity drawdown approaching daily limit ─────────────────────
    daily_loss_usd = a.current_equity - state["starting_capital"]  # negative = loss
    if daily_loss_usd < 0:
        daily_loss_pct = abs(daily_loss_usd) / state["starting_capital"] * 100
        if daily_loss_pct >= a.daily_loss_limit_pct:
            blocked = True
            a.reasons.append(
                f"Daily loss limit reached: account down {daily_loss_pct:.1f}% "
                f"(limit: {a.daily_loss_limit_pct:.1f}%). No new trades."
            )
        elif daily_loss_pct >= a.daily_loss_limit_pct * 0.80:
            a.warnings.append(
                f"Account down {daily_loss_pct:.1f}% — approaching daily loss limit "
                f"of {a.daily_loss_limit_pct:.1f}%."
            )

    if blocked:
        a.verdict = "blocked"
    elif a.warnings:
        a.verdict = "warning"
    else:
        a.verdict = "approved"

    return a


async def get_risk_summary(db: AsyncSession) -> dict:
    """Return a condensed risk status dict suitable for panel display."""
    state = await get_account_state(db)
    daily_loss_usd = state["current_equity"] - state["starting_capital"]
    daily_loss_pct = (
        abs(daily_loss_usd) / state["starting_capital"] * 100
        if daily_loss_usd < 0 and state["starting_capital"] > 0
        else 0.0
    )

    open_risk_pct  = state["open_risk_pct"]
    max_open       = state["max_open_risk_pct"]
    daily_limit    = state["daily_loss_limit_pct"]

    def _traffic(current, limit) -> str:
        ratio = current / limit if limit > 0 else 0
        if ratio >= 1.0:   return "red"
        if ratio >= 0.80:  return "orange"
        return "green"

    return {
        "kill_switch_active":     state["kill_switch_active"],
        "current_equity":         state["current_equity"],
        "open_risk_usd":          state["open_risk_usd"],
        "open_risk_pct":          state["open_risk_pct"],
        "max_open_risk_pct":      max_open,
        "open_risk_traffic":      _traffic(open_risk_pct, max_open),
        "daily_loss_pct":         round(daily_loss_pct, 2),
        "daily_loss_limit_pct":   daily_limit,
        "daily_loss_traffic":     _traffic(daily_loss_pct, daily_limit),
        "max_risk_per_trade_pct": state["max_risk_per_trade_pct"],
        "open_count":             state["open_count"],
        "realized_pnl":           state["realized_pnl"],
    }
