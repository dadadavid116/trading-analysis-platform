"""
services/review_service.py — Review & Research analytics (Phase 91).

  daily_review()      — today's P&L + trade count + AI coaching note (Haiku, 30-min cache)
  regime_stats()      — closed-trade performance grouped by regime
  rule_adherence()    — current risk-rule compliance score
  setup_type_stats()  — performance breakdown by signal_labels / timeframe
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from anthropic import AsyncAnthropic
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.account_state import get_account_state

logger = logging.getLogger(__name__)

_anthropic = AsyncAnthropic()
_ai_cache: dict[str, tuple[str, datetime]] = {}   # key → (text, cached_at)
_CACHE_TTL = timedelta(minutes=30)


def _today_start() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

def _week_start() -> datetime:
    now = datetime.now(timezone.utc)
    return (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


# ── Daily Review ───────────────────────────────────────────────────────────────

async def daily_review(db: AsyncSession) -> dict:
    today = _today_start()

    result = await db.execute(text("""
        SELECT realized_pnl, direction, symbol, entry_price, close_price, closed_at
        FROM open_positions
        WHERE status = 'closed' AND closed_at >= :today
        ORDER BY closed_at DESC
    """), {"today": today})
    trades = result.fetchall()

    total       = len(trades)
    wins        = [t for t in trades if (t.realized_pnl or 0) > 0]
    losses      = [t for t in trades if (t.realized_pnl or 0) < 0]
    total_pnl   = sum(t.realized_pnl or 0 for t in trades)
    win_rate    = len(wins) / total * 100 if total else 0.0
    avg_win     = sum(t.realized_pnl for t in wins)   / len(wins)   if wins   else 0.0
    avg_loss    = sum(t.realized_pnl for t in losses) / len(losses) if losses else 0.0

    state = await get_account_state(db)

    # AI coaching note (cached 30 min)
    cache_key = f"daily_{today.date()}"
    coaching   = None
    cached     = _ai_cache.get(cache_key)
    if cached and (datetime.now(timezone.utc) - cached[1]) < _CACHE_TTL:
        coaching = cached[0]
    else:
        try:
            trade_summary = (
                f"Today's trades: {total} total, {len(wins)} wins, {len(losses)} losses.\n"
                f"Net P&L: ${total_pnl:.2f}. Win rate: {win_rate:.1f}%.\n"
                f"Avg win: ${avg_win:.2f}. Avg loss: ${avg_loss:.2f}.\n"
                f"Open equity: ${state['current_equity']:.2f}. "
                f"Open risk: {state['open_risk_pct']:.1f}%.\n"
            )
            if trades:
                trade_summary += "Recent trades:\n"
                for t in trades[:5]:
                    trade_summary += f"  {t.direction.upper()} {t.symbol}: PnL ${t.realized_pnl:.2f}\n"

            msg = await _anthropic.messages.create(
                model       = "claude-haiku-4-5-20251001",
                max_tokens  = 250,
                system      = (
                    "You are a trading coach giving brief, direct end-of-day feedback. "
                    "3–5 sentences max. Focus on what the trader did well, what could improve, "
                    "and one specific action for tomorrow. No preamble."
                ),
                messages=[{"role": "user", "content": trade_summary}],
            )
            coaching = msg.content[0].text
            _ai_cache[cache_key] = (coaching, datetime.now(timezone.utc))
        except Exception as exc:
            logger.warning("AI daily review failed: %s", exc)
            coaching = None

    return {
        "date":       today.date().isoformat(),
        "total":      total,
        "wins":       len(wins),
        "losses":     len(losses),
        "win_rate":   round(win_rate, 1),
        "total_pnl":  round(total_pnl, 2),
        "avg_win":    round(avg_win, 2),
        "avg_loss":   round(avg_loss, 2),
        "open_count": state["open_count"],
        "open_risk_pct": state["open_risk_pct"],
        "current_equity": state["current_equity"],
        "ai_coaching": coaching,
        "recent_trades": [
            {
                "symbol":       t.symbol,
                "direction":    t.direction,
                "realized_pnl": round(t.realized_pnl or 0, 2),
                "closed_at":    t.closed_at.isoformat() if t.closed_at else None,
            }
            for t in trades[:10]
        ],
    }


# ── Regime Stats ───────────────────────────────────────────────────────────────

async def regime_stats(db: AsyncSession) -> list[dict]:
    """
    Closed trades grouped by the regime recorded on the originating signal.
    Falls back to 'unknown' if no signal_id or signal has no regime.
    """
    result = await db.execute(text("""
        SELECT
            COALESCE(s.regime, 'unknown') AS regime,
            COUNT(*)                       AS total,
            SUM(CASE WHEN p.realized_pnl > 0 THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN p.realized_pnl < 0 THEN 1 ELSE 0 END) AS losses,
            SUM(p.realized_pnl)            AS total_pnl,
            AVG(p.realized_pnl)            AS avg_pnl
        FROM open_positions p
        LEFT JOIN signals s ON p.signal_id = s.id
        WHERE p.status = 'closed' AND p.realized_pnl IS NOT NULL
        GROUP BY COALESCE(s.regime, 'unknown')
        ORDER BY total_pnl DESC NULLS LAST
    """))
    rows = result.fetchall()
    out = []
    for r in rows:
        total = int(r.total)
        wins  = int(r.wins  or 0)
        losses= int(r.losses or 0)
        out.append({
            "regime":     r.regime,
            "total":      total,
            "wins":       wins,
            "losses":     losses,
            "win_rate":   round(wins / total * 100, 1) if total else 0.0,
            "total_pnl":  round(float(r.total_pnl or 0), 2),
            "avg_pnl":    round(float(r.avg_pnl   or 0), 2),
        })
    return out


# ── Rule Adherence ─────────────────────────────────────────────────────────────

async def rule_adherence(db: AsyncSession) -> dict:
    """
    Check current account state against configured risk rules.
    Returns per-rule pass/fail + overall score (% passing).
    """
    state = await get_account_state(db)

    starting  = state["starting_capital"]
    equity    = state["current_equity"]
    daily_dd  = (equity - starting) / starting * 100 if starting > 0 else 0
    daily_loss_ok = daily_dd > -state["daily_loss_limit_pct"]

    rules = [
        {
            "rule":        "Kill switch off",
            "pass":        not state["kill_switch_active"],
            "detail":      "Trading is enabled" if not state["kill_switch_active"] else "Kill switch is ACTIVE",
        },
        {
            "rule":        "Open risk within limit",
            "pass":        state["open_risk_pct"] < state["max_open_risk_pct"],
            "detail":      f"{state['open_risk_pct']:.1f}% vs {state['max_open_risk_pct']:.1f}% max",
        },
        {
            "rule":        "Daily loss limit not breached",
            "pass":        daily_loss_ok,
            "detail":      f"{daily_dd:.2f}% vs {state['daily_loss_limit_pct']:.1f}% limit",
        },
        {
            "rule":        "Risk per trade configured",
            "pass":        state["max_risk_per_trade_pct"] > 0,
            "detail":      f"{state['max_risk_per_trade_pct']:.1f}% per trade",
        },
        {
            "rule":        "Starting capital set",
            "pass":        starting > 0,
            "detail":      f"${starting:,.0f}",
        },
    ]

    passing = sum(1 for r in rules if r["pass"])
    score   = round(passing / len(rules) * 100)

    return {
        "score":   score,
        "passing": passing,
        "total":   len(rules),
        "rules":   rules,
        "equity":  round(equity, 2),
        "daily_drawdown_pct": round(daily_dd, 2),
    }


# ── Setup-type / timeframe stats ───────────────────────────────────────────────

async def setup_type_stats(db: AsyncSession) -> list[dict]:
    """Performance breakdown by timeframe of the originating signal."""
    result = await db.execute(text("""
        SELECT
            COALESCE(s.timeframe, 'unknown')  AS timeframe,
            COALESCE(s.direction, p.direction) AS direction,
            COUNT(*)                           AS total,
            SUM(CASE WHEN p.realized_pnl > 0 THEN 1 ELSE 0 END) AS wins,
            SUM(p.realized_pnl)               AS total_pnl
        FROM open_positions p
        LEFT JOIN signals s ON p.signal_id = s.id
        WHERE p.status = 'closed' AND p.realized_pnl IS NOT NULL
        GROUP BY COALESCE(s.timeframe, 'unknown'), COALESCE(s.direction, p.direction)
        ORDER BY total_pnl DESC NULLS LAST
    """))
    rows = result.fetchall()
    return [
        {
            "timeframe":  r.timeframe,
            "direction":  r.direction,
            "total":      int(r.total),
            "wins":       int(r.wins or 0),
            "win_rate":   round(int(r.wins or 0) / int(r.total) * 100, 1) if r.total else 0.0,
            "total_pnl":  round(float(r.total_pnl or 0), 2),
        }
        for r in rows
    ]
