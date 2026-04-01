"""
auth.py — Optional backend API key dependency (secondary defence layer).

Primary access control (Phase 13)
----------------------------------
The Caddy reverse proxy enforces HTTP Basic Authentication before any request
reaches the application. Set ``CADDY_USER`` and ``CADDY_HASHED_PASSWORD`` in
``.env`` — see ``caddy/Caddyfile`` and ``docs/deployment.md §7``.

This module (secondary / optional)
------------------------------------
``DASHBOARD_API_KEY`` adds a second check directly in FastAPI on all
``/api/*`` routes. It is **not required** when Caddy Basic Auth is the primary
gate, and is not used by the frontend. It can be useful for:

- Defence-in-depth (a second barrier if Caddy is misconfigured).
- Direct API access from trusted scripts or tools that bypass the browser.

Leave ``DASHBOARD_API_KEY`` empty (the default) to rely on Caddy auth alone.
When set, every request to ``/api/*`` must also supply::

    X-API-Key: <your key>

The ``/health`` endpoint is intentionally excluded from this check.
"""

import hmac
import logging

from fastapi import HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader

from app.config import settings

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(api_key: str | None = Security(_api_key_header)) -> None:
    """Validate the ``X-API-Key`` header against ``DASHBOARD_API_KEY``.

    - If ``DASHBOARD_API_KEY`` is empty (default), this is a no-op.
    - If set, a missing or incorrect key raises HTTP 401.
    - Comparison uses ``hmac.compare_digest`` to avoid timing side-channels.
    """
    expected = settings.dashboard_api_key.strip()
    if not expected:
        # Secondary layer disabled — Caddy Basic Auth is the primary gate.
        return
    if not api_key or not hmac.compare_digest(api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
