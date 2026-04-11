"""
main.py — FastAPI application entry point

This is the root of the API server.
Start the server with:
    uvicorn app.main:app --reload
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth import require_api_key
from app.config import settings
from app.database import engine, Base
# Import models so SQLAlchemy registers them with Base before create_all runs.
import app.models.price        # noqa: F401
import app.models.liquidation  # noqa: F401
import app.models.orderbook    # noqa: F401
import app.models.analysis     # noqa: F401
import app.models.alert        # noqa: F401
import app.models.chat         # noqa: F401
from app.routers import price, liquidations, orderbook, analysis, alerts, chat, strategy, chat_history

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create any tables that don't already exist.
    # In Docker this is a no-op because init_db.sql already created them.
    # Outside Docker (running uvicorn directly) this creates the tables automatically.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Schema migration: add trigger_mode to any alerts table that was created
        # before Phase 9. Safe to run on new tables too (PostgreSQL IF NOT EXISTS).
        await conn.execute(text(
            "ALTER TABLE IF EXISTS alerts "
            "ADD COLUMN IF NOT EXISTS trigger_mode VARCHAR(10) NOT NULL DEFAULT 'once'"
        ))
        # Schema migration: unique index on (symbol, timestamp) so the collector
        # can upsert live candle data on every tick instead of only on close.
        # IF NOT EXISTS makes this safe to run on every startup.
        await conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_price_candles_symbol_ts "
            "ON price_candles(symbol, timestamp)"
        ))

    # Log secondary API key status. Primary access control is Caddy Basic Auth.
    if settings.dashboard_api_key.strip():
        logger.info("Secondary API key layer ENABLED (X-API-Key required on /api/*).")
    else:
        logger.info(
            "DASHBOARD_API_KEY not set — secondary API key layer is inactive. "
            "Primary access control is Caddy Basic Auth (production only)."
        )

    yield

# ── Create the FastAPI application ────────────────────────────────────────────
app = FastAPI(
    title="Trading Analysis Platform API",
    description="Backend API for the crypto market monitoring dashboard.",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS middleware ───────────────────────────────────────────────────────────
# Allowed origins are read from CORS_ALLOWED_ORIGINS in .env (comma-separated).
# Defaults to localhost dev origins. For production, set the env var to your
# domain, e.g.:  CORS_ALLOWED_ORIGINS=https://yourdomain.com
#
# In production with Caddy, the browser sees a single origin (your domain) for
# both the frontend and /api/* requests, so CORS is not strictly required —
# but it is kept here so the API remains usable from other origins (e.g. tools,
# future Telegram integrations) without code changes.
#
# Note: allow_origins=["*"] cannot be combined with allow_credentials=True.
ALLOWED_ORIGINS = [
    o.strip()
    for o in settings.cors_allowed_origins.split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check endpoint ─────────────────────────────────────────────────────
# Intentionally unauthenticated — monitoring tools can use this without a key.
@app.get("/health", tags=["health"])
async def health_check():
    """
    Simple liveness check.
    Returns {"status": "ok"} when the server is running.
    """
    return {"status": "ok"}


# ── Routers ───────────────────────────────────────────────────────────────────
# All /api/* routes require a valid X-API-Key header when DASHBOARD_API_KEY is set.
_auth = [Depends(require_api_key)]

app.include_router(price.router,        prefix="/api", dependencies=_auth)
app.include_router(liquidations.router, prefix="/api", dependencies=_auth)
app.include_router(orderbook.router,    prefix="/api", dependencies=_auth)
app.include_router(analysis.router,     prefix="/api", dependencies=_auth)
app.include_router(alerts.router,       prefix="/api", dependencies=_auth)
app.include_router(chat.router,         prefix="/api", dependencies=_auth)
app.include_router(chat_history.router, prefix="/api", dependencies=_auth)
app.include_router(strategy.router,     prefix="/api", dependencies=_auth)
