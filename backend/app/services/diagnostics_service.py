"""
services/diagnostics_service.py — Model diagnostics and factor attribution (Phase 92).

  factor_ic()              — Pearson/Spearman correlation of score dimensions vs trade outcome
  regime_heatmap()         — win rate + PnL grid by (regime × month)
  score_quartile_stats()   — signal performance bucketed into 4 context-score quartiles
  trade_attribution()      — per-trade score breakdown for recent closed positions
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ── Math helpers (pure Python, no numpy) ─────────────────────────────────────

def _pearson(xs: list[float], ys: list[float]) -> Optional[float]:
    n = len(xs)
    if n < 3:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sx  = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy  = sum((y - my) ** 2 for y in ys) ** 0.5
    if sx == 0 or sy == 0:
        return None
    return round(cov / (sx * sy), 4)


def _rank_ic(xs: list[float], ys: list[float]) -> Optional[float]:
    """Spearman rank correlation."""
    n = len(xs)
    if n < 3:
        return None
    def _ranks(vals: list[float]) -> list[float]:
        sorted_vals = sorted(enumerate(vals), key=lambda t: t[1])
        ranks = [0.0] * n
        for rank, (i, _) in enumerate(sorted_vals, 1):
            ranks[i] = float(rank)
        return ranks
    return _pearson(_ranks(xs), _ranks(ys))


def _ic_label(ic: Optional[float]) -> str:
    if ic is None:
        return "insufficient data"
    if abs(ic) >= 0.35:
        return "strong"
    if abs(ic) >= 0.20:
        return "moderate"
    if abs(ic) >= 0.08:
        return "weak"
    return "negligible"


# ── Factor IC ─────────────────────────────────────────────────────────────────

async def factor_ic(db: AsyncSession) -> dict:
    """
    Compute correlation between score dimensions captured at signal time and
    trade realized_pnl.  Dimensions: context_score, crypto_score, macro_score.
    """
    result = await db.execute(text("""
        SELECT
            s.context_score,
            s.crypto_score,
            s.macro_score,
            p.realized_pnl
        FROM open_positions p
        JOIN signals s ON p.signal_id = s.id
        WHERE p.status = 'closed'
          AND p.realized_pnl IS NOT NULL
          AND s.context_score IS NOT NULL
    """))
    rows = result.fetchall()

    if not rows:
        return {"n": 0, "factors": [], "note": "No closed trades with signal data yet."}

    ctx    = [float(r.context_score) for r in rows]
    crypto = [float(r.crypto_score)  for r in rows if r.crypto_score  is not None]
    macro  = [float(r.macro_score)   for r in rows if r.macro_score   is not None]
    pnl    = [float(r.realized_pnl)  for r in rows]
    pnl_c  = [float(r.realized_pnl)  for r in rows if r.crypto_score  is not None]
    pnl_m  = [float(r.realized_pnl)  for r in rows if r.macro_score   is not None]

    factors = []
    for name, scores, outcomes in [
        ("Context Score",  ctx,    pnl),
        ("Crypto Score",   crypto, pnl_c),
        ("Macro Score",    macro,  pnl_m),
    ]:
        ic   = _pearson(scores, outcomes)
        ric  = _rank_ic(scores, outcomes)
        factors.append({
            "factor":  name,
            "n":       len(scores),
            "ic":      ic,
            "rank_ic": ric,
            "label":   _ic_label(ic),
        })

    # also compute win_rate per context_score tercile for context
    sorted_pairs = sorted(zip(ctx, pnl), key=lambda t: t[0])
    tercile_size = max(1, len(sorted_pairs) // 3)
    terciles = []
    for i in range(3):
        chunk = sorted_pairs[i * tercile_size: (i + 1) * tercile_size]
        wins  = sum(1 for _, p in chunk if p > 0)
        label = ["Low", "Mid", "High"][i]
        terciles.append({
            "label":    label,
            "n":        len(chunk),
            "win_rate": round(wins / len(chunk) * 100, 1) if chunk else 0.0,
            "avg_pnl":  round(sum(p for _, p in chunk) / len(chunk), 2) if chunk else 0.0,
        })

    return {
        "n":       len(rows),
        "factors": factors,
        "context_terciles": terciles,
    }


# ── Regime Heatmap ────────────────────────────────────────────────────────────

async def regime_heatmap(db: AsyncSession) -> dict:
    """
    Grid of (regime, month) → win_rate + count + total_pnl.
    Returns unique regimes, unique periods (YYYY-MM), and a cells list.
    """
    result = await db.execute(text("""
        SELECT
            COALESCE(s.regime, 'unknown')                     AS regime,
            TO_CHAR(p.closed_at, 'YYYY-MM')                   AS period,
            COUNT(*)                                           AS total,
            SUM(CASE WHEN p.realized_pnl > 0 THEN 1 ELSE 0 END) AS wins,
            SUM(p.realized_pnl)                               AS total_pnl
        FROM open_positions p
        LEFT JOIN signals s ON p.signal_id = s.id
        WHERE p.status = 'closed'
          AND p.closed_at IS NOT NULL
          AND p.realized_pnl IS NOT NULL
        GROUP BY COALESCE(s.regime, 'unknown'), TO_CHAR(p.closed_at, 'YYYY-MM')
        ORDER BY period, regime
    """))
    rows = result.fetchall()

    if not rows:
        return {"regimes": [], "periods": [], "cells": [], "note": "No closed trades yet."}

    regimes = sorted({r.regime for r in rows})
    periods = sorted({r.period for r in rows})

    cells = []
    for r in rows:
        total = int(r.total)
        wins  = int(r.wins or 0)
        cells.append({
            "regime":    r.regime,
            "period":    r.period,
            "total":     total,
            "wins":      wins,
            "win_rate":  round(wins / total * 100, 1) if total else 0.0,
            "total_pnl": round(float(r.total_pnl or 0), 2),
        })

    return {"regimes": regimes, "periods": periods, "cells": cells}


# ── Score Quartile Stats ──────────────────────────────────────────────────────

async def score_quartile_stats(db: AsyncSession) -> dict:
    """
    Divide closed trades into 4 context-score quartiles and compare performance.
    Q1 = lowest scores, Q4 = highest.
    """
    result = await db.execute(text("""
        SELECT
            s.context_score,
            p.realized_pnl,
            p.direction
        FROM open_positions p
        JOIN signals s ON p.signal_id = s.id
        WHERE p.status = 'closed'
          AND p.realized_pnl IS NOT NULL
          AND s.context_score IS NOT NULL
        ORDER BY s.context_score ASC
    """))
    rows = result.fetchall()

    if len(rows) < 4:
        return {"quartiles": [], "note": "Need at least 4 closed signal trades for quartile analysis."}

    n    = len(rows)
    q    = n // 4
    data = [(float(r.context_score), float(r.realized_pnl)) for r in rows]

    quartiles = []
    for i in range(4):
        start = i * q
        end   = (i + 1) * q if i < 3 else n
        chunk = data[start:end]
        wins  = sum(1 for _, p in chunk if p > 0)
        total_pnl = sum(p for _, p in chunk)
        score_lo  = chunk[0][0]
        score_hi  = chunk[-1][0]
        quartiles.append({
            "quartile":  f"Q{i + 1}",
            "label":     ["Low", "Low-Mid", "Mid-High", "High"][i],
            "n":         len(chunk),
            "score_lo":  round(score_lo, 1),
            "score_hi":  round(score_hi, 1),
            "win_rate":  round(wins / len(chunk) * 100, 1) if chunk else 0.0,
            "avg_pnl":   round(total_pnl / len(chunk), 2) if chunk else 0.0,
            "total_pnl": round(total_pnl, 2),
        })

    return {"n": n, "quartiles": quartiles}


# ── Trade Attribution ─────────────────────────────────────────────────────────

async def trade_attribution(db: AsyncSession, limit: int = 25) -> list[dict]:
    """
    Recent closed trades enriched with the score breakdown from the originating signal.
    """
    result = await db.execute(text("""
        SELECT
            p.id,
            p.symbol,
            p.direction,
            p.realized_pnl,
            p.closed_at,
            s.context_score,
            s.crypto_score,
            s.macro_score,
            s.regime,
            s.timeframe
        FROM open_positions p
        LEFT JOIN signals s ON p.signal_id = s.id
        WHERE p.status = 'closed'
          AND p.realized_pnl IS NOT NULL
        ORDER BY p.closed_at DESC NULLS LAST
        LIMIT :limit
    """), {"limit": limit})
    rows = result.fetchall()

    out = []
    for r in rows:
        out.append({
            "id":            r.id,
            "symbol":        r.symbol,
            "direction":     r.direction,
            "realized_pnl":  round(float(r.realized_pnl), 2),
            "closed_at":     r.closed_at.isoformat() if r.closed_at else None,
            "context_score": round(float(r.context_score), 1) if r.context_score is not None else None,
            "crypto_score":  round(float(r.crypto_score),  1) if r.crypto_score  is not None else None,
            "macro_score":   round(float(r.macro_score),   1) if r.macro_score   is not None else None,
            "regime":        r.regime,
            "timeframe":     r.timeframe,
        })
    return out
