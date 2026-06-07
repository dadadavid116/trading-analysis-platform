"""
services/backtest_service.py — Signal backtest engine (Phase 90).

Replays historical signals against price_candles to compute outcomes.

Outcome logic per signal:
  - entry_price = midpoint of (entry_low + entry_high)
  - Walk 1-min candles from signal.created_at → signal.expires_at
  - For LONG: low <= stop_loss → SL hit; high >= tp3/tp2/tp1 (checked in order) → TP hit
  - For SHORT: high >= stop_loss → SL hit; low <= tp3/tp2/tp1 → TP hit
  - First event wins; if no hit before expiry → 'expired'
  - R-multiple: TP hit → (tpN - entry) / (entry - sl); SL → -1.0; expired → 0.0

Equity simulation:
  - Processes trades in chronological order
  - Risks risk_pct% of current equity per trade
  - Gain/loss = sized by actual R achieved
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_CANDLE_LIMIT_PER_SIGNAL = 1500   # ~25H of 1-min candles


async def _candles_after(db: AsyncSession, symbol: str, since: datetime, until: datetime) -> list:
    """Return OHLC rows for symbol between since and until, oldest first."""
    result = await db.execute(text("""
        SELECT timestamp, high, low, close
        FROM price_candles
        WHERE symbol = :sym AND timestamp > :since AND timestamp <= :until
        ORDER BY timestamp ASC
        LIMIT :lim
    """), {"sym": symbol, "since": since, "until": until, "lim": _CANDLE_LIMIT_PER_SIGNAL})
    return result.fetchall()


def _simulate_signal(row, candles) -> dict:
    """Determine outcome + R-multiple for one signal."""
    entry  = ((row.entry_low or 0) + (row.entry_high or 0)) / 2
    sl     = row.stop_loss
    tp1    = row.tp1
    tp2    = row.tp2
    tp3    = row.tp3

    if not entry or not sl or entry == sl:
        return {"outcome": "skipped", "r": 0.0, "hit_at": None, "tp_level": None}

    sl_dist = abs(entry - sl)

    is_long = row.direction == "long"
    outcome = "expired"
    r       = 0.0
    hit_at  = None
    tp_level = None

    for candle in candles:
        ts, high, low, close = candle
        high = float(high); low = float(low)

        if is_long:
            # SL first (more conservative)
            if low <= sl:
                outcome = "sl";  r = -1.0;        hit_at = ts; break
            if tp3 and high >= float(tp3):
                rr = (float(tp3) - entry) / sl_dist
                outcome = "tp3"; r = round(rr, 2); hit_at = ts; tp_level = "tp3"; break
            if tp2 and high >= float(tp2):
                rr = (float(tp2) - entry) / sl_dist
                outcome = "tp2"; r = round(rr, 2); hit_at = ts; tp_level = "tp2"; break
            if tp1 and high >= float(tp1):
                rr = (float(tp1) - entry) / sl_dist
                outcome = "tp1"; r = round(rr, 2); hit_at = ts; tp_level = "tp1"; break
        else:
            if high >= sl:
                outcome = "sl";  r = -1.0;        hit_at = ts; break
            if tp3 and low <= float(tp3):
                rr = (entry - float(tp3)) / sl_dist
                outcome = "tp3"; r = round(rr, 2); hit_at = ts; tp_level = "tp3"; break
            if tp2 and low <= float(tp2):
                rr = (entry - float(tp2)) / sl_dist
                outcome = "tp2"; r = round(rr, 2); hit_at = ts; tp_level = "tp2"; break
            if tp1 and low <= float(tp1):
                rr = (entry - float(tp1)) / sl_dist
                outcome = "tp1"; r = round(rr, 2); hit_at = ts; tp_level = "tp1"; break

    return {
        "outcome":   outcome,
        "r":         r,
        "hit_at":    hit_at.isoformat() if hit_at else None,
        "tp_level":  tp_level,
    }


def _bucket_r(r: float) -> str:
    if r <= -1.5:                return "<-1.5"
    if -1.5 < r <= -1.0:        return "-1.5 to -1"
    if -1.0 < r <= -0.5:        return "-1 to -0.5"
    if -0.5 < r <  0.0:         return "-0.5 to 0"
    if  0.0 <= r <  1.0:        return "0 to 1"
    if  1.0 <= r <  2.0:        return "1 to 2"
    if  2.0 <= r <  3.0:        return "2 to 3"
    if  3.0 <= r <  5.0:        return "3 to 5"
    return ">5"

_R_BUCKETS = ["<-1.5", "-1.5 to -1", "-1 to -0.5", "-0.5 to 0",
              "0 to 1", "1 to 2", "2 to 3", "3 to 5", ">5"]


async def run_backtest(
    db:          AsyncSession,
    symbol:      Optional[str]      = None,
    direction:   Optional[str]      = None,
    since:       Optional[datetime] = None,
    until:       Optional[datetime] = None,
    risk_pct:    float              = 1.0,
    start_equity: float             = 10_000.0,
) -> dict:
    """
    Run a backtest against all historical signals in the DB.
    Returns aggregate stats + per-trade list + equity curve + R-distribution.
    """
    from app.models.signal import Signal

    q = select(Signal).order_by(Signal.created_at.asc())
    if symbol:
        q = q.where(Signal.symbol == symbol.upper())
    if direction:
        q = q.where(Signal.direction == direction)
    if since:
        q = q.where(Signal.created_at >= since)
    if until:
        q = q.where(Signal.created_at <= until)

    result = await db.execute(q)
    signals = result.scalars().all()

    trades        = []
    equity        = start_equity
    peak_equity   = equity
    max_drawdown  = 0.0
    total_r       = 0.0
    gross_wins    = 0.0
    gross_losses  = 0.0
    r_dist        = {b: 0 for b in _R_BUCKETS}
    equity_curve  = [{"index": 0, "equity": round(equity, 2), "r": 0.0}]

    for sig in signals:
        if not sig.entry_low or not sig.entry_high or not sig.stop_loss:
            continue

        expires = sig.expires_at or (sig.created_at.replace(tzinfo=timezone.utc) if sig.created_at.tzinfo is None else sig.created_at)
        candles = await _candles_after(db, sig.symbol, sig.created_at, expires)
        if not candles:
            continue

        sim = _simulate_signal(sig, candles)
        if sim["outcome"] == "skipped":
            continue

        r = sim["r"]
        pnl = equity * (risk_pct / 100) * r  # +/- based on R

        if r > 0:
            gross_wins += pnl
        elif r < 0:
            gross_losses += abs(pnl)

        equity   = max(0.01, equity + pnl)
        total_r += r

        if equity > peak_equity:
            peak_equity = equity
        dd = (equity - peak_equity) / peak_equity * 100
        if dd < max_drawdown:
            max_drawdown = dd

        r_dist[_bucket_r(r)] += 1
        equity_curve.append({"index": len(equity_curve), "equity": round(equity, 2), "r": round(r, 2)})

        trades.append({
            "signal_id":  sig.id,
            "symbol":     sig.symbol,
            "direction":  sig.direction,
            "timeframe":  sig.timeframe,
            "entry_price": round(((sig.entry_low or 0) + (sig.entry_high or 0)) / 2, 4),
            "stop_loss":  float(sig.stop_loss) if sig.stop_loss else None,
            "tp1":        float(sig.tp1)       if sig.tp1       else None,
            "outcome":    sim["outcome"],
            "tp_level":   sim["tp_level"],
            "r":          r,
            "pnl":        round(pnl, 2),
            "hit_at":     sim["hit_at"],
            "created_at": sig.created_at.isoformat() if sig.created_at else None,
            "context_score": float(sig.context_score) if sig.context_score else None,
            "regime":     sig.regime,
        })

    # Aggregate stats
    total       = len(trades)
    filled      = [t for t in trades if t["outcome"] != "expired"]
    wins        = [t for t in filled if t["outcome"] != "sl"]
    losses      = [t for t in filled if t["outcome"] == "sl"]
    expired_cnt = total - len(filled)
    win_rate    = len(wins) / len(filled) * 100 if filled else 0.0
    profit_factor = gross_wins / gross_losses if gross_losses > 0 else (float("inf") if gross_wins > 0 else 0.0)
    avg_r       = total_r / len(filled) if filled else 0.0

    return {
        "params": {
            "symbol":    symbol, "direction": direction,
            "risk_pct":  risk_pct, "start_equity": start_equity,
            "since":     since.isoformat()  if since  else None,
            "until":     until.isoformat()  if until  else None,
        },
        "signals_tested": total,
        "filled":         len(filled),
        "wins":           len(wins),
        "losses":         len(losses),
        "expired":        expired_cnt,
        "win_rate":       round(win_rate, 1),
        "profit_factor":  round(min(profit_factor, 99.9), 2),
        "expectancy_r":   round(avg_r, 3),
        "total_r":        round(total_r, 2),
        "max_drawdown":   round(max_drawdown, 2),
        "final_equity":   round(equity, 2),
        "total_return_pct": round((equity - start_equity) / start_equity * 100, 2),
        "equity_curve":   equity_curve,
        "r_distribution": r_dist,
        "trades":         trades[-100:],   # last 100 for the UI table
    }


async def replay_candles(
    db:         AsyncSession,
    symbol:     str,
    since:      datetime,
    limit:      int = 200,
    timeframe:  str = "1m",
) -> list[dict]:
    """Return OHLCV candles starting from `since` for chart replay."""
    result = await db.execute(text("""
        SELECT timestamp, open, high, low, close, volume
        FROM price_candles
        WHERE symbol = :sym AND timestamp >= :since
        ORDER BY timestamp ASC
        LIMIT :lim
    """), {"sym": symbol, "since": since, "lim": limit})
    rows = result.fetchall()
    return [
        {
            "time":   int(r[0].timestamp()),
            "open":   float(r[1]),
            "high":   float(r[2]),
            "low":    float(r[3]),
            "close":  float(r[4]),
            "volume": float(r[5]),
        }
        for r in rows
    ]
