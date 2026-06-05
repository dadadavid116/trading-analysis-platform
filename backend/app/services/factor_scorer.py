"""
services/factor_scorer.py — Compute normalized crypto factor scores (Phase 79).

Reads 5 factors from existing DB tables (funding, OI, L/S, liquidations, orderbook)
and 2 from external APIs (Fear & Greed, CoinGecko market cap). Produces a deterministic
regime label + composite Context Score per Principle D.

All normalization maps raw values to -1.0 (max bearish) … +1.0 (max bullish).
"""

import asyncio
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, delete as sa_delete, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.derivatives import FundingRate, OpenInterest, LSRatio
from app.models.liquidation import Liquidation
from app.models.orderbook import OrderBookSnapshot
from app.models.factor import FactorObservation, RegimeSnapshot

logger = logging.getLogger(__name__)

# ── Factor weights (must sum ≤ 1.0; normalised by present-factor weight sum) ─

WEIGHTS: dict[str, float] = {
    "funding_rate":   0.20,
    "ls_ratio":       0.15,
    "liq_pressure":   0.15,
    "ob_imbalance":   0.10,
    "fear_greed":     0.15,
    "oi_delta":       0.10,
    "total_mcap_24h": 0.15,
}

DRIVER_MAP: dict[str, str] = {
    "funding_rate":   "Derivatives",
    "ls_ratio":       "Derivatives",
    "oi_delta":       "Derivatives",
    "liq_pressure":   "Liquidity",
    "ob_imbalance":   "Liquidity",
    "fear_greed":     "Sentiment",
    "total_mcap_24h": "Momentum",
}


# ── Data class ────────────────────────────────────────────────────────────────

@dataclass
class FactorScore:
    factor_name:      str
    symbol:           str | None
    raw_value:        float | None
    normalized_score: float    # -1.0 to +1.0
    direction:        str      # "bullish" | "bearish" | "neutral"
    confidence:       float    # 0.0 to 1.0
    source:           str


def _clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _direction(score: float, threshold: float = 0.15) -> str:
    if score > threshold:
        return "bullish"
    if score < -threshold:
        return "bearish"
    return "neutral"


# ── Individual factor scorers ─────────────────────────────────────────────────

async def _score_funding(symbol: str, db: AsyncSession) -> FactorScore | None:
    """Funding rate → bearish when positive (longs crowded), bullish when negative."""
    result = await db.execute(
        select(FundingRate.funding_rate)
        .where(FundingRate.symbol == symbol)
        .order_by(desc(FundingRate.timestamp))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    raw = float(row)
    funding_bps = raw * 10_000           # e.g. 0.0001 → 1 bps
    score = _clamp(-funding_bps / 5.0)  # 5 bps positive → -1.0 bearish
    return FactorScore(
        factor_name="funding_rate", symbol=symbol, raw_value=raw,
        normalized_score=round(score, 4),
        direction=_direction(score),
        confidence=round(min(abs(score) + 0.3, 1.0), 3),
        source="binance",
    )


async def _score_oi_delta(symbol: str, db: AsyncSession) -> FactorScore | None:
    """1H OI % change → positive expansion is bullish momentum."""
    now = datetime.now(timezone.utc)
    r_latest = await db.execute(
        select(OpenInterest.oi_value)
        .where(OpenInterest.symbol == symbol)
        .order_by(desc(OpenInterest.timestamp))
        .limit(1)
    )
    latest_oi = r_latest.scalar_one_or_none()

    r_1h = await db.execute(
        select(OpenInterest.oi_value)
        .where(
            OpenInterest.symbol == symbol,
            OpenInterest.timestamp >= now - timedelta(hours=1, minutes=15),
            OpenInterest.timestamp <= now - timedelta(minutes=45),
        )
        .order_by(desc(OpenInterest.timestamp))
        .limit(1)
    )
    oi_1h = r_1h.scalar_one_or_none()

    if latest_oi is None or oi_1h is None or float(oi_1h) == 0:
        return None
    delta_pct = (float(latest_oi) - float(oi_1h)) / float(oi_1h) * 100
    score = _clamp(delta_pct / 5.0)  # ±5% expansion → ±1.0
    return FactorScore(
        factor_name="oi_delta", symbol=symbol, raw_value=round(delta_pct, 3),
        normalized_score=round(score, 4),
        direction=_direction(score, threshold=0.20),
        confidence=0.45,
        source="binance",
    )


async def _score_ls_ratio(symbol: str, db: AsyncSession) -> FactorScore | None:
    """Long/short ratio → contrarian: many longs = bearish, many shorts = bullish."""
    for ratio_type in ("global_account", "top_account"):
        result = await db.execute(
            select(LSRatio.long_ratio)
            .where(LSRatio.symbol == symbol, LSRatio.ratio_type == ratio_type)
            .order_by(desc(LSRatio.timestamp))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            long_ratio = float(row)  # 0.0–1.0
            score = _clamp((0.5 - long_ratio) * 4.0)
            # 75% long → (0.5-0.75)*4 = -1.0 bearish; 25% long → +1.0 bullish
            return FactorScore(
                factor_name="ls_ratio", symbol=symbol, raw_value=round(long_ratio, 4),
                normalized_score=round(score, 4),
                direction=_direction(score),
                confidence=0.65,
                source="binance",
            )
    return None


async def _score_liq_pressure(symbol: str, db: AsyncSession) -> FactorScore | None:
    """1H liquidation flow → high sell liquidations (longs liq'd) = bearish."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Liquidation.price, Liquidation.quantity, Liquidation.side)
        .where(Liquidation.symbol == symbol, Liquidation.timestamp >= now - timedelta(hours=1))
    )
    rows = result.all()
    if not rows:
        return None

    sell_usd = sum(float(r.price) * float(r.quantity) for r in rows if r.side == "sell")
    buy_usd  = sum(float(r.price) * float(r.quantity) for r in rows if r.side == "buy")
    total    = sell_usd + buy_usd
    if total < 100:  # trivial volume — skip
        return None

    sell_frac = sell_usd / total
    score = _clamp((0.5 - sell_frac) * 4.0)
    confidence = round(min(0.30 + total / 1_000_000, 0.90), 3)
    return FactorScore(
        factor_name="liq_pressure", symbol=symbol, raw_value=round(sell_frac, 4),
        normalized_score=round(score, 4),
        direction=_direction(score),
        confidence=confidence,
        source="okx",
    )


async def _score_ob_imbalance(symbol: str, db: AsyncSession) -> FactorScore | None:
    """Order-book bid/ask ratio → bid-heavy = bullish, ask-heavy = bearish."""
    result = await db.execute(
        select(OrderBookSnapshot)
        .where(OrderBookSnapshot.symbol == symbol)
        .order_by(desc(OrderBookSnapshot.timestamp))
        .limit(1)
    )
    snap = result.scalar_one_or_none()
    if snap is None:
        return None

    bids = snap.bids or []
    asks = snap.asks or []
    bid_usd = sum(float(p) * float(q) for p, q in bids)
    ask_usd = sum(float(p) * float(q) for p, q in asks)
    total = bid_usd + ask_usd
    if total <= 0:
        return None

    raw = bid_usd / total
    score = _clamp((raw - 0.5) * 4.0)
    return FactorScore(
        factor_name="ob_imbalance", symbol=symbol, raw_value=round(raw, 4),
        normalized_score=round(score, 4),
        direction=_direction(score, threshold=0.10),
        confidence=0.50,
        source="okx",
    )


async def _score_fear_greed() -> FactorScore | None:
    """Fear & Greed (contrarian) — extreme fear = bullish, extreme greed = bearish."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get("https://api.alternative.me/fng/?limit=1")
            resp.raise_for_status()
            value = int(resp.json()["data"][0]["value"])
    except Exception as exc:
        logger.warning("Fear & Greed fetch failed: %s", exc)
        return None

    score = _clamp((50 - value) / 37.5)
    # value=0   → (50-0)/37.5 = +1.33 → +1.0 (extreme fear = contrarian bullish)
    # value=50  → 0 (neutral)
    # value=100 → (50-100)/37.5 = -1.33 → -1.0 (extreme greed = bearish)
    return FactorScore(
        factor_name="fear_greed", symbol=None, raw_value=float(value),
        normalized_score=round(score, 4),
        direction=_direction(score, threshold=0.20),
        confidence=0.65,
        source="alternative_me",
    )


async def _score_mcap_24h() -> FactorScore | None:
    """Total crypto market cap 24H change — rising market = bullish momentum."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get("https://api.coingecko.com/api/v3/global")
            resp.raise_for_status()
            pct = float(resp.json()["data"]["market_cap_change_percentage_24h_usd"])
    except Exception as exc:
        logger.warning("CoinGecko mcap fetch failed: %s", exc)
        return None

    score = _clamp(pct / 5.0)  # ±5% change → ±1.0
    return FactorScore(
        factor_name="total_mcap_24h", symbol=None, raw_value=round(pct, 4),
        normalized_score=round(score, 4),
        direction=_direction(score, threshold=0.10),
        confidence=0.60,
        source="coingecko",
    )


# ── Regime classifier (deterministic — Principle D) ───────────────────────────

def _classify_regime(
    scores: dict[str, float], crypto_score: float
) -> tuple[str, str, str]:
    funding_s = scores.get("funding_rate", 0.0)
    ls_s      = scores.get("ls_ratio",     0.0)

    # Extreme crowding overrides the composite score
    if funding_s < -0.6 and ls_s < -0.5:
        regime, env = "crowded_long", "Caution"
    elif funding_s > 0.6 and ls_s > 0.5:
        regime, env = "crowded_short", "Caution"
    elif crypto_score >= 50:
        regime, env = "risk_on", "Favorable"
    elif crypto_score >= 15:
        regime, env = "neutral", "Caution"
    elif crypto_score >= -15:
        regime, env = "fragile", "Caution"
    else:
        regime, env = "risk_off", "Avoid"

    # Primary driver = highest absolute weighted contribution
    contribs = {
        name: abs(WEIGHTS.get(name, 0) * scores.get(name, 0.0))
        for name in WEIGHTS
    }
    top = max(contribs, key=lambda k: contribs[k], default="fear_greed")
    primary_driver = DRIVER_MAP.get(top, "Momentum")

    return regime, env, primary_driver


# ── Main entry point ──────────────────────────────────────────────────────────

async def compute_snapshot(symbol: str, db: AsyncSession) -> dict:
    """
    Compute all crypto factor scores for the given symbol.
    Saves results to factor_observations + regime_snapshots, then returns a
    structured dict suitable for direct JSON serialisation.
    """
    now = datetime.now(timezone.utc)
    factors: list[FactorScore] = []

    # DB-backed factors (sequential — same session, safe)
    for _coro, _args in [
        (_score_funding,      (symbol, db)),
        (_score_oi_delta,     (symbol, db)),
        (_score_ls_ratio,     (symbol, db)),
        (_score_liq_pressure, (symbol, db)),
        (_score_ob_imbalance, (symbol, db)),
    ]:
        try:
            f = await _coro(*_args)
            if f is not None:
                factors.append(f)
        except Exception as exc:
            logger.warning("Factor scorer %s failed: %s", _coro.__name__, exc)

    # External API factors (concurrent — no shared session)
    try:
        fng_r, mcap_r = await asyncio.gather(
            _score_fear_greed(), _score_mcap_24h(), return_exceptions=True
        )
        for r in (fng_r, mcap_r):
            if isinstance(r, FactorScore):
                factors.append(r)
    except Exception as exc:
        logger.warning("External factor scorers failed: %s", exc)

    # ── Composite score ───────────────────────────────────────────────────────
    scores_by_name = {f.factor_name: f.normalized_score for f in factors}
    total_weight   = sum(WEIGHTS.get(n, 0) for n in scores_by_name)
    if total_weight > 0:
        raw_composite = sum(WEIGHTS.get(n, 0) * s for n, s in scores_by_name.items())
        crypto_score  = round((raw_composite / total_weight) * 100, 1)
    else:
        crypto_score = 0.0

    # ── Regime + sub-scores ────────────────────────────────────────────────────
    regime, env, driver = _classify_regime(scores_by_name, crypto_score)

    deriv = round(
        scores_by_name.get("funding_rate", 0) * 0.40
        + scores_by_name.get("ls_ratio",   0) * 0.35
        + scores_by_name.get("oi_delta",   0) * 0.25,
        3,
    )
    liq = round(
        scores_by_name.get("liq_pressure", 0) * 0.60
        + scores_by_name.get("ob_imbalance", 0) * 0.40,
        3,
    )

    # ── Persist ───────────────────────────────────────────────────────────────
    try:
        for f in factors:
            db.add(FactorObservation(
                computed_at      = now,
                symbol           = f.symbol,
                factor_name      = f.factor_name,
                raw_value        = f.raw_value,
                normalized_score = f.normalized_score,
                direction        = f.direction,
                confidence       = f.confidence,
                source           = f.source,
            ))
        db.add(RegimeSnapshot(
            computed_at          = now,
            symbol               = symbol,
            crypto_score         = crypto_score,
            regime               = regime,
            trade_environment    = env,
            primary_driver       = driver,
            derivatives_pressure = deriv,
            liquidity_pressure   = liq,
            detail               = {n: {"score": scores_by_name.get(n, 0)} for n in WEIGHTS},
        ))
        await db.commit()

        # Prune observations older than 48 hours
        cutoff = now - timedelta(hours=48)
        await db.execute(sa_delete(FactorObservation).where(FactorObservation.computed_at < cutoff))
        await db.commit()
    except Exception as exc:
        logger.error("Failed to persist factor snapshot: %s", exc)
        await db.rollback()

    return {
        "symbol":                symbol,
        "computed_at":           now.isoformat(),
        "crypto_score":          crypto_score,
        "regime":                regime,
        "trade_environment":     env,
        "primary_driver":        driver,
        "derivatives_pressure":  deriv,
        "liquidity_pressure":    liq,
        "factors":               [asdict(f) for f in factors],
    }
