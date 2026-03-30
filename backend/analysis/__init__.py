"""
analysis package — PLACEHOLDER

This package will contain the AI-assisted market analysis logic.

Planned files (Phase 6 — Analysis worker):
    claude_client.py — Calls the Claude API (Anthropic) with recent market
                       data and stores the generated summary in the database.

The analysis worker runs on a schedule (e.g. every 15 minutes) as a
separate Docker Compose service, not as part of the HTTP server.

Requires the ANTHROPIC_API_KEY environment variable to be set.

Nothing is implemented here yet.
"""
