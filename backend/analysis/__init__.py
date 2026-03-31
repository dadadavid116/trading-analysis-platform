"""
analysis — AI-assisted market analysis worker.

    claude_client.py — Reads market data from DB, calls Claude API, stores summary
    run.py           — Entry point: runs the analysis loop on a configurable schedule

Start via Docker Compose (analysis service) or directly:
    python -m analysis.run

Requires ANTHROPIC_API_KEY to be set in .env.
Interval is controlled by ANALYSIS_INTERVAL_MINUTES (default: 10 minutes).
"""
