"""
routers/scanner.py — Real-time market signal scanner + AI trade setup.

Runs signal checks across BTC/ETH/SOL using data already in the database.
No new tables required. All checks read from existing price, liquidation,
funding, OI, and LS-ratio tables.

GET  /api/scanner/signals — ranked signal list per symbol
POST /api/scanner/setup   — AI trade setup for the top candidate
"""

import asyncio
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, List

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.price import PriceCandle
from app.models.liquidation import Liquidation
from app.models.derivatives import FundingRate, OpenInterest, LSRatio

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

@router.get("/status")
async def scanner_worker_status():
    """
    Return the current status of the background scanner worker.
    Useful for the frontend to show whether auto-alerts are active.
    """
    from app.workers.scanner_worker import (
        last_scan_at, notifications_sent,
        SCAN_INTERVAL, COMPOSITE_THRESHOLD,
    )
    return {
        "worker_running":       True,
        "last_scan_at":         last_scan_at.isoformat() if last_scan_at else None,
        "notifications_sent":   notifications_sent,
        "telegram_enabled":     bool(settings.telegram_bot_token and settings.telegram_chat_id),
        "scan_interval_seconds": SCAN_INTERVAL,
        "composite_threshold":  COMPOSITE_THRESHOLD,
    }


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


# ── AI trade setup ─────────────────────────────────────────────────────────────

class SetupRequest(BaseModel):
    symbol:  str         = "BTCUSDT"
    signals: List[Any]   = []
    bias:    str         = "neutral"


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of a Claude response string."""
    for candidate in [text, re.sub(r"```(?:json)?\s*|\s*```", "", text)]:
        try:
            return json.loads(candidate.strip())
        except json.JSONDecodeError:
            pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    raise ValueError("Could not extract JSON from Claude response.")


@router.post("/setup")
async def generate_trade_setup(body: SetupRequest, db: AsyncSession = Depends(get_db)):
    """
    Generate an AI trade setup for the given symbol.

    Fetches current price, funding, OI, and LS-ratio from the DB, combines
    them with the caller-supplied scanner signals, and asks Claude to produce
    a structured entry/SL/TP plan.  Returns raw JSON — no markdown wrapper.
    """
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured on this server.")

    sym = body.symbol.upper()

    # ── Fetch market context ──────────────────────────────────────────────────
    r = await db.execute(
        select(PriceCandle).where(PriceCandle.symbol == sym)
        .order_by(desc(PriceCandle.timestamp)).limit(1)
    )
    candle = r.scalar_one_or_none()

    r = await db.execute(
        select(FundingRate).where(FundingRate.symbol == sym)
        .order_by(desc(FundingRate.timestamp)).limit(1)
    )
    funding = r.scalar_one_or_none()

    r = await db.execute(
        select(OpenInterest).where(OpenInterest.symbol == sym)
        .order_by(desc(OpenInterest.timestamp)).limit(1)
    )
    oi = r.scalar_one_or_none()

    r = await db.execute(
        select(LSRatio)
        .where(LSRatio.symbol == sym, LSRatio.ratio_type == "global_account")
        .order_by(desc(LSRatio.timestamp)).limit(1)
    )
    ls = r.scalar_one_or_none()

    # ── Build prompt ──────────────────────────────────────────────────────────
    price_str   = f"${float(candle.close):,.2f}"     if candle  else "unknown"
    funding_str = f"{float(funding.funding_rate)*100:.4f}%"   if funding else "N/A"
    oi_str      = f"{float(oi.oi_value):,.0f} contracts"      if oi      else "N/A"
    ls_str      = (
        f"{float(ls.long_ratio)*100:.1f}% long / {float(ls.short_ratio)*100:.1f}% short"
        if ls else "N/A"
    )

    signals_text = "\n".join(
        f"- [{s.get('direction','?').upper()} {s.get('severity','?').upper()}] {s.get('label','?')}"
        for s in body.signals
    ) or "- No specific signals detected — use general market context."

    prompt = f"""You are a professional crypto futures trader. Generate a precise, actionable trade setup.

Symbol: {sym.replace('USDT', '/USDT')}
Current price: {price_str}
Scanner bias: {body.bias.upper()}

Active signals:
{signals_text}

Derivatives snapshot:
- Funding rate: {funding_str}
- Open interest: {oi_str}
- Long/Short ratio: {ls_str}

Rules:
1. The setup direction (long or short) must match the scanner bias when bias is not neutral.
2. Entry zone must be a tight realistic range around the current price (within 1-2%).
3. Stop loss must be placed beyond a clear invalidation level.
4. Provide exactly 3 take profit levels at realistic distances.
5. risk_reward = (TP1 distance from entry mid) / (SL distance from entry mid), round to 1 decimal.
6. reasoning: 2-3 sentences explaining the trade rationale based on the signals.
7. key_risks: 1 sentence on the main scenario that would invalidate this setup.

Respond with ONLY a raw JSON object — no markdown, no code fences, no extra text:
{{"bias":"long or short","entry_zone":{{"low":number,"high":number}},"stop_loss":number,"take_profit":[number,number,number],"risk_reward":number,"reasoning":"string","key_risks":"string"}}"""

    # ── Call Claude ───────────────────────────────────────────────────────────
    try:
        client  = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model      = "claude-haiku-4-5-20251001",
            max_tokens = 500,
            messages   = [{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Claude API error: {exc}")

    try:
        setup = _extract_json(raw)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # ── Log event ─────────────────────────────────────────────────────────────
    try:
        from app.services.event_logger import log_event
        await log_event(
            service    = "analysis",
            event_type = "trade_setup",
            message    = (
                f"AI setup: {sym} {setup.get('bias','?').upper()} "
                f"entry {setup.get('entry_zone',{}).get('low','?')}–{setup.get('entry_zone',{}).get('high','?')} "
                f"R/R {setup.get('risk_reward','?')}×"
            ),
            symbol = sym,
            detail = {"bias": setup.get("bias"), "risk_reward": setup.get("risk_reward")},
        )
    except Exception:
        pass

    return {
        "symbol":       sym,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scanner_bias": body.bias,
        **setup,
    }
