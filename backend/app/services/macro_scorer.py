"""
Macro factor scorer — Phase 81.

Sources (per Phase 80 decision matrix):
  - yfinance: DXY, SPX, VIX, Gold  (no API key, run in thread executor)
  - FRED API: UST 10Y, HY spread, CPI  (FRED_API_KEY env var required)

Normalizes each factor to -1..+1 and returns a MacroSnapshot.
On-demand with 15-minute DB cache — no background collector service.
"""

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from functools import partial
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.services.macro_config import FRED_BASE_URL

# ── Weights (sum to 1.0) ─────────────────────────────────────────────────────
WEIGHTS: dict[str, float] = {
    "dxy":       0.20,
    "spx":       0.20,
    "vix":       0.20,
    "ust_10y":   0.15,
    "hy_spread": 0.10,
    "cpi":       0.10,
    "gold":      0.05,
}

DRIVER_MAP: dict[str, str] = {
    "dxy":       "USD",
    "spx":       "Equities",
    "vix":       "Volatility",
    "ust_10y":   "Rates",
    "hy_spread": "Credit",
    "cpi":       "Inflation",
    "gold":      "Gold",
}

_CACHE_SECONDS = 15 * 60  # 15 minutes


@dataclass
class MacroFactor:
    factor_name:      str
    raw_value:        Optional[float]
    normalized_score: float
    direction:        str
    confidence:       float
    source:           str
    as_of:            Optional[datetime]


@dataclass
class MacroSnapshot:
    computed_at:       datetime
    macro_score:       float   # -100..+100
    macro_regime:      str     # macro_bullish/macro_neutral/macro_cautious/macro_bearish
    trade_environment: str     # Favorable/Caution/Avoid
    primary_driver:    str
    factors:           list[MacroFactor]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _direction(score: float, threshold: float = 0.15) -> str:
    if score >= threshold:
        return "bullish"
    if score <= -threshold:
        return "bearish"
    return "neutral"


def _tz(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ── yfinance (sync → thread executor) ────────────────────────────────────────

def _yf_sync(ticker: str) -> Optional[tuple[float, float, datetime]]:
    """Returns (current_price, 5d_pct_change, as_of) or None."""
    try:
        import yfinance as yf  # lazy import — only in api container
        hist = yf.Ticker(ticker).history(period="7d", interval="1d")
        if hist.empty:
            return None
        close = hist["Close"].dropna()
        if len(close) < 2:
            return None
        current = float(close.iloc[-1])
        start   = float(close.iloc[0])
        pct5d   = (current - start) / start * 100 if start != 0 else 0.0
        as_of   = _tz(close.index[-1].to_pydatetime())
        return current, pct5d, as_of
    except Exception:
        return None


async def _yf(ticker: str) -> Optional[tuple[float, float, datetime]]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_yf_sync, ticker))


# ── FRED API (async via httpx) ────────────────────────────────────────────────

async def _fred(series_id: str, limit: int = 15) -> Optional[list[tuple[float, datetime]]]:
    """Returns list of (value, date) sorted desc by date, or None."""
    api_key = os.getenv("FRED_API_KEY", "")
    if not api_key:
        return None
    url = (
        f"{FRED_BASE_URL}?series_id={series_id}&api_key={api_key}"
        f"&sort_order=desc&limit={limit}&file_type=json"
    )
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url)
            r.raise_for_status()
            obs = r.json().get("observations", [])
            valid = [
                (float(o["value"]),
                 _tz(datetime.fromisoformat(o["date"])))
                for o in obs
                if o.get("value", ".") != "."
            ]
            return valid or None
    except Exception:
        return None


# ── Individual factor scorers ─────────────────────────────────────────────────

async def _score_dxy() -> Optional[MacroFactor]:
    r = await _yf("DX-Y.NYB")
    if r is None:
        return None
    current, pct5d, as_of = r
    # DXY up → USD strong → risk assets weak → bearish for crypto
    score = _clamp(-pct5d / 2.0)
    return MacroFactor("dxy", current, score, _direction(score), 0.85, "yfinance", as_of)


async def _score_spx() -> Optional[MacroFactor]:
    r = await _yf("^GSPC")
    if r is None:
        return None
    current, pct5d, as_of = r
    # SPX up → risk-on → bullish for crypto
    score = _clamp(pct5d / 5.0)
    return MacroFactor("spx", current, score, _direction(score), 0.85, "yfinance", as_of)


async def _score_vix() -> Optional[MacroFactor]:
    r = await _yf("^VIX")
    if r is None:
        return None
    current, _, as_of = r
    # Level-based: VIX 35 → -1.0 bearish, VIX 5 → +1.0 bullish, neutral at 20
    score = _clamp((20.0 - current) / 15.0)
    return MacroFactor("vix", current, score, _direction(score), 0.90, "yfinance", as_of)


async def _score_gold() -> Optional[MacroFactor]:
    r = await _yf("GC=F")
    if r is None:
        return None
    current, pct5d, as_of = r
    # Context-only, low confidence: gold up can signal inflation fear (mild +)
    score = _clamp(pct5d / 8.0)
    return MacroFactor("gold", current, score, _direction(score, 0.20), 0.55, "yfinance", as_of)


async def _score_ust_10y() -> Optional[MacroFactor]:
    obs = await _fred("DGS10", limit=5)
    if not obs or len(obs) < 2:
        return None
    latest, as_of = obs[0]
    prev, _ = obs[1]
    # Daily change in bps: rising rates = tighter conditions = bearish
    delta_bps = (latest - prev) * 100
    score = _clamp(-delta_bps / 10.0)  # 10bps daily rise → -1.0
    return MacroFactor("ust_10y", latest, score, _direction(score), 0.90, "fred", as_of)


async def _score_hy_spread() -> Optional[MacroFactor]:
    obs = await _fred("BAMLH0A0HYM2", limit=2)
    if not obs:
        return None
    latest, as_of = obs[0]
    # BAMLH0A0HYM2 in % (3.5 = 350bps OAS). Baseline ~3.5%, stress >6%
    score = _clamp(-(latest - 3.5) / 2.5)  # 6%+ → -1.0, 1% → +1.0
    return MacroFactor("hy_spread", latest, score, _direction(score), 0.85, "fred", as_of)


async def _score_cpi() -> Optional[MacroFactor]:
    obs = await _fred("CPIAUCSL", limit=15)
    if not obs or len(obs) < 13:
        return None
    latest, as_of = obs[0]
    year_ago, _ = obs[12]
    if year_ago == 0:
        return None
    yoy = (latest / year_ago - 1) * 100
    # Fed target = 2.5%; above → hawkish pressure → bearish for risk
    score = _clamp(-(yoy - 2.5) / 3.0)
    return MacroFactor("cpi", round(yoy, 2), score, _direction(score), 0.70, "fred", as_of)


# ── Regime classification ────────────────────────────────────────────────────

def _regime(macro_score: float) -> tuple[str, str]:
    if macro_score >= 40:
        return "macro_bullish", "Favorable"
    if macro_score >= -20:
        return "macro_neutral", "Caution"
    if macro_score >= -60:
        return "macro_cautious", "Caution"
    return "macro_bearish", "Avoid"


# ── Composite ────────────────────────────────────────────────────────────────

def _composite(factors: list[MacroFactor]) -> float:
    total_w = sum(WEIGHTS.get(f.factor_name, 0.0) for f in factors)
    if total_w == 0:
        return 0.0
    raw = sum(WEIGHTS.get(f.factor_name, 0.0) * f.normalized_score for f in factors)
    return max(-100.0, min(100.0, raw / total_w * 100))


def _primary_driver(factors: list[MacroFactor]) -> str:
    if not factors:
        return "—"
    top = max(factors, key=lambda f: abs(WEIGHTS.get(f.factor_name, 0) * f.normalized_score))
    return DRIVER_MAP.get(top.factor_name, "—")


# ── Cache helpers ─────────────────────────────────────────────────────────────

async def _read_cache(db: AsyncSession) -> Optional[MacroSnapshot]:
    result = await db.execute(text("SELECT MAX(collected_at) FROM macro_observations"))
    latest_at = result.scalar()
    if latest_at is None:
        return None
    latest_at = _tz(latest_at)
    if (datetime.now(timezone.utc) - latest_at).total_seconds() >= _CACHE_SECONDS:
        return None

    rows = await db.execute(
        text("""
            SELECT factor_name, raw_value, normalized_score, direction,
                   confidence, source, as_of, collected_at
            FROM macro_observations
            WHERE collected_at = :ts
        """),
        {"ts": latest_at},
    )
    factors = [
        MacroFactor(
            factor_name=r.factor_name,
            raw_value=r.raw_value,
            normalized_score=r.normalized_score,
            direction=r.direction,
            confidence=r.confidence,
            source=r.source,
            as_of=_tz(r.as_of) if r.as_of else None,
        )
        for r in rows.fetchall()
    ]
    score = _composite(factors)
    regime, trade_env = _regime(score)
    return MacroSnapshot(
        computed_at=latest_at,
        macro_score=score,
        macro_regime=regime,
        trade_environment=trade_env,
        primary_driver=_primary_driver(factors),
        factors=factors,
    )


# ── Public entry point ────────────────────────────────────────────────────────

async def compute_macro_snapshot(db: AsyncSession) -> MacroSnapshot:
    cached = await _read_cache(db)
    if cached is not None:
        return cached

    # All fetches run concurrently — all external APIs, no shared DB session
    raw = await asyncio.gather(
        _score_dxy(),
        _score_spx(),
        _score_vix(),
        _score_ust_10y(),
        _score_hy_spread(),
        _score_cpi(),
        _score_gold(),
        return_exceptions=False,
    )
    factors: list[MacroFactor] = [f for f in raw if f is not None]

    score = _composite(factors)
    regime, trade_env = _regime(score)
    now = datetime.now(timezone.utc)

    # Prune >48H observations, then save current batch
    await db.execute(
        text("DELETE FROM macro_observations WHERE collected_at < NOW() - INTERVAL '48 hours'")
    )
    for f in factors:
        await db.execute(
            text("""
                INSERT INTO macro_observations
                    (collected_at, factor_name, raw_value, normalized_score,
                     direction, confidence, source, as_of)
                VALUES
                    (:collected_at, :factor_name, :raw_value, :normalized_score,
                     :direction, :confidence, :source, :as_of)
            """),
            {
                "collected_at":     now,
                "factor_name":      f.factor_name,
                "raw_value":        f.raw_value,
                "normalized_score": f.normalized_score,
                "direction":        f.direction,
                "confidence":       f.confidence,
                "source":           f.source,
                "as_of":            f.as_of,
            },
        )
    await db.commit()

    return MacroSnapshot(
        computed_at=now,
        macro_score=score,
        macro_regime=regime,
        trade_environment=trade_env,
        primary_driver=_primary_driver(factors),
        factors=factors,
    )
