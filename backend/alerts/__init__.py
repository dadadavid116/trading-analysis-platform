"""
alerts package — Phase 8

Evaluates alert conditions against live market data and fires notifications
when configured thresholds are crossed.

Files:
    evaluator.py   — Queries active alerts from the DB, checks price/liquidation
                     conditions, and marks triggered alerts.
    notifications.py — Sends notifications for triggered alerts (logging-only
                       for now; Telegram integration is a future extension).
    run.py         — Entry point: runs the evaluator loop on a configurable interval.

Alert types supported:
    price_above        — fires when the latest BTC close price exceeds the threshold
    price_below        — fires when the latest BTC close price falls below the threshold
    liquidation_spike  — fires when the liquidation count in the last window_minutes
                         exceeds the threshold

Alert state is stored in the `alerts` database table and managed via
/api/alerts/ endpoints.
"""
