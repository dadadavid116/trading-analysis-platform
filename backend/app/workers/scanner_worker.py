"""
workers/scanner_worker.py — Background scanner loop.

Runs the signal scanner every SCAN_INTERVAL seconds (default 5 minutes) and
sends Telegram notifications when a symbol crosses the high-confidence threshold.

Debounce: re-notifies the same symbol only after NOTIFY_COOLDOWN seconds have
passed, OR when the bias flips direction (bullish → bearish or vice versa).

Started automatically by the FastAPI lifespan in main.py.
Status is readable via GET /api/scanner/status.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.database import AsyncSessionLocal
from app.routers.scanner import _scan_symbol
from app.services.event_logger import log_event
from app.services.symbol_registry import load_active_canonical
from app.services.signal_engine import create_signal

logger = logging.getLogger(__name__)

# ── Tunable constants ─────────────────────────────────────────────────────────

SCAN_INTERVAL        = 5 * 60       # seconds between full scan cycles
NOTIFY_COOLDOWN      = 4 * 60 * 60  # minimum seconds between alerts (4 hours)
COMPOSITE_THRESHOLD  = 0.68         # raised threshold — only strong signals notify
MIN_SIGNALS          = 3            # minimum signal count required

# ── Module-level state (accessed from the status endpoint) ────────────────────

last_scan_at:       datetime | None = None
notifications_sent: int             = 0

# Maps symbol → (last_notify_time, last_bias)
_debounce: dict[str, tuple[datetime, str]] = {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_4h_boundary(now: datetime) -> bool:
    """True within the first 10 minutes of a 4-hour candle period (00/04/08/12/16/20 UTC)."""
    return now.hour % 4 == 0 and now.minute < 10


def _should_notify(symbol: str, bias: str, now: datetime) -> bool:
    near_4h = _is_4h_boundary(now)
    if symbol not in _debounce:
        return near_4h
    last_time, last_bias = _debounce[symbol]
    cooldown_passed = (now - last_time).total_seconds() >= NOTIFY_COOLDOWN
    bias_flipped    = bias != last_bias and bias != "neutral"
    if bias_flipped:
        return True  # always notify on direction change, regardless of 4H boundary
    return near_4h and cooldown_passed


def _format_telegram(symbol: str, result: dict, current_price: float | None = None) -> str:
    labels  = {"BTCUSDT": "BTC/USDT", "ETHUSDT": "ETH/USDT", "SOLUSDT": "SOL/USDT"}
    display = labels.get(symbol, symbol)
    bias    = result["bias"].upper()
    score   = result["composite"]
    sign    = "+" if score > 0 else ""

    price_str = f" | ${current_price:,.2f}" if current_price else ""
    header    = f"\U0001f4e1 {display} — {bias}{price_str}"
    subhead   = f"Score: {sign}{score:.2f} | {result['signal_count']} signals"
    lines     = [header, subhead]

    # ── Categorise signals ────────────────────────────────────────────────────
    sigs = result["signals"]
    key_levels  = [s for s in sigs if s.get("type", "") in ("key_level_support", "key_level_resistance")]
    momentum    = [s for s in sigs if "momentum" in s.get("type", "") or "pattern" in s.get("type", "")]
    derivatives = [s for s in sigs if s.get("type", "") in ("funding_extreme", "oi_expansion", "oi_contraction", "ls_skew")]
    liq_vol     = [s for s in sigs if s.get("type", "") in ("liq_surge", "volume_surge")]

    if key_levels:
        lines.append("")
        lines.append("Key Levels:")
        for s in key_levels:
            arrow = "↑" if s["direction"] == "bullish" else "↓"
            lines.append(f"  {arrow} {s['label']}")
        # Add a price-reaction note if current price is known
        if current_price:
            for s in key_levels:
                if s.get("type") == "key_level_support":
                    lines.append(f"    → Price holding above — watch for bounce confirmation")
                    break
                if s.get("type") == "key_level_resistance":
                    lines.append(f"    → Testing resistance — watch for rejection or breakout")
                    break

    if momentum:
        lines.append("")
        lines.append("Price Action:")
        for s in momentum[:4]:
            sev = {"alert": "!", "warning": "*", "info": "·"}[s.get("severity", "info")]
            lines.append(f"  {sev} {s['label']}")

    if derivatives:
        lines.append("")
        lines.append("Derivatives:")
        for s in derivatives:
            lines.append(f"  {s['label']}")

    if liq_vol:
        lines.append("")
        lines.append("Flow:")
        for s in liq_vol:
            lines.append(f"  {s['label']}")

    return "\n".join(lines)


# ── Core scan ─────────────────────────────────────────────────────────────────

async def _run_once() -> None:
    global last_scan_at, notifications_sent

    now          = datetime.now(timezone.utc)
    last_scan_at = now

    token   = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    telegram_ok = bool(token and chat_id)

    symbols = await load_active_canonical()
    async with AsyncSessionLocal() as db:
        for symbol in symbols:
            try:
                result = await _scan_symbol(symbol, db)
            except Exception as exc:
                logger.warning("Scanner worker: %s scan failed: %s", symbol, exc)
                continue

            # Skip low-confidence results
            if abs(result["composite"]) < COMPOSITE_THRESHOLD:
                continue
            if result["signal_count"] < MIN_SIGNALS:
                continue
            if result["bias"] == "neutral":
                continue
            if not _should_notify(symbol, result["bias"], now):
                continue

            # Record debounce state
            _debounce[symbol] = (now, result["bias"])

            # Persist as a signal candidate
            direction = "long" if result["bias"] == "bullish" else "short"
            signal_labels = [s["label"] for s in result["signals"][:6]]
            current_price: float | None = None
            try:
                from sqlalchemy import select, desc
                from app.models.price import PriceCandle
                p_res = await db.execute(
                    select(PriceCandle.close)
                    .where(PriceCandle.symbol == symbol)
                    .order_by(desc(PriceCandle.timestamp))
                    .limit(1)
                )
                cp = p_res.scalar_one_or_none()
                if cp:
                    current_price = float(cp)
            except Exception as exc:
                logger.warning("Signal price fetch failed for %s: %s", symbol, exc)

            if current_price:
                try:
                    await create_signal(
                        db           = db,
                        symbol       = symbol,
                        direction    = direction,
                        scanner_score = result["composite"],
                        signal_count = result["signal_count"],
                        current_price = current_price,
                        signal_labels = signal_labels,
                        timeframe    = "15m",
                    )
                except Exception as exc:
                    logger.warning("Signal persist failed for %s: %s", symbol, exc)

            # Log to event feed
            sign = "+" if result["composite"] > 0 else ""
            await log_event(
                service    = "scanner",
                event_type = "auto_alert",
                message    = (
                    f"Auto-alert: {symbol} {result['bias'].upper()} "
                    f"score={sign}{result['composite']:.2f} "
                    f"({result['signal_count']} signals)"
                ),
                symbol = symbol,
                detail = {
                    "composite":    result["composite"],
                    "bias":         result["bias"],
                    "signal_count": result["signal_count"],
                },
            )

            # Send Telegram notification
            if not telegram_ok:
                logger.info("Scanner auto-alert for %s (Telegram not configured).", symbol)
                notifications_sent += 1
                continue

            msg  = _format_telegram(symbol, result, current_price)
            text = msg
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"https://api.telegram.org/bot{token}/sendMessage",
                        json={"chat_id": chat_id, "text": text},
                    )
                    resp.raise_for_status()
                notifications_sent += 1
                logger.info("Scanner notification sent for %s (%s).", symbol, result["bias"])
            except Exception as exc:
                logger.error("Telegram send failed for %s: %s", symbol, exc)


# ── Worker loop ───────────────────────────────────────────────────────────────

async def run_scanner_worker() -> None:
    """
    Infinite background loop.  Started once from the FastAPI lifespan.
    Waits 30 s on startup so the rest of the app finishes initialising first.
    """
    logger.info(
        "Background scanner worker started (interval=%ds, threshold=%.2f).",
        SCAN_INTERVAL, COMPOSITE_THRESHOLD,
    )
    await asyncio.sleep(30)   # let app finish starting up

    while True:
        try:
            await _run_once()
        except Exception as exc:
            logger.error("Scanner worker cycle error: %s", exc)
        await asyncio.sleep(SCAN_INTERVAL)
