"""
alerts/evaluator.py — Check active alert conditions against current market data.

Called on a schedule by run.py.

Supported condition types:
    price_above        — triggers when latest BTC close > threshold
    price_below        — triggers when latest BTC close < threshold
    liquidation_spike  — triggers when liquidation count in the last
                         window_minutes exceeds threshold

Trigger modes:
    once  — fires once; the alert stays triggered and is not re-evaluated
    rearm — resets automatically when the condition is no longer met,
            allowing it to fire again the next time the threshold is crossed
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, desc

from app.database import AsyncSessionLocal
from app.models.alert import Alert
from app.models.liquidation import Liquidation
from app.models.price import PriceCandle
from alerts.notifications import notify

logger = logging.getLogger(__name__)


async def evaluate_all() -> None:
    """Fetch all active alerts and evaluate each one."""
    async with AsyncSessionLocal() as session:
        # Load all active alerts regardless of trigger state.
        # The per-alert logic below handles once vs rearm.
        result = await session.execute(
            select(Alert).where(Alert.is_active == True)  # noqa: E712
        )
        alerts = list(result.scalars().all())

    if not alerts:
        logger.debug("No active alerts to evaluate.")
        return

    logger.info("Evaluating %d alert(s)...", len(alerts))

    # Fetch the latest price candle once — shared across all price alerts.
    latest_close: float | None = await _get_latest_close()

    for alert in alerts:
        try:
            await _evaluate_one(alert, latest_close)
        except Exception as exc:
            logger.error("Error evaluating alert %d (%s): %s", alert.id, alert.name, exc)


async def _get_latest_close() -> float | None:
    """Return the close price from the most recent BTC candle, or None."""
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(PriceCandle)
            .where(PriceCandle.symbol == "BTCUSDT")
            .order_by(desc(PriceCandle.timestamp))
            .limit(1)
        )
        candle = r.scalar_one_or_none()
    return float(candle.close) if candle is not None else None


async def _count_recent_liquidations(window_minutes: int) -> int:
    """Count BTC liquidation events in the last window_minutes."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=window_minutes)
    async with AsyncSessionLocal() as session:
        r = await session.execute(
            select(func.count())
            .select_from(Liquidation)
            .where(Liquidation.symbol == "BTCUSDT")
            .where(Liquidation.timestamp >= cutoff)
        )
        return r.scalar_one()


async def _set_triggered(alert_id: int) -> None:
    """Mark an alert as triggered (set triggered_at to now)."""
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(Alert).where(Alert.id == alert_id))
        db_alert = r.scalar_one()
        db_alert.triggered_at = datetime.now(tz=timezone.utc)
        await session.commit()


async def _clear_triggered(alert_id: int) -> None:
    """Clear triggered_at so a rearm alert can fire again."""
    async with AsyncSessionLocal() as session:
        r = await session.execute(select(Alert).where(Alert.id == alert_id))
        db_alert = r.scalar_one()
        db_alert.triggered_at = None
        await session.commit()


async def _evaluate_one(alert: Alert, latest_close: float | None) -> None:
    """Evaluate a single alert and trigger / reset it as appropriate.

    once mode:
        - Skip if already triggered (triggered_at is set).
        - Trigger and set triggered_at if condition is met.

    rearm mode:
        - If condition is met and alert is not yet triggered: fire.
        - If condition is NOT met and alert is triggered: reset triggered_at
          so it can fire again next time the condition becomes true.
    """
    threshold  = float(alert.threshold)
    is_once    = alert.trigger_mode != "rearm"
    triggered  = alert.triggered_at is not None

    # For once-mode alerts that have already triggered, skip all evaluation.
    if is_once and triggered:
        return

    # Determine whether the condition is currently met.
    condition_met: bool

    if alert.condition_type in ("price_above", "price_below"):
        if latest_close is None:
            logger.debug("Alert %d skipped — no price data yet.", alert.id)
            return
        if alert.condition_type == "price_above":
            condition_met = latest_close > threshold
        else:
            condition_met = latest_close < threshold

    elif alert.condition_type == "liquidation_spike":
        window = alert.window_minutes or 5
        count = await _count_recent_liquidations(window)
        condition_met = count > threshold

    else:
        logger.warning(
            "Alert %d has unknown condition_type '%s' — skipping.",
            alert.id,
            alert.condition_type,
        )
        return

    # ── Act on the result ──────────────────────────────────────────────────────
    if condition_met and not triggered:
        # Fire the alert.
        await _set_triggered(alert.id)
        message = _build_message(alert, latest_close, threshold)
        await notify(alert.name, alert.condition_type, message)

    elif not condition_met and triggered and not is_once:
        # Rearm: condition is gone — reset so it can fire again.
        await _clear_triggered(alert.id)
        logger.info(
            "Alert %d (%s) rearmed — condition no longer met.",
            alert.id,
            alert.name,
        )


def _build_message(alert: Alert, latest_close: float | None, threshold: float) -> str:
    """Build a human-readable trigger message."""
    if alert.condition_type == "price_above":
        return f"BTC price ${latest_close:,.2f} crossed above ${threshold:,.2f}"
    if alert.condition_type == "price_below":
        return f"BTC price ${latest_close:,.2f} dropped below ${threshold:,.2f}"
    if alert.condition_type == "liquidation_spike":
        window = alert.window_minutes or 5
        return f"Liquidation spike in last {window} min exceeded threshold {threshold:.0f}"
    return f"Condition met for alert '{alert.name}'"
