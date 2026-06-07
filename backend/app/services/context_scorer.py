"""
context_scorer.py — Unified Context Scoring Engine (Phase 82).

Blends the crypto factor composite score (Phase 79, weight 60%) with the macro
factor score (Phase 81, weight 40%) into a single Context Score on -100..+100.

15-minute cache in factor_scores. Both sub-scorers have their own caches too, so
a cache hit here skips all external API calls entirely.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.services.factor_scorer import compute_snapshot as _crypto_snapshot
from app.services.macro_scorer import compute_macro_snapshot as _macro_snapshot

logger = logging.getLogger(__name__)

CRYPTO_WEIGHT = 0.60
MACRO_WEIGHT  = 0.40
CACHE_SECONDS = 900  # 15 minutes


@dataclass
class ContextSnapshot:
    computed_at:       datetime
    symbol:            str
    context_score:     float
    regime:            str
    trade_environment: str
    consensus:         str   # "long" | "neutral" | "short"
    confidence:        float
    crypto_score:      Optional[float]
    macro_score:       Optional[float]
    weights_version:   int


def _regime_and_env(score: float) -> tuple[str, str]:
    if score >= 50:  return "risk_on",         "Favorable"
    if score >= 20:  return "neutral_bullish",  "Cautious-Positive"
    if score >= -20: return "neutral",          "Neutral"
    if score >= -50: return "neutral_bearish",  "Caution"
    return                  "risk_off",         "Avoid"


def _consensus(score: float) -> str:
    if score > 15:  return "long"
    if score < -15: return "short"
    return "neutral"


async def compute_context_snapshot(db: AsyncSession, symbol: str) -> ContextSnapshot:
    # ── Check 15-min cache ────────────────────────────────────────────────────
    row = (await db.execute(
        text("""
            SELECT computed_at, context_score, crypto_score, macro_score, regime
            FROM factor_scores
            WHERE symbol = :sym
            ORDER BY computed_at DESC
            LIMIT 1
        """),
        {"sym": symbol},
    )).fetchone()

    if row is not None:
        stored_at = row.computed_at
        if stored_at.tzinfo is None:
            stored_at = stored_at.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - stored_at).total_seconds()
        if age < CACHE_SECONDS:
            score = row.context_score
            reg, env = _regime_and_env(score)
            return ContextSnapshot(
                computed_at=row.computed_at,
                symbol=symbol,
                context_score=round(score, 2),
                regime=reg,
                trade_environment=env,
                consensus=_consensus(score),
                confidence=round(min(abs(score) / 100.0, 1.0), 2),
                crypto_score=row.crypto_score,
                macro_score=row.macro_score,
                weights_version=1,
            )

    # ── Fetch sub-scores sequentially (shared DB session) ─────────────────────
    crypto_score: Optional[float] = None
    macro_score:  Optional[float] = None

    try:
        crypto_raw = await _crypto_snapshot(symbol, db)
        crypto_score = crypto_raw.get("crypto_score")
    except Exception as exc:
        logger.warning("Crypto snapshot failed for context score: %s", exc)

    try:
        macro_raw = await _macro_snapshot(db)
        macro_score = macro_raw.macro_score
    except Exception as exc:
        logger.warning("Macro snapshot failed for context score: %s", exc)

    # ── Weighted blend (re-normalise if a sub-score is unavailable) ───────────
    weighted = 0.0
    total_w  = 0.0
    if crypto_score is not None:
        weighted += CRYPTO_WEIGHT * crypto_score
        total_w  += CRYPTO_WEIGHT
    if macro_score is not None:
        weighted += MACRO_WEIGHT * macro_score
        total_w  += MACRO_WEIGHT

    context_score = round(weighted / total_w, 2) if total_w > 0 else 0.0
    reg, env = _regime_and_env(context_score)
    now = datetime.now(timezone.utc)

    # ── Persist ───────────────────────────────────────────────────────────────
    try:
        await db.execute(
            text("""
                INSERT INTO factor_scores
                    (computed_at, symbol, crypto_score, macro_score,
                     context_score, regime, weights_version)
                VALUES (:ts, :sym, :cs, :ms, :ctx, :reg, 1)
            """),
            {"ts": now, "sym": symbol, "cs": crypto_score,
             "ms": macro_score, "ctx": context_score, "reg": reg},
        )
        await db.execute(
            text("DELETE FROM factor_scores WHERE computed_at < NOW() - INTERVAL '7 days'")
        )
        await db.commit()
    except Exception as exc:
        logger.error("Failed to persist context score: %s", exc)
        await db.rollback()

    return ContextSnapshot(
        computed_at=now,
        symbol=symbol,
        context_score=context_score,
        regime=reg,
        trade_environment=env,
        consensus=_consensus(context_score),
        confidence=round(min(abs(context_score) / 100.0, 1.0), 2),
        crypto_score=crypto_score,
        macro_score=macro_score,
        weights_version=1,
    )
