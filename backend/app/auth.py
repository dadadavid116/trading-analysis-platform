"""
auth.py — API key authentication dependency.

The dashboard API is protected by a static API key passed in the
``X-API-Key`` request header.

Configuration
-------------
DASHBOARD_API_KEY
    Set in .env. When non-empty, all ``/api/*`` requests must include::

        X-API-Key: <your key>

    If the header is missing or wrong the API responds with HTTP 401.

    When the value is empty (the default) authentication is **disabled**
    and a warning is logged at startup. This is the expected behaviour for
    local development. Always set a strong key before VPS deployment.

Usage
-----
The single exported dependency ``require_api_key`` is applied to every
``/api/*`` router in ``app/main.py``. The ``/health`` endpoint is
intentionally excluded so monitoring tools can reach it without a key.
"""

import logging

from fastapi import HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader

from app.config import settings

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(api_key: str | None = Security(_api_key_header)) -> None:
    """Validate the ``X-API-Key`` header against ``DASHBOARD_API_KEY``.

    - If ``DASHBOARD_API_KEY`` is empty (local dev default), this is a no-op.
    - If set, a missing or incorrect key raises HTTP 401.
    """
    expected = settings.dashboard_api_key.strip()
    if not expected:
        # Auth disabled — development mode; see startup warning in main.py.
        return
    if not api_key or api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )
