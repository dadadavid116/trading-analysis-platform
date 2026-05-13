"""
routers/scanner.py — Real-time market signal scanner.

Runs signal checks across BTC/ETH/SOL using data already in the database.
No new tables required. All checks read from existing price, liquidation,
funding, OI, and LS-ratio tables.

GET /api/scanner/signals — ranked signal list per symbol
"""

import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.price import PriceCandle
from app.models.liquidation import Liquidation
from app.models.derivatives import FundingRate, OpenInterest, LSRatio

router = APIRouter(prefix="/scanner", tags=["scanner"])

SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

_SEVERITY_WEIGHT = {"info": 1, "warning": 2, "alert": 3}


# ── Individual signal checks ───────────────────────────────────────────────────

async def _price_signal(symbol: str, db: AsyncSession) -> list[dict]:
    """
    Compare current close to SMA20 on the last 60 one-minute candles (~1 hour).
    Signals above 0.3% deviation; alerts above 0.8%.
    """
    result = await db.execute(
        select(PriceCandle.close)
        .where(PriceCandle.symbol == symbol)
        .order_by(desc(PriceCandle.timestamp))
        .limit(60)
    )
    closes = [float(r[0]) for r in result.all()]
    if len(closes) < 20:
        return []

    closes.reverse()           # oldest first
    sma20   = sum(closes[-20:]) / 20
    current = closes[-1]
    pct     = (current - sma20) / sma20 * 100

    if abs(pct) < 0.3:
        return []

    severity  = "alert" if abs(pct) >= 0.8 else "warning"
    direction = "bullish" if pct > 0 else "bearish"
    return [{
        "type":      "price_momentum",
        "label":     f"Price {pct:+.2f}% vs SMA20",
        "severity":  severity,
        "direction": direction,
        "value":     round(pct, 3),
    }]


async def _liquidation_signal(symbol: str, db: AsyncSession) -> list[dict]:
    """
    Compare 15-minute liquidation USD to the 1-hour average rate.
    Warns when 15m rate is ≥1.5× average; alerts at ≥3×.
    Direction: sell_usd (longs liq'd) dominant → bearish, buy_usd dominant → bullish.
    """
    now       = datetime.now(timezone.utc)
    since_15m = now - timedelta(minutes=15)
    since_1h  = now - timedelta(minutes=60)

    async def _fetch(since: datetime):
        r = await db.execute(
            select(Liquidation.price, Liquidation.quantity, Liquidation.side)
            .where(Liquidation.symbol == symbol)
            .where(Liquidation.timestamp >= since)
        )
        return r.all()

    rows_15m = await _fetch(since_15m)
    rows_1h  = await _fetch(since_1h)

    usd_15m  = sum(float(r.price) * float(r.quantity) for r in rows_15m)
    usd_1h   = sum(float(r.price) * float(r.quantity) for r in rows_1h)
    avg_15m  = usd_1h / 4          # expected 15-min contribution from 1-hour total

    if usd_15m == 0 or avg_15m == 0 or usd_15m < avg_15m * 1.5:
        return []

    severity = "alert" if usd_15m >= avg_15m * 3 else "warning"
    sell_usd = sum(float(r.price) * float(r.quantity) for r in rows_15m if r.side == "sell")
    sell_pct = sell_usd / usd_15m
    direction = "bearish" if sell_pct > 0.6 else ("bullish" if sell_pct < 0.4 else "neutral")

    label_usd = f"${usd_15m/1000:.0f}K" if usd_15m >= 1000 else f"${usd_15m:.0f}"
    return [{
        "type":      "liq_surge",
        "label":     f"Liq surge {label_usd}/15m ({usd_15m/avg_15m:.1f}× avg)",
        "severity":  severity,
        "direction": direction,
        "value":     round(usd_15m),
    }]


async def _funding_signal(symbol: str, db: AsyncSession) -> list[dict]:
    """
    Detect extreme funding rates that indicate crowded positioning.
    Positive → longs crowded (bearish contrarian); negative → shorts crowded (bullish).
    """
    result = await db.execute(
        select(FundingRate.funding_rate)
        .where(FundingRate.symbol == symbol)
        .order_by(desc(FundingRate.timestamp))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return []

    rate = float(row[0])

    if rate > 0.0005:
        severity  = "alert" if rate > 0.001 else "warning"
        return [{"type": "funding_extreme", "label": f"Funding +{rate*100:.3f}% (longs crowded)",
                 "severity": severity, "direction": "bearish", "value": round(rate * 100, 4)}]
    if rate < -0.0003:
        severity  = "alert" if rate < -0.0008 else "warning"
        return [{"type": "funding_extreme", "label": f"Funding {rate*100:.3f}% (shorts crowded)",
                 "severity": severity, "direction": "bullish", "value": round(rate * 100, 4)}]
    return []


async def _oi_signal(symbol: str, db: AsyncSession) -> list[dict]:
    """
    Compute 1-hour OI delta from DB snapshots.
    Flags expansion >1% or contraction <-2%.
    """
    now    = datetime.now(timezone.utc)
    result = await db.execute(
        select(OpenInterest.oi_value, OpenInterest.timestamp)
        .where(OpenInterest.symbol == symbol)
        .order_by(desc(OpenInterest.timestamp))
        .limit(1)
    )
    latest = result.one_or_none()
    if latest is None:
        return []

    latest_val = float(latest.oi_value)
    since = now - timedelta(minutes=65)
    until = now - timedelta(minutes=55)

    result = await db.execute(
        select(OpenInterest.oi_value)
        .where(OpenInterest.symbol == symbol,
               OpenInterest.timestamp >= since,
               OpenInterest.timestamp <= until)
        .order_by(OpenInterest.timestamp)
        .limit(1)
    )
    ref = result.scalar_one_or_none()
    if ref is None or float(ref) == 0:
        return []

    delta = (latest_val - float(ref)) / float(ref) * 100

    if delta > 1.0:
        severity = "warning" if delta > 3.0 else "info"
        return [{"type": "oi_expansion", "label": f"OI +{delta:.1f}%/1H (expanding)",
                 "severity": severity, "direction": "neutral", "value": round(delta, 2)}]
    if delta < -2.0:
        severity = "warning" if delta < -5.0 else "info"
        return [{"type": "oi_contraction", "label": f"OI {delta:.1f}%/1H (draining)",
                 "severity": severity, "direction": "neutral", "value": round(delta, 2)}]
    return []


async def _ls_signal(symbol: str, db: AsyncSession) -> list[dict]:
    """
    Detect crowd positioning extremes (contrarian signal).
    Uses global_account ratio; falls back to top_account.
    """
    for ratio_type in ("global_account", "top_account"):
        result = await db.execute(
            select(LSRatio.long_ratio)
            .where(LSRatio.symbol == symbol, LSRatio.ratio_type == ratio_type)
            .order_by(desc(LSRatio.timestamp))
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            long_pct = float(row) * 100
            if long_pct > 65:
                return [{"type": "ls_skew", "label": f"Crowd {long_pct:.0f}% long (overextended)",
                         "severity": "warning", "direction": "bearish", "value": round(long_pct, 1)}]
            if long_pct < 35:
                return [{"type": "ls_skew", "label": f"Crowd {long_pct:.0f}% long (shorts crowded)",
                         "severity": "warning", "direction": "bullish", "value": round(long_pct, 1)}]
            return []
    return []


# ── Per-symbol aggregator ──────────────────────────────────────────────────────

async def _scan_symbol(symbol: str, db: AsyncSession) -> dict:
    price_sig = await _price_signal(symbol, db)
    liq_sig   = await _liquidation_signal(symbol, db)
    fund_sig  = await _funding_signal(symbol, db)
    oi_sig    = await _oi_signal(symbol, db)
    ls_sig    = await _ls_signal(symbol, db)

    all_signals = price_sig + liq_sig + fund_sig + oi_sig + ls_sig

    bull_score = sum(_SEVERITY_WEIGHT[s["severity"]] for s in all_signals if s["direction"] == "bullish")
    bear_score = sum(_SEVERITY_WEIGHT[s["severity"]] for s in all_signals if s["direction"] == "bearish")
    both       = bull_score + bear_score

    composite  = round((bull_score - bear_score) / both, 3) if both > 0 else 0.0
    bias       = "bullish" if composite > 0.2 else ("bearish" if composite < -0.2 else "neutral")

    # Sort: alert → warning → info
    all_signals.sort(key=lambda s: {"alert": 0, "warning": 1, "info": 2}[s["severity"]])

    return {
        "symbol":       symbol,
        "signals":      all_signals,
        "bull_score":   bull_score,
        "bear_score":   bear_score,
        "composite":    composite,
        "bias":         bias,
        "signal_count": len(all_signals),
    }


# ── Endpoint ───────────────────────────────────────────────────────────────────

@router.get("/signals")
async def get_scanner_signals(db: AsyncSession = Depends(get_db)):
    """
    Run signal checks for BTC, ETH, and SOL, then return results ranked by
    signal count descending (most active symbol first).
    """
    results = []
    for sym in SYMBOLS:
        try:
            results.append(await _scan_symbol(sym, db))
        except Exception as exc:
            results.append({
                "symbol": sym, "signals": [],
                "bull_score": 0, "bear_score": 0,
                "composite": 0.0, "bias": "neutral",
                "signal_count": 0, "error": str(exc),
            })

    results.sort(key=lambda r: r["signal_count"], reverse=True)
    return {"symbols": results, "scanned_at": datetime.now(timezone.utc).isoformat()}
