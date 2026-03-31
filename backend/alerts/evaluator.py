"""
alerts/evaluator.py — Check active alert conditions against current market data.

Called on a schedule by run.py.

Supported condition types:
    price_above        — triggers when latest BTC close > threshold
    price_below        — triggers when latest BTC close < threshold
    liquidation_spike  — triggers when liquidation count in the last
                         window_minutes exceeds threshold
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
    """Fetch all untriggered active alerts and evaluate each one."""
    async with AsyncSessionLocal() as session:
        # Load every alert that is active and has not yet been triggered.
        result = await session.execute(
            select(Alert)
            .where(Alert.is_active == True)          # noqa: E712
            .where(Alert.triggered_at == None)       # noqa: E711
        )
        alerts = list(result.scalars().all())

    if not alerts:
        logger.debug("No active untriggered alerts to evaluate.")
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


async def _trigger(alert: Alert, message: str) -> None:
    """Mark the alert as triggered and send a notification."""
    async with AsyncSessionLocal() as session:
        # Re-fetch inside this session so we can update and commit.
        r = await session.execute(select(Alert).where(Alert.id == alert.id))
        db_alert = r.scalar_one()
        db_alert.triggered_at = datetime.now(tz=timezone.utc)
        await session.commit()

    await notify(alert.name, alert.condition_type, message)


async def _evaluate_one(alert: Alert, latest_close: float | None) -> None:
    """Evaluate a single alert and trigger it if the condition is met."""
    threshold = float(alert.threshold)

    if alert.condition_type == "price_above":
        if latest_close is None:
            logger.debug("Alert %d skipped — no price data yet.", alert.id)
            return
        if latest_close > threshold:
            await _trigger(
                alert,
                f"BTC price ${latest_close:,.2f} crossed above threshold ${threshold:,.2f}",
            )

    elif alert.condition_type == "price_below":
        if latest_close is None:
            logger.debug("Alert %d skipped — no price data yet.", alert.id)
            return
        if latest_close < threshold:
            await _trigger(
                alert,
                f"BTC price ${latest_close:,.2f} dropped below threshold ${threshold:,.2f}",
            )

    elif alert.condition_type == "liquidation_spike":
        window = alert.window_minutes or 5
        count = await _count_recent_liquidations(window)
        if count > threshold:
            await _trigger(
                alert,
                f"{count} liquidation events in the last {window} min (threshold: {threshold:.0f})",
            )

    else:
        logger.warning(
            "Alert %d has unknown condition_type '%s' — skipping.",
            alert.id,
            alert.condition_type,
        )
